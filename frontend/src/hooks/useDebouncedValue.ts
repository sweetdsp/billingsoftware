import { useEffect, useState } from 'react';

/**
 * Returns `value` after it has stopped changing for `delayMs` milliseconds.
 * Typical use: debounce a search input before it reaches a query key or the URL.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(handle);
  }, [value, delayMs]);

  return debounced;
}

export default useDebouncedValue;
