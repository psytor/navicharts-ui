import { useEffect, useState } from 'react';
import { api } from '../api';
import { UnitPortrait } from './Badge';
import type { Squad, SquadMember, SquadMemberIn, Unit } from '../types';

const SQUAD_PURPOSES = [
  'Squad Arena', 'Fleet Arena', 'Territory War', 'Territory Battle',
  'Grand Arena Championship', 'Galactic Legend Event', 'Raid', 'Conquest',
];

interface SquadTypeConfig {
  label: string;
  specialLabel: string;
  memberLabel: string;
  memberCount: number;
  unitType: string;
  badge: string;
}

// Character and ship squads have different fixed shapes: a character squad
// is 1 Leader + 4 Members, a ship squad is 1 Capital Ship + 7 Ships - not an
// open-ended list either way. Each type also only draws from its half of the
// unit pool (Unit.unit_type "character"/"ship").
const SQUAD_TYPE_CONFIG: Record<string, SquadTypeConfig> = {
  character: { label: 'Character Squad', specialLabel: 'Leader', memberLabel: 'Member', memberCount: 4, unitType: 'character', badge: 'L' },
  ship: { label: 'Ship Squad', specialLabel: 'Capital Ship', memberLabel: 'Ship', memberCount: 7, unitType: 'ship', badge: 'C' },
};

interface Slots {
  special: Unit | null;
  members: (Unit | null)[];
}

function emptySlots(squadType: string): Slots {
  return { special: null, members: Array(SQUAD_TYPE_CONFIG[squadType].memberCount).fill(null) };
}

function squadToSlots(squad: Squad): Slots {
  const cfg = SQUAD_TYPE_CONFIG[squad.squad_type];
  const specialMember = squad.members.find((m) => m.is_leader);
  const others = squad.members.filter((m) => !m.is_leader);
  const members: (Unit | null)[] = Array(cfg.memberCount).fill(null);
  others.slice(0, cfg.memberCount).forEach((m, i) => {
    members[i] = m.unit;
  });
  return { special: specialMember ? specialMember.unit : null, members };
}

interface SquadSlotProps {
  label: string;
  unit: Unit | null;
  isSpecial?: boolean;
  onDrop: (e: React.DragEvent) => void;
  onClear: () => void;
}

