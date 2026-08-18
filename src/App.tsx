import { useEffect, useState, useCallback } from 'react';
import { NavBar, Container, Footer, Card, Button, useAuth } from 'astrogators-shared-ui';
import { api, getShareUrl } from './api';
import { Quadrant } from './components/Quadrant';
import { QuadrantBuilder } from './components/QuadrantBuilder';
import { StarChartLibrary } from './components/StarChartLibrary';
import { RoadmapView } from './components/RoadmapView';
import { FlowView } from './components/FlowView';
import { InventoryView } from './components/InventoryView';
import { SquadBuilder } from './components/SquadBuilder';
import type { StarChart, StarChartListItem, UnitWithRoster } from './types';
import './App.css';

type ViewName = 'roadmap' | 'plan' | 'visualise' | 'inventory';
type AppMode = 'library' | 'chart';

// The URL is the single source of truth for which chart (if any) is open -
// no localStorage auto-resume. Bare /navicharts/ means "show the library";
// ?chart=<id> (from a share link, or from our own replaceState on switch)
// means "open this chart directly".
function chartIdFromUrl(): number | null {
  const raw = new URLSearchParams(window.location.search).get('chart');
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function App() {
  const { user, selectedAllyCode, isLoading: authLoading } = useAuth();

  const [myCharts, setMyCharts] = useState<StarChartListItem[]>([]);
  const [curatedCharts, setCuratedCharts] = useState<StarChartListItem[]>([]);
  const [guildCharts, setGuildCharts] = useState<StarChartListItem[]>([]);
  const [bookmarkedCharts, setBookmarkedCharts] = useState<StarChartListItem[]>([]);
  const [appMode, setAppMode] = useState<AppMode>(() => (chartIdFromUrl() != null ? 'chart' : 'library'));
  const [activeStarChartId, setActiveStarChartId] = useState<number | null>(() => chartIdFromUrl());
  const [starChart, setStarChart] = useState<StarChart | null>(null);
  const [units, setUnits] = useState<UnitWithRoster[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [view, setView] = useState<ViewName>('roadmap');
  const [selectedQuadrantId, setSelectedQuadrantId] = useState<number | null>(null);
  const [editingQuadrantId, setEditingQuadrantId] = useState<number | null>(null);
  const [bookmarkBusy, setBookmarkBusy] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const loadStarChartDetail = useCallback(async (starChartId: number) => {
    try {
      const [full, unitList] = await Promise.all([
        api.getStarChart(starChartId, selectedAllyCode),
        selectedAllyCode ? api.getUnits(selectedAllyCode) : Promise.resolve([]),
      ]);
      setStarChart(full);
      setUnits(unitList);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [selectedAllyCode]);

  const loadStarCharts = useCallback(async () => {
    try {
      // No single "list everything" endpoint anymore now that charts are
      // owned per-user - "mine" 401s with no token; that's fine
      // unauthenticated, just an empty list. Guild/bookmarked need
      // ally_code/a logged-in user respectively - skip rather than error
      // when those preconditions aren't met yet.
      const [mine, curated, guild, bookmarked] = await Promise.all([
        user ? api.getMyStarCharts().catch(() => []) : Promise.resolve([]),
        api.getCuratedStarCharts().catch(() => []),
        selectedAllyCode ? api.getGuildStarCharts(selectedAllyCode).catch(() => []) : Promise.resolve([]),
        user ? api.getBookmarkedStarCharts().catch(() => []) : Promise.resolve([]),
      ]);
      setMyCharts(mine);
      setCuratedCharts(curated);
      setGuildCharts(guild);
      setBookmarkedCharts(bookmarked);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [user, selectedAllyCode]);

  useEffect(() => {
    if (!authLoading) loadStarCharts();
  }, [authLoading, loadStarCharts]);

  useEffect(() => {
    if (appMode !== 'chart' || activeStarChartId == null) return;
    // Keep the URL in sync so the current chart is always copyable/
    // reloadable as a link - replaceState (not pushState), since switching
    // charts isn't meant to build browser back/forward history.
    const url = new URL(window.location.href);
    url.searchParams.set('chart', String(activeStarChartId));
    window.history.replaceState(null, '', url);
    loadStarChartDetail(activeStarChartId);
  }, [appMode, activeStarChartId, loadStarChartDetail]);

  const loadStarChart = useCallback(async () => {
    if (activeStarChartId != null) await loadStarChartDetail(activeStarChartId);
  }, [activeStarChartId, loadStarChartDetail]);

  // The only way into 'chart' mode - clicking Open in the library, a
  // ?chart= deep link at mount, or creating a new chart.
  function openChart(starChartId: number) {
    setEditingQuadrantId(null);
    setSelectedQuadrantId(null);
    setError(null);
    setView('roadmap');
    setAppMode('chart');
    setActiveStarChartId(starChartId);
  }

  // The only way back to the library - strips ?chart= from the URL and
  // drops the loaded chart entirely (no chart is loaded while in library
  // mode). Clearing activeStarChartId (rather than leaving it set) also
  // guarantees re-opening the SAME chart later still changes activeStarChartId
  // from null -> id, so the effect above reliably re-syncs the URL every time
  // - it wouldn't fire on a same-id no-op re-set otherwise.
  function goToLibrary() {
    setAppMode('library');
    setActiveStarChartId(null);
    setStarChart(null);
    setError(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('chart');
    window.history.replaceState(null, '', url);
    loadStarCharts();
  }

  // Refreshes the four library lists after any create/delete/visibility/
  // publish/bookmark action. When the chart just deleted was the currently
  // open one, there's nothing sensible left to show it as - go home.
  async function handleLibraryChanged(deletedActiveChart?: boolean) {
    if (deletedActiveChart) {
      goToLibrary();
      return;
    }
    await loadStarCharts();
  }

  async function handleStarChartCreated(created: StarChartListItem) {
    await loadStarCharts();
    openChart(created.id);
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
      setSyncMessage(`Synced ${result.units_synced} units for ally code ${result.ally_code}`);
      await loadStarChart();
    } catch (e) {
      setSyncMessage(`Sync failed: ${(e as Error).message}`);
    } finally {
      setSyncing(false);
    }
  }

  // Curated charts are admin-collective - always read-only here regardless
  // of who's viewing it, mirroring the backend's _can_modify exactly (an
  // admin edits curated content indirectly, by publishing a new snapshot
  // from the library, never by mutating an already-curated chart in
  // place). Private/guild/shared charts are editable by their owner only.
  const canModify =
    !!starChart && !!user &&
    starChart.visibility !== 'curated' &&
    starChart.owner_user_id === Number(user.id);
  const isAdmin = user?.role === 'admin';
  const isOwner = !!starChart && !!user && starChart.owner_user_id === Number(user.id);
  const isBookmarked = !!starChart && bookmarkedCharts.some((c) => c.id === starChart.id);
  const canBookmark = !!starChart && !!user && !isOwner;
  const canCopyLink = !!starChart && isOwner && starChart.visibility === 'shared';

  async function handleBookmarkToggle() {
    if (!starChart) return;
    setBookmarkBusy(true);
    try {
      if (isBookmarked) {
        await api.deleteBookmark(starChart.id);
      } else {
        await api.createBookmark(starChart.id, selectedAllyCode);
      }
      await loadStarCharts();
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

  const rightExtras = (
    <div className="sync-controls">
      <Button variant="outline" size="sm" onClick={goToLibrary} disabled={appMode === 'library'}>
        My Star Charts
      </Button>
      <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
        {syncing ? 'Syncing...' : 'Sync Roster'}
      </Button>
    </div>
  );

  return (
    <>
      <NavBar appName="Navicharts" appHref="/navicharts/" showAllyCode rightExtras={rightExtras} />
      <Container maxWidth={appMode === 'chart' && (view === 'visualise' || view === 'inventory') ? 'full' : 'lg'} className="app">
        {appMode === 'library' ? (
          <StarChartLibrary
            myCharts={myCharts}
            curatedCharts={curatedCharts}
            guildCharts={guildCharts}
            bookmarkedCharts={bookmarkedCharts}
            userId={user ? Number(user.id) : null}
            isAdmin={isAdmin}
            selectedAllyCode={selectedAllyCode}
            onSwitch={openChart}
            onChanged={handleLibraryChanged}
            onCreated={handleStarChartCreated}
          />
        ) : error ? (
          <div className="app-error">
            <p>{error}</p>
            <Button variant="outline" size="sm" onClick={goToLibrary}>Back to My Star Charts</Button>
          </div>
        ) : !starChart ? (
          <div className="app-loading">Loading...</div>
        ) : (
          <>
            <Card chamfered chamferSize="lg" showDiagonalBorders diagonalBorderColor="var(--color-primary)" padding="md" className="app-header">
              <div>
                <h1>{starChart.name}</h1>
                {starChart.source && <p className="star-chart-source">{starChart.source}</p>}
              </div>
              <div className="app-header-actions">
                {canCopyLink && (
                  <Button variant="outline" size="sm" onClick={handleCopyLink}>
                    {linkCopied ? 'Copied!' : 'Copy link'}
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
              <button
                className={view === 'roadmap' ? 'active' : ''}
                onClick={() => setView('roadmap')}
              >
                Roadmap
              </button>
              <button
                className={view === 'plan' ? 'active' : ''}
                onClick={() => setView('plan')}
              >
                Plan
              </button>
              <button
                className={view === 'visualise' ? 'active' : ''}
                onClick={() => setView('visualise')}
              >
                Visualise
              </button>
              <button
                className={view === 'inventory' ? 'active' : ''}
                onClick={() => setView('inventory')}
              >
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

                <SquadBuilder />
              </>
            )}
          </>
        )}
      </Container>
      <Footer />
    </>
  );
}

export default App;
