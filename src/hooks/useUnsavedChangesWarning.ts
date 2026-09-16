import { useEffect } from 'react';

/**
 * Show the browser's native "Leave site? Changes you made may not be saved."
 * prompt while `hasUnsavedChanges` is true.
 *
 * This is `beforeunload` only — it covers tab close, reload, and navigating
 * away from the origin. This app has no router (one `App.tsx`, `useState`
 * screens), so there is no in-app route change to intercept; closing or
 * reloading the tab mid-edit is the accident this guards against.
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
