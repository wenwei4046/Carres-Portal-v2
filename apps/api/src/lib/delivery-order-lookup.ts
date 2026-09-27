/**
 * A Delivery Order is opened by its row id or by its document number. The row
 * id is a uuid; everything else is a number, whatever format minted it
 * (`DO-180826-3035` before 0575, `DO2609-4827` / `SDO2609-48271` since).
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function deliveryOrderLookup(idOrNumber: string): {
  column: "id" | "do_number";
  value: string;
} {
  const given = idOrNumber.trim();
  return UUID.test(given)
    ? { column: "id", value: given }
    : { column: "do_number", value: given.toUpperCase() };
}
