import { useCallback, useEffect, useRef, useState } from 'react';

const CHANGE_EVENT = 'app:local-storage-change';

function readValue(key, fallback) {
  try {
    if (typeof window === 'undefined') return fallback;
    const stored = window.localStorage.getItem(key);
    return stored === null ? fallback : JSON.parse(stored);
  } catch {
    return fallback;
  }
}

/**
 * Return [value, setValue] for a JSON value. The initial value may be a lazy function.
 * Synchronize mounted consumers and other tabs. Storage failures retain local state.
 * Changing key reads the new key; mounting never overwrites stored data.
 */
export function useLocalStorage(key, initialValue) {
  const [fallback] = useState(() =>
    typeof initialValue === 'function' ? initialValue() : initialValue,
  );
  const [value, setValue] = useState(() => readValue(key, fallback));
  const currentValue = useRef(value);

  useEffect(() => {
    const update = (next) => {
      currentValue.current = next;
      setValue(() => next);
    };
    update(readValue(key, fallback));
    if (typeof window === 'undefined') return;

    const onStorage = (event) => {
      if (event.key !== null && event.key !== key) return;
      // sessionStorage shares the storage event channel but is unrelated.
      try {
        if (event.storageArea && event.storageArea !== window.localStorage) return;
      } catch {
        return;
      }
      update(readValue(key, fallback));
    };
    const onLocalChange = (event) => {
      if (event.detail.key === key) update(event.detail.value);
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(CHANGE_EVENT, onLocalChange);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(CHANGE_EVENT, onLocalChange);
    };
  }, [key, fallback]);

  const setStoredValue = useCallback(
    (nextValue) => {
      const next = typeof nextValue === 'function' ? nextValue(currentValue.current) : nextValue;
      currentValue.current = next;
      setValue(() => next);
      if (typeof window === 'undefined') return;

      try {
        const serialized = JSON.stringify(next);
        if (serialized === undefined) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, serialized);
      } catch {
        // Quota, serialization, and browser privacy restrictions leave state usable.
      }
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { key, value: next } }));
    },
    [key],
  );

  return [value, setStoredValue];
}
