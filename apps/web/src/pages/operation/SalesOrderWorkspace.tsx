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
import { Plus, Printer, Trash2, X } from "lucide-react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import * as pdfjs from "pdfjs-dist";
import { toast } from "sonner";
import {
  BUILDING_TYPE_OPTIONS,
  STAIR_CARRY_ADDON_KEY,
  composeEmergencyContact,
  CUSTOMER_GENDER_OPTIONS,
  CUSTOMER_RACE_OPTIONS,
  deliveryReasonLabel,
  EMERGENCY_RELATIONSHIPS,
  LIFT_OPTIONS,
  lineClass,
  MAX_DELIVERY_FLOOR,
  maxLeadDaysFor,
  minDeliveryDateISO,
  orderMoney,
  parseEmergencyContact,
  receivingRecordNo,
  resolveFormTab,
  resolveSalesOrderRoute,
  supplierClaimStatusLabel,
  myHolidaySet,
  unitsShortWords,
  type CustomField,
  type OrderEntryTab,
  type SalesOrderRouteMap as SalesOrderRouteModel,
} from "@carres/shared";
import Button from "@/components/kit/Button";
import Checkbox from "@/components/kit/Checkbox";
import DatePicker from "@/components/kit/DatePicker";
import { getCities, getPostcodes, MY_STATES } from "@/data/malaysia-postcodes";
import EmptyState from "@/components/kit/EmptyState";
import FieldFrame from "@/components/kit/FieldFrame";
import { CONTROL_BASE, CONTROL_BORDER } from "@/components/kit/field-recipe";
import Input from "@/components/kit/Input";
import Loading from "@/components/kit/Loading";
import Modal from "@/components/kit/Modal";
import Select from "@/components/kit/Select";
import Money from "@/components/Money";
import { apiFetch, ApiError } from "@/lib/api";
import { cjkClassName } from "@/lib/cjk";
import { composeAddress } from "@/data/malaysia-postcodes";
import { fmtDate } from "@/lib/fmt-date";
import { floorSurchargeRaw, stairCarryCount } from "@/lib/order-totals";
import SalesOrderAddons, { ServiceRowActions } from "./SalesOrderAddons";
import { displayCustomerName } from "@/lib/customer-name";
import { renderSalesOrderPdf } from "@/lib/pdf/render";
import type { SalesOrderTemplateData } from "@/lib/pdf/types";
import {
  useCatalog,
  useCreateSalesOrder,
  useCustomerTypeProbe,
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
  useSalesOrderRouteFacts,
  useSalespersons,
  useSaveSalesOrderRevision,
  type SalesOrderRevisionRow,
  type SalesOrderSnapshot,
  type AmendmentProposal,
} from "@/lib/queries";
import { workspaceDutyActor } from "./workspace-duty-owner";
import CancelSalesOrderDialog from "./CancelSalesOrderDialog";
import ServiceCaseWizard from "./components/ServiceCaseWizard";
import CorrectionWorkList from "./CorrectionWorkList";
import SalesOrderAmendDeliveryDate from "./SalesOrderAmendDeliveryDate";
import SalesOrderAmendment from "./SalesOrderAmendment";
import SalesOrderAttribution, { useCanChangeSalesOwnership } from "./SalesOrderAttribution";
import SalesOrderLedger from "./SalesOrderLedger";
import SalesOrderRoute from "./SalesOrderRoute";
import SalesOrderTabs from "./SalesOrderTabs";
import { lineName } from "./sales-order-facts";
import { lineConfigBits } from "../dealer/new-order/special-addons-picker";

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
function usePdfCanvases(data: SalesOrderTemplateData | null) {
  const [pdfError, setPdfError] = useState<string | null>(null);
  const paneRef = useRef<HTMLDivElement | null>(null);
  /* The pane unmounts whenever the object opens Revisions / History / Order
     Route. Coming back, `data` has not changed — so without this the operator
     returned to an empty sheet of paper. */
  const [paneEpoch, setPaneEpoch] = useState(0);
  const setPane = useCallback((node: HTMLDivElement | null) => {
    paneRef.current = node;
    if (node) setPaneEpoch((n) => n + 1);
  }, []);
  useEffect(() => {
    let cancelled = false;
    if (!data) {
      paneRef.current?.replaceChildren();
      return;
    }
    (async () => {
      try {
        const blob = await renderSalesOrderPdf(data);
        if (cancelled) return;
        setPdfError(null);
        const doc = await pdfjs.getDocument({ data: await blob.arrayBuffer() }).promise;
        if (cancelled) return;
        const pane = paneRef.current;
        if (!pane) return;
        pane.replaceChildren();
        const paneWidth = Math.max(pane.clientWidth, 320);
        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const scale = paneWidth / base.width;
          const dpr = window.devicePixelRatio || 1;
          const viewport = page.getViewport({ scale: scale * dpr });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = `${Math.round(viewport.width / dpr)}px`;
          canvas.style.height = `${Math.round(viewport.height / dpr)}px`;
          canvas.style.display = "block";
          canvas.style.margin = "0 auto 16px";
          canvas.style.boxShadow = "0 1px 4px rgba(0,0,0,0.18)";
          /* A PDF page is paper — white by definition; this canvas is
             imperative pdf.js output, not themed React markup. */
          canvas.style.background = "white";
          canvas.setAttribute("data-testid", `pdf-page-${n}`);
          pane.appendChild(canvas);
          await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
        }
      } catch (e) {
        if (!cancelled) setPdfError(e instanceof ApiError ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data, paneEpoch]);
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
): SalesOrderTemplateData {
  const baseBySku = new Map((base?.lines ?? []).map((l) => [l.sku, l]));
  const lines = draft.lines
    .filter((l) => l.sku.trim().length > 0)
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
  const addons =
    base?.addons ??
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
    issue_date: base?.issue_date ?? new Date().toISOString().slice(0, 10),
    proceed_date: draft.proceed_date,
    order_id: base?.order_id ?? "draft",
    order_code: base?.order_code ?? "DRAFT",
    status_label: base?.status_label ?? "Draft",
    channel: draft.outlet_id ? "showroom" : (base?.channel ?? "dealer"),
    customer: {
      name: draft.customer_name || "—",
      address: addressString(draft, baseline) || "—",
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
function snapshotTemplateData(
  snap: SalesOrderSnapshot,
  base: SalesOrderTemplateData | null,
  /** ⭐ addon key -> the catalog's word for it (YH, 2026-09-01). See the
   *  `addons` mapping below — without this the printed document showed the
   *  customer a database key. A FUNCTION, not a map, so the caller decides
   *  what to do when the catalog has not answered: today it returns the key,
   *  which is what this printed before, so a slow catalog degrades to the old
   *  behaviour instead of printing a blank line on a document. */
  addonLabel: (key: string) => string = (key) => key,
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
  const paid = base?.paid ?? 0;
  const str = (k: string) => (h[k] == null ? null : String(h[k]));
  return {
    so_number: h["so"] != null ? `SO-${h["so"]}` : (base?.so_number ?? "—"),
    issue_date: (str("placed_at") ?? base?.issue_date ?? "").slice(0, 10),
    proceed_date: str("proceed_date"),
    order_id: base?.order_id ?? "snapshot",
    order_code: h["so"] != null ? `SO-${h["so"]}` : (base?.order_code ?? "—"),
    status_label: base?.status_label ?? "",
    channel: base?.channel ?? "dealer",
    customer: {
      name: str("customer_name") ?? "—",
      address: str("customer_address") ?? "—",
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
    payments: base?.payments ?? [],
    vouchers: [],
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
      sku: l.sku,
      qty: Number(l.qty),
      unit_price: Number(l.unit_price),
    })),
  };
}

/* ── Small atoms ───────────────────────────────────────────────────────────── */

/**
 * A left-pane block. The bar beside the title is the section's whole chrome —
 * §6.4 ④ ruled the panel CALM: sections, not a box around every field.
 *
 * **The bar is GREY, and that is a token law, not taste.**
 * `../../01-design-tokens.md` §2.2 is frozen: *"Blue appears ONCE on a screen —
 * on the primary button."* Eight blue rules down the left of one form would
 * spend the accent eight times and leave nothing to mark the current thing.
 * The tab underline above already holds the screen's one accent.
 */
export function Block({
  title,
  note,
  headerSlot,
  subtitle,
  summary,
  forceOpen,
  children,
}: {
  title: string;
  note?: string;
  /** ⭐ A STANDING FACT ABOUT THE WHOLE CARD BELONGS BESIDE ITS NAME
   *  (Jess, 2026-08-26). `note` is prose; this slot takes a rendered chip, so a
   *  fact the reader wants BEFORE reading the fields — is this a new customer or
   *  one we already have — is answered by the heading rather than by a row eight
   *  fields down.
   *
   *  ⭐ AND A READ-ONLY DOOR MAY RIDE HERE TOO (YH, 2026-09-01). The original
   *  rule read "a fact, never a control: nothing in here writes", and the
   *  second half of that sentence is the part that matters. A door that only
   *  NAVIGATES writes nothing — it is the Law C escape hatch, not a form — and
   *  a whole bordered row at the bottom of a card to hold one link is the
   *  "extra row for one control" this page has been removing all week.
   *  ⛔ STILL NEVER A WRITER. Nothing mounted here may submit, decide, or
   *  change a record; a control that writes belongs beside the fact it
   *  changes, where the reader can see what it will move. */
  headerSlot?: React.ReactNode;
  /** ⭐ WHAT THIS BLOCK IS FOR, in the operator's words (2026-08-24).
   *
   *  Jess's objective is that someone who does not know ERP can work this page
   *  without asking what a section means. The block TITLES are locked words
   *  (COPY-STANDARD "Use exactly", and MASTER.md's SALES ORDER OBJECT PAGE V2
   *  names them in its block order), so the answer is not to rename them — it
   *  is to EXPLAIN them. A subtitle teaches; a new noun would only move the
   *  confusion somewhere else. */
  subtitle?: string;
  /** One line standing in for the whole block while collapsed. Passing this is
   *  what makes a block collapsible at all — a block with no honest one-line
   *  summary must stay open, because a chevron hiding an unknown is worse than
   *  a card the reader can simply see. */
  summary?: string;
  /** ⭐ NEVER HIDE AN UNSAVED CHANGE. The dark save bar says `⚠ {n} changes`;
   *  if one of those changes sat inside a collapsed block the operator would be
   *  told something changed with no way to find it. A dirty block force-opens
   *  and cannot be closed until it is saved or discarded. */
  forceOpen?: boolean;
  children: React.ReactNode;
}) {
  const collapsible = Boolean(summary);
  const [open, setOpen] = useState(false);
  const isOpen = !collapsible || open || Boolean(forceOpen);
  const headingId = `block-h-${title.replace(/\s+/g, "-").toLowerCase()}`;
  const bodyId = `block-b-${title.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <section className="rounded-card border border-kit-slate-5 bg-white px-4 py-3" data-block={title}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-l-2 border-base-300 pl-2">
        {/* ⭐ A CARD TITLE WEARS THE CARD-TITLE TOKEN (2026-08-24) IN THE MONO
            FACE (YH, 2026-08-28).

            `01-design-tokens.md` §1 assigns `text-strong` to "card title ·
            field-group heading". That token STAYS — the 2026-08-24 fix was that
            this heading wore `text-label`, an 11px micro-label doing a section's
            job, and the size is what made sections stop reading as sections.

            What changes is the FACE. The kit loads exactly one UI family, so a
            heading could only differ from its fields by weight — which is not
            enough separation on a card holding three sub-sections. `font-mono`
            is already in this app: every RM figure renders in it, so this is a
            face the operator reads daily rather than a new one, and nothing
            else on a form card is monospaced. No token is added.

            ⚠ THIS OVERRIDES the 2026-08-24 note that uppercase "is a different
            defect". That note was written about 15px SANS uppercase. Mono
            uppercase with tracking reads as a label rather than as shouting,
            which is what a section name is. **Falsifier:** if an operator reads
            these headings as shouting, drop `uppercase tracking-[0.08em]` and
            keep the face — one class, no other change. */}
        <h2
          id={headingId}
          className="font-mono text-strong uppercase tracking-[0.08em] text-signature-700"
        >
          {title}
        </h2>
        {headerSlot}
        {note && <span className="text-meta font-normal text-base-600">{note}</span>}
      </div>
      {subtitle && (
        <p className="mt-1 pl-2 text-meta font-normal text-base-500" data-testid={`block-subtitle-${title}`}>
          {subtitle}
        </p>
      )}
      {collapsible && !isOpen ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          aria-controls={bodyId}
          className="mt-2 flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-body text-base-600 hover:bg-hovertint"
          data-testid={`block-expand-${title}`}
        >
          <span className="text-base-400">▸</span>
          <span className="min-w-0 flex-1 truncate">{summary}</span>
        </button>
      ) : (
        <>
          {collapsible && (
            <button
              type="button"
              onClick={() => setOpen(false)}
              /* A dirty block cannot be closed — the change must stay findable. */
              disabled={Boolean(forceOpen)}
              aria-expanded
              aria-controls={bodyId}
              className="mt-2 flex items-center gap-2 rounded-control px-2 py-1 text-left text-meta text-base-500 hover:bg-hovertint disabled:cursor-not-allowed disabled:opacity-50"
              data-testid={`block-collapse-${title}`}
              title={forceOpen ? "This section has unsaved changes" : undefined}
            >
              <span className="text-base-400">▾</span>
              <span>{forceOpen ? "Unsaved changes here" : "Hide"}</span>
            </button>
          )}
          <div id={bodyId} className="mt-3">
            {children}
          </div>
        </>
      )}
    </section>
  );
}

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
 * Deliberately quieter than a card title: `text-label` against the card's
 * `text-strong`, so one card still reads as one thing.
 */
function SubHead({ children, note }: { children: React.ReactNode; note?: string }) {
  /* ⭐ ONE COLOUR FOR EVERY HEADING ON THE PAGE (YH, 2026-09-01 — "card
     headers should have the same color").
     They did not. A card title was `text-base-900` in the mono face; a
     subsection heading was `text-base-600` in the UI face — so on one card the
     reader met two different kinds of heading and had to work out from the
     shade whether the second one was a section or a field label. The `Services`
     label that used to sit inside `Goods` was a third shade again.
     THE COLOUR IS THE CARD TITLE'S OWN, and no new token is added. The accent
     is deliberately NOT used: `01-design-tokens.md` §2.2 spends blue once per
     screen and the tab underline already holds it, so a blue heading here would
     be the second spend and the current thing would stop standing out.
     THE HIERARCHY MOVES TO SIZE, which is where it belongs. Same face, same
     tracking, same colour, one step down in size — a subsection reads as a
     smaller instance of the same thing rather than as a different species. */
  return (
    <p
      className="mb-2 mt-4 flex flex-wrap items-baseline gap-x-2 font-mono text-label uppercase tracking-[0.08em] text-signature-700 first:mt-0"
      data-testid={`subhead-${String(children).replace(/\s+/g, "-").toLowerCase()}`}
    >
      {children}
      {/* The card-level `note` slot, one level down. `creates a Revision ·
          needs approval` is governed copy that used to ride a Block title; the
          merge moved the heading, so it moves with it rather than being
          reworded or dropped. */}
      {note && <span className="font-normal text-base-500">{note}</span>}
    </p>
  );
}

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
function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  const id = `so-fact-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <FieldFrame id={id} label={label}>
      <div
        id={id}
        role="textbox"
        aria-readonly
        aria-label={label}
        data-kit="readonly-field"
        data-testid={id}
        className={`${CONTROL_BASE} ${CONTROL_BORDER.rest} rounded-control min-h-8 min-w-0 break-words px-2 py-1`}
      >
        {value}
      </div>
    </FieldFrame>
  );
}

/** The 0219 custom fields of one tab, rendered from the SAME contract the POS
 *  renders from. An operator who adds a field in Settings gets it on both
 *  surfaces or on neither. */
function CustomFields({
  fields,
  values,
  onChange,
}: {
  fields: CustomField[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <>
      {fields.map((f) => {
        const id = `so-custom-${f.key}`;
        const value = values[f.key] ?? "";
        if (f.type === "select") {
          return (
            <Select
              key={f.key}
              id={id}
              label={f.label}
              required={f.required}
              value={value || undefined}
              onValueChange={(v) => onChange(f.key, v)}
              options={f.options.map((o) => ({ value: o, label: o }))}
            />
          );
        }
        if (f.type === "date") {
          return (
            <DatePicker
              key={f.key}
              id={id}
              label={f.label}
              required={f.required}
              value={value || null}
              onChange={(iso) => onChange(f.key, iso ?? "")}
            />
          );
        }
        return (
          <Input
            key={f.key}
            id={id}
            label={f.label}
            required={f.required}
            type={f.type === "number" ? "number" : "text"}
            value={value}
            onChange={(e) => onChange(f.key, e.target.value)}
          />
        );
      })}
    </>
  );
}

type Mode = "object" | "create" | "oldrev";
const OBJECT_VIEWS = ["Order", "Revisions", "History", "Order Route"] as const;
type ObjectView = (typeof OBJECT_VIEWS)[number];

export default function SalesOrderWorkspace() {
  const { orderId } = useParams<{ orderId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const isNew = location.pathname.endsWith("/so/new");
  const showRoute = params.get("route") === "1" && !isNew;
  const [viewRev, setViewRev] = useState<number | null>(null);
  const [amendmentSeed, setAmendmentSeed] = useState<AmendmentProposal | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [problemOpen, setProblemOpen] = useState(false);
  /* Bumped by `More actions → Propose a change to the customer`. A counter, not
     a boolean, so the menu item still works after the modal was cancelled. */
  const [amendSignal, setAmendSignal] = useState(0);
  /* The `Change salesperson` door lives beside the Salesperson it changes; the
     modal behind it lives in `SalesOrderAttribution`. Bumping this opens it. */
  const [attributionSignal, setAttributionSignal] = useState(0);
  const canChangeSalesOwnership = useCanChangeSalesOwnership();
  const [amendDateOpen, setAmendDateOpen] = useState(false);
  const [objectView, setObjectView] = useState<ObjectView>(showRoute ? "Order Route" : "Order");

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
      { replace: true },
    );
  }, [params, setParams]);

  const detailQ = useOperationOrder(isNew ? null : (orderId ?? null));
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
  const revisionsQ = useSalesOrderRevisions(isNew ? null : (orderId ?? null));
  const goodsTruthQ = useSalesOrderExpansion(isNew ? "" : (orderId ?? ""));
  const amendmentQ = useSalesOrderAmendment(isNew ? null : (orderId ?? null));
  /* 3.4 · what this sales order's changes have raised for other modules. The
   * workspace SHOWS it and cannot close it — the module that raised the work
   * does not tick it off. */
  const correctionWorkQ = useOrderCorrectionWork(isNew ? null : (orderId ?? null));
  const routeFactsQ = useSalesOrderRouteFacts(
    isNew ? null : (orderId ?? null),
    !isNew && Boolean(orderId),
    (detailQ.data?.pos ?? []).map((po) => po.id),
  );
  /* LINKED PROBLEMS needs the case's own translated status word, and Service
     owns that translation. The route facts carry only open/closed. */
  const serviceCasesQ = useOrderServiceCases(isNew ? "" : (orderId ?? ""), {
    enabled: !isNew && Boolean(orderId),
  });
  const baseQ = useQuery({
    queryKey: ["orders", "sales-order-data", orderId ?? "new"],
    queryFn: () =>
      apiFetch<SalesOrderTemplateData>(`/api/orders/${orderId}/sales-order-data`),
    enabled: !isNew && !!orderId,
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

  /* ── The draft — seeded from the order, empty for CREATE. ─────────────── */
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [baseline, setBaseline] = useState<Draft>(EMPTY_DRAFT);
  const [draftSeed, setDraftSeed] = useState<string>("");
  const order = detailQ.data?.order;
  const detailLines = detailQ.data?.lines ?? [];
  useEffect(() => {
    if (isNew) {
      if (draftSeed !== "new") {
        const next = {
          ...EMPTY_DRAFT,
          lines: [{ key: nextKey(), sku: "", qty: 1, unit_price: 0 }],
        };
        setDraft(next);
        setBaseline(next);
        setDraftSeed("new");
      }
      return;
    }
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
    if (dirtyRef.current) return;
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
    };
    setDraft(next);
    setBaseline(next);
    setDraftSeed(seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isNew,
    order,
    orderId,
    detailLines,
    draftSeed,
    detailQ.dataUpdatedAt,
    viewRev,
    viewedRevision,
  ]);

  const mode: Mode = isNew ? "create" : viewRev != null ? "oldrev" : "object";

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
      if (draft[k] !== baseline[k]) changed.push(k);
    }
    return changed;
  }, [draft, baseline, mode]);
  const dirty = changedFields.length > 0;
  /* Read by the seeding effect without becoming one of its dependencies. */
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
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
    const itemsTotal =
      mode === "create"
        ? draft.lines.reduce((n, l) => n + l.qty, 0)
        : (detailQ.data?.lines ?? []).reduce((n, l) => n + l.qty, 0);
    /* ⭐ UNSET MEANS NONE — owner ruling 2026-08-27 (YH). It used to mean
       EVERY item (0104's column comment), so an order nobody was asked about
       carried the maximum fee. The same rule now runs in `order-totals.ts` and
       in the POS panel, so all three agree. */
    const items = stairCarryCount(itemsTotal, draft.delivery_stair_items);
    const floors = Math.max(0, draft.delivery_floor - cfg.freeUpToFloor);
    return {
      cfg,
      itemsTotal,
      items,
      floors,
      fee: floorSurchargeRaw(draft.delivery_floor, draft.delivery_has_lift, items, cfg),
    };
  }, [
    catalogQ.data?.floorConfig,
    mode,
    draft.lines,
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
   * ⭐ SO THE SENTENCE CHANGES SHAPE WITH THE MODE, because what is KNOWN
   * changes with the mode:
   *
   *   · CREATE — nothing is stamped yet, so the live rate IS the quote and the
   *     whole multiplication is exactly what the operator needs. Unchanged.
   *
   *   · OBJECT / OLDREV — the fee is the stamped `STAIR_CARRY` row, the same
   *     one MONEY reads, and the counts are the ones that produced it: the
   *     snapshot's for a revision, the order's own otherwise.
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
    if (mode === "create") {
      if (!stair || stair.fee <= 0) return null;
      return {
        quoted: true as const,
        items: stair.items,
        itemsTotal: stair.itemsTotal,
        floors: stair.floors,
        freeUpToFloor: stair.cfg.freeUpToFloor,
        perFloorPerItem: stair.cfg.perFloorPerItem,
        fee: stair.fee,
      };
    }
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
      quoted: false as const,
      items: stairCarryCount(itemsTotal, draft.delivery_stair_items),
      itemsTotal,
      floor: draft.delivery_floor,
      fee,
    };
  }, [
    mode,
    stair,
    viewedRevision,
    detailQ.data,
    draft.delivery_stair_items,
    draft.delivery_floor,
  ]);

  /* ── ONE template-data value per mode; the draft path debounces 300ms. ── */
  const base = baseQ.data ?? null;
  const liveDraftData = useMemo(
    () => (mode === "oldrev" ? null : draftTemplateData(draft, baseline, base, refs, stair?.fee ?? 0)),
    [mode, draft, baseline, base, refs, stair?.fee],
  );
  const debouncedDraftData = useDebounced(liveDraftData, 300);
  const templateData: SalesOrderTemplateData | null = useMemo(() => {
    if (mode === "oldrev" && viewedRevision)
      return snapshotTemplateData(viewedRevision.snapshot, base, (key) =>
        addonNameByKey.get(key) ?? key,
      );
    return debouncedDraftData;
  }, [mode, viewedRevision, base, debouncedDraftData, addonNameByKey]);

  const { setPane } = usePdfCanvases(templateData);

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
    if (!printData) return;
    if (printableRef.current.data !== printData || !printableRef.current.url) {
      if (printableRef.current.url) URL.revokeObjectURL(printableRef.current.url);
      const blob = await renderSalesOrderPdf(printData);
      printableRef.current = { data: printData, url: URL.createObjectURL(blob) };
    }
    const printable = printableRef.current.url;
    if (!printable) return;
    if (dirty) toast.message("You have unsaved changes — printing the saved version");
    window.open(printable, "_blank");
  };
  useEffect(
    () => () => {
      if (printableRef.current.url) URL.revokeObjectURL(printableRef.current.url);
    },
    [],
  );

  /* ── Writes — ONE page-level Save; every write mints a revision. ── */
  const saveMut = useSaveSalesOrderRevision(orderId ?? "", {
    onSuccess: (r) => {
      toast.success(`Saved · Rev ${r.revision}`);
      /* The saved values ARE the new baseline, so the bar clears immediately
         rather than after the round trip. The refetch that follows lands on a
         clean form and reseeds it from what the database actually stored. */
      setBaseline(draftRef.current);
      void revisionsQ.refetch();
      void baseQ.refetch();
      void detailQ.refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const createMut = useCreateSalesOrder({
    onSuccess: (r) => {
      toast.success(`SO-${r.so} created · Rev 1`);
      navigate(`/operation/orders/so/${r.id}`, { replace: true });
    },
    onError: (e) => toast.error(e.message),
  });

  const entryFieldsPayload = (): Record<string, string | null> => {
    const out: Record<string, string | null> = {
      building_type: draft.building_type.trim() || null,
    };
    for (const [k, v] of Object.entries(draft.custom)) out[k] = v.trim() || null;
    return out;
  };

  const safeCorrectionPayload = (): Record<string, unknown> => ({
    customer_name: autoCapitalize(draft.customer_name.trim()),
    customer_phone: draft.customer_phone.trim() || null,
    customer_email: draft.customer_email.trim() || null,
    customer_race: draft.customer_race.trim() || null,
    customer_gender: draft.customer_gender.trim() || null,
    customer_birthday: draft.customer_birthday || null,
    customer_address: autoCapitalize(addressString(draft, baseline).trim()) || null,
    customer_address_line1: autoCapitalize(draft.customer_address_line1.trim()) || null,
    customer_address_line2: autoCapitalize(draft.customer_address_line2.trim()) || null,
    customer_address_city: draft.customer_address_city.trim() || null,
    customer_address_state: draft.customer_address_state.trim() || null,
    customer_address_postcode: draft.customer_address_postcode.trim() || null,
    customer_address_unknown: draft.customer_address_unknown,
    customer_emergency: emergencyString(draft) || null,
    customer_billing: billingString(draft, baseline).trim() || null,
    customer_billing_same: draft.customer_billing_same,
    proceed_date: draft.proceed_date,
    delivery_floor: draft.delivery_floor,
    delivery_has_lift: draft.delivery_has_lift,
    delivery_stair_items: draft.delivery_stair_items,
    entry_fields: entryFieldsPayload(),
  });

  const createHeaderPayload = (): Record<string, unknown> => ({
    ...safeCorrectionPayload(),
    delivery_date: draft.delivery_date,
    delivery_date_tbd: draft.delivery_date_tbd,
  });

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

  const draftLinesPayload = () =>
    draft.lines
      .filter((l) => l.sku.trim().length > 0)
      .map((l) => ({
        ...(l.id ? { id: l.id } : {}),
        sku: l.sku.trim(),
        qty: l.qty,
        unit_price: l.unit_price,
        /* 0374 — a line born here MAY carry its configuration. Nothing on this
           form authors attrs yet, so today this only survives a COPY: copying a
           configured order used to silently strip the fabric, colour and gap
           off every line and hand Purchasing a PO it could not autofill. */
        ...(l.attrs ? { attrs: l.attrs } : {}),
      }));

  const validateDraft = (needDealer: boolean): string | null => {
    if (!draft.customer_name.trim()) return "Customer name is required";
    if (needDealer && !draft.dealer_id) return "A dealer is required";
    /* orders_salesperson_required (0296): every portal-born order names who
     * sold it. */
    if (needDealer && !draft.salesperson_id) return "A salesperson is required";
    if (needDealer && draftLinesPayload().length === 0) return "An order needs at least one item";
    /* The delivery date is a PROMISE (orders/MASTER — THE THREE DELIVERY
     * DATES). A date inside the production lead is a promise the factory
     * cannot keep, and the POS has refused it since 2026-05-22 — this door
     * now refuses it too, with the same arithmetic rather than a second one. */
    if (draft.delivery_date && earliestPromise && draft.delivery_date < earliestPromise) {
      return `Delivery is too soon — the earliest this cart can be promised is ${fmtDate(earliestPromise)}`;
    }
    /* ⭐ THE OFFICE DOOR NAMES THE PRODUCTION START (YH, 2026-08-28).
       The POS has refused an order without one since Phase 11.1; this door did
       not, so it could mint the one thing nobody can then repair — an order
       whose Proceed date renders read-only as `Not recorded` forever.
       `createOrderInput` and `sales_order_create` (0391) refuse it again. */
    if (needDealer && !draft.proceed_date) {
      return "Proceed date — pick the day production should start";
    }
    if (draft.proceed_date && draft.delivery_date && draft.proceed_date > draft.delivery_date) {
      return "The proceed date is after the delivery date";
    }
    /* Building type is DELIVERY's fact — stairs, lift access, van parking all
     * hang off it (Jess, 2026-08-21: it must be filled, delivery needs it).
     * An unknown address cannot demand one; a known address must say. */
    if (!draft.customer_address_unknown && !draft.building_type) {
      return "Fill in the building type first — a condominium can only take a half-day delivery.";
    }
    return null;
  };

  const onSave = () => {
    const err = validateDraft(false);
    if (err) return void toast.error(err);
    saveMut.mutate({ header: safeCorrectionPayload() });
  };
  const onCreate = () => {
    const err = validateDraft(true);
    if (err) return void toast.error(err);
    /* A BIRTH names the parties — only the correction door lost them to 0329. */
    createMut.mutate({
      header: {
        ...createHeaderPayload(),
        dealer_id: draft.dealer_id,
        salesperson_id: draft.salesperson_id,
        outlet_id: draft.outlet_id,
      },
      lines: draftLinesPayload(),
    });
  };

  const setField = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));
  const setCustom = (key: string, value: string) =>
    setDraft((d) => ({ ...d, custom: { ...d.custom, [key]: value } }));
  const setLine = (key: string, patch: Partial<DraftLine>) =>
    setDraft((d) => ({
      ...d,
      lines: d.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    }));

  const confirmDiscard = () => !dirty || window.confirm("Discard unsaved changes?");
  const discard = () => {
    if (!confirmDiscard()) return;
    if (isNew) return navigate("/operation/orders");
    setDraft(baseline);
  };

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
    if (view !== "Order" && !confirmDiscard()) return;
    if (view !== "Order" && dirty) setDraft(baseline);
    setObjectView(view);
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (view === "Order Route") next.set("route", "1");
        else next.delete("route");
        return next;
      },
      { replace: true },
    );
    if (view === "Order Route") return;
    if (view === "Order") {
      window.setTimeout(() => document.getElementById("sales-order-workspace")?.scrollIntoView(), 0);
    }
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
      return orderMoney({ lineSum, addonSum, paid: base?.paid ?? 0, controlBalance: null });
    }
    if (mode === "create") {
      const lineSum = draft.lines.reduce(
        (s, l) => s + (l.sku.trim() ? l.qty * l.unit_price : 0),
        0,
      );
      /* ⭐ THE QUOTE INCLUDES THE CARRY, BEFORE IT IS SAVED (YH, 2026-08-28).
         Stair carry is money the customer owes (MASTER § STAIR CARRY IS MONEY
         THE CUSTOMER OWES), and 0393 makes it a real `STAIR_CARRY` addon row —
         but that row does not exist until the order does. So on `/so/new` this
         card printed a Total the operator could see was wrong: the ORDER INFO
         block three cards down was narrating `× RM 50 = RM 300` while MONEY
         showed lines only.

         CREATE ONLY. In `object` and `oldrev` the fee is already IN the addons
         — 0393 stamps the row at birth and re-stamps it whenever the floor,
         the lift or the count moves — so adding it here too would count it
         twice. This branch exists precisely because it is the one state with
         no persisted row to read.

         The number is `stair.fee`, the same memo the working-out line prints,
         so the quote and its explanation cannot disagree (Law D). */
      const addonSum =
        (base?.addons ?? []).reduce((s, a) => s + a.line_total, 0) + (stair?.fee ?? 0);
      return orderMoney({ lineSum, addonSum, paid: base?.paid ?? 0, controlBalance: null });
    }
    const lines = detailQ.data?.lines ?? [];
    const addons = detailQ.data?.addons ?? [];
    return orderMoney({
      lineSum: lines.reduce((s, l) => s + Number(l.unit_price ?? 0) * Number(l.qty ?? 0), 0),
      addonSum: addons.reduce((s, a) => s + Number(a.unit_price ?? 0) * Number(a.qty ?? 0), 0),
      paid: order?.paid,
      controlBalance: null,
    });
  }, [mode, draft.lines, base, viewedRevision, detailQ.data, order, stair?.fee]);

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
    return resolveSalesOrderRoute({
      order: {
        id: orderId,
        so: detail.order.so,
        customerName: displayCustomerName(detail.order.customer_name),
        placedAt: detail.order.placed_at,
        deliveryDate: detail.order.delivery_date,
        deliveredAt: detail.order.delivered_at,
      },
      lineLabels: Object.fromEntries(detail.lines.map((line) => [line.sku, line.label?.trim() || line.sku])),
      /* Deliver To is PURCHASING's answer, quantity split included. Sales
         Order stores neither the destination nor its split, so the Route
         reads it and never infers one. */
      lineDestinations: Object.fromEntries(
        (goodsTruthQ.data?.lines ?? []).map((line) => [line.sku, line.deliverTo]),
      ),
      cancelledLines,
      allocation: facts.allocation,
      purchaseOrders: detail.pos.map((po) => ({
        id: po.id,
        issuedAt: po.placed_at ? po.placed_at.slice(0, 10) : null,
        expectedReadyDate: po.expected_ready_date ?? null,
        lines: po.lines.map((line) => ({
          sku: line.sku,
          qty: Number(line.qty),
          receivedQty: Number(line.received_qty),
        })),
      })),
      receivingRecords: facts.receiving.map((record) => ({
        id: record.id,
        recordNo: receivingRecordNo({
          id: record.id,
          goods_received_at: record.goods_received_at ?? undefined,
          submitted_at: record.submitted_at,
        }),
        poId: record.po_id,
        receivedAt: record.goods_received_at,
      })),
      delivery: {
        /* The document's own number (0356/Law D) — the gate stops depending on
           an attempt existing before it can print the number the system
           already minted. */
        doNumber: detail.order.do_number ?? null,
        /* Delivery's own answer about who carries this order — the LOGISTICS
           node never infers a company from the region default. */
        logistics: facts.brief.assignedLogistics
          ? { partnerName: facts.brief.assignedLogistics.partnerName }
          : null,
        booking: facts.brief.appointment
          ? {
              confirmedDate: facts.brief.appointment.dateIso,
              slot: facts.brief.appointment.slot,
              scope: facts.brief.appointment.scope,
            }
          : null,
        /* `ops_order_control.delivery_photos` (0280) — the ledger the
           `Upload delivery photo` queue already counts. */
        photos: (detail.control?.delivery_photos ?? []).map((photo) => ({
          at: photo.at ?? null,
          by: photo.by ?? null,
        })),
        attempts: facts.attempts.map((attempt) => ({
          id: attempt.id,
          attemptNo: attempt.attempt_no,
          result: attempt.result,
          reason: attempt.reason_key ? deliveryReasonLabel(attempt.reason_key) : attempt.note,
          doNumber: attempt.do_number,
          scheduledDate: attempt.scheduled_date,
          recordedAt: attempt.recorded_at,
        })),
      },
      /* Straight from the ONE arithmetic (§8): what is known and what is owed.
         Under the 2026-08-19 ruling the outstanding figure is a GATE input
         again — money in full before delivery, or an approved COD. */
      money: {
        known: money.known,
        outstanding: money.outstanding,
      },
      /* The two money records (0355 + 0362) — the same tables the server-side
         gate reads, so the canvas cannot lie about the refusal. */
      financeExceptions: (facts.financeExceptions ?? []).map((row) => ({
        id: row.id,
        status: row.status,
        reason: row.reason,
      })),
      paymentApprovals: (facts.paymentApprovals ?? []).map((row) => ({
        id: row.id,
        status: row.status,
      })),
      cases: facts.cases.map((item) => ({
        id: item.id,
        caseNo: item.caseNo,
        statusLabel: caseStatus.get(item.id) ?? null,
        closed: item.statusIsClosed,
      })),
      claims: facts.claims.map((item) => ({
        id: item.id,
        claimNo: item.claim_no,
        statusLabel: supplierClaimStatusLabel(item.status),
        closed: item.status === "closed",
      })),
      /* Card 6 — an INDEPENDENT obligation. It renders only while an item is
         out, and it never blocks the delivery. */
      loans: facts.loans.map((loan) => ({
        id: loan.id,
        label: loan.borrowed_label?.trim() || loan.item_sku || loan.borrowed_sku || "item",
        qty: 1,
        returned: loan.status === "returned",
      })),
      /* Sunday and Malaysian public holidays are the two days no company runs
         (§8) — the gate names the refused day instead of failing silently. */
      publicHolidays: [...myHolidaySet()],
    });
  }, [
    orderId,
    detailQ.data,
    routeFactsQ.data,
    goodsTruthQ.data,
    serviceCasesQ.data,
    cancelledLines,
    money,
  ]);

  /* The Route hands out the action-engine line; the ROSTER names the person.
     One duty read, the same one the Team board and the PO chips use. */
  const dutyQ = useWorkspaceDuties();
  const routeOwners = useMemo(
    () => ({
      purchasing: workspaceDutyActor(dutyQ.data, "po_duty"),
      receiving: workspaceDutyActor(dutyQ.data, "grn_duty"),
    }),
    [dutyQ.data],
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
  const spOptions = useMemo(
    () => [{ value: "none", label: "Not recorded" }, ...realSpOptions],
    [realSpOptions],
  );
  const outletOptions = useMemo(
    () => [{ value: "none", label: "Not recorded" }, ...realOutletOptions],
    [realOutletOptions],
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

  const headerRight = (
    <span className="flex items-center gap-2">
      {mode === "object" && objectView === "Order" && !showRoute && order && order.status !== "cancelled" && (
        <details className="relative">
          <summary className="btn-ghost cursor-pointer list-none text-meta">More actions</summary>
          <div className="absolute right-0 top-full z-20 mt-1 w-56 rounded-control border border-kit-slate-5 bg-white p-1 shadow-lg">
            {/* ⭐ ONE IMPLEMENTATION, TWO DOORS — owner ruling 2026-08-15. Copy
                already ships on the register's right-click menu and seeds the
                authoritative create form; the object page reaches the SAME
                route rather than growing a second copy path (Law C: a door,
                never a duplicate). */}
            {/* A problem is RARE and it leaves this object for Service — it
                belongs with the other rare acts, not as a permanent card on a
                page the operator reads every day (owner ruling 2026-08-15). */}
            <button
              type="button"
              onClick={() => setProblemOpen(true)}
              data-testid="workspace-report-problem"
              className="w-full rounded-control px-2 py-1.5 text-left text-meta text-base-700 hover:bg-hovertint"
            >
              Report a problem
            </button>
            {/* ⭐ THE AMENDMENT DOOR MADE THE SAME JOURNEY (YH, 2026-08-26).
                It was a standing strip at the foot of `Order info`; proposing a
                contractual change is rarer than reading an order, and this is
                where this page already keeps its rare acts. The strip is gone;
                the capability — items, unit price, instalment months — is not,
                and `Change delivery date` still handles the date on the card. */}
            <button
              type="button"
              onClick={() => setAmendSignal((n) => n + 1)}
              data-testid="workspace-propose-change"
              className="w-full rounded-control px-2 py-1.5 text-left text-meta text-base-700 hover:bg-hovertint"
            >
              Propose a change to the customer
            </button>
            <button type="button" onClick={() => setCancelOpen(true)} data-testid="workspace-cancel-so" className="w-full rounded-control px-2 py-1.5 text-left text-meta text-danger hover:bg-hovertint">Cancel SO</button>
          </div>
        </details>
      )}
      {mode === "create" && (
        <>
          <Button size="sm" variant="ghost" onClick={discard} data-testid="workspace-cancel">
            <X size={14} /> Discard
          </Button>
          <Button
            size="sm"
            variant="primary"
            loading={createMut.isPending}
            onClick={onCreate}
            data-testid="workspace-save"
          >
            Create order
          </Button>
        </>
      )}
      {mode === "oldrev" && (
        <Button
          size="sm"
          variant="neutral"
          onClick={() => {
            setViewRev(null);
            setParams((prev) => {
              const next = new URLSearchParams(prev);
              next.delete("revision");
              return next;
            }, { replace: true });
          }}
          data-testid="workspace-back-to-current"
        >
          Back to current
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        disabled={!printData}
        onClick={() => void openPrint()}
        data-testid="workspace-print"
      >
        <Printer size={14} /> Print ▾
      </Button>
    </span>
  );

  const soWord = isNew ? "New Sales Order" : order ? `SO-${order.so}` : "Sales Order";

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


  /* ── THE LEFT PANE ─────────────────────────────────────────────────────── */
  const form = (
    /* A `fieldset` because the browser's own disabled-descendants rule is the
       only lock that cannot be forgotten one control at a time. `contents`
       keeps it out of the layout. */
    <fieldset
      disabled={mode === "oldrev"}
      className="so-detail-style contents"
      data-testid="sales-order-workspace"
      id="sales-order-workspace"
    >
    {/* §3 of the token table names 24px "between blocks · card padding" and 12px
        "standard gap". The left pane stacked eight sections at the standard gap,
        so neighbouring cards sat as close as two fields inside one card — the
        second half of why the sections did not separate. */}
    <div className="flex flex-col gap-6">
      {mode === "oldrev" && viewedRevision && (
        <div className="px-1">
          <span className="rounded-full bg-base-900 px-2 py-0.5 text-label font-semibold text-white">
            Viewing Rev {viewedRevision.revision} · read-only
          </span>
        </div>
      )}
      {!isNew && (order?.source_ref ?? []).length > 0 && (
        <div className="px-1 text-meta text-base-500">
          Customer reference {(order?.source_ref ?? []).join(" · ")}
        </div>
      )}

      {/* ① CUSTOMER — now the whole customer, address included (Jess,
          2026-08-26). `Delivery address` was its own card between `Emergency
          contact` and `Money`; a reader looking up "where does this go" had to
          pass two unrelated sections to find it. It is the same party's fact,
          so it is the same card, under its own locked name. */}
      <Block title="Customer">
          {customerBuiltins["customerType"]?.enabled !== false ? (
            <div className="mb-2 flex justify-start" data-pos-field="customerType">
              <span
                className="so-customer-status font-mono text-label uppercase tracking-[0.08em]"
                data-testid="customer-type-chip"
              >
                {customerTypeWord}
              </span>
            </div>
          ) : null}
        {/* ⭐ THREE ACROSS (YH, 2026-08-27) — the six identity fields were two
            per row, which made the card six rows tall for facts that are one
            line each. At three they land as exactly two rows: who they are,
            then who they are demographically. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div data-pos-field="name">
            <Input id="so-name" label="Full name" required value={draft.customer_name}
              onChange={(e) => setField("customer_name", e.target.value)} />
          </div>
          <div data-pos-field="phone">
            <Input id="so-phone" label="Phone" value={draft.customer_phone}
              onChange={(e) => setField("customer_phone", e.target.value)} />
          </div>
          {customerBuiltins["email"]?.enabled !== false && (
            <div data-pos-field="email">
              <Input id="so-email" label="Email" required={customerBuiltins["email"]?.required}
                value={draft.customer_email}
                onChange={(e) => setField("customer_email", e.target.value)} />
            </div>
          )}
          {customerBuiltins["race"]?.enabled !== false && (
            <div data-pos-field="race">
              <Select id="so-race" label="Race" required={customerBuiltins["race"]?.required}
                value={draft.customer_race || undefined}
                onValueChange={(v) => setField("customer_race", v)}
                options={CUSTOMER_RACE_OPTIONS.map((r) => ({ value: r, label: r }))} />
            </div>
          )}
          {customerBuiltins["gender"]?.enabled !== false && (
            <div data-pos-field="gender">
              <Select id="so-gender" label="Gender" required={customerBuiltins["gender"]?.required}
                value={draft.customer_gender || undefined}
                onValueChange={(v) => setField("customer_gender", v)}
                options={CUSTOMER_GENDER_OPTIONS.map((g) => ({ value: g, label: g }))} />
            </div>
          )}
          {customerBuiltins["birthday"]?.enabled !== false && (
            <div data-pos-field="birthday">
              <DatePicker id="so-birthday" label="Birthday" required={customerBuiltins["birthday"]?.required}
                value={draft.customer_birthday}
                onChange={(iso) => setField("customer_birthday", iso)} />
            </div>
          )}
          <CustomFields fields={tab("customer").custom} values={draft.custom} onChange={setCustom} />
        </div>
        {/* Merged from the retired `Delivery address` card (Jess,
            2026-08-26). Same fields, same ids, same one-address fact — it
            simply stopped being a separate card two sections away from the
            customer it belongs to. */}
        <SubHead>Delivery address</SubHead>
        {/* ⭐ FOUR TRACKS (YH, 2026-08-27). The two address lines take two
            tracks each, so they still read as full-width pairs — and STATE ·
            CITY · POSTCODE · BUILDING TYPE then land on ONE row instead of
            two-and-a-bit. Same fields, same cascade, three rows fewer. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4" data-pos-field="address">
          {/* ⭐ THE ESCAPE HATCH ONLY APPEARS WHEN IT IS NEEDED (YH,
              2026-08-26). `Address not given yet` is the answer to a MISSING
              address; on an order that already carries one it is a permanent
              tickbox whose only power is to throw that address away. It shows
              while the address is blank, and while it is already ticked (so it
              can be unticked) — and disappears once there is an address to
              read. The FIELD is untouched: `customer_address_unknown` still
              round-trips, and the POS still asks the same question. */}
          {(addressIsBlank || draft.customer_address_unknown) && (
            <div className="sm:col-span-4">
              <Checkbox id="so-address-unknown" label="Address not given yet"
                checked={draft.customer_address_unknown}
                onCheckedChange={(v) => setField("customer_address_unknown", v)} />
            </div>
          )}
          <div className="sm:col-span-2">
            <Input id="so-line1" label="Address line 1" value={draft.customer_address_line1}
              disabled={draft.customer_address_unknown}
              onChange={(e) => setField("customer_address_line1", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Input id="so-line2" label="Address line 2" value={draft.customer_address_line2}
              disabled={draft.customer_address_unknown}
              onChange={(e) => setField("customer_address_line2", e.target.value)} />
          </div>
          {/* THE MALAYSIA CASCADE — state picks city picks postcode, the same
              three questions in the same order the POS asks them.
              (`@/data/malaysia-postcodes`, one dataset, no second copy.)

              Before this, all three were free text here while the POS could
              only ever write a listed value — so the office could produce an
              address the shop floor was incapable of producing, and a postcode
              that belongs to no city in its own state.

              STRICT, and that is measured rather than assumed: NO importer
              writes `customer_address_state` — the only writers are this door
              and the POS create/update path, and AutoCount rows carry null in
              all three columns (their address arrives as ONE composed string).
              So a picker cannot orphan legacy data; there is nothing in the
              column to preserve. An address the list cannot express still has
              two homes — the free-text lines above, and `Address not given
              yet` for the genuinely unknown. */}
          <Select id="so-state" label="State"
            value={draft.customer_address_state || undefined}
            disabled={draft.customer_address_unknown}
            onValueChange={(v) =>
              setDraft((d) => ({ ...d, ...addressCascadePatch("state", v) }))
            }
            options={MY_STATES.map((st) => ({ value: st, label: st }))} />
          <Select id="so-city" label="City"
            value={draft.customer_address_city || undefined}
            disabled={draft.customer_address_unknown || !draft.customer_address_state}
            hint={!draft.customer_address_state ? "Pick a state first" : undefined}
            onValueChange={(v) =>
              setDraft((d) => ({ ...d, ...addressCascadePatch("city", v) }))
            }
            options={getCities(draft.customer_address_state || null).map((c) => ({ value: c, label: c }))} />
          <Select id="so-postcode" label="Postcode"
            value={draft.customer_address_postcode || undefined}
            disabled={draft.customer_address_unknown || !draft.customer_address_city}
            hint={!draft.customer_address_city ? "Pick a city first" : undefined}
            onValueChange={(v) => setField("customer_address_postcode", v)}
            options={getPostcodes(
              draft.customer_address_state || null,
              draft.customer_address_city || null,
            ).map((pc) => ({ value: pc, label: pc }))} />
          <Select id="so-building-type" label="Building type" required
            error={
              !draft.customer_address_unknown && !draft.building_type
                ? "Fill in the building type first — a condominium can only take a half-day delivery."
                : undefined
            }
            value={draft.building_type || undefined}
            onValueChange={(v) => setField("building_type", v)}
            options={BUILDING_TYPE_OPTIONS.map((b) => ({ value: b, label: b }))} />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4" data-pos-field="billing">
          <div className="sm:col-span-4">
            <Checkbox id="so-billing-same" label="Billing address same as delivery"
              checked={draft.customer_billing_same}
              onCheckedChange={(v) => setField("customer_billing_same", v)} />
          </div>
          {!draft.customer_billing_same && (
            <div className="sm:col-span-4">
              <Input id="so-billing" label="Billing address" value={draft.customer_billing}
                onChange={(e) => setField("customer_billing", e.target.value)} />
            </div>
          )}
          <CustomFields fields={tab("address").custom} values={draft.custom} onChange={setCustom} />
        </div>
        {/* ⭐ Merged from the retired `Emergency contact` card (YH,
            2026-08-27). It is the same person's fact, so it is the same
            card — the customer, everywhere their goods go, and who to ring
            if nobody answers on the day. It loses its fold with its border:
            three fields do not need hiding, and a collapsed card cannot
            show an unsaved change without the force-open machinery that
            existed only because it was collapsible. */}
        {emergencyEnabled && (
          <>
            <SubHead>Emergency contact</SubHead>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" data-pos-field="emergency">
              <Input id="so-emergency-name" label="Name" value={draft.emergency_name}
                onChange={(e) => setField("emergency_name", e.target.value)} />
              <Input id="so-emergency-phone" label="Phone" value={draft.emergency_phone}
                onChange={(e) => setField("emergency_phone", e.target.value)} />
              {/* The relationship is a picker with a free-text escape: an
                  imported or hand-typed word that is not on the list must survive
                  being looked at, so it stays in the text box. */}
              <Input id="so-emergency-relationship" label="Relationship"
                list="so-emergency-relationships"
                value={draft.emergency_relationship}
                onChange={(e) => setField("emergency_relationship", e.target.value)} />
              <datalist id="so-emergency-relationships">
                {EMERGENCY_RELATIONSHIPS.map((r) => <option key={r} value={r} />)}
              </datalist>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <CustomFields fields={tab("emergency").custom} values={draft.custom} onChange={setCustom} />
            </div>
          </>
        )}
      </Block>

      {/* ⑥ MONEY — read-only forever (ownership Law B). */}
      {/* ⭐ THE DOOR RIDES THE TITLE (YH, 2026-09-01). `Open this order in
          Payments` had a hairline and a row of its own at the foot of the
          card — a separator introducing one link, on a card whose entire
          content is three numbers. The word is locked (COPY-STANDARD:1595) and
          unchanged; only the row is gone. It still writes nothing: it
          navigates to the desk that owns collection, already scoped to this
          order, which is the one thing Law C lets a summary add. */}
      <Block title="Money">
        {/* ⭐ THREE AMOUNTS, ONE SIZE (YH, 2026-08-28 — overwrites the
            2026-08-15 `Total large · Paid medium · Outstanding loudest`
            weighting). The weighting never reached the numerals anyway:
            `<Money>` renders every amount at its `row` tone, so all three
            digits were ALREADY 13px and only the CONTAINERS differed. Three
            different container sizes meant three different line-heights, so
            under `items-end` the three amounts did not sit on one line —
            which is what read as "alignment wrong". One size on all three
            fixes the alignment and the fallback strings at the same time.
            Colour still separates them: Outstanding is red while owed. */}
        {/* ⭐ THE THREE AMOUNTS ARE FIELDS TOO (YH, 2026-09-01). They were the
            last bare label-over-value pair on the page — the shape the rest of
            the card stopped using when `Fact` took the kit's control skin. A
            reader scanning down met boxes, boxes, boxes and then three loose
            numbers, which reads as a different kind of thing rather than as
            three answers this surface may not change.
            Money stays READ-ONLY (ownership Law B): a box is a shape, not a
            door, and nothing here writes. The three-across grid is the same one
            `Order info` and `Customer` use, so the amounts line up with every
            other answer instead of packing left on a flex row.
            Colour survives INSIDE the box: Outstanding is still red while any
            of it is owed (owner ruling 2026-08-15), and all three keep
            `text-strong` so the numerals stay one size — the 2026-08-28 fix,
            untouched. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Fact
            label="Total"
            value={
              <span className="text-strong text-base-900" data-testid="money-total">
                {money.known && money.total != null ? <Money value={money.total} /> : "No price yet"}
              </span>
            }
          />
          <Fact
            label="Paid"
            value={
              <span className="text-strong text-base-700" data-testid="money-paid">
                <Money value={money.paid} />
              </span>
            }
          />
          {/* ⭐ THE CUSTOMER-MONEY WORD IS `Outstanding` (CLAUDE.md §7 — what the
              CUSTOMER owes HQ). It is the most-read number on the page
              (ui/MASTER.md §6.4 ⑤) and stays RED while any of it is owed
              (owner ruling 2026-08-15) — the colour carries that on its own,
              at the same size as its two neighbours. */}
          <Fact
            label="Outstanding"
            value={
              <span
                className={`text-strong ${money.known && money.outstanding > 0 ? "text-danger" : "text-base-900"}`}
                data-testid="money-outstanding"
              >
                {!money.known ? "No price yet" : money.outstanding > 0 ? <Money value={money.outstanding} /> : "Paid in full"}
              </span>
            }
          />
        </div>
        {!isNew && order ? (
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              data-testid="workspace-open-payments"
              className="text-meta font-medium text-kit-blue-11 underline-offset-2 hover:underline"
              onClick={() => navigate(`/operation?tab=payments&so=${order.so}`)}
            >
              Open this order in Payment
            </button>
          </div>
        ) : null}
      </Block>

      {/* ② ORDER INFO */}
      {/* No subtitle (YH, 2026-08-26). The 2026-08-24 teaching line explained
          what `Proceed date` meant while it was an editable box the office had
          to reason about. It is a recorded fact now, and a sentence explaining
          a read-only date is the "reduce descriptions" Jess asked for. */}
      <Block title="Order info">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Fact label="SO Date" value={isNew ? fmtDate(new Date().toISOString().slice(0, 10)) : fmtDate(order?.placed_at ?? null)} />
          {mode === "create" ? (
            <div data-pos-field="deliveryDate">
              <DatePicker id="so-promised" label="Requested Delivery Date" value={draft.delivery_date}
                hint={earliestPromise ? `Earliest ${fmtDate(earliestPromise)} — production lead` : undefined}
                error={
                  draft.delivery_date && earliestPromise && draft.delivery_date < earliestPromise
                    ? `Too soon — earliest is ${fmtDate(earliestPromise)}`
                    : undefined
                }
                onChange={(iso) => setField("delivery_date", iso)} />
            </div>
          ) : (
            <div data-pos-field="deliveryDate">
              <Fact label="Requested Delivery Date" value={
                promisedWord(mode, viewedRevision, order) === "No delivery date" ? (
                  <span data-attention="warning" className="inline-flex rounded-control bg-kit-amber-3 px-1.5 py-0.5 font-medium text-kit-amber-11">No delivery date</span>
                ) : promisedWord(mode, viewedRevision, order)
              } />
              {/* ⭐ THE DOOR SITS BESIDE THE DATE IT MOVES (YH, 2026-08-27).
                  The three amend fields were a whole section — first a card,
                  then a merged subsection — standing open on every order for an
                  act that happens rarely. They are a MODAL now, opened from the
                  fact they change, which is where somebody looking at a wrong
                  date already has their eye.
                  A LIVE proposal is truth and is NOT hidden behind the modal:
                  it prints here, under the date it is waiting to move. */}
              {!isNew && mode === "object" && orderId && (
                liveAmendment ? (
                  <p className="mt-1 text-meta text-base-600" data-testid="amend-date-waiting">
                    {liveAmendment.stale
                      ? "A proposal on this order is out of date."
                      : "A proposal is waiting for management."}
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAmendDateOpen(true)}
                    data-testid="amend-date-open"
                    className="mt-1 text-meta font-medium text-kit-blue-11 underline-offset-2 hover:underline"
                  >
                    Change delivery date
                  </button>
                )
              )}
            </div>
          )}
          {/* ⭐ PROCEED DATE IS READ-ONLY ONCE THE ORDER EXISTS (Jess,
              2026-08-26). This OVERWRITES `docs/orders/MASTER.md` §725-728,
              which gave Operations a direct writer here. The portal asks for
              the production start as a REQUIRED question at the point of sale
              (`Proceed date · production start *`), so on an existing order it
              is a recorded answer, not a field — and an office edit that moved
              it silently moved when the factory may start.
              CREATE still owns the picker: `createOrderInput` refuses an order
              without one, so keying a new SO here must still be able to set it. */}
          {/* ⭐ A DATE THAT WAS NEVER RECORDED IS NOT A DATE THAT IS LOCKED
              (YH, 2026-08-28). Jess's ruling stands untouched — a proceed date
              that EXISTS is a recorded answer and stays a `Fact`, because
              moving it moves when the factory may start. But an order that
              never carried one is not a locked answer, it is a MISSING one,
              and locking a blank is how the office door's own orphans became
              unfixable. So the picker returns for exactly that case.

              THE TEST IS `baseline`, NEVER `draft`. `baseline` is what the
              database holds; `draft` is what is on screen. Reading `draft`
              would swap the field back to a `Fact` the instant a date was
              picked — the operator would watch their own answer lock before
              they had saved it, with no way to correct a mis-click. Reading
              the saved value keeps the control open for the whole edit and
              locks on the next load, which is when the answer is real.

              `sales_order_save_revision` (0391) enforces the same rule: a
              blank may be filled, a recorded date may not be moved or cleared.
              This control is the door, not the lock. */}
          <div data-pos-field="proceedDate">
            {mode === "create" || (mode === "object" && !baseline.proceed_date) ? (
              <DatePicker id="so-proceed" label="Proceed date" value={draft.proceed_date}
                hint={
                  mode === "object"
                    ? "Never recorded — fill it in once, then it locks"
                    : undefined
                }
                error={
                  draft.proceed_date && draft.delivery_date && draft.proceed_date > draft.delivery_date
                    ? "After the delivery date"
                    : undefined
                }
                onChange={(iso) => setField("proceed_date", iso)} />
            ) : (
              <span id="so-proceed">
                <Fact label="Proceed date" value={fmtDate(draft.proceed_date) || "Not recorded"} />
              </span>
            )}
          </div>
          {/* ⭐ THE TAG COVERS THE FIELD IT NAMES (YH, 2026-09-01).
              `data-pos-field="stairCarry"` wrapped the FLOOR box alone. The
              registry field it stands for is "Delivery access (floor / lift /
              stair carry)" — three questions — and the other two sat outside
              the tag entirely.
              That is not cosmetic. The POS-parity contract test walks
              `POS_FORM_BUILTINS` and asserts each key's attribute appears in
              this file; it cannot see WHAT the attribute wraps. So the test
              reported "stair carry is covered" while checking one box of
              three, and deleting `Lift available?` tomorrow would still pass.
              THIS IS THE SECOND TIME. `orderAddons` carried the same attribute
              on a hidden `<span>` with no control behind it, and the page
              passed a completeness test it did not meet while the office rang
              the shop to add a disposal service. The lesson was written into
              the comment above that door and the same defect was live twelve
              lines away.
              A NESTED GRID, not a wrapper div: the three fields still sit on
              the parent's own three tracks (`sm:col-span-3 sm:grid-cols-3`),
              so nothing moves on screen — and they now read as the one topic
              they are. */}
          <div
            data-pos-field="stairCarry"
            className="grid grid-cols-1 gap-3 sm:col-span-3 sm:grid-cols-3"
          >
            {/* Carres does not stair-carry above floor 3 (MAX_DELIVERY_FLOOR).
                The POS has clamped this since the wizard was written; this door
                accepted any number, so an office-keyed order could promise a
                carry nobody performs. */}
            {/* The ceiling rides the LABEL (YH, 2026-08-26) — it was a hint
                under the box, which reads as advice rather than as the limit
                the input actually enforces. One statement, in the field's own
                name, and the separate hint line goes with it. */}
            <Input id="so-floor" label={`Floor (Max is ${MAX_DELIVERY_FLOOR}rd Floor)`}
              type="number" min={1} max={MAX_DELIVERY_FLOOR}
              value={String(draft.delivery_floor)}
              onChange={(e) =>
                setField(
                  "delivery_floor",
                  /* ⭐ THE SAME 1-TO-3 THE POS CLAMPS TO (YH, 2026-09-01 —
                     "office follow POS"). The floor was 0 here while the POS
                     stepper starts at 1; the form already shows a missing
                     floor as 1 (`?? 1`, four places), so the zero was a value
                     only this box could type and nothing could mean. */
                  Math.min(MAX_DELIVERY_FLOOR, Math.max(1, Number(e.target.value) || 1)),
                )
              } />
          {/* ⭐ THE CELL ALWAYS CARRIES A NUMBER (YH, 2026-08-27) — "no ask
              then put a default value, rather than leaving it blank". The
              STORED value stays null until somebody types; this shows the
              derived default and never writes one.

              ⚠️ THE TWO COMMENTS THAT STOOD HERE UNTIL 2026-09-01 DESCRIBED A
              FIELD THAT NO LONGER EXISTED. They said an untouched box reads
              `All 5 items` and that 0104's NULL means EVERY item, and warned
              at length against defaulting to zero. Both were true when typed
              on 2026-08-26/27 and were overturned HOURS later by YH's own
              ruling that an unset count means NONE — which `stairCarryCount`
              has implemented ever since, and which is why the box renders `0`.
              A governance record that no longer describes its field is not
              harmless: the next reader trusts it, and this one warned them off
              the behaviour the code already had. Kept as a correction rather
              than deleted, because the ruling it lost to is the point.

              ⭐ AND THE CEILING IS ENFORCED, NOT JUST STATED (YH, 2026-09-01).
              The hint has said `0 to 5` since it was written and the box
              accepted 99. The POS cannot produce that number — its stepper
              stops at the item count — so an office-keyed order could hold a
              count no shop floor could have quoted, while the working line
              directly below priced the CLAMPED five. One card, two answers to
              "how many items", and the saved one was the wrong one.
              `stairCarryCount` is the same clamp the fee already runs and the
              same one the server stamps with, imported rather than re-typed —
              a second copy of a ceiling is how the two surfaces drifted in the
              first place. `max` rides the input too, so the spinner and the
              keyboard agree.
              ⛔ NO CEILING WITHOUT A COUNT. Until the catalog answers, `stair`
              is null and the item total is unknown — so the upper clamp is
              simply not applied and the floor at zero still is. A guess at the
              ceiling would be worse than no ceiling: it would silently cut a
              number the operator typed correctly. Degrade, never abort. */}
          <Input id="so-stair-items" label="Items needing stair carry" type="number" min={0}
            max={stair?.itemsTotal}
            hint={stair ? `0 to ${stair.itemsTotal}` : undefined}
            value={String(draft.delivery_stair_items ?? 0)}
            onChange={(e) =>
              setField(
                "delivery_stair_items",
                e.target.value === ""
                  ? null
                  : stair
                    ? stairCarryCount(stair.itemsTotal, Number(e.target.value) || 0)
                    : Math.max(0, Number(e.target.value) || 0),
              )
            } />
          {/* ⭐ THE SAME QUESTION, ASKED THE SAME WAY ON BOTH SIDES (Jess,
              2026-08-26). The POS asks `Lift available?` and offers two named
              answers — `No lift` / `Has lift` (`pos/StairCarryFields.tsx`).
              Operations asked the same fact as a bare tickbox, so an unticked
              box meant BOTH "no lift" and "nobody said", and the two surfaces
              did not tally. Two named options, the POS's exact words, and a
              blank that still reads as a blank. */}
          <Select id="so-lift" label="Lift available?"
            value={draft.delivery_has_lift ? "Has lift" : "No lift"}
            onValueChange={(v) => setField("delivery_has_lift", v === "Has lift")}
            options={LIFT_OPTIONS.map((o) => ({ value: o, label: o }))} />
          </div>
        </div>
        {/* The three fields above, added up out loud — the POS's own sentence
            (`pos/StairCarryFields.tsx`), so the office reads the number the
            salesperson quoted instead of re-deriving it.
            ⭐ ONLY WHEN THERE IS A CHARGE (YH, 2026-08-26). It used to narrate
            the zero too — "No stair carry — floor 1 is within the free 2F" —
            which is a sentence saying nothing happened, printed on the majority
            of orders. The fields above already state the floor and the lift; a
            line that only repeats them back is the noise Jess asked to cut. */}
        {stairWorking && (
          <p className="mt-2 text-meta text-base-500" data-testid="so-stair-working">
            {stairWorking.quoted ? (
              <>
                {stairWorking.items} of {stairWorking.itemsTotal} item
                {stairWorking.itemsTotal === 1 ? "" : "s"} × {stairWorking.floors} floor
                {stairWorking.floors === 1 ? "" : "s"} above {stairWorking.freeUpToFloor}F ×{" "}
                <Money value={stairWorking.perFloorPerItem} /> ={" "}
              </>
            ) : (
              <>
                {stairWorking.items} of {stairWorking.itemsTotal} item
                {stairWorking.itemsTotal === 1 ? "" : "s"} carried to floor {stairWorking.floor} —
                charged{" "}
              </>
            )}
            <span className="font-semibold text-base-900">
              <Money value={stairWorking.fee} />
            </span>
          </p>
        )}
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <CustomFields fields={tab("target").custom} values={draft.custom} onChange={setCustom} />
        </div>
        {/* THE ONE DOOR for goods, price and the promised date — opened from
            `More actions` since 2026-08-26. The component still MOUNTS here
            because a LIVE proposal is truth and belongs on the card, and
            because the modal it owns has to exist to be opened at all. The
            rule + padding therefore appear only when there is a live panel to
            separate; with nothing pending this renders an empty, invisible
            div rather than a bordered strip with no content in it. */}
        {!isNew && mode === "object" && orderId && (
          <div className={liveAmendment ? "mt-3 border-t border-kit-slate-5 pt-3" : ""}>
            <SalesOrderAmendment
              orderId={orderId}
              currentLines={(detailQ.data?.lines ?? []).map((l) => ({
                id: l.id,
                sku: l.sku,
                qty: l.qty,
                unit_price: Number(l.unit_price),
              }))}
              currentDeliveryDate={order?.delivery_date ?? null}
              currentDeliveryDateTbd={order?.delivery_date_tbd ?? false}
              currentInstallmentMonths={(order as { installment_months?: number | null } | undefined)?.installment_months ?? null}
              proposalSeed={amendmentSeed}
              openSignal={amendSignal}
              inlineTrigger={false}
            />
          </div>
        )}
      </Block>

      {/* ⭐ SALES OWNERSHIP IS ITS OWN CARD AGAIN (YH, 2026-09-01).
          It was merged into `Order info` on 2026-08-26 when Jess asked for
          fewer, fuller cards, and it kept its locked word as a subsection
          heading. It comes back out as a card because it is a different KIND
          of fact from the rest of that card: `Order info` is what the customer
          asked for — dates, floors, a lift — and this is who inside Carres
          gets paid for it. One card, one topic, and the merge law is served by
          the card being SMALL rather than by it being hidden inside a bigger
          one.
          The WORD is unchanged and still locked (COPY-STANDARD:1427). It reads
          as a card title now, which is the same string in the same face —
          `Block` uppercases every title, so nothing about the word moved. */}
      <Block title="Sales ownership">
        {mode === "create" ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Select id="so-dealer" label="Dealer"
              value={draft.dealer_id ?? ""}
              onValueChange={(v) => setField("dealer_id", v || null)}
              options={dealerOptions} placeholder="Pick a dealer" />
            <div data-pos-field="outlet">
              <Select id="so-outlet" label="Showroom"
                value={draft.outlet_id ?? "none"}
                onValueChange={(v) => setField("outlet_id", v === "none" ? null : v)}
                options={outletOptions} />
            </div>
            <div data-pos-field="salesperson">
              <Select id="so-salesperson" label="Salesperson"
                value={draft.salesperson_id ?? "none"}
                onValueChange={(v) => setField("salesperson_id", v === "none" ? null : v)}
                options={spOptions} />
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Fact label="Dealer" value={sourceName(mode, viewedRevision, order, "dealer") || "Not recorded"} />
              <div data-pos-field="outlet">
                <Fact label="Showroom" value={sourceName(mode, viewedRevision, order, "outlet") || "Not recorded"} />
              </div>
              {/* ⭐ THE DOOR SITS BESIDE THE NAME IT MOVES (YH, 2026-09-01).
                  `Change salesperson` had a rule and a right-aligned row of its
                  own under this grid — a separator, 12px of padding and a full
                  row, introducing ONE button. It reads as a section, so the eye
                  stops at it, and it separated the verb from the fact the verb
                  acts on.
                  It is the same shape `Change delivery date` already uses under
                  `Requested Delivery Date`: a quiet text door under the answer
                  it changes, which is where somebody looking at the wrong
                  salesperson already has their eye. `useCanChangeSalesOwnership`
                  is GATE 3's rule, imported rather than re-typed. */}
              <div data-pos-field="salesperson">
                <Fact label="Salesperson" value={sourceName(mode, viewedRevision, order, "salesperson") || "Not recorded"} />
                {mode !== "oldrev" && orderId && order && canChangeSalesOwnership && (
                  <button
                    type="button"
                    onClick={() => setAttributionSignal((n) => n + 1)}
                    data-testid="attribution-open"
                    className="mt-1 text-meta font-medium text-kit-blue-11 underline-offset-2 hover:underline"
                  >
                    Change salesperson
                  </button>
                )}
              </div>
            </div>
            {/* An OLD revision is a photograph — it carries no lane. */}
            {mode !== "oldrev" && orderId && order && (
              <SalesOrderAttribution
                orderId={orderId}
                current={{
                  salesperson_id: order.salesperson_id ?? null,
                  outlet_id: order.outlet_id ?? null,
                  dealer_id: order.dealer_id ?? null,
                }}
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
            )}
          </>
        )}

      </Block>







      {/* ⑧ GOODS — the six-column truth §0.1 locks. It is not a form: Unit ID
          and Deliver To are Stock's and Purchasing's facts, and the document
          preview beside it never prints them. */}
      <Block title="Goods">
        {/* ⭐ `orderAddons` USED TO BE A HIDDEN SPAN. It carried the
            `data-pos-field` the POS-parity contract test string-matches, with
            no control behind it — so the page passed a completeness test it
            did not meet, and the office still had to ring the shop to add a
            disposal service. The attribute now rides the real door. */}
        {mode === "create" ? (
          <div className="flex flex-col gap-2">
            {/* Every SKU the catalog holds, offered as a typeahead. A `datalist`
                SUGGESTS without refusing: the office must still be able to
                write a line for an AutoCount import or a not-yet-catalogued
                product (975 live units are in that bucket), so an unlisted SKU
                stays typeable — it simply stops being the silent default. */}
            <datalist id="so-sku-catalog">
              {[...catalogBySku.entries()].map(([sku, info]) => (
                <option key={sku} value={sku}>{info.label}</option>
              ))}
            </datalist>
            {draft.lines.map((l) => {
              const known = catalogBySku.get(l.sku.trim());
              const priceHint = catalogPriceHint(known, l.unit_price);
              return (
              /* ⭐ THE ROW ALIGNS AT THE TOP (YH, 2026-08-29 — measured on
                 `/operation/orders/so/new`). It was `items-end`, so every cell
                 aligned on its BOTTOM. SKU and Unit price each carry a hint
                 line (`Cody · Super King`, `Catalog RM 1090.00`) and Qty does
                 not — so Qty was pushed a whole row down to bring its short box
                 level with their hints, and the three labels sat at three
                 heights. `FieldFrame` gives every field the same 18px above its
                 control (an 11px/14px label plus `gap-1`), so aligning at the
                 START lines up all three labels AND all three inputs, and lets
                 the hints hang below where they belong. */
              <div key={l.key} className="grid grid-cols-[1fr_84px_120px_32px] items-start gap-2">
                <Input id={`so-sku-${l.key}`} label="SKU" value={l.sku}
                  list="so-sku-catalog"
                  hint={known ? known.label : l.sku.trim() ? "Not in catalog" : undefined}
                  onChange={(e) => {
                    const sku = e.target.value;
                    const hit = catalogBySku.get(sku.trim());
                    setLine(l.key, skuEditPatch(sku, hit, l.unit_price));
                  }} />
                <Input id={`so-qty-${l.key}`} label="Qty" type="number" min={1}
                  value={String(l.qty)}
                  onChange={(e) => setLine(l.key, { qty: Math.max(1, Number(e.target.value) || 1) })} />
                <Input id={`so-price-${l.key}`} label="Unit price (RM)" type="number" min={0}
                  value={String(l.unit_price)}
                  hint={priceHint}
                  onChange={(e) => setLine(l.key, { unit_price: Math.max(0, Number(e.target.value) || 0) })} />
                {/* The button has no label of its own, so it would ride up to
                    the label row. It borrows `FieldFrame`’s own shape — a
                    `gap-1` column under a label-height spacer — rather than a
                    hard-coded 18px offset, so it still lands on the inputs if
                    the label token ever changes. */}
                <div className="flex flex-col gap-1">
                  <span className="text-label" aria-hidden="true">&nbsp;</span>
                  <button
                    type="button"
                    aria-label="Remove"
                    className="grid h-8 w-8 place-items-center rounded-control text-base-500 hover:bg-hovertint hover:text-base-900"
                    onClick={() => setDraft((d) => ({ ...d, lines: d.lines.filter((x) => x.key !== l.key) }))}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              );
            })}
            <div>
              <Button size="sm" variant="neutral"
                onClick={() => setDraft((d) => ({ ...d, lines: [...d.lines, { key: nextKey(), sku: "", qty: 1, unit_price: 0 }] }))}>
                <Plus size={14} /> Add line
              </Button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-body" data-testid="document-goods">
              <thead>
                <tr className="text-label text-base-500">
                  <th className="py-1 pr-3 text-left font-medium">Category</th>
                  <th className="py-1 pr-3 text-left font-medium">Unit ID</th>
                  <th className="py-1 pr-3 text-left font-medium">SKU</th>
                  <th className="py-1 pr-3 text-right font-medium">Qty</th>
                  <th className="py-1 pr-3 text-left font-medium">Item</th>
                  <th className="py-1 text-left font-medium">Deliver To</th>
                </tr>
              </thead>
              <tbody>
                {itemRows(mode, viewedRevision, detailQ.data?.lines ?? []).map((r, i) => {
                  const liveLine = detailQ.data?.lines?.[i];
                  const truth = (goodsTruthQ.data?.lines ?? []).find((line) => line.lineId === liveLine?.id);
                  const destinations = truth?.deliverTo ?? [];
                  return (
                  <tr key={i} className="border-t border-kit-slate-5">
                    <td className="py-1.5 pr-3 text-label font-semibold text-base-600">{liveLine ? categoryWord(liveLine) : "Not recorded"}</td>
                    {/* ⭐ THE SHORT-LINE WORDS ARE RULED, AND `Not allocated`
                        IS NOT ONE OF THEM (YH, 2026-09-01).
                        `COPY-STANDARD.md`:1755 lists `Not allocated` in its
                        `Do NOT use` column beside `No stock` and `Units not
                        created yet`; the registered answer is the COUNT and
                        then what is being waited on. `unitsShortWords` is that
                        sentence, written once in shared, so this cell, the
                        Order Route's STOCK node and the register expansion
                        cannot drift into three spellings of one fact.
                        A LOAD IS NOT A SHORTAGE. The Deliver To cell beside
                        this one has always said `Loading…` while the expansion
                        is in flight; this one did not, so a slow read printed
                        `Not allocated` on a fully allocated line. Same guard,
                        same word, same column behaviour. */}
                    <td className="py-1.5 pr-3 font-mono text-meta">
                      {goodsTruthQ.isLoading && !truth ? (
                        "Loading…"
                      ) : truth && truth.unitIds.length >= r.qty && truth.unitIds.length > 0 ? (
                        truth.unitIds.join(" · ")
                      ) : (
                        (() => {
                          const [count, waiting] = unitsShortWords(truth?.unitIds.length ?? 0, r.qty);
                          return (
                            <>
                              <div>{count}</div>
                              <div className="mt-0.5 text-base-600">{waiting}</div>
                            </>
                          );
                        })()
                      )}
                    </td>
                    <td className="py-1.5 pr-3 font-mono text-meta">{liveLine?.sku ?? "Not recorded"}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{r.qty}</td>
                    <td className={`py-1.5 pr-3 ${cjkClassName(r.name)}`}>
                      <div>{r.name}</div>
                      {liveLine && operationalConfig(liveLine).length > 0 && (
                        <div className="mt-0.5 text-meta text-base-600">{operationalConfig(liveLine).join(" · ")}</div>
                      )}
                    </td>
                    <td className="py-1.5">{destinations.length ? destinations.map((d) => destinations.length > 1 ? `${d.name} ×${d.qty}` : d.name).join(" · ") : goodsTruthQ.isLoading ? "Loading…" : "Not recorded"}</td>
                  </tr>
                  );
                })}
                {/* ⭐ A SERVICE ROW IS A GOODS ROW (YH, 2026-09-01). The two
                    halves of this one table were written apart and read apart:
                    a service printed `dispose-mattress` in the ITEM column —
                    the raw database key, in the body face, where the goods rows
                    print a product NAME — while `SalesOrderAddons` eighty
                    pixels below printed `Mattress disposal` for the same row off
                    the same catalog. One record, two names, and the key was the
                    one the operator had to read.
                    The cells now carry the goods rows' own classes (mono for
                    the two identifier columns, `cjkClassName` on the item so a
                    Chinese service name gets the same face a Chinese product
                    gets) and the second line under the item is where a goods row
                    already puts its configuration, so the SIZE of a sized
                    service lands there instead of being dropped.
                    The two cells a service can never fill read `Not recorded`,
                    which is the ONE registered absence word
                    (`COPY-STANDARD.md`:1679, YH 2026-08-29). They printed a bare
                    `—`, which that same row lists in its `Do NOT use` column —
                    so the service half of this table was BOTH the odd one out
                    and off-dictionary. `Not recorded` is also what the goods
                    rows already print in `Deliver To`, so the column now reads
                    one way down its whole length. */}
                {(detailQ.data?.addons ?? []).map((a, i) => {
                  const serviceName = addonNameByKey.get(a.addon_key) ?? a.addon_key;
                  const size = a.attrs?.size ?? null;
                  return (
                  <tr key={`a-${i}`} className="border-t border-kit-slate-5">
                    <td className="py-1.5 pr-3 text-label font-semibold text-base-600">SERVICE</td>
                    <td className="py-1.5 pr-3 font-mono text-meta">Not recorded</td>
                    <td className="py-1.5 pr-3 font-mono text-meta">{a.addon_key}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{a.qty}</td>
                    {/* ⭐ THE ROW CARRIES ITS OWN DOORS (YH, 2026-09-01). A
                        service was printed twice — here, and again in a
                        `Services` list below that repeated its name, size,
                        quantity and price purely so it could hold two buttons.
                        One record, two places, and with a second service on the
                        order the operator had to match them by eye to know
                        which row a `Remove` belonged to.
                        ⛔ NOT A SEVENTH COLUMN: `docs/orders/MASTER.md` §0.1
                        locks this table at six, and the document preview prints
                        from the same six. The doors ride the ITEM cell as a
                        quiet line under the name — which is where a goods row
                        already puts its own configuration, so both row kinds
                        keep one shape. */}
                    <td className={`py-1.5 pr-3 ${cjkClassName(serviceName)}`}>
                      <div>{serviceName}</div>
                      {size && <div className="mt-0.5 text-meta text-base-600">{size}</div>}
                      {mode === "object" && orderId && (
                        <ServiceRowActions
                          orderId={orderId}
                          row={a}
                          catalogAddons={catalogQ.data?.addons ?? []}
                          status={order?.status ?? null}
                        />
                      )}
                    </td>
                    <td className="py-1.5">Not recorded</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {/* An OLD revision is a photograph and a draft has no order to write
            to — the door belongs to the live object only.
            ⭐ THE ATTRIBUTE STILL RIDES A REAL CONTROL. It was once a hidden
            `<span>` carrying this exact string with nothing behind it, so the
            page passed a POS-parity completeness test it did not meet while the
            office rang the shop to add a disposal service. What is left in
            `SalesOrderAddons` is the one act the table cannot perform — adding
            a service that is not there yet — and the attribute rides that. */}
        {mode === "object" && orderId && (
          <div data-pos-field="orderAddons">
            <SalesOrderAddons
              orderId={orderId}
              catalogAddons={catalogQ.data?.addons ?? []}
              status={order?.status ?? null}
            />
          </div>
        )}
      </Block>



      {/* ⑨ WHAT THIS CHANGE STARTED ELSEWHERE — 3.4. Shown only when there IS
          work: a section that says "nothing" on every order is a section the
          operator learns to skip. */}
      {!isNew && mode !== "oldrev" && (correctionWorkQ.data?.work ?? []).length > 0 && (
        <Block title="What this change started elsewhere">
          <CorrectionWorkList
            work={correctionWorkQ.data?.work ?? []}
            canClose={false}
            emptyWord=""
          />
        </Block>
      )}
    </div>
    </fieldset>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SalesOrderTabs
        identity={soWord}
        /* Capitalize up — owner ruling 2026-08-15. Display only; the
           `Full name` INPUT below stays on the raw draft value, because a
           cased edit field would write the casing back to the record. */
        customer={displayCustomerName(order?.customer_name)}
        onBack={(event) => {
          if (!confirmDiscard()) event.preventDefault();
        }}
        docTitle={isNew ? "New Sales Order — Carres" : order ? `SO-${order.so} — Carres` : undefined}
        right={headerRight}
        navigation={!isNew ? (
          <nav aria-label="Sales Order views" className="flex h-full items-stretch gap-1">
            {OBJECT_VIEWS.map((view) => {
              const active = objectView === view;
              return (
                <button
                  key={view}
                  type="button"
                  onClick={() => openObjectView(view)}
                  aria-current={active ? "page" : undefined}
                  className={`relative px-3 text-body ${active ? "font-semibold text-base-900 after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-kit-blue-9" : "text-base-600 hover:text-base-900"}`}
                >
                  {view}
                </button>
              );
            })}
          </nav>
        ) : null}
      />

      {/* The amend trio, opened from beside `Requested Delivery Date`. The governed
          note is the modal's DESCRIPTION — the first thing read on opening,
          rather than a footnote beside the button that commits it. */}
      {!isNew && mode === "object" && orderId && (
        <Modal
          open={amendDateOpen}
          onOpenChange={setAmendDateOpen}
          title="Change delivery date"
          description="creates a Revision · needs approval"
        >
          <SalesOrderAmendDeliveryDate
            orderId={orderId}
            currentDeliveryDate={order?.delivery_date ?? null}
            liveAmendment={liveAmendment}
            onDone={() => setAmendDateOpen(false)}
          />
        </Modal>
      )}

      {order && (
        <CancelSalesOrderDialog
          orderId={order.id}
          so={order.so}
          open={cancelOpen}
          onOpenChange={setCancelOpen}
          onCancelled={() => void detailQ.refetch()}
        />
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

      {showRoute ? (
        <div className="min-h-0 flex-1 overflow-auto bg-kit-slate-3 px-4 py-4">
          {routeFactsQ.isLoading || detailQ.isLoading || revisionsQ.isLoading ? (
            <Loading label="Opening the order route" />
          ) : routeFactsQ.isError || detailQ.isError || revisionsQ.isError ? (
            <div className="rounded-card border border-kit-slate-5 bg-white">
              <EmptyState
                title="This order route could not be opened"
                detail={(routeFactsQ.error as Error | undefined)?.message ?? (detailQ.error as Error | undefined)?.message ?? (revisionsQ.error as Error | undefined)?.message}
                action={<Button variant="neutral" onClick={() => void routeFactsQ.refetch()}>Try again</Button>}
              />
            </div>
          ) : orderRoute ? (
            <SalesOrderRoute route={orderRoute} owners={routeOwners} />
          ) : (
            <div className="rounded-card border border-kit-slate-5 bg-white">
              <EmptyState title="No route facts were found for this sales order" />
            </div>
          )}
        </div>
      ) : (objectView === "Revisions" && mode !== "oldrev") || objectView === "History" ? (
        <div className="min-h-0 flex-1 overflow-auto bg-kit-slate-3 px-4 py-4">
          <div className="mx-auto max-w-5xl rounded-card border border-kit-slate-5 bg-white p-5">
            <h2 className="mb-4 text-title font-semibold text-base-900">{objectView}</h2>
            {/* ⭐ R-7 — A FAILED READ IS NOT AN EMPTY LEDGER. Without these two
                guards a 403 or a 500 falls straight through to the ledger's
                governed EMPTY sentences (`No revisions recorded` / `No history
                recorded`), which tell the reader the order HAS no revisions —
                a statement the screen cannot know. The Order Route branch above
                has carried both guards all along; this one never did, so a
                permission refusal rendered here as a fact about the order. */}
            {detailQ.isLoading || revisionsQ.isLoading ? (
              <Loading label={objectView === "History" ? "Opening the history" : "Opening the revisions"} />
            ) : detailQ.isError || revisionsQ.isError ? (
              <EmptyState
                title={objectView === "History" ? "This history could not be opened" : "These revisions could not be opened"}
                detail={(detailQ.error as Error | undefined)?.message ?? (revisionsQ.error as Error | undefined)?.message}
                action={
                  <Button variant="neutral" onClick={() => { void detailQ.refetch(); void revisionsQ.refetch(); }}>
                    Try again
                  </Button>
                }
              />
            ) : (
            <SalesOrderLedger
              revisions={revisions}
              history={detailQ.data?.history ?? []}
              currentRevision={currentRev}
              viewedRevision={mode === "oldrev" ? viewRev : null}
              view={objectView.toLowerCase() as "revisions" | "history"}
              showViewTabs={false}
              onViewRevision={setViewRev}
              onProposeRevision={(revision) => {
                const header = revision.snapshot.header ?? {};
                const currentLineIds = new Map((detailQ.data?.lines ?? []).map((line) => [line.sku, line.id]));
                setAmendmentSeed({
                  lines: (revision.snapshot.lines ?? []).map((line) => ({
                    ...(currentLineIds.get(line.sku) ? { id: currentLineIds.get(line.sku) } : {}),
                    sku: line.sku,
                    qty: Number(line.qty),
                    unit_price: Number(line.unit_price),
                  })),
                  delivery_date: header.delivery_date == null ? null : String(header.delivery_date),
                  delivery_date_tbd: Boolean(header.delivery_date_tbd),
                  installment_months: header.installment_months == null ? null : Number(header.installment_months),
                });
                setObjectView("Order");
              }}
            />
            )}
          </div>
        </div>
      ) : (
        /* ⭐ TWO PANES, 50 / 50 — owner ruling 2026-08-15. Each pane scrolls on
           its own and the PAGE does not; below 1024px they stack, form first,
           and the page scrolls normally. */
        <div className="min-h-0 flex-1 overflow-auto bg-kit-slate-3 lg:overflow-hidden">
          {!isNew && detailQ.isLoading && (
            <div className="px-4 py-4">
              <Loading label="Opening the sales order" />
            </div>
          )}
          {!isNew && !detailQ.isLoading && detailQ.isError && (
            <div className="px-4 py-4">
              <div className="rounded-card border border-kit-slate-5 bg-white">
                <EmptyState
                  title="This sales order could not be opened"
                  detail={(detailQ.error as Error | undefined)?.message}
                  action={
                    <Button variant="neutral" onClick={() => void detailQ.refetch()}>
                      Try again
                    </Button>
                  }
                />
              </div>
            </div>
          )}

          {(isNew || order) && (
            <div className="flex h-full min-h-0 flex-col lg:flex-row" data-testid="object-two-panes">
              <div className="flex min-h-0 min-w-0 flex-col lg:w-1/2 lg:overflow-hidden">
                <div className="min-h-0 flex-1 px-4 py-4 lg:overflow-auto">{form}</div>
                {/* THE SAVE BAR EXISTS ONLY WHEN SOMETHING CHANGED (§6.4 ⑥). */}
                {mode === "object" && dirty && (
                  <div
                    className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-base-900 bg-base-900 px-4 py-2.5"
                    data-testid="save-bar"
                  >
                    <span className="text-body font-medium text-white">
                      ⚠ {changedFields.length} {changedFields.length === 1 ? "change" : "changes"}
                    </span>
                    <span className="flex items-center gap-2">
                      <Button size="sm" variant="ghost" onClick={discard} data-testid="workspace-cancel">
                        <X size={14} /> Discard
                      </Button>
                      <Button
                        size="sm"
                        variant="primary"
                        loading={saveMut.isPending}
                        onClick={onSave}
                        data-testid="workspace-save"
                      >
                        Save
                      </Button>
                    </span>
                  </div>
                )}
              </div>

              <aside
                className="min-h-0 min-w-0 border-t border-kit-slate-5 bg-kit-slate-3 px-4 py-4 lg:w-1/2 lg:border-l lg:border-t-0 lg:overflow-auto"
                aria-label="Sales Order document"
              >
                {/* A PENDING AMENDMENT IS A BANNER, NEVER THE DOCUMENT BODY. */}
                {pendingDeliveryDate && (
                  <div
                    className="mx-auto mb-3 max-w-[700px] rounded-control border border-kit-slate-5 bg-kit-amber-3 px-3 py-2 text-body font-medium text-kit-amber-11"
                    data-testid="pending-amendment-banner"
                  >
                    ⚠ Amendment pending approval: delivery date → {fmtDate(pendingDeliveryDate)}
                  </div>
                )}
                <div className="relative mx-auto max-w-[700px]">
                  <div ref={setPane} data-testid="pdf-pane" />
                  {/* The watermark is PREVIEW chrome, painted over the paper and
                      never into it — Print must produce the document, not a
                      picture of this screen. */}
                  {dirty && (
                    <div
                      aria-hidden="true"
                      data-testid="unsaved-watermark"
                      className="pointer-events-none absolute inset-0 grid select-none place-items-center overflow-hidden"
                    >
                      <span className="rotate-[-24deg] scale-[2.4] text-page tracking-[0.3em] text-base-900/10">
                        UNSAVED
                      </span>
                    </div>
                  )}
                </div>
              </aside>
            </div>
          )}
        </div>
      )}
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

function displayHeader(
  mode: Mode,
  rev: SalesOrderRevisionRow | null,
  order: Orderish,
  key: string,
): string | null {
  if (mode === "oldrev" && rev) {
    const v = rev.snapshot.header?.[key];
    return v == null ? null : String(v);
  }
  const v = bag(order)[key];
  return v == null ? null : String(v);
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

function promisedWord(mode: Mode, rev: SalesOrderRevisionRow | null, order: Orderish): string {
  const tbd =
    mode === "oldrev" && rev
      ? Boolean(rev.snapshot.header?.["delivery_date_tbd"])
      : Boolean(bag(order)["delivery_date_tbd"]);
  if (tbd) return "No delivery date";
  const d = displayHeader(mode, rev, order, "delivery_date");
  return d ? fmtDate(d) : "No delivery date";
}

function itemRows(
  mode: Mode,
  rev: SalesOrderRevisionRow | null,
  detailLines: Array<{ sku: string; qty: number; unit_price: number; label?: string | null }>,
): Array<{ name: string; qty: number; total: number }> {
  if (mode === "oldrev" && rev) {
    return (rev.snapshot.lines ?? []).map((l) => ({
      name: l.description?.trim() || l.sku,
      qty: Number(l.qty),
      total: Number(l.qty) * Number(l.unit_price),
    }));
  }
  return detailLines.map((l) => ({
    name: lineName(l),
    qty: l.qty,
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
 * The price hint under a create-mode line — SHOWN, never enforced.
 *
 * `product_skus.price` is the CATALOG's number and only the principal may set
 * it (0175). `order_lines.unit_price` is the ORDER's number, and an order may
 * legitimately sell at a different figure — a discount, a bundle, a goodwill
 * price. So a difference is worth SAYING and never worth refusing: this
 * returns hint text, never an error, because a red field reads as a refusal
 * and red has one job (late / act now).
 *
 * `undefined` = the catalog has no row for this SKU, so there is nothing to
 * compare against and the field stays quiet.
 */
export function catalogPriceHint(
  known: CatalogSkuFact | undefined,
  unitPrice: number,
): string | undefined {
  if (!known) return undefined;
  const shown = `Catalog RM ${known.price.toFixed(2)}`;
  return known.price === unitPrice ? shown : `${shown} — this line differs`;
}

/**
 * What changes on the line when the operator edits the SKU field.
 *
 * Fills a BLANK price from the catalog; never overwrites one already typed.
 * `0` is this field's empty state — a fresh line starts there — not a decision
 * to sell for nothing, so filling it is completion rather than correction. Once
 * a real number is in, the catalog stops touching it.
 */
export function skuEditPatch(
  sku: string,
  known: CatalogSkuFact | undefined,
  currentUnitPrice: number,
): { sku: string; unit_price?: number } {
  return known && currentUnitPrice === 0 ? { sku, unit_price: known.price } : { sku };
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

function operationalConfig(line: { attrs?: Record<string, unknown> | null }): string[] {
  const attrs = line.attrs ?? {};
  const facts = lineConfigBits(attrs);
  const governed: Record<string, string> = {
    size: "Size",
    firmness: "Firmness",
    colour: "Colour",
    fabric_code: "Fabric code",
    seat_height: "Seat height",
    sofa_height: "Sofa height",
    configuration: "Configuration",
    sofa_configuration: "Sofa configuration",
  };
  for (const [key, label] of Object.entries(governed)) {
    const value = attrs[key];
    if (value == null || value === "" || typeof value === "object") continue;
    facts.push(`${label}: ${String(value)}`);
  }
  return facts;
}
