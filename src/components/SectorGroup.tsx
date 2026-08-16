import { useState } from 'react';
import { SystemCard, WaypointRow } from './SystemCard';
import { api } from '../api';
import type { Sector } from '../types';

interface SectorGroupProps {
  sector: Sector;
  onChange: () => void;
  canModify: boolean;
}

// One Sector container - a named grouping within a Quadrant (e.g. "Start
// Here") holding the Systems (squads to build) and Waypoints (rewards) that
// belong together. Waypoints render here, scoped to their owning Sector,
// rather than flattened across the whole Quadrant the way Rewards used to be.
export function SectorGroup({ sector, onChange, canModify }: SectorGroupProps) {
  const [name, setName] = useState(sector.name);
  const [editingName, setEditingName] = useState(false);
  const [saving, setSaving] = useState(false);

  async function saveName() {
    setSaving(true);
    try {
      await api.updateSector(sector.id, { name });
      setEditingName(false);
      onChange();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="sector-group" style={{ borderLeftColor: sector.color || '#666' }}>
      <div className="sector-group-header">
        <span className="quadrant-dot" style={{ background: sector.color || '#666' }} />
        {editingName ? (
          <div className="notes-edit">
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            <div className="notes-actions">
              <button onClick={saveName} disabled={saving || !name.trim()}>Save</button>
              <button onClick={() => { setName(sector.name); setEditingName(false); }} disabled={saving}>Cancel</button>
            </div>
          </div>
        ) : (
          <h3
            className="sector-group-name"
            onClick={canModify ? () => setEditingName(true) : undefined}
            title={canModify ? 'Click to rename' : undefined}
          >
            {sector.name}
          </h3>
        )}
      </div>
      {sector.notes && <p className="sector-group-notes">{sector.notes}</p>}

      <div className="sector-group-systems">
        {sector.systems.map((system) => (
          <SystemCard key={system.id} system={system} onChange={onChange} canModify={canModify} />
        ))}
      </div>

      {sector.waypoints.length > 0 && (
        <div className="quadrant-rewards">
          <div className="quadrant-rewards-label">Waypoints</div>
          {sector.waypoints.map((w) => (
            <WaypointRow key={w.id} waypoint={w} />
          ))}
        </div>
      )}
    </div>
  );
}
