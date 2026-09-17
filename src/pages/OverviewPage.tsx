import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Card, Input, RosterRefresh, useAuth } from 'astrogators-shared-ui';
import Layout from '../components/Layout';
import { ChartSelector } from '../components/ChartSelector';
import { Quadrant } from '../components/Quadrant';
import { QuadrantBuilder } from '../components/QuadrantBuilder';
import { RoadmapView } from '../components/RoadmapView';
import { FlowView } from '../components/FlowView';
import { InventoryView } from '../components/InventoryView';
import { api, getShareUrl } from '../api';
import { getLastChartId, setLastChartId } from '../utils/lastChartStorage';
import type { StarChart, StarChartListItem, UnitWithRoster } from '../types';

type ViewName = 'roadmap' | 'plan' | 'visualise' | 'inventory';

/**
 * "/" — Overview. Shows whichever star chart is currently selected (via
 * ?chart=<id>, same URL convention this app already used before routes
 * existed), with a ChartSelector at top to switch. With no ?chart= at all,
 * defaults to the last chart you opened (see utils/lastChartStorage.ts) so
 * a bare visit to "/" isn't just an empty screen — falling back to an
 * empty "pick one" state if there's no last chart, or it's no longer
 * reachable (deleted, ally code changed, etc. — same error handling as
 * before).
 */
