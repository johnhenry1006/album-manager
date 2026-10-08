import { useEffect, useRef } from 'react';

/** Return the value from the previous committed render; initially undefined. */
export function usePrevious(value) {
  const previous = useRef();

  useEffect(() => {
    previous.current = value;
  });

  return previous.current;
}
