import { isPoDayMYT, monthKeyMYT } from "@carres/shared";
import { loadPurchasingNumbers } from "../lib/purchasing-settings";
import { adminClient } from "../lib/supabase";
import { resolveCurrentPoDuty } from "../routes/operation/po-duty";
import type { Bindings } from "../types";

/**
 * PO-day reminder cron (0236, Jess 2026-07-18): on every configured PO day
 * (MYT) drop ONE ops_task on the month's PO duty holder — "PO day — N orders
 * waiting stock". Runs inside the existing daily 09:00-MYT cron; non-PO days
 * and dormant DBs (pre-0236) exit quietly. Idempotent: skips if today's
 * PO-day task already exists (cron fires once daily anyway — this guards
 * manual re-runs).
 *
 * N = open orders with at least one line whose SKU is short across the shared
 * stock pool — an approximation of the list's Waiting-stock queue, good
 * enough for a reminder title (the queue itself is the work surface).
 */
export async function runPoDutyCron(env: Bindings): Promise<number> {
  const now = new Date();
  const sb = adminClient(env);

  // P1 — the PO days are a setting. A settings read that fails skips the
  // reminder rather than guessing a cadence: a reminder on the wrong day
  // teaches the duty holder to ignore it.
  let poDays: number[];
  try {
    poDays = (await loadPurchasingNumbers(sb)).poDays;
  } catch (e) {
    console.error("po-duty cron: settings unreadable:", (e as Error).message);
    return 0;
  }
  if (!isPoDayMYT(now, poDays)) return 0;
  const duty = await resolveCurrentPoDuty(sb);
  if (!duty) {
    console.log("po-duty cron: dormant (no duty holder)");
    return 0;
  }

  // Idempotency — one PO-day task per MYT day.
  const startOfDayMYT = new Date(
    Math.floor((now.getTime() + 8 * 3_600_000) / 86_400_000) * 86_400_000 -
      8 * 3_600_000,
  ).toISOString();
  const existing = await sb
    .from("ops_tasks")
    .select("id")
    .like("title", "PO day%")
    .gte("created_at", startOfDayMYT)
    .limit(1);
  if (existing.error) {
    console.error("po-duty cron: task check failed:", existing.error.message);
    return 0;
  }
  if ((existing.data ?? []).length > 0) return 0;

  // Waiting-stock estimate: open orders whose lines outrun free stock.
  let waiting = 0;
  const orders = await sb
    .from("orders")
    .select("id, status, operation_stage")
    .neq("status", "cancelled");
  if (!orders.error) {
    const open = (orders.data ?? []).filter(
      (o) => o.operation_stage !== "delivered" && o.status !== "delivered",
    );
    const openIds = open.map((o) => o.id as string);
    if (openIds.length > 0) {
      const [lines, stock] = await Promise.all([
        sb.from("order_lines").select("order_id, sku, qty").in("order_id", openIds),
        sb.from("stock_balances").select("sku, qty, reserved"),
      ]);
      if (!lines.error && !stock.error) {
        const avail = new Map<string, number>();
        for (const s of stock.data ?? []) {
          const free = Number(s.qty ?? 0) - Number(s.reserved ?? 0);
          avail.set(s.sku as string, (avail.get(s.sku as string) ?? 0) + free);
        }
        const needBySku = new Map<string, number>();
        for (const l of lines.data ?? []) {
          needBySku.set(
            l.sku as string,
            (needBySku.get(l.sku as string) ?? 0) + Number(l.qty ?? 0),
          );
        }
        const shortSkus = new Set(
          [...needBySku].filter(([sku, need]) => (avail.get(sku) ?? 0) < need).map(([sku]) => sku),
        );
        const shortOrders = new Set<string>();
        for (const l of lines.data ?? []) {
          if (shortSkus.has(l.sku as string)) shortOrders.add(l.order_id as string);
        }
        waiting = shortOrders.size;
      }
    }
  }

  const { error } = await sb.from("ops_tasks").insert({
    title: `PO day — ${waiting} order${waiting === 1 ? "" : "s"} short of stock`,
    detail:
      "PO day: open Orders → the Send PO / Confirm ready date queues, select, Send PO. Urgent (red) rows must not wait for a PO day.",
    created_by: duty.user_id,
    assigned_to: duty.user_id,
    priority: "normal",
  });
  if (error) {
    console.error("po-duty cron: task insert failed:", error.message);
    return 0;
  }
  console.log(`po-duty cron: PO-day task created for ${monthKeyMYT(now)} holder (${waiting} waiting)`);
  return 1;
}
