import { useState } from 'react';
import { api } from '../api';
import type { StarChartListItem, StarChartCreateIn } from '../types';

interface NewStarChartFormProps {
  onCreated: (chart: StarChartListItem) => void;
  onCancel: () => void;
}

function NewStarChartForm({ onCreated, onCancel }: NewStarChartFormProps) {
  const [name, setName] = useState('');
  const [source, setSource] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const payload: StarChartCreateIn = { name, source: source || null };
      const created = await api.createStarChart(payload);
      onCreated(created);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="new-episode-form">
      <input
        type="text"
        placeholder="Star Chart name (e.g. 2026 F2P Farming Guide)"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        type="text"
        placeholder="Source (optional)"
        value={source}
        onChange={(e) => setSource(e.target.value)}
      />
      <button onClick={submit} disabled={saving || !name.trim()}>
        {saving ? 'Creating...' : 'Create'}
      </button>
      <button onClick={onCancel} disabled={saving}>Cancel</button>
      {error && <p className="add-quadrant-error">{error}</p>}
    </div>
  );
}

interface StarChartPickerProps {
  myCharts: StarChartListItem[];
  curatedCharts: StarChartListItem[];
  activeStarChartId: number | null;
  onSwitch: (id: number) => void;
  onCreated: (chart: StarChartListItem) => void;
}

// The real StarChart switcher/creator - separate from the top Quadrant
// ("Episode") strip in App.tsx, which used to wrongly do this job. Star
// Charts are the private/shared/curated-level container; Quadrants are the
// Episodes inside ONE chart, and have their own creation entry point.
export function StarChartPicker({ myCharts, curatedCharts, activeStarChartId, onSwitch, onCreated }: StarChartPickerProps) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const active = [...myCharts, ...curatedCharts].find((c) => c.id === activeStarChartId);

  function handleCreated(chart: StarChartListItem) {
    setCreating(false);
    setOpen(false);
    onCreated(chart);
  }

  return (
    <div className="star-chart-picker">
      <button className="star-chart-picker-toggle" onClick={() => setOpen(!open)}>
        Star Charts: {active?.name ?? '...'} ▾
      </button>
      {open && (
        <div className="star-chart-picker-panel bracket-panel">
          {myCharts.length > 0 && (
            <>
              <div className="star-chart-picker-group-label">Mine</div>
              {myCharts.map((c) => (
                <button
                  key={c.id}
                  className={`star-chart-picker-option ${c.id === activeStarChartId ? 'active' : ''}`}
                  onClick={() => { onSwitch(c.id); setOpen(false); }}
                >
                  {c.name} <span className="star-chart-picker-visibility">({c.visibility})</span>
                </button>
              ))}
            </>
          )}
          {curatedCharts.length > 0 && (
            <>
              <div className="star-chart-picker-group-label">Curated</div>
              {curatedCharts.map((c) => (
                <button
                  key={c.id}
                  className={`star-chart-picker-option ${c.id === activeStarChartId ? 'active' : ''}`}
                  onClick={() => { onSwitch(c.id); setOpen(false); }}
                >
                  {c.name}
                </button>
              ))}
            </>
          )}
          {creating ? (
            <NewStarChartForm onCreated={handleCreated} onCancel={() => setCreating(false)} />
          ) : (
            <button className="star-chart-picker-new" onClick={() => setCreating(true)}>+ New Star Chart</button>
          )}
        </div>
      )}
    </div>
  );
}
