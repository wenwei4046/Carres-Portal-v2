/**
 * SalesOrderWorkspace — the Sales Order object page. Commercial changes leave
 * through Amendment, never this form.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ ONE PAGE, ONE STATE — owner ruling 2026-08-15
 *
 * ```
 * ┌───────────────── 50% ─────────────────┬────────────── 50% ──────────────┐
 * │ CUSTOMER                              │                                 │
 * │ ORDER INFO                            │      the REAL Sales Order       │
 * │ AMEND DELIVERY DATE                   │      document — the SAME        │
 * │ EMERGENCY CONTACT                     │      template Print renders,    │
 * │ DELIVERY ADDRESS                      │      never a lookalike          │
 * │ MONEY · SALES OWNERSHIP · GOODS       │                                 │
 * ├───────────────────────────────────────┤                                 │
 * │ ⚠ 3 changes            Discard  Save  │  (only when something changed)  │
 * └───────────────────────────────────────┴─────────────────────────────────┘
 * ```
 *
 * **The `?edit=1` page is retired.** There was no reading state and no editing
 * state — there was one document with fields in it, and a mode switch in front
 * of it that made the operator ask permission to fix a phone number. Fields are
 * always editable in place; the dark bar appears only when something changed.
 *
 * **THE PREVIEW IS THE DOCUMENT.** Whatever the left side holds — the saved
 * order, the 300ms-debounced draft, or an old revision's snapshot — becomes ONE
 * `SalesOrderTemplateData`, ONE `renderSalesOrderPdf` blob. pdf.js paints those
 * bytes (VIEWER ONLY — never a second renderer) and Print opens the SAME blob.
 * The previous blob URL is revoked on every render.
 *
 * **A PROPOSAL IS NOT A DOCUMENT.** A submitted, not-yet-approved amendment
 * never enters the paper: the preview always renders the current effective
 * Revision and the proposal shows as a banner strip above it. A customer must
 * not be handed a document stating something nobody has agreed to.
 *
 * **THE FORM IS THE SALES PORTAL'S FORM.** Every question the portal asks is
 * here, rendered from the SAME `order_entry_config` contract the POS renders
 * from (0219) and the same shared choice lists — so the two surfaces cannot
 * drift into two different forms for one record. Goods, price and
 * `Requested Delivery Date` are the exception, and they are the whole point: those
 * are what the customer agreed to, so they leave through the amendment lane.
 */
// design-standard: not-a-list-page — this is a DOCUMENT workspace. Its
// tables are the order's own line block: fixed rows, no sort, no selection.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./purchase-orders/purchase-order-detail.css";
import "./sales-order-detail-theme.css";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import * as pdfjs from "pdfjs-dist";
import { paintPdfPages } from "@/lib/pdf/paint";
import { toast } from "sonner";
import {
  BUILDING_TYPE_OPTIONS,
  classifySalesOrderChange,
  INSTALMENT_MONTHS,
  isLivePayment,
  SALES_ORDER_EDIT_HEADER_KEYS,
  salesOrderCommitWord,
  STAIR_CARRY_ADDON_KEY,
  SERVER_EXCLUSIVE_ADDON_KEYS,
  type SalesOrderChangeSide,
  composeEmergencyContact,
  CUSTOMER_GENDER_OPTIONS,
  CUSTOMER_RACE_OPTIONS,
  fmtMoney,
  EMERGENCY_RELATIONSHIPS,
  LIFT_OPTIONS,
  lineClass,
  MAX_DELIVERY_FLOOR,
  maxLeadDaysFor,
  minDeliveryDateISO,
  orderMoney,
  parseEmergencyContact,
  resolveFormTab,
  resolveSalesOrderRoute,
  salesOrderNumberWord,
  salesOrderParamOf,
  mytDayOf,
  PLANNED_PRODUCTION_START_REFUSALS,
  type CustomField,
  type OrderEntryTab,
  type SalesOrderRouteMap as SalesOrderRouteModel,
} from "@carres/shared";
import { getCities, getPostcodes, MY_STATES } from "@/data/malaysia-postcodes";
import FieldFrame from "@/components/kit/FieldFrame";
import { CONTROL_BASE, CONTROL_BORDER } from "@/components/kit/field-recipe";
import { addonSizeOptions, disposalUnitSizes } from "../dealer/new-order/draft";
import { offerableAddons } from "../dealer/pos/AddonsPanel";
import Loading from "@/components/kit/Loading";
import { serviceCodeWord } from "@/lib/service-code";
import { apiFetch, ApiError } from "@/lib/api";
import { composeAddress } from "@/data/malaysia-postcodes";
import { appTodayIso, fmtDate } from "@/lib/fmt-date";
import { floorSurchargeRaw, stairCarryCount } from "@/lib/order-totals";
import { displayCustomerName } from "@/lib/customer-name";
import { renderSalesOrderPdf } from "@/lib/pdf/render";
import type { SalesOrderTemplateData } from "@/lib/pdf/types";
import {
  useCatalog,
  useCustomerTypeProbe,
  useSalesOrderRegisterSearchCount,
  useOperationDealersRef,
  useOperationOrder,
  useWorkspaceDuties,
  useOrderEntryConfig,
  useOrderCorrectionWork,
  useOrderServiceCases,
  useOutlets,
  useSalesOrderAmendment,
  useSalesOrderRevisions,
  useSalesOrderExpansion,
  useCollectionOwner,
  useLogisticsCardFacts,
  useSalesOrderRouteFacts,
  useSalesOrderIdByNumber,
  useSalespersons,
  useDecideSalesOrderAmendment,
  useOrderPayments,
  useRecordAmendmentAgreement,
  useIssuedSalesOrderDocument,
  storeIssuedSalesOrderDocument,
  useSubmitSalesOrderChanges,
  useWithdrawSalesOrderAmendment,
  type SalesOrderRevisionRow,
  type SalesOrderSnapshot,
} from "@/lib/queries";
import { routeActionOwnersOf } from "./workspace-duty-owner";
import CancelSalesOrderDialog from "./CancelSalesOrderDialog";
import ServiceCaseWizard from "./components/ServiceCaseWizard";
import CorrectionWorkList from "./CorrectionWorkList";
import type { RecordedAgreement } from "./customer-agreement";
import { configWords, diffRows, serviceSizeDraft, resizeService, sizeServiceUnit, NOT_IN_CATALOG, type EditAddon, type EditLine } from "./sales-order-change";
import { useAuth } from "@/lib/auth";
import SalesOrderAttribution, { useCanChangeSalesOwnership } from "./SalesOrderAttribution";
import SalesOrderLedger, { type HistoryEvent } from "./SalesOrderLedger";
import SalesOrderReadFailure from "./SalesOrderReadFailure";
import { RouteLoadingFrame, type RouteRetryOwner } from "./SalesOrderRoute";
import { salesOrderRouteInputOf, type RouteOrderDetail } from "./sales-order-route-input";
import MIcon from "@/components/carres/MIcon";
import { atSalePaymentWord, viewSlip } from "@/lib/payment-display";
import { useShellTasks } from "./components/ShellTasks";
import { AgreementForm } from "./customer-agreement";
import { ChangeReview, WaitingAmendment, WithdrawForm } from "./so-detail/AmendmentPanels";
import SoHeader from "./so-detail/SoHeader";
import SoOrderRoute from "./so-detail/SoOrderRoute";
import SoTimeline, { timelineEntriesOf } from "./so-detail/SoTimeline";
import {
  Card, CardTitle, CBtn, CDate, CIconBtn, CInput, CSelect, Dialog, Drawer, KvRow, PillTabs,
  factOf, NOT_RECORDED, type MenuItem, type Person,
} from "./so-detail/ui";
import { lineName } from "./sales-order-facts";

/* pdf.js worker ships inside the package — nothing fetched from a CDN. */
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

/* ─────────────────────────────────────────────────────────────────────────────
 * The draft — ONE shape for the OBJECT form and CREATE (the same slots).
 * ──────────────────────────────────────────────────────────────────────────── */
interface DraftLine {
  key: string;
  id?: string;
  sku: string;
  qty: number;
  unit_price: number;
  /** The line's CONFIGURATION — sofa fabric, bedframe colour/gap, the cascade
   *  payload Create-PO reads. Carried so a COPY does not strip it (0374). */
  attrs?: Record<string, unknown>;
  /** 0562 — struck through in the whole-page edit; leaves only when the change takes effect. */
  removed?: boolean;
  /** 0562 — added in this edit, not yet on the order. */
  added?: boolean;
}
/** 0562 — a service row in the whole-page edit. */
interface DraftAddon {
  key: string;
  id?: string;
  addon_key: string;
  qty: number;
  unit_price: number;
  attrs?: Record<string, unknown> | null;
  removed?: boolean;
  added?: boolean;
}
interface Draft {
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  customer_race: string;
  customer_gender: string;
  customer_birthday: string | null;
  /** The legacy composed address. Kept verbatim when the structured parts are
   *  empty (an AutoCount import has only this), recomposed from them when they
   *  are not — the document prints THIS column. */
  customer_address: string;
  customer_address_line1: string;
  customer_address_line2: string;
  customer_address_city: string;
  customer_address_state: string;
  customer_address_postcode: string;
  customer_address_unknown: boolean;
  building_type: string;
  /** THREE validated fields over the one `customer_emergency` column. */
  emergency_name: string;
  emergency_phone: string;
  emergency_relationship: string;
  customer_billing: string;
  customer_billing_same: boolean;
  dealer_id: string | null;
  outlet_id: string | null;
  salesperson_id: string | null;
  delivery_date: string | null;
  delivery_date_tbd: boolean;
  proceed_date: string | null;
  delivery_floor: number;
  delivery_has_lift: boolean;
  delivery_stair_items: number | null;
  /** 0219 — the operator's own configured fields, keyed by config key. */
  custom: Record<string, string>;
  lines: DraftLine[];
  /** 0562 — services and the instalment plan ride the one draft too. */
  addons: DraftAddon[];
  installment_months: number | null;
}

let draftKeySeq = 0;
const nextKey = () => `dl-${++draftKeySeq}`;

const EMPTY_DRAFT: Draft = {
  customer_name: "",
  customer_phone: "",
  customer_email: "",
  customer_race: "",
  customer_gender: "",
  customer_birthday: null,
  customer_address: "",
  customer_address_line1: "",
  customer_address_line2: "",
  customer_address_city: "",
  customer_address_state: "",
  customer_address_postcode: "",
  customer_address_unknown: false,
  building_type: "",
  emergency_name: "",
  emergency_phone: "",
  emergency_relationship: "",
  customer_billing: "",
  customer_billing_same: true,
  dealer_id: null,
  outlet_id: null,
  salesperson_id: null,
  delivery_date: null,
  delivery_date_tbd: false,
  proceed_date: null,
  delivery_floor: 1,
  delivery_has_lift: false,
  delivery_stair_items: null,
  custom: {},
  lines: [{ key: nextKey(), sku: "", qty: 1, unit_price: 0 }],
  addons: [],
  installment_months: null,
};

/** The one place the three emergency fields become the one stored string. */
const emergencyString = (d: Draft) =>
  composeEmergencyContact({
    name: d.emergency_name,
    phone: d.emergency_phone,
    relationship: d.emergency_relationship,
  });

/**
 * The address the DOCUMENT prints.
 *
 * The structured MY parts are the editable truth; `customer_address` is the one
 * text column every downstream reader (the SO PDF, the DO, the drawer) already
 * prints. Composing here is what makes the preview and the paper agree — before
 * this the parts were editable while the printed string stayed on whatever was
 * imported. A row with no structured parts keeps its imported string untouched.
 *
 * **A CLEAR HAPPENS ONLY WHEN SOMEBODY CLEARS IT.** `Address not given yet`
 * empties the column when the operator TICKS it; an order that arrived already
 * ticked and carrying an imported string keeps that string, so a save that only
 * fixed a phone number cannot wipe an address nobody looked at. Both the
 * preview and the payload read this one function, so they can never disagree.
 */
const addressString = (d: Draft, was: Draft): string => {
  if (d.customer_address_unknown) return was.customer_address_unknown ? was.customer_address : "";
  const parts = [d.customer_address_line1, d.customer_address_city, d.customer_address_state]
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return d.customer_address;
  return composeAddress({
    line1: d.customer_address_line1,
    line2: d.customer_address_line2,
    state: d.customer_address_state,
    city: d.customer_address_city,
    postcode: d.customer_address_postcode,
  });
};

/** The billing address, under the same rule: ticking `same as delivery` clears
 *  the column, an order that was ALREADY ticked keeps whatever it stored. */
const billingString = (d: Draft, was: Draft): string => {
  if (!d.customer_billing_same) return d.customer_billing;
  return was.customer_billing_same ? was.customer_billing : "";
};

/* ─────────────────────────────────────────────────────────────────────────────
 * ONE PDF pipeline — data in, canvases + printable blob out. pdf.js is a
 * viewer only; Print opens the SAME blob the pane shows.
 * ──────────────────────────────────────────────────────────────────────────── */
/** The width a pane can actually give a page: its box, less its own padding.
 *  EXPORTED so the padding subtraction — which IS the clipping bug — can be
 *  asserted without a browser. */
export function contentWidthOf(node: HTMLElement): number {
  const cs = getComputedStyle(node);
  const pad = parseFloat(cs.paddingLeft || "0") + parseFloat(cs.paddingRight || "0");
  return Math.max(0, Math.round(node.clientWidth - pad));
}

/** A sales order below this is unreadable; it scrolls in the pane instead. */
const MIN_PDF_WIDTH = 320;

