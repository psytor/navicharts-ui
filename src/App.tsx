import { useEffect, useState, useCallback } from 'react';
import { NavBar, Container, Footer, Card, Button, useAuth } from 'astrogators-shared-ui';
import { api } from './api';
import { Quadrant } from './components/Quadrant';
import { QuadrantBuilder } from './components/QuadrantBuilder';
import { StarChartPicker } from './components/StarChartPicker';
import { RoadmapView } from './components/RoadmapView';
import { FlowView } from './components/FlowView';
import { InventoryView } from './components/InventoryView';
import { SquadBuilder } from './components/SquadBuilder';
import type { StarChart, StarChartListItem, UnitWithRoster } from './types';
import './App.css';

type ViewName = 'roadmap' | 'plan' | 'visualise' | 'inventory';

function App() {
  const { user, selectedAllyCode, isLoading: authLoading } = useAuth();

  const [myCharts, setMyCharts] = useState<StarChartListItem[]>([]);
  const [curatedCharts, setCuratedCharts] = useState<StarChartListItem[]>([]);
  const [activeStarChartId, setActiveStarChartId] = useState<number | null>(() => {
    const stored = localStorage.getItem('activeStarChartId');
    return stored ? Number(stored) : null;
  });
  const [starChart, setStarChart] = useState<StarChart | null>(null);
  const [units, setUnits] = useState<UnitWithRoster[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [view, setView] = useState<ViewName>('roadmap');
  const [editingQuadrantId, setEditingQuadrantId] = useState<number | null>(null);

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
      // unauthenticated, just an empty list.
      const [mine, curated] = await Promise.all([
        user ? api.getMyStarCharts().catch(() => []) : Promise.resolve([]),
        api.getCuratedStarCharts().catch(() => []),
      ]);
      setMyCharts(mine);
      setCuratedCharts(curated);
      const list = [...mine, ...curated];
      if (list.length === 0) {
        setError('No star charts found. Log in and create one, or check that the curated guide has been seeded.');
        return;
      }
      // keep the currently selected star chart if it still exists, otherwise
      // fall back to the first one
      setActiveStarChartId((current) => {
        const stillExists = current != null && list.some((g) => g.id === current);
        return stillExists ? current : list[0].id;
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading) loadStarCharts();
  }, [authLoading, loadStarCharts]);

  useEffect(() => {
    if (activeStarChartId == null) return;
    localStorage.setItem('activeStarChartId', String(activeStarChartId));
    loadStarChartDetail(activeStarChartId);
  }, [activeStarChartId, loadStarChartDetail]);

  const loadStarChart = useCallback(async () => {
    if (activeStarChartId != null) await loadStarChartDetail(activeStarChartId);
  }, [activeStarChartId, loadStarChartDetail]);

  function switchStarChart(starChartId: number) {
    setEditingQuadrantId(null);
    setActiveStarChartId(starChartId);
  }

  async function handleStarChartCreated(created: StarChartListItem) {
    await loadStarCharts();
    switchStarChart(created.id);
  }

  // The top Quadrant strip is a quick-jump list, not a filter - every view
  // already renders every Quadrant in the chart at once (there's no
  // "active quadrant" concept anywhere else), so a tab click just switches
  // to the Plan tab and scrolls that Quadrant's card into view.
  function jumpToQuadrant(quadrantId: number) {
    setView('plan');
    requestAnimationFrame(() => {
      document.getElementById(`quadrant-${quadrantId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
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

  // Curated charts are admin-collective and only ever created directly
  // (seed.py) today - no in-app promotion flow yet, so every curated chart
  // is treated as read-only here regardless of who's viewing it. Private/
  // shared charts are editable by their owner only, mirroring the backend's
  // _can_modify exactly.
  const canModify =
    !!starChart && !!user &&
    starChart.visibility !== 'curated' &&
    starChart.owner_user_id === Number(user.id);

  const rightExtras = (
    <div className="sync-controls">
      <StarChartPicker
        myCharts={myCharts}
        curatedCharts={curatedCharts}
        activeStarChartId={activeStarChartId}
        onSwitch={switchStarChart}
        onCreated={handleStarChartCreated}
      />
      <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
        {syncing ? 'Syncing...' : 'Sync Roster'}
      </Button>
    </div>
  );

  return (
    <>
      <NavBar appName="Navicharts" appHref="/navicharts/" showAllyCode rightExtras={rightExtras} />
      <Container maxWidth={view === 'visualise' || view === 'inventory' ? 'full' : 'lg'} className="app">
        {error ? (
          <div className="app-error">{error}</div>
        ) : !starChart ? (
          <div className="app-loading">Loading...</div>
        ) : (
          <>
            <Card chamfered chamferSize="lg" showDiagonalBorders diagonalBorderColor="var(--color-primary)" padding="md" className="app-header">
              <div>
                <h1>{starChart.name}</h1>
                {starChart.source && <p className="star-chart-source">{starChart.source}</p>}
              </div>
            </Card>
            {syncMessage && <div className="sync-message">{syncMessage}</div>}

            <nav className="episode-tabs">
              {starChart.quadrants.map((q) => (
                <button key={q.id} onClick={() => jumpToQuadrant(q.id)}>
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
              <FlowView starChart={starChart} />
            ) : view === 'inventory' ? (
              <InventoryView units={units} />
            ) : (
              <>
                <main className="quadrants">
                  {starChart.quadrants.map((quadrant, idx) =>
                    editingQuadrantId === quadrant.id ? (
                      <QuadrantBuilder
                        key={quadrant.id}
                        starChartId={starChart.id}
                        editingQuadrant={quadrant}
                        onEdited={finishEditingQuadrant}
                        onCancelEdit={() => setEditingQuadrantId(null)}
                        allQuadrants={starChart.quadrants}
                      />
                    ) : (
                      <div id={`quadrant-${quadrant.id}`} key={quadrant.id}>
                        <Quadrant
                          quadrant={quadrant}
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
                    )
                  )}
                </main>

                {canModify && (
                  <div className="add-quadrant-container">
                    <QuadrantBuilder
                      starChartId={starChart.id}
                      nextOrderIndex={starChart.quadrants.length}
                      onAdded={loadStarChart}
                      allQuadrants={starChart.quadrants}
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
