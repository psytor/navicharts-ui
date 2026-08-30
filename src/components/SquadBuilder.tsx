import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Input, Select, useAuth } from 'astrogators-shared-ui';
import { api } from '../api';
import { UnitPortrait, OmicronCornerBadge } from './Badge';
import type { Squad, SquadMember, SquadMemberIn, StarChart, Unit } from '../types';

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

interface UnitDragCardProps {
  unit: Unit;
}

// The draggable source card shared by both the default required-units pool
// and the full-catalog search results below it - same look, same drag
// payload (the unit id), just a different source array feeding it.
function UnitDragCard({ unit }: UnitDragCardProps) {
  return (
    <div
      className="unit-card squad-pool-card chamfered-box-sm"
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/plain', unit.id)}
    >
      <UnitPortrait unit={unit} />
      <span className="unit-card-name">{unit.name}</span>
    </div>
  );
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
        <>
          {/* Sibling of the Card, not a child - the clear button overhangs
              the top-right corner (top:-6px/right:-6px) and would otherwise
              get sliced off by the chamfer's clip-path. .squad-slot (the
              parent) is already position:relative. */}
          <Card chamfered chamferSize="sm" padding="sm" className="unit-card">
            <UnitPortrait unit={unit} />
            <span className="unit-card-name">{unit.name}</span>
          </Card>
          <button type="button" className="squad-slot-clear" title="Remove" onClick={onClear}>×</button>
        </>
      ) : (
        <div className="squad-slot-placeholder">Drag unit here</div>
      )}
    </div>
  );
}

interface SquadFormProps {
  squad?: Squad | null;
  squadType?: string;
  quadrantId: number;
  pool: Unit[];
  catalog: Unit[];
  onSaved: () => void;
  onCancel: () => void;
}

function SquadForm({ squad, squadType, quadrantId, pool, catalog, onSaved, onCancel }: SquadFormProps) {
  const isEditing = !!squad;
  const type = squad ? squad.squad_type : squadType!;
  const cfg = SQUAD_TYPE_CONFIG[type];
  const [name, setName] = useState(() => squad?.name || '');
  const [purpose, setPurpose] = useState(() => squad?.purpose || SQUAD_PURPOSES[0]);
  const [notes, setNotes] = useState(() => squad?.notes || '');
  const [slots, setSlots] = useState<Slots>(() => (squad ? squadToSlots(squad) : emptySlots(type)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const typePool = pool.filter((u) => u.unit_type === cfg.unitType);
  const typeCatalog = catalog.filter((u) => u.unit_type === cfg.unitType);
  // A unit already occupying one of THIS squad's own slots drops out of both
  // drag sources below (it's in use here) - but stays draggable into any
  // OTHER squad's form, since the same character legitimately sits on
  // multiple real teams (e.g. an arena squad and a TW squad).
  const assignedIds = new Set([slots.special?.id, ...slots.members.map((m) => m?.id)].filter(Boolean));
  const availablePool = typePool.filter((u) => !assignedIds.has(u.id));
  // Only searched, not listed wholesale - the full catalog is hundreds of
  // units, so it stays hidden until you actually type a name, rather than
  // burying the (usually much shorter, actually-relevant) required pool.
  const trimmedSearch = search.trim().toLowerCase();
  const searchResults = trimmedSearch
    ? typeCatalog.filter((u) => !assignedIds.has(u.id) && u.name.toLowerCase().includes(trimmedSearch))
    : [];

  function unitFromDrop(e: React.DragEvent): Unit | null {
    const unitId = e.dataTransfer.getData('text/plain');
    return typePool.find((u) => u.id === unitId) || typeCatalog.find((u) => u.id === unitId) || null;
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
      const payload = { quadrant_id: quadrantId, name, squad_type: type, purpose, notes: notes || null, members };
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
        <Input
          type="text"
          placeholder={`Squad name (e.g. ${type === 'ship' ? 'Home Fleet' : 'Imperial Troopers'})`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="quadrant-builder-header-input"
        />
        <Select value={purpose} onChange={(e) => setPurpose(e.target.value)}>
          {SQUAD_PURPOSES.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </Select>
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
          <UnitDragCard key={u.id} unit={u} />
        ))}
      </div>

      <div className="location-header squad-pool-header">Search all characters</div>
      <Input
        type="text"
        placeholder={`Search for any ${cfg.unitType} by name...`}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {trimmedSearch && (
        <div className="location-card-grid squad-search-results">
          {searchResults.map((u) => (
            <UnitDragCard key={u.id} unit={u} />
          ))}
          {searchResults.length === 0 && <p className="squad-empty-hint">No matches.</p>}
        </div>
      )}

      <textarea
        placeholder="Notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
      />

      {error && <p className="add-quadrant-error">{error}</p>}

      <div className="add-quadrant-actions">
        <Button variant="primary" onClick={submit} disabled={saving || !name.trim()}>
          {saving ? 'Saving...' : isEditing ? 'Save changes' : 'Save squad'}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
      </div>
    </div>
  );
}

interface SquadCardProps {
  squad: Squad;
  onEdit?: () => void;
  onDelete?: () => void;
  // Only ever passed by SquadList (Visualise) - the Plan tab's SquadBuilder
  // renders SquadCard too but deliberately leaves this unset, so the tag
  // only ever shows in Visualise.
  omicronUnitIds?: Set<string>;
}

// onEdit/onDelete are omitted entirely in read-only contexts (see SquadList
// below) - the actions row only renders when at least one is provided,
// rather than every caller having to pass no-op handlers.
function SquadCard({ squad, onEdit, onDelete, omicronUnitIds }: SquadCardProps) {
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
    <Card chamfered chamferSize="sm" showDiagonalBorders edgeColor="var(--cyan)" padding="sm" className="squad-card">
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
          <div key={m.id} className="unit-card-slot">
            {m.is_leader && (
              <span className="squad-special-badge" title={cfg.specialLabel}>{cfg.badge}</span>
            )}
            <Card
              chamfered
              chamferSize="sm"
              padding="sm"
              className={`unit-card${m.is_leader ? ' squad-member-special' : ''}`}
            >
              <div className="unit-card-portrait-wrap">
                <UnitPortrait unit={m.unit} />
                <OmicronCornerBadge needsOmicron={omicronUnitIds?.has(m.unit.id) ?? false} />
              </div>
              <span className="unit-card-name">{m.unit.name}</span>
            </Card>
          </div>
        ))}
      </div>
    </Card>
  );
}

