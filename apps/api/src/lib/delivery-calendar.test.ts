/**
 * `readDeliveryCalendar` — the dispatching Site's stored Selangor calendar,
 * else the built-in list; never throws.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_DELIVERY_CALENDAR, deliveryHolidaySet } from "@carres/shared";
import { readDeliveryCalendar } from "./delivery-calendar";

type Rows = Record<string, unknown>[];

/** A minimal PostgREST-shaped client: every table answers its rows; a chain
 *  filters on `eq` so the dates of only the chosen calendar come back. */
function client(tables: Record<string, Rows | { error: string }>) {
  return {
    from(table: string) {
      const source = tables[table];
      let rows: Rows = Array.isArray(source) ? [...source] : [];
      const error = !Array.isArray(source) && source ? { message: source.error } : null;
      const chain: Record<string, unknown> = {
        select: () => chain,
        order: () => chain,
        limit: () => chain,
        eq: (col: string, value: unknown) => {
          rows = rows.filter((r) => r[col] === value);
          return chain;
        },
        maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error }),
        then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows, error }).then(resolve),
      };
      return chain;
    },
  } as never;
}

const SITE = "site-klang";

describe("readDeliveryCalendar", () => {
  it("reads the ACTIVE calendar for the dispatching Site's policy state", async () => {
    const { calendar, stored } = await readDeliveryCalendar(client({
      warehouses: [{ id: SITE }],
      warehouse_holiday_policies: [{ site_id: SITE, country: "Malaysia", state: "Selangor" }],
      warehouse_holiday_calendars: [
        { id: "kl", country: "Malaysia", state: "Kuala Lumpur", active: true },
        { id: "sel", country: "Malaysia", state: "Selangor", active: true },
      ],
      warehouse_holiday_dates: [
        { calendar_id: "sel", on_date: "2026-10-20", name: "Imported holiday" },
        { calendar_id: "kl", on_date: "2026-02-01", name: "Federal Territory Day" },
      ],
    }));
    expect(stored).toBe(true);
    const set = deliveryHolidaySet(calendar);
    expect(set.has("2026-10-20")).toBe(true);
    expect(set.has("2026-02-01")).toBe(false); // the Kuala Lumpur calendar is never borrowed
    expect(set.has("2026-12-11")).toBe(false); // the imported 2026 replaces the built-in 2026
    expect(set.has("2027-01-01")).toBe(true); // early 2027 stays on the built-in list
    expect(calendar.holidaySource).toBe("mixed");
  });

  it("no imported Selangor calendar → the built-in list, said so", async () => {
    const { calendar, stored } = await readDeliveryCalendar(client({
      warehouses: [{ id: SITE }],
      warehouse_holiday_policies: [],
      warehouse_holiday_calendars: [],
      warehouse_holiday_dates: [],
    }));
    expect(stored).toBe(true);
    expect(calendar.holidaySource).toBe("built_in");
    expect(deliveryHolidaySet(calendar).has("2026-12-11")).toBe(true);
  });

  it("an unreadable table or a throwing client fails safe to the built-in list", async () => {
    const refused = await readDeliveryCalendar(client({ warehouses: { error: "permission denied" }, warehouse_holiday_calendars: [] }));
    expect(refused).toEqual({ calendar: DEFAULT_DELIVERY_CALENDAR, stored: false });
    const thrown = await readDeliveryCalendar(undefined as never);
    expect(thrown.stored).toBe(false);
  });
});
