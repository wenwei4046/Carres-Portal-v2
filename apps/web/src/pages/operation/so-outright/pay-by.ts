/**
 * Pay by — Payments' own collection clock, read for the Outright list.
 *
 * The Payment Monitor's exact composition (`paymentMonitorRows` over the
 * invoice register, storage cases, later-delivery requests and the effective
 * timing rules), never a second arithmetic (Architecture Law D). Read only;
 * Finance's records are linked, never written (Finance MASTER boundary).
 *
 * A refused read is `denied`, a failed one `failed` — never "no deadline".
 */
import { useCallback, useMemo } from "react";
import { paymentMonitorRows, type PaymentMonitorRow } from "@carres/shared/payment-monitor";
import { collectionTimingRulesOf } from "@carres/shared/collection-clock";
import { ApiError } from "@/lib/api";
import { useDeliveryDays, useOfficeDays } from "@/lib/deadline-queries";
import { appTodayIso } from "@/lib/fmt-date";
import {
  useInvoiceRegister,
  useLaterDeliveryRequests,
  usePaymentSettings,
  usePaymentStorageCases,
} from "@/lib/queries";
import type { PayByRead } from "./outright-columns";

type Q = { isPending: boolean; isError: boolean; error: unknown };

/** The worst state of several reads: refused beats failed beats loading. */
export function readStateOf(queries: Q[]): "denied" | "failed" | "loading" | "ok" {
  if (queries.some((q) => q.isError && q.error instanceof ApiError && q.error.status === 403)) return "denied";
  if (queries.some((q) => q.isError)) return "failed";
  if (queries.some((q) => q.isPending)) return "loading";
  return "ok";
}

export function usePayBy(): (orderId: string) => PayByRead {
  const invoicesQ = useInvoiceRegister();
  const casesQ = usePaymentStorageCases();
  const requestsQ = useLaterDeliveryRequests();
  const settingsQ = usePaymentSettings();
  const today = appTodayIso();
  /* `Pay by` is the payment-due FACT: it counts on THE Delivery calendar
     (Monday–Saturday + the stored Selangor holidays). The owner calendar
     moves only an action day, which this column never prints. */
  const officeDays = useOfficeDays();
  const deliveryOpts = useDeliveryDays().opts;

  const state = readStateOf([invoicesQ, casesQ, requestsQ, settingsQ]);
  const byOrder = useMemo(() => {
    if (state !== "ok") return null;
    const invoices = invoicesQ.data ?? [];
    const timingRules = collectionTimingRulesOf(settingsQ.data?.collection_timing ?? []);
    const promisedByOrder = new Map<string, string>();
    for (const r of invoices) {
      const p = r.orders?.latest_promise?.promised_date;
      if (p && !promisedByOrder.has(r.order_id)) promisedByOrder.set(r.order_id, p);
    }
    const rows = paymentMonitorRows({
      invoices,
      cases: casesQ.data?.cases ?? [],
      requests: requestsQ.data?.requests ?? [],
      todayIso: today,
      opts: deliveryOpts,
      timingRules,
      promisedByOrder,
      owner: officeDays.owner,
    });
    return new Map<string, PaymentMonitorRow>(rows.map((r) => [r.orderId, r]));
  }, [state, invoicesQ.data, casesQ.data, requestsQ.data, settingsQ.data, today, deliveryOpts, officeDays.owner]);

  return useCallback(
    (orderId: string): PayByRead => {
      if (state !== "ok") return { state };
      return { state: "ok", row: byOrder?.get(orderId) ?? null };
    },
    [state, byOrder],
  );
}
