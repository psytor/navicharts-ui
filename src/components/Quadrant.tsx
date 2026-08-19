import { useState } from 'react';
import { Card, Button } from 'astrogators-shared-ui';
import { api } from '../api';
import { SectorGroup } from './SectorGroup';
import { SectorEditorPanel } from './SectorEditorPanel';
import { SquadBuilder } from './SquadBuilder';
import type { Quadrant as QuadrantType } from '../types';

interface QuadrantProps {
  quadrant: QuadrantType;
  starChartId: number;
  allQuadrants: QuadrantType[];
  onChange: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onEdit: () => void;
  isFirst: boolean;
  isLast: boolean;
  // Curated charts are admin-only to edit server-side - hides every write
  // affordance (move/edit/delete quadrant, sector/system notes, sector
  // rename) for a non-admin viewer instead of letting the click 404.
  canModify: boolean;
}

export function Quadrant({ quadrant, starChartId, allQuadrants, onChange, onMoveUp, onMoveDown, onDelete, onEdit, isFirst, isLast, canModify }: QuadrantProps) {
  const [open, setOpen] = useState(true);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editingSectorId, setEditingSectorId] = useState<number | null>(null);
  const [addingSector, setAddingSector] = useState(false);

  const systems = quadrant.sectors.flatMap((s) => s.systems);
  const total = systems.length;
  const done = systems.filter((s) => s.status).length;

  function handleDeleteClick() {
    if (confirmingDelete) {
      onDelete();
    } else {
      setConfirmingDelete(true);
      setTimeout(() => setConfirmingDelete(false), 3000);
    }
  }

  async function moveSector(sectorId: number, direction: number) {
    const ids = quadrant.sectors.map((s) => s.id);
    const index = ids.indexOf(sectorId);
    const swapWith = index + direction;
    if (swapWith < 0 || swapWith >= ids.length) return;
    [ids[index], ids[swapWith]] = [ids[swapWith], ids[index]];
    await api.reorderSectors(starChartId, quadrant.id, ids);
    onChange();
  }

  async function deleteSector(sectorId: number) {
    await api.deleteSector(sectorId);
    onChange();
  }

  function finishEditingSector() {
    setEditingSectorId(null);
    setAddingSector(false);
    onChange();
  }

  return (
    <Card chamfered chamferSize="lg" showDiagonalBorders diagonalBorderColor="var(--amber)" padding="none" className="quadrant">
      <div className="quadrant-header">
        <button className="quadrant-header-toggle" onClick={() => setOpen(!open)}>
          <span className="quadrant-index">{String(quadrant.order_index + 1).padStart(2, '0')}</span>
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
            <button className="quadrant-move-btn quadrant-edit-btn" title="Rename quadrant" onClick={onEdit}>
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
          {quadrant.sectors.map((sector, idx) =>
            editingSectorId === sector.id ? (
              <SectorEditorPanel
                key={sector.id}
                starChartId={starChartId}
                quadrantId={quadrant.id}
                editingSector={sector}
                allQuadrants={allQuadrants}
                onSaved={finishEditingSector}
                onCancel={() => setEditingSectorId(null)}
              />
            ) : (
              <SectorGroup
                key={sector.id}
                sector={sector}
                onChange={onChange}
                onMoveUp={() => moveSector(sector.id, -1)}
                onMoveDown={() => moveSector(sector.id, 1)}
                onDelete={() => deleteSector(sector.id)}
                onEdit={() => setEditingSectorId(sector.id)}
                isFirst={idx === 0}
                isLast={idx === quadrant.sectors.length - 1}
                canModify={canModify}
              />
            )
          )}
          {addingSector && (
            <SectorEditorPanel
              starChartId={starChartId}
              quadrantId={quadrant.id}
              nextOrderIndex={quadrant.sectors.length}
              allQuadrants={allQuadrants}
              onSaved={finishEditingSector}
              onCancel={() => setAddingSector(false)}
            />
          )}
          {canModify && !addingSector && (
            <Button type="button" variant="outline" size="sm" className="add-quadrant-toggle" onClick={() => setAddingSector(true)}>
              + Add sector
            </Button>
          )}
          <SquadBuilder quadrantId={quadrant.id} />
        </div>
      )}
    </Card>
  );
}
