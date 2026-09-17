import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from 'astrogators-shared-ui';
import Layout from '../components/Layout';
import { StarChartLibrary } from '../components/StarChartLibrary';
import { api } from '../api';
import type { StarChartListItem } from '../types';

/**
 * /starcharts — the library. All five sections (Mine/Guild/Official/
 * Bookmarked/Moderation) render stacked on this one page, same as before
 * this app had routes; NavBar's Star Charts group just links here (plus
 * anchors for each section) instead of flipping local state.
 */
export default function StarChartsPage() {
  const navigate = useNavigate();
  const { user, selectedAllyCode, isLoading: authLoading } = useAuth();

  const [myCharts, setMyCharts] = useState<StarChartListItem[]>([]);
  const [curatedCharts, setCuratedCharts] = useState<StarChartListItem[]>([]);
  const [guildCharts, setGuildCharts] = useState<StarChartListItem[]>([]);
  const [bookmarkedCharts, setBookmarkedCharts] = useState<StarChartListItem[]>([]);
  const [allSharedCharts, setAllSharedCharts] = useState<StarChartListItem[]>([]);

  const isAdmin = user?.role === 'admin';
  const isMod = user?.role === 'mod';

  const loadStarCharts = useCallback(async () => {
    // No single "list everything" endpoint anymore now that charts are
    // owned per-user - "mine" 401s with no token; that's fine
    // unauthenticated, just an empty list. Guild/bookmarked need
    // ally_code/a logged-in user respectively - skip rather than error
    // when those preconditions aren't met yet.
    const [mine, curated, guild, bookmarked, allShared] = await Promise.all([
      user ? api.getMyStarCharts().catch(() => []) : Promise.resolve([]),
      api.getCuratedStarCharts().catch(() => []),
      selectedAllyCode ? api.getGuildStarCharts(selectedAllyCode).catch(() => []) : Promise.resolve([]),
      user ? api.getBookmarkedStarCharts().catch(() => []) : Promise.resolve([]),
      isAdmin || isMod ? api.getAllSharedStarCharts().catch(() => []) : Promise.resolve([]),
    ]);
    setMyCharts(mine);
    setCuratedCharts(curated);
    setGuildCharts(guild);
    setBookmarkedCharts(bookmarked);
    setAllSharedCharts(allShared);
  }, [user, selectedAllyCode, isAdmin, isMod]);

  useEffect(() => {
    if (!authLoading) void loadStarCharts();
  }, [authLoading, loadStarCharts]);

  // Same signature StarChartLibrary already expects (deletedActiveChart is
  // meaningless here now — there's no "active chart" concept on this page,
  // that lives on Overview — so this just always reloads).
  async function handleLibraryChanged() {
    await loadStarCharts();
  }

  async function handleStarChartCreated(created: StarChartListItem) {
    await loadStarCharts();
    navigate(`/?chart=${created.id}`);
  }

  return (
    <Layout>
      <StarChartLibrary
        myCharts={myCharts}
        curatedCharts={curatedCharts}
        guildCharts={guildCharts}
        bookmarkedCharts={bookmarkedCharts}
        allSharedCharts={allSharedCharts}
        userId={user ? Number(user.id) : null}
        isAdmin={isAdmin}
        isMod={isMod}
        selectedAllyCode={selectedAllyCode}
        onSwitch={(id) => navigate(`/?chart=${id}`)}
        onChanged={handleLibraryChanged}
        onCreated={handleStarChartCreated}
      />
    </Layout>
  );
}