function usePdfCanvases(data: SalesOrderTemplateData | null) {
  const [pdfError, setPdfError] = useState<string | null>(null);
  const paneRef = useRef<HTMLDivElement | null>(null);
  /* The pane unmounts whenever the object opens Revisions / History / Order
     Route. Coming back, `data` has not changed — so without this the operator
     returned to an empty sheet of paper. */
  const [paneEpoch, setPaneEpoch] = useState(0);
  /* ⭐ THE PAPER IS RE-CUT WHEN THE PANE CHANGES WIDTH (2026-09-11).
     The canvases were sized ONCE, from `pane.clientWidth` at render time, and
     the effect depended only on `[data, paneEpoch]`. So every later width
     change left the old bitmap in place: drag the window narrower, or open a
     side panel beside the document, and a page rendered for a wider pane hung
     over its container and was CLIPPED. Nothing redrew it, because nothing was
     watching. A `ResizeObserver` is what was missing — the width joins the
     effect's dependencies, so the paper is re-cut exactly when the paper's
     container changes and at no other time. */
  const [paneWidth, setPaneWidth] = useState(0);
  const roRef = useRef<(() => void) | null>(null);
  const setPane = useCallback((node: HTMLDivElement | null) => {
    paneRef.current = node;
    roRef.current?.();
    roRef.current = null;
    if (!node) return;
    setPaneEpoch((n) => n + 1);
    setPaneWidth(contentWidthOf(node));
    /* Coalesced on a TIMER, deliberately not `requestAnimationFrame`. A drag
       fires this dozens of times a second and a PDF render per frame would
       make the drag itself the slow thing — but rAF does not run in a hidden
       or background tab, so a width change that happened while the tab was
       away would never be applied, and the operator would come back to a page
       cut for the old width. That is the original bug returning through a
       different door. A timeout fires either way. (Measured: in a hidden tab
       `requestAnimationFrame` never ran and `ResizeObserver` never delivered —
       so the redraw must not depend on the frame loop to be CORRECT, only to
       be smooth.) */
    let timer: ReturnType<typeof setTimeout> | undefined;
    /* A renderer without `ResizeObserver` (jsdom, or any non-DOM host) still
       gets a correctly sized first cut from the measurement above; it simply
       does not get the re-cut. Degrade, never abort — a missing observer must
       not take the document down with it. */
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => setPaneWidth(contentWidthOf(node)), 120);
    });
    ro.observe(node);
    roRef.current = () => {
      clearTimeout(timer);
      ro.disconnect();
    };
  }, []);
  useEffect(() => () => roRef.current?.(), []);
  useEffect(() => {
    let cancelled = false;
    let loading: pdfjs.PDFDocumentLoadingTask | undefined;
    let renderTask: pdfjs.RenderTask | undefined;
    if (!data) {
      paneRef.current?.replaceChildren();
      return;
    }
    (async () => {
      try {
        const blob = await renderSalesOrderPdf(data);
        if (cancelled) return;
        setPdfError(null);
        const bytes = await blob.arrayBuffer();
        if (cancelled) return;
        loading = pdfjs.getDocument({ data: bytes });
        const doc = await loading.promise;
        if (cancelled) return;
        const pane = paneRef.current;
        if (!pane) return;
        pane.replaceChildren();
        /* The CONTENT box, not the padding box. `clientWidth` includes the
           pane's own horizontal padding, so scaling to it drew every page
           wider than the space it had to sit in — the original clipping, and
           it was there at every width, not only narrow ones. */
        const width = Math.max(contentWidthOf(pane), MIN_PDF_WIDTH);
        await paintPdfPages(doc, pane, width, () => cancelled, (task) => { renderTask = task; });
      } catch (e) {
        if (!cancelled) setPdfError(e instanceof ApiError ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
      renderTask?.cancel();
      void loading?.destroy().catch(() => {});
    };
  }, [data, paneEpoch, paneWidth]);
  /* No blob URL is minted here any more. The PANE paints bytes; PRINT owns its
     own blob, built from the SAVED data — one template, one call path, two
     purposes that must not share a handle. */
  return { pdfError, setPane };
}

/** 300ms debounce for the LIVE draft preview (the card's own number). */
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Template-data builders — the ONE arithmetic feeding the ONE renderer.
 * ──────────────────────────────────────────────────────────────────────────── */
type Refs = {
  salespersonName: (id: string | null) => string | null;
  outletName: (id: string | null) => string | null;
  outletAddress: (id: string | null) => string | null;
  dealerName: (id: string | null) => string | null;
};

function draftTemplateData(
  draft: Draft,
  baseline: Draft,
  base: SalesOrderTemplateData | null,
  refs: Refs,
  /** The quoted stair carry, or 0. See the addon note below. */
  stairFee = 0,
  addonLabel: (key: string) => string = (key) => key,
  addonCode: (key: string) => string = (key) => key,
): SalesOrderTemplateData {
  const baseBySku = new Map((base?.lines ?? []).map((l) => [l.sku, l]));
  const lines = draft.lines
    .filter((l) => l.sku.trim().length > 0 && !l.removed)
    .map((l) => {
      const known = baseBySku.get(l.sku.trim());
      return {
        sku: l.sku.trim(),
        description: known?.description ?? l.sku.trim(),
        qty: l.qty,
        unit_price: l.unit_price,
        line_total: l.qty * l.unit_price,
        attrs: known?.attrs ?? null,
        category: known?.category ?? null,
      };
    });
  /* ⭐ THE DRAFT PAPER CARRIES THE CARRY (YH, 2026-08-28, from the screen).
     `0393` makes stair carry a real `STAIR_CARRY` addon row, so a SAVED order's
     document prints it and totals it like any other addon. A DRAFT has no such
     row yet — it does not exist until the order does — so the preview printed
     `BALANCE DUE RM 1,490` beside a MONEY card reading `RM 1,540`. One screen,
     two numbers, which is the whole defect this page keeps being audited for.

     Synthesised as an ADDON rather than folded into the subtotal, because the
     paper is what the customer signs: a charge they are asked to agree to has
     to be a line they can read, not a silent difference between two totals.
     Key and label are the seeded row's own (`0393`), and `Stair carry` is
     governed at COPY-STANDARD:1519 — two words, no hyphen.

     Only in the draft: once saved, `base.addons` carries the real row and
     adding this too would print the charge twice. */
  /* 0562 — services edited in the whole-page draft show on the draft paper;
     an untouched service list keeps the server's own labelled rows. */
  const servicesEdited =
    Boolean(base) &&
    JSON.stringify(draft.addons.map(({ key: _k, ...a }) => a)) !==
      JSON.stringify(baseline.addons.map(({ key: _k, ...a }) => a));
  const addons = servicesEdited
    ? draft.addons
        .filter((a) => !a.removed)
        .map((a) => ({
          label: addonLabel(a.addon_key),
          sku: addonCode(a.addon_key),
          qty: a.qty,
          unit_price: a.unit_price,
          line_total: a.qty * a.unit_price,
          attrs: a.attrs ?? null,
        }))
    : base?.addons ??
    (stairFee > 0
      ? [
          {
            label: "Stair carry",
            sku: STAIR_CARRY_ADDON_KEY,
            qty: 1,
            unit_price: stairFee,
            line_total: stairFee,
            attrs: null,
          },
        ]
      : []);
  const subtotal =
    lines.reduce((s, l) => s + l.line_total, 0) + addons.reduce((s, a) => s + a.line_total, 0);
  const paid = base?.paid ?? 0;
  const spName = refs.salespersonName(draft.salesperson_id) ?? base?.dealer.salesperson_name ?? null;
  const outName = refs.outletName(draft.outlet_id) ?? base?.dealer.outlet_name ?? null;
  const outAddr = refs.outletAddress(draft.outlet_id) ?? base?.dealer.outlet_address ?? null;
  return {
    /* An unsaved draft has NO number — never invent one (Golden rule). */
    so_number: base?.so_number ?? "DRAFT",
    /* The family template prints `Ordered` from issue_date. */
    issue_date: base?.issue_date ?? appTodayIso(),
    proceed_date: draft.proceed_date,
    order_id: base?.order_id ?? "draft",
    order_code: base?.order_code ?? "DRAFT",
    status_label: base?.status_label ?? "Draft",
    channel: draft.outlet_id ? "showroom" : (base?.channel ?? "dealer"),
    customer: {
      name: draft.customer_name || "",
      address: addressString(draft, baseline) || "",
      phone: draft.customer_phone || null,
      email: draft.customer_email || null,
      emergency: emergencyString(draft) || null,
    },
    dealer: {
      name: refs.dealerName(draft.dealer_id) ?? base?.dealer.name ?? "Carres",
      contact: base?.dealer.contact ?? null,
      address: base?.dealer.address ?? null,
      outlet_name: outName,
      outlet_address: outAddr,
      salesperson_name: spName,
      salesperson_phone: base?.dealer.salesperson_phone ?? null,
    },
    delivery: {
      date: draft.delivery_date_tbd ? "To be confirmed" : (draft.delivery_date ?? ""),
      floor: draft.delivery_floor,
      has_lift: draft.delivery_has_lift,
    },
    lines,
    addons,
    payments: base?.payments ?? [],
    vouchers: base?.vouchers ?? [],
    subtotal,
    tax_amount: 0,
    total: subtotal,
    paid,
    balance_due: subtotal - paid,
    currency: base?.currency ?? "MYR",
    signed: base?.signed ?? false,
    signature_url: base?.signature_url ?? null,
  } as SalesOrderTemplateData;
}

/** An OLD revision's PDF renders FROM THAT SNAPSHOT — printable. The names
 *  the snapshot stored at mint time are what print; the payments ledger is
 *  live money and rides from the base. */
/* Exported for `SalesOrderWorkspace.historical-document.test.ts` — the
   signature rule is a business guarantee about a CUSTOMER DOCUMENT, so it
   is proved by calling the builder, not by grepping this file. */
export function snapshotTemplateData(
  snap: SalesOrderSnapshot,
  base: SalesOrderTemplateData | null,
  /** ⭐ addon key -> the catalog's word for it (YH, 2026-09-01). See the
   *  `addons` mapping below — without this the printed document showed the
   *  customer a database key. A FUNCTION, not a map, so the caller decides
   *  what to do when the catalog has not answered: today it returns the key,
   *  which is what this printed before, so a slow catalog degrades to the old
   *  behaviour instead of printing a blank line on a document. */
  addonLabel: (key: string) => string = (key) => key,
  /** 0562 — A VERSION PRINTS AS IT WAS ISSUED: only the payments recorded by
   *  that version's own time, and the customer signature only on the version
   *  the customer actually signed (orders/MASTER § Old versions and signatures). */
  asOf?: { date: string },
): SalesOrderTemplateData {
  const h = snap.header ?? {};
  const baseBySku = new Map((base?.lines ?? []).map((l) => [l.sku, l]));
  const lines = (snap.lines ?? []).map((l) => ({
    sku: l.sku,
    description: l.description?.trim() || l.sku,
    qty: Number(l.qty),
    unit_price: Number(l.unit_price),
    line_total: Number(l.qty) * Number(l.unit_price),
    attrs: (l.attrs as Record<string, unknown> | null) ?? null,
    category: baseBySku.get(l.sku)?.category ?? null,
  }));
  /* ⭐ THE CUSTOMER'S DOCUMENT NEVER PRINTS A DATABASE KEY (YH, 2026-09-01).
     This read `String(a.addon_key)`, so an OLD REVISION's PDF — a customer
     document, printed and sent — carried `dispose_mattress` where the live
     document carries `Mattress disposal`. The live path never had this bug:
     `base.addons` arrives labelled from the server. Only the snapshot path,
     which builds its own rows from the stored revision, spelled the key
     straight onto paper.
     ⛔ AND THE SNAPSHOT'S OWN WORD STILL WINS WHERE IT HAS ONE. A revision is
     a photograph: if the stored row carried a label, that label is what the
     customer agreed to and it prints, even if the catalog has since renamed
     the service. The catalog is asked only where the photograph is silent. */
  const addons = (snap.addons ?? []).map((a) => ({
    label:
      (typeof (a as { label?: unknown }).label === "string"
        ? ((a as { label?: string }).label ?? "").trim()
        : "") || addonLabel(String(a.addon_key)),
    qty: Number(a.qty),
    unit_price: Number(a.unit_price),
    line_total: Number(a.qty) * Number(a.unit_price),
    attrs: null,
  }));
  const subtotal =
    lines.reduce((s, l) => s + l.line_total, 0) + addons.reduce((s, a) => s + a.line_total, 0);
  /* ⛔ A RECEIPT NOBODY CAN PLACE IN TIME IS NOT COUNTED IN AN AS-AT VIEW.
     `order_payments.paid_on` is `date NOT NULL`, so the ledger path always has
     a day — but the FALLBACK path synthesises ONE row from `placed_at`, and
     that row carries the whole at-sale amount. With `placed_at` null it has no
     date at all, and including it would make a Rev 1 document assert the entire
     deposit had already arrived. Including it is the one choice that misstates,
     and it misstates in the exact direction this filter exists to prevent. */
  const payments = asOf
    ? (base?.payments ?? []).filter((pm) => pm.date && String(pm.date).slice(0, 10) <= asOf.date)
    : (base?.payments ?? []);
  const paid = asOf ? payments.reduce((n, pm) => n + Number(pm.amount), 0) : (base?.paid ?? 0);
  const str = (k: string) => (h[k] == null ? null : String(h[k]));
  return {
    so_number: h["so"] != null ? `SO-${h["so"]}` : (base?.so_number ?? ""),
    issue_date: (str("placed_at") ?? base?.issue_date ?? "").slice(0, 10),
    proceed_date: str("proceed_date"),
    order_id: base?.order_id ?? "snapshot",
    order_code: h["so"] != null ? `SO-${h["so"]}` : (base?.order_code ?? ""),
    status_label: base?.status_label ?? "",
    channel: base?.channel ?? "dealer",
    customer: {
      name: str("customer_name") ?? "",
      address: str("customer_address") ?? "",
      phone: str("customer_phone"),
      email: str("customer_email"),
      emergency: str("customer_emergency"),
    },
    dealer: {
      name: str("dealer_name") ?? base?.dealer.name ?? "Carres",
      contact: base?.dealer.contact ?? null,
      address: base?.dealer.address ?? null,
      outlet_name: str("outlet_name"),
      outlet_address: base?.dealer.outlet_address ?? null,
      salesperson_name: str("salesperson_name"),
      salesperson_phone: null,
    },
    delivery: {
      date: h["delivery_date_tbd"] ? "To be confirmed" : (str("delivery_date") ?? ""),
      floor: Number(h["delivery_floor"] ?? 1),
      has_lift: Boolean(h["delivery_has_lift"]),
    },
    lines,
    addons,
    payments,
    vouchers: [],
    subtotal,
    tax_amount: 0,
    total: subtotal,
    paid,
    balance_due: subtotal - paid,
    currency: base?.currency ?? "MYR",
    /* ⭐ A SIGNATURE IS NOT REPRODUCED ON A VERSION IT CANNOT BE ATTRIBUTED TO —
       and that is NOT the same as saying this version is unsigned.
       APPROVED / LOCKED, owner ruling 2026-09-22 (`docs/orders/MASTER.md`
       § "Old versions and signatures"): "A signature belongs to the exact
       version and document the customer signed."

       This read `base?.signed` and `base?.signature_url` — the ORDER's current
       eSign PNG — so every revision printed the same mark under a different set
       of goods, prices and dates. A customer could be shown Rev 2 carrying the
       signature they put on Rev 1. That is the defect.

       ⛔ AND THE OPPOSITE CLAIM IS ALSO UNPROVEN. Which revision a stored
       signature covers is UNKNOWN: `sales_order_snapshot` records no signing
       fact and `orders.signature_url` has no capture timestamp (`pod_signed_at`
       is Delivery's, a different act). So this version is not "unsigned" — the
       record simply cannot place the signature. The document therefore makes NO
       claim either way: the mark is not reproduced here, the customer's
       signature evidence is untouched on the order and still prints on the
       CURRENT document, and the PAGE states the unknown in words (a customer
       document gains no new words without the owner).

       FALSIFIER: store the signing fact in the snapshot, or timestamp the
       capture on `orders`, and a revision can print the signature it really
       carries. Named as open work in the Orders MASTER. */
    signed: false,
    signature_url: null,
    /* ⭐ AND THE DOCUMENT SAYS BOTH THINGS ITSELF — owner ruling 2026-09-23,
       wording approved verbatim.
       The two sentences below were on the PAGE only; a PDF is printed,
       downloaded and handed to a customer, so a statement that lives on screen
       is not made at all by the time it matters. `signature_unknown` uses the
       SAME condition as the `oldrev-signature-unknown` page notice — one fact,
       one test, so the screen and the paper cannot drift. */
    rebuilt_notice: "Reconstructed copy. The original issued document is unavailable.",
    signature_unknown: Boolean(base?.signature_url),
    /* ⭐ AND ITS MONEY IS THE MONEY DATED ON OR BEFORE THIS VERSION'S DAY. The
       snapshot stores none, so this reads the SAME payments ledger Payments
       owns with the SAME arithmetic (sum of the rows) over the rows dated then
       or earlier. It invents no number, and it never shows a receipt DATED
       after this version's day — which printing today's `paid` on a Rev 1
       document did.
       ⚠️ TWO NAMED LIMITS, stated as they behave rather than as one would wish:
       · SAME DAY. `paid_on` is a DATE, so a receipt taken in the afternoon
         counts toward a version minted that morning. `paid_on` is the business
         fact and `created_at` is merely when someone typed it, so the day is
         the right grain and the limit is real.
       · A LATER VOID UNDER-REPORTS. The read filters `voided_at is null`, so a
         payment voided afterwards disappears from EVERY view, this one
         included: an old document shows the money still recognised today, not
         the money recognised then.
       Both close the same way — a stored historical position, a schema change,
       named in the Orders MASTER, not a second arithmetic invented here. */
  } as SalesOrderTemplateData;
}

/** An old revision's snapshot → the same form shape, so a historical view
 *  shows THAT version's fields rather than today's values behind a pill. */
function draftFromSnapshot(snap: SalesOrderSnapshot): Draft {
  const h = snap.header ?? {};
  const str = (k: string) => (h[k] == null ? "" : String(h[k]));
  const fields = (h["entry_fields"] ?? {}) as Record<string, unknown>;
  const custom: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (k === "building_type") continue;
    custom[k] = v == null ? "" : String(v);
  }
  const emergency = parseEmergencyContact(str("customer_emergency"));
  return {
    ...EMPTY_DRAFT,
    customer_name: str("customer_name"),
    customer_phone: str("customer_phone"),
    customer_email: str("customer_email"),
    customer_race: str("customer_race"),
    customer_gender: str("customer_gender"),
    customer_birthday: str("customer_birthday").slice(0, 10) || null,
    customer_address: str("customer_address"),
    customer_address_line1: str("customer_address_line1"),
    customer_address_line2: str("customer_address_line2"),
    customer_address_city: str("customer_address_city"),
    customer_address_state: str("customer_address_state"),
    customer_address_postcode: str("customer_address_postcode"),
    customer_address_unknown: Boolean(h["customer_address_unknown"]),
    building_type: fields.building_type == null ? "" : String(fields.building_type),
    emergency_name: emergency.name,
    emergency_phone: emergency.phone,
    emergency_relationship: emergency.relationship,
    customer_billing: str("customer_billing"),
    customer_billing_same: h["customer_billing_same"] !== false,
    delivery_date: str("delivery_date") || null,
    delivery_date_tbd: Boolean(h["delivery_date_tbd"]),
    proceed_date: str("proceed_date") || null,
    delivery_floor: Number(h["delivery_floor"] ?? 1),
    delivery_has_lift: Boolean(h["delivery_has_lift"]),
    delivery_stair_items:
      h["delivery_stair_items"] == null ? null : Number(h["delivery_stair_items"]),
    custom,
    lines: (snap.lines ?? []).map((l) => ({
      key: nextKey(),
      ...(l.id ? { id: String(l.id) } : {}),
      sku: l.sku,
      qty: Number(l.qty),
      unit_price: Number(l.unit_price),
      ...(l.attrs ? { attrs: l.attrs as Record<string, unknown> } : {}),
    })),
    addons: (snap.addons ?? []).map((a) => ({
      key: nextKey(),
      addon_key: String(a.addon_key),
      qty: Number(a.qty),
      unit_price: Number(a.unit_price),
      attrs: (a.attrs as Record<string, unknown> | null) ?? null,
    })),
    installment_months: h["installment_months"] == null ? null : Number(h["installment_months"]),
  };
}

/* ── Small atoms ───────────────────────────────────────────────────────────── */

/** The one card lives in the kit (Workspace §5.10 admission, 2026-09-28). */
import Block from "@/components/kit/Block";
export { Block };

/**
 * A named division INSIDE a card — the merge law's other half (Jess, 2026-08-26).
 *
 * Jess asked for fewer, fuller cards: `DELIVERY ADDRESS` joins `CUSTOMER`,
 * `SALES OWNERSHIP` joins `ORDER INFO`. Merging must not cost the reader the
 * name of what they are looking at, and it may not cost the WORD either —
 * `Sales ownership` is locked (COPY-STANDARD:1427 governs its door, and
 * MASTER.md's block order names the section). So the section keeps its exact
 * word and loses only its border, its own 24px gap and its second heading rule.
 *
 * Deliberately quieter than a card title: HEADINGS HAVE TWO RANKS ONLY
 * (`docs/orders/MASTER.md` § "Order view") — the card title is `text-strong`
 * 15px/600 blue, and this in-card label is 13px/600 slate-11. It was drawn at
 * `text-strong` too, so `Emergency contact` read as a second card title
 * (measured 15px/600, 2026-09-23). No margins: the section body's one 12px
 * gap spaces it, and the 1px rule above it marks the group.
 */
/* ⛔ THE DELIVERY PAYMENT APPROVAL DOOR IS REMOVED — owner instruction,
   2026-09-01, and it changes what the business does rather than how a card
   looks. Recorded here rather than deleted in silence.

   WHAT IT WAS. `0362` (Jess, 2026-08-19) made "money in full before delivery"
   the default and allowed ONE exception: a recorded approval, decided by the
   principal, which opened the Delivery Order as COD — the balance paid by
   online transfer before unloading. This component was the only surface in the
   product that could raise or decide one.

   WHAT REMOVING IT MEANS, stated plainly because nobody should have to
   rediscover it. The rule becomes ABSOLUTE: `ops_delivery_orders_money_gate`
   (0362) still refuses to mint a Delivery Order while a Sales Order's goods
   money is outstanding, and there is no longer any way to ask for the
   exception. An owing order is undeliverable until it is paid. That is the
   intended effect of this change, not a side effect of it.

   ⛔ THE RECORD, THE RPCs AND THE DATABASE GATE ARE UNTOUCHED.
   `order_delivery_payment_approvals`, `delivery_payment_approval_request`,
   `delivery_payment_approval_decide` and the trigger all remain, and so do
   their API routes. Nothing is dropped and no migration is written, for two
   reasons: an approval already granted stays honoured by the gate, and
   restoring the door is a revert of this one commit rather than a rebuild.

   If the exception is wanted again, this is where it goes back. */

/**
 * A RECORDED ANSWER WEARS THE BOX THE QUESTION WOULD HAVE WORN (YH,
 * 2026-09-01 — measured on `/operation/orders/so`).
 *
 * Every question on this page is a box: `Full name`, `Floor (Max is 3rd
 * Floor)`, `Lift available?`. An answer that was already recorded, or that this
 * surface may not move, was a bare label with a line of text under it — so ONE
 * form carried TWO grammars and the reader learnt which shapes accept typing by
 * trying them. The frame is constant now; what differs is the CONTROL. A
 * read-only field has no caret, no focus ring and no hover, so it still reads
 * as an answer rather than as an invitation, and the page stops looking like
 * two forms stapled together.
 *
 * ⛔ NOT an `<input readOnly>`. Several values here are rendered NODES, not
 * strings — the amber `No delivery date` chip, and anything wearing `<Money>` —
 * and an input can hold only a string, so boxing them through one would throw
 * away the exact fact the chip exists to carry. This borrows the kit's own
 * `CONTROL_BASE` + resting hairline instead, so there is still ONE control skin
 * in the app and this shares it rather than copying it. The one deliberate
 * departure is HEIGHT: `min-h-8` in place of the control's fixed `h-8`, because
 * an address or a long customer name is an answer that must be readable, and a
 * fixed-height box would clip it.
 *
 * `role="textbox"` + `aria-readonly` is what a screen reader is told, so the
 * announced grammar matches the drawn one. `aria-label` carries the name
 * because `<label for>` binds only to real form controls.
 */
/**
 * ⭐ THE SO PAGE FIELD STANDARD — OWNER RULING (Jess, 2026-09-22),
 * `docs/orders/MASTER.md` § "Order view": **a grey box means "this can be
 * changed with `Edit`" and nothing else** — *"every grey meaning can edit"*.
 *
 * Every fact on the page is a grey box EXCEPT three, which print as PLAIN TEXT
 * because they are not this page's to change:
 *   · `SO Doc Date` — the order's birth stamp
 *   · the payment rows — Payments owns them; the door is `Open this order in
 *     Payments →`
 *   · the computed totals — `TOTAL PAYABLE` · `Paid to date` · `Balance due`
 *
 * So `Fact` takes `own={false}` for those three. Before this ruling every
 * read-only value wore the same bordered box, so `SO Doc Date` looked exactly
 * as changeable as the phone number beside it (reviewer finding 16).
 */
/** Contact corrections do not renew an existing delivery promise. */
export function isContactOnlyCorrection(fields: readonly string[]): boolean {
  const contactFields = new Set([
    "customer_name", "customer_phone", "customer_email",
    "emergency_name", "emergency_phone", "emergency_relationship",
  ]);
  return fields.length > 0 && fields.every((field) => contactFields.has(field));
}

export function Fact({
  label,
  value,
  own = true,
  framed = own,
  idPrefix = "so-fact",
  testId,
  hint,
  wide = false,
  automatic = false,
}: {
  label: string;
  value: React.ReactNode;
  own?: boolean;
  framed?: boolean;
  /** The id/testid family — `so-fact` here, `po-fact` / `mp-fact` on the
   *  Purchasing pages that share this ONE fact grammar (owner, 2026-09-26). */
  idPrefix?: string;
  /** A page that already pins its own test id keeps it. */
  testId?: string;
  /** One quiet line under the value (`Provisional. The date is recorded when
   *  issued.`) through FieldFrame's own hint slot — never a second markup. */
  hint?: string;
  /** Spans the whole fact grid row — a free-text reason or requirement. */
  wide?: boolean;
  /** A value the SYSTEM fills on a form the person is filling in
   *  (`Requested By`, `Proceed Date` on a create page). Drawn in a grey
   *  box so it never reads as a field waiting for input (owner 2026-09-28:
   *  "yes" to grey automatic fields, the Shopify / SAP read-only look). */
  automatic?: boolean;
}) {
  const id = `${idPrefix}-${label.replace(/\s+/g, "-").toLowerCase()}`;
  const field = (
    <FieldFrame id={id} label={label} hint={hint}>
      <div
        id={id}
        role="textbox"
        aria-readonly
        aria-label={label}
        data-kit={framed ? (automatic ? "automatic-field" : "readonly-field") : "plain-fact"}
        data-editable={own ? "yes" : "no"}
        data-testid={testId ?? id}
        className={
          framed
            ? `${automatic ? CONTROL_BASE.replace("bg-white", "bg-kit-slate-3") : CONTROL_BASE} ${CONTROL_BORDER.rest} rounded-control min-h-8 min-w-0 break-words px-2 py-1`
            : "flex min-h-8 min-w-0 items-center break-words px-0 py-1 text-body text-base-900"
        }
      >
        {value}
      </div>
    </FieldFrame>
  );
  /* The kit owns one field and takes no className; the grid span is the
     caller's layout, drawn here around it. */
  return wide ? <div className="col-span-full">{field}</div> : field;
}

type Mode = "object" | "oldrev";
const OBJECT_VIEWS = ["Sales Order", "Order Route", "Timeline"] as const;
type ObjectView = (typeof OBJECT_VIEWS)[number];

/**
 * 【DELIVERY】 CARD 19 — THE NUMBER DOOR. `/operation/orders/so/:orderId`
 * carries either the order's id or the operator's own document word
 * (`SO-1362`). The object page below reads TEN doors by the id; handing it a
 * number reached the database as `invalid input syntax for type uuid` and the
 * page printed an empty Order Route (measured on production 2026-09-13).
 *
 * A number is resolved ONCE through the by-number door and the page re-enters
 * by the id with the same search (`?route=1` survives), so every fan-in read
 * still happens by the canonical id — one resolver, no second fan-in (Law C).
 * `new` is no door: the office create door is retired (owner ruling
 * 2026-09-27) and its route lands on the Register. Anything else is an
 * absence, never a 500.
 */
export default function SalesOrderWorkspace() {
  const { orderId } = useParams<{ orderId: string }>();
  const location = useLocation();
  const ident = salesOrderParamOf(orderId);
  if (ident.kind === "number") {
    return <SalesOrderNumberDoor so={ident.so} search={location.search} />;
  }
  if (ident.kind === "invalid") {
    return <SalesOrderAbsence />;
  }
  return <SalesOrderWorkspaceBody />;
}

function SalesOrderNumberDoor({ so, search }: { so: number; search: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const resolved = useSalesOrderIdByNumber(so);
  const id = resolved.data?.id ?? null;
  useEffect(() => {
    if (id) navigate(`/operation/orders/so/${id}${search}`, { replace: true, state: location.state });
  }, [id, navigate, search, location.state]);
  if (resolved.isError) return <SalesOrderAbsence />;
  return (
    <div className="flex h-full items-center justify-center" data-testid="so-number-door">
      <Loading label={`Opening ${salesOrderNumberWord(so)}`} />
    </div>
  );
}

/** The absence the object page prints for a number or param no order carries
 *  (COPY-STANDARD: `Sales Order not found.`). */
function SalesOrderAbsence() {
  /* The kit's own block and button, through the one translator (owner ruling 2026-09-26). */
  return (
    <div className="flex h-full flex-col items-center justify-center" data-testid="so-not-found">
      <SalesOrderReadFailure error={{ status: 404 }} surface="sales-order" />
    </div>
  );
}

function SalesOrderWorkspaceBody() {
  const { orderId } = useParams<{ orderId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const showRoute = params.get("route") === "1";
  const [viewRev, setViewRev] = useState<number | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [problemOpen, setProblemOpen] = useState(false);
  /* The `Change salesperson` door lives beside the Salesperson it changes; the
     modal behind it lives in `SalesOrderAttribution`. Bumping this opens it. */
  const [attributionSignal, setAttributionSignal] = useState(0);
  const canChangeSalesOwnership = useCanChangeSalesOwnership();
  const [objectView, setObjectView] = useState<ObjectView>(showRoute ? "Order Route" : "Sales Order");
  /* The SO document opens in a drawer from `⋮`; it is painted only while open. */
  const [pdfOpen, setPdfOpen] = useState(false);

  /* ⛔ `?edit=1` IS RETIRED — owner ruling 2026-08-15. A bookmark, a browser
     history entry or a stale tab still carries it; it is stripped rather than
     404'd, because the page it asked for is the page it is already on. */
  useEffect(() => {
    if (!params.get("edit")) return;
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("edit");
        return next;
      },
      { replace: true, state: location.state },
    );
  }, [params, setParams, location.state]);

  const detailQ = useOperationOrder(orderId ?? null);
  /* ── THE CREATE DOOR ASKS THE CATALOG (2026-08-21) ───────────────────────
   * Until now this door took a SKU as free text: a typo produced a line no
   * stock, PO or readiness engine could recognise, and creation still
   * succeeded. The POS never had that hole because it only ever offers SKUs
   * the catalog holds.
   *
   * The bundle is the same 5-minute-cached response the POS and both catalog
   * pages already pull, so an operator who walks POS → Ops pays for it once.
   *
   * `admin: true` is deliberate: the office door must be able to write a line
   * for a SKU that is not on sale at POS (a discontinued model still being
   * fulfilled, a service line), and the admin bundle is the one that carries
   * them.
   *
   * ⭐ NOW FETCHED IN EVERY MODE (Jess, 2026-08-26). It used to be create-only,
   * because the document view has no SKU field. The stair-carry working-out
   * the POS shows needs `floorConfig`, which ships inside this bundle and
   * nowhere else — and the same change that added it removed three whole
   * queries from this page (Delivery Orders, Payments, Guarantees), so the
   * Order tab still makes fewer round trips than it did before. */
  const catalogQ = useCatalog({ admin: true });
  /** sku → what the CATALOG says it is. The one lookup both new fields read,
   *  so the name hint and the price hint can never disagree (Law D). */
  const catalogBySku = useMemo(() => {
    const out = new Map<string, CatalogSkuFact>();
    const bundle = catalogQ.data;
    if (!bundle) return out;
    const model = new Map(bundle.models.map((m) => [m.id, m]));
    for (const sku of bundle.skus) {
      const m = model.get(sku.modelId);
      out.set(sku.sku, {
        price: sku.price,
        label: [m?.name ?? "", sku.variant].filter(Boolean).join(" · "),
        category: m?.category ?? null,
      });
    }
    return out;
  }, [catalogQ.data]);
  /** addon key -> what the CATALOG calls it. `SalesOrderAddons` reads the same
   *  bundle for the same purpose, so the Goods table and the Services list
   *  under it can never print two different names for one row (Law D). */
  const addonNameByKey = useMemo(
    () => new Map((catalogQ.data?.addons ?? []).map((a) => [a.key, a.name])),
    [catalogQ.data],
  );
  /** addon key -> the catalogue's Service SKU, for a linked service only (0172). */
  const addonSkuByKey = useMemo(
    () => new Map((catalogQ.data?.addons ?? []).flatMap((a) => (a.serviceSku ? [[a.key, a.serviceSku] as const] : []))),
    [catalogQ.data],
  );
  const revisionsQ = useSalesOrderRevisions(orderId ?? null);
  const goodsTruthQ = useSalesOrderExpansion(orderId ?? "");
  const amendmentQ = useSalesOrderAmendment(orderId ?? null);
  /* 3.4 · what this sales order's changes have raised for other modules. The
   * workspace SHOWS it and cannot close it — the module that raised the work
   * does not tick it off. */
  const correctionWorkQ = useOrderCorrectionWork(orderId ?? null);
  /* ⭐ ROUTE FACTS LOAD ONLY WHEN THE ROUTE IS OPEN (owner ruling 2026-09-26).
     Measured: the fan-in fired on every opened order — eleven requests the
     Order tab never reads. */
  const routeFactsQ = useSalesOrderRouteFacts(
    orderId ?? null,
    showRoute,
    (detailQ.data?.pos ?? []).map((po) => po.id),
  );
  /* The leg that reaches the customer decides the payment deadline's clock. */
  const routeCustomerLeg = useMemo(() => {
    const stops = detailQ.data?.order?.delivery_stops ?? [];
    return stops.length >= 2 ? Math.max(...stops.map((stop) => Number(stop.leg) || 0)) : 0;
  }, [detailQ.data]);
  const routePartnerQ = useLogisticsCardFacts(showRoute ? (orderId ?? null) : null, routeCustomerLeg);
  /* LINKED PROBLEMS needs the case's own translated status word, and Service
     owns that translation. The route facts carry only open/closed. */
  const serviceCasesQ = useOrderServiceCases(orderId ?? "", {
    enabled: Boolean(orderId),
  });
  const baseQ = useQuery({
    queryKey: ["orders", "sales-order-data", orderId ?? null],
    queryFn: () =>
      apiFetch<SalesOrderTemplateData>(`/api/orders/${orderId}/sales-order-data`),
    enabled: !!orderId,
  });

  const salespersonsQ = useSalespersons();
  const outletsQ = useOutlets();
  const dealersQ = useOperationDealersRef();
  /* 0219 — the ONE field contract. The POS reads it out of the catalog bundle,
     the object page reads it here; both call `resolveFormTab`. */
  const entryConfigQ = useOrderEntryConfig();
  const formFields = entryConfigQ.data?.entryConfig.formFields ?? null;
  const tab = useCallback(
    (t: OrderEntryTab) => resolveFormTab(formFields, t),
    [formFields],
  );

  const refs: Refs = useMemo(() => {
    const sp = new Map((salespersonsQ.data?.salespersons ?? []).map((s) => [s.id, s.name]));
    const out = new Map((outletsQ.data?.outlets ?? []).map((o) => [o.id, o]));
    const dl = new Map((dealersQ.data?.dealers ?? []).map((d) => [d.id, d.name]));
    return {
      salespersonName: (id) => (id ? (sp.get(id) ?? null) : null),
      outletName: (id) => (id ? (out.get(id)?.name ?? null) : null),
      outletAddress: (id) => (id ? (out.get(id)?.address ?? null) : null),
      dealerName: (id) => (id ? (dl.get(id) ?? null) : null),
    };
  }, [salespersonsQ.data, outletsQ.data, dealersQ.data]);

  const revisions = revisionsQ.data?.revisions ?? [];
  const currentRev = revisions.length > 0 ? revisions[revisions.length - 1]!.revision : null;
  const viewedRevision: SalesOrderRevisionRow | null =
    viewRev != null ? (revisions.find((r) => r.revision === viewRev) ?? null) : null;

  /* ── The draft — seeded from the order. ─────────────────────────────── */
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [baseline, setBaseline] = useState<Draft>(EMPTY_DRAFT);
  const [draftSeed, setDraftSeed] = useState<string>("");
  const order = detailQ.data?.order;
  const detailLines = detailQ.data?.lines ?? [];
  useEffect(() => {
    /* AN OLD REVISION IS A PHOTOGRAPH. The same fields render, filled from
       THAT snapshot and locked — never the current row's values wearing a
       "read-only" pill, which is how a historical view starts lying. */
    if (viewRev != null) {
      const seed = `${orderId}:rev:${viewRev}`;
      if (!viewedRevision || draftSeed === seed) return;
      const next = draftFromSnapshot(viewedRevision.snapshot);
      setDraft(next);
      setBaseline(next);
      setDraftSeed(seed);
      return;
    }
    /* ⛔ A REFETCH MAY NEVER CLOBBER AN OPEN EDIT (ui/MASTER.md §6.4 C3). The
       seed moves with the server's answer, so a save or an approval reseeds the
       form from fresh truth — but never while the operator has unsaved words on
       screen. `dirtyRef` is read, not depended on, so this stays one effect. */
    const seed = `${orderId}:${detailQ.dataUpdatedAt}`;
    if (!order || draftSeed === seed) return;
    if (dirtyRef.current || editingRef.current) return;
    const bag = order as unknown as Record<string, unknown>;
    const str = (k: string) => (bag[k] == null ? "" : String(bag[k]));
    const entryFields =
      ((order as { entry_data?: { fields?: Record<string, unknown> } | null }).entry_data?.fields ??
        {}) as Record<string, unknown>;
    const emergency = parseEmergencyContact(order.customer_emergency);
    const custom: Record<string, string> = {};
    for (const [k, v] of Object.entries(entryFields)) {
      if (k === "building_type") continue;
      custom[k] = v == null ? "" : String(v);
    }
    const next: Draft = {
      customer_name: order.customer_name ?? "",
      customer_phone: order.customer_phone ?? "",
      customer_email: str("customer_email"),
      customer_race: str("customer_race"),
      customer_gender: str("customer_gender"),
      customer_birthday: str("customer_birthday").slice(0, 10) || null,
      customer_address: order.customer_address ?? "",
      customer_address_line1: str("customer_address_line1"),
      customer_address_line2: str("customer_address_line2"),
      customer_address_city: str("customer_address_city"),
      customer_address_state: str("customer_address_state"),
      customer_address_postcode: str("customer_address_postcode"),
      customer_address_unknown: Boolean(order.customer_address_unknown),
      building_type: entryFields.building_type == null ? "" : String(entryFields.building_type),
      emergency_name: emergency.name,
      emergency_phone: emergency.phone,
      emergency_relationship: emergency.relationship,
      customer_billing: order.customer_billing ?? "",
      customer_billing_same: order.customer_billing_same !== false,
      dealer_id: order.dealer_id ?? null,
      outlet_id: order.outlet_id ?? null,
      salesperson_id: order.salesperson_id ?? null,
      delivery_date: order.delivery_date,
      delivery_date_tbd: order.delivery_date_tbd,
      proceed_date: order.proceed_date ?? null,
      delivery_floor: (order as { delivery_floor?: number }).delivery_floor ?? 1,
      delivery_has_lift: (order as { delivery_has_lift?: boolean }).delivery_has_lift ?? false,
      delivery_stair_items:
        (order as { delivery_stair_items?: number | null }).delivery_stair_items ?? null,
      custom,
      lines: detailLines.map((l) => ({
        key: nextKey(),
        id: l.id,
        sku: l.sku,
        qty: l.qty,
        unit_price: Number(l.unit_price),
        ...(l.attrs ? { attrs: l.attrs } : {}),
      })),
      addons: (detailQ.data?.addons ?? []).map((a) => ({
        key: nextKey(),
        id: a.id,
        addon_key: a.addon_key,
        qty: Number(a.qty),
        unit_price: Number(a.unit_price),
        attrs: (a.attrs as Record<string, unknown> | null) ?? null,
      })),
      installment_months: (order as { installment_months?: number | null }).installment_months ?? null,
    };
    setDraft(next);
    setBaseline(next);
    setDraftSeed(seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    order,
    orderId,
    detailLines,
    draftSeed,
    detailQ.dataUpdatedAt,
    viewRev,
    viewedRevision,
  ]);

  const mode: Mode = viewRev != null ? "oldrev" : "object";

  /* ── WHAT CHANGED — the save bar counts fields, never keystrokes. ─────── */
  const changedFields = useMemo(() => {
    if (mode === "oldrev") return [];
    const keys = Object.keys(baseline) as Array<keyof Draft>;
    const changed: string[] = [];
    for (const k of keys) {
      if (k === "lines") {
        if (JSON.stringify(draft.lines.map(({ key: _k, ...l }) => l))
          !== JSON.stringify(baseline.lines.map(({ key: _k, ...l }) => l))) changed.push("lines");
        continue;
      }
      if (k === "custom") {
        if (JSON.stringify(draft.custom) !== JSON.stringify(baseline.custom)) changed.push("custom");
        continue;
      }
      if (k === "addons") {
        if (JSON.stringify(draft.addons.map(({ key: _k, ...a }) => a))
          !== JSON.stringify(baseline.addons.map(({ key: _k, ...a }) => a))) changed.push("addons");
        continue;
      }
      if (draft[k] !== baseline[k]) changed.push(k);
    }
    return changed;
  }, [draft, baseline, mode]);
  const dirty = changedFields.length > 0;
  /* Read by the seeding effect without becoming one of its dependencies. */
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  /* ⭐ VIEW FIRST, EDIT ON PURPOSE — owner ruling (Jess, 2026-09-21), built 0562.
     The Order tab opens READ-ONLY; `Edit` enters the whole-page draft; the
     draft carries customer, delivery, dates, items, services and the plan. */
  const [editing, setEditing] = useState(false);
  const editingRef = useRef(editing);
  editingRef.current = editing;
  const [changeReason, setChangeReason] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [changeAskedOn, setChangeAskedOn] = useState<string | null>(null);
  const [changeAgreement, setChangeAgreement] = useState<RecordedAgreement | null>(null);
  /** Proposing again over an out-of-date request withdraws it first (server). */
  const [replaceAmendmentId, setReplaceAmendmentId] = useState<string | null>(null);
  const role = useAuth((st) => st.role);
  /** THE LOCKED STATE (owner ruling 2026-09-26): View and a historical version
   *  are ONE locked presentation; Edit alone draws controls. */
  const formLocked = (mode === "object" && !editing) || mode === "oldrev";
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const liveAmendment = amendmentQ.data?.amendment ?? null;
  /* THE PROPOSAL NEVER ENTERS THE PAPER — it shows as a banner above it. */
  const pendingDeliveryDate =
    liveAmendment && !liveAmendment.stale
      ? ((liveAmendment.proposed_snapshot as { delivery_date?: string | null } | null)
          ?.delivery_date ?? null)
      : null;

  /* Revision links in Order Route are durable URLs, not local-only buttons. */
  useEffect(() => {
    const raw = params.get("revision");
    if (!raw) return;
    const revision = Number(raw);
    if (Number.isInteger(revision) && revision > 0) setViewRev(revision);
  }, [params]);

  /* ⭐ THE STAIR CARRY, SHOWN THE WAY THE POS SHOWS IT (Jess, 2026-08-26).
   *
   * The office keyed `Floor`, `Items needing stair carry` and the lift answer
   * and was told nothing back, while the POS printed the whole working-out —
   * `3 of 5 items × 2 floors above 2F × RM50 = RM300`. Same three inputs, one
   * surface explaining them and one not.
   *
   * ⛔ THE ARITHMETIC IS IMPORTED, NEVER RE-TYPED (ownership Law D — one
   * derived fact, ONE arithmetic). `floorSurchargeRaw` is the same function the
   * POS panel and the order totals call; a second copy here is exactly how the
   * two surfaces would start disagreeing about money. */
  const stair = useMemo(() => {
    const cfg = catalogQ.data?.floorConfig;
    if (!cfg) return null;
    const itemsTotal = (detailQ.data?.lines ?? []).reduce((n, l) => n + l.qty, 0);
    /* ⭐ UNSET MEANS NONE — owner ruling 2026-08-27 (YH). It used to mean
       EVERY item (0104's column comment), so an order nobody was asked about
       carried the maximum fee. The same rule now runs in `order-totals.ts` and
       in the POS panel, so all three agree. */
    const items = stairCarryCount(itemsTotal, draft.delivery_stair_items);
    return {
      itemsTotal,
      fee: floorSurchargeRaw(draft.delivery_floor, draft.delivery_has_lift, items, cfg),
    };
  }, [
    catalogQ.data?.floorConfig,
    draft.delivery_stair_items,
    draft.delivery_floor,
    draft.delivery_has_lift,
    detailQ.data?.lines,
  ]);

  /* ⭐ A SAVED ORDER READS ITS OWN CHARGE, NEVER TODAY'S RATE (YH, 2026-09-01).
   *
   * The `stair` memo above prices from `catalogQ.data.floorConfig` — the live
   * `floor_config` singleton a principal can PATCH — and the sentence below it
   * was rendered in EVERY mode. So stamping an order at RM 50/floor/item and
   * later moving the rate to RM 60 made one page print two numbers: the
   * working-out narrated `× RM 60 = RM 360` while MONEY, the PDF,
   * `stripe-checkout` and every payment cap stayed at the RM 300 that was
   * actually charged. The Card's own trap — STAMP THE FEE, DO NOT RE-DERIVE IT
   * — was closed in the database and left open on screen.
   *
   * An old revision was worse again: `stair` reads the CURRENT order's lines
   * for `itemsTotal` while the floor and the count come from the snapshot, so a
   * photograph of Rev 3 mixed two revisions and today's rate in one sentence.
   *
   * ⭐ SO THE SENTENCE STATES THE STAMPED CHARGE. The fee is the stamped
   * `STAIR_CARRY` row, the same one MONEY reads, and the counts are the ones
   * that produced it: the snapshot's for a revision, the order's own otherwise.
   * (The live-rate multiplication belonged to the office create door, retired
   * 2026-09-27.)
   *
   * ⛔ IT STOPS SHORT OF THE MULTIPLICATION ON A SAVED ORDER, and that is the
   * point rather than a shortcut. Recovering `× RM rate above NF` from a
   * stamped fee needs BOTH the rate and `freeUpToFloor`, and only their product
   * is stored — one equation, two unknowns. Reading either back off today's
   * config is the very defect this closes, one term smaller. So a saved order
   * states what it holds: how many items were carried, to which floor, and what
   * it was charged. `stair-carry-recompute.ts` rules that the breakdown is NOT
   * re-stated on the addon row ("a second copy of it would be a second
   * arithmetic for one number"), so there is nowhere honest to read it from.
   */
  const stairWorking = useMemo(() => {
    /* A REVISION IS A PHOTOGRAPH — its own lines and its own addons, never the
       order's current ones. MONEY already reads it this way; this is the same
       source, so the two cannot disagree on one page. */
    const snapshot = mode === "oldrev" ? (viewedRevision?.snapshot ?? null) : null;
    const lines = snapshot ? (snapshot.lines ?? []) : (detailQ.data?.lines ?? []);
    const addons = snapshot ? (snapshot.addons ?? []) : (detailQ.data?.addons ?? []);
    const fee = addons
      .filter((a) => a.addon_key === STAIR_CARRY_ADDON_KEY)
      .reduce((sum, a) => sum + Number(a.unit_price ?? 0) * Number(a.qty ?? 0), 0);
    /* No stamped row means no charge to explain — an order placed before 0393,
       or one where the addon key was missing and the recompute degraded loudly
       rather than failing the sale. The zero is not narrated either way. */
    if (fee <= 0) return null;
    const itemsTotal = lines.reduce((n, l) => n + Number(l.qty ?? 0), 0);
    return {
      items: stairCarryCount(itemsTotal, draft.delivery_stair_items),
      itemsTotal,
      floor: draft.delivery_floor,
      fee,
    };
  }, [
    mode,
    viewedRevision,
    detailQ.data,
    draft.delivery_stair_items,
    draft.delivery_floor,
  ]);

  /* 0562 · A SIGNATURE BELONGS TO THE VERSION THE CUSTOMER SIGNED. The Sales
     Portal captures it at birth, so it is Rev 1's; a later version is unsigned
     and says so instead of borrowing it (orders/MASTER § Old versions and
     signatures). */
  /* ── ONE template-data value per mode; the draft path debounces 300ms. ── */
  const base = baseQ.data ?? null;
  const liveDraftData = useMemo(
    () =>
      mode === "oldrev"
        ? null
        : (draftTemplateData(draft, baseline, base, refs, stair?.fee ?? 0, (key) => addonNameByKey.get(key) ?? key,
          (key) => serviceCodeWord(key, addonSkuByKey.get(key)))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, draft, baseline, base, refs, stair?.fee, addonNameByKey, currentRev],
  );
  const debouncedDraftData = useDebounced(liveDraftData, 300);
  /* ⭐ 0565 · THE STORED FILE WINS. A version issued after retention exists
     keeps its own PDF, and that file — not a rebuild of it — is what this page
     shows and prints. Only a version that never had one falls back to the
     reconstruction, which is the legacy case the notice is for. */
  const issuedDoc = useIssuedSalesOrderDocument(
    mode === "oldrev" ? (orderId ?? null) : null,
    mode === "oldrev" ? (viewedRevision?.revision ?? null) : null,
  );
  const storedDocumentUrl = mode === "oldrev" && issuedDoc.data?.stored ? (issuedDoc.data.url ?? null) : null;
  const isReconstruction = mode === "oldrev" && issuedDoc.isFetched && !issuedDoc.data?.stored;

  const templateData: SalesOrderTemplateData | null = useMemo(() => {
    /* A stored file is shown as itself; nothing is rebuilt for it. */
    if (mode === "oldrev" && storedDocumentUrl) return null;
    if (mode === "oldrev" && viewedRevision)
      return snapshotTemplateData(viewedRevision.snapshot, base, (key) =>
        addonNameByKey.get(key) ?? key,
        { date: viewedRevision.created_at.slice(0, 10) },
      );
    return debouncedDraftData;
  }, [mode, viewedRevision, base, debouncedDraftData, addonNameByKey]);

  const { setPane, pdfError } = usePdfCanvases(pdfOpen ? templateData : null);

  /* ⭐ PRINT IS THE SAVED TRUTH — owner ruling 2026-08-15.
     Preview-equals-Print is asserted in the SAVED state only. While the form is
     dirty the pane shows the draft under an `UNSAVED` watermark, but the
     PRINTED document is what the record actually holds: a customer document
     built from values nobody has saved is a document the order cannot back up.
     So the printable blob is rendered from the SAVED data on its own — the same
     template, the same `renderSalesOrderPdf` call path, a second blob — and the
     operator is told which one they got. */
  const printData: SalesOrderTemplateData | null =
    mode === "oldrev" && viewedRevision ? templateData : base;
  const printableRef = useRef<{ data: SalesOrderTemplateData | null; url: string | null }>({
    data: null,
    url: null,
  });
  const openPrint = async () => {
    /* ⭐ 0565 · A VERSION THAT KEPT ITS DOCUMENT PRINTS THAT DOCUMENT. Not a
       re-render of it — the actual file the customer was issued. */
    if (storedDocumentUrl) {
      window.open(storedDocumentUrl, "_blank");
      return;
    }
    if (!printData) return;
    if (printableRef.current.data !== printData || !printableRef.current.url) {
      if (printableRef.current.url) URL.revokeObjectURL(printableRef.current.url);
      const blob = await renderSalesOrderPdf(printData);
      printableRef.current = { data: printData, url: URL.createObjectURL(blob) };
    }
    const printable = printableRef.current.url;
    if (!printable) return;
    if (dirty) toast.message("You have unsaved changes. Printing the saved version");
    /* A PRINTED REBUILD MUST NOT BE MISTAKEN FOR THE ISSUED DOCUMENT — and
       this branch is only reached when no file was ever stored for the
       version, which is the legacy case the notice exists for. */
    if (isReconstruction) {
      toast.message("Reconstructed copy. The original issued document is unavailable.");
    }
    window.open(printable, "_blank");
  };
  useEffect(
    () => () => {
      if (printableRef.current.url) URL.revokeObjectURL(printableRef.current.url);
    },
    [],
  );

  /* ── Writes — ONE commit, and the SERVER chooses it (0562). The direct
     `POST /save` door is gone from this page: `POST /changes` classifies the
     whole draft and either saves the correction or submits the request. ── */

  const entryFieldsPayloadOf = (d: Draft): Record<string, string | null> => {
    const out: Record<string, string | null> = {
      building_type: d.building_type.trim() || null,
    };
    for (const [k, v] of Object.entries(d.custom)) out[k] = v.trim() || null;
    return out;
  };

  /* ⭐ THE SAME PIPELINE ON BOTH SIDES (0562). The payload normalises — it
     capitalises and it composes the address from the structured parts — so
     comparing a normalised DRAFT against the RAW stored row reported every
     normalisation as an operator change ("7 changes" for one phone edit,
     measured 2026-09-23). Both sides run through this one function; the server
     still compares against the stored row, which is what actually gets saved. */
  const headerPayloadOf = (d: Draft): Record<string, unknown> => ({
    customer_name: autoCapitalize(d.customer_name.trim()),
    customer_phone: d.customer_phone.trim() || null,
    customer_email: d.customer_email.trim() || null,
    customer_race: d.customer_race.trim() || null,
    customer_gender: d.customer_gender.trim() || null,
    customer_birthday: d.customer_birthday || null,
    customer_address: autoCapitalize(addressString(d, baseline).trim()) || null,
    customer_address_line1: autoCapitalize(d.customer_address_line1.trim()) || null,
    customer_address_line2: autoCapitalize(d.customer_address_line2.trim()) || null,
    customer_address_city: d.customer_address_city.trim() || null,
    customer_address_state: d.customer_address_state.trim() || null,
    customer_address_postcode: d.customer_address_postcode.trim() || null,
    customer_address_unknown: d.customer_address_unknown,
    customer_emergency: emergencyString(d) || null,
    customer_billing: billingString(d, baseline).trim() || null,
    customer_billing_same: d.customer_billing_same,
    proceed_date: d.proceed_date,
    delivery_floor: d.delivery_floor,
    delivery_has_lift: d.delivery_has_lift,
    delivery_stair_items: d.delivery_stair_items,
    entry_fields: entryFieldsPayloadOf(d),
  });
  const safeCorrectionPayload = (): Record<string, unknown> => headerPayloadOf(draft);

  /* The cart's floor, from the CATALOG's categories — recomputed as lines
   * change, exactly as the POS wizard does it. */
  const earliestPromise = useMemo(
    () =>
      earliestPromiseISO(
        draft.lines.map((l) => catalogBySku.get(l.sku.trim())?.category),
        catalogQ.data?.earliestSellDays,
      ),
    [draft.lines, catalogBySku, catalogQ.data?.earliestSellDays],
  );

  const validateDraft = (): string | null => {
    if (!draft.customer_name.trim()) return "Customer name is required";
    // Preserve unrelated legacy delivery facts when correcting contact details.
    // Any mixed delivery/commercial edit still uses the full checks.
    if (isContactOnlyCorrection(changedFields)) return null;
    /* Edit cannot return an order to no date, so a legacy TBD order picks one before it commits (owner ruling 2026-09-26). */
    if (!draft.delivery_date) return "Delivery date is required. Ask the customer for the date before you save the order.";
    /* The delivery date is a PROMISE (orders/MASTER — THE THREE DELIVERY
     * DATES). A date inside the production lead is a promise the factory
     * cannot keep, and the POS has refused it since 2026-05-22 — this door
     * now refuses it too, with the same arithmetic rather than a second one. */
    if (draft.delivery_date && earliestPromise && draft.delivery_date < earliestPromise) {
      return `Delivery is too soon. The earliest this cart can be promised is ${fmtDate(earliestPromise)}`;
    }
    if (draft.proceed_date && draft.delivery_date && draft.proceed_date > draft.delivery_date) {
      /* One refusal, one wording, every door (COPY-STANDARD); the planned date
         is `Planned production start` since the owner ruling of 2026-10-06. */
      return PLANNED_PRODUCTION_START_REFUSALS.afterDelivery;
    }
    /* Building type is DELIVERY's fact — stairs, lift access, van parking all
     * hang off it (Jess, 2026-08-21: it must be filled, delivery needs it).
     * An unknown address cannot demand one; a known address must say. */
    if (!draft.customer_address_unknown && !draft.building_type) {
      return "Fill in the building type first. A condominium can only take a half-day delivery.";
    }
    for (const a of draft.addons.filter((row) => !row.removed)) {
      if (SERVER_EXCLUSIVE_ADDON_KEYS.has(a.addon_key)) continue;
      const original = baseline.addons.find((row) => row.key === a.key);
      const changed = a.added || !original || a.qty !== original.qty || JSON.stringify(a.attrs) !== JSON.stringify(original.attrs);
      const pos = serviceSizeDraft(a, catalogQ.data?.addons.find((x) => x.key === a.addon_key)?.sizeOptions);
      if (changed && addonSizeOptions(pos).length && disposalUnitSizes(pos).some((size) => !size))
        return `Size for ${addonNameByKey.get(a.addon_key) ?? a.addon_key}`;
    }
    return null;
  };


  /* ══ 0562 · THE WHOLE-PAGE EDIT ════════════════════════════════════════════
   * The SERVER chooses Save or Submit amendment request (POST /changes runs the
   * shared `classifySalesOrderChange`); this page runs the SAME function only to
   * label the one button, so the label and the outcome cannot disagree. */
  const storedHeader = useMemo((): SalesOrderChangeSide["header"] => {
    const bagOf = (order ?? {}) as unknown as Record<string, unknown>;
    const out: SalesOrderChangeSide["header"] = {};
    for (const k of SALES_ORDER_EDIT_HEADER_KEYS) {
      out[k] = k === "entry_fields"
        ? ((order as { entry_data?: { fields?: Record<string, unknown> } | null } | undefined)?.entry_data?.fields ?? {})
        : bagOf[k];
    }
    return out;
  }, [order]);
  const draftHeader = (): Record<string, unknown> => ({
    ...safeCorrectionPayload(),
    delivery_date: draft.delivery_date,
    delivery_date_tbd: draft.delivery_date_tbd,
  });
  const liveLines = (d: Draft) =>
    d.lines
      .filter((l) => !l.removed && l.sku.trim())
      .map((l) => ({ ...(l.id ? { id: l.id } : {}), sku: l.sku.trim(), qty: l.qty, unit_price: l.unit_price, attrs: l.attrs ?? null }));
  const liveAddons = (d: Draft) =>
    d.addons
      .filter((a) => !a.removed)
      .map((a) => ({ ...(a.id ? { id: a.id } : {}), addon_key: a.addon_key, qty: a.qty, unit_price: a.unit_price, attrs: a.attrs ?? null }));
  const changeClass = useMemo(() => {
    if (mode !== "object" || !editing || !order) return null;
    const current: SalesOrderChangeSide = {
      header: {
        ...(headerPayloadOf(baseline) as SalesOrderChangeSide["header"]),
        delivery_date: baseline.delivery_date,
        delivery_date_tbd: baseline.delivery_date_tbd,
      },
      lines: liveLines(baseline),
      addons: liveAddons(baseline),
      installment_months: baseline.installment_months,
    };
    const next: SalesOrderChangeSide = {
      header: draftHeader() as SalesOrderChangeSide["header"],
      lines: liveLines(draft),
      addons: liveAddons(draft),
      installment_months: draft.installment_months,
    };
    return classifySalesOrderChange(current, next, {
      proceeded: order.status === "proceed_order",
      proceedRecorded: Boolean(order.proceed_date),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, editing, order, draft, baseline, storedHeader]);
  /* The count is what the REVIEW lists — one number, one source, so the header
     and the Before/After can never disagree (the summary rows are not changes). */
  const SUMMARY_ROWS = new Set(["Qty", "Services", "Total payable"]);
  const commitWord = salesOrderCommitWord(changeClass?.action ?? "save");

  /* What the draft starts elsewhere — read from facts this page already holds;
     never a second arithmetic for money it cannot verify. */
  const orderPaymentsQ = useOrderPayments(orderId ?? null);
  const nameOfSku = useCallback((sku: string) => catalogBySku.get(sku)?.label || sku, [catalogBySku]);
  const nameOfAddon = useCallback((key: string) => addonNameByKey.get(key) ?? key, [addonNameByKey]);
  /** Delivery owns service input; Items and the document read the same draft. */
  const serviceOptions = offerableAddons(catalogQ.data?.addons ?? []);
  const addServiceToDraft = (key: string) => {
    const hit = serviceOptions.find((x) => x.key === key);
    if (!hit) return;
    setDraft((d) => ({ ...d, addons: [...d.addons, { key: nextKey(), addon_key: hit.key, qty: 1, unit_price: Number(hit.price), attrs: null, added: true }] }));
  };
  const categoryOfSku = useCallback((sku: string) => catalogBySku.get(sku)?.category ?? null, [catalogBySku]);
  const consequencesFor = (after: { lines: DraftLine[]; addons: DraftAddon[]; header: Record<string, unknown> }) => {
    const out: string[] = [];
    const poSkus = new Set((detailQ.data?.pos ?? []).flatMap((po) => po.lines.map((l) => l.sku)));
    const unitsOf = new Map((goodsTruthQ.data?.lines ?? []).map((l) => [l.lineId, (l.verifiedUnitIds ?? l.unitIds ?? []) as string[]]));
    for (const l of after.lines) {
      const was = baseline.lines.find((b) => b.id && b.id === l.id);
      const changed = l.added || l.removed || !was || was.qty !== l.qty || was.sku !== l.sku ||
        JSON.stringify(was.attrs ?? null) !== JSON.stringify(l.attrs ?? null);
      if (!changed) continue;
      const name = nameOfSku(l.sku);
      if (l.added) out.push(`${name}: new goods. Purchasing buys them after approval`);
      else if (poSkus.has(l.sku)) out.push(`${name}: already ordered from the supplier. Purchasing settles it with the supplier`);
      else out.push(`${name}: no PO yet. Purchasing re-counts what to buy`);
      const units = l.id ? unitsOf.get(l.id) ?? [] : [];
      if (units.length) out.push(`${name}: Unit ${units.join(", ")} reserved. Warehouse keeps the Unit until the change is decided`);
    }
    if (after.lines.some((l) => l.removed && !protectedLine(l)) && after.lines.some((l) => protectedLine(l) && !l.removed))
      out.push("Free item: check it is still allowed without the cancelled item");
    if (after.header["proceed_date"] !== undefined && after.header["proceed_date"] !== (order?.proceed_date ?? null))
      out.push("Planned production start: Purchasing's release timing moves");
    if (after.header["delivery_date"] !== undefined && after.header["delivery_date"] !== (order?.delivery_date ?? null))
      out.push("Requested Delivery Date: Delivery and Purchasing plan to the new date");
    const before = baseline.lines.filter((l) => !l.removed).reduce((n, l) => n + l.qty * l.unit_price, 0)
      + baseline.addons.filter((a) => !a.removed).reduce((n, a) => n + a.qty * a.unit_price, 0);
    const next = after.lines.filter((l) => !l.removed).reduce((n, l) => n + l.qty * l.unit_price, 0)
      + after.addons.filter((a) => !a.removed).reduce((n, a) => n + a.qty * a.unit_price, 0);
    if (Math.round(before * 100) !== Math.round(next * 100)) {
      const paid = Number(order?.paid ?? 0);
      const rows = orderPaymentsQ.data?.payments ?? null;
      /* ⛔ A SUMMARY WITH NO RECORDS BEHIND IT IS NOT A PAID FIGURE (Payments
         MASTER; owner 2026-09-22): no refund or balance is worked out from it. */
      const verified = rows != null && (paid === 0 || rows.some((r) => isLivePayment(r)));
      if (!verified) out.push("Payments: payment data to check first. No refund or balance is worked out");
      else if (paid > next) out.push(`Payments: ${fmtMoney(paid - next)} paid more than the new total. Payments reviews a refund`);
      else out.push(`Payments: balance due becomes ${fmtMoney(next - paid)}`);
    }
    return out;
  };
  const HEADER_LABEL: Record<string, string> = {
    customer_name: "Full name", customer_phone: "Phone", customer_email: "Email", customer_race: "Race",
    customer_gender: "Gender", customer_birthday: "Birthday", customer_address: "Delivery address",
    customer_address_line1: "Address line 1", customer_address_line2: "Address line 2", customer_address_city: "City",
    customer_address_state: "State", customer_address_postcode: "Postcode", customer_address_unknown: "Address not given yet",
    customer_emergency: "Emergency contact", customer_billing: "Billing address", customer_billing_same: "Billing address same as delivery",
    entry_fields: "Other details", delivery_floor: "Floor", delivery_has_lift: "Lift available?",
    delivery_stair_items: "Items needing stair carry", proceed_date: "Planned production start",
    delivery_date: "Requested Delivery Date", delivery_date_tbd: "Delivery date to be confirmed",
  };
  const factWord = (k: string, v: unknown): string => {
    if (v == null || v === "") return "";
    if (k === "proceed_date" || k === "delivery_date" || k === "customer_birthday") return fmtDate(String(v));
    if (typeof v === "boolean") return v ? "Yes" : "No";
    if (k === "entry_fields" && typeof v === "object") return Object.values(v as Record<string, unknown>).filter(Boolean).join(" · ");
    return String(v);
  };
  const draftRows = changeClass
    ? diffRows({
        header: [
          ...changeClass.header.map((k) => ({
            label: HEADER_LABEL[k] ?? k,
            before: factWord(k, (headerPayloadOf(baseline) as Record<string, unknown>)[k] ?? (k === "delivery_date" ? baseline.delivery_date : k === "delivery_date_tbd" ? baseline.delivery_date_tbd : null)),
            after: factWord(k, (draftHeader() as Record<string, unknown>)[k]),
          })),
          ...(changeClass.installmentChanged
            ? [{ label: "Instalment months", before: String(baseline.installment_months ?? "None"), after: String(draft.installment_months ?? "None") }]
            : []),
        ],
        before: { lines: baseline.lines as EditLine[], addons: baseline.addons as EditAddon[] },
        after: { lines: draft.lines as EditLine[], addons: draft.addons as EditAddon[] },
        nameOfSku,
        nameOfAddon,
        categoryOf: categoryOfSku,
      })
    : [];

  const changeCount = draftRows.filter((r) => !SUMMARY_ROWS.has(r.what)).length;

  const startEdit = (seed?: Draft, replaceId?: string | null) => {
    if (seed) setDraft(seed);
    setReviewOpen(false);
    setChangeReason("");
    setChangeAskedOn(null);
    setChangeAgreement(null);
    setReplaceAmendmentId(replaceId ?? null);
    setEditing(true);
    setObjectView("Sales Order");
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("route");
        return next;
      },
      { replace: true, state: location.state },
    );
  };
  /* ⭐ 0565 · AN ISSUED VERSION KEEPS ITS DOCUMENT — owner ruling 2026-09-23:
     "Newly issued versions after this release: preserve their original issued
     PDFs as required. A warning does not replace this capability."

     The moment a version is minted, the CURRENT document IS that version, so
     the sheet stored is the one the order actually issues — rendered from the
     saved truth that has just been refetched, never from the draft. It is
     stored once and the database refuses a second file for the same version.

     ⛔ IT NEVER FAILS THE VERSION. The revision is already minted and is
     business truth; keeping its paper is a separate act. If the render or the
     upload fails, the version simply has no document and the page draws the
     reconstruction with its notice — the legacy case, honestly. */
  const keepIssuedDocument = async (revision: number | null | undefined) => {
    if (!orderId || !revision) return;
    try {
      const fresh = await baseQ.refetch();
      const base0 = fresh.data ?? null;
      if (!base0) return;
      /* ⛔ A NEW VERSION NEVER INHERITS AN OLDER VERSION'S SIGNATURE — owner
         ruling 2026-09-23. `base` carries the order's stored eSign PNG, which
         the customer put on whatever version was in front of them THEN. Storing
         it on the version minted now would file that mark under goods, prices
         and dates the customer never signed — the same defect the historical
         view was fixed for, made permanent by being written to a file.
         Nobody has signed the version being issued here, and which version the
         stored mark covers is unrecorded, so the sheet says exactly that. */
      const issued: SalesOrderTemplateData = base0.signature_url
        ? { ...base0, signed: false, signature_url: null, signature_unknown: true }
        : base0;
      const blob = await renderSalesOrderPdf(issued);
      const out = await storeIssuedSalesOrderDocument(orderId, revision, blob);
      if (!out.stored) console.error("issued document not kept", { orderId, revision, reason: out.reason });
      void revisionsQ.refetch();
    } catch (e) {
      console.error("issued document not kept", { orderId, revision, reason: e instanceof Error ? e.message : String(e) });
    }
  };

  const changesMut = useSubmitSalesOrderChanges(orderId ?? "", {
    onSuccess: (r) => {
      if (r.action === "saved") toast.success(`Saved (${r.revision})`);
      else {
        toast.success("Sent for approval. The order stays as it is until management approves.");
        if (changeAgreement && !r.agreementRecorded) toast.error("The customer agreement was not recorded. Record it on the request.");
      }
      setDraft(baseline);
      setEditing(false);
      setReviewOpen(false);
      setReplaceAmendmentId(null);
      void revisionsQ.refetch();
      void baseQ.refetch();
      void detailQ.refetch();
      void amendmentQ.refetch();
      /* A correction mints a version; that version keeps the sheet it issued. */
      if (r.action === "saved") void keepIssuedDocument(r.revision);
    },
    onError: (e) => toast.error(e.message),
  });
  const onCommit = () => {
    if (!changeClass || changeClass.action === "none") return;
    const err = validateDraft();
    if (err) return void toast.error(err);
    if (!changeReason.trim()) return void toast.error("Reason for change");
    changesMut.mutate({
      header: draftHeader(),
      lines: liveLines(draft),
      addons: liveAddons(draft),
      installment_months: draft.installment_months,
      reason: changeReason.trim(),
      customerAskedOn: changeAskedOn,
      agreement: changeAgreement ?? undefined,
      replaceAmendmentId,
    });
  };
  const decideMut = useDecideSalesOrderAmendment(orderId ?? "", {
    onSuccess: (r) => {
      toast.success(r.status === "applied" ? `Approved and applied (${r.revision})` : "Rejected. The order is unchanged.");
      void revisionsQ.refetch();
      void baseQ.refetch();
      void detailQ.refetch();
      /* An approved amendment mints a version the same way, and it keeps its
         document the same way. A rejection mints nothing. */
      if (r.status === "applied") void keepIssuedDocument(Number(r.revision));
    },
    onError: (e) => toast.error(e.message),
  });
  const agreementMut = useRecordAmendmentAgreement(orderId ?? "", {
    onSuccess: () => toast.success("Customer agreement recorded"),
    onError: (e) => toast.error(e.message),
  });

  /* ── The live request: what it proposes against the version it was sent on. ── */
  type Proposal = {
    header?: Record<string, unknown>;
    lines?: Array<{ id?: string; sku: string; qty: number; unit_price: number; attrs?: Record<string, unknown> | null }>;
    addons?: Array<{ id?: string; addon_key: string; qty: number; unit_price: number; attrs?: Record<string, unknown> | null }>;
    delivery_date?: string | null;
    delivery_date_tbd?: boolean;
    installment_months?: number | null;
  };
  const proposalOf = (a: typeof liveAmendment) => ((a?.proposed_snapshot ?? {}) as Proposal);
  const withProposal = (baseDraft: Draft, p: Proposal): Draft => {
    const next: Draft = { ...baseDraft };
    const h = p.header ?? {};
    const str = (k: string) => (h[k] == null ? "" : String(h[k]));
    const simple: Array<[string, keyof Draft]> = [
      ["customer_name", "customer_name"], ["customer_phone", "customer_phone"], ["customer_email", "customer_email"],
      ["customer_race", "customer_race"], ["customer_gender", "customer_gender"],
      ["customer_address", "customer_address"], ["customer_address_line1", "customer_address_line1"],
      ["customer_address_line2", "customer_address_line2"], ["customer_address_city", "customer_address_city"],
      ["customer_address_state", "customer_address_state"], ["customer_address_postcode", "customer_address_postcode"],
      ["customer_billing", "customer_billing"],
    ];
    for (const [k, f] of simple) if (k in h) (next as unknown as Record<string, unknown>)[f] = str(k);
    if ("customer_birthday" in h) next.customer_birthday = str("customer_birthday") || null;
    if ("customer_address_unknown" in h) next.customer_address_unknown = Boolean(h["customer_address_unknown"]);
    if ("customer_billing_same" in h) next.customer_billing_same = h["customer_billing_same"] !== false;
    if ("delivery_floor" in h) next.delivery_floor = Number(h["delivery_floor"] ?? 1);
    if ("delivery_has_lift" in h) next.delivery_has_lift = Boolean(h["delivery_has_lift"]);
    if ("delivery_stair_items" in h) next.delivery_stair_items = h["delivery_stair_items"] == null ? null : Number(h["delivery_stair_items"]);
    if ("proceed_date" in h) next.proceed_date = str("proceed_date") || null;
    if ("customer_emergency" in h) {
      const e = parseEmergencyContact(str("customer_emergency"));
      next.emergency_name = e.name; next.emergency_phone = e.phone; next.emergency_relationship = e.relationship;
    }
    if ("entry_fields" in h && h["entry_fields"] && typeof h["entry_fields"] === "object") {
      const f = h["entry_fields"] as Record<string, unknown>;
      if ("building_type" in f) next.building_type = f["building_type"] == null ? "" : String(f["building_type"]);
      const custom = { ...next.custom };
      for (const [k, v] of Object.entries(f)) if (k !== "building_type") custom[k] = v == null ? "" : String(v);
      next.custom = custom;
    }
    if ("delivery_date" in p) next.delivery_date = p.delivery_date ?? null;
    if ("delivery_date_tbd" in p) next.delivery_date_tbd = Boolean(p.delivery_date_tbd);
    if ("installment_months" in p) next.installment_months = p.installment_months ?? null;
    if (p.lines) {
      const kept = new Set(p.lines.filter((l) => l.id).map((l) => l.id));
      next.lines = [
        ...baseDraft.lines.map((l) => {
          const hit = p.lines!.find((x) => x.id && x.id === l.id);
          return hit ? { ...l, sku: hit.sku, qty: hit.qty, unit_price: Number(hit.unit_price), attrs: hit.attrs ?? undefined }
            : kept.has(l.id) ? l : { ...l, removed: true };
        }),
        ...p.lines.filter((l) => !l.id).map((l) => ({ key: nextKey(), sku: l.sku, qty: l.qty, unit_price: Number(l.unit_price), attrs: l.attrs ?? undefined, added: true })),
      ];
    }
    if (p.addons) {
      /* Pair by row id; a proposal or snapshot without ids falls back to the
         service key, so an untouched service does not read as cancelled-and-added. */
      const unmatched = [...p.addons];
      const take = (a: DraftAddon) => {
        let i = unmatched.findIndex((x) => x.id && x.id === a.id);
        if (i < 0 && !a.id) i = unmatched.findIndex((x) => !x.id && x.addon_key === a.addon_key);
        if (i < 0) i = unmatched.findIndex((x) => x.addon_key === a.addon_key && !x.id);
        return i < 0 ? undefined : unmatched.splice(i, 1)[0];
      };
      const kept = baseDraft.addons.map((a) => {
        const hit = take(a);
        return hit ? { ...a, qty: hit.qty, unit_price: Number(hit.unit_price), attrs: hit.attrs ?? a.attrs } : { ...a, removed: true };
      });
      next.addons = [
        ...kept,
        ...unmatched.map((a) => ({ key: nextKey(), ...(a.id ? { id: a.id } : {}), addon_key: a.addon_key, qty: a.qty, unit_price: Number(a.unit_price), attrs: a.attrs ?? null, added: true })),
      ];
    }
    return next;
  };
  const requestView = useMemo(() => {
    if (!liveAmendment || mode !== "object") return null;
    const baseRow = revisions.find((r) => r.revision === liveAmendment.base_revision);
    const before = baseRow ? draftFromSnapshot(baseRow.snapshot) : baseline;
    /* A snapshot's services carry no row id; pair them with today's rows by key
       so an unchanged service does not read as changed. */
    const idsByKey = new Map<string, string[]>();
    for (const a of detailQ.data?.addons ?? []) idsByKey.set(a.addon_key, [...(idsByKey.get(a.addon_key) ?? []), a.id]);
    before.addons = before.addons.map((a) => {
      const ids = idsByKey.get(a.addon_key) ?? [];
      const id = ids.shift();
      if (ids.length) idsByKey.set(a.addon_key, ids); else idsByKey.delete(a.addon_key);
      return id ? { ...a, id } : a;
    });
    const p = proposalOf(liveAmendment);
    const after = withProposal(before, p);
    const headerKeys = [...Object.keys(p.header ?? {}), ...(["delivery_date", "delivery_date_tbd"] as const).filter((k) => k in p)];
    const beforeHeader = (baseRow?.snapshot.header ?? {}) as Record<string, unknown>;
    const rows = diffRows({
      header: [
        ...headerKeys.map((k) => ({
          label: HEADER_LABEL[k] ?? k,
          before: factWord(k, beforeHeader[k]),
          after: factWord(k, k in (p.header ?? {}) ? (p.header ?? {})[k] : (p as Record<string, unknown>)[k]),
        })),
        ...("installment_months" in p
          ? [{ label: "Instalment months", before: String(before.installment_months ?? "None"), after: String(p.installment_months ?? "None") }]
          : []),
      ],
      before: { lines: before.lines as EditLine[], addons: before.addons as EditAddon[] },
      after: { lines: after.lines as EditLine[], addons: after.addons as EditAddon[] },
      nameOfSku,
      nameOfAddon,
      categoryOf: categoryOfSku,
    });
    return { rows, consequences: consequencesFor({ lines: after.lines, addons: after.addons, header: { ...(p.header ?? {}), ...("delivery_date" in p ? { delivery_date: p.delivery_date } : {}) } }) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveAmendment, revisions, baseline, mode, detailQ.data, catalogBySku, addonNameByKey, orderPaymentsQ.data, goodsTruthQ.data]);

  const setField = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));
  const setCustom = (key: string, value: string) =>
    setDraft((d) => ({ ...d, custom: { ...d.custom, [key]: value } }));

  const confirmDiscard = () => !dirty || window.confirm("Discard unsaved changes?");

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const openObjectView = (view: ObjectView) => {
    if (view !== "Sales Order" && !confirmDiscard()) return;
    if (view !== "Sales Order" && editing) {
      setDraft(baseline);
      setEditing(false);
    }
    setObjectView(view);
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (view === "Order Route") next.set("route", "1");
        else next.delete("route");
        return next;
      },
      { replace: true, state: location.state },
    );
  };

  /* ── The money the left side states (same arithmetic as the register). ── */
  const money = useMemo(() => {
    if (mode === "oldrev" && viewedRevision) {
      const lineSum = (viewedRevision.snapshot.lines ?? []).reduce(
        (s, l) => s + Number(l.qty) * Number(l.unit_price),
        0,
      );
      const addonSum = (viewedRevision.snapshot.addons ?? []).reduce(
        (s, a) => s + Number(a.qty) * Number(a.unit_price),
        0,
      );
      return { ...orderMoney({ lineSum, addonSum, paid: base?.paid ?? 0, controlBalance: null }), goods: lineSum, services: addonSum };
    }

    const lines = detailQ.data?.lines ?? [];
    const addons = detailQ.data?.addons ?? [];
    /* ⭐ THE BREAKDOWN IS THE SAME TWO SUMS, NAMED. The approved Payment totals
       show the goods amount and the service amount above `Total payable`
       (owner approval 2026-09-22). They are the very numbers `orderMoney`
       already adds — carried out of this memo rather than re-summed anywhere
       else, so there is still ONE arithmetic (Law D). */
    const lineSum = lines.reduce((s, l) => s + Number(l.unit_price ?? 0) * Number(l.qty ?? 0), 0);
    const addonSum = addons.reduce((s, a) => s + Number(a.unit_price ?? 0) * Number(a.qty ?? 0), 0);
    return {
      ...orderMoney({ lineSum, addonSum, paid: order?.paid, controlBalance: null }),
      goods: lineSum,
      services: addonSum,
    };
  }, [mode, base, viewedRevision, detailQ.data, order]);

  /* A line the current commitment no longer carries, but an earlier Revision
     did, was CANCELLED — and the Route states its outcome instead of letting
     it vanish. Derived from the revision ledger; nothing is stored. */
  const cancelledLines = useMemo(() => {
    const live = new Set((detailQ.data?.lines ?? []).map((line) => line.sku));
    const gone = new Map<string, { sku: string; label: string | null; qty: number; revision: number }>();
    for (const revision of revisions) {
      const present = new Set((revision.snapshot.lines ?? []).map((line) => line.sku));
      /* The FIRST Revision whose snapshot no longer holds the line is the one
         that cancelled it — the later ones merely inherit its absence. */
      for (const [sku, entry] of [...gone]) {
        if (!present.has(sku) && entry.revision === 0) {
          gone.set(sku, { ...entry, revision: revision.revision });
        }
      }
      for (const line of revision.snapshot.lines ?? []) {
        if (live.has(line.sku) || gone.has(line.sku)) continue;
        gone.set(line.sku, {
          sku: line.sku,
          label: line.description?.trim() || line.sku,
          qty: Number(line.qty),
          revision: 0,
        });
      }
    }
    return [...gone.values()].filter((entry) => entry.revision > 0);
  }, [detailQ.data, revisions]);

  const orderRoute: SalesOrderRouteModel | null = useMemo(() => {
    const detail = detailQ.data;
    const facts = routeFactsQ.data;
    if (!orderId || !detail?.order || !facts) return null;
    const caseStatus = new Map(
      (serviceCasesQ.data?.items ?? []).map((item) => [item.id, item.statusLabel ?? null]),
    );
    /* ONE input builder, shared with the Work page's route stops (Law D). */
    return resolveSalesOrderRoute(
      salesOrderRouteInputOf({
        orderId,
        detail: detail as RouteOrderDetail,
        facts,
        caseStatus,
        deliverToLines: goodsTruthQ.data?.lines,
        cancelledLines,
        money,
        /* Payment must be complete 3 working days before an outstation
           delivery, 2 in the Klang Valley — the Work panel's own reading of
           the partner (Law D). */
        outstation: routePartnerQ.data?.partner ? !routePartnerQ.data.partner.kvDefault : false,
        amendmentFailed: amendmentQ.isError,
        /* `PROPOSED CHANGE` — the same read the Order tab makes. Only a request
           still waiting for a decision is announced. */
        amendment:
          liveAmendment && (liveAmendment.status === "submitted" || liveAmendment.stale)
          ? {
              status: liveAmendment.stale ? "stale" : "submitted",
              submittedAt: liveAmendment.submitted_at ? mytDayOf(liveAmendment.submitted_at) : null,
              submittedBy: liveAmendment.submitted_by_name?.trim() || null,
              /* WHAT changes — the same rows the Order tab's request shows
                 (one arithmetic, Law D). The Route prints the first three. */
              changes: (requestView?.rows ?? []).map((row) => ({
                what: row.what,
                before: row.before,
                after: row.after,
              })),
            }
          : null,
      }),
    );
  }, [
    orderId,
    detailQ.data,
    routeFactsQ.data,
    goodsTruthQ.data,
    serviceCasesQ.data,
    cancelledLines,
    money,
    liveAmendment,
    amendmentQ.isError,
    requestView,
    routePartnerQ.data,
  ]);

  const retryRouteRead = useCallback(
    (owner: RouteRetryOwner) => {
      if (owner === "amendment") void amendmentQ.refetch();
      else void routeFactsQ.refetch();
    },
    [amendmentQ, routeFactsQ],
  );

  /* The Route hands out the action-engine line; the ROSTER names the person.
     One duty read, the same one the Team board and the PO chips use. */
  const dutyQ = useWorkspaceDuties();
  /* The PIC heads the header's Team, so the owner is read on every tab. */
  const orderOwnerQ = useCollectionOwner(orderId ?? null, true);
  const routeOrderOwner = useMemo(() => {
    const owner = orderOwnerQ.data?.owner ?? null;
    const userId = owner?.acting_user_id ?? owner?.normal_user_id ?? null;
    const name = owner?.acting_user_name ?? owner?.normal_user_name ?? null;
    return userId && name ? { userId, name, email: "" } : null;
  }, [orderOwnerQ.data]);
  const routeOwners = useMemo(
    () => routeActionOwnersOf(dutyQ.data, routeOrderOwner),
    [dutyQ.data, routeOrderOwner],
  );

  /* The real parties, with no placeholder — the attribution form supplies its
   * own "Keep …" and "Not recorded" entries, and two placeholders in one list
   * is how a picker ends up offering "Not recorded" twice. */
  const realSpOptions = useMemo(
    () => (salespersonsQ.data?.salespersons ?? []).map((s) => ({ value: s.id, label: s.name })),
    [salespersonsQ.data],
  );
  const realOutletOptions = useMemo(
    () => (outletsQ.data?.outlets ?? []).map((o) => ({ value: o.id, label: o.name })),
    [outletsQ.data],
  );
  const dealerOptions = useMemo(
    () => (dealersQ.data?.dealers ?? []).map((d) => ({ value: d.id, label: d.name })),
    [dealersQ.data],
  );

  /* CUSTOMER TYPE (AUTO) — the same probe the Sales Portal runs, on the same
     400ms debounce, read-only on both surfaces because nobody types it. */
  const probedPhone = useDebounced(draft.customer_phone.trim(), 400);
  const typeProbe = useCustomerTypeProbe(probedPhone);
  const customerTypeWord =
    probedPhone.length < 8
      ? "Not known yet"
      : typeProbe.isLoading
        ? "Checking…"
        : typeProbe.data?.existing
          ? "Existing customer"
          : "New customer";
  /* ⭐ `{n}` COUNTS WHAT THE DOOR OPENS (SO BUILD-1c, 2026-10-06 · Law D).
     The probe above answers New/Existing from an EXACT phone over every
     status; the door opens the Sales Orders Register, whose population is
     handed-over, non-cancelled, non-rental orders and whose server search
     matches the phone by digits. So `n` is the Register's own read for the
     SAME phone the door carries, counted on the server — never the probe's
     `matches`. Read only for an existing customer; a failed read, or one that
     answers no number, shows no count and no door. */
  const ordersDoorQ = useSalesOrderRegisterSearchCount(probedPhone, customerTypeWord === "Existing customer");
  const ordersDoorCount =
    ordersDoorQ.isSuccess && typeof ordersDoorQ.data?.count === "number" ? ordersDoorQ.data.count : 0;

  const liveBlocksCommercial =
    Boolean(liveAmendment && !liveAmendment.stale) && changeClass?.action === "submit" && !replaceAmendmentId;
  const canEditOrder = mode === "object" && Boolean(order) && order?.status !== "cancelled";

  const soWord = order ? `SO-${order.so}` : "Sales Order";

  const customerBuiltins = tab("customer").builtins;
  const emergencyEnabled = tab("emergency").builtins["emergency"]?.enabled !== false;

  /* Is there an address on this order AT ALL? Any one structured part counts,
     and so does an imported one-string address (AutoCount rows carry the whole
     thing in `customer_address` with every part null) — otherwise every legacy
     order would claim to have no address and be offered the tickbox that
     erases it. */
  const addressIsBlank =
    !draft.customer_address_line1.trim() &&
    !draft.customer_address_line2.trim() &&
    !draft.customer_address_state &&
    !draft.customer_address_city &&
    !draft.customer_address_postcode &&
    !(order?.customer_address ?? "").trim();

  /* ── The catalogue, as the editable Items rows read it. ─────────────────── */
  const catalogModel = useMemo(() => {
    const bundle = catalogQ.data;
    const bySku = new Map<string, { modelId: string; variant: string; price: number }>();
    const byModel = new Map<string, { name: string; category: string | null; gaps: string[]; skus: Array<{ sku: string; variant: string; price: number }> }>();
    if (bundle) {
      for (const m of bundle.models as Array<{ id: string; name: string; category?: string | null; gaps?: string[] | null; allowedOptions?: { gaps?: string[] } }>) {
        byModel.set(m.id, { name: m.name, category: m.category ?? null, gaps: m.allowedOptions?.gaps ?? m.gaps ?? [], skus: [] });
      }
      for (const k of bundle.skus as Array<{ sku: string; modelId: string; variant: string; price: number }>) {
        bySku.set(k.sku, { modelId: k.modelId, variant: k.variant, price: Number(k.price) });
        byModel.get(k.modelId)?.skus.push({ sku: k.sku, variant: k.variant, price: Number(k.price) });
      }
    }
    return { bySku, byModel };
  }, [catalogQ.data]);
  const [configOpen, setConfigOpen] = useState<Set<string>>(new Set());
  const [addSku, setAddSku] = useState("");
  const setDraftLine = (key: string, patch: Partial<DraftLine>) =>
    setDraft((d) => ({ ...d, lines: d.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));
  const setDraftAddon = (key: string, patch: Partial<DraftAddon>) =>
    setDraft((d) => ({ ...d, addons: d.addons.map((a) => (a.key === key ? { ...a, ...patch } : a)) }));
  const surchargeOf = (attrs: Record<string, unknown> | undefined | null) =>
    Number((attrs as { specials_total?: number } | null)?.specials_total ?? 0) +
    Number((attrs as { options_total?: number } | null)?.options_total ?? 0);
  /** ⭐ A GIFT / PWP / BUNDLE LINE KEEPS ITS PROTECTION (0385; owner-approved
   *  item contract 2026-09-22): its eligibility and source are not a generic
   *  qty or price box, and the database refuses an edit to one. It reads in
   *  the draft; cancelling its PARENT shows the gift consequence instead. */
  const protectedLine = (l: DraftLine) =>
    ["free_gift", "free_item", "pwp", "bundle_group", "combo_key"].some((k) => (l.attrs ?? {})[k] !== undefined);

  /* ══ THE DETAIL — owner-confirmed handoff 2026-10-08 (Layout Standard §3.2):
     object header on the canvas · Sales Order · Order Route · Timeline. The
     amendment keeps the 0562 business flow: the SERVER chooses Save or
     Submit, the reason is required, the customer agreement gates approval. */
  const [menuPdf, setMenuPdf] = [pdfOpen, setPdfOpen];
  const [revOpen, setRevOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawReason, setWithdrawReason] = useState("");
  const [whyOpen, setWhyOpen] = useState(false);
  const [proofOpen, setProofOpen] = useState(false);
  const [discardAsk, setDiscardAsk] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [openFields, setOpenFields] = useState<Set<string>>(new Set());
  const openField = (id: string) => setOpenFields((s) => new Set(s).add(id));
  useEffect(() => {
    if (!editing) {
      setOpenFields(new Set());
      setEditError(null);
      setDiscardAsk(false);
      setWhyOpen(false);
      setProofOpen(false);
    }
  }, [editing]);

  const withdrawMut = useWithdrawSalesOrderAmendment(orderId ?? "", {
    onSuccess: () => {
      toast.success("Amendment withdrawn. The order is unchanged.");
      setWithdrawOpen(false);
      setWithdrawReason("");
      void amendmentQ.refetch();
      void detailQ.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const discardEdit = () => {
    setDraft(baseline);
    setEditing(false);
    setReplaceAmendmentId(null);
    setDiscardAsk(false);
  };
  const tryCommit = () => {
    setEditError(null);
    if (changeCount === 0) return setEditError("Nothing changed yet. Click the pencil next to a detail to change it.");
    const err = validateDraft();
    if (err) return setEditError(err);
    if (!changeReason.trim()) {
      setWhyOpen(true);
      return setEditError("Write why first. Reason for change is required.");
    }
    setWhyOpen(false);
    setProofOpen(false);
    setReviewOpen(true);
  };

  const downloadPdf = async () => {
    if (storedDocumentUrl) {
      window.open(storedDocumentUrl, "_blank");
      return;
    }
    if (!printData) return;
    const blob = await renderSalesOrderPdf(printData);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${soWord}${mode === "oldrev" && viewRev ? `(${viewRev})` : ""}.pdf`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  };
  const copy = (text: string, what: string) => {
    void navigator.clipboard?.writeText(text).then(
      () => toast.success(`${what} copied`),
      () => toast.error(`${what} could not be copied`),
    );
  };
  const backToCurrent = () => {
    setViewRev(null);
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("revision");
      return next;
    }, { replace: true, state: location.state });
  };

  /* ── WHO: the PIC first, then the duty holders the route already names. ── */
  const team = useMemo((): Person[] => {
    const out: Person[] = [];
    const add = (p: { userId: string; name: string | null; email?: string } | null | undefined, role: string) => {
      if (!p?.userId) return;
      const hit = out.find((x) => x.userId === p.userId);
      if (hit) {
        if (!hit.roles?.includes(role)) hit.roles = [...(hit.roles ?? []), role];
        return;
      }
      out.push({ userId: p.userId, name: p.name, email: p.email ?? "", roles: [role] });
    };
    add(routeOrderOwner, "PIC");
    add(routeOwners.purchasing, "PO Duty");
    add(routeOwners.receiving, "GRN Duty");
    add(routeOwners.delivery, "Delivery");
    add(routeOwners.payment, "Payments");
    return out;
  }, [routeOrderOwner, routeOwners]);

  const statusPill = !order
    ? null
    : order.status === "cancelled"
      ? { word: "Cancelled", tone: "info" as const }
      : order.status === "delivered" || order.delivered_at
        ? { word: "Delivered", tone: "ok" as const }
        : order.status === "place"
          ? { word: "Placed", tone: "info" as const }
          : { word: "Open", tone: "info" as const };

  /* ── THE THREE DELIVERY DATE WORDS (Ops Rules §5). The original is revision
     1's own requested date — never the mutable order date (Orders MASTER). ── */
  const rev1 = revisions.find((r) => r.revision === 1) ?? null;
  const originalDate: string | null =
    rev1 && !rev1.snapshot.header?.["delivery_date_tbd"] && rev1.snapshot.header?.["delivery_date"]
      ? String(rev1.snapshot.header["delivery_date"]).slice(0, 10)
      : null;
  const shownDelivery = draft.delivery_date_tbd ? null : draft.delivery_date;
  const dateChanges = useMemo(() => {
    let n = 0;
    for (let i = 1; i < revisions.length; i++) {
      const a = revisions[i - 1]!.snapshot.header?.["delivery_date"] ?? null;
      const b = revisions[i]!.snapshot.header?.["delivery_date"] ?? null;
      if (String(a ?? "") !== String(b ?? "")) n++;
    }
    return n;
  }, [revisions]);
  const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th"}`;
  const postponed = Boolean(originalDate && shownDelivery && shownDelivery.slice(0, 10) !== originalDate);

  /* ── One row of a detail card: value, pencil while amending, the input once
     opened or changed, `Was:` under a changed value. ─────────────────────── */
  const isChanged = (keys: ReadonlyArray<keyof Draft>) =>
    mode === "object" && editing && keys.some((k) => JSON.stringify(draft[k]) !== JSON.stringify(baseline[k]));
  const row = (
    id: string,
    label: string,
    shown: { value: React.ReactNode; muted: boolean },
    keys: ReadonlyArray<keyof Draft>,
    editor: React.ReactNode | null,
    was?: string,
  ) => (
    <KvRow
      key={id}
      testId={`so-row-${id}`}
      label={label}
      value={shown.value}
      muted={shown.muted}
      editing={!formLocked && Boolean(editor)}
      editor={editor}
      open={openFields.has(id)}
      onOpen={() => openField(id)}
      changed={isChanged(keys)}
      was={was}
    />
  );
  const dateFact = (iso: string | null | undefined) => factOf(iso ? fmtDate(iso) : "");
  const customRows = (fields: CustomField[]) =>
    fields.map((f) => {
      const value = draft.custom[f.key] ?? "";
      const editor =
        f.type === "select" ? (
          <CSelect id={`so-custom-${f.key}`} label={f.label} value={value} onChange={(v) => setCustom(f.key, v)}
            options={f.options.map((o) => ({ value: o, label: o }))} />
        ) : f.type === "date" ? (
          <CDate id={`so-custom-${f.key}`} label={f.label} value={value || null} onChange={(iso) => setCustom(f.key, iso ?? "")} />
        ) : (
          <CInput id={`so-custom-${f.key}`} label={f.label} type={f.type === "number" ? "number" : "text"} value={value}
            onChange={(e) => setCustom(f.key, e.target.value)} />
        );
      return (
        <KvRow
          key={f.key}
          testId={`so-row-custom-${f.key}`}
          label={f.label}
          value={f.type === "date" && value ? fmtDate(value) : value || NOT_RECORDED}
          muted={!value}
          editing={mode === "object" && editing}
          editor={editor}
          open={openFields.has(`custom-${f.key}`)}
          onOpen={() => openField(`custom-${f.key}`)}
          changed={mode === "object" && editing && (draft.custom[f.key] ?? "") !== (baseline.custom[f.key] ?? "")}
          was={baseline.custom[f.key] ?? ""}
        />
      );
    });

  /* ── SALES (set by the Sales Portal) ─────────────────────────────────── */
  const proceededAt = (bag(order)["proceeded_at"] as string | null | undefined) ?? null;
  const salesFact = (k: string, v: { value: string; muted: boolean }) => (
    <>
      <span className="text-[12px] text-c-secondary">{k}</span>
      <span className={`break-words text-[13px] font-medium ${v.muted ? "text-c-muted" : "text-c-ink"}`}>{v.value}</span>
    </>
  );
  const FACT = "flex min-w-0 flex-col gap-0.5";
  const salesCard = (
    <Card label="Sales" testId="so-card-sales">
      <CardTitle note={mode === "object" && editing ? "Set by Sales Portal" : undefined}>Sales</CardTitle>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-x-4 gap-y-2 border-t border-c-section-line pt-2">
        <span className={FACT} data-testid="so-fact-so-doc-date">{salesFact("SO Doc Date", dateFact(order?.placed_at))}</span>
        <span className={FACT} data-testid="so-fact-proceed-date">{salesFact("Proceed Date", dateFact(mode === "oldrev" ? null : proceededAt))}</span>
        <span className={FACT} data-testid="so-fact-dealer">{salesFact("Dealer", factOf(sourceName(mode, viewedRevision, order, "dealer")))}</span>
        <span className={FACT} data-testid="so-fact-sales-location" data-pos-field="outlet">{salesFact("Sales Location", factOf(sourceName(mode, viewedRevision, order, "outlet")))}</span>
        <span className={FACT} data-testid="so-fact-salesperson" data-pos-field="salesperson">{salesFact("Salesperson", factOf(sourceName(mode, viewedRevision, order, "salesperson")))}</span>
        {/* `Planned production start` (owner ruling 2026-10-06) is asked in the
            amendment only: a recorded date is the factory's start and the
            server refuses to move it; a never-recorded one may be filled once. */}
        {mode === "object" && editing && (
          <span className="flex min-w-0 flex-col gap-0.5" data-pos-field="proceedDate">
            <span className="text-[12px] text-c-secondary">Planned production start</span>
            <CDate id="so-proceed" label="Planned production start" value={draft.proceed_date} onChange={(iso) => setField("proceed_date", iso)} />
            {!baseline.proceed_date && <span className="text-[12px] text-c-muted">Never recorded. Fill it in once, then it locks</span>}
            {draft.proceed_date && draft.delivery_date && draft.proceed_date > draft.delivery_date && (
              <span className="text-[12px] text-c-warn-fg">After the delivery date</span>
            )}
          </span>
        )}
        {customRowsAsFacts(tab("target").custom)}
      </div>
    </Card>
  );
  function customRowsAsFacts(fields: CustomField[]) {
    return fields.map((f) => {
      const value = draft.custom[f.key] ?? "";
      return (
        <span key={f.key} className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[12px] text-c-secondary">{f.label}</span>
          {mode === "object" && editing ? (
            <CInput id={`so-custom-${f.key}`} label={f.label} value={value} onChange={(e) => setCustom(f.key, e.target.value)} />
          ) : (
            <span className={`break-words text-[13px] font-medium ${value ? "text-c-ink" : "text-c-muted"}`}>
              {f.type === "date" && value ? fmtDate(value) : value || NOT_RECORDED}
            </span>
          )}
        </span>
      );
    });
  }

  /* ── CUSTOMER + EMERGENCY CONTACT ─────────────────────────────────────── */
  const customerTypeValue = (
    <span data-pos-field="customerType" data-testid="customer-type-chip">
      {customerTypeWord}
      {customerTypeWord === "Existing customer" && ordersDoorCount > 0 && (
        <>
          {" · "}
          <Link
            to={`/operation/orders?search=${encodeURIComponent(probedPhone)}`}
            className="font-semibold text-c-ink underline-offset-2 hover:underline"
            data-testid="customer-orders-door"
          >
            {ordersDoorCount === 1 ? "1 order" : `${ordersDoorCount} orders`} ›
          </Link>
        </>
      )}
    </span>
  );
  const customerCard = (
    <Card label="Customer and emergency contact" testId="so-card-customer" className="gap-[18px]">
      <section className="flex flex-col" data-pos-field="name">
        <CardTitle>Customer</CardTitle>
        {row("name", "Full name", factOf(draft.customer_name), ["customer_name"],
          <CInput id="so-name" label="Full name" value={draft.customer_name} onChange={(e) => setField("customer_name", e.target.value)} />, baseline.customer_name)}
        <span data-pos-field="phone" className="contents">
          {row("phone", "Phone", factOf(draft.customer_phone), ["customer_phone"],
            <CInput id="so-phone" label="Phone" value={draft.customer_phone} onChange={(e) => setField("customer_phone", e.target.value)} />, baseline.customer_phone)}
        </span>
        {customerBuiltins["email"]?.enabled !== false && (
          <span data-pos-field="email" className="contents">
            {row("email", "Email", factOf(draft.customer_email), ["customer_email"],
              <CInput id="so-email" label="Email" type="email" value={draft.customer_email} onChange={(e) => setField("customer_email", e.target.value)} />, baseline.customer_email)}
          </span>
        )}
        {customerBuiltins["customerType"]?.enabled !== false &&
          row("customer-type", "Customer type", { value: customerTypeValue, muted: customerTypeWord === "Not known yet" }, [], null)}
        {customerBuiltins["race"]?.enabled !== false && (
          <span data-pos-field="race" className="contents">
            {row("race", "Race", factOf(draft.customer_race), ["customer_race"],
              <CSelect id="so-race" label="Race" value={draft.customer_race} onChange={(v) => setField("customer_race", v)}
                options={CUSTOMER_RACE_OPTIONS.map((r) => ({ value: r, label: r }))} />, baseline.customer_race)}
          </span>
        )}
        {customerBuiltins["gender"]?.enabled !== false && (
          <span data-pos-field="gender" className="contents">
            {row("gender", "Gender", factOf(draft.customer_gender), ["customer_gender"],
              <CSelect id="so-gender" label="Gender" value={draft.customer_gender} onChange={(v) => setField("customer_gender", v)}
                options={CUSTOMER_GENDER_OPTIONS.map((g) => ({ value: g, label: g }))} />, baseline.customer_gender)}
          </span>
        )}
        {customerBuiltins["birthday"]?.enabled !== false && (
          <span data-pos-field="birthday" className="contents">
            {row("birthday", "Birthday", dateFact(draft.customer_birthday), ["customer_birthday"],
              <CDate id="so-birthday" label="Birthday" value={draft.customer_birthday} onChange={(iso) => setField("customer_birthday", iso)} />,
              baseline.customer_birthday ? fmtDate(baseline.customer_birthday) : "")}
          </span>
        )}
        {customRows(tab("customer").custom)}
      </section>
      {emergencyEnabled && (
        <section className="flex flex-col" data-pos-field="emergency">
          <CardTitle>Emergency contact</CardTitle>
          {row("emergency-name", "Contact name", factOf(draft.emergency_name), ["emergency_name"],
            <CInput id="so-emergency-name" label="Contact name" value={draft.emergency_name} onChange={(e) => setField("emergency_name", e.target.value)} />, baseline.emergency_name)}
          {row("emergency-relationship", "Relationship", factOf(draft.emergency_relationship), ["emergency_relationship"],
            <>
              <CInput id="so-emergency-relationship" label="Relationship" list="so-emergency-relationships" value={draft.emergency_relationship}
                onChange={(e) => setField("emergency_relationship", e.target.value)} />
              <datalist id="so-emergency-relationships">
                {EMERGENCY_RELATIONSHIPS.map((r) => <option key={r} value={r} />)}
              </datalist>
            </>, baseline.emergency_relationship)}
          {row("emergency-phone", "Phone", factOf(draft.emergency_phone), ["emergency_phone"],
            <CInput id="so-emergency-phone" label="Emergency phone" value={draft.emergency_phone} onChange={(e) => setField("emergency_phone", e.target.value)} />, baseline.emergency_phone)}
          {customRows(tab("emergency").custom)}
        </section>
      )}
    </Card>
  );

  /* ── DELIVERY + ADDRESS ───────────────────────────────────────────────── */
  const fullAddressFallback = addressIsBlank ? "" : !draft.customer_address_line1.trim() && !draft.customer_address_city ? draft.customer_address : "";
  const deliveryCard = (
    <Card label="Delivery and address" testId="so-card-delivery" className="gap-[18px]">
      <section className="flex flex-col" data-pos-field="deliveryDate">
        <CardTitle>Delivery</CardTitle>
        {row("original-date", "Customer original delivery date", dateFact(originalDate), [], null)}
        {(postponed || draft.delivery_date_tbd || (mode === "object" && editing)) &&
          row(
            "new-date",
            "Customer new delivery date",
            draft.delivery_date_tbd
              ? { value: <span data-attention="warning" className="rounded-lg bg-c-warn-bg px-1.5 py-0.5 text-c-warn-fg">No delivery date</span>, muted: false }
              : postponed && shownDelivery
                ? { value: `${fmtDate(shownDelivery)}${dateChanges > 0 ? ` (${ordinal(dateChanges)} change)` : ""}`, muted: false }
                : { value: "Not yet", muted: true },
            ["delivery_date", "delivery_date_tbd"],
            <span className="flex flex-col gap-0.5">
              <CDate id="so-promised" label="Customer new delivery date" value={draft.delivery_date} min={earliestPromise ?? undefined}
                /* A date changes only into another date: picking one ends a legacy TBD (owner ruling 2026-09-26). */
                onChange={(iso) => setDraft((d) => ({ ...d, delivery_date: iso, delivery_date_tbd: false }))} />
              {earliestPromise && (
                <span className={`text-[12px] ${draft.delivery_date && draft.delivery_date < earliestPromise ? "text-c-warn-fg" : "text-c-muted"}`}>
                  {draft.delivery_date && draft.delivery_date < earliestPromise ? `Too soon. Earliest is ${fmtDate(earliestPromise)}` : `Earliest ${fmtDate(earliestPromise)} (production lead)`}
                </span>
              )}
            </span>,
            baseline.delivery_date ? fmtDate(baseline.delivery_date) : "",
          )}
        <span data-pos-field="stairCarry" className="contents">
          {row("floor", "Floor", { value: String(draft.delivery_floor), muted: false }, ["delivery_floor"],
            <CInput id="so-floor" label={`Floor (Max is ${MAX_DELIVERY_FLOOR}rd Floor)`} type="number" min={1} max={MAX_DELIVERY_FLOOR}
              value={String(draft.delivery_floor)}
              onChange={(e) => setField("delivery_floor", Math.min(MAX_DELIVERY_FLOOR, Math.max(1, Number(e.target.value) || 1)))} />,
            String(baseline.delivery_floor))}
          {row("lift", "Lift", { value: draft.delivery_has_lift ? "Has lift" : "No lift", muted: false }, ["delivery_has_lift"],
            <CSelect id="so-lift" label="Lift available?" value={draft.delivery_has_lift ? "Has lift" : "No lift"}
              onChange={(v) => setField("delivery_has_lift", v === "Has lift")}
              options={LIFT_OPTIONS.map((o) => ({ value: o, label: o }))} />,
            baseline.delivery_has_lift ? "Has lift" : "No lift")}
          {mode === "object" && editing &&
            row("stair-items", "Items needing stair carry",
              factOf(draft.delivery_stair_items == null ? "" : String(draft.delivery_stair_items)), ["delivery_stair_items"],
              <CInput id="so-stair-items" label="Items needing stair carry" type="number" min={0} max={stair?.itemsTotal}
                value={draft.delivery_stair_items == null ? "" : String(draft.delivery_stair_items)}
                onChange={(e) =>
                  setField(
                    "delivery_stair_items",
                    e.target.value === ""
                      ? null
                      : stair
                        ? stairCarryCount(stair.itemsTotal, Number(e.target.value) || 0)
                        : Math.max(0, Number(e.target.value) || 0),
                  )
                } />,
              baseline.delivery_stair_items == null ? "" : String(baseline.delivery_stair_items))}
          {row("stair-fee", "Stair carry fee", { value: <span data-testid="so-stair-working" className="tabular-nums">{fmtMoney(stairWorking?.fee ?? 0)}</span>, muted: false }, [], null)}
        </span>
      </section>
      <section className="flex flex-col" data-pos-field="address">
        <CardTitle>Address</CardTitle>
        {mode === "object" && editing && (addressIsBlank || draft.customer_address_unknown) &&
          row("address-unknown", "Address not given yet", { value: draft.customer_address_unknown ? "Yes" : "No", muted: false }, ["customer_address_unknown"],
            <CSelect id="so-address-unknown" label="Address not given yet" value={draft.customer_address_unknown ? "yes" : "no"}
              onChange={(v) => setField("customer_address_unknown", v === "yes")}
              options={[{ value: "no", label: "No" }, { value: "yes", label: "Yes" }]} />)}
        {row("line1", "Address line 1",
          draft.customer_address_unknown ? { value: "Address not given yet", muted: true } : factOf(draft.customer_address_line1 || fullAddressFallback),
          ["customer_address_line1"],
          <CInput id="so-line1" label="Address line 1" value={draft.customer_address_line1} disabled={draft.customer_address_unknown}
            onChange={(e) => setField("customer_address_line1", e.target.value)} />, baseline.customer_address_line1)}
        {row("line2", "Address line 2", factOf(draft.customer_address_line2), ["customer_address_line2"],
          <CInput id="so-line2" label="Address line 2" value={draft.customer_address_line2} disabled={draft.customer_address_unknown}
            onChange={(e) => setField("customer_address_line2", e.target.value)} />, baseline.customer_address_line2)}
        {row("city-state", "City / state",
          factOf([draft.customer_address_city, draft.customer_address_state].filter(Boolean).join(", ")),
          ["customer_address_city", "customer_address_state"],
          <span className="grid grid-cols-2 gap-1.5">
            <CSelect id="so-state" label="State" placeholder="State" value={draft.customer_address_state} disabled={draft.customer_address_unknown}
              onChange={(v) => setDraft((d) => ({ ...d, ...addressCascadePatch("state", v) }))}
              options={MY_STATES.map((st) => ({ value: st, label: st }))} />
            <CSelect id="so-city" label="City" placeholder={draft.customer_address_state ? "City" : "Pick a state first"} value={draft.customer_address_city}
              disabled={draft.customer_address_unknown || !draft.customer_address_state}
              onChange={(v) => setDraft((d) => ({ ...d, ...addressCascadePatch("city", v) }))}
              options={getCities(draft.customer_address_state || null).map((c) => ({ value: c, label: c }))} />
          </span>,
          [baseline.customer_address_city, baseline.customer_address_state].filter(Boolean).join(", "))}
        {row("postcode", "Postcode", factOf(draft.customer_address_postcode), ["customer_address_postcode"],
          <CSelect id="so-postcode" label="Postcode" placeholder={draft.customer_address_city ? "Postcode" : "Pick a city first"}
            value={draft.customer_address_postcode} disabled={draft.customer_address_unknown || !draft.customer_address_city}
            onChange={(v) => setField("customer_address_postcode", v)}
            options={getPostcodes(draft.customer_address_state || null, draft.customer_address_city || null).map((pc) => ({ value: pc, label: pc }))} />,
          baseline.customer_address_postcode)}
        {row("building-type", "Building type", factOf(draft.building_type), ["building_type"],
          <span className="flex flex-col gap-0.5">
            <CSelect id="so-building-type" label="Building type" value={draft.building_type} onChange={(v) => setField("building_type", v)}
              options={BUILDING_TYPE_OPTIONS.map((b) => ({ value: b, label: b }))} />
            {!draft.customer_address_unknown && !draft.building_type && (
              <span className="text-[12px] text-c-warn-fg">Fill in the building type first. A condominium can only take a half-day delivery.</span>
            )}
          </span>, baseline.building_type)}
        <span data-pos-field="billing" className="contents">
          {row("billing", "Billing address",
            draft.customer_billing_same ? { value: "Same as delivery", muted: false } : factOf(draft.customer_billing),
            ["customer_billing_same", "customer_billing"],
            <span className="flex flex-col gap-1.5">
              <CSelect id="so-billing-same" label="Billing address same as delivery" value={draft.customer_billing_same ? "same" : "other"}
                onChange={(v) => setField("customer_billing_same", v === "same")}
                options={[{ value: "same", label: "Same as delivery" }, { value: "other", label: "Different address" }]} />
              {!draft.customer_billing_same && (
                <CInput id="so-billing" label="Billing address" value={draft.customer_billing} onChange={(e) => setField("customer_billing", e.target.value)} />
              )}
            </span>,
            baseline.customer_billing_same ? "Same as delivery" : baseline.customer_billing)}
        </span>
        {customRows(tab("address").custom)}
      </section>
    </Card>
  );

  /* ── ITEMS + PAYMENT (Law D: every figure from the `money` memo) ──────── */
  const editTotal =
    draft.lines.filter((l) => !l.removed && l.sku.trim()).reduce((n, l) => n + l.qty * l.unit_price, 0) +
    draft.addons.filter((a) => !a.removed).reduce((n, a) => n + a.qty * a.unit_price, 0);
  const qtyTotal = draft.lines.filter((l) => !l.removed && l.sku.trim()).reduce((n, l) => n + l.qty, 0);
  /* THE LOCKED STATE (owner ruling 2026-09-26): View and a historical version
     are ONE locked presentation; the amendment alone draws controls. */
  const amending = !formLocked;
  const ITEM_COLS = "grid grid-cols-[24px_minmax(0,1fr)_56px_110px_110px] gap-3";
  const paymentWord = atSalePaymentWord(order?.payment_method, order?.installment_months ?? null);
  const slip = order?.payment_slip_url ?? null;
  const itemsCard = (
    <Card label="Items and payment" testId="so-card-items">
      <CardTitle note={amending ? undefined : undefined}>Items</CardTitle>
      <div className="overflow-x-auto" data-testid="edit-items">
        <div role="table" aria-label="Items" className="min-w-[520px] text-[13px] tabular-nums" data-testid="edit-goods">
          <div role="row" className={`${ITEM_COLS} border-b border-t border-b-c-head-line border-t-c-row-line py-[7px] text-[12px] text-c-muted`}>
            <span>#</span><span>Item</span><span className="text-right">Qty</span><span className="text-right">Unit price</span><span className="text-right">Amount</span>
          </div>
          {draft.lines.filter((l) => l.sku.trim()).map((l, i) => {
            const known = catalogModel.bySku.get(l.sku);
            const model = known ? catalogModel.byModel.get(known.modelId) : undefined;
            const canConfig = !l.removed && model && (model.skus.length > 1 || model.gaps.length > 0);
            const strike = l.removed ? "line-through text-c-muted" : "";
            const open = configOpen.has(l.key);
            const locked = !amending || l.removed || protectedLine(l);
            return (
              <div key={l.key} data-testid={`edit-line-${i + 1}`}>
                <div role="row" className={`${ITEM_COLS} items-baseline border-b border-c-row-line py-2`}>
                  <span className="text-c-muted">{i + 1}</span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className={`break-words ${strike}`}>
                      <span className="font-medium text-c-ink">{nameOfSku(l.sku)}</span>{" "}
                      <span className="text-c-muted">· {l.sku}</span>
                    </span>
                    {configWords(l.attrs) && <span className={`text-[12px] text-c-secondary ${strike}`}>{configWords(l.attrs)}</span>}
                    {!known && catalogQ.data && <span className="text-[12px] text-c-warn-fg">{NOT_IN_CATALOG}</span>}
                    {l.added && <span className="text-[12px] font-semibold text-c-ok-fg">New line</span>}
                    {l.removed && <span className="text-[12px] text-c-warn-fg">Cancelled when approved · Restore to keep it</span>}
                    {protectedLine(l) && <span className="text-[12px] text-c-secondary">Free item. It follows the item it came with</span>}
                    {amending && !protectedLine(l) && (
                      <span className="flex flex-wrap gap-x-4 text-[12px] font-semibold">
                        {canConfig && (
                          <button type="button" className="text-c-ink hover:underline" aria-expanded={open} aria-label={`Configure ${nameOfSku(l.sku)}`}
                            onClick={() => setConfigOpen((st) => { const n = new Set(st); if (n.has(l.key)) n.delete(l.key); else n.add(l.key); return n; })}>
                            {open ? "Close configuration" : "Configure"}
                          </button>
                        )}
                        {l.removed ? (
                          <button type="button" className="text-c-ink hover:underline" aria-label={`Restore ${nameOfSku(l.sku)}`}
                            onClick={() => setDraftLine(l.key, { removed: false })}>Restore</button>
                        ) : (
                          <button type="button" className="text-c-warn-fg hover:underline" aria-label={`Remove ${nameOfSku(l.sku)}`}
                            onClick={() => (l.added
                              ? setDraft((d) => ({ ...d, lines: d.lines.filter((x) => x.key !== l.key) }))
                              : setDraftLine(l.key, { removed: true }))}>Remove</button>
                        )}
                      </span>
                    )}
                  </span>
                  <span className={`text-right text-c-ink ${strike}`}>
                    {locked ? l.qty : (
                      <CInput id={`so-edit-qty-${l.key}`} label={`Qty ${nameOfSku(l.sku)}`} type="number" min={1} value={String(l.qty)} className="text-right"
                        onChange={(e) => setDraftLine(l.key, { qty: Math.max(1, Number(e.target.value) || 1) })} />
                    )}
                  </span>
                  <span className={`text-right text-c-secondary ${strike}`}>
                    {locked ? fmtMoney(l.unit_price) : (
                      <CInput id={`so-edit-price-${l.key}`} label={`Unit price ${nameOfSku(l.sku)}`} type="number" min={0} step="0.01" value={String(l.unit_price)} className="text-right"
                        onChange={(e) => setDraftLine(l.key, { unit_price: Math.max(0, Number(e.target.value) || 0) })} />
                    )}
                  </span>
                  <span className={`text-right text-c-ink ${strike}`}>{fmtMoney(l.qty * l.unit_price)}</span>
                </div>
                {amending && open && canConfig && (
                  <div className="grid grid-cols-1 gap-2 border-b border-c-row-line bg-c-ground px-2 py-2 sm:grid-cols-3">
                    {model!.skus.length > 1 && (
                      <CSelect id={`so-edit-size-${l.key}`} label="Size" value={l.sku}
                        onChange={(sku) => {
                          const hit = model!.skus.find((x) => x.sku === sku);
                          if (!hit) return;
                          setDraftLine(l.key, { sku, unit_price: hit.price + surchargeOf(l.attrs) });
                        }}
                        options={model!.skus.map((x) => ({ value: x.sku, label: x.variant || x.sku }))} />
                    )}
                    {model!.gaps.length > 0 && (
                      <CSelect id={`so-edit-gap-${l.key}`} label="Mattress gap"
                        value={String((l.attrs as { gap?: string } | undefined)?.gap ?? "KIV")}
                        onChange={(gap) => setDraftLine(l.key, { attrs: { ...(l.attrs ?? {}), gap } })}
                        options={[{ value: "KIV", label: "Confirm later" }, ...model!.gaps.map((g) => ({ value: g, label: g }))]} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {draft.addons.map((a, j) => {
            const strike = a.removed ? "line-through text-c-muted" : "";
            const owned = SERVER_EXCLUSIVE_ADDON_KEYS.has(a.addon_key);
            const pos = serviceSizeDraft(a, catalogQ.data?.addons.find((x) => x.key === a.addon_key)?.sizeOptions);
            const sizes = disposalUnitSizes(pos);
            const options = addonSizeOptions(pos);
            const n = draft.lines.filter((l) => l.sku.trim()).length + j + 1;
            return (
              <div key={a.key} data-testid={`edit-service-${a.addon_key}`} data-pos-field="orderAddons">
                <div role="row" className={`${ITEM_COLS} items-baseline border-b border-c-row-line py-2`}>
                  <span className="text-c-muted">{n}</span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className={`break-words ${strike}`}>
                      <span className="font-medium text-c-ink">{nameOfAddon(a.addon_key)}</span>{" "}
                      <span className="text-c-muted">· {serviceCodeWord(a.addon_key, addonSkuByKey.get(a.addon_key))}</span>
                    </span>
                    {typeof a.attrs?.["size"] === "string" && <span className={`text-[12px] text-c-secondary ${strike}`}>{String(a.attrs["size"])}</span>}
                    {a.added && <span className="text-[12px] font-semibold text-c-ok-fg">New line</span>}
                    {amending && !owned && (
                      <span className="flex gap-4 text-[12px] font-semibold">
                        <button type="button" className={a.removed ? "text-c-ink hover:underline" : "text-c-warn-fg hover:underline"}
                          aria-label={`${a.removed ? "Restore" : "Remove"} ${nameOfAddon(a.addon_key)}`}
                          onClick={() => a.removed ? setDraftAddon(a.key, { removed: false }) : a.added
                            ? setDraft((d) => ({ ...d, addons: d.addons.filter((x) => x.key !== a.key) }))
                            : setDraftAddon(a.key, { removed: true })}>{a.removed ? "Restore" : "Remove"}</button>
                      </span>
                    )}
                  </span>
                  <span className={`text-right text-c-ink ${strike}`}>
                    {amending && !owned && !a.removed ? (
                      <CInput id={`so-edit-service-qty-${a.key}`} label={`Qty ${nameOfAddon(a.addon_key)}`} type="number" min={1} step={1} value={String(a.qty)} className="text-right"
                        onChange={(e) => setDraftAddon(a.key, resizeService(a, Number(e.target.value), pos.sizeOptions))} />
                    ) : a.qty}
                  </span>
                  <span className={`text-right text-c-secondary ${strike}`}>{fmtMoney(a.unit_price)}</span>
                  <span className={`text-right text-c-ink ${strike}`}>{fmtMoney(a.qty * a.unit_price)}</span>
                </div>
                {amending && !owned && !a.removed && options.length > 0 && (
                  <div className="grid grid-cols-1 gap-2 border-b border-c-row-line bg-c-ground px-2 py-2 sm:grid-cols-3">
                    {sizes.map((size, i) => (
                      <CSelect key={i} id={`so-service-size-${a.key}-${i}`} label={a.qty > 1 ? `Size ${i + 1}` : "Size"} placeholder={a.qty > 1 ? `Size ${i + 1}` : "Size"}
                        value={size} onChange={(value) => setDraftAddon(a.key, sizeServiceUnit(a, i, value))}
                        options={[...new Set([...options, ...(size ? [size] : [])])].map((value) => ({ value, label: value }))} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <div role="row" className={`${ITEM_COLS} border-b border-c-footer-line py-[7px]`}>
            <span /><span className="font-semibold text-c-secondary">Total</span>
            <span className="text-right text-c-ink">{qtyTotal}</span><span />
            <span className="text-right font-semibold text-c-ink" data-testid="money-total-payable">
              {amending ? fmtMoney(editTotal) : money.known && money.total != null ? fmtMoney(money.total) : "No price yet"}
            </span>
          </div>
          <div role="row" className={`${ITEM_COLS} border-b border-c-footer-line py-[7px]`}>
            <span /><span className="text-c-secondary">Received</span><span /><span />
            <span className="text-right text-c-ink" data-testid="money-paid">{fmtMoney(money.paid)}</span>
          </div>
          <div role="row" className={`${ITEM_COLS} border-b border-c-footer-line py-[7px] ${money.known && money.outstanding > 0 ? "bg-c-warn-bg" : ""}`}>
            <span /><span className="font-semibold text-c-secondary">Balance due</span><span /><span />
            <span className={`text-right font-semibold ${money.known && money.outstanding > 0 ? "text-c-warn-fg" : "text-c-ink"}`} data-testid="money-outstanding">
              {!money.known ? "No price yet" : fmtMoney(Math.max(0, money.outstanding))}
            </span>
          </div>
        </div>
      </div>
      {amending && (
        <div className="grid grid-cols-1 gap-2 pt-3 sm:grid-cols-3">
          <span className="flex items-end gap-2 sm:col-span-2">
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <CInput id="so-add-item" label="Add item" placeholder="Add item: type the item code" list="so-sku-catalog" value={addSku} onChange={(e) => setAddSku(e.target.value)} />
              {addSku.trim() && <span className="text-[12px] text-c-muted">{catalogBySku.get(addSku.trim())?.label ?? NOT_IN_CATALOG}</span>}
              <datalist id="so-sku-catalog">
                {[...catalogBySku.entries()].map(([sku, info]) => (
                  <option key={sku} value={sku}>{info.label}</option>
                ))}
              </datalist>
            </span>
            <CBtn kind="normal" icon="add" disabled={!catalogBySku.has(addSku.trim())} data-testid="add-item"
              onClick={() => {
                const sku = addSku.trim();
                const hit = catalogBySku.get(sku);
                if (!hit) return;
                setDraft((d) => ({ ...d, lines: [...d.lines, { key: nextKey(), sku, qty: 1, unit_price: Number(hit.price ?? 0), added: true }] }));
                setAddSku("");
              }}>
              Add item
            </CBtn>
          </span>
          {serviceOptions.length > 0 && (
            <CSelect id="so-add-delivery-service" label="Add service" placeholder="Add service" value="" onChange={addServiceToDraft}
              options={serviceOptions.map((x) => ({ value: x.key, label: `${x.name} · ${fmtMoney(Number(x.price))}` }))} />
          )}
        </div>
      )}
      <span className="pb-1 pt-3.5 text-[13px] font-medium text-c-ink">Payment</span>
      {amending ? (
        row("instalment", "Instalment months", factOf(draft.installment_months == null ? "None" : String(draft.installment_months)), ["installment_months"],
          <CSelect id="so-instalment" label="Instalment months" value={draft.installment_months == null ? "none" : String(draft.installment_months)}
            onChange={(v) => setField("installment_months", v === "none" ? null : Number(v))}
            options={[{ value: "none", label: "None" }, ...INSTALMENT_MONTHS.map((m) => ({ value: String(m), label: String(m) }))]} />,
          baseline.installment_months == null ? "None" : String(baseline.installment_months))
      ) : (
        <KvRow label="Method" value={<span data-testid="money-instalment">{paymentWord || NOT_RECORDED}</span>} muted={!paymentWord} />
      )}
      <KvRow label="Bank reference" value={order?.approval_code || NOT_RECORDED} muted={!order?.approval_code} />
      <KvRow
        label="Bank slip"
        muted={!slip}
        value={slip ? (
          <button type="button" className="font-semibold text-c-ink hover:underline" onClick={() => void viewSlip({ receipt_url: slip })}>
            {slip.split("/").pop()}
          </button>
        ) : NOT_RECORDED}
      />
    </Card>
  );

  /* ── THE AMENDMENT BAR — sticky at the top of the tab while amending. ─── */
  const commercial = changeClass?.action === "submit";
  const amendmentBar = amending && (
    <div className="sticky top-0 z-[6] flex flex-col gap-2 rounded-lg border border-c-btn-border bg-c-card px-3 py-2.5" style={{ boxShadow: "var(--shadow-menu)" }} data-testid="amendment-bar">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-c-ink" data-testid="change-count">
          <MIcon name="edit_note" size={18} />
          Amendment · {changeCount} {changeCount === 1 ? "change" : "changes"}
        </span>
        <span className="inline-flex items-center gap-1 text-[12px] text-c-secondary">
          Click <MIcon name="edit" size={16} /> next to a detail to change it.
        </span>
        <span className="flex-1" />
        <span className="relative flex">
          <CBtn kind="normal" onClick={() => { setWhyOpen((v) => !v); setProofOpen(false); }} aria-expanded={whyOpen} data-testid="amendment-why">
            {changeReason.trim() ? "Why: written" : "Why?"}
            <MIcon name="expand_more" size={18} className="text-c-muted" />
          </CBtn>
          {whyOpen && (
            <div role="dialog" aria-label="Why" className="absolute right-0 top-10 z-[80] flex w-[min(380px,80vw)] flex-col gap-2 rounded-lg border border-c-btn-border bg-c-card p-3" style={{ boxShadow: "var(--shadow-menu)" }}>
              <label htmlFor="so-change-reason" className="flex flex-col gap-1 text-[12px] font-semibold text-c-secondary">
                Reason for change
                <textarea id="so-change-reason" rows={2} value={changeReason} onChange={(e) => setChangeReason(e.target.value)}
                  className="rounded-lg border border-c-input-border bg-c-card px-2.5 py-1.5 text-[13px] font-normal text-c-ink outline-none focus:border-c-select-fg" />
              </label>
              <label htmlFor="so-change-asked" className="flex flex-col gap-1 text-[12px] font-semibold text-c-secondary">
                Requested date (from customer)
                <CDate id="so-change-asked" label="Requested date (from customer)" value={changeAskedOn} onChange={setChangeAskedOn} />
              </label>
              <CBtn kind="main" className="!h-[30px] self-end !text-[12px]" onClick={() => setWhyOpen(false)}>Done</CBtn>
            </div>
          )}
        </span>
        {commercial && (
          <span className="relative flex">
            <CBtn kind="normal" icon={changeAgreement ? "check_circle" : "attach_file"} onClick={() => { setProofOpen((v) => !v); setWhyOpen(false); }}
              aria-expanded={proofOpen} data-testid="amendment-proof" className="border-dashed">
              {changeAgreement ? "Proof added" : "Add proof"}
            </CBtn>
            {proofOpen && (
              <div role="dialog" aria-label="Customer agreement" className="absolute right-0 top-10 z-[80] flex w-[min(420px,85vw)] flex-col gap-2 rounded-lg border border-c-btn-border bg-c-card p-3" style={{ boxShadow: "var(--shadow-menu)" }}>
                <p className="text-[12px] font-semibold text-c-secondary">Customer agreement</p>
                <p className="text-[12px] text-c-secondary">You can send the request without it, but management cannot approve until it is recorded.</p>
                <AgreementForm idPrefix="so-change-agreement" value={changeAgreement} onChange={setChangeAgreement} />
                <CBtn kind="main" className="!h-[30px] self-end !text-[12px]" onClick={() => setProofOpen(false)}>Done</CBtn>
              </div>
            )}
          </span>
        )}
        <CBtn kind="quiet" onClick={() => (changeCount > 0 ? setDiscardAsk(true) : discardEdit())} data-testid="workspace-cancel">
          Cancel
        </CBtn>
        <CBtn kind="main" className="!h-8 !px-4" disabled={changesMut.isPending || liveBlocksCommercial} onClick={tryCommit} data-testid="workspace-save">
          {commitWord}
        </CBtn>
      </div>
      {(detailQ.data?.pos ?? []).length > 0 && (
        <span className="text-[12px] text-c-secondary" data-testid="supplier-commitment-notice">
          This SO is already ordered from the supplier. Your change goes for approval first; the order changes only after it is approved.
        </span>
      )}
      {liveBlocksCommercial && (
        <span role="alert" className="rounded-md bg-c-warn-bg px-2.5 py-1.5 text-[12px] text-c-warn-fg">An earlier change is still waiting for management.</span>
      )}
      {editError && <span role="alert" className="rounded-md bg-c-warn-bg px-2.5 py-1.5 text-[12px] text-c-warn-fg" data-testid="amendment-error">{editError}</span>}
      {discardAsk && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-c-warn-bg px-2.5 py-2">
          <span className="flex-1 text-[13px] font-medium text-c-warn-fg">Discard {changeCount} {changeCount === 1 ? "change" : "changes"}?</span>
          <CBtn kind="normal" className="!h-[30px] !text-[12px] !font-semibold" onClick={() => setDiscardAsk(false)}>Keep editing</CBtn>
          <CBtn kind="main" className="!h-[30px] !text-[12px]" onClick={discardEdit} data-testid="amendment-discard">Discard</CBtn>
        </div>
      )}
    </div>
  );

  /* ── An OLD version is a photograph: amber read-only bar. ─────────────── */
  const oldRevBar = mode === "oldrev" && viewedRevision && (
    <div className="flex flex-col gap-1 rounded-lg bg-c-warn-bg px-3 py-2 text-c-warn-fg" data-testid="oldrev-notice">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="flex-1 text-[13px] font-medium">
          Viewing Rev {viewedRevision.revision}. Read only. This is not the current Sales Order.
        </span>
        <CBtn kind="normal" className="!h-7 !border-0 !text-[12px] !font-semibold !text-c-warn-fg" onClick={backToCurrent} data-testid="workspace-back-to-current">
          Back to current
        </CBtn>
      </div>
      {storedDocumentUrl && <p className="text-[12px]" data-testid="oldrev-issued-document">The document this version was issued as.</p>}
      {isReconstruction && <p className="text-[12px]" data-testid="oldrev-rebuilt">Reconstructed copy. The original issued document is unavailable.</p>}
      {isReconstruction && base?.signature_url && <p className="text-[12px]" data-testid="oldrev-signature-unknown">Signature version not recorded.</p>}
      {isReconstruction && (base?.payments ?? []).some((pm) => !pm.date) && (
        <p className="text-[12px]" data-testid="oldrev-undated-payment">One payment has no date, so it is not counted in this version.</p>
      )}
    </div>
  );

  const salesOrderTab = (
    <div className="flex flex-col gap-3" data-testid="sales-order-workspace" id="sales-order-workspace">
      {oldRevBar}
      {mode === "object" && !editing && liveAmendment && requestView && (
        <WaitingAmendment
          amendment={liveAmendment}
          rows={requestView.rows}
          consequences={requestView.consequences}
          canDecide={role === "principal"}
          busy={decideMut.isPending || agreementMut.isPending}
          onRecordAgreement={(a) => agreementMut.mutate({ amendmentId: liveAmendment.id, ...a })}
          onDecide={(decision, note) => decideMut.mutate({ amendmentId: liveAmendment.id, decision, note })}
          onProposeAgain={() => startEdit(withProposal(baseline, proposalOf(liveAmendment)), liveAmendment.id)}
          onWithdraw={() => setWithdrawOpen(true)}
        />
      )}
      {amendmentBar}
      {salesCard}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] items-stretch gap-3">
        {customerCard}
        {deliveryCard}
      </div>
      {itemsCard}
      {mode !== "oldrev" && (correctionWorkQ.data?.work ?? []).length > 0 && (
        <Card label="What this change started elsewhere">
          <CardTitle>What this change started elsewhere</CardTitle>
          <CorrectionWorkList work={correctionWorkQ.data?.work ?? []} canClose={false} emptyWord="" />
        </Card>
      )}
    </div>
  );

  const timelineEntries = useMemo(
    () =>
      timelineEntriesOf({
        history: (detailQ.data?.history ?? []) as HistoryEvent[],
        revisions,
        amendment: liveAmendment,
        onOpenRevisions: () => setRevOpen(true),
      }),
    [detailQ.data?.history, revisions, liveAmendment],
  );

  const menuGroups: Array<{ heading: string; items: MenuItem[] }> = [
    {
      heading: "SALES ORDER",
      items: [
        { label: mode === "oldrev" ? "Preview this version" : "Preview SO PDF", icon: "picture_as_pdf", onSelect: () => setMenuPdf(true), testId: "workspace-preview" },
        { label: mode === "oldrev" ? "Print this version" : "Print SO", icon: "print", onSelect: () => void openPrint(), disabled: !printData && !storedDocumentUrl, testId: "workspace-print" },
        { label: "Download PDF", icon: "download", onSelect: () => void downloadPdf(), disabled: !printData && !storedDocumentUrl, testId: "workspace-download" },
      ],
    },
    {
      heading: "COPY",
      items: [
        ...(order ? [{ label: "SO No.", icon: "content_copy", onSelect: () => copy(soWord, "SO No."), testId: "workspace-copy-so" }] : []),
        ...(order?.customer_phone ? [{ label: "Customer phone", icon: "call", onSelect: () => copy(order.customer_phone!, "Customer phone"), testId: "workspace-copy-phone" }] : []),
      ],
    },
    {
      heading: "OTHER",
      items: [
        ...(order ? [{ label: "Open in Payments", icon: "payments", onSelect: () => navigate(`/finance/payments?order=${order.so}`), testId: "workspace-open-payments" }] : []),
        ...(mode !== "oldrev" && order && canChangeSalesOwnership
          ? [{ label: "Change salesperson", icon: "person", onSelect: () => setAttributionSignal((n) => n + 1), testId: "attribution-open" }]
          : []),
        ...(liveAmendment && liveAmendment.status === "submitted" && !liveAmendment.stale
          ? [{ label: "Withdraw amendment", icon: "undo", onSelect: () => setWithdrawOpen(true), testId: "workspace-withdraw-amendment" }]
          : []),
        ...(canEditOrder && !editing
          ? [
              { label: "Report a problem", icon: "support_agent", onSelect: () => setProblemOpen(true), testId: "workspace-report-problem" },
              { label: "Cancel Sales Order", icon: "cancel", onSelect: () => setCancelOpen(true), testId: "workspace-cancel-so" },
            ]
          : []),
      ],
    },
  ];

  /* Drawers open to the LEFT of an open Tasks panel (320px + the 12px gap). */
  const tasksOpen = useShellTasks((s) => s.open);
  const drawerRight = tasksOpen ? 344 : 12;

  const backTo =
    typeof location.state?.salesOrderRegisterReturn === "string" && /^\/operation\/orders(?:\?|$)/.test(location.state.salesOrderRegisterReturn)
      ? location.state.salesOrderRegisterReturn
      : "/operation/orders";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3" data-so-theme="carres" data-testid="so-detail">
      <SoHeader
        identity={soWord}
        /* Capitalize up — owner ruling 2026-08-15. Display only. */
        customer={displayCustomerName(order?.customer_name) || null}
        status={statusPill}
        team={team}
        revLabel={currentRev && currentRev > 1 ? `Rev ${currentRev}` : null}
        onOpenRevisions={() => setRevOpen(true)}
        backTo={backTo}
        onBack={(event) => {
          if (!confirmDiscard()) event.preventDefault();
        }}
        onRequestAmendment={() => {
          if (objectView !== "Sales Order") openObjectView("Sales Order");
          startEdit(baseline);
        }}
        amendDisabled={!canEditOrder || editing}
        amendTitle={!canEditOrder ? (mode === "oldrev" ? "Go back to the current version first" : "This order cannot be changed") : undefined}
        menu={menuGroups}
        docTitle={order ? `SO-${order.so} · Carres` : "Carres"}
      />
      <PillTabs
        label="Sales Order views"
        value={objectView}
        onChange={openObjectView}
        tabs={OBJECT_VIEWS.map((v) => ({ key: v, label: v }))}
      />

      {order && (
        <CancelSalesOrderDialog orderId={order.id} so={order.so} open={cancelOpen} onOpenChange={setCancelOpen} onCancelled={() => void detailQ.refetch()} />
      )}
      {problemOpen && order && (
        <ServiceCaseWizard
          initialOrder={{
            id: order.id,
            so: `SO-${order.so}`,
            refNos: order.source_ref ?? [],
            customerName: order.customer_name,
            customerPhone: order.customer_phone,
            customerAddress: order.customer_address,
            deliveryDate: order.delivery_date,
            lines: (detailQ.data?.lines ?? []).filter((line) => line.id).map((line) => ({
              id: line.id!,
              sku: line.sku,
              qty: line.qty,
              sourcePo: line.source_po ?? null,
            })),
          }}
          onClose={() => setProblemOpen(false)}
          onSaved={() => {
            setProblemOpen(false);
            /* The case it opened is Service's record; this object shows it on
               Order Route, which reads it from the route facts. */
            void routeFactsQ.refetch();
          }}
        />
      )}
      {/* An OLD revision is a photograph — it carries no lane. The modal is
          opened from `⋮ Change salesperson`. */}
      {mode !== "oldrev" && orderId && order && (
        <span className="hidden">
          <SalesOrderAttribution
            orderId={orderId}
            current={{ salesperson_id: order.salesperson_id ?? null, outlet_id: order.outlet_id ?? null, dealer_id: order.dealer_id ?? null }}
            salespersonOptions={realSpOptions}
            outletOptions={realOutletOptions}
            dealerOptions={dealerOptions}
            inlineTrigger={false}
            openSignal={attributionSignal}
            onApplied={() => {
              void revisionsQ.refetch();
              void baseQ.refetch();
              void detailQ.refetch();
            }}
          />
        </span>
      )}

      <div className="min-h-0 flex-1 overflow-auto" data-testid="so-tab-body">
        {objectView === "Order Route" ? (
          routeFactsQ.isLoading || detailQ.isLoading || revisionsQ.isLoading ? (
            <RouteLoadingFrame />
          ) : routeFactsQ.isError || detailQ.isError || revisionsQ.isError ? (
            <Card>
              <SalesOrderReadFailure
                error={detailQ.error ?? revisionsQ.error ?? routeFactsQ.error}
                surface="order-route"
                onRetry={() => { void detailQ.refetch(); void revisionsQ.refetch(); void routeFactsQ.refetch(); }}
              />
            </Card>
          ) : orderRoute ? (
            <SoOrderRoute
              route={orderRoute}
              owners={routeOwners}
              onRetry={retryRouteRead}
              originalDate={originalDate}
              currentDate={order?.delivery_date_tbd ? null : (order?.delivery_date ?? null)}
              confirmedDate={routeFactsQ.data?.brief?.appointment?.dateIso ?? null}
              deliveredDate={order?.delivered_at ?? null}
              todayIso={appTodayIso()}
            />
          ) : (
            <Card>
              <p className="py-2 text-[13px] text-c-muted">No route facts were found for this sales order</p>
            </Card>
          )
        ) : objectView === "Timeline" ? (
          detailQ.isLoading || revisionsQ.isLoading ? (
            <Card><p className="py-2 text-[13px] text-c-muted">Opening the timeline</p></Card>
          ) : detailQ.isError || revisionsQ.isError ? (
            <Card>
              <SalesOrderReadFailure
                error={detailQ.error ?? revisionsQ.error}
                surface="history"
                onRetry={() => { void detailQ.refetch(); void revisionsQ.refetch(); }}
              />
            </Card>
          ) : (
            <SoTimeline entries={timelineEntries} />
          )
        ) : detailQ.isLoading ? (
          <Card testId="so-loading"><p className="py-2 text-[13px] text-c-muted">Opening the sales order</p></Card>
        ) : detailQ.isError ? (
          <Card>
            <SalesOrderReadFailure error={detailQ.error} surface="sales-order" onRetry={() => void detailQ.refetch()} />
          </Card>
        ) : order ? (
          salesOrderTab
        ) : null}
      </div>

      {/* ── Revision history: newest first, each a door to the full version. ── */}
      <Drawer open={revOpen} title="Revision history" onClose={() => setRevOpen(false)} testId="revision-drawer" right={drawerRight}>
        <SalesOrderLedger
          orderReference={order ? `SO-${order.so}` : ""}
          revisions={revisions}
          history={detailQ.data?.history ?? []}
          currentRevision={currentRev}
          viewedRevision={mode === "oldrev" ? viewRev : null}
          view="revisions"
          showViewTabs={false}
          onViewRevision={(r) => {
            setViewRev(r);
            setRevOpen(false);
            if (objectView !== "Sales Order") openObjectView("Sales Order");
          }}
          onProposeRevision={(revision) => {
            /* PROPOSE THIS VERSION AGAIN — rollback is a new governed change
               (orders/MASTER § Detail, edit, amendment): the complete old
               version becomes the draft, on top of today's line identity. */
            const old = draftFromSnapshot(revision.snapshot);
            const currentIds = new Map((detailQ.data?.lines ?? []).map((line) => [line.sku, line.id]));
            const addonIds = new Map((detailQ.data?.addons ?? []).map((a) => [a.addon_key, a.id]));
            const oldSkus = new Set(old.lines.map((l) => l.sku));
            const oldKeys = new Set(old.addons.map((a) => a.addon_key));
            setRevOpen(false);
            startEdit({
              ...old,
              lines: [
                ...old.lines.map((l) => {
                  const id = currentIds.get(l.sku);
                  return id ? { ...l, id } : { ...l, id: undefined, added: true };
                }),
                ...baseline.lines.filter((l) => !oldSkus.has(l.sku)).map((l) => ({ ...l, removed: true })),
              ],
              addons: [
                ...old.addons.map((a) => {
                  const id = addonIds.get(a.addon_key);
                  return id ? { ...a, id } : { ...a, added: true };
                }),
                ...baseline.addons.filter((a) => !oldKeys.has(a.addon_key)).map((a) => ({ ...a, removed: true })),
              ],
            });
          }}
        />
      </Drawer>

      {/* ── The SO document: the SAME template Print renders, never a lookalike. ── */}
      <Drawer
        open={menuPdf}
        title={mode === "oldrev" && viewedRevision ? `${soWord} · Rev ${viewedRevision.revision}` : `${soWord} · Sales Order`}
        onClose={() => setMenuPdf(false)}
        width={560}
        right={drawerRight}
        testId="pdf-drawer"
        actions={
          <>
            <CIconBtn icon="print" label="Print" size={34} onClick={() => void openPrint()} />
            <CIconBtn icon="download" label="Download PDF" size={34} onClick={() => void downloadPdf()} />
          </>
        }
      >
        {liveAmendment && !liveAmendment.stale && (
          <div className="mb-3 rounded-lg bg-c-warn-bg px-3 py-2 text-[13px] font-medium text-c-warn-fg" data-testid="pending-amendment-banner">
            Amendment pending approval{pendingDeliveryDate ? `: delivery date → ${fmtDate(pendingDeliveryDate)}` : ""}. The document shows the order as it is now.
          </div>
        )}
        <div className="relative" aria-label="Sales Order document">
          {storedDocumentUrl ? (
            <object
              data={storedDocumentUrl}
              type="application/pdf"
              data-testid="issued-document-pane"
              aria-label={`The document (${viewedRevision?.revision ?? ""}) was issued as`}
              className="h-[760px] w-full rounded-lg border border-c-card-border bg-c-card"
            />
          ) : (
            <>
              {pdfError && <p className="pb-2 text-[13px] text-c-warn-fg" data-testid="pdf-error">The document could not be drawn. {pdfError}</p>}
              <div ref={setPane} data-testid="pdf-pane" />
            </>
          )}
          {dirty && (
            <div aria-hidden="true" data-testid="unsaved-watermark" className="pointer-events-none absolute inset-0 grid select-none place-items-center overflow-hidden">
              <span className="rotate-[-24deg] scale-[2.4] text-[20px] tracking-[0.3em] text-c-ink/10">UNSAVED</span>
            </div>
          )}
        </div>
      </Drawer>

      {/* ── The confirmation before the commit — Before / After and what it starts. ── */}
      <Dialog
        open={amending && reviewOpen}
        title="Your changes"
        onClose={() => { if (!changesMut.isPending) setReviewOpen(false); }}
        testId="change-review"
        footer={
          <>
            <CBtn kind="normal" disabled={changesMut.isPending} onClick={() => setReviewOpen(false)}>Back to editing</CBtn>
            <CBtn kind="main" className="!h-8" disabled={changesMut.isPending || !changeReason.trim() || liveBlocksCommercial || changeCount === 0}
              onClick={onCommit} data-testid="workspace-confirm-save">
              {changesMut.isPending ? "Sending…" : commitWord}
            </CBtn>
          </>
        }
      >
        <ChangeReview
          rows={draftRows}
          consequences={consequencesFor({ lines: draft.lines, addons: draft.addons, header: draftHeader() })}
          commercial={commercial}
          blocked={liveBlocksCommercial ? "An earlier change is still waiting for management." : null}
          reason={changeReason}
          askedOn={changeAskedOn}
          agreement={changeAgreement}
        />
      </Dialog>

      {/* ── Withdraw needs a reason (the server refuses an empty one). ── */}
      <Dialog
        open={withdrawOpen}
        title="Withdraw amendment"
        onClose={() => { if (!withdrawMut.isPending) setWithdrawOpen(false); }}
        width={480}
        testId="withdraw-dialog"
        footer={
          <>
            <CBtn kind="normal" disabled={withdrawMut.isPending} onClick={() => setWithdrawOpen(false)}>Keep it</CBtn>
            <CBtn kind="main" className="!h-8" disabled={withdrawMut.isPending || !withdrawReason.trim() || !liveAmendment}
              onClick={() => liveAmendment && withdrawMut.mutate({ amendmentId: liveAmendment.id, reason: withdrawReason.trim() })}
              data-testid="withdraw-confirm">
              Withdraw
            </CBtn>
          </>
        }
      >
        <p className="pb-2 text-[13px] text-c-body">The order stays as it is. To change it later, send a new amendment.</p>
        <WithdrawForm value={withdrawReason} onChange={setWithdrawReason} />
      </Dialog>
    </div>
  );
}

/* ── Read-side value pickers: the VIEWED revision's snapshot outranks the
 * current row; the object reads the row itself. ───────────────────────────── */
/* A typed interface has no index signature; the pickers read snapshot-vs-row
 * by KEY, so the row is treated as a bag here — reads only, never writes. */
type Orderish =
  | {
      dealers?: { name: string } | null;
      outlets?: { name: string } | null;
      salespersons?: { name: string } | null;
    }
  | undefined;

function bag(order: Orderish): Record<string, unknown> {
  return (order ?? {}) as unknown as Record<string, unknown>;
}

function sourceName(
  mode: Mode,
  rev: SalesOrderRevisionRow | null,
  order: Orderish,
  which: "dealer" | "outlet" | "salesperson",
): string | null {
  if (mode === "oldrev" && rev) {
    const v = rev.snapshot.header?.[`${which}_name`];
    return v == null ? null : String(v);
  }
  if (which === "dealer") return order?.dealers?.name ?? null;
  if (which === "outlet") return order?.outlets?.name ?? null;
  return order?.salespersons?.name ?? null;
}

/** The goods rows a Sales Order prints, with the money each line carries.
 *  EXPORTED so the arithmetic can be tested without a DOM: a gift is a line at
 *  price 0 and an old Revision totals its OWN photograph, and neither is
 *  observable through the six-column table alone. */
export function itemRows(
  mode: Mode,
  rev: SalesOrderRevisionRow | null,
  detailLines: Array<{ sku: string; qty: number; unit_price: number; label?: string | null }>,
): Array<{ name: string; qty: number; unitPrice: number; total: number }> {
  if (mode === "oldrev" && rev) {
    return (rev.snapshot.lines ?? []).map((l) => ({
      name: l.description?.trim() || l.sku,
      qty: Number(l.qty),
      unitPrice: Number(l.unit_price),
      total: Number(l.qty) * Number(l.unit_price),
    }));
  }
  return detailLines.map((l) => ({
    name: lineName(l),
    qty: l.qty,
    unitPrice: Number(l.unit_price),
    total: Number(l.unit_price) * Number(l.qty),
  }));
}

/**
 * THE EARLIEST DATE THIS CART MAY BE PROMISED — the same floor the POS applies.
 *
 * A made item has a factory behind it, so a delivery date sooner than the
 * production lead is a promise Carres cannot keep. The POS has refused those
 * dates since 2026-05-22; the office create door did not, so an order keyed
 * here could carry a date the same order keyed at POS could not.
 *
 * The categories come from the CATALOG (D9) — never from the SKU text — and a
 * SKU the catalog does not hold contributes NO category, which is honest: we
 * cannot know its lead, so it must not invent one. `maxLeadDaysFor` then
 * returns 0 for a cart of nothing but accessories/services/unknowns, and the
 * floor is simply today.
 *
 * Returns the ISO date, or null when nothing gates.
 */
export function earliestPromiseISO(
  categories: readonly (string | null | undefined)[],
  earliestSellDays: number | undefined,
  today: Date = new Date(),
): string | null {
  if (!earliestSellDays) return null;
  const lead = maxLeadDaysFor(
    categories.filter((c): c is string => typeof c === "string" && c.length > 0),
    earliestSellDays,
  );
  return lead > 0 ? minDeliveryDateISO(lead, today) : null;
}

/**
 * What an address change does to the fields BELOW it.
 *
 * The three parts are a cascade, not three questions: a postcode belongs to a
 * city and a city belongs to a state. Picking a new state therefore invalidates
 * both children, and a new city invalidates the postcode — otherwise a draft
 * can hold `Selangor / Georgetown / 10200`, which no validator downstream would
 * catch because each field is individually a real value.
 */
export function addressCascadePatch(
  level: "state" | "city",
  value: string,
): { customer_address_state?: string; customer_address_city: string; customer_address_postcode: string } {
  return level === "state"
    ? { customer_address_state: value, customer_address_city: "", customer_address_postcode: "" }
    : { customer_address_city: value, customer_address_postcode: "" };
}

/**
 * First letter of every word up, the rest left alone (Jess, meeting 1:
 * "auto capitalized" — customer name and address).
 *
 * ONLY the first letter moves. "jalan ketumbar" → "Jalan Ketumbar", but
 * "SS2", "12-3a" and "McKenzie" keep every character the operator typed —
 * lowercasing the remainder would mangle exactly the tokens Malaysian
 * addresses are full of. Applied at the payload, not on keystroke, so typing
 * is never fought mid-word.
 */
export function autoCapitalize(s: string): string {
  return s.replace(/(^|[\s/(-])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** What the CATALOG says a SKU is, for the create door's two hints. */
export interface CatalogSkuFact {
  price: number;
  label: string;
  /** `product_models.category` — the CATALOG's answer (D9), and the input the
   *  lead-time floor is computed from. `null` = the catalog holds no row. */
  category?: string | null;
}

/**
 * The line's CATEGORY WORD — and since 2026-08-21 the CATALOG gets asked.
 *
 * D9 (`ERP-ARCHITECTURE.md` §3.1): *"what kind of product is this?"* is the
 * catalog's answer and nobody else's, and **no screen may re-derive a category
 * from a SKU string**. This document was doing exactly that: with no `attrs`
 * and no native prefix — which is every AutoCount-imported line — it fell
 * straight to a keyword regex over the SKU text. The POS one screen away reads
 * `product_models.category`, so the same line could print two different words
 * depending on which surface an operator opened.
 *
 * The order of resolution, and why each rung survives:
 *
 *   ① `attrs.category`  the DOCUMENT's own snapshot. An order line is a frozen
 *                       record of what was sold; a category captured at sale
 *                       time is order truth and outranks anything read live.
 *   ② `line.category`   THE CATALOG, resolved server-side by `skuCategories`
 *                       (the one shared reader) and carried on the order-detail
 *                       payload since PR 867. This rung is the D9 fix.
 *   ③ the SKU prefix    a NATIVE sku names its own kind before the first colon
 *                       (`guarantee:`, `service:` …). Kept because it covers
 *                       words the classifier below has no branch for.
 *   ④ `lineClass`       the keyword parser, and the ONLY rung that guesses.
 *                       Kept because 975 live units have no catalog row.
 *
 * ⚠️ **Do not "simplify" ④ into `resolvedCategory`.** That helper returns
 * `CoreCat | "acc"` — it folds `unknown` INTO `acc`, which would print
 * `ACCESSORY` over goods nothing recognised. That is the D9 lie this function
 * exists to stop telling. `lineClass` is three-valued on purpose.
 *
 * ⛔ THE `unknown` WORD IS `Not in catalog` (COPY-STANDARD:1082), and this
 * comment used to call `Other goods` "the ruled word". It is the opposite:
 * :1082 lists `Other goods` in the Do NOT use column for exactly this fact,
 * *"and above all never folded into `Accessory`"*. The screen already printed
 * `Not in catalog` as the SKU hint three hundred lines above, so one fact was
 * wearing two spellings on one card. The three-valued shape is what the
 * warning above is really protecting; the word it named was wrong.
 */
export function categoryWord(line: {
  sku: string;
  attrs?: Record<string, unknown> | null;
  /** The catalog's word. `null` = asked, no catalog row. ABSENT = an older
   *  Worker that does not send it — both fall through to ③/④. */
  category?: string | null;
}): string {
  const fromAttrs = typeof line.attrs?.category === "string" ? line.attrs.category : "";
  const fromCatalog = typeof line.category === "string" ? line.category.trim() : "";
  const fromSku = line.sku.includes(":") ? line.sku.split(":", 1)[0] : "";
  const classified = lineClass(line.sku);
  const fallback = classified === "acc" ? "Accessory" : classified === "unknown" ? "Not in catalog" : classified;
  return (fromAttrs || fromCatalog || fromSku || fallback).replace(/[_-]+/g, " ").toUpperCase();
}

