/** Today in MYT. The Worker's clock is UTC; between 16:00 and midnight UTC that
 *  is already tomorrow in Klang, and the document's DDMMYY segment means the
 *  day it was issued IN KLANG, not in Greenwich. */
export function todayIsoMYT(): string {
  return new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
}
