import { useEffect, useState } from 'react';
import { Button, Input } from 'astrogators-shared-ui';
import { api } from '../api';
import { SectorEditor } from './SectorEditor';
import {
  SECTOR_COLORS, emptySector, flattenSystems, flattenWaypoints,
  type DraftSector,
} from './quadrantBuilderShared';
import type { Unit, GameEvent, Quadrant, QuadrantIn, SectorIn, SystemIn, WaypointIn, UnitRequirementIn } from '../types';

function quadrantToFormState(quadrant: Quadrant): { name: string; sectors: DraftSector[] } {
  const systemIds = new Set(quadrant.sectors.flatMap((sec) => sec.systems.map((s) => s.id)));
  const waypointIds = new Set(quadrant.sectors.flatMap((sec) => sec.waypoints.map((w) => w.id)));

  return {
    name: quadrant.name,
    sectors: quadrant.sectors.map((sector) => ({
      // an already-saved row's own backend id doubles as its stable `_key` -
      // it's already unique and, unlike array position, unaffected by
      // reordering/moving.
      _key: sector.id,
      name: sector.name,
      color: sector.color || SECTOR_COLORS[0],
      notes: sector.notes || '',
      systems: sector.systems.map((s) => ({
        _key: s.id,
        notes: s.notes || '',
        name: s.name || '',
        usable_for: s.usable_for || '',
        requirements: s.requirements.map((r) => ({
          unit: r.unit,
          gear_tier: r.gear_tier != null ? String(r.gear_tier) : '',
          relic_tier: r.relic_tier != null ? String(r.relic_tier) : '',
          target_stars: r.target_stars != null ? String(r.target_stars) : '',
          energy_type: r.energy_type ?? '',
          currency_types: r.currency_types || [],
          // null must stay null ("Any") here - `|| []` would wrongly collapse
          // it into "explicitly none"
          energy_locations: r.energy_locations ?? null,
          lst_tiers: r.lst_tiers || [],
          omicron_ability_ids: r.omicron_ability_ids || [],
        })),
        // same-quadrant targets keep the target's real id, which is also
        // that row's `_key` in this form; cross-quadrant targets (rows in
        // another quadrant) keep their absolute id in the separate field
        unlock_keys: s.unlocks.filter((w) => waypointIds.has(w.id)).map((w) => w.id),
        unlock_waypoint_ids: s.unlocks.filter((w) => !waypointIds.has(w.id)).map((w) => w.id),
        downstream_keys: s.enables.filter((e) => systemIds.has(e.id)).map((e) => e.id),
        downstream_system_ids: s.enables.filter((e) => !systemIds.has(e.id)).map((e) => e.id),
      })),
      waypoints: sector.waypoints.map((w) => ({
        _key: w.id, name: w.name, waypoint_type: w.waypoint_type, unit: w.unit || null, event: w.event || null,
      })),
    })),
  };
}

interface QuadrantBuilderProps {
  starChartId: number;
  nextOrderIndex?: number;
  onAdded?: () => void;
  editingQuadrant?: Quadrant | null;
  onEdited?: () => void;
  onCancelEdit?: () => void;
  allQuadrants: Quadrant[];
}

