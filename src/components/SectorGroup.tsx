import { useState } from 'react';
import { Card } from 'astrogators-shared-ui';
import { SystemCard, WaypointRow } from './SystemCard';
import type { Sector } from '../types';

interface SectorGroupProps {
  sector: Sector;
  onChange: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onEdit: () => void;
  isFirst: boolean;
  isLast: boolean;
  canModify: boolean;
}

// One Sector container - a named grouping within a Quadrant (e.g. "Start
// Here") holding the Systems (squads to build) and Waypoints (rewards) that
// belong together. Move/Edit/Delete live on this header, same pattern as
// Quadrant's own header - editing opens SectorEditorPanel for just this
// Sector, never the whole Quadrant (see App.tsx/Quadrant.tsx).
export function SectorGroup({ sector, onChange, onMoveUp, onMoveDown, onDelete, onEdit, isFirst, isLast, canModify }: SectorGroupProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function handleDeleteClick() {
    if (confirmingDelete) {
      onDelete();
    } else {
      setConfirmingDelete(true);
      setTimeout(() => setConfirmingDelete(false), 3000);
    }
  }

  return (
    <Card chamfered chamferSize="sm" padding="md" showDiagonalBorders edgeColor={sector.color || '#666'} className="sector-group">
      <div className="sector-group-header">
        <span className="quadrant-dot" style={{ background: sector.color || '#666' }} />
        <h3 className="sector-group-name">{sector.name}</h3>
        {canModify && (
          <div className="quadrant-move-controls">
            <button className="quadrant-move-btn" title="Move up" disabled={isFirst} onClick={onMoveUp}>↑</button>
            <button className="quadrant-move-btn" title="Move down" disabled={isLast} onClick={onMoveDown}>↓</button>
            <button className="quadrant-move-btn quadrant-edit-btn" title="Edit sector" onClick={onEdit}>Edit</button>
            <button
              className={`quadrant-move-btn quadrant-delete-btn ${confirmingDelete ? 'confirming' : ''}`}
              title="Delete sector"
              onClick={handleDeleteClick}
            >
              {confirmingDelete ? 'Confirm?' : '×'}
            </button>
          </div>
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
    </Card>
  );
}
