import type { Unit, GameEvent, Quadrant } from '../types';
import { SystemEditor } from './SystemEditor';
import { WaypointEditor } from './WaypointEditor';
import {
  SECTOR_COLORS, emptySystem, emptyWaypoint,
  type DraftSector, type DraftSystem, type DraftWaypoint, type FlatSystemEntry, type FlatWaypointEntry,
} from './quadrantBuilderShared';

interface SectorEditorProps {
  sector: DraftSector;
  sectorIndex: number;
  allSystems: FlatSystemEntry[];
  allWaypoints: FlatWaypointEntry[];
  otherQuadrants: Quadrant[];
  units: Unit[];
  events: GameEvent[];
  onChange: (sector: DraftSector) => void;
  onRemove: () => void;
  onMove: (direction: number) => void;
  isFirst: boolean;
  isLast: boolean;
}

// One Sector container's editor - name/notes, its Systems (squads to build),
// and its Waypoints (rewards). A System's "Requires"/"Unlocks" pickers
// (see SystemEditor) reach across every Sector in the quadrant, not just
// this one, since a System's targets aren't necessarily in its own Sector.
export function SectorEditor({ sector, sectorIndex, allSystems, allWaypoints, otherQuadrants, units, events, onChange, onRemove, onMove, isFirst, isLast }: SectorEditorProps) {
  function updateSystem(i: number, patch: DraftSystem) {
    const systems = sector.systems.map((s, idx) => (idx === i ? patch : s));
    onChange({ ...sector, systems });
  }
  function removeSystem(i: number) {
    // stale references (other systems' prerequisite_keys/unlock_keys, in
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
      <div className="sector-editor-header">
        <span className="sector-editor-title">Sector {sectorIndex + 1}</span>
        <div className="sector-editor-controls">
          <button type="button" onClick={() => onMove(-1)} disabled={isFirst}>↑</button>
          <button type="button" onClick={() => onMove(1)} disabled={isLast}>↓</button>
          <button type="button" onClick={onRemove}>Remove sector</button>
        </div>
      </div>

      <div className="quadrant-builder-header">
        <input
          type="text"
          placeholder="Sector name (e.g. Start Here)"
          value={sector.name}
          onChange={(e) => onChange({ ...sector, name: e.target.value })}
        />
        <select value={sector.color} onChange={(e) => onChange({ ...sector, color: e.target.value })}>
          {SECTOR_COLORS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
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
      <button
        type="button"
        className="sector-add-btn"
        onClick={() => onChange({ ...sector, systems: [...sector.systems, emptySystem()] })}
      >
        + Add system
      </button>

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
        <button
          type="button"
          className="sector-add-btn"
          onClick={() => onChange({ ...sector, waypoints: [...sector.waypoints, emptyWaypoint()] })}
        >
          + Add waypoint
        </button>
      </div>
    </div>
  );
}