// Read-only display for the Visualise tab - shows what each Quadrant's own
// SquadBuilder has produced, no create/edit/delete affordances and no unit
// pool (that's only useful while actively building, see SquadBuilder).
// Fetches every squad across the whole chart once; when no Quadrant filter
// is active, squads are grouped under a heading per Quadrant so it's clear
// which ones each Quadrant's units actually unlock - matching the flow
// graph's own per-Quadrant grouping.
export function SquadList({ starChart, quadrantId }: { starChart: StarChart; quadrantId?: number | null }) {
  const { isAuthenticated } = useAuth();
  const [squads, setSquads] = useState<Squad[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // GET /squads/mine requires a logged-in user (squads are always
    // per-owner, there's no "curated"/read-only-without-login case like
    // star charts) - skip the call entirely rather than let an
    // unauthenticated request surface the backend's raw 401 text.
    if (!isAuthenticated) return;
    api.getMySquads({ starChartId: starChart.id }).then(setSquads).catch((e) => setError(e.message));
  }, [isAuthenticated, starChart.id]);

  // A specific Quadrant filter narrows to just that one; otherwise every
  // Quadrant in the chart gets its own group below.
  const quadrantGroups = quadrantId != null
    ? starChart.quadrants.filter((q) => q.id === quadrantId)
    : starChart.quadrants;

  // Chart-wide, not scoped to the filtered Quadrant - a character can need
  // Omicron material for a later Quadrant's content, and the whole point of
  // the tag is to not let that get forgotten while it's still early to plan
  // for. Same requirement tree the flow graph already reads omicron off of
  // (see RequirementPortrait), just re-keyed by unit id here.
  const omicronUnitIds = useMemo(() => {
    const ids = new Set<string>();
    for (const quadrant of starChart.quadrants) {
      for (const sector of quadrant.sectors) {
        for (const system of sector.systems) {
          for (const req of system.requirements) {
            if (req.omicron_ability_ids && req.omicron_ability_ids.length > 0) {
              ids.add(req.unit.id);
            }
          }
        }
      }
    }
    return ids;
  }, [starChart]);

  return (
    <Card chamfered chamferSize="md" showDiagonalBorders edgeColor="var(--cyan)" className="squad-loadout-panel">
      <div className="location-header">Squads</div>
      {!isAuthenticated ? (
        <p className="squad-empty-hint">Log in to see your squads.</p>
      ) : (
        <>
          {error && <p className="add-quadrant-error">{error}</p>}
          {squads.length === 0 && !error && (
            <p className="squad-empty-hint">No squads yet - build some in the Plan tab.</p>
          )}
        </>
      )}
      {quadrantGroups.map((quadrant) => {
        const quadrantSquads = squads.filter((sq) => sq.quadrant_id === quadrant.id);
        if (quadrantSquads.length === 0) return null;
        return (
          <div className="squad-quadrant-group" key={quadrant.id}>
            {quadrantId == null && <div className="squad-quadrant-header">{quadrant.name}</div>}
            {Object.entries(SQUAD_TYPE_CONFIG).map(([type, cfg]) => {
              const typeSquads = quadrantSquads.filter((sq) => sq.squad_type === type);
              if (typeSquads.length === 0) return null;
              return (
                <div className="squad-type-group" key={type}>
                  <div className="squad-type-header">{cfg.label}s</div>
                  <div className="squad-list">
                    {typeSquads.map((sq) => (
                      <SquadCard key={sq.id} squad={sq} omicronUnitIds={omicronUnitIds} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </Card>
  );
}

// Full builder living inside a Quadrant card in the Plan tab (see
// Quadrant.tsx) - squads here are examples of what's actually buildable
// once this Quadrant's units are unlocked, not a chart-wide roster. The
// unit pool itself stays chart-wide (getRequiredUnits, unscoped) since a
// squad can legitimately reuse a character unlocked in an earlier Quadrant.
export function SquadBuilder({ quadrantId }: { quadrantId: number }) {
  const { isAuthenticated } = useAuth();
  const [squads, setSquads] = useState<Squad[]>([]);
  const [pool, setPool] = useState<Unit[]>([]);
  const [catalog, setCatalog] = useState<Unit[]>([]);
  const [editingSquadId, setEditingSquadId] = useState<number | null>(null);
  const [creatingType, setCreatingType] = useState<string | null>(null); // null | "character" | "ship"
  const [error, setError] = useState<string | null>(null);

  function loadSquads() {
    api.getMySquads({ quadrantId }).then(setSquads).catch((e) => setError(e.message));
  }

  useEffect(() => {
    // Squads (list, create, edit) are always per-owner - nothing here is
    // reachable without a token, so skip both fetches entirely rather than
    // let the backend's raw 401 text surface as the "error" state.
    if (!isAuthenticated) return;
    loadSquads();
    api.getRequiredUnits().then(setPool).catch((e) => setError(e.message));
    // Full game catalog, separate from the required-units pool above - only
    // surfaced through the form's search box, so a squad can still include
    // a character your farming plan doesn't itself require.
    api.getUnitCatalog().then(setCatalog).catch((e) => setError(e.message));
  }, [isAuthenticated, quadrantId]);

  function handleSaved() {
    setEditingSquadId(null);
    setCreatingType(null);
    loadSquads();
  }

  async function handleDelete(squadId: number) {
    await api.deleteSquad(squadId);
    loadSquads();
  }

  if (!isAuthenticated) {
    return (
      <Card chamfered chamferSize="md" showDiagonalBorders edgeColor="var(--cyan)" className="squad-builder-section">
        <div className="location-header">Squads</div>
        <p className="squad-empty-hint">Log in to build squads.</p>
      </Card>
    );
  }

  return (
    <Card chamfered chamferSize="md" showDiagonalBorders edgeColor="var(--cyan)" className="squad-builder-section">
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
                    quadrantId={quadrantId}
                    pool={pool}
                    catalog={catalog}
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
            <SquadForm squadType={type} quadrantId={quadrantId} pool={pool} catalog={catalog} onSaved={handleSaved} onCancel={() => setCreatingType(null)} />
          ) : (
            <Button variant="outline" fullWidth className="add-quadrant-toggle" onClick={() => setCreatingType(type)}>
              + New {cfg.label}
            </Button>
          )}
        </div>
      ))}
    </Card>
  );
}
