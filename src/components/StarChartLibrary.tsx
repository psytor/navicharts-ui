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
  curated: 'Official',
};

interface NewStarChartFormProps {
  onCreated: (chart: StarChartListItem) => void;
  onCancel: () => void;
}

export function NewStarChartForm({ onCreated, onCancel }: NewStarChartFormProps) {
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
    <Card chamfered padding="sm" showDiagonalBorders edgeColor="var(--color-border)" className="library-chart-card">
      <span className="library-chart-card-accent" aria-hidden="true" />
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
            Publish to Official
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
  onCreateClick: () => void;
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

interface SectionProps {
  id: string;
  title: string;
  charts: StarChartListItem[];
  emptyText: string;
  emptyTitle?: string;
  emptyCta?: { label: string; onClick: () => void };
}

// Mirrors mod-ledger-ui's MineSection/ProtocolsSection: every section always
// renders, stacked, with its own empty-state card - the NavBar's Star
// Charts entries are anchors into this one page, not a switch between
// sections, so a section silently vanishing when empty would make the
// anchor land on nothing.
function Section({
  id, title, charts, emptyText, emptyTitle, emptyCta, userId, bookmarkedIds, usernames, ...rest
}: SectionProps & SectionCommonProps) {
  return (
    <section id={id} className="library-section">
      <p className="starcharts-divider">{title}</p>
      {charts.length === 0 ? (
        <Card
          chamfered
          padding="none"
          showDiagonalBorders
          edgeColor="var(--color-primary)"
          className="starcharts-empty"
        >
          {emptyTitle && <span className="starcharts-empty-accent" aria-hidden="true" />}
          {emptyTitle && <h2 className="starcharts-empty-title">{emptyTitle}</h2>}
          <p className="starcharts-empty-text">{emptyText}</p>
          {emptyCta && (
            <Button variant="primary" onClick={emptyCta.onClick}>{emptyCta.label}</Button>
          )}
        </Card>
      ) : (
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
      )}
    </section>
  );
}

export function StarChartLibrary({
  myCharts, curatedCharts, guildCharts, bookmarkedCharts, allSharedCharts,
  userId, isAdmin, isMod, selectedAllyCode, onSwitch, onChanged, onCreateClick,
}: StarChartLibraryProps) {
  const [usernames, setUsernames] = useState<Record<number, string>>({});
  const bookmarkedIds = new Set(bookmarkedCharts.map((c) => c.id));
  const canCurate = isAdmin || isMod;
  const sectionProps = { userId, isAdmin, isMod, usernames, selectedAllyCode, onSwitch, onChanged, bookmarkedIds };

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

  return (
    <div className="star-chart-library">
      <Section
        id="mine"
        title="Mine"
        charts={myCharts}
        emptyTitle="No star charts yet"
        emptyText="Build your first Star Chart to start planning your farming roadmap. Add Systems, Sectors, and Waypoints, then track your progress run to run."
        emptyCta={userId != null ? { label: 'Create your first Star Chart', onClick: onCreateClick } : undefined}
        {...sectionProps}
      />
      <Section
        id="official"
        title="Official"
        charts={curatedCharts}
        emptyText="Nothing here yet. Star Charts picked by the site's admins show up here once they're published."
        {...sectionProps}
      />
      <Section
        id="guild"
        title="Guild"
        charts={guildCharts}
        emptyText="Nothing here yet. Star Charts shared with your guild show up here."
        {...sectionProps}
      />
      <Section
        id="bookmarked"
        title="Bookmarked"
        charts={bookmarkedCharts}
        emptyText="Nothing here yet. Bookmark a Star Chart to keep it handy here."
        {...sectionProps}
      />
      {canCurate && (
        <Section
          id="moderation"
          title="All Shared"
          charts={allSharedCharts}
          emptyText="Nothing shared yet. Star Charts marked Shared by their owners show up here for review."
          {...sectionProps}
        />
      )}
    </div>
  );
}
