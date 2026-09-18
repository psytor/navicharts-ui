import { useEffect } from 'react';

/**
 * Show the browser's native "Leave site? Changes you made may not be saved."
 * prompt while `hasUnsavedChanges` is true.
 *
 * This is `beforeunload` only — it covers tab close, reload, and navigating
 * away from the origin. This app uses react-router's declarative mode
 * (`<Routes>`/`<Route>`, no data router), which has no `useBlocker` to
 * intercept an in-app route change (e.g. clicking NavBar's Overview link
 * mid-edit) — closing or reloading the tab mid-edit is the accident this
 * guards against, not in-app navigation.
 */
export function useUnsavedChangesWarning(hasUnsavedChanges: boolean): void {
  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Legacy Chrome/Edge still require returnValue to be set; the string
      // itself is ignored by every modern browser.
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);
}
