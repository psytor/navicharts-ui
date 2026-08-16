import { UnitPicker } from './UnitPicker';
import { EventPicker } from './EventPicker';
import type { Unit, GameEvent } from '../types';
import { WAYPOINT_TYPES, UNIT_LINKED_WAYPOINT_TYPES, EVENT_LINKED_WAYPOINT_TYPES, type DraftWaypoint } from './quadrantBuilderShared';

interface WaypointEditorProps {
  waypoint: DraftWaypoint;
  units: Unit[];
  events: GameEvent[];
  onChange: (waypoint: DraftWaypoint) => void;
  onRemove: () => void;
}

export function WaypointEditor({ waypoint, units, events, onChange, onRemove }: WaypointEditorProps) {
  return (
    <div className="reward-editor">
      {UNIT_LINKED_WAYPOINT_TYPES.has(waypoint.waypoint_type) ? (
        <UnitPicker
          units={units}
          value={waypoint.unit}
          onChange={(unit) => onChange({ ...waypoint, unit, name: unit?.name || '' })}
        />
      ) : EVENT_LINKED_WAYPOINT_TYPES.has(waypoint.waypoint_type) ? (
        <EventPicker
          events={events}
          value={waypoint.event}
          onChange={(event) => onChange({ ...waypoint, event, name: event?.name || '' })}
        />
      ) : (
        <input
          type="text"
          placeholder="Waypoint name (e.g. Forest Moon)"
          value={waypoint.name}
          onChange={(e) => onChange({ ...waypoint, name: e.target.value })}
        />
      )}
      <select
        value={waypoint.waypoint_type}
        onChange={(e) => onChange({ ...waypoint, name: '', waypoint_type: e.target.value, unit: null, event: null })}
      >
        {WAYPOINT_TYPES.map((t) => (
          <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
        ))}
      </select>
      <button type="button" className="req-remove" onClick={onRemove}>×</button>
    </div>
  );
}
