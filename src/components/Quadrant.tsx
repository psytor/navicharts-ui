import { useState } from 'react';
import { SectorCard, RewardRow } from './SectorCard';
import type { Quadrant as QuadrantType } from '../types';

interface QuadrantProps {
  quadrant: QuadrantType;
  onChange: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onEdit: () => void;
  isFirst: boolean;
  isLast: boolean;
  // Curated charts are admin-only to edit server-side - hides every write
  // affordance (move/edit/delete quadrant, sector notes, reward checkboxes)
  // for a non-admin viewer instead of letting the click 404.
  canModify: boolean;
}

export function Quadrant({ quadrant, onChange, onMoveUp, onMoveDown, onDelete, onEdit, isFirst, isLast, canModify }: QuadrantProps) {
  const [open, setOpen] = useState(true);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const total = quadrant.sectors.length;
  const done = quadrant.sectors.filter((s) => s.status).length;
  const rewards = quadrant.sectors.flatMap((s) => s.rewards);

  function handleDeleteClick() {
    if (confirmingDelete) {
      onDelete();
    } else {
      setConfirmingDelete(true);
      setTimeout(() => setConfirmingDelete(false), 3000);
    }
  }

  return (
    <section
      className="quadrant bracket-panel"
      style={{ borderColor: quadrant.color || '#666', '--bracket-color': quadrant.color || '#666' } as React.CSSProperties}
    >
      <div className="quadrant-header">
        <button className="quadrant-header-toggle" onClick={() => setOpen(!open)}>
          <span className="quadrant-index">{String(quadrant.order_index + 1).padStart(2, '0')}</span>
          <span className="quadrant-dot" style={{ background: quadrant.color || '#666' }} />
          <span className="quadrant-name">{quadrant.name}</span>
          <span className="quadrant-progress">{done} / {total}</span>
          <span className="quadrant-toggle">{open ? '−' : '+'}</span>
        </button>
        {canModify && (
          <div className="quadrant-move-controls">
            <button
              className="quadrant-move-btn"
              title="Move up"
              disabled={isFirst}
              onClick={onMoveUp}
            >
              ↑
            </button>
            <button
              className="quadrant-move-btn"
              title="Move down"
              disabled={isLast}
              onClick={onMoveDown}
            >
              ↓
            </button>
            <button className="quadrant-move-btn quadrant-edit-btn" title="Edit quadrant" onClick={onEdit}>
              Edit
            </button>
            <button
              className={`quadrant-move-btn quadrant-delete-btn ${confirmingDelete ? 'confirming' : ''}`}
              title="Delete quadrant"
              onClick={handleDeleteClick}
            >
              {confirmingDelete ? 'Confirm?' : '×'}
            </button>
          </div>
        )}
      </div>
      {open && (
        <div className="quadrant-sectors">
          {quadrant.sectors.map((sector) => (
            <SectorCard key={sector.id} sector={sector} onChange={onChange} canModify={canModify} />
          ))}
        </div>
      )}
      {open && rewards.length > 0 && (
        <div className="quadrant-rewards">
          <div className="quadrant-rewards-label">Rewards</div>
          {rewards.map((r) => (
            <RewardRow key={r.id} reward={r} onChange={onChange} canModify={canModify} />
          ))}
        </div>
      )}
    </section>
  );
}
