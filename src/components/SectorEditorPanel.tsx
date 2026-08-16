import { useEffect, useState } from 'react';
import { Button } from 'astrogators-shared-ui';
import { api } from '../api';
import { SectorEditor } from './SectorEditor';
import type { OtherSectorGroup } from './SystemEditor';
import {
  emptySector, sectorToFormState, flattenSystems, flattenWaypoints,
} from './quadrantBuilderShared';
import type { Sector, Quadrant, Unit, GameEvent, SectorIn, SystemIn, WaypointIn, UnitRequirementIn } from '../types';

interface SectorEditorPanelProps {
  starChartId: number;
  quadrantId: number;
  editingSector?: Sector | null;
  nextOrderIndex?: number;
  allQuadrants: Quadrant[];
  onSaved: () => void;
  onCancel: () => void;
}

// Standalone save/cancel host for ONE Sector's editor - the thing that makes
// a Sector directly editable without opening its whole Quadrant. Mirrors
// QuadrantBuilder's shape (fetch catalog, hold draft state, submit), just
// scoped one level down: a Sector's own PUT/POST instead of the Quadrant's
// whole-tree one.
export function SectorEditorPanel({ starChartId, quadrantId, editingSector, nextOrderIndex, allQuadrants, onSaved, onCancel }: SectorEditorPanelProps) {
  const isEditing = !!editingSector;
  const [units, setUnits] = useState<Unit[]>([]);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [sector, setSector] = useState(() =>
    editingSector ? sectorToFormState(editingSector) : emptySector()
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getUnitCatalog().then(setUnits).catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    api.getEvents('assault_battle').then(setEvents).catch((e) => setError(e.message));
  }, []);

  const allSystems = flattenSystems([sector]);
  const allWaypoints = flattenWaypoints([sector]);

  // Everything outside THIS sector is reached via absolute id, grouped by
  // Sector - one expandable group per Sector, not per Quadrant. Editing
  // scope is a Sector now, so the local/remote picker boundary is the
  // Sector boundary (matches the old project's Quadrant-scoped picker one
  // level down) - grouping by Quadrant here would bundle sibling Sectors
  // together and hide which one a target actually belongs to. A sibling
  // in the SAME Quadrant is labeled with just its own name; a Sector in a
  // DIFFERENT Quadrant gets the Quadrant name appended for context.
  const otherGroups: OtherSectorGroup[] = allQuadrants.flatMap((q) =>
    q.sectors
      .filter((s) => s.id !== editingSector?.id)
      .map((s) => ({
        id: s.id,
        label: q.id === quadrantId ? s.name : `${s.name} (${q.name})`,
        systems: s.systems,
        waypoints: s.waypoints,
      }))
  );

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const payload: SectorIn = {
        id: isEditing ? editingSector!.id : null,
        name: sector.name,
        color: sector.color,
        order_index: isEditing ? editingSector!.order_index : (nextOrderIndex ?? 0),
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
      };
      if (isEditing) {
        await api.updateSectorContents(editingSector!.id, payload);
      } else {
        await api.createSector(starChartId, quadrantId, payload);
      }
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="add-quadrant-panel">
      {isEditing && <div className="quadrant-builder-edit-label">Editing sector</div>}
      <SectorEditor
        sector={sector}
        allSystems={allSystems}
        allWaypoints={allWaypoints}
        otherGroups={otherGroups}
        units={units}
        events={events}
        onChange={setSector}
      />

      {error && <p className="add-quadrant-error">{error}</p>}

      <div className="add-quadrant-actions">
        <Button variant="primary" onClick={submit} disabled={saving || !sector.name.trim()}>
          {saving ? 'Saving...' : isEditing ? 'Save changes' : 'Add sector'}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
      </div>
    </div>
  );
}
