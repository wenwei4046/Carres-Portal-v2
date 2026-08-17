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
 * `Customer Delivery` are the exception, and they are the whole point: those
 * are what the customer agreed to, so they leave through the amendment lane.
 */
// design-standard: not-a-list-page — this is a DOCUMENT workspace. Its
// tables are the order's own line block: fixed rows, no sort, no selection.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Printer, Trash2, X } from "lucide-react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import * as pdfjs from "pdfjs-dist";
import { toast } from "sonner";
import {
  BUILDING_TYPE_OPTIONS,
  composeEmergencyContact,
  CUSTOMER_GENDER_OPTIONS,
  CUSTOMER_RACE_OPTIONS,
  deliveryReasonLabel,
  EMERGENCY_RELATIONSHIPS,
  lineClass,
  orderMoney,
  parseEmergencyContact,
  receivingRecordNo,
  resolveFormTab,
  resolveSalesOrderRoute,
  supplierClaimStatusLabel,
  myHolidaySet,
  type CustomField,
  type OrderEntryTab,
  type SalesOrderRouteMap as SalesOrderRouteModel,
} from "@carres/shared";
import Button from "@/components/kit/Button";
import Checkbox from "@/components/kit/Checkbox";
import DatePicker from "@/components/kit/DatePicker";
import EmptyState from "@/components/kit/EmptyState";
import Input from "@/components/kit/Input";
import Loading from "@/components/kit/Loading";
import Select from "@/components/kit/Select";
import Money from "@/components/Money";
import { apiFetch, ApiError } from "@/lib/api";
import { cjkClassName } from "@/lib/cjk";
import { composeAddress } from "@/data/malaysia-postcodes";
import { fmtDate } from "@/lib/fmt-date";
import { displayCustomerName } from "@/lib/customer-name";
import { renderSalesOrderPdf } from "@/lib/pdf/render";
import type { SalesOrderTemplateData } from "@/lib/pdf/types";
import {
  useCreateSalesOrder,
  useCustomerTypeProbe,
  useOperationDealersRef,
  useOperationOrder,
  useOperationPoDuty,
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
import CancelSalesOrderDialog from "./CancelSalesOrderDialog";
import ServiceCaseWizard from "./components/ServiceCaseWizard";
import CorrectionWorkList from "./CorrectionWorkList";
import SalesOrderAmendDeliveryDate from "./SalesOrderAmendDeliveryDate";
import SalesOrderAmendment from "./SalesOrderAmendment";
import SalesOrderAttribution from "./SalesOrderAttribution";
import SalesOrderLedger from "./SalesOrderLedger";
import SalesOrderRoute from "./SalesOrderRoute";
import SalesOrderTabs from "./SalesOrderTabs";
import { lineName } from "./sales-order-facts";
import { lineConfigBits } from "../dealer/new-order/special-addons-picker";
import { missingDeliveryDateGuidance } from "./sales-order-guidance";
import { copySalesOrderDraft } from "./sales-order-copy";

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
  const addons = base?.addons ?? [];
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
  const addons = (snap.addons ?? []).map((a) => ({
    label: String(a.addon_key),
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
function Block({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-kit-slate-5 bg-white px-4 py-3" data-block={title}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-l-2 border-base-300 pl-2">
        <h2 className="text-label font-semibold tracking-wide text-base-700 uppercase">{title}</h2>
        {note && <span className="text-label font-normal text-base-600">{note}</span>}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-label text-base-500">{label}</div>
      <div className="text-body text-base-900 mt-0.5 break-words">{value}</div>
    </div>
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
  const copyFrom = isNew ? params.get("copyFrom") : null;
  const [viewRev, setViewRev] = useState<number | null>(null);
  const [amendmentSeed, setAmendmentSeed] = useState<AmendmentProposal | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [problemOpen, setProblemOpen] = useState(false);
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

  const detailQ = useOperationOrder(isNew ? copyFrom : (orderId ?? null));
  const revisionsQ = useSalesOrderRevisions(isNew ? null : (orderId ?? null));
  const goodsTruthQ = useSalesOrderExpansion(isNew ? "" : (orderId ?? ""));
  const amendmentQ = useSalesOrderAmendment(isNew ? null : (orderId ?? null));
  /* 3.4 · what this sales order's changes have raised for other modules. The
   * workspace SHOWS it and cannot close it — the module that raised the work
   * does not tick it off. */
  const correctionWorkQ = useOrderCorrectionWork(isNew ? null : (orderId ?? null));
  const routeFactsQ = useSalesOrderRouteFacts(
    isNew ? null : (orderId ?? null),
    showRoute,
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
      if (copyFrom) {
        const seed = `copy:${copyFrom}`;
        if (!order || draftSeed === seed) return;
        const copied = copySalesOrderDraft({
          order: {
            id: order.id,
            so: order.so,
            customer_name: order.customer_name,
            customer_phone: order.customer_phone,
            customer_email: (order as { customer_email?: string | null }).customer_email,
            customer_address: order.customer_address,
            customer_address_line1:
              (order as { customer_address_line1?: string | null }).customer_address_line1,
            customer_address_line2:
              (order as { customer_address_line2?: string | null }).customer_address_line2,
            customer_address_city:
              (order as { customer_address_city?: string | null }).customer_address_city,
            customer_address_state:
              (order as { customer_address_state?: string | null }).customer_address_state,
            customer_address_postcode:
              (order as { customer_address_postcode?: string | null }).customer_address_postcode,
            customer_emergency: order.customer_emergency,
            customer_billing: order.customer_billing,
            dealer_id: order.dealer_id,
            outlet_id: order.outlet_id,
            salesperson_id: order.salesperson_id,
            delivery_floor: (order as { delivery_floor?: number }).delivery_floor,
            delivery_has_lift: (order as { delivery_has_lift?: boolean }).delivery_has_lift,
          },
          lines: detailLines.map((line) => ({
            id: line.id,
            sku: line.sku,
            qty: line.qty,
            unit_price: line.unit_price,
          })),
        });
        const emergency = parseEmergencyContact(copied.customer_emergency);
        const next: Draft = {
          ...EMPTY_DRAFT,
          ...copied,
          emergency_name: emergency.name,
          emergency_phone: emergency.phone,
          emergency_relationship: emergency.relationship,
          lines: copied.lines.map((line) => ({ ...line, key: nextKey() })),
        };
        setDraft(next);
        setBaseline(next);
        setDraftSeed(seed);
        return;
      }
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
    copyFrom,
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

  /* ── ONE template-data value per mode; the draft path debounces 300ms. ── */
  const base = baseQ.data ?? null;
  const liveDraftData = useMemo(
    () => (mode === "oldrev" ? null : draftTemplateData(draft, baseline, base, refs)),
    [mode, draft, baseline, base, refs],
  );
  const debouncedDraftData = useDebounced(liveDraftData, 300);
  const templateData: SalesOrderTemplateData | null = useMemo(() => {
    if (mode === "oldrev" && viewedRevision) return snapshotTemplateData(viewedRevision.snapshot, base);
    return debouncedDraftData;
  }, [mode, viewedRevision, base, debouncedDraftData]);

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
    customer_name: draft.customer_name.trim(),
    customer_phone: draft.customer_phone.trim() || null,
    customer_email: draft.customer_email.trim() || null,
    customer_race: draft.customer_race.trim() || null,
    customer_gender: draft.customer_gender.trim() || null,
    customer_birthday: draft.customer_birthday || null,
    customer_address: addressString(draft, baseline).trim() || null,
    customer_address_line1: draft.customer_address_line1.trim() || null,
    customer_address_line2: draft.customer_address_line2.trim() || null,
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

  const draftLinesPayload = () =>
    draft.lines
      .filter((l) => l.sku.trim().length > 0)
      .map((l) => ({
        ...(l.id ? { id: l.id } : {}),
        sku: l.sku.trim(),
        qty: l.qty,
        unit_price: l.unit_price,
      }));

  const validateDraft = (needDealer: boolean): string | null => {
    if (!draft.customer_name.trim()) return "Customer name is required";
    if (needDealer && !draft.dealer_id) return "A dealer is required";
    /* orders_salesperson_required (0296): every portal-born order names who
     * sold it. */
    if (needDealer && !draft.salesperson_id) return "A salesperson is required";
    if (needDealer && draftLinesPayload().length === 0) return "An order needs at least one item";
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
      const addonSum = (base?.addons ?? []).reduce((s, a) => s + a.line_total, 0);
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
  }, [mode, draft.lines, base, viewedRevision, detailQ.data, order]);

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
      /* Straight from the ONE arithmetic (§8). `holds` is what decides the
         release; `outstanding` is what the customer owes. Two facts. */
      money: {
        known: money.known,
        outstanding: money.outstanding,
        holds: money.holds,
      },
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
  const dutyQ = useOperationPoDuty();
  const routeOwners = useMemo(
    () => ({
      purchasing: dutyQ.data?.holder ?? null,
      receiving: dutyQ.data?.grnHolder ?? null,
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
            <button
              type="button"
              onClick={() => navigate(`/operation/orders/so/new?copyFrom=${orderId}`)}
              data-testid="workspace-copy-so"
              className="w-full rounded-control px-2 py-1.5 text-left text-meta text-base-700 hover:bg-hovertint"
            >
              Copy to new Sales Order
            </button>
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
  /* Same ruling as the Register: a customer who answered *not yet* is not work
     to do, so the panel does not raise the confirm action for them either
     (docs/orders/MASTER.md · THE THREE DELIVERY DATES, 2026-08-15). */
  const missingDateAction = order && !order.delivery_date && !order.delivery_date_tbd
    ? missingDeliveryDateGuidance({
        so: order.so,
        customer: displayCustomerName(order.customer_name),
        salesperson: order.salespersons?.name,
        phone: order.customer_phone,
      })
    : null;

  const customerBuiltins = tab("customer").builtins;
  const emergencyEnabled = tab("emergency").builtins["emergency"]?.enabled !== false;

  /* ── THE LEFT PANE ─────────────────────────────────────────────────────── */
  const form = (
    /* A `fieldset` because the browser's own disabled-descendants rule is the
       only lock that cannot be forgotten one control at a time. `contents`
       keeps it out of the layout. */
    <fieldset
      disabled={mode === "oldrev"}
      className="contents"
      data-testid="sales-order-workspace"
      id="sales-order-workspace"
    >
    <div className="flex flex-col gap-3">
      {mode === "oldrev" && viewedRevision && (
        <div className="px-1">
          <span className="rounded-full bg-base-900 px-2 py-0.5 text-label font-semibold text-white">
            Viewing Rev {viewedRevision.revision} · read-only
          </span>
        </div>
      )}
      {mode === "create" && copyFrom && order && (
        <div className="px-1">
          <span className="rounded-full bg-kit-blue-3 px-2 py-0.5 text-label font-semibold text-kit-blue-11">
            Copied from SO-{order.so} · review before creating
          </span>
        </div>
      )}
      {!isNew && (order?.source_ref ?? []).length > 0 && (
        <div className="px-1 text-meta text-base-500">
          Customer reference {(order?.source_ref ?? []).join(" · ")}
        </div>
      )}

      {missingDateAction && mode === "object" && (
        <details open className="rounded-card border border-kit-slate-5 bg-kit-amber-3 p-3">
          <summary className="cursor-pointer list-none">
            <span className="block text-body font-semibold text-kit-amber-11">{missingDateAction.problem}</span>
            {/* 13 / 11 — the governed two-line grammar (ui/MASTER.md §5). */}
            <span className="block text-label font-normal text-base-600">{missingDateAction.action}</span>
          </summary>
          <dl className="mt-3 grid gap-2 border-t border-kit-slate-5 pt-3 sm:grid-cols-2">
            {[
              ["Why", missingDateAction.why],
              ["Who must act", missingDateAction.owner],
              ["Who to contact", missingDateAction.contact],
              ["What to ask", missingDateAction.ask],
              ["What to use", missingDateAction.use],
              ["What to record", missingDateAction.record],
              ["What happens next", missingDateAction.next],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-label font-semibold text-base-600">{label}</dt>
                <dd className="mt-0.5 text-body text-base-900">{value}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}

      {/* ① CUSTOMER */}
      <Block title="Customer">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          {customerBuiltins["customerType"]?.enabled !== false && (
            <div data-pos-field="customerType">
              <Fact label="Customer type (auto)" value={customerTypeWord} />
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
      </Block>

      {/* ② ORDER INFO */}
      <Block title="Order info">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Fact label="Ordered" value={isNew ? "Today" : fmtDate(order?.placed_at ?? null)} />
          {mode === "create" ? (
            <div data-pos-field="deliveryDate">
              <DatePicker id="so-promised" label="Customer Delivery" value={draft.delivery_date}
                onChange={(iso) => setField("delivery_date", iso)} />
            </div>
          ) : (
            <div data-pos-field="deliveryDate">
              <Fact label="Customer Delivery" value={
                promisedWord(mode, viewedRevision, order) === "No delivery date" ? (
                  <span data-attention="warning" className="inline-flex rounded-control bg-kit-amber-3 px-1.5 py-0.5 font-medium text-kit-amber-11">No delivery date</span>
                ) : promisedWord(mode, viewedRevision, order)
              } />
            </div>
          )}
          <div data-pos-field="proceedDate">
            <DatePicker id="so-proceed" label="Proceed date" value={draft.proceed_date}
              onChange={(iso) => setField("proceed_date", iso)} />
          </div>
          <div data-pos-field="stairCarry">
            <Input id="so-floor" label="Floor" type="number" min={0}
              value={String(draft.delivery_floor)}
              onChange={(e) => setField("delivery_floor", Math.max(0, Number(e.target.value) || 0))} />
          </div>
          <Input id="so-stair-items" label="Items needing stair carry" type="number" min={0}
            hint="Empty = every item"
            value={draft.delivery_stair_items == null ? "" : String(draft.delivery_stair_items)}
            onChange={(e) =>
              setField(
                "delivery_stair_items",
                e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0),
              )
            } />
          <div className="self-end pb-2">
            <Checkbox id="so-lift" label="Lift available"
              checked={draft.delivery_has_lift}
              onCheckedChange={(v) => setField("delivery_has_lift", v)} />
          </div>
          <CustomFields fields={tab("target").custom} values={draft.custom} onChange={setCustom} />
        </div>
        {/* THE ONE DOOR for goods, price and the promised date. */}
        {!isNew && mode === "object" && orderId && (
          <div className="mt-3 border-t border-kit-slate-5 pt-3">
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
            />
          </div>
        )}
      </Block>

      {/* ③ AMEND DELIVERY DATE */}
      {!isNew && mode === "object" && orderId && (
        <Block title="Amend delivery date" note="creates a Revision · needs approval">
          <SalesOrderAmendDeliveryDate
            orderId={orderId}
            currentDeliveryDate={order?.delivery_date ?? null}
            liveAmendment={liveAmendment}
          />
        </Block>
      )}

      {/* ④ EMERGENCY CONTACT */}
      {emergencyEnabled && (
        <Block
          title="Emergency contact"
          note="Used only if we cannot reach the customer on delivery day"
        >
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
        </Block>
      )}

      {/* ⑤ DELIVERY ADDRESS */}
      <Block title="Delivery address">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-pos-field="address">
          <div className="sm:col-span-2">
            <Checkbox id="so-address-unknown" label="Address not given yet"
              checked={draft.customer_address_unknown}
              onCheckedChange={(v) => setField("customer_address_unknown", v)} />
          </div>
          <Input id="so-line1" label="Address line 1" value={draft.customer_address_line1}
            disabled={draft.customer_address_unknown}
            onChange={(e) => setField("customer_address_line1", e.target.value)} />
          <Input id="so-line2" label="Address line 2" value={draft.customer_address_line2}
            disabled={draft.customer_address_unknown}
            onChange={(e) => setField("customer_address_line2", e.target.value)} />
          <Input id="so-postcode" label="Postcode" value={draft.customer_address_postcode}
            disabled={draft.customer_address_unknown}
            onChange={(e) => setField("customer_address_postcode", e.target.value)} />
          <Input id="so-city" label="City" value={draft.customer_address_city}
            disabled={draft.customer_address_unknown}
            onChange={(e) => setField("customer_address_city", e.target.value)} />
          <Input id="so-state" label="State" value={draft.customer_address_state}
            disabled={draft.customer_address_unknown}
            onChange={(e) => setField("customer_address_state", e.target.value)} />
          <Select id="so-building-type" label="Building type"
            value={draft.building_type || undefined}
            onValueChange={(v) => setField("building_type", v)}
            options={BUILDING_TYPE_OPTIONS.map((b) => ({ value: b, label: b }))} />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2" data-pos-field="billing">
          <div className="sm:col-span-2">
            <Checkbox id="so-billing-same" label="Billing address same as delivery"
              checked={draft.customer_billing_same}
              onCheckedChange={(v) => setField("customer_billing_same", v)} />
          </div>
          {!draft.customer_billing_same && (
            <div className="sm:col-span-2">
              <Input id="so-billing" label="Billing address" value={draft.customer_billing}
                onChange={(e) => setField("customer_billing", e.target.value)} />
            </div>
          )}
          <CustomFields fields={tab("address").custom} values={draft.custom} onChange={setCustom} />
        </div>
      </Block>

      {/* ⑥ MONEY — read-only forever (ownership Law B). */}
      <Block title="Money">
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
          <div>
            <div className="text-label text-base-500">Total</div>
            <div className="text-title text-base-900" data-testid="money-total">
              {money.known && money.total != null ? <Money value={money.total} /> : "No price yet"}
            </div>
          </div>
          <div>
            <div className="text-label text-base-500">Paid</div>
            <div className="text-strong text-base-700" data-testid="money-paid">
              <Money value={money.paid} />
            </div>
          </div>
          {/* ⭐ THE CUSTOMER-MONEY WORD IS `Outstanding` (CLAUDE.md §7 — what the
              CUSTOMER owes HQ), and it is the LOUDEST thing in the block: the
              most-read number on the page (ui/MASTER.md §6.4 ⑤), red while any
              of it is still owed (owner ruling 2026-08-15). */}
          <div>
            <div className="text-label text-base-500">Outstanding</div>
            <div
              className={`text-page ${money.known && money.outstanding > 0 ? "text-danger" : "text-base-900"}`}
              data-testid="money-outstanding"
            >
              {!money.known ? "No price yet" : money.outstanding > 0 ? <Money value={money.outstanding} /> : "Paid in full"}
            </div>
          </div>
        </div>
        {/* ⭐ A DOOR, NEVER A DUPLICATE (ownership Law C). Sales Order
            SUMMARISES money and may never gain a form for it — so the one thing
            it adds is the way OUT, to the desk that owns collection, already
            scoped to this order. Read-only: it navigates, it writes nothing. */}
        {!isNew && order && (
          <div className="mt-3 border-t border-kit-slate-5 pt-3">
            <button
              type="button"
              data-testid="workspace-open-payments"
              className="text-meta font-medium text-kit-blue-11 underline-offset-2 hover:underline"
              onClick={() => navigate(`/operation?tab=payments&so=${order.so}`)}
            >
              Open this order in Payments
            </button>
          </div>
        )}
      </Block>

      {/* ⑦ SALES OWNERSHIP */}
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
              <div data-pos-field="salesperson">
                <Fact label="Salesperson" value={sourceName(mode, viewedRevision, order, "salesperson") || "Not recorded"} />
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
        <span className="hidden" data-pos-field="orderAddons" aria-hidden="true" />
        {mode === "create" ? (
          <div className="flex flex-col gap-2">
            {draft.lines.map((l) => (
              <div key={l.key} className="grid grid-cols-[1fr_84px_120px_32px] items-end gap-2">
                <Input id={`so-sku-${l.key}`} label="SKU" value={l.sku}
                  onChange={(e) => setLine(l.key, { sku: e.target.value })} />
                <Input id={`so-qty-${l.key}`} label="Qty" type="number" min={1}
                  value={String(l.qty)}
                  onChange={(e) => setLine(l.key, { qty: Math.max(1, Number(e.target.value) || 1) })} />
                <Input id={`so-price-${l.key}`} label="Unit price (RM)" type="number" min={0}
                  value={String(l.unit_price)}
                  onChange={(e) => setLine(l.key, { unit_price: Math.max(0, Number(e.target.value) || 0) })} />
                <button
                  type="button"
                  aria-label="Remove line"
                  className="mb-1 grid h-8 w-8 place-items-center rounded-control text-base-500 hover:bg-hovertint hover:text-base-900"
                  onClick={() => setDraft((d) => ({ ...d, lines: d.lines.filter((x) => x.key !== l.key) }))}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <div>
              <Button size="sm" variant="neutral"
                onClick={() => setDraft((d) => ({ ...d, lines: [...d.lines, { key: nextKey(), sku: "", qty: 1, unit_price: 0 }] }))}>
                <Plus size={14} /> Add item
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
                    <td className="py-1.5 pr-3 font-mono text-meta">{truth?.unitIds.length ? truth.unitIds.join(" · ") : "Not allocated"}</td>
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
                {(detailQ.data?.addons ?? []).map((a, i) => (
                  <tr key={`a-${i}`} className="border-t border-kit-slate-5">
                    <td className="py-1.5 pr-3 text-label font-semibold text-base-600">SERVICE</td>
                    <td className="py-1.5 pr-3">—</td>
                    <td className="py-1.5 pr-3 font-mono text-meta">{a.addon_key}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{a.qty}</td>
                    <td className="py-1.5 pr-3">{a.addon_key}</td>
                    <td className="py-1.5">—</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
      ) : objectView === "Revisions" || objectView === "History" ? (
        <div className="min-h-0 flex-1 overflow-auto bg-kit-slate-3 px-4 py-4">
          <div className="mx-auto max-w-5xl rounded-card border border-kit-slate-5 bg-white p-5">
            <h2 className="mb-4 text-title font-semibold text-base-900">{objectView}</h2>
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
          </div>
        </div>
      ) : (
        /* ⭐ TWO PANES, 50 / 50 — owner ruling 2026-08-15. Each pane scrolls on
           its own and the PAGE does not; below 1024px they stack, form first,
           and the page scrolls normally. */
        <div className="min-h-0 flex-1 overflow-auto bg-kit-slate-3 lg:overflow-hidden">
          {(!isNew || copyFrom) && detailQ.isLoading && (
            <div className="px-4 py-4">
              <Loading label={copyFrom ? "Preparing the copied draft" : "Opening the sales order"} />
            </div>
          )}
          {(!isNew || copyFrom) && !detailQ.isLoading && detailQ.isError && (
            <div className="px-4 py-4">
              <div className="rounded-card border border-kit-slate-5 bg-white">
                <EmptyState
                  title={copyFrom ? "This Sales Order could not be copied" : "This sales order could not be opened"}
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

          {(isNew && !copyFrom || order) && (
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

function categoryWord(line: { sku: string; attrs?: Record<string, unknown> | null }): string {
  const fromAttrs = typeof line.attrs?.category === "string" ? line.attrs.category : "";
  const fromSku = line.sku.includes(":") ? line.sku.split(":", 1)[0] : "";
  const classified = lineClass(line.sku);
  const fallback = classified === "acc" ? "Accessory" : classified === "unknown" ? "Other goods" : classified;
  return (fromAttrs || fromSku || fallback).replace(/[_-]+/g, " ").toUpperCase();
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
