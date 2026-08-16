import { Button, Input, Select } from 'astrogators-shared-ui';
import type { Unit, GameEvent, Quadrant } from '../types';
import { SystemEditor } from './SystemEditor';
import { WaypointEditor } from './WaypointEditor';
import {
  SECTOR_COLORS, emptySystem, emptyWaypoint,
  type DraftSector, type DraftSystem, type DraftWaypoint, type FlatSystemEntry, type FlatWaypointEntry,
} from './quadrantBuilderShared';

interface SectorEditorProps {
  sector: DraftSector;
  allSystems: FlatSystemEntry[];
  allWaypoints: FlatWaypointEntry[];
  otherQuadrants: Quadrant[];
  units: Unit[];
  events: GameEvent[];
  onChange: (sector: DraftSector) => void;
}

// One Sector's own editor - name/color/notes, its Systems (squads to build),
// and its Waypoints (rewards). A System's "Feeds into"/"Unlocks" pickers
// (see SystemEditor) can reach systems/waypoints outside this Sector too
// (sibling Sectors in the same Quadrant, or other Quadrants) via
// otherQuadrants - see SectorEditorPanel, which builds allSystems/
// allWaypoints/otherQuadrants scoped to just this Sector's editing session.
// Standalone now (SectorEditorPanel owns fetch/save/cancel) - move/remove
// live on the read-only SectorGroup card instead, same as Quadrant's own
// move/delete controls living on its card, not inside QuadrantBuilder.
export function SectorEditor({ sector, allSystems, allWaypoints, otherQuadrants, units, events, onChange }: SectorEditorProps) {
  function updateSystem(i: number, patch: DraftSystem) {
    const systems = sector.systems.map((s, idx) => (idx === i ? patch : s));
    onChange({ ...sector, systems });
  }
  function removeSystem(i: number) {
    // stale references (other systems' downstream_keys/unlock_keys, in
    // this sector or any other) are cleaned up one level up, in
    // QuadrantBuilder's updateSector - it's the only place with visibility
    // across every sector in the quadrant.
    onChange({ ...sector, systems: sector.systems.filter((_, idx) => idx !== i) });
  }
  function moveSystem(i: number, direction: number) {
    const target = i + direction;
    if (target < 0 || target >= sector.systems.length) return;
    const next = [...sector.systems];
    [next[i], next[target]] = [next[target], next[i]];
    onChange({ ...sector, systems: next });
  }

  function updateWaypoint(i: number, patch: DraftWaypoint) {
    const waypoints = sector.waypoints.map((w, idx) => (idx === i ? patch : w));
    onChange({ ...sector, waypoints });
  }
  function removeWaypoint(i: number) {
    // see removeSystem above - stale unlock_keys referencing this waypoint
    // are cleaned up in QuadrantBuilder's updateSector.
    onChange({ ...sector, waypoints: sector.waypoints.filter((_, idx) => idx !== i) });
  }

  return (
    <div className="sector-editor sector-editor-container">
      <div className="quadrant-builder-header">
        <Input
          type="text"
          placeholder="Sector name (e.g. Start Here)"
          value={sector.name}
          onChange={(e) => onChange({ ...sector, name: e.target.value })}
          className="quadrant-builder-header-input"
        />
        <Select value={sector.color} onChange={(e) => onChange({ ...sector, color: e.target.value })}>
          {SECTOR_COLORS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </Select>
      </div>
      <textarea
        placeholder="Sector notes (optional)"
        value={sector.notes}
        onChange={(e) => onChange({ ...sector, notes: e.target.value })}
        rows={2}
      />

      {sector.systems.map((system, i) => (
        <SystemEditor
          key={system._key}
          system={system}
          allSystems={allSystems}
          allWaypoints={allWaypoints}
          otherQuadrants={otherQuadrants}
          units={units}
          onChange={(patch) => updateSystem(i, patch)}
          onRemove={() => removeSystem(i)}
          onMove={(dir) => moveSystem(i, dir)}
          isFirst={i === 0}
          isLast={i === sector.systems.length - 1}
        />
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="sector-add-btn"
        onClick={() => onChange({ ...sector, systems: [...sector.systems, emptySystem()] })}
      >
        + Add system
      </Button>

      <div className="unlocks-editor">
        <span className="unlocks-label">Waypoints:</span>
        {sector.waypoints.map((waypoint, i) => (
          <WaypointEditor
            key={waypoint._key}
            waypoint={waypoint}
            events={events}
            units={units}
            onChange={(patch) => updateWaypoint(i, patch)}
            onRemove={() => removeWaypoint(i)}
          />
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="sector-add-btn"
          onClick={() => onChange({ ...sector, waypoints: [...sector.waypoints, emptyWaypoint()] })}
        >
          + Add waypoint
        </Button>
      </div>
    </div>
  );
}
