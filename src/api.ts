/**
 * Navicharts API client.
 *
 * Ported from the standalone project's api.js, unchanged in shape (same
 * function names, same flat `api = {...}` object, same snake_case
 * pass-through - no camelCase translation layer) except:
 *
 * - Base URL is env-driven (VITE_NAVICHARTS_URL) instead of a hardcoded
 *   localhost:8000, and every route now carries the backend's
 *   /api/v1 prefix.
 * - Requests go through astrogators-shared-ui's authedFetch, which injects
 *   the bearer token (when present) and transparently refreshes it on a
 *   401 - unauthenticated reads (curated charts/squads, single star chart
 *   view) still work with no token riding along, matching the backend's
 *   optional-auth endpoints.
 * - getStarCharts() split into getMyStarCharts()/getCuratedStarCharts() -
 *   there's no single "list everything" endpoint anymore now that charts
 *   are owned per-user (see StarChartOut's owner_user_id/visibility).
 *   Same split applies to getSquads() -> getMySquads().
 * - getUnits() is now roster-scoped (requires allyCode) - the old
 *   catalog-wide "every known unit" query is getUnitCatalog() instead
 *   (GET /units/catalog), used by the pickers.
 * - syncRoster's allyCode is required, not optional (see sync.py's module
 *   docstring - there's no single-user fallback ally code anymore).
 * - No more /units/{id}/image or /events/{id}/image proxy routes - portrait/
 *   banner URLs come back ready-to-use as unit.thumbnail_url /
 *   event.image_url directly, so callers use those fields instead of
 *   building a proxy URL from API_BASE.
 */
import { authedFetch } from 'astrogators-shared-ui';
import type {
  StarChart,
  StarChartListItem,
  StarChartCreateIn,
  QuadrantIn,
  Quadrant,
  Sector,
  Reward,
  UnitWithRoster,
  Unit,
  GameEvent,
  Squad,
  SquadIn,
  ChartVisibility,
  SyncResult,
} from './types';

export const API_BASE: string =
  import.meta.env.VITE_NAVICHARTS_URL || 'http://localhost/navicharts';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await authedFetch(`${API_BASE}/api/v1${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return null as T;
  return res.json();
}

export const api = {
  getMyStarCharts: (): Promise<StarChartListItem[]> => request('/star-charts/mine'),
  getCuratedStarCharts: (): Promise<StarChartListItem[]> => request('/star-charts/curated'),
  getStarChart: (id: number, allyCode?: string | null): Promise<StarChart> =>
    request(`/star-charts/${id}${allyCode ? `?ally_code=${encodeURIComponent(allyCode)}` : ''}`),
  createStarChart: (payload: StarChartCreateIn): Promise<StarChartListItem> =>
    request('/star-charts', { method: 'POST', body: JSON.stringify(payload) }),
  setStarChartVisibility: (id: number, visibility: ChartVisibility): Promise<StarChartListItem> =>
    request(`/star-charts/${id}/visibility`, {
      method: 'PATCH',
      body: JSON.stringify({ visibility }),
    }),

  getUnitCatalog: (): Promise<Unit[]> => request('/units/catalog'),
  getUnits: (allyCode: string): Promise<UnitWithRoster[]> =>
    request(`/units?ally_code=${encodeURIComponent(allyCode)}`),
  getRequiredUnits: (): Promise<Unit[]> => request('/units/required'),
  getEvents: (family?: string): Promise<GameEvent[]> =>
    request(`/events${family ? `?family=${encodeURIComponent(family)}` : ''}`),

  getMySquads: (): Promise<Squad[]> => request('/squads/mine'),
  createSquad: (payload: SquadIn): Promise<Squad> =>
    request('/squads', { method: 'POST', body: JSON.stringify(payload) }),
  updateSquad: (squadId: number, payload: SquadIn): Promise<Squad> =>
    request(`/squads/${squadId}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteSquad: (squadId: number): Promise<void> =>
    request(`/squads/${squadId}`, { method: 'DELETE' }),

  completeSector: (sectorId: number, payload: { notes?: string | null }): Promise<Sector> =>
    request(`/sectors/${sectorId}/complete`, { method: 'POST', body: JSON.stringify(payload) }),
  completeReward: (rewardId: number, completed: boolean): Promise<Reward> =>
    request(`/rewards/${rewardId}/complete`, {
      method: 'POST',
      body: JSON.stringify({ completed }),
    }),

  syncRoster: (allyCode: string): Promise<SyncResult> =>
    request(`/sync/roster?ally_code=${encodeURIComponent(allyCode)}`, { method: 'POST' }),

  reorderQuadrants: (starChartId: number, quadrantIds: number[]): Promise<StarChart> =>
    request(`/star-charts/${starChartId}/quadrants/reorder`, {
      method: 'POST',
      body: JSON.stringify({ quadrant_ids: quadrantIds }),
    }),
  createQuadrant: (starChartId: number, payload: QuadrantIn): Promise<Quadrant> =>
    request(`/star-charts/${starChartId}/quadrants`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteQuadrant: (starChartId: number, quadrantId: number): Promise<void> =>
    request(`/star-charts/${starChartId}/quadrants/${quadrantId}`, { method: 'DELETE' }),
  updateQuadrant: (starChartId: number, quadrantId: number, payload: QuadrantIn): Promise<Quadrant> =>
    request(`/star-charts/${starChartId}/quadrants/${quadrantId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
};
