import { useState } from 'react';
import { Button, Select } from 'astrogators-shared-ui';
import { Link } from 'react-router-dom';
import type { StarChartListItem } from '../types';

export interface ChartSelectorProps {
  myCharts: StarChartListItem[];
  guildCharts: StarChartListItem[];
  curatedCharts: StarChartListItem[];
  bookmarkedCharts: StarChartListItem[];
  isLoading: boolean;
  onView: (chartId: number) => void;
}

/**
 * Overview's "pick a star chart, then load it" control — same shape as
 * mod-ledger-ui's EvaluationSelector: one Select with an <optgroup> per
 * source (My/Guild/Official/Bookmarked Star Charts, matching NavBar's Star
 * Charts group items exactly), a "View" button (Evaluate's equivalent —
 * picking only sets the selection, this is what actually loads it), and a
 * "Manage" link to the library. Moderation/All Shared isn't offered here,
 * same reasoning EvaluationSelector has no Moderation optgroup: this is a
 * quick "jump into a chart" picker, not a management view.
 */
export function ChartSelector({
  myCharts,
  guildCharts,
  curatedCharts,
  bookmarkedCharts,
  isLoading,
  onView,
}: ChartSelectorProps) {
  const [selectedId, setSelectedId] = useState('');

  if (isLoading) {
    return (
      <div className="chart-selector">
        <span>Loading your star charts…</span>
      </div>
    );
  }

  const hasAny =
    myCharts.length > 0 || guildCharts.length > 0 || curatedCharts.length > 0 || bookmarkedCharts.length > 0;

  if (!hasAny) {
    return (
      <div className="chart-selector">
        <span>No star charts to show yet.</span>
        <Link to="/starcharts">
          <Button variant="primary" size="sm">Create one</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="chart-selector">
      <span>Star Chart:</span>
      <Select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
        <option value="">— None —</option>
        {myCharts.length > 0 && (
          <optgroup label="My Star Charts">
            {myCharts.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </optgroup>
        )}
        {guildCharts.length > 0 && (
          <optgroup label="Guild Star Charts">
            {guildCharts.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </optgroup>
        )}
        {curatedCharts.length > 0 && (
          <optgroup label="Official Star Charts">
            {curatedCharts.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </optgroup>
        )}
        {bookmarkedCharts.length > 0 && (
          <optgroup label="Bookmarked Star Charts">
            {bookmarkedCharts.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </optgroup>
        )}
      </Select>
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
