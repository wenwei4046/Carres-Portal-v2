import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  poReceivingProgress,
  purchasingActionQueue,
  purchasingSupplierCallsOf,
  receivingRecordNo,
  type PoReceivingState,
  type PurchasingOpenCall,
  type SupplierCallPo,
  type WarehouseReceiptRow,
} from "@carres/shared";
import {
  useOperationPos,
  useOperationSuppliers,
  useOperationWarehouse,
  useOperationWarehouseReceipts,
  type operationPoListRow,
  type SupplierRow,
} from "@/lib/queries";
import { fmtDateShort } from "@/lib/fmt-date";
import DataTable, {
  type Column,
  type TableSort,
} from "@/components/kit/DataTable";
import EmptyState from "@/components/kit/EmptyState";
import Icon from "@/components/kit/Icon";
import SearchInput from "@/components/kit/SearchInput";
import WarehouseReceiptsPanel from "./components/WarehouseReceiptsPanel";
import ReceivingWorkspace from "./components/ReceivingWorkspace";
import ReceivingRecord from "./components/ReceivingRecord";
import PurchasingTabs from "./PurchasingTabs";
import { RailGroup, RailItem } from "./components/workspace-rail";

/**
 * OperationReceiving — the Receiving Workspace (Slice B, Jess 2026-08-03).
 *
 * **Copy the Purchase Orders page shell 1:1 — the Purchasing module has ONE
 * Workspace template** (Jess's Purchasing law, 2026-08-01/02). Same header
 * strip, same 200px navigation rail, same kit-DataTable listing, same 400px
 * workspace pane, same scrolling. Only the CONTENT differs:
 *
 *   NAVIGATION (200px)
 *     RECEIVING PROGRESS   the four states this page already computes
 *                          (`poReceivingProgress`) — where the DELIVERY is,
 *                          which is this tab's question. The PO tab's rail
 *                          asks where the SUPPLIER CONVERSATION is; two tabs,
 *                          two questions, and neither borrows the other's.
 *     SUPPLIER             per factory
 *
 *   LISTING (kit DataTable) — for FINDING. Seven columns:
 *     PO Issued · Supplier · PO No. · Items · Goods Arrival · Received ·
 *     Current Action. Default order = PO Issued OLDEST first, the register's
 *     own law: the operator starts at the delivery that has been waiting
 *     longest, never at the biggest number.
 *
 *   WORKSPACE (400px) — ONE PO's Receiving Session work. Read Mode →
 *     Start Receiving → Receiving Mode → Save → Posted. See
 *     `ReceivingWorkspace`.
 *
 * **What this replaces, and why the old door is gone.** Receiving used to be a
 * list whose row opened `ReceivePOModal`. That modal called
 * `operation_receive_po_with_do` directly, so an Office receive produced NO
 * Receiving Session, NO event and no GRN record — measured 2026-08-03: 19 POs,
 * 0 `warehouse_receipts`, 0 `receiving_events`. The Workspace calls
 * `office_receive_post` (0315) instead, which opens the Session, posts it, and
 * writes ONE `posted` event, all through the same validator and the same
 * receive engine. Two doors onto one act is the thing this slice removes.
 *
 * **Receiving Mode takes the stage** rather than opening an overlay: it is the
 * master's own `workspaceOpen` mechanism (a pane that hides the listing when
 * the work needs the room), and a delivery of five lines with three numbers
 * each does not fit in 400px. The rail stays — the operator has not left the
 * queue, they are working inside it.
 *
 * Deliberately NOT here (later slices, not oversights): Warehouse Review's
 * own screen · Amend · Void · a Claims form · session photos beyond the
 * signed DO. `WarehouseReceiptsPanel` (R6) is untouched and still renders
 * above the listing — it costs zero pixels when nothing is waiting.
 */

// design-standard: not-a-list-page — this is the Receiving Workspace (the
// Purchase Orders shell with a Workspace pane); its listing renders through
// the kit DataTable.

/**
 * The tab's TWO queues (Jess, 2026-08-03: `Goods Received` is a Receiving
 * queue, not a sixth Purchasing tab).
 *
 * Gmail's folder list, which is already this shell's master: the rail switches
 * what the listing holds and the pane follows the row you open. `To receive`
 * is the WORK (purchase orders still owing units); `Goods Received` is the
 * RECORD (posted Receiving Sessions, read-only).
 *
 * A STAGE picker in §8.2's terms — one is always selected, because "neither
 * queue" is not a legal view — so a queue row is never hidden at zero. Hiding
 * it would make the register unreachable on the day it is empty, which is
 * every day until the first delivery lands.
 */
