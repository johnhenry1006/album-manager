import { useEffect, useState } from 'react';

function readSize() {
  return typeof window === 'undefined'
    ? { width: undefined, height: undefined }
    : { width: window.innerWidth, height: window.innerHeight };
}

/** Return viewport dimensions, or undefined dimensions outside the browser. */
export function useWindowSize() {
  const [size, setSize] = useState(readSize);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const update = () => setSize(readSize());
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return size;
}
