import { useEffect, useMemo, useRef, useState } from "react";
import { useQueries, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { readyStockResponseSchema, readyStockReserveResultSchema, type ReadyStockResponse, type SoBatchOrderRow } from "@carres/shared";
import { matchSoBatchReadyStock, type SoBatchStockOffer } from "@carres/shared/so-batch-stock-match";
import { ApiError, apiFetch } from "@/lib/api";

/**
 * `USE STOCK` ON THE SELECTION BAR (owner 13 Oct 2026, round 3; Purchasing
 * MASTER §9.1). While item lines are ticked, the page reads Ready Stock for
 * their Sales Orders and says how many of the ticked lines have a free Unit.
 * One press reserves the suggested Unit for each of those lines through the
 * existing reservation door; the lines with no stock stay ticked to buy.
 *
 * Reading reserves nothing. The suggestion is the shared matcher's
 * (`matchSoBatchReadyStock`): Carres-owned exact Units at Carres Klang, the
 * oldest first, the order that needs its goods soonest first. The door
 * recomputes every requirement on the locked row and refuses by name.
 */
export interface TickedLine {
  /** The demand line the tick is on. */
  demandId: string;
  orderId: string;
  /** The Sales Order item lines that demand line stands for. */
  orderLineIds: readonly string[];
}

const stockUrl = (orderId: string) => `/api/operation/purchase/demands/${encodeURIComponent(orderId)}/ready-stock`;
const readStock = async (orderId: string): Promise<ReadyStockResponse> => {
  const stock = readyStockResponseSchema.parse(await apiFetch<unknown>(stockUrl(orderId)));
  if (stock.orderId !== orderId) throw new Error("invalid_stock_source");
  return stock;
};
/** How many Sales Orders are read at once. */
const READ_AT_ONCE = 5;

/**
 * Reserve exact Units through the existing door, one Sales Order at a time.
 * `onReserved` runs BEFORE each write, so a buying tick on a line the write
 * may answer is gone even when the network loses the response. A lost
 * response is never sent again: the order's own record is read back and must
 * show every Unit held for its line.
 */
export async function reserveReadyUnits(
  queryClient: QueryClient,
  picks: ReadonlyArray<{ orderId: string; itemId: string; orderLineId: string }>,
  onReserved: (orderId: string, orderLineIds: readonly string[]) => void,
): Promise<number> {
  let reserved = 0;
  for (const orderId of [...new Set(picks.map((pick) => pick.orderId))]) {
    const own = picks.filter((pick) => pick.orderId === orderId).map(({ itemId, orderLineId }) => ({ itemId, orderLineId }));
    for (let start = 0; start < own.length; start += 50) {
      const chunk = own.slice(start, start + 50);
      onReserved(orderId, chunk.map((pick) => pick.orderLineId));
      try {
        const result = readyStockReserveResultSchema.parse(await apiFetch<unknown>(
          "/api/operation/purchase/demands/ready-stock/reserve", { method: "POST", body: JSON.stringify({ orderId, picks: chunk }) }));
        if (result.reserved !== chunk.length || !chunk.every((pick) => result.units.some((unit) => unit.itemId === pick.itemId && unit.orderLineId === pick.orderLineId))) {
          throw new Error("reservation_outcome_unknown");
        }
      } catch (cause) {
        if (cause instanceof ApiError && cause.status >= 400 && cause.status < 500) throw cause;
        const current = await readStock(orderId);
        if (!chunk.every((pick) => current.units.some((unit) => unit.itemId === pick.itemId && unit.reservedForLineId === pick.orderLineId))) {
          throw new Error("reservation_outcome_unknown");
        }
      } finally {
        void queryClient.invalidateQueries({ queryKey: ["so-batch-purchase"] });
        void queryClient.invalidateQueries({ queryKey: ["so-batch-ready-stock", orderId] });
        void queryClient.invalidateQueries({ queryKey: ["operation", "orders", orderId, "expansion"] });
      }
      reserved += chunk.length;
    }
  }
  return reserved;
}

export function useTickedReadyStock({ ticked, orderOf, priority = "customer_delivery", onReserved }: {
  ticked: readonly TickedLine[];
  orderOf: (orderId: string) => Pick<SoBatchOrderRow, "requestedDeliveryDate" | "proceededAt"> | undefined;
  priority?: "customer_delivery" | "proceed_date";
  onReserved: (orderId: string, orderLineIds: readonly string[]) => void;
}) {
  const queryClient = useQueryClient();
  const orderIds = useMemo(() => [...new Set(ticked.map((line) => line.orderId))].sort(), [ticked]);
  /* The reads go out a few at a time: ticking every row must not ask for
     sixty Sales Orders in one burst. */
  const [allowed, setAllowed] = useState(READ_AT_ONCE);
  const reads = useQueries({
    queries: orderIds.map((orderId, index) => ({
      queryKey: ["so-batch-ready-stock", orderId],
      staleTime: 15_000,
      enabled: index < allowed,
      queryFn: () => readStock(orderId),
    })),
  });
  const settled = reads.filter((read) => read.status !== "pending").length;
  useEffect(() => {
    if (orderIds.length === 0) { if (allowed !== READ_AT_ONCE) setAllowed(READ_AT_ONCE); return; }
    if (settled >= Math.min(allowed, orderIds.length) && allowed < orderIds.length) setAllowed(allowed + READ_AT_ONCE);
  }, [settled, allowed, orderIds.length]);

  const stamp = reads.map((read) => read.dataUpdatedAt).join();
  const offers = useMemo<SoBatchStockOffer[]>(() => {
    const wanted = new Set(ticked.flatMap((line) => line.orderLineIds));
    const rows = reads.flatMap((read, index) => (read.data ? [{ orderId: orderIds[index]!, stock: read.data }] : []));
    if (rows.length === 0 || wanted.size === 0) return [];
    /* `no_line_needs_it` is about one Sales Order, not about the Unit:
       another ticked order may need the very same Unit. */
    const units = rows.flatMap((row) => row.stock.units.filter((unit) => unit.blocked !== "no_line_needs_it"));
    const klang = units.find((unit) => /klang|klg/i.test(unit.siteName ?? ""));
    const demands = rows.flatMap(({ orderId, stock }) => stock.lines.filter((line) => wanted.has(line.orderLineId)).map((line) => ({
      orderId, orderLineId: line.orderLineId, remainingQty: line.remainingQty,
      requestedDeliveryDate: orderOf(orderId)?.requestedDeliveryDate ?? null, proceededAt: orderOf(orderId)?.proceededAt ?? null,
    })));
    try {
      return matchSoBatchReadyStock(demands, units, klang?.warehouseId
        ? { warehouseId: klang.warehouseId, priority } : { siteName: klang?.siteName ?? "Carres Klang", priority });
    } catch {
      /* Two reads disagree about one Unit: stale evidence is never stock. */
      return [];
    }
  }, [stamp, ticked, orderIds, priority, orderOf]);

  const offeredLines = useMemo(() => new Set(offers.map((offer) => offer.orderLineId)), [offers]);
  /** The ticked demand lines that have a free Unit. */
  const lines = useMemo(() => ticked.filter((line) => line.orderLineIds.some((id) => offeredLines.has(id))).length, [ticked, offeredLines]);

  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function use(): Promise<number | null> {
    if (lock.current || offers.length === 0) return null;
    lock.current = true; setBusy(true); setError(false);
    try {
      return await reserveReadyUnits(queryClient,
        offers.flatMap((offer) => offer.units.map((unit) => ({ orderId: offer.orderId, itemId: unit.itemId, orderLineId: offer.orderLineId }))),
        onReserved);
    } catch { setError(true); return null; }
    finally { lock.current = false; setBusy(false); }
  }
  return { lines, units: offers.reduce((sum, offer) => sum + offer.units.length, 0), busy, error, use, clearError: () => setError(false) };
}
