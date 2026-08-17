import { useState } from 'react';
import { Card, Badge, Select, Button, Input } from 'astrogators-shared-ui';
import { api, getShareUrl } from '../api';
import type { ChartVisibility, StarChartListItem, StarChartCreateIn } from '../types';

const VISIBILITY_VARIANT: Record<ChartVisibility, 'secondary' | 'primary' | 'info' | 'success'> = {
  private: 'secondary',
  guild: 'primary',
  shared: 'info',
  curated: 'success',
};

const VISIBILITY_LABEL: Record<ChartVisibility, string> = {
  private: 'Private',
  guild: 'Guild',
  shared: 'Shared',
  curated: 'Curated',
};

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
    <Card padding="sm" className="library-new-chart-form">
      <Input
        type="text"
        placeholder="Star Chart name (e.g. 2026 F2P Farming Guide)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        fullWidth
      />
      <Input
        type="text"
        placeholder="Source (optional)"
        value={source}
        onChange={(e) => setSource(e.target.value)}
        fullWidth
      />
      <div className="library-new-chart-form-actions">
        <Button variant="primary" size="sm" onClick={submit} disabled={saving || !name.trim()}>
          {saving ? 'Creating...' : 'Create'}
        </Button>
        <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>Cancel</Button>
      </div>
      {error && <p className="library-chart-card-error">{error}</p>}
    </Card>
  );
}

interface ChartCardProps {
  chart: StarChartListItem;
  isLoggedIn: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  isBookmarked: boolean;
  selectedAllyCode: string | null;
  onSwitch: (id: number) => void;
  onChanged: (deletedActiveChart?: boolean) => void | Promise<void>;
}