export default function OverviewPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, selectedAllyCode } = useAuth();

  const chartIdFromUrl = (() => {
    const raw = searchParams.get('chart');
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  })();

  const [myCharts, setMyCharts] = useState<StarChartListItem[]>([]);
  const [isLoadingMyCharts, setIsLoadingMyCharts] = useState(true);
  const [bookmarkedCharts, setBookmarkedCharts] = useState<StarChartListItem[]>([]);
  const [activeStarChartId, setActiveStarChartId] = useState<number | null>(
    () => chartIdFromUrl ?? getLastChartId()
  );
  const [starChart, setStarChart] = useState<StarChart | null>(null);
  const [units, setUnits] = useState<UnitWithRoster[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [rosterCachedAt, setRosterCachedAt] = useState<string | null>(null);
  const [rosterRefreshAvailableAt, setRosterRefreshAvailableAt] = useState<number | null>(null);
  const [view, setView] = useState<ViewName>('roadmap');
  const [selectedQuadrantId, setSelectedQuadrantId] = useState<number | null>(null);
  const [editingQuadrantId, setEditingQuadrantId] = useState<number | null>(null);
  const [bookmarkBusy, setBookmarkBusy] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [renamingChart, setRenamingChart] = useState(false);
  const [chartNameDraft, setChartNameDraft] = useState('');
  const [renameBusy, setRenameBusy] = useState(false);
  const [copyBusy, setCopyBusy] = useState(false);

  const loadStarChartDetail = useCallback(async (starChartId: number) => {
    try {
      const [full, unitList] = await Promise.all([
        api.getStarChart(starChartId, selectedAllyCode),
        selectedAllyCode ? api.getUnits(selectedAllyCode) : Promise.resolve([]),
      ]);
      setStarChart(full);
      setUnits(unitList);
      setError(null);
      setLastChartId(starChartId);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [selectedAllyCode]);

  const loadStarChart = useCallback(async () => {
    if (activeStarChartId != null) await loadStarChartDetail(activeStarChartId);
  }, [activeStarChartId, loadStarChartDetail]);

  useEffect(() => {
    if (activeStarChartId == null) {
      setStarChart(null);
      return;
    }
    // Keep the URL in sync so the current chart is always copyable/
    // reloadable as a link - replace (not push), since switching charts
    // isn't meant to build browser back/forward history.
    if (chartIdFromUrl !== activeStarChartId) {
      navigate(`/?chart=${activeStarChartId}`, { replace: true });
    }
    loadStarChartDetail(activeStarChartId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStarChartId, loadStarChartDetail]);

  // ChartSelector's own source list, and (with bookmarkedCharts below) what
  // isBookmarked/canBookmark below need — this page only fetches these two
  // lists itself rather than all five StarChartsPage owns, since that's all
  // Overview actually needs.
  useEffect(() => {
    if (!user) {
      setIsLoadingMyCharts(false);
      return;
    }
    setIsLoadingMyCharts(true);
    Promise.all([
      api.getMyStarCharts().catch(() => []),
      api.getBookmarkedStarCharts().catch(() => []),
    ]).then(([mine, bookmarked]) => {
      setMyCharts(mine);
      setBookmarkedCharts(bookmarked);
      setIsLoadingMyCharts(false);
    });
  }, [user]);

  function handleChartSelected(chartId: number) {
    setEditingQuadrantId(null);
    setSelectedQuadrantId(null);
    setError(null);
    setView('roadmap');
    setActiveStarChartId(chartId);
  }

  // The top Quadrant strip is a filter, not navigation - it doesn't touch
  // `view`. Plan and Visualise read selectedQuadrantId and narrow down to
  // just that Quadrant; Roadmap always combines every Quadrant regardless,
  // so selecting one has no visible effect there (that's intentional, not
  // a bug - Roadmap is a whole-chart summary). Clicking the already-active
  // Quadrant again clears the filter back to "all".
  function toggleQuadrantFilter(quadrantId: number) {
    setSelectedQuadrantId((current) => (current === quadrantId ? null : quadrantId));
  }

  async function moveQuadrant(quadrantId: number, direction: number) {
    if (!starChart) return;
    const ids = starChart.quadrants.map((q) => q.id);
    const index = ids.indexOf(quadrantId);
    const swapWith = index + direction;
    if (swapWith < 0 || swapWith >= ids.length) return;
    [ids[index], ids[swapWith]] = [ids[swapWith], ids[index]];
    await api.reorderQuadrants(starChart.id, ids);
    await loadStarChart();
  }

  async function deleteQuadrant(quadrantId: number) {
    if (!starChart) return;
    await api.deleteQuadrant(starChart.id, quadrantId);
    await loadStarChart();
  }

  async function finishEditingQuadrant() {
    setEditingQuadrantId(null);
    await loadStarChart();
  }

  async function handleSync() {
    if (!selectedAllyCode) {
      setSyncMessage('Select an ally code first (top right).');
      return;
    }
    setSyncing(true);
    setSyncMessage(null);
    try {
      const result = await api.syncRoster(selectedAllyCode);
      setRosterCachedAt(result.cached_at ?? new Date().toISOString());
      const next = result.next_refresh_in_seconds ?? 0;
      setRosterRefreshAvailableAt(next > 0 ? Date.now() + next * 1000 : null);
      await loadStarChart();
    } catch (e) {
      setSyncMessage(`Sync failed: ${(e as Error).message}`);
    } finally {
      setSyncing(false);
    }
  }

  const isAdmin = user?.role === 'admin';
  const isMod = user?.role === 'mod';
  const isOwner = !!starChart && !!user && starChart.owner_user_id === Number(user.id);
  // Mirrors the backend's _can_modify exactly: private/guild/shared are
  // owner-only, curated is admin-OR-mod (not owner-gated at all - curated
  // charts have no owner). An admin/mod edits curated content in place
  // here, not just indirectly via publishing a new snapshot.
  const canModify =
    !!starChart && !!user &&
    (starChart.visibility === 'curated' ? isAdmin || isMod : starChart.owner_user_id === Number(user.id));
  const isBookmarked = !!starChart && bookmarkedCharts.some((c) => c.id === starChart.id);
  const canBookmark = !!starChart && !!user && !isOwner;
  const canCopyLink = !!starChart && isOwner && starChart.visibility === 'shared';
  // Forking your own chart is harmless but pointless - only offer it for
  // charts you don't already own.
  const canCopyChart = !!starChart && !!user && !isOwner;

  async function handleBookmarkToggle() {
    if (!starChart) return;
    setBookmarkBusy(true);
    try {
      if (isBookmarked) {
        await api.deleteBookmark(starChart.id);
      } else {
        await api.createBookmark(starChart.id, selectedAllyCode);
      }
      setBookmarkedCharts(await api.getBookmarkedStarCharts().catch(() => bookmarkedCharts));
    } catch (e) {
      setSyncMessage(`Bookmark failed: ${(e as Error).message}`);
    } finally {
      setBookmarkBusy(false);
    }
  }

  function handleCopyLink() {
    if (!starChart) return;
    navigator.clipboard.writeText(getShareUrl(starChart.id)).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  }

  function startRenamingChart() {
    if (!starChart) return;
    setChartNameDraft(starChart.name);
    setRenamingChart(true);
  }

  async function handleRenameSave() {
    if (!starChart || !chartNameDraft.trim()) return;
    setRenameBusy(true);
    try {
      await api.renameStarChart(starChart.id, chartNameDraft.trim());
      setRenamingChart(false);
      await loadStarChart();
    } catch (e) {
      setSyncMessage(`Rename failed: ${(e as Error).message}`);
    } finally {
      setRenameBusy(false);
    }
  }

  // Forks this chart (any visible one - curated, shared, own guild's guild
  // charts, or your own) into a brand-new private chart you own, then
  // switches straight into it - same post-create flow as making a chart
  // from scratch.
  async function handleCopyChart() {
    if (!starChart) return;
    setCopyBusy(true);
    try {
      const copy = await api.copyStarChart(starChart.id, selectedAllyCode);
      handleChartSelected(copy.id);
    } catch (e) {
      setSyncMessage(`Copy failed: ${(e as Error).message}`);
    } finally {
      setCopyBusy(false);
    }
  }

  const rightExtras = selectedAllyCode ? (
    <RosterRefresh
      onRefresh={handleSync}
      isRefreshing={syncing}
      cachedAt={rosterCachedAt}
      refreshAvailableAt={rosterRefreshAvailableAt}
    />
  ) : null;

  const containerMaxWidth = view === 'visualise' || view === 'inventory' ? 'full' : 'lg';

  return (
    <Layout rightExtras={rightExtras} containerMaxWidth={activeStarChartId != null ? containerMaxWidth : 'lg'}>
      <ChartSelector charts={myCharts} isLoading={isLoadingMyCharts} onView={handleChartSelected} />

      {activeStarChartId == null ? (
        <div className="app-loading">Pick a star chart above to get started.</div>
      ) : error ? (
        <div className="app-error">
          <p>{error}</p>
          <Button variant="outline" size="sm" onClick={() => setActiveStarChartId(null)}>
            Choose a different chart
          </Button>
        </div>
      ) : !starChart ? (
        <div className="app-loading">Loading...</div>
      ) : (
        <>
          <Card chamfered chamferSize="lg" showDiagonalBorders edgeColor="var(--color-primary)" padding="md" className="app-header">
            <div>
              {renamingChart ? (
                <div className="chart-rename-form">
                  <Input
                    value={chartNameDraft}
                    onChange={(e) => setChartNameDraft(e.target.value)}
                    autoFocus
                  />
                  <Button variant="primary" size="sm" onClick={handleRenameSave} disabled={renameBusy || !chartNameDraft.trim()}>
                    Save
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setRenamingChart(false)} disabled={renameBusy}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="chart-title-row">
                  <h1>{starChart.name}</h1>
                  {canModify && (
                    <button className="chart-rename-btn" title="Rename star chart" onClick={startRenamingChart}>
                      ✎
                    </button>
                  )}
                </div>
              )}
              {starChart.source && <p className="star-chart-source">{starChart.source}</p>}
            </div>
            <div className="app-header-actions">
              {canCopyLink && (
                <Button variant="outline" size="sm" onClick={handleCopyLink}>
                  {linkCopied ? 'Copied!' : 'Copy link'}
                </Button>
              )}
              {canCopyChart && (
                <Button variant="outline" size="sm" onClick={handleCopyChart} disabled={copyBusy}>
                  {copyBusy ? 'Copying...' : 'Create a copy'}
                </Button>
              )}
              {canBookmark && (
                <Button variant="outline" size="sm" onClick={handleBookmarkToggle} disabled={bookmarkBusy}>
                  {isBookmarked ? 'Unbookmark' : 'Bookmark'}
                </Button>
              )}
            </div>
          </Card>
          {syncMessage && <div className="sync-message">{syncMessage}</div>}

          <nav className="episode-tabs">
            {starChart.quadrants.map((q) => (
              <button
                key={q.id}
                className={selectedQuadrantId === q.id ? 'active' : ''}
                onClick={() => toggleQuadrantFilter(q.id)}
              >
                {q.name}
              </button>
            ))}
          </nav>

          <nav className="view-tabs">
            <button className={view === 'roadmap' ? 'active' : ''} onClick={() => setView('roadmap')}>
              Roadmap
            </button>
            <button className={view === 'plan' ? 'active' : ''} onClick={() => setView('plan')}>
              Plan
            </button>
            <button className={view === 'visualise' ? 'active' : ''} onClick={() => setView('visualise')}>
              Visualise
            </button>
            <button className={view === 'inventory' ? 'active' : ''} onClick={() => setView('inventory')}>
              Inventory
            </button>
          </nav>

          {view === 'roadmap' ? (
            <RoadmapView starChart={starChart} units={units} />
          ) : view === 'visualise' ? (
            <FlowView starChart={starChart} quadrantId={selectedQuadrantId} />
          ) : view === 'inventory' ? (
            <InventoryView units={units} />
          ) : (
            <>
              <main className="quadrants">
                {starChart.quadrants.map((quadrant, idx) => {
                  if (selectedQuadrantId != null && quadrant.id !== selectedQuadrantId) return null;
                  return editingQuadrantId === quadrant.id ? (
                    <QuadrantBuilder
                      key={quadrant.id}
                      starChartId={starChart.id}
                      editingQuadrant={quadrant}
                      onEdited={finishEditingQuadrant}
                      onCancelEdit={() => setEditingQuadrantId(null)}
                    />
                  ) : (
                    <div id={`quadrant-${quadrant.id}`} key={quadrant.id}>
                      <Quadrant
                        quadrant={quadrant}
                        starChartId={starChart.id}
                        allQuadrants={starChart.quadrants}
                        onChange={loadStarChart}
                        onMoveUp={() => moveQuadrant(quadrant.id, -1)}
                        onMoveDown={() => moveQuadrant(quadrant.id, 1)}
                        onDelete={() => deleteQuadrant(quadrant.id)}
                        onEdit={() => setEditingQuadrantId(quadrant.id)}
                        isFirst={idx === 0}
                        isLast={idx === starChart.quadrants.length - 1}
                        canModify={canModify}
                      />
                    </div>
                  );
                })}
              </main>

              {canModify && (
                <div className="add-quadrant-container">
                  <QuadrantBuilder
                    starChartId={starChart.id}
                    nextOrderIndex={starChart.quadrants.length}
                    onAdded={loadStarChart}
                  />
                </div>
              )}
            </>
          )}
        </>
      )}
    </Layout>
  );
}
