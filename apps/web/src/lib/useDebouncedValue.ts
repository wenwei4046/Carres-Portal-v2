import { useEffect, useState } from "react";

/**
 * Returns a debounced copy of `value` that only updates `delayMs` after the
 * last change. Used by the POS catalog search box so filtering ~170 models
 * doesn't run on every keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs = 180): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
