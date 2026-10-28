import { closeFigures, type DcSource } from "@carres/shared/dealer-commission";
import { adminClient } from "../lib/supabase";
import type { Bindings } from "../types";

/**
 * Dealer commission step 4b (migration 0666; Finance MASTER §3.2, rules 2.7,
 * 6.4, 9.1, 9.2): on the 1st the month before closes by itself. The daily
 * 09:00 MYT cron asks which month is due (none on other days), reads what the
 * shared arithmetic needs, works the month out with `closeFigures` (Law D: the
 * one arithmetic), and hands the figures to `dealer_commission_close`, which
 * keeps them, posts the accrual and raises each dealer's draft payment voucher
 * dated the 15th. Months close in order, so a missed day catches up.
 *
 * service_role: the three RPCs are cron-only (revoked from authenticated and
 * anon), so a user JWT cannot close a month.
 */
export async function runDealerCommissionCloseCron(env: Bindings): Promise<string[]> {
  const sb = adminClient(env);
  const closed: string[] = [];
  // At most three years in one run: a guard, never reached in practice.
  for (let i = 0; i < 36; i++) {
    const due = await sb.rpc("dealer_commission_close_due");
    if (due.error) throw new Error(due.error.message);
    if (!due.data) break;
    const day = String(due.data).slice(0, 10);
    const month = day.slice(0, 7);
    const read = await sb.rpc("dealer_commission_close_read", { p_month: day });
    if (read.error) throw new Error(read.error.message);
    const figures = closeFigures(read.data as DcSource, month);
    const res = await sb.rpc("dealer_commission_close", {
      p_month: day, p_dealers: figures.dealers, p_orders: figures.orders,
    });
    if (res.error) throw new Error(res.error.message);
    closed.push(month);
  }
  console.log(`dealer commission close: ${closed.length ? closed.join(", ") : "no month due"}`);
  return closed;
}
