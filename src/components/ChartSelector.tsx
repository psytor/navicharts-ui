import { useState } from 'react';
import { Button, Select, type SelectOption } from 'astrogators-shared-ui';
import { Link } from 'react-router-dom';
import type { StarChartListItem } from '../types';

export interface ChartSelectorProps {
  charts: StarChartListItem[];
  isLoading: boolean;
  onView: (chartId: number) => void;
}

/**
 * Overview's "pick a star chart, then load it" control — same two-step
 * shape as mod-ledger-ui's EvaluationSelector (pick from a dropdown, click
 * a button to act on the pick), not a live-navigate-on-select dropdown.
 * Only lists "My Star Charts" for now, unlike EvaluationSelector's two
 * optgroups (Mine/Protocols) — Overview could grow Guild/Official/
 * Bookmarked groups the same way later if that turns out to be wanted.
 */
export function ChartSelector({ charts, isLoading, onView }: ChartSelectorProps) {
  const [selectedId, setSelectedId] = useState('');

  if (isLoading) {
    return (
      <div className="chart-selector">
        <span>Loading your star charts…</span>
      </div>
    );
  }

  if (charts.length === 0) {
    return (
      <div className="chart-selector">
        <span>You don&apos;t have any star charts yet.</span>
        <Link to="/starcharts">
          <Button variant="primary" size="sm">Create one</Button>
        </Link>
      </div>
    );
  }

  const options: SelectOption[] = charts.map((c) => ({ value: String(c.id), label: c.name }));

  return (
    <div className="chart-selector">
      <span>Star Chart:</span>
      <Select
        options={options}
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
        placeholder="Choose a star chart…"
      />
      <Button
        variant="primary"
        size="sm"
        disabled={!selectedId}
        onClick={() => selectedId && onView(Number(selectedId))}
      >
        View
      </Button>
      <Link to="/starcharts" className="chart-selector-manage-link">
        Manage →
      </Link>
    </div>
  );
}
