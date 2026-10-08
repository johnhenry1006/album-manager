import { useCallback, useMemo, useSyncExternalStore } from 'react';

/** Subscribe to a CSS media query; unavailable APIs and server renders return false. */
export function useMediaQuery(query) {
  const mediaQuery = useMemo(
    () =>
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia(query)
        : null,
    [query],
  );
  const subscribe = useCallback(
    (notify) => {
      if (!mediaQuery) return () => {};
      mediaQuery.addEventListener('change', notify);
      return () => mediaQuery.removeEventListener('change', notify);
    },
    [mediaQuery],
  );
  const getSnapshot = useCallback(() => mediaQuery?.matches ?? false, [mediaQuery]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