function SquadSlot({ label, unit, isSpecial, onDrop, onClear }: SquadSlotProps) {
  return (
    <div
      className={`squad-slot${isSpecial ? ' squad-slot-special' : ''}${unit ? ' squad-slot-filled' : ''}`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <span className="squad-slot-label">{label}</span>
      {unit ? (
        <div className="unit-card">
          <UnitPortrait unit={unit} />
          <span className="unit-card-name">{unit.name}</span>
          <button type="button" className="squad-slot-clear" title="Remove" onClick={onClear}>×</button>
        </div>
      ) : (
        <div className="squad-slot-placeholder">Drag unit here</div>
      )}
    </div>
  );
}

interface SquadFormProps {
  squad?: Squad | null;
  squadType?: string;
  pool: Unit[];
  onSaved: () => void;
  onCancel: () => void;
}

function SquadForm({ squad, squadType, pool, onSaved, onCancel }: SquadFormProps) {
  const isEditing = !!squad;
  const type = squad ? squad.squad_type : squadType!;
  const cfg = SQUAD_TYPE_CONFIG[type];
  const [name, setName] = useState(() => squad?.name || '');
  const [purpose, setPurpose] = useState(() => squad?.purpose || SQUAD_PURPOSES[0]);
  const [notes, setNotes] = useState(() => squad?.notes || '');
  const [slots, setSlots] = useState<Slots>(() => (squad ? squadToSlots(squad) : emptySlots(type)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const typePool = pool.filter((u) => u.unit_type === cfg.unitType);
  // A unit already occupying one of THIS squad's own slots drops out of the
  // drag source below (it's in use here) - but stays draggable into any
  // OTHER squad's form, since the same character legitimately sits on
  // multiple real teams (e.g. an arena squad and a TW squad).
  const assignedIds = new Set([slots.special?.id, ...slots.members.map((m) => m?.id)].filter(Boolean));
  const availablePool = typePool.filter((u) => !assignedIds.has(u.id));

  function unitFromDrop(e: React.DragEvent): Unit | null {
    const unitId = e.dataTransfer.getData('text/plain');
    return typePool.find((u) => u.id === unitId) || null;
  }
  function handleDropSpecial(e: React.DragEvent) {
    e.preventDefault();
    const unit = unitFromDrop(e);
    if (unit) setSlots((s) => ({ ...s, special: unit }));
  }
  function handleDropMember(index: number, e: React.DragEvent) {
    e.preventDefault();
    const unit = unitFromDrop(e);
    if (unit)
      setSlots((s) => {
        const members = [...s.members];
        members[index] = unit;
        return { ...s, members };
      });
  }
  function clearSpecial() {
    setSlots((s) => ({ ...s, special: null }));
  }
  function clearMember(index: number) {
    setSlots((s) => {
      const members = [...s.members];
      members[index] = null;
      return { ...s, members };
    });
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const toMemberIn = (u: Unit, is_leader: boolean): SquadMemberIn => ({
        unit_id: u.id,
        is_leader,
      });
      const members: SquadMemberIn[] = [
        ...(slots.special ? [toMemberIn(slots.special, true)] : []),
        ...slots.members.filter((u): u is Unit => !!u).map((u) => toMemberIn(u, false)),
      ];
      const payload = { name, squad_type: type, purpose, notes: notes || null, members };
      if (isEditing) {
        await api.updateSquad(squad!.id, payload);
      } else {
        await api.createSquad(payload);
      }
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="add-quadrant-panel squad-form">
      {isEditing && <div className="quadrant-builder-edit-label">Editing {cfg.label.toLowerCase()}</div>}
      <div className="quadrant-builder-header">
        <input
          type="text"
          placeholder={`Squad name (e.g. ${type === 'ship' ? 'Home Fleet' : 'Imperial Troopers'})`}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select value={purpose} onChange={(e) => setPurpose(e.target.value)}>
          {SQUAD_PURPOSES.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      <div className="squad-slots">
        <SquadSlot
          label={cfg.specialLabel}
          unit={slots.special}
          isSpecial
          onDrop={handleDropSpecial}
          onClear={clearSpecial}
        />
        {slots.members.map((u, i) => (
          <SquadSlot
            key={i}
            label={`${cfg.memberLabel} ${i + 1}`}
            unit={u}
            onDrop={(e) => handleDropMember(i, e)}
            onClear={() => clearMember(i)}
          />
        ))}
      </div>

      <div className="location-header squad-pool-header">Drag from pool</div>
      <div className="location-card-grid">
        {availablePool.map((u) => (
          <div
            key={u.id}
            className="unit-card squad-pool-card"
            draggable
            onDragStart={(e) => e.dataTransfer.setData('text/plain', u.id)}
          >
            <UnitPortrait unit={u} />
            <span className="unit-card-name">{u.name}</span>
          </div>
        ))}
      </div>

      <textarea
        placeholder="Notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
      />

      {error && <p className="add-quadrant-error">{error}</p>}

      <div className="add-quadrant-actions">
        <button onClick={submit} disabled={saving || !name.trim()}>
          {saving ? 'Saving...' : isEditing ? 'Save changes' : 'Save squad'}
        </button>
        <button onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </div>
  );
}

interface SquadCardProps {
  squad: Squad;
  onEdit?: () => void;
  onDelete?: () => void;
}

// onEdit/onDelete are omitted entirely in read-only contexts (see SquadList
// below) - the actions row only renders when at least one is provided,
// rather than every caller having to pass no-op handlers.
function SquadCard({ squad, onEdit, onDelete }: SquadCardProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const cfg = SQUAD_TYPE_CONFIG[squad.squad_type];

  function handleDeleteClick() {
    if (confirmingDelete) {
      onDelete?.();
    } else {
      setConfirmingDelete(true);
      setTimeout(() => setConfirmingDelete(false), 3000);
    }
  }

  const sortedMembers = [...squad.members].sort((a, b) => (b.is_leader ? 1 : 0) - (a.is_leader ? 1 : 0));

  return (
    <div className="squad-card">
      <div className="squad-card-header">
        <span className="squad-card-name">{squad.name}</span>
        <span className="squad-purpose-badge">{squad.purpose}</span>
        {(onEdit || onDelete) && (
          <div className="squad-card-actions">
            {onEdit && (
              <button className="squadcard-action-btn squadcard-edit-btn" title="Edit squad" onClick={onEdit}>
                Edit
              </button>
            )}
            {onDelete && (
              <button
                className={`squadcard-action-btn squadcard-delete-btn ${confirmingDelete ? 'confirming' : ''}`}
                title="Delete squad"
                onClick={handleDeleteClick}
              >
                {confirmingDelete ? 'Confirm?' : '×'}
              </button>
            )}
          </div>
        )}
      </div>
      {squad.notes && <p className="squad-card-notes">{squad.notes}</p>}
      <div className="location-card-grid">
        {sortedMembers.map((m: SquadMember) => (
          <div key={m.id} className={`unit-card${m.is_leader ? ' squad-member-special' : ''}`}>
            <UnitPortrait unit={m.unit} />
            {m.is_leader && (
              <span className="squad-special-badge" title={cfg.specialLabel}>{cfg.badge}</span>
            )}
            <span className="unit-card-name">{m.unit.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Read-only display for the Visualise tab - shows what the Plan tab's
// SquadBuilder has produced, no create/edit/delete affordances and no unit
// pool (that's only useful while actively building, see SquadBuilder).
export function SquadList() {
  const [squads, setSquads] = useState<Squad[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getMySquads().then(setSquads).catch((e) => setError(e.message));
  }, []);

  return (
    <aside className="squad-loadout-panel bracket-panel" style={{ '--bracket-color': 'var(--cyan)' } as React.CSSProperties}>
      <div className="location-header">Squads</div>
      {error && <p className="add-quadrant-error">{error}</p>}
      {squads.length === 0 && !error && (
        <p className="squad-empty-hint">No squads yet - build some in the Plan tab.</p>
      )}
      {Object.entries(SQUAD_TYPE_CONFIG).map(([type, cfg]) => {
        const typeSquads = squads.filter((sq) => sq.squad_type === type);
        if (typeSquads.length === 0) return null;
        return (
          <div className="squad-type-group" key={type}>
            <div className="squad-type-header">{cfg.label}s</div>
            <div className="squad-list">
              {typeSquads.map((sq) => (
                <SquadCard key={sq.id} squad={sq} />
              ))}
            </div>
          </div>
        );
      })}
    </aside>
  );
}

// Full builder for the Plan tab - sits at the end of the quadrant list, since
// squads are assembled from whatever units the plan above has you farming.
export function SquadBuilder() {
  const [squads, setSquads] = useState<Squad[]>([]);
  const [pool, setPool] = useState<Unit[]>([]);
  const [editingSquadId, setEditingSquadId] = useState<number | null>(null);
  const [creatingType, setCreatingType] = useState<string | null>(null); // null | "character" | "ship"
  const [error, setError] = useState<string | null>(null);

  function loadSquads() {
    api.getMySquads().then(setSquads).catch((e) => setError(e.message));
  }

  useEffect(() => {
    loadSquads();
    api.getRequiredUnits().then(setPool).catch((e) => setError(e.message));
  }, []);

  function handleSaved() {
    setEditingSquadId(null);
    setCreatingType(null);
    loadSquads();
  }

  async function handleDelete(squadId: number) {
    await api.deleteSquad(squadId);
    loadSquads();
  }

  return (
    <section className="squad-builder-section">
      <div className="location-header">Squads</div>

      {error && <p className="add-quadrant-error">{error}</p>}

      {Object.entries(SQUAD_TYPE_CONFIG).map(([type, cfg]) => (
        <div className="squad-type-group" key={type}>
          <div className="squad-type-header">{cfg.label}s</div>

          <div className="squad-list">
            {squads
              .filter((sq) => sq.squad_type === type)
              .map((sq) =>
                editingSquadId === sq.id ? (
                  <SquadForm
                    key={sq.id}
                    squad={sq}
                    pool={pool}
                    onSaved={handleSaved}
                    onCancel={() => setEditingSquadId(null)}
                  />
                ) : (
                  <SquadCard
                    key={sq.id}
                    squad={sq}
                    onEdit={() => setEditingSquadId(sq.id)}
                    onDelete={() => handleDelete(sq.id)}
                  />
                )
              )}
          </div>

          {creatingType === type ? (
            <SquadForm squadType={type} pool={pool} onSaved={handleSaved} onCancel={() => setCreatingType(null)} />
          ) : (
            <button className="add-quadrant-toggle" onClick={() => setCreatingType(type)}>
              + New {cfg.label}
            </button>
          )}
        </div>
      ))}
    </section>
  );
}
