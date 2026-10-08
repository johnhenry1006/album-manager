import { useEffect, useState } from 'react';

/** Attach ref to an element to receive its latest entry and intersection state. */
export function useIntersectionObserver({ root = null, rootMargin = '0px', threshold = 0 } = {}) {
  const [target, setTarget] = useState(null);
  const [entry, setEntry] = useState(null);
  // Equivalent inline threshold arrays must not recreate the subscription.
  const thresholdKey = JSON.stringify(threshold);

  useEffect(() => {
    setEntry(null);
    if (!target || typeof IntersectionObserver === 'undefined') return;

    let active = true;
    const observer = new IntersectionObserver(
      (entries) => {
        if (active && entries[0]) setEntry(entries[0]);
      },
      { root, rootMargin, threshold: JSON.parse(thresholdKey) },
    );
    observer.observe(target);

    return () => {
      active = false;
      observer.disconnect();
    };
  }, [target, root, rootMargin, thresholdKey]);

  return { ref: setTarget, entry, isIntersecting: entry?.isIntersecting ?? false };
}
