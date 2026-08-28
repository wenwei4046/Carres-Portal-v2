/**
 * DELIVERY — the one planning and document workspace.
 * `CARD-2026-08-21-delivery-02-work-layout` · `docs/delivery/MASTER.md` §8.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ WHAT THIS PAGE REPLACED, AND WHY THE OLD ONE HAD TO GO
 *
 * The shipped Delivery Work was a three-pane action-card wall: a queue facet, a
 * `Work list / Calendar` switch, a KPI preamble, a Refresh control and a
 * permanent detail pane. It answered *what should somebody be nagged about
 * today*. That is a Work Engine question, and My Work / Team Work already own
 * it — which is precisely why this page could never answer the LOGISTICS
 * question the operator actually sits down with:
 *
 *      "Everything going out on Friday — who is carrying it, and is any of it
 *       missing a date, a partner or its goods?"
 *
 * An action-card wall cannot be scanned by day, cannot be filtered by partner
 * and by date at once, and cannot be read column-by-column. So the page is now
 * what every other planning surface in the portal is: a 200px local rail and
 * ONE expandable register. Nothing was rewritten for taste — the old shape was
 * structurally unable to hold the job.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ THE SHAPE
 *
 * ```
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ Delivery                                             🔔 ❓ ⚙  (50px)      │
 * ├──────────── 200px ──────────────┬────────────────────────────────────────┤
 * │ DELIVERY DATE                   │ Search              Filters  Columns   │
 * │   No confirmed date        88   ├────────────────────────────────────────┤
 * │   Overdue                  1   │ ▸ SO-1322 · customer · dates …         │
 * │   Fri, 21 Aug               2   │   └ Category · Unit ID · Deliver To …  │
 * │ LOGISTICS                       │                                        │
 * │   All · NETS · AL · TEOW …      ├────────────────────────────────────────┤
 * │                                 │ 12 of 91 delivery scopes               │
 * └─────────────────────────────────┴────────────────────────────────────────┘
 * ```
 *
 * ── THE RAIL IS PAGE-OWNED FILTERING, NOT NAVIGATION ────────────────────────
 *
 * The same 200px `RailGroup`/`RailItem` recipe Purchase Orders, Goods Receipts
 * and Purchase Demands already wear (`docs/ui/MASTER.md` — LOCAL RAIL ACTIVE
 * ROW). Both groups are independent toggle sets and they COMBINE: picking
 * `Fri, 21 Aug` and `NETS` asks one question, not two. Each group's counts are
 * computed over the rows the OTHER group has already narrowed, so a count is
 * always "what I will get if I click this" — never a number that disagrees with
 * the listing under it (Architecture Law D).
 *
 * Choices ride the URL (`?date=` · `?logistics=`), so a refresh, a share and
 * the back button all land on the same listing.
 *
 * **Never `Today`, never `Tomorrow`** (owner ruling 2026-08-15) and never
 * `Due` · `Next Action` · `Priority` · `Pending` (COPY-STANDARD): a date says
 * which day it is, and a fact says what is true.
 *
 * ── THE LISTING IS THE ONE REGISTER ENGINE ──────────────────────────────────
 *
 * `components/register/DataGrid` — the same engine, density, search, ▽ column
 * filters, resize/reorder, Columns chooser, horizontal scroll and sticky
 * identity as Sales Orders. This page supplies only what the engine cannot
 * know: the rows, the columns and where a number opens.
 *
 * **This page writes NOTHING.** There is no `New DO`, no `Issue`, no `Release`
 * and no `Approve` — the SYSTEM issues a Delivery Order when a trip's
 * requirements are met (`docs/delivery/MASTER.md` §3), and the one governed
 * manual door lives on the order, not here. `SO No` opens the Sales Order,
 * `DO No` opens the Delivery Order, and those two doors are the only ways out.
 *
 * ── ▸ HAS EXACTLY ONE JOB ───────────────────────────────────────────────────
 *
 * That scope's goods and the physical facts about them: the shared
 * `GoodsMiniTable`, then `Where` · `Who has it` · `Stock ETA`, then the Loan
 * block when a loan is genuinely out. No editable field, no partner selector,
 * no Save — a second write surface means a second set of gates to keep in step,
 * and the first time they diverged an operator would be told something the
 * server refuses.
 */