type Queue = "to_receive" | "received";

/** The register's time buckets. Newest first — a history is read from now
 *  backwards. `Earlier` is the tail, never a date range nobody typed. */
type ReceivedBucket = "today" | "week" | "month" | "earlier";
const RECEIVED_BUCKETS: { key: ReceivedBucket; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "earlier", label: "Earlier" },
];

/** Which bucket a business date falls in, measured against MYT's today.
 *  Buckets NEST (today is also in this week) — an operator asking "this week"
 *  means the last seven days including today, not "the week minus today". */
export function receivedBucketsOf(iso: string, todayIso: string): ReceivedBucket[] {
  if (!iso) return ["earlier"];
  const day = 86_400_000;
  const diff = Math.floor(
    (Date.parse(`${todayIso}T00:00:00Z`) - Date.parse(`${iso}T00:00:00Z`)) / day,
  );
  if (diff < 0) return ["today"];
  const out: ReceivedBucket[] = [];
  if (diff === 0) out.push("today");
  if (diff < 7) out.push("week");
  if (diff < 31) out.push("month");
  if (out.length === 0) out.push("earlier");
  return out;
}

/** Today in MYT — the app's zone, never the browser's. */
function todayMYT(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
  }).format(new Date());
}

/** The list row → the supplier-call engine's own shape. ONE mapping, so the
 *  rail counts and the Current Action column can never read a PO two ways. */
export function supplierCallPoOf(po: operationPoListRow): SupplierCallPo {
  return {
    poId: po.id,
    supplierId: po.supplier_id,
    status: po.status,
    etaDateIso: po.eta_date,
    tomorrowAnswerAboutDateIso: po.tomorrow_answer_about_date ?? null,
    lines: (po.purchase_order_lines ?? []).map((l) => ({
      id: l.id,
      sku: l.sku,
      qty: Number(l.qty ?? 0),
      receivedQty: Number(l.received_qty ?? 0),
      shortSinceIso: l.short_since ?? null,
      balanceAnswerAboutQty: l.balance_answer_about_qty ?? null,
    })),
  };
}

/**
 * The rail's states, in §8.4's order — danger first. The words are
 * `packages/shared/po-receiving.ts`'s own; nothing is invented here.
 */
const PROGRESS_STATES: {
  state: PoReceivingState;
  label: string;
  danger?: boolean;
  title: string;
}[] = [
  {
    state: "receiving_issue",
    label: "Receiving issue",
    danger: true,
    title:
      "Something arrived damaged or as the wrong item, and the supplier still owes good units.",
  },
  {
    state: "partially_received",
    label: "Partially received",
    title: "Some good units are booked in and the rest are still coming.",
  },
  {
    state: "in_transit",
    label: "In transit",
    title: "Nothing has been counted in against this PO yet.",
  },
  {
    state: "fully_received",
    label: "Fully received",
    title: "Every unit ordered has been counted in — nothing is outstanding.",
  },
];

const PANE_BTN =
  "p-2 rounded text-kit-slate-9 hover:text-kit-slate-12 hover:bg-kit-slate-3";

