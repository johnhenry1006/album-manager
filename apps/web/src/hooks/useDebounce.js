import { useEffect, useState } from 'react';

/** Return the latest value once it has remained unchanged for delay milliseconds. */
export function useDebounce(value, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(() => value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(() => value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