function ChartCard({ chart, isLoggedIn, isOwner, isAdmin, isBookmarked, selectedAllyCode, onSwitch, onChanged }: ChartCardProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const canDelete = isOwner || isAdmin;
  const canPublish = isAdmin && (chart.visibility === 'shared' || chart.visibility === 'guild');
  // Bookmarking is a per-user record (POST /bookmarks requires auth) - an
  // anonymous visitor isn't the owner of anything either, so `!isOwner`
  // alone was true for every card they looked at, showing a Bookmark button
  // that would just 401.
  const canBookmark = isLoggedIn && !isOwner;

  function handleDeleteClick() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      setTimeout(() => setConfirmingDelete(false), 3000);
      return;
    }
    setBusy(true);
    setError(null);
    api
      .deleteStarChart(chart.id)
      .then(() => onChanged(false))
      .catch((e) => setError((e as Error).message))
      .finally(() => setBusy(false));
  }

  async function handleVisibilityChange(visibility: ChartVisibility) {
    setBusy(true);
    setError(null);
    try {
      await api.setStarChartVisibility(chart.id, visibility, selectedAllyCode);
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handlePublish() {
    setBusy(true);
    setError(null);
    try {
      await api.publishStarChart(chart.id);
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleBookmarkToggle() {
    setBusy(true);
    setError(null);
    try {
      if (isBookmarked) {
        await api.deleteBookmark(chart.id);
      } else {
        await api.createBookmark(chart.id, selectedAllyCode);
      }
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function handleCopyLink() {
    navigator.clipboard.writeText(getShareUrl(chart.id)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <Card padding="sm" className="library-chart-card">
      <div className="library-chart-card-header">
        <span className="library-chart-card-name">{chart.name}</span>
        <Badge variant={VISIBILITY_VARIANT[chart.visibility]} size="sm">
          {VISIBILITY_LABEL[chart.visibility]}
        </Badge>
      </div>
      {chart.source && <p className="library-chart-card-source">{chart.source}</p>}

      <div className="library-chart-card-actions">
        <Button variant="outline" size="sm" onClick={() => onSwitch(chart.id)} disabled={busy}>
          Open
        </Button>

        {isOwner && (
          <Select
            value={chart.visibility}
            disabled={busy}
            onChange={(e) => handleVisibilityChange(e.target.value as ChartVisibility)}
            options={[
              { value: 'private', label: 'Private' },
              { value: 'guild', label: 'Guild', disabled: !selectedAllyCode },
              { value: 'shared', label: 'Shared' },
            ]}
          />
        )}

        {chart.visibility === 'shared' && (
          <Button variant="outline" size="sm" onClick={handleCopyLink} disabled={busy}>
            {copied ? 'Copied!' : 'Copy link'}
          </Button>
        )}

        {canBookmark && (
          <Button variant="outline" size="sm" onClick={handleBookmarkToggle} disabled={busy}>
            {isBookmarked ? 'Unbookmark' : 'Bookmark'}
          </Button>
        )}

        {canPublish && (
          <Button variant="outline" size="sm" onClick={handlePublish} disabled={busy}>
            Publish to Curated
          </Button>
        )}

        {canDelete && (
          <button
            className={`library-chart-delete-btn ${confirmingDelete ? 'confirming' : ''}`}
            onClick={handleDeleteClick}
            disabled={busy}
          >
            {confirmingDelete ? 'Confirm?' : 'Delete'}
          </button>
        )}
      </div>
      {error && <p className="library-chart-card-error">{error}</p>}
    </Card>
  );
}

interface StarChartLibraryProps {
  myCharts: StarChartListItem[];
  curatedCharts: StarChartListItem[];
  guildCharts: StarChartListItem[];
  bookmarkedCharts: StarChartListItem[];
  userId: number | null;
  isAdmin: boolean;
  selectedAllyCode: string | null;
  onSwitch: (id: number) => void;
  onChanged: (deletedActiveChart?: boolean) => void | Promise<void>;
  onCreated: (chart: StarChartListItem) => void;
}

interface SectionCommonProps {
  userId: number | null;
  isAdmin: boolean;
  selectedAllyCode: string | null;
  onSwitch: (id: number) => void;
  onChanged: (deletedActiveChart?: boolean) => void | Promise<void>;
  bookmarkedIds: Set<number>;
}

function Section({
  title, charts, userId, bookmarkedIds, ...rest
}: { title: string; charts: StarChartListItem[] } & SectionCommonProps) {
  if (charts.length === 0) return null;
  return (
    <section className="library-section">
      <h2>{title}</h2>
      <div className="library-grid">
        {charts.map((chart) => (
          <ChartCard
            key={chart.id}
            chart={chart}
            isLoggedIn={userId != null}
            isOwner={userId != null && chart.owner_user_id === userId}
            isBookmarked={bookmarkedIds.has(chart.id)}
            {...rest}
          />
        ))}
      </div>
    </section>
  );
}

export function StarChartLibrary({
  myCharts, curatedCharts, guildCharts, bookmarkedCharts,
  userId, isAdmin, selectedAllyCode, onSwitch, onChanged, onCreated,
}: StarChartLibraryProps) {
  const [creating, setCreating] = useState(false);
  const bookmarkedIds = new Set(bookmarkedCharts.map((c) => c.id));
  const sectionProps = { userId, isAdmin, selectedAllyCode, onSwitch, onChanged, bookmarkedIds };

  const noCharts =
    myCharts.length === 0 && curatedCharts.length === 0 && guildCharts.length === 0 && bookmarkedCharts.length === 0;

  function handleCreated(chart: StarChartListItem) {
    setCreating(false);
    onCreated(chart);
  }

  return (
    <div className="star-chart-library">
      {userId != null && (
        <div className="library-toolbar">
          {creating ? (
            <NewStarChartForm onCreated={handleCreated} onCancel={() => setCreating(false)} />
          ) : (
            <Button variant="primary" size="sm" onClick={() => setCreating(true)}>+ New Star Chart</Button>
          )}
        </div>
      )}
      {noCharts && <p className="library-empty">No star charts to show yet.</p>}
      <Section title="Curated" charts={curatedCharts} {...sectionProps} />
      <Section title="Mine" charts={myCharts} {...sectionProps} />
      <Section title="Guild" charts={guildCharts} {...sectionProps} />
      <Section title="Bookmarked" charts={bookmarkedCharts} {...sectionProps} />
    </div>
  );
}
