import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Button, Input, fetchUsernames } from 'astrogators-shared-ui';
import { api } from '../api';
import type { ChartVisibility, StarChartListItem, StarChartCreateIn } from '../types';

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
  ownerUsername: string | undefined;
}

// Mirrors mod-ledger-ui's EvaluationCard exactly: a plain informational
// tile (eyebrow / name / desc / meta), no whole-card link - two real
// actions live in the footer instead. Visibility changes, copy-link,
// bookmark, publish, and delete live on the chart's own header
// (OverviewPage.tsx's app-header), same as Evaluations keeps all of that
// off its grid card and on the evaluation's own detail page.
function ChartCard({ chart, ownerUsername }: ChartCardProps) {
  return (
    <Card
      chamfered
      padding="none"
      showDiagonalBorders
      edgeColor="var(--color-border)"
      className="library-chart-card"
    >
      <span className="library-chart-card-accent" aria-hidden="true" />
      <p className="library-chart-card-eyebrow">{VISIBILITY_LABEL[chart.visibility]}</p>
      <h2 className="library-chart-card-name">{chart.name}</h2>
      {chart.source && <p className="library-chart-card-desc">{chart.source}</p>}
      {ownerUsername && <p className="library-chart-card-meta">by {ownerUsername}</p>}
      <div className="library-chart-card-footer">
        {/* Plan tab already renders Quadrants/Sectors/Waypoints read-only
            for anyone who can't edit (every edit affordance there is
            canModify-gated) - View just lands there instead of building a
            separate read-only page. */}
        <Link to={`/?chart=${chart.id}&view=plan`} className="library-chart-card-view">
          View
        </Link>
        <Link to={`/?chart=${chart.id}`} className="library-chart-card-use">
          Use &rarr;
        </Link>
      </div>
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
  onCreateClick: () => void;
}

interface SectionProps {
  id: string;
  title: string;
  charts: StarChartListItem[];
  emptyText: string;
  emptyTitle?: string;
  emptyCta?: { label: string; onClick: () => void };
  usernames: Record<number, string>;
}

// Mirrors mod-ledger-ui's MineSection/ProtocolsSection: every section always
// renders, stacked, with its own empty-state card - the NavBar's Star
// Charts entries are anchors into this one page, not a switch between
// sections, so a section silently vanishing when empty would make the
// anchor land on nothing.
function Section({ id, title, charts, emptyText, emptyTitle, emptyCta, usernames }: SectionProps) {
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
              ownerUsername={chart.owner_user_id != null ? usernames[chart.owner_user_id] : undefined}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function StarChartLibrary({
  myCharts, curatedCharts, guildCharts, bookmarkedCharts, allSharedCharts,
  userId, isAdmin, isMod, onCreateClick,
}: StarChartLibraryProps) {
  const [usernames, setUsernames] = useState<Record<number, string>>({});
  const canCurate = isAdmin || isMod;

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
        id="official"
        title="Official"
        charts={curatedCharts}
        emptyText="Nothing here yet. Star Charts picked by the site's admins show up here once they're published."
        usernames={usernames}
      />
      <Section
        id="mine"
        title="My Star Charts"
        charts={myCharts}
        emptyTitle="No star charts yet"
        emptyText="Build your first Star Chart to start planning your farming roadmap. Add Systems, Sectors, and Waypoints, then track your progress run to run."
        emptyCta={userId != null ? { label: 'Create your first Star Chart', onClick: onCreateClick } : undefined}
        usernames={usernames}
      />
      <Section
        id="guild"
        title="Guild"
        charts={guildCharts}
        emptyText="Nothing here yet. Star Charts shared with your guild show up here."
        usernames={usernames}
      />
      <Section
        id="bookmarked"
        title="Bookmarked"
        charts={bookmarkedCharts}
        emptyText="Nothing here yet. Bookmark a Star Chart to keep it handy here."
        usernames={usernames}
      />
      {canCurate && (
        <Section
          id="moderation"
          title="All Shared"
          charts={allSharedCharts}
          emptyText="Nothing shared yet. Star Charts marked Shared by their owners show up here for review."
          usernames={usernames}
        />
      )}
    </div>
  );
}
