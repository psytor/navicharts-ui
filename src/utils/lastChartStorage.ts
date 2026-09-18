// Overview's default chart when you land on a bare "/" — the only
// localStorage usage in this app. Deliberately narrower than the "resume
// last chart" behavior this app removed in the past (see CLAUDE.md's
// architecture history): that was the *default entry point* auto-opening
// whatever you last had loaded, with no way to land on a neutral screen.
// Here it only ever seeds Overview's own selector when no ?chart= is
// present — a dead/inaccessible chart just falls back to the empty state,
// same as an expired share link would.
const KEY = 'navicharts:lastChartId';

export function getLastChartId(): number | null {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function setLastChartId(id: number): void {
  try {
    localStorage.setItem(KEY, String(id));
  } catch {
    // Private browsing / storage disabled — Overview just won't remember
    // a default next time, not fatal.
  }
}
