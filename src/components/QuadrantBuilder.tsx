import { useState } from 'react';
import { Button, Input } from 'astrogators-shared-ui';
import { api } from '../api';
import type { Quadrant } from '../types';

interface QuadrantBuilderProps {
  starChartId: number;
  nextOrderIndex?: number;
  onAdded?: () => void;
  editingQuadrant?: Quadrant | null;
  onEdited?: () => void;
  onCancelEdit?: () => void;
}

// Quadrant is just a name now - Sectors (which hold the actual farming
// content) are edited on their own via SectorEditorPanel, not resubmitted
// through here. See Quadrant.tsx for the +Add Sector / per-Sector Edit
// affordances this used to own.
export function QuadrantBuilder({ starChartId, nextOrderIndex, onAdded, editingQuadrant, onEdited, onCancelEdit }: QuadrantBuilderProps) {
  const isEditing = !!editingQuadrant;
  const [open, setOpen] = useState(isEditing);
  const [name, setName] = useState(() => editingQuadrant?.name || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      if (isEditing) {
        await api.renameQuadrant(starChartId, editingQuadrant!.id, name);
        onEdited?.();
      } else {
        await api.createQuadrant(starChartId, { name, order_index: nextOrderIndex ?? 0, sectors: [] });
        setOpen(false);
        setName('');
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
      <Input
        type="text"
        placeholder="Quadrant name (e.g. Episode 1)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        fullWidth
      />

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
