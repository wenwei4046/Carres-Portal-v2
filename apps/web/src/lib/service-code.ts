/**
 * A service's Item Code as the Sales Order page AND its PDF print it — upper
 * case, like every catalogue code (`dispose-mattress` → `DISPOSE-MATTRESS`).
 * Display only: the stored `addon_key` is never rewritten. One function for
 * both surfaces, because the page and the paper must tally column by column.
 */
export const serviceCodeWord = (key: string): string => key.toUpperCase();
