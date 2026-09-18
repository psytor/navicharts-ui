import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Card, Input, RosterRefresh, Select, useAuth } from 'astrogators-shared-ui';
import Layout from '../components/Layout';
import { ChartSelector } from '../components/ChartSelector';
import { Quadrant } from '../components/Quadrant';
import { QuadrantBuilder } from '../components/QuadrantBuilder';
import { RoadmapView } from '../components/RoadmapView';
import { FlowView } from '../components/FlowView';
import { InventoryView } from '../components/InventoryView';
import { api, getShareUrl } from '../api';
import { getLastChartId, setLastChartId } from '../utils/lastChartStorage';
import type { ChartVisibility, StarChart, StarChartListItem, UnitWithRoster } from '../types';

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

  // "View" (StarChartLibrary.tsx's ChartCard) links here with ?view=plan
  // instead of building a separate read-only detail page - the Plan tab
  // already renders Quadrants/Sectors/Waypoints with every edit affordance
  // gated behind canModify, so it's already a read-only summary for anyone
  // who can't edit. "Use" omits the param and lands on the interactive
  // default (Roadmap) as before. A one-time seed, same as chartIdFromUrl -
  // the view-tabs below own `view` after that.
  const viewFromUrl = (() => {
    const raw = searchParams.get('view');
    return raw === 'plan' || raw === 'visualise' || raw === 'inventory' ? raw : null;
  })();

  const [myCharts, setMyCharts] = useState<StarChartListItem[]>([]);
  const [guildCharts, setGuildCharts] = useState<StarChartListItem[]>([]);
  const [curatedCharts, setCuratedCharts] = useState<StarChartListItem[]>([]);
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
  const [view, setView] = useState<ViewName>(() => viewFromUrl ?? 'roadmap');
  const [selectedQuadrantId, setSelectedQuadrantId] = useState<number | null>(null);
  const [editingQuadrantId, setEditingQuadrantId] = useState<number | null>(null);
  const [bookmarkBusy, setBookmarkBusy] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [renamingChart, setRenamingChart] = useState(false);
  const [chartNameDraft, setChartNameDraft] = useState('');
  const [renameBusy, setRenameBusy] = useState(false);
  const [copyBusy, setCopyBusy] = useState(false);
  const [visibilityBusy, setVisibilityBusy] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

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

  // ChartSelector's four source lists, and (bookmarkedCharts specifically)
  // what isBookmarked/canBookmark below need — everything StarChartsPage
  // owns except the admin/mod-only All Shared list, which doesn't belong
  // in a quick "jump into a chart" picker any more than EvaluationSelector
  // offers a Moderation optgroup. A callback (not just an effect) since a
  // visibility change/publish/delete on the open chart's own header below
  // needs to refresh these too - a chart moving between Private/Guild/
  // Shared/Official changes which optgroup(s) it belongs in.
  const loadChartLists = useCallback(async () => {
    const [mine, guild, curated, bookmarked] = await Promise.all([
      user ? api.getMyStarCharts().catch(() => []) : Promise.resolve([]),
      selectedAllyCode ? api.getGuildStarCharts(selectedAllyCode).catch(() => []) : Promise.resolve([]),
      api.getCuratedStarCharts().catch(() => []),
      user ? api.getBookmarkedStarCharts().catch(() => []) : Promise.resolve([]),
    ]);
    setMyCharts(mine);
    setGuildCharts(guild);
    setCuratedCharts(curated);
    setBookmarkedCharts(bookmarked);
  }, [user, selectedAllyCode]);

  useEffect(() => {
    setIsLoadingMyCharts(true);
    void loadChartLists().finally(() => setIsLoadingMyCharts(false));
  }, [loadChartLists]);

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
  // Visibility select, Publish, and Delete used to live on the library
  // card (StarChartLibrary.tsx) - moved here (the chart's own page) to
  // match mod-ledger-ui's EvaluationCard, which carries none of this
  // either and leaves it all to the evaluation's own detail page. Same
  // three-tier _can_delete / canPublish rules ChartCard used to enforce.
  const canCurate = isAdmin || isMod;
  const canChangeVisibility = !!starChart && isOwner;
  const canPublish = !!starChart && canCurate && (starChart.visibility === 'shared' || starChart.visibility === 'guild');
  const canDelete =
    !!starChart && (isOwner || isAdmin || (isMod && starChart.visibility === 'curated'));

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

  async function handleVisibilityChange(visibility: ChartVisibility) {
    if (!starChart) return;
    setVisibilityBusy(true);
    setSyncMessage(null);
    try {
      await api.setStarChartVisibility(starChart.id, visibility, selectedAllyCode);
      await Promise.all([loadStarChart(), loadChartLists()]);
    } catch (e) {
      setSyncMessage(`Visibility change failed: ${(e as Error).message}`);
    } finally {
      setVisibilityBusy(false);
    }
  }

  async function handlePublish() {
    if (!starChart) return;
    setPublishBusy(true);
    setSyncMessage(null);
    try {
      await api.publishStarChart(starChart.id);
      await Promise.all([loadStarChart(), loadChartLists()]);
    } catch (e) {
      setSyncMessage(`Publish failed: ${(e as Error).message}`);
    } finally {
      setPublishBusy(false);
    }
  }

  function handleDeleteClick() {
    if (!starChart) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      setTimeout(() => setConfirmingDelete(false), 3000);
      return;
    }
    setDeleteBusy(true);
    setSyncMessage(null);
    api
      .deleteStarChart(starChart.id)
      .then(() => {
        setActiveStarChartId(null);
        return loadChartLists();
      })
      .catch((e) => setSyncMessage(`Delete failed: ${(e as Error).message}`))
      .finally(() => setDeleteBusy(false));
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
      <div className="overview-page">
      <ChartSelector
        myCharts={myCharts}
        guildCharts={guildCharts}
        curatedCharts={curatedCharts}
        bookmarkedCharts={bookmarkedCharts}
        isLoading={isLoadingMyCharts}
        onView={handleChartSelected}
      />

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
              {canChangeVisibility && (
                <Select
                  value={starChart.visibility}
                  disabled={visibilityBusy}
                  onChange={(e) => handleVisibilityChange(e.target.value as ChartVisibility)}
                  options={[
                    { value: 'private', label: 'Private' },
                    { value: 'guild', label: 'Guild', disabled: !selectedAllyCode },
                    { value: 'shared', label: 'Shared' },
                  ]}
                />
              )}
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
              {canPublish && (
                <Button variant="outline" size="sm" onClick={handlePublish} disabled={publishBusy}>
                  {publishBusy ? 'Publishing...' : 'Publish to Official'}
                </Button>
              )}
              {canDelete && (
                <button
                  className={`chart-delete-btn ${confirmingDelete ? 'confirming' : ''}`}
                  onClick={handleDeleteClick}
                  disabled={deleteBusy}
                >
                  {confirmingDelete ? 'Confirm?' : 'Delete'}
                </button>
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
      </div>
    </Layout>
  );
}