export function QuadrantBuilder({ starChartId, nextOrderIndex, onAdded, editingQuadrant, onEdited, onCancelEdit, allQuadrants }: QuadrantBuilderProps) {
  const isEditing = !!editingQuadrant;
  const otherQuadrants = (allQuadrants || []).filter((q) => !editingQuadrant || q.id !== editingQuadrant.id);
  const [open, setOpen] = useState(isEditing);
  const [units, setUnits] = useState<Unit[]>([]);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [name, setName] = useState(() => editingQuadrant?.name || '');
  const [sectors, setSectors] = useState<DraftSector[]>(() =>
    editingQuadrant ? quadrantToFormState(editingQuadrant).sectors : [emptySector()]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && units.length === 0) {
      api.getUnitCatalog().then(setUnits).catch((e) => setError(e.message));
    }
  }, [open, units.length]);

  useEffect(() => {
    if (open && events.length === 0) {
      api.getEvents('assault_battle').then(setEvents).catch((e) => setError(e.message));
    }
  }, [open, events.length]);

  function updateSector(i: number, patch: DraftSector) {
    // A single System or Waypoint removed inside SectorEditor/SystemEditor
    // (as opposed to the whole sector, see removeSector below) can leave
    // OTHER systems - in this sector or any other - with a stale
    // unlock_keys/downstream_keys reference. This is the only place with
    // visibility across every sector, so the cleanup happens here rather
    // than inside the child editors.
    const oldSector = sectors[i];
    const removedSystemKeys = new Set(
      oldSector.systems.map((s) => s._key).filter((k) => !patch.systems.some((s) => s._key === k))
    );
    const removedWaypointKeys = new Set(
      oldSector.waypoints.map((w) => w._key).filter((k) => !patch.waypoints.some((w) => w._key === k))
    );
    if (removedSystemKeys.size === 0 && removedWaypointKeys.size === 0) {
      setSectors(sectors.map((s, idx) => (idx === i ? patch : s)));
      return;
    }
    setSectors(
      sectors.map((s, idx) => {
        const sector = idx === i ? patch : s;
        return {
          ...sector,
          systems: sector.systems.map((sy) => ({
            ...sy,
            unlock_keys: sy.unlock_keys.filter((k) => !removedWaypointKeys.has(k)),
            downstream_keys: sy.downstream_keys.filter((k) => !removedSystemKeys.has(k)),
          })),
        };
      })
    );
  }
  function removeSector(i: number) {
    const removedSystemKeys = new Set(sectors[i].systems.map((s) => s._key));
    const removedWaypointKeys = new Set(sectors[i].waypoints.map((w) => w._key));
    setSectors(
      sectors
        .filter((_, idx) => idx !== i)
        .map((sector) => ({
          ...sector,
          systems: sector.systems.map((s) => ({
            ...s,
            unlock_keys: s.unlock_keys.filter((k) => !removedWaypointKeys.has(k)),
            downstream_keys: s.downstream_keys.filter((k) => !removedSystemKeys.has(k)),
          })),
        }))
    );
  }
  function moveSector(i: number, direction: number) {
    const target = i + direction;
    if (target < 0 || target >= sectors.length) return;
    const next = [...sectors];
    [next[i], next[target]] = [next[target], next[i]];
    setSectors(next);
  }

  const allSystems = flattenSystems(sectors);
  const allWaypoints = flattenWaypoints(sectors);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const payload: QuadrantIn = {
        name,
        order_index: isEditing ? editingQuadrant!.order_index : (nextOrderIndex ?? 0),
        sectors: sectors.map((sector, sectorIdx): SectorIn => ({
          id: typeof sector._key === 'number' ? sector._key : null,
          name: sector.name,
          color: sector.color,
          order_index: sectorIdx,
          notes: sector.notes || null,
          systems: sector.systems.map((s): SystemIn => ({
            id: typeof s._key === 'number' ? s._key : null,
            order_index: 0,
            notes: s.notes || null,
            name: s.name || null,
            usable_for: s.usable_for || null,
            requirements: s.requirements
              .filter((r) => r.unit)
              .map((r): UnitRequirementIn => ({
                unit_id: r.unit!.id,
                gear_tier: r.gear_tier ? Number(r.gear_tier) : null,
                relic_tier: r.relic_tier ? Number(r.relic_tier) : null,
                target_stars: r.target_stars ? Number(r.target_stars) : null,
                energy_type: r.energy_type || null,
                currency_types: r.currency_types || [],
                // null ("Any") must round-trip as null, not collapse to []
                energy_locations: r.energy_locations ?? null,
                lst_tiers: r.lst_tiers || [],
                omicron_ability_ids: r.omicron_ability_ids || [],
              })),
            // resolved fresh from stable keys against the CURRENT flattened
            // order, not carried along as stale positions - see `_key` above
            unlock_waypoint_indices: s.unlock_keys
              .map((key) => allWaypoints.findIndex((w) => w.waypoint._key === key))
              .filter((idx) => idx !== -1),
            unlock_waypoint_ids: s.unlock_waypoint_ids,
            downstream_indices: s.downstream_keys
              .map((key) => allSystems.findIndex((sy) => sy.system._key === key))
              .filter((idx) => idx !== -1),
            downstream_system_ids: s.downstream_system_ids,
          })),
          waypoints: sector.waypoints
            .filter((w) => w.name.trim())
            .map((w): WaypointIn => ({
              id: typeof w._key === 'number' ? w._key : null,
              name: w.name,
              waypoint_type: w.waypoint_type,
              unit_id: w.unit?.id ?? null,
              event_id: w.event?.id ?? null,
            })),
        })),
      };
      if (isEditing) {
        await api.updateQuadrant(starChartId, editingQuadrant!.id, payload);
        onEdited?.();
      } else {
        await api.createQuadrant(starChartId, payload);
        setOpen(false);
        setName('');
        setSectors([emptySector()]);
        onAdded?.();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!isEditing && !open) {
    return (
      <Button variant="outline" fullWidth className="add-quadrant-toggle" onClick={() => setOpen(true)}>
        + Add quadrant
      </Button>
    );
  }

  return (
    <div className="add-quadrant-panel">
      {isEditing && <div className="quadrant-builder-edit-label">Editing quadrant</div>}
      <div className="quadrant-builder-header">
        <Input
          type="text"
          placeholder="Quadrant name (e.g. Episode 1)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          fullWidth
        />
      </div>

      {sectors.map((sector, i) => (
        <SectorEditor
          key={sector._key}
          sector={sector}
          sectorIndex={i}
          allSystems={allSystems}
          allWaypoints={allWaypoints}
          otherQuadrants={otherQuadrants}
          units={units}
          events={events}
          onChange={(patch) => updateSector(i, patch)}
          onRemove={() => removeSector(i)}
          onMove={(dir) => moveSector(i, dir)}
          isFirst={i === 0}
          isLast={i === sectors.length - 1}
        />
      ))}

      <div className="add-sector-buttons">
        <Button type="button" variant="outline" size="sm" onClick={() => setSectors([...sectors, emptySector()])}>+ Add sector</Button>
      </div>

      {error && <p className="add-quadrant-error">{error}</p>}

      <div className="add-quadrant-actions">
        <Button variant="primary" onClick={submit} disabled={saving || !name.trim()}>
          {saving ? 'Saving...' : isEditing ? 'Save changes' : 'Add quadrant'}
        </Button>
        <Button
          variant="outline"
          onClick={() => (isEditing ? onCancelEdit?.() : setOpen(false))}
          disabled={saving}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