export default function OperationReceiving() {
  const posQ = useOperationPos();
  const suppliersQ = useOperationSuppliers();
  const warehouseQ = useOperationWarehouse();
  const [params, setParams] = useSearchParams();

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<TableSort | null>(null);
  const [stateSel, setStateSel] = useState<PoReceivingState | null>(null);
  const [supplierSel, setSupplierSel] = useState<string | null>(null);
  // `Goods Received`'s own facets. Held apart from the work queue's, so
  // switching back does not land the operator in a filter they set elsewhere.
  const [bucketSel, setBucketSel] = useState<ReceivedBucket | null>(null);
  const [recSupplierSel, setRecSupplierSel] = useState<string | null>(null);
  const [sourceSel, setSourceSel] = useState<"office" | "warehouse" | null>(null);
  const [workspaceOpen, setWorkspaceOpen] = useState(true);
  /** Receiving Mode. Held HERE, not in the workspace, because it decides the
   *  whole stage: the listing steps aside while a delivery is being counted. */
  const [receiving, setReceiving] = useState(false);

  /** The queue rides the URL so a view is linkable and survives a reload —
   *  the same rule `?po=` already follows. Default is the WORK queue: an
   *  operator opens Receiving to receive, not to read history. */
  const queue: Queue = params.get("queue") === "received" ? "received" : "to_receive";
  const setQueue = (q: Queue) =>
    setParams((prev) => {
      const n = new URLSearchParams(prev);
      if (q === "to_receive") n.delete("queue");
      else n.set("queue", q);
      return n;
    });

  const today = todayMYT();
  const pos = useMemo(() => posQ.data?.pos ?? [], [posQ.data]);

  /**
   * The register. POSTED only, and that is Jess's ruling 1 made structural:
   * `submitted` and `returned` are REVIEW states, and this page must not carry
   * review. A returned count has not entered the books, so it is not a record
   * of goods received. Fetched only while its queue is open.
   *
   * When Void lands, this asks for `posted,voided` — history never deletes.
   */
  const recordsQ = useOperationWarehouseReceipts("posted", {
    enabled: queue === "received",
  });
  const records = useMemo(
    () => (recordsQ.data?.receipts ?? []) as WarehouseReceiptRow[],
    [recordsQ.data],
  );

  const supplierById = useMemo(() => {
    const m = new Map<string, SupplierRow>();
    for (const s of suppliersQ.data?.suppliers ?? []) m.set(s.id, s);
    return m;
  }, [suppliersQ.data]);
  const supplierNameOf = (id: string) => supplierById.get(id)?.name ?? id;

  const warehouseById = useMemo(() => {
    const m = new Map<string, { name: string; owning_partner_id?: string | null }>();
    for (const w of warehouseQ.data?.warehouses ?? [])
      m.set(w.id, { name: w.name, owning_partner_id: w.owning_partner_id });
    return m;
  }, [warehouseQ.data]);

  // GRN scope: goods INTO an OWN warehouse only. LP-owned warehouses (HOUZS
  // Balakong, OHANA) never hit a Klang GRN — goods there are tracked by the
  // order's Stock Location. The filter only activates once an LP-owned
  // warehouse actually exists, so today (one own warehouse, measured) the
  // queue is unchanged.
  const hasLpWarehouse = useMemo(
    () =>
      (warehouseQ.data?.warehouses ?? []).some(
        (w) => w.owning_partner_id != null,
      ),
    [warehouseQ.data],
  );
  const live = useMemo(() => {
    const notCancelled = pos.filter((p) => p.status !== "cancelled");
    return hasLpWarehouse
      ? notCancelled.filter(
          (p) => warehouseById.get(p.warehouse_id)?.owning_partner_id == null,
        )
      : notCancelled;
  }, [pos, hasLpWarehouse, warehouseById]);

  /** Every PO's progress, computed ONCE — the rail counts, the Received
   *  column and the workspace's Summary all read the same object. */
  const progressById = useMemo(() => {
    const m = new Map<string, ReturnType<typeof poReceivingProgress>>();
    for (const p of live) m.set(p.id, poReceivingProgress(p.purchase_order_lines));
    return m;
  }, [live]);

  const callsById = useMemo(() => {
    const m = new Map<string, PurchasingOpenCall[]>();
    for (const p of live)
      m.set(p.id, purchasingSupplierCallsOf(supplierCallPoOf(p), { todayIso: today }));
    return m;
  }, [live, today]);

  const searched = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (s === "") return live;
    return live.filter(
      (p) =>
        p.id.toLowerCase().includes(s) ||
        supplierNameOf(p.supplier_id).toLowerCase().includes(s) ||
        (p.purchase_order_lines ?? []).some((l) =>
          l.sku.toLowerCase().includes(s),
        ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, search, supplierById]);

  const rows = useMemo(() => {
    const base = searched.filter(
      (p) =>
        (stateSel === null || progressById.get(p.id)?.state === stateSel) &&
        (supplierSel === null || p.supplier_id === supplierSel),
    );
    const sorted = [...base];
    if (sort) {
      const dir = sort.dir === "asc" ? 1 : -1;
      const val = (p: operationPoListRow): string => {
        switch (sort.key) {
          case "issued":
            return (p.placed_at ?? "").slice(0, 10);
          case "supplier":
            return supplierNameOf(p.supplier_id);
          case "po":
            return p.id;
          case "items":
            return itemsPreviewOf(p);
          case "arriving":
            return p.eta_date ?? "9999-12-31";
          case "received":
            return String(progressById.get(p.id)?.received ?? 0).padStart(6, "0");
          case "action":
            return actionWordOf(p) ?? "zzz";
          default:
            return "";
        }
      };
      sorted.sort((a, b) => dir * val(a).localeCompare(val(b)));
    } else {
      // PO Issued, OLDEST first — the delivery that has been waiting longest
      // is where the day starts.
      sorted.sort((a, b) => {
        const pa = (a.placed_at ?? "").localeCompare(b.placed_at ?? "");
        return pa !== 0 ? pa : a.id.localeCompare(b.id);
      });
    }
    return sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searched, stateSel, supplierSel, sort, progressById, callsById]);

  /** Rail counts are taken with the OTHER dimension applied, so a visible
   *  number always matches the rows its click produces. */
  const stateCounts = useMemo(() => {
    const m = new Map<PoReceivingState, number>();
    for (const p of searched) {
      if (supplierSel !== null && p.supplier_id !== supplierSel) continue;
      const st = progressById.get(p.id)?.state;
      if (st) m.set(st, (m.get(st) ?? 0) + 1);
    }
    return m;
  }, [searched, supplierSel, progressById]);

  const supplierCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of searched) {
      if (stateSel !== null && progressById.get(p.id)?.state !== stateSel) continue;
      m.set(p.supplier_id, (m.get(p.supplier_id) ?? 0) + 1);
    }
    return [...m.entries()]
      .map(([id, n]) => ({ id, n, name: supplierNameOf(id) }))
      .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searched, stateSel, progressById, supplierById]);

  /** `Cody Q · +2` — identify the PO without opening it. */
  function itemsPreviewOf(p: operationPoListRow): string {
    const ls = p.purchase_order_lines ?? [];
    if (ls.length === 0) return "—";
    const head = ls[0].qty >= 2 ? `${ls[0].sku} ×${ls[0].qty}` : ls[0].sku;
    return ls.length > 1 ? `${head} · +${ls.length - 1}` : head;
  }

  /**
   * The row's Current Action, from the words this module already owns: the
   * engine's open supplier calls first, then `Check in` while the PO still
   * owes units. Counted from QUANTITIES, never from a status word somebody
   * typed (PURCHASING-WORKING-FLOW §9).
   */
  function actionWordOf(p: operationPoListRow): string | null {
    const calls = callsById.get(p.id) ?? [];
    if (calls.length > 0) return purchasingActionQueue(calls[0].key);
    if ((progressById.get(p.id)?.pendingDelivery ?? 0) > 0)
      return purchasingActionQueue("check_in");
    return null;
  }

  // ── Selection: ?po= is the one source; the first row auto-selects. ───────
  const selectedId = params.get("po");
  const selected = useMemo(
    () => live.find((p) => p.id === selectedId) ?? null,
    [live, selectedId],
  );
  useEffect(() => {
    if (queue !== "to_receive") return;
    if (selected || posQ.isLoading || rows.length === 0) return;
    setParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        n.set("po", rows[0].id);
        return n;
      },
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, posQ.isLoading, rows]);

  /** A record's selection rides `?receipt=` — its own key, because a PO and a
   *  Receiving Session are two different documents and one param naming both
   *  would open the wrong thing on a reload. */
  const selectedRecordId = params.get("receipt");
  const selectedRecord = useMemo(
    () => records.find((r) => r.id === selectedRecordId) ?? null,
    [records, selectedRecordId],
  );
  const openRecord = (id: string) =>
    setParams((prev) => {
      const n = new URLSearchParams(prev);
      n.set("receipt", id);
      return n;
    });

  const openPo = (id: string) => {
    // Switching PO while counting would silently throw the count away.
    if (receiving) return;
    setParams((prev) => {
      const n = new URLSearchParams(prev);
      n.set("po", id);
      return n;
    });
  };

  // ── the register: search → facets → rows ─────────────────────────────────
  //
  // The document numbers are SEARCHED, never browsed (Jess's ruling 4): you
  // look a GRN or a PO up, you do not scroll a rail of them. Supplier and the
  // supplier's own DO number ride the same box, because an operator holding a
  // delivery note has that number and nothing else.
  const recordSearched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q === "") return records;
    return records.filter(
      (r) =>
        receivingRecordNo(r).toLowerCase().includes(q) ||
        r.po_id.toLowerCase().includes(q) ||
        (r.supplier_name ?? "").toLowerCase().includes(q) ||
        (r.do_number ?? "").toLowerCase().includes(q),
    );
  }, [records, search]);

  const recordRows = useMemo(() => {
    const base = recordSearched.filter(
      (r) =>
        (bucketSel === null ||
          receivedBucketsOf(r.goods_received_at ?? "", today).includes(bucketSel)) &&
        (recSupplierSel === null || (r.supplier_name ?? "—") === recSupplierSel) &&
        (sourceSel === null || r.submitted_from === sourceSel),
    );
    const sorted = [...base];
    if (sort) {
      const dir = sort.dir === "asc" ? 1 : -1;
      const val = (r: WarehouseReceiptRow): string => {
        switch (sort.key) {
          case "received": return r.goods_received_at ?? "";
          case "grn": return receivingRecordNo(r);
          case "supplier": return r.supplier_name ?? "";
          case "po": return r.po_id;
          case "do": return r.do_number ?? "";
          case "units":
            return String(
              (r.lines ?? []).reduce((a, l) => a + (l.received_now ?? 0), 0),
            ).padStart(6, "0");
          default: return "";
        }
      };
      sorted.sort((a, b) => dir * val(a).localeCompare(val(b)));
    }
    // else: the route already returns newest business date first — a history is
    // read from now backwards, and re-sorting it here would be a second answer.
    return sorted;
  }, [recordSearched, bucketSel, recSupplierSel, sourceSel, sort, today]);

  /** Each facet counted with the OTHER two applied, so a visible number always
   *  matches the rows its click produces. */
  const bucketCounts = useMemo(() => {
    const m = new Map<ReceivedBucket, number>();
    for (const r of recordSearched) {
      if (recSupplierSel !== null && (r.supplier_name ?? "—") !== recSupplierSel) continue;
      if (sourceSel !== null && r.submitted_from !== sourceSel) continue;
      for (const b of receivedBucketsOf(r.goods_received_at ?? "", today))
        m.set(b, (m.get(b) ?? 0) + 1);
    }
    return m;
  }, [recordSearched, recSupplierSel, sourceSel, today]);

  const recordSupplierCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of recordSearched) {
      if (bucketSel !== null &&
          !receivedBucketsOf(r.goods_received_at ?? "", today).includes(bucketSel)) continue;
      if (sourceSel !== null && r.submitted_from !== sourceSel) continue;
      const k = r.supplier_name ?? "—";
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].map(([name, n]) => ({ name, n }))
      .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  }, [recordSearched, bucketSel, sourceSel, today]);

  const sourceCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of recordSearched) {
      if (bucketSel !== null &&
          !receivedBucketsOf(r.goods_received_at ?? "", today).includes(bucketSel)) continue;
      if (recSupplierSel !== null && (r.supplier_name ?? "—") !== recSupplierSel) continue;
      if (r.submitted_from) m.set(r.submitted_from, (m.get(r.submitted_from) ?? 0) + 1);
    }
    return m;
  }, [recordSearched, bucketSel, recSupplierSel, today]);

  /**
   * SIX columns, and no Status (Jess's ruling 3 — the rail already says it,
   * and ruling 1 narrows this list to posted records, so status stops being a
   * concept here at all). `Units` counts UNITS, not product lines: the pane's
   * `Total` is the same number.
   */
  const recordColumns: readonly Column<WarehouseReceiptRow>[] = [
    {
      key: "received", label: "Received", width: "88px", sortable: true,
      cell: (r) => (
        <span className="tabular-nums">
          {r.goods_received_at ? fmtDateShort(r.goods_received_at) : "—"}
        </span>
      ),
    },
    {
      key: "grn", label: "GRN No.", width: "132px", sortable: true,
      cell: (r) => (
        <span className="flex items-center gap-1.5">
          {r.id === params.get("receipt") && (
            <span aria-hidden className="w-0.5 h-4 bg-kit-blue-9 shrink-0" />
          )}
          <span className={r.id === params.get("receipt")
            ? "font-mono font-semibold text-kit-blue-11" : "font-mono"}>
            {receivingRecordNo(r)}
          </span>
        </span>
      ),
    },
    { key: "supplier", label: "Supplier", width: "104px", sortable: true,
      cell: (r) => r.supplier_name ?? "—" },
    { key: "po", label: "PO No.", width: "104px", sortable: true,
      cell: (r) => <span className="font-mono">{r.po_id}</span> },
    { key: "do", label: "Supplier DO No.", width: "132px", sortable: true,
      cell: (r) => <span className="font-mono">{r.do_number ?? "—"}</span> },
    {
      key: "units", label: "Units", width: "auto", align: "right", numeric: true,
      sortable: true,
      cell: (r) => (r.lines ?? []).reduce((a, l) => a + (l.received_now ?? 0), 0),
    },
  ];

  const columns: readonly Column<operationPoListRow>[] = [
    {
      key: "issued",
      label: "PO Issued",
      width: "88px",
      sortable: true,
      cell: (p) => (
        <span className="tabular-nums">
          {fmtDateShort((p.placed_at ?? "").slice(0, 10))}
        </span>
      ),
    },
    {
      key: "supplier",
      label: "Supplier",
      width: workspaceOpen ? "92px" : "104px",
      sortable: true,
      cell: (p) => supplierNameOf(p.supplier_id),
    },
    {
      key: "po",
      label: "PO No.",
      width: "104px",
      sortable: true,
      cell: (p) => (
        <span className="flex items-center gap-1.5">
          {p.id === selectedId && (
            <span aria-hidden className="w-0.5 h-4 bg-kit-blue-9 shrink-0" />
          )}
          <span
            className={
              p.id === selectedId
                ? "font-mono font-semibold text-kit-blue-11"
                : "font-mono"
            }
          >
            {p.id}
          </span>
        </span>
      ),
    },
    {
      key: "items",
      label: "Items",
      width: "150px",
      sortable: true,
      cell: (p) => (
        <span
          className="block truncate"
          title={(p.purchase_order_lines ?? [])
            .map((l) => `${l.sku} ×${l.qty}`)
            .join("\n")}
        >
          {itemsPreviewOf(p)}
        </span>
      ),
    },
    {
      key: "arriving",
      label: "Goods Arrival",
      width: "104px",
      sortable: true,
      cell: (p) =>
        p.eta_date ? (
          <span className="tabular-nums">{fmtDateShort(p.eta_date)}</span>
        ) : (
          <span className="text-kit-slate-9">—</span>
        ),
    },
    {
      key: "received",
      label: "Received",
      width: "72px",
      align: "right",
      numeric: true,
      sortable: true,
      cell: (p) => {
        const pr = progressById.get(p.id);
        return `${pr?.received ?? 0} / ${pr?.ordered ?? 0}`;
      },
    },
    {
      key: "action",
      label: "Current Action",
      width: "auto",
      sortable: true,
      cell: (p) => {
        const w = actionWordOf(p);
        if (!w) return <span className="text-kit-slate-9">—</span>;
        const late = (callsById.get(p.id) ?? []).some((c) => c.late);
        return (
          <span className={late ? "text-kit-red-11" : "text-kit-slate-12"}>
            {w}
          </span>
        );
      },
    },
  ];

  /** Gmail's reading-pane compact set. HONESTY GUARD: a column carrying an
   *  active sort can never be hidden — a sort you cannot see is a lie the
   *  table tells. */
  const COMPACT_KEYS = new Set(["issued", "supplier", "po", "items", "action"]);
  const visibleColumns = workspaceOpen
    ? columns.filter((c) => COMPACT_KEYS.has(c.key) || sort?.key === c.key)
    : columns;

  const filtered = stateSel !== null || supplierSel !== null;

  return (
    <div
      className="h-full min-h-0 flex flex-col bg-kit-canvas"
      data-testid="receiving-workspace-page"
    >
      {/* SHELL LAW: the shell draws the header, pages never do. */}
      <PurchasingTabs
        right={
          <div className="flex items-center gap-2">
            <div className="w-56">
              <SearchInput
                id="receiving-search"
                placeholder="Search"
                pill
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button
              type="button"
              onClick={() => setWorkspaceOpen((o) => !o)}
              aria-pressed={workspaceOpen}
              title={workspaceOpen ? "Hide receiving" : "Show receiving"}
              aria-label={workspaceOpen ? "Hide receiving" : "Show receiving"}
              data-testid="receiving-workspace-toggle"
              className={PANE_BTN}
            >
              <Icon name={workspaceOpen ? "forward" : "back"} size={14} />
            </button>
          </div>
        }
      />

      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* ── NAVIGATION · 200px ─────────────────────────────────────────── */}
        <nav
          className="w-[200px] shrink-0 min-h-0 overflow-y-auto border-r border-kit-slate-5 px-3 py-3 flex flex-col gap-4 bg-white"
          aria-label="Receiving register"
          data-testid="receiving-rail"
        >
          {/* QUEUES — the rail's own word (Orders has used it since §8.4).
              Gmail's folder list: it switches what the listing holds, and the
              pane follows the row you open. Never hidden at zero — it is a
              switch, not a facet, and a hidden switch is an unreachable page. */}
          <RailGroup title="Queues">
            <RailItem
              label="To receive"
              count={rows.length}
              active={queue === "to_receive"}
              onClick={() => setQueue("to_receive")}
              testId="receiving-queue-to-receive"
            />
            <RailItem
              label="Goods Received"
              count={queue === "received" ? recordRows.length : undefined}
              active={queue === "received"}
              title="Every delivery already checked in — a read-only history."
              onClick={() => setQueue("received")}
              testId="receiving-queue-received"
            />
          </RailGroup>

          {queue === "received" && (
            <>
              <RailGroup title="Received">
                <RailItem
                  label="All"
                  active={bucketSel === null}
                  onClick={() => setBucketSel(null)}
                  testId="receiving-rail-bucket-all"
                />
                {RECEIVED_BUCKETS.map((b) => {
                  const n = bucketCounts.get(b.key) ?? 0;
                  if (n === 0) return null;
                  return (
                    <RailItem
                      key={b.key}
                      label={b.label}
                      count={n}
                      active={bucketSel === b.key}
                      onClick={() => setBucketSel(bucketSel === b.key ? null : b.key)}
                      testId={`receiving-rail-bucket-${b.key}`}
                    />
                  );
                })}
              </RailGroup>

              <RailGroup title="Supplier">
                <RailItem
                  label="All"
                  active={recSupplierSel === null}
                  onClick={() => setRecSupplierSel(null)}
                  testId="receiving-rail-rec-supplier-all"
                />
                {recordSupplierCounts.map((s) => (
                  <RailItem
                    key={s.name}
                    label={s.name}
                    count={s.n}
                    active={recSupplierSel === s.name}
                    onClick={() =>
                      setRecSupplierSel(recSupplierSel === s.name ? null : s.name)
                    }
                    testId={`receiving-rail-rec-supplier-${s.name}`}
                  />
                ))}
              </RailGroup>

              {/* SOURCE is secondary (Jess's ruling 4) — last in the rail, and
                  absent until more than one desk has actually filed a record. */}
              {sourceCounts.size > 1 && (
                <RailGroup title="Source">
                  <RailItem
                    label="All"
                    active={sourceSel === null}
                    onClick={() => setSourceSel(null)}
                    testId="receiving-rail-source-all"
                  />
                  {(["office", "warehouse"] as const).map((k) =>
                    (sourceCounts.get(k) ?? 0) > 0 ? (
                      <RailItem
                        key={k}
                        label={k === "office" ? "Office" : "Warehouse"}
                        count={sourceCounts.get(k) ?? 0}
                        active={sourceSel === k}
                        onClick={() => setSourceSel(sourceSel === k ? null : k)}
                        testId={`receiving-rail-source-${k}`}
                      />
                    ) : null,
                  )}
                </RailGroup>
              )}
            </>
          )}

          {queue === "to_receive" && (
          <>
          <RailGroup title="Receiving Progress">
            <RailItem
              label="All"
              active={stateSel === null}
              onClick={() => setStateSel(null)}
              testId="receiving-rail-state-all"
            />
            {PROGRESS_STATES.map((s) => {
              const n = stateCounts.get(s.state) ?? 0;
              if (n === 0) return null;
              return (
                <RailItem
                  key={s.state}
                  label={s.label}
                  count={n}
                  title={s.title}
                  danger={s.danger}
                  active={stateSel === s.state}
                  onClick={() =>
                    setStateSel(stateSel === s.state ? null : s.state)
                  }
                  testId={`receiving-rail-state-${s.state}`}
                />
              );
            })}
          </RailGroup>

          <RailGroup title="Supplier">
            <RailItem
              label="All"
              active={supplierSel === null}
              onClick={() => setSupplierSel(null)}
              testId="receiving-rail-supplier-all"
            />
            {supplierCounts.map((s) => (
              <RailItem
                key={s.id}
                label={s.name}
                count={s.n}
                active={supplierSel === s.id}
                onClick={() =>
                  setSupplierSel(supplierSel === s.id ? null : s.id)
                }
                testId={`receiving-rail-supplier-${s.id}`}
              />
            ))}
          </RailGroup>
          </>
          )}
        </nav>

        {/* ── LISTING — hidden while a delivery is being counted ──────────── */}
        <div
          className={[
            "flex-1 min-w-0 min-h-0 flex-col border-r border-kit-slate-5 bg-white",
            receiving ? "hidden" : "flex",
          ].join(" ")}
          data-testid="receiving-listing"
        >
          {/* R6 — what the warehouse counted and Carres has not checked in
              yet. Renders NOTHING when nothing is waiting, so it costs zero
              permanent pixels. Untouched by this slice. */}
          {queue === "to_receive" && <WarehouseReceiptsPanel />}

          <div className="flex-1 min-h-0 overflow-auto">
            <div className={workspaceOpen ? "" : "min-w-[880px]"}>
              {queue === "received" ? (
                <DataTable<WarehouseReceiptRow>
                  rows={recordRows}
                  columns={recordColumns}
                  rowId={(r) => r.id}
                  onRowOpen={(r) => openRecord(r.id)}
                  sort={sort}
                  onSortChange={setSort}
                  loading={recordsQ.isLoading}
                  label="Goods received"
                  empty={
                    <EmptyState
                      title="Nothing received yet."
                      detail="A record appears here the moment goods are checked in."
                    />
                  }
                />
              ) : (
                <DataTable<operationPoListRow>
                  rows={rows}
                  columns={visibleColumns}
                  rowId={(p) => p.id}
                  onRowOpen={(p) => openPo(p.id)}
                  sort={sort}
                  onSortChange={setSort}
                  loading={posQ.isLoading}
                  label="Receiving"
                  empty={
                    <EmptyState
                      title="No purchase orders."
                      detail="Issue one from To Order."
                    />
                  }
                />
              )}
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-3 px-3 h-10 border-t border-kit-slate-5 text-meta text-kit-slate-11">
            <span>
              {queue === "received"
                ? `${recordRows.length} record${recordRows.length === 1 ? "" : "s"}`
                : `${rows.length} purchase order${rows.length === 1 ? "" : "s"}`}
            </span>
            {filtered && (
              <button
                type="button"
                onClick={() => {
                  setStateSel(null);
                  setSupplierSel(null);
                }}
                data-testid="receiving-clear-filters"
                className="px-2 py-0.5 rounded-full bg-kit-slate-3 text-kit-slate-11 hover:text-kit-slate-12"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        {/* ── WORKSPACE — ONE live PO. Takes the whole stage in Receiving
             Mode: five lines × three numbers do not fit in 400px. ────────── */}
        <main
          className={[
            "min-h-0 overflow-y-auto bg-white",
            receiving ? "flex-1" : workspaceOpen ? "shrink-0 w-[400px]" : "hidden",
          ].join(" ")}
          data-testid="receiving-workspace-pane"
        >
          {queue === "received" ? (
            selectedRecord ? (
              <ReceivingRecord record={selectedRecord} />
            ) : (
              !recordsQ.isLoading &&
              recordRows.length > 0 && (
                <div className="h-full flex items-center justify-center">
                  <EmptyState title="Pick a record to read it." />
                </div>
              )
            )
          ) : selected ? (
            <ReceivingWorkspace
              po={selected}
              supplier={supplierById.get(selected.supplier_id)}
              warehouseName={warehouseById.get(selected.warehouse_id)?.name ?? "—"}
              calls={callsById.get(selected.id) ?? []}
              receiving={receiving}
              onReceiving={setReceiving}
            />
          ) : (
            !posQ.isLoading &&
            live.length === 0 && (
              <div className="h-full flex items-center justify-center">
                <EmptyState title="No purchase orders." />
              </div>
            )
          )}
        </main>
      </div>
    </div>
  );
}