import { useCallback, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { DeliveryWorkStatusKind, OrderActionTone } from "@carres/shared";
import { fmtDate } from "@/lib/fmt-date";
import StatusPill from "@/components/kit/StatusPill";
import {
  useDeliveryOrdersRegister,
  useDeliveryPartners,
  useDeliveryArrangements,
  useOperationOrders,
  useOrderLoans,
  useSalesOrderExpansion,
  type DeliveryArrangementRow,
} from "@/lib/queries";
import { DataGrid, type DataGridColumn, type DataGridContextMenuItem } from "@/components/register/DataGrid";
import ModuleHeader from "./components/ModuleHeader";
import GoodsMiniTable, { goodsCategoryOf, type GoodsMiniLine } from "./components/GoodsMiniTable";
import { RailGroup, RailItem } from "./components/workspace-rail";
import AssignLogisticsDialog from "./components/AssignLogisticsDialog";

/** The two governed action words on this workspace (COPY-STANDARD). */
const ASSIGN_LOGISTICS = "Assign logistics";
const EDIT_DELIVERY = "Edit Delivery";
import { lineName } from "./sales-order-facts";
import {
  DATE_TO_BE_CONFIRMED_CELL,
  DATE_TO_BE_CONFIRMED_FULL,
} from "./sales-order-guidance";
import { stockEtaOf } from "./OperationOrdersControl";
import {
  buildDateRail,
  buildDeliveryScopeRows,
  buildLogisticsRail,
  matchesDate,
  matchesLogistics,
  scopeFooter,
  DW,
  NO_LOGISTICS_KEY,
  type DeliveryScopeRow,
} from "./delivery-work";

const STORAGE_KEY = "carres.deliveryWork.register.v1";

/** Owner column ruling 2026-08-18, held here too — one status vocabulary. */
/**
 * The OPERATIONAL ladder's tones (owner ruling 2026-08-24). Two rungs are
 * deliberately quiet — waiting on a customer or a warehouse is the normal
 * state of most rows on a planning screen, and painting eighty of them amber
 * would spend the attention colour on "nothing is wrong yet".
 */
const STATUS_TONE: Record<DeliveryWorkStatusKind, OrderActionTone> = {
  waiting_customer_date: "neutral",
  confirmed: "info",
  waiting_warehouse: "neutral",
  ready_for_handover: "info",
  out_for_delivery: "info",
  delivered: "success",
  failed: "warning",
};

/** ⭐ AN ABSENCE IS QUIETER THAN A FACT — owner ruling 2026-08-15. */
function Absent({ children }: { children: string }) {
  return (
    <span className="text-kit-slate-9" data-absence="true">
      {children}
    </span>
  );
}

/** Today, in Carres' own business timezone — never the browser's. */
function businessToday(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return parts;
}

/**
 * ▸ — the scope's goods and the physical facts about them, and nothing else.
 *
 * Its own component because it asks its own two questions per scope (Stock's
 * allocation and the order's loans), and a hook cannot be called conditionally
 * inside a render callback.
 */
function ScopeExpansion({ row }: { row: DeliveryScopeRow }) {
  const expansion = useSalesOrderExpansion(row.orderId);
  const loans = useOrderLoans(row.orderId);
  const lines = row.o.order_lines ?? [];
  const addons = row.o.order_addons ?? [];

  const factsByLine = new Map((expansion.data?.lines ?? []).map((l) => [l.lineId, l]));
  const placeByUnit = new Map((expansion.data?.place ?? []).map((p) => [p.unitCode, p]));

  const miniLines: GoodsMiniLine[] = [
    ...lines.map((line, index): GoodsMiniLine => {
      const fact = factsByLine.get(line.id ?? "");
      return {
        key: line.id ?? `${line.sku}-${index}`,
        testId: `delivery-good-${line.sku}`,
        /* ONE answer for this cell, shared with the Sales Orders register.
           This page's own copy used to stop before `lineClass` and printed
           `Other goods` on all 90 live rows while the register, reading the
           same line, printed `Mattress`. */
        category: goodsCategoryOf(line),
        unitIds: fact?.unitIds ?? [],
        unitAbsence: "Not allocated",
        deliverTo: (fact?.deliverTo ?? []).map((d) =>
          (fact?.deliverTo.length ?? 0) > 1 ? `${d.name} ×${d.qty}` : d.name,
        ),
        deliverToAbsence: expansion.isLoading ? "Loading…" : DW.notRecorded,
        sku: line.sku,
        qty: line.qty,
        item: lineName(line),
        selectable: true,
      };
    }),
    /* A Service moves no goods and allocates no Unit — the dash is the shipped
       ruling for that cell, not an invented word. */
    ...addons.map((addon, index): GoodsMiniLine => ({
      key: `addon-${index}`,
      category: "Service",
      unitIds: [],
      unitAbsence: "—",
      deliverTo: [],
      deliverToAbsence: "—",
      sku: addon.addon_key ?? "",
      qty: addon.qty,
      item: addon.addon_key?.replace(/[_-]+/g, " ") ?? "Add-on",
      selectable: false,
    })),
  ];

  /* WHERE / WHO HAS IT — Stock's record of the Units this scope is allocated.
     Several Units may sit in one place; the fact is printed ONCE per place
     rather than once per Unit, because a column repeating `Carres Klang` six
     times says nothing the first line did not. */
  const places = [...placeByUnit.values()];
  const sites = [...new Set(places.map((p) => p.siteName).filter(Boolean))] as string[];
  const holders = [...new Set(places.map((p) => p.holderName).filter(Boolean))] as string[];
  const eta = stockEtaOf(row.o);

  const openLoans = (loans.data?.loans ?? []).filter((l) => l.status === "on_loan");

  return (
    <div data-testid="delivery-scope-expansion" className="flex flex-col gap-2">
      {miniLines.length === 0 ? (
        <div className="px-2 py-2 text-body text-kit-slate-11">{DW.noGoods}</div>
      ) : (
        <GoodsMiniTable label={`Goods on SO-${row.so}`} lines={miniLines} />
      )}

      {/* The physical facts, read-only. Three owners speak here and none of
          them is Delivery: Stock owns Where and Who has it, Purchasing owns
          the arrival date. The row states them; it never edits them. */}
      <dl
        className="flex flex-wrap gap-x-8 gap-y-1 px-2 text-body"
        data-testid="delivery-scope-facts"
      >
        <div className="flex gap-2">
          <dt className="text-kit-slate-11">{DW.where}</dt>
          <dd>{sites.length ? sites.join(" · ") : <Absent>{DW.notRecorded}</Absent>}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-kit-slate-11">{DW.whoHasIt}</dt>
          <dd>{holders.length ? holders.join(" · ") : <Absent>{DW.notRecorded}</Absent>}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-kit-slate-11">{DW.stockEta}</dt>
          <dd>
            {eta.etaIso ? fmtDate(eta.etaIso) : <Absent>{DW.notRecorded}</Absent>}
          </dd>
        </div>
      </dl>

      {/* ⭐ THE LOAN BLOCK RENDERS ONLY WHEN A LOAN IS ACTUALLY OUT. An empty
          heading over an empty table teaches the operator that the block means
          nothing, and the day a real loan appears they will not read it. */}
      {openLoans.length > 0 && (
        <div className="px-2" data-testid="delivery-scope-loan">
          <div className="mb-1 text-label font-semibold uppercase tracking-wide text-kit-slate-9">
            {DW.itemsToCollect}
          </div>
          <table className="text-left text-body">
            <thead>
              <tr className="text-label font-semibold uppercase text-base-500">
                <th scope="col" className="pr-6">{DW.loanUnit}</th>
                <th scope="col" className="pr-6">{DW.loanItem}</th>
                <th scope="col" className="pr-6">{DW.loanSince}</th>
                <th scope="col">{DW.loanReturnTo}</th>
              </tr>
            </thead>
            <tbody>
              {openLoans.map((loan) => (
                <tr key={loan.id}>
                  <td className="pr-6 font-mono">
                    {loan.item_unit_code ?? <Absent>{DW.notRecorded}</Absent>}
                  </td>
                  <td className="pr-6">
                    {loan.borrowed_label ?? loan.item_sku ?? <Absent>{DW.notRecorded}</Absent>}
                  </td>
                  <td className="pr-6">{fmtDate(loan.loaned_at)}</td>
                  {/* Where the piece owes itself back to: a borrowed piece goes
                      to the supplier we borrowed it from; our own goes home. */}
                  <td>
                    {loan.source === "supplier"
                      ? loan.supplier_name ?? <Absent>{DW.notRecorded}</Absent>
                      : DW.loanReturnWarehouse}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function OperationDelivery() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const ordersQ = useOperationOrders();
  const partnersQ = useDeliveryPartners();
  const docsQ = useDeliveryOrdersRegister();
  /* 0379 — Delivery's OWN records. Read alongside the documents so the row can
     prefer what Delivery wrote over what Sales' door left behind. */
  const arrangementsQ = useDeliveryArrangements();
  const today = businessToday();

  const partners = useMemo(() => partnersQ.data?.partners ?? [], [partnersQ.data]);
  const partnerNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of partners) m.set(p.id, p.name);
    return m;
  }, [partners]);

  const arrangementsByScope = useMemo(() => {
    const m = new Map<string, DeliveryArrangementRow>();
    for (const a of arrangementsQ.data?.arrangements ?? []) m.set(`${a.order_id}#${a.leg}`, a);
    return m;
  }, [arrangementsQ.data]);

  const rows = useMemo(
    () =>
      buildDeliveryScopeRows({
        orders: ordersQ.data?.orders ?? [],
        deliveryOrders: docsQ.data?.deliveryOrders ?? [],
        attempts: docsQ.data?.attempts ?? [],
        handoverEvents: docsQ.data?.handoverEvents ?? [],
        partnerNameById,
        arrangements: arrangementsByScope,
      }),
    [ordersQ.data, docsQ.data, partnerNameById, arrangementsByScope],
  );

  /* ── The two rails, on the URL ─────────────────────────────────────────── */
  const dateSet = useMemo(
    () => new Set((searchParams.get("date") ?? "").split(",").map((s) => s.trim()).filter(Boolean)),
    [searchParams],
  );
  const logisticsSet = useMemo(
    () =>
      new Set(
        (searchParams.get("logistics") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
      ),
    [searchParams],
  );

  const toggle = useCallback(
    (param: "date" | "logistics", key: string) => {
      const current = new Set(
        (searchParams.get(param) ?? "").split(",").map((s) => s.trim()).filter(Boolean),
      );
      if (current.has(key)) current.delete(key);
      else current.add(key);
      const next = new URLSearchParams(searchParams);
      if (current.size === 0) next.delete(param);
      else next.set(param, [...current].join(","));
      setSearchParams(next, { replace: false });
    },
    [searchParams, setSearchParams],
  );

  const clear = useCallback(
    (param: "date" | "logistics") => {
      const next = new URLSearchParams(searchParams);
      next.delete(param);
      setSearchParams(next, { replace: false });
    },
    [searchParams, setSearchParams],
  );

  /* Each rail counts the rows the OTHER rail has already narrowed, so a count
     is always what clicking it will actually produce. */
  const dateRail = useMemo(
    () =>
      buildDateRail(
        rows.filter((r) => matchesLogistics(r, logisticsSet)),
        today,
        (iso) => fmtDate(iso),
        dateSet,
      ),
    [rows, logisticsSet, today, dateSet],
  );
  const logisticsRail = useMemo(
    () =>
      buildLogisticsRail(
        rows.filter((r) => matchesDate(r, dateSet, today)),
        partners,
        logisticsSet,
      ),
    [rows, dateSet, today, partners, logisticsSet],
  );

  const visible = useMemo(
    () => rows.filter((r) => matchesDate(r, dateSet, today) && matchesLogistics(r, logisticsSet)),
    [rows, dateSet, logisticsSet, today],
  );

  /** `SO No` is a door to the Sales Order — the ONLY thing that opens it. */
  const openOrder = useCallback(
    (r: DeliveryScopeRow) => navigate(`/operation/orders/so/${r.orderId}`),
    [navigate],
  );

  /**
   * ⭐ DOUBLE-CLICK OPENS EDIT DELIVERY, NEVER THE SALES ORDER.
   *
   * Owner correction 2026-08-24, caught on production: this page shipped with
   * `onRowDoubleClick={openOrder}`, which sent a logistics operator mid-plan
   * into a commercial document they must not edit. A row on this workspace IS
   * a delivery scope, so opening it opens the delivery.
   */
  const openEditDelivery = useCallback(
    (r: DeliveryScopeRow) =>
      navigate(`/operation/delivery/edit/${r.orderId}${r.leg != null ? `?leg=${r.leg}` : ""}`),
    [navigate],
  );

  /* ── SELECTION ──────────────────────────────────────────────────────────
     The Sales Orders grammar: ☐ · ▸ · SO / Ref …, and the 45px toolbar is
     REPLACED in place when anything is ticked (the engine already does that).
     Selection here scopes a WRITE, which a truth register never does — but
     this is a workspace, and `Assign logistics` is Delivery's own act. */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState<DeliveryScopeRow[] | null>(null);

  const toggleRow = useCallback(
    (key: string) =>
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      }),
    [],
  );
  const toggleAll = useCallback(
    (keys: string[], allSelected: boolean) =>
      setSelected((prev) => {
        const next = new Set(prev);
        for (const k of keys) {
          if (allSelected) next.delete(k);
          else next.add(k);
        }
        return next;
      }),
    [],
  );

  const columns = useMemo<DataGridColumn<DeliveryScopeRow>[]>(
    () => [
      {
        /* THE IDENTITY COLUMN, and the one that pins while the sheet scrolls.
           The SO number is the door; the customer's own reference rides the
           same cell because that is the string a partner and a supplier both
           recognise — never a second column for one identity. A Journey leg
           adds its leg number and its two places, so two rows of one order can
           never be mistaken for a duplicate. */
        key: "so",
        label: "SO / Ref",
        width: 150,
        sortable: true,
        filterType: "numbering",
        chooserGroup: "Document",
        accessor: (r) => (
          <span className="block min-w-0">
            <button
              type="button"
              className="font-mono font-medium text-blue-700 underline-offset-2 hover:underline"
              onClick={(event) => {
                event.stopPropagation();
                openOrder(r);
              }}
            >
              SO-{r.so}
            </button>
            {r.refs.length > 0 ? (
              <span className="ml-1.5 text-kit-slate-11">{r.refs.join(" · ")}</span>
            ) : null}
            {r.leg != null ? (
              <span
                className="block truncate text-label text-kit-slate-11"
                title={r.legRoute ?? undefined}
              >
                Leg {r.leg}
                {r.legRoute ? ` · ${r.legRoute}` : ""}
              </span>
            ) : null}
          </span>
        ),
        searchValue: (r) => `SO-${r.so} ${r.so} ${r.refs.join(" ")}`,
        filterValue: (r) => `SO-${r.so}`,
        exportValue: (r) => `SO-${r.so}${r.refs.length ? ` ${r.refs.join(" ")}` : ""}`,
        sortFn: (a, b) => a.so - b.so || (a.leg ?? 0) - (b.leg ?? 0),
      },
      {
        key: "customer",
        label: "Customer",
        width: 170,
        sortable: true,
        chooserGroup: "Customer",
        accessor: (r) => (
          <span className="block truncate" title={r.customer}>
            {r.customer}
          </span>
        ),
        searchValue: (r) => `${r.customer} ${r.o.customer_phone ?? ""}`,
        filterValue: (r) => r.customer,
      },
      {
        key: "location",
        label: "Delivery Location",
        width: 170,
        sortable: true,
        chooserGroup: "Customer",
        accessor: (r) => (
          <span className="block truncate" title={r.location}>
            {r.location}
          </span>
        ),
        searchValue: (r) => r.location,
        filterValue: (r) => r.location,
      },
      {
        /* Not decoration: a condo with no lift on floor 12 is a different
           delivery from a landed house, and the planner has to see it before
           committing a two-man van. */
        key: "building",
        label: "Building",
        width: 120,
        sortable: true,
        filterType: "enum",
        chooserGroup: "Customer",
        accessor: (r) =>
          r.building === DW.notGiven ? <Absent>{DW.notGiven}</Absent> : r.building,
        searchValue: (r) => r.building,
        filterValue: (r) => r.building,
      },
      {
        /* Sales Orders' promise, in Sales Orders' own word. Delivery reads it
           and may never rewrite it (`docs/orders/MASTER.md`). */
        key: "customer_delivery",
        label: "Requested Delivery Date",
        width: 192,
        sortable: true,
        filterType: "date",
        chooserGroup: "Dates",
        dateValue: (r) => r.customerDeliveryIso,
        /* THE 8 vs THE 3 (owner ruling 2026-08-15): a customer who HAS been
           asked and answered "not yet" is a different fact from one nobody has
           asked, and the portal already owns both words. Neither is amber
           here — this listing states facts and carries no action clause. */
        accessor: (r) =>
          r.customerDeliveryIso ? (
            fmtDate(r.customerDeliveryIso)
          ) : r.customerDateTbd ? (
            <span title={DATE_TO_BE_CONFIRMED_FULL}>
              <Absent>{DATE_TO_BE_CONFIRMED_CELL}</Absent>
            </span>
          ) : (
            <Absent>{DW.noCustomerDate}</Absent>
          ),
        searchValue: (r) => (r.customerDeliveryIso ? fmtDate(r.customerDeliveryIso) : DW.noCustomerDate),
        filterValue: (r) =>
          r.customerDeliveryIso
            ? fmtDate(r.customerDeliveryIso)
            : r.customerDateTbd
              ? DATE_TO_BE_CONFIRMED_CELL
              : DW.noCustomerDate,
        sortFn: (a, b) => (a.customerDeliveryIso ?? "").localeCompare(b.customerDeliveryIso ?? ""),
      },
      {
        /* Delivery's OWN confirmed operational date for this scope — the
           document's when one exists, else the confirmed booking. A carrier's
           provisional date is not confirmed and is not printed here. */
        key: "confirmed_delivery",
        label: "Confirmed Delivery",
        width: 150,
        sortable: true,
        filterType: "date",
        chooserGroup: "Delivery",
        dateValue: (r) => r.confirmedIso,
        accessor: (r) =>
          r.confirmedIso ? fmtDate(r.confirmedIso) : <Absent>{DW.noConfirmedDate}</Absent>,
        searchValue: (r) => (r.confirmedIso ? fmtDate(r.confirmedIso) : DW.noConfirmedDate),
        filterValue: (r) => (r.confirmedIso ? fmtDate(r.confirmedIso) : DW.noConfirmedDate),
        sortFn: (a, b) => (a.confirmedIso ?? "").localeCompare(b.confirmedIso ?? ""),
      },
      {
        key: "confirmed_time",
        label: "Confirmed Time",
        width: 120,
        sortable: true,
        filterType: "enum",
        chooserGroup: "Delivery",
        accessor: (r) => r.confirmedTime ?? <Absent>{DW.noTime}</Absent>,
        searchValue: (r) => r.confirmedTime ?? DW.noTime,
        filterValue: (r) => r.confirmedTime ?? DW.noTime,
      },
      {
        key: "logistics",
        label: "Logistics Partner",
        width: 140,
        sortable: true,
        filterType: "enum",
        chooserGroup: "Delivery",
        accessor: (r) => r.logisticsName ?? <Absent>{DW.noLogistics}</Absent>,
        searchValue: (r) => r.logisticsName ?? DW.noLogistics,
        filterValue: (r) => r.logisticsName ?? DW.noLogistics,
      },
      {
        key: "goods",
        label: "Goods",
        width: 220,
        sortable: true,
        chooserGroup: "Items",
        accessor: (r) => (
          <span className="block truncate" title={r.goods}>
            {r.goods}
          </span>
        ),
        searchValue: (r) => r.goods,
        filterValue: (r) => r.goods,
      },
      {
        key: "do_number",
        label: "DO No",
        width: 150,
        sortable: true,
        filterType: "numbering",
        chooserGroup: "Document",
        accessor: (r) =>
          r.doNumber ? (
            <button
              type="button"
              className="font-mono font-medium text-blue-700 underline-offset-2 hover:underline"
              onClick={(event) => {
                event.stopPropagation();
                navigate(`/operation/delivery-orders/${encodeURIComponent(r.doNumber!)}`);
              }}
            >
              {r.doNumber}
            </button>
          ) : (
            /* The SYSTEM issues the document when the trip's requirements are
               met, so the absence is a stage, not a missing click. */
            <Absent>{DW.noDeliveryOrder}</Absent>
          ),
        searchValue: (r) => r.doNumber ?? DW.noDeliveryOrder,
        filterValue: (r) => r.doNumber ?? DW.noDeliveryOrder,
      },
      {
        key: "delivery_status",
        label: "Delivery Status",
        width: 180,
        sortable: true,
        filterType: "enum",
        chooserGroup: "Delivery",
        /* The ONE shared arithmetic (`deliveryOrderStatusOf`), rendered in the
           register's own two-line grammar: the pill, then an exception's ONE
           reason in the quieter rank. */
        /* ⭐ THE OPERATION'S progress, not the DOCUMENT's (owner ruling
           2026-08-24). It ALWAYS has an answer — a scope with no document is
           `Waiting for customer date` or `Delivery confirmed`, never a blank
           and never `Created`, which is a fact about paper. */
        accessor: (r) => (
          <span className="block min-w-0">
            <StatusPill tone={STATUS_TONE[r.status.kind]}>{r.status.label}</StatusPill>
            {r.status.reasonLabel ? (
              <span className="block truncate text-label font-normal text-base-600">
                {r.status.reasonLabel}
              </span>
            ) : null}
          </span>
        ),
        searchValue: (r) => r.status.label,
        filterValue: (r) => r.status.label,
      },
      {
        /* Off by default. A planner arranging a day phones the customer, and
           the number belongs one click away rather than permanently widening
           the sheet. */
        key: "phone",
        label: "Phone",
        width: 140,
        sortable: true,
        defaultHidden: true,
        chooserGroup: "Customer",
        accessor: (r) => r.o.customer_phone ?? <Absent>{DW.notGiven}</Absent>,
        searchValue: (r) => r.o.customer_phone ?? "",
        filterValue: (r) => r.o.customer_phone ?? DW.notGiven,
      },
      {
        key: "address",
        label: "Delivery address",
        width: 280,
        sortable: true,
        defaultHidden: true,
        chooserGroup: "Customer",
        accessor: (r) => (
          <span className="block truncate" title={r.o.customer_address ?? undefined}>
            {r.o.customer_address ?? <Absent>{DW.notGiven}</Absent>}
          </span>
        ),
        searchValue: (r) => r.o.customer_address ?? "",
        filterValue: (r) => r.o.customer_address ?? DW.notGiven,
      },
    ],
    [navigate, openOrder],
  );

  const contextMenu = useCallback(
    (r: DeliveryScopeRow): DataGridContextMenuItem[] => [
      { label: EDIT_DELIVERY, onClick: () => openEditDelivery(r) },
      { divider: true },
      { label: `Open SO-${r.so}`, onClick: () => openOrder(r) },
      ...(r.doNumber
        ? [
            {
              label: `Open ${r.doNumber}`,
              onClick: () =>
                navigate(`/operation/delivery-orders/${encodeURIComponent(r.doNumber!)}`),
            },
          ]
        : []),
    ],
    [navigate, openOrder, openEditDelivery],
  );

  const isError = ordersQ.isError || docsQ.isError;
  const isLoading = ordersQ.isLoading || docsQ.isLoading;

  return (
    <div className="flex h-full min-h-0 flex-col bg-kit-canvas" data-testid="operation-delivery">
      <ModuleHeader
        testId="delivery-work-destination-header"
        word={DW.page}
        docTitle={DW.docTitle}
        destinationHeader
      />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside
          className="flex w-[200px] min-h-0 shrink-0 flex-col gap-4 overflow-y-auto border-r border-kit-slate-5 bg-white px-3 py-3"
          data-testid="delivery-work-rail"
        >
          <RailGroup title={DW.railDate}>
            {dateRail.map((item) => (
              <RailItem
                key={item.key}
                label={item.label}
                count={item.count}
                active={dateSet.has(item.key)}
                onClick={() => toggle("date", item.key)}
                testId={`delivery-date-${item.key}`}
                title={`${item.count} ${item.count === 1 ? "delivery scope" : "delivery scopes"}`}
              />
            ))}
          </RailGroup>
          <RailGroup title={DW.railLogistics}>
            <RailItem
              label={DW.railAll}
              count={logisticsRail.reduce((n, i) => n + i.count, 0)}
              active={logisticsSet.size === 0}
              onClick={() => clear("logistics")}
              testId="delivery-logistics-all"
            />
            {logisticsRail.map((item) => (
              <RailItem
                key={item.key}
                label={item.label}
                count={item.count}
                active={logisticsSet.has(item.key)}
                onClick={() => toggle("logistics", item.key)}
                testId={`delivery-logistics-${item.key === NO_LOGISTICS_KEY ? "none" : item.key}`}
              />
            ))}
          </RailGroup>
        </aside>

        {/* 8px outer frame gap — REGISTER STATUS FOOTER law, docs/ui/MASTER.md. */}
        <div className="flex min-w-0 flex-1 flex-col p-2" data-testid="delivery-work-listing">
          {isError ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-white">
              <p className="text-body text-kit-slate-12">{DW.loadFailed}</p>
              {((ordersQ.error ?? docsQ.error) as Error | undefined)?.message ? (
                <p className="text-meta text-kit-slate-11">
                  {((ordersQ.error ?? docsQ.error) as Error).message}
                </p>
              ) : null}
              <button
                type="button"
                className="rounded-control border border-kit-slate-6 bg-white px-3 py-1.5 text-meta font-medium text-kit-slate-12 hover:bg-kit-slate-3"
                onClick={() => {
                  void ordersQ.refetch();
                  void docsQ.refetch();
                }}
              >
                {DW.tryAgain}
              </button>
            </div>
          ) : (
            <DataGrid<DeliveryScopeRow>
              appearance="reference"
              rows={visible}
              columns={columns}
              storageKey={STORAGE_KEY}
              rowKey={(r) => r.key}
              exportName={DW.page}
              searchPlaceholder={DW.search}
              isLoading={isLoading}
              emptyMessage={DW.empty}
              groupBanner={false}
              stickyIdentity
              chooserGroupOrder={["Document", "Customer", "Delivery", "Dates", "Items"]}
              /* Owner ruling 2026-08-24 — a row on THIS workspace is a delivery
                 scope, so opening it opens the delivery. */
              onRowDoubleClick={openEditDelivery}
              contextMenu={contextMenu}
              expandTitle={DW.showItems}
              expandable={{ renderExpansion: (r) => <ScopeExpansion row={r} /> }}
              selectable={{
                selectedKeys: selected,
                onToggle: toggleRow,
                onToggleAll: toggleAll,
              }}
              selectionSummary={(n) =>
                n === 1 ? "1 delivery scope selected" : `${n} delivery scopes selected`
              }
              selectionActions={[
                {
                  /* Delivery's own write, valid for ONE scope or many. */
                  label: () => ASSIGN_LOGISTICS,
                  kind: "write",
                  onClick: (rows) => setAssigning(rows as unknown as DeliveryScopeRow[]),
                },
                {
                  /* ⭐ ONE scope only. Edit Delivery opens a single arrangement,
                     so offering it beside three ticked rows invites a click
                     whose only possible answer is a refusal. */
                  label: () => EDIT_DELIVERY,
                  kind: "write",
                  visible: (n) => n === 1,
                  onClick: (rows) => {
                    const row = (rows as unknown as DeliveryScopeRow[])[0];
                    if (row) openEditDelivery(row);
                  },
                },
              ]}
              statusSummary={(filtered) => {
                const line = scopeFooter(filtered.length, rows.length);
                return (
                  <span className="block truncate" title={line}>
                    {line}
                  </span>
                );
              }}
            />
          )}
        </div>
      </div>

      {assigning && assigning.length > 0 && (
        <AssignLogisticsDialog
          scopes={assigning}
          open
          onOpenChange={(next) => {
            if (!next) setAssigning(null);
          }}
          onAssigned={() => {
            /* The picks are spent: leaving them ticked would offer `Assign
               logistics` again over scopes that just took one. */
            setSelected(new Set());
            void ordersQ.refetch();
          }}
        />
      )}
    </div>
  );
}
