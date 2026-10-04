import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { readyStockResponseSchema, readyStockReserveResultSchema, type ReadyStockResponse,
  type SoBatchOrderRow, SO_BATCH_PURCHASE_WORDS as W } from "@carres/shared";
import { matchSoBatchReadyStock } from "@carres/shared/so-batch-stock-match";
import { ApiError, apiFetch } from "@/lib/api";

/** Suggestions are session-only; the existing Sales Order door owns saving. */
export function useWholeRoundReadyStock(onReserved: (orderId: string, lines: readonly string[]) => void,
  priority: "customer_delivery" | "proceed_date" = "customer_delivery") {
  const queryClient = useQueryClient();
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [snapshot, setSnapshot] = useState<Array<{ order: SoBatchOrderRow; stock: ReadyStockResponse }> | null>(null);
  const [location, setLocation] = useState("site:Carres Klang");
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [saved, setSaved] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [unknown, setUnknown] = useState(false);
  const [matchedPriority, setMatchedPriority] = useState(priority);
  // `no_line_needs_it` is relative to one Sales Order, not a physical
  // stock restriction. Another order may legitimately need the same Unit.
  const candidates = (rows: Array<{ stock: ReadyStockResponse }>) => rows.flatMap(row =>
    row.stock.units.filter(unit => unit.blocked !== "no_line_needs_it"));
  const units = useMemo(() => snapshot ? candidates(snapshot) : [], [snapshot]);
  const locations = useMemo(() => [...new Map(units.map(unit => [
    unit.warehouseId ? `warehouse:${unit.warehouseId}` : `site:${unit.siteName ?? ""}`,
    unit.siteName ?? "Not recorded",
  ])).entries()].map(([value, label]) => ({ value, label })), [units]);
  const offers = useMemo(() => {
    if (!snapshot) return [];
    const demands = snapshot.flatMap(({ order, stock }) => stock.lines.map(line => ({
      orderId: order.orderId, orderLineId: line.orderLineId, remainingQty: line.remainingQty,
      requestedDeliveryDate: order.requestedDeliveryDate, proceededAt: order.proceededAt,
    })));
    return matchSoBatchReadyStock(demands, units, location.startsWith("warehouse:")
      ? { warehouseId: location.slice(10), priority: matchedPriority } : { siteName: location.slice(5), priority: matchedPriority })
      .map(offer => ({ ...offer, units: offer.units.filter(unit => !saved.has(unit.itemId)) }))
      .filter(offer => offer.units.length > 0);
  }, [snapshot, units, location, saved, matchedPriority]);

  async function match(orders: readonly SoBatchOrderRow[]) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null); setSnapshot(null); setChosen(new Set()); setSaved(new Set()); setUnknown(false);
    try {
      const rows: Array<{ order: SoBatchOrderRow; stock: ReadyStockResponse }> = [];
      // Bound concurrent source reads. Any unreadable order refuses the complete
      // match, rather than allocating its Units to a later customer's order.
      for (let start = 0; start < orders.length; start += 5) {
        rows.push(...await Promise.all(orders.slice(start, start + 5).map(async order => {
          const stock = readyStockResponseSchema.parse(await apiFetch<unknown>(
            `/api/operation/purchase/demands/${encodeURIComponent(order.orderId)}/ready-stock`));
          if (stock.orderId !== order.orderId) throw new Error("invalid_stock_source");
          return { order, stock };
        })));
      }
      const klang = rows.flatMap(row => row.stock.units).find(unit => /klang|klg/i.test(unit.siteName ?? ""));
      const defaultLocation = klang?.warehouseId ? `warehouse:${klang.warehouseId}` : `site:${klang?.siteName ?? "Carres Klang"}`;
      // Validate repeated Unit facts before exposing a successful suggestion.
      matchSoBatchReadyStock(rows.flatMap(({ order, stock }) => stock.lines.map(line => ({
        orderId: order.orderId, orderLineId: line.orderLineId, remainingQty: line.remainingQty,
        requestedDeliveryDate: order.requestedDeliveryDate, proceededAt: order.proceededAt,
      }))), candidates(rows), defaultLocation.startsWith("warehouse:")
        ? { warehouseId: defaultLocation.slice(10), priority } : { siteName: defaultLocation.slice(5), priority });
      setMatchedPriority(priority); setLocation(defaultLocation); setSnapshot(rows);
    } catch { setError(W.readyStockFailed); }
    finally { lock.current = false; setBusy(false); }
  }

  async function proceed(visibleOrderIds: ReadonlySet<string>) {
    if (lock.current || unknown) return;
    const selected = offers.filter(offer => visibleOrderIds.has(offer.orderId)).flatMap(offer =>
      offer.units.filter(unit => chosen.has(unit.itemId)).map(unit => ({ orderId: offer.orderId, itemId: unit.itemId, orderLineId: offer.orderLineId })));
    if (!selected.length) return;
    lock.current = true; setBusy(true); setError(null);
    try {
      for (const orderId of [...new Set(selected.map(pick => pick.orderId))]) {
        const picks = selected.filter(pick => pick.orderId === orderId).map(({ itemId, orderLineId }) => ({ itemId, orderLineId }));
        for (let start = 0; start < picks.length; start += 50) {
          const chunk = picks.slice(start, start + 50);
          // Drop buying arrangements before a write can change the canonical
          // remainder, including when the network loses its response.
          onReserved(orderId, chunk.map(pick => pick.orderLineId));
          try {
            const result = readyStockReserveResultSchema.parse(await apiFetch<unknown>(
              "/api/operation/purchase/demands/ready-stock/reserve", {
                method: "POST", body: JSON.stringify({ orderId, picks: chunk }),
              }));
            if (result.reserved !== chunk.length || !chunk.every(pick => result.units.some(unit => unit.itemId === pick.itemId && unit.orderLineId === pick.orderLineId))) {
              throw new Error("reservation_outcome_unknown");
            }
          } catch (cause) {
            if (cause instanceof ApiError && cause.status >= 400 && cause.status < 500) throw cause;
            setUnknown(true);
            // Recover exact reservations; never resubmit a lost response.
            const current = readyStockResponseSchema.parse(await apiFetch<unknown>(
              `/api/operation/purchase/demands/${encodeURIComponent(orderId)}/ready-stock`));
            if (current.orderId !== orderId || !chunk.every(pick => current.units.some(unit => unit.itemId === pick.itemId && unit.reservedForLineId === pick.orderLineId))) {
              setUnknown(true); throw new Error("reservation_outcome_unknown");
            }
            setUnknown(false);
          } finally {
            void queryClient.invalidateQueries({ queryKey: ["so-batch-purchase"] });
            void queryClient.invalidateQueries({ queryKey: ["so-batch-ready-stock", orderId] });
            void queryClient.invalidateQueries({ queryKey: ["operation", "orders", orderId, "expansion"] });
          }
          const ids = new Set(chunk.map(pick => pick.itemId));
          setSaved(previous => new Set([...previous, ...ids]));
          setChosen(previous => new Set([...previous].filter(id => !ids.has(id))));
        }
      }
    } catch { setError("Not confirmed · Try again"); }
    finally { lock.current = false; setBusy(false); }
  }
  return { busy, active: snapshot != null, offers, chosen, error, unknown, locations, location,
    match, proceed, setLocation: (next: string) => { if (!busy) { setLocation(next); setChosen(new Set()); } },
    toggle: (ids: readonly string[], checked: boolean) => { if (!busy) setChosen(previous => {
      const next = new Set(previous); for (const id of ids) { if (checked) next.add(id); else next.delete(id); } return next;
    }); },
    clear: () => { if (!busy) { setSnapshot(null); setChosen(new Set()); setError(null); setUnknown(false); } },
  };
}
