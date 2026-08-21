import { useEffect, useState } from 'react';
import { Card, Badge, Select, Button, Input, fetchUsernames } from 'astrogators-shared-ui';
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
  isMod: boolean;
  isBookmarked: boolean;
  ownerUsername: string | undefined;
  selectedAllyCode: string | null;
  onSwitch: (id: number) => void;
  onChanged: (deletedActiveChart?: boolean) => void | Promise<void>;
}

function ChartCard({ chart, isLoggedIn, isOwner, isAdmin, isMod, isBookmarked, ownerUsername, selectedAllyCode, onSwitch, onChanged }: ChartCardProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const canCurate = isAdmin || isMod;
  // Mirrors the backend's three-tier _can_delete exactly: admin gets any
  // chart, mod gets curated-only (that IS how a mod un-publishes
  // something), everyone else is owner-only. Do NOT collapse this to
  // `isOwner || isAdmin || isMod` - that would silently grant mods delete
  // on charts the backend correctly refuses them, and the button would
  // just 403 on click.
  const canDelete = isOwner || isAdmin || (isMod && chart.visibility === 'curated');
  const canPublish = canCurate && (chart.visibility === 'shared' || chart.visibility === 'guild');
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
      {!isOwner && ownerUsername && (
        <p className="library-chart-card-owner">by {ownerUsername}</p>
      )}

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
  allSharedCharts: StarChartListItem[];
  userId: number | null;
  isAdmin: boolean;
  isMod: boolean;
  selectedAllyCode: string | null;
  onSwitch: (id: number) => void;
  onChanged: (deletedActiveChart?: boolean) => void | Promise<void>;
  onCreated: (chart: StarChartListItem) => void;
}

interface SectionCommonProps {
  userId: number | null;
  isAdmin: boolean;
  isMod: boolean;
  usernames: Record<number, string>;
  selectedAllyCode: string | null;
  onSwitch: (id: number) => void;
  onChanged: (deletedActiveChart?: boolean) => void | Promise<void>;
  bookmarkedIds: Set<number>;
}

function Section({
  title, charts, userId, bookmarkedIds, usernames, ...rest
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
            ownerUsername={chart.owner_user_id != null ? usernames[chart.owner_user_id] : undefined}
            {...rest}
          />
        ))}
      </div>
    </section>
  );
}

export function StarChartLibrary({
  myCharts, curatedCharts, guildCharts, bookmarkedCharts, allSharedCharts,
  userId, isAdmin, isMod, selectedAllyCode, onSwitch, onChanged, onCreated,
}: StarChartLibraryProps) {
  const [creating, setCreating] = useState(false);
  const [usernames, setUsernames] = useState<Record<number, string>>({});
  const bookmarkedIds = new Set(bookmarkedCharts.map((c) => c.id));
  const canCurate = isAdmin || isMod;
  const sectionProps = { userId, isAdmin, isMod, usernames, selectedAllyCode, onSwitch, onChanged, bookmarkedIds };

  const noCharts =
    myCharts.length === 0 && curatedCharts.length === 0 && guildCharts.length === 0 && bookmarkedCharts.length === 0;

  // Batch-resolve every rendered chart's owner to a username in one call,
  // rather than one lookup per card. Most useful in "All Shared", where the
  // author isn't otherwise knowable at all.
  useEffect(() => {
    const allCharts = [...myCharts, ...curatedCharts, ...guildCharts, ...bookmarkedCharts, ...allSharedCharts];
    const ownerIds = [
      ...new Set(allCharts.map((c) => c.owner_user_id).filter((id): id is number => id !== null)),
    ];
    if (ownerIds.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUsernames({});
      return;
    }
    fetchUsernames(ownerIds)
      .then(setUsernames)
      .catch(() => setUsernames({}));
  }, [myCharts, curatedCharts, guildCharts, bookmarkedCharts, allSharedCharts]);

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
      {canCurate && <Section title="All Shared" charts={allSharedCharts} {...sectionProps} />}
    </div>
  );
}
