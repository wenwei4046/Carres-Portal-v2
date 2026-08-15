/**
 * SalesOrderWorkspace — the governed Sales Order detail and safe-correction
 * workspace. Commercial changes leave through Amendment, never this form.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ ONE LAYOUT, FOUR STATES, NO FIFTH (the card's own drawing)
 *
 * ```
 * ┌────────────────────── 55% ─────────────────────┬──── 45% ────┐
 * │ CUSTOMER · SOURCE · DATES · DELIVERY ·         │     PDF     │
 * │ ITEMS · MONEY · HISTORY / REVISION             │   PREVIEW   │
 * └────────────────────────────────────────────────┴─────────────┘
 * VIEW    values                      EDIT    the same slots, editable
 * CREATE  the same form, unlocked     OLD REV read-only + historical PDF
 * ```
 *
 * THE PDF IS ONE PIPELINE, LIVE: whatever the left side holds — the saved
 * order, the 300ms-debounced draft, or an old revision's snapshot — becomes
 * ONE SalesOrderTemplateData, ONE renderSalesOrderPdf blob. pdf.js paints
 * those bytes (VIEWER ONLY — never a second renderer) and Print opens the
 * SAME blob. The previous blob URL is revoked on every render.
 *
 * Every safe correction calls one RPC and mints Rev N+1. Items and the
 * promised delivery date stay read-only here; they are contractual facts.
 */
// design-standard: not-a-list-page — this is a DOCUMENT workspace. Its
// tables are the order's own line block: fixed rows, no sort, no selection.
import { useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Plus, Printer, Trash2, X } from "lucide-react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import * as pdfjs from "pdfjs-dist";
import { toast } from "sonner";
import {
  deliveryReasonLabel,
  lineClass,
  orderMoney,
  poReceivingProgress,
  receivingRecordNo,
  resolveSalesOrderRoute,
  warehouseReceiptStatusLabel,
  type SalesOrderRoute as SalesOrderRouteModel,
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
import { fmtDate } from "@/lib/fmt-date";
import { renderSalesOrderPdf } from "@/lib/pdf/render";
import type { SalesOrderTemplateData } from "@/lib/pdf/types";
import {
  useCreateSalesOrder,
  useOperationDealersRef,
  useOperationOrder,
  useOrderServiceCases,
  useOrderCorrectionWork,
  useOutlets,
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
import SalesOrderAmendment from "./SalesOrderAmendment";
import SalesOrderAttribution from "./SalesOrderAttribution";
import SalesOrderLedger from "./SalesOrderLedger";
import SalesOrderRoute from "./SalesOrderRoute";
import SalesOrderTabs from "./SalesOrderTabs";
import { lineName } from "./sales-order-facts";
import { lineConfigBits } from "../dealer/new-order/special-addons-picker";
import { missingDeliveryDateGuidance } from "./sales-order-guidance";
import { copySalesOrderDraft } from "./sales-order-copy";
import { objectViewParams } from "./sales-order-object-navigation";

/* pdf.js worker ships inside the package — nothing fetched from a CDN. */
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

/* ─────────────────────────────────────────────────────────────────────────────
 * The draft — ONE shape for EDIT and CREATE (the same slots, unlocked).
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
  customer_address: string;
  customer_address_line1: string;
  customer_address_line2: string;
  customer_address_city: string;
  customer_address_state: string;
  customer_address_postcode: string;
  customer_emergency: string;
  customer_billing: string;
  dealer_id: string | null;
  outlet_id: string | null;
  salesperson_id: string | null;
  delivery_date: string | null;
  delivery_date_tbd: boolean;
  proceed_date: string | null;
  delivery_floor: number;
  delivery_has_lift: boolean;
  lines: DraftLine[];
}

let draftKeySeq = 0;
const nextKey = () => `dl-${++draftKeySeq}`;

const EMPTY_DRAFT: Draft = {
  customer_name: "",
  customer_phone: "",
  customer_email: "",
  customer_address: "",
  customer_address_line1: "",
  customer_address_line2: "",
  customer_address_city: "",
  customer_address_state: "",
  customer_address_postcode: "",
  customer_emergency: "",
  customer_billing: "",
  dealer_id: null,
  outlet_id: null,
  salesperson_id: null,
  delivery_date: null,
  delivery_date_tbd: false,
  proceed_date: null,
  delivery_floor: 1,
  delivery_has_lift: false,
  lines: [{ key: nextKey(), sku: "", qty: 1, unit_price: 0 }],
};

/* ─────────────────────────────────────────────────────────────────────────────
 * ONE PDF pipeline — data in, canvases + printable blob out. pdf.js is a
 * viewer only; Print opens the SAME blob the pane shows.
 * ──────────────────────────────────────────────────────────────────────────── */
function usePdfCanvases(data: SalesOrderTemplateData | null) {
  const [url, setUrl] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const paneRef = useRef<HTMLDivElement | null>(null);
  const urlRef = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!data) {
      paneRef.current?.replaceChildren();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
      setUrl(null);
      return;
    }
    (async () => {
      try {
        const blob = await renderSalesOrderPdf(data);
        if (cancelled) return;
        const objectUrl = URL.createObjectURL(blob);
        /* Revoke the PREVIOUS blob URL on each render (the card's own line). */
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = objectUrl;
        setUrl(objectUrl);
        setPdfError(null);
        const doc = await pdfjs.getDocument({ data: await blob.arrayBuffer() }).promise;
        if (cancelled) return;
        const pane = paneRef.current;
        if (!pane) return;
        pane.replaceChildren();
        const paneWidth = Math.max(pane.clientWidth - 48, 320);
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
  }, [data]);
  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );
  return { url, pdfError, paneRef };
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
      address: draft.customer_address || "—",
      phone: draft.customer_phone || null,
      email: draft.customer_email || null,
      emergency: draft.customer_emergency || null,
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

/* ── Small read-only atoms ─────────────────────────────────────────────────── */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-kit-slate-5 bg-white px-4 py-3">
      <div className="text-label font-semibold tracking-wide text-base-500 uppercase">{title}</div>
      <div className="mt-2">{children}</div>
    </div>
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

type Mode = "view" | "edit" | "create" | "oldrev";
const OBJECT_VIEWS = ["Order", "Revisions", "History", "Order Route"] as const;
type ObjectView = (typeof OBJECT_VIEWS)[number];

export default function SalesOrderWorkspace() {
  const { orderId } = useParams<{ orderId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const isNew = location.pathname.endsWith("/so/new");
  const wantsEdit = params.get("edit") === "1";
  const showRoute = params.get("route") === "1" && !isNew;
  const copyFrom = isNew ? params.get("copyFrom") : null;
  const [viewRev, setViewRev] = useState<number | null>(null);
  const [amendmentSeed, setAmendmentSeed] = useState<AmendmentProposal | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [problemOpen, setProblemOpen] = useState(false);
  const [objectView, setObjectView] = useState<ObjectView>(showRoute ? "Order Route" : "Order");

  const detailQ = useOperationOrder(isNew ? copyFrom : (orderId ?? null));
  const serviceCasesQ = useOrderServiceCases(isNew ? "" : (orderId ?? ""), {
    enabled: !isNew && Boolean(orderId),
  });
  const revisionsQ = useSalesOrderRevisions(isNew ? null : (orderId ?? null));
  const goodsTruthQ = useSalesOrderExpansion(isNew ? "" : (orderId ?? ""));
  /* 3.4 · what this sales order's changes have raised for other modules. The
   * workspace SHOWS it and cannot close it — the module that raised the work
   * does not tick it off. */
  const correctionWorkQ = useOrderCorrectionWork(isNew ? null : (orderId ?? null));
  const routeFactsQ = useSalesOrderRouteFacts(
    isNew ? null : (orderId ?? null),
    showRoute,
    (detailQ.data?.pos ?? []).map((po) => po.id),
  );
  const baseQ = useQuery({
    queryKey: ["orders", "sales-order-data", orderId ?? "new"],
    queryFn: () =>
      apiFetch<SalesOrderTemplateData>(`/api/orders/${orderId}/sales-order-data`),
    enabled: !isNew && !!orderId,
  });

  const salespersonsQ = useSalespersons();
  const outletsQ = useOutlets();
  const dealersQ = useOperationDealersRef();

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

  /* ── The draft — seeded from the order when EDIT opens, empty for CREATE. ── */
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [draftSeed, setDraftSeed] = useState<string>("");
  const [dirty, setDirty] = useState(false);
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
        setDraft({
          ...copied,
          lines: copied.lines.map((line) => ({ ...line, key: nextKey() })),
        });
        setDirty(false);
        setDraftSeed(seed);
        return;
      }
      if (draftSeed !== "new") {
        setDraft({ ...EMPTY_DRAFT, lines: [{ key: nextKey(), sku: "", qty: 1, unit_price: 0 }] });
        setDirty(false);
        setDraftSeed("new");
      }
      return;
    }
    const seed = `${orderId}:${wantsEdit}`;
    if (!wantsEdit || !order || draftSeed === seed) return;
    setDraft({
      customer_name: order.customer_name ?? "",
      customer_phone: order.customer_phone ?? "",
      customer_email: (order as { customer_email?: string | null }).customer_email ?? "",
      customer_address: order.customer_address ?? "",
      customer_address_line1:
        (order as { customer_address_line1?: string | null }).customer_address_line1 ?? "",
      customer_address_line2:
        (order as { customer_address_line2?: string | null }).customer_address_line2 ?? "",
      customer_address_city:
        (order as { customer_address_city?: string | null }).customer_address_city ?? "",
      customer_address_state:
        (order as { customer_address_state?: string | null }).customer_address_state ?? "",
      customer_address_postcode:
        (order as { customer_address_postcode?: string | null }).customer_address_postcode ?? "",
      customer_emergency: order.customer_emergency ?? "",
      customer_billing: order.customer_billing ?? "",
      dealer_id: order.dealer_id ?? null,
      outlet_id: order.outlet_id ?? null,
      salesperson_id: order.salesperson_id ?? null,
      delivery_date: order.delivery_date,
      delivery_date_tbd: order.delivery_date_tbd,
      proceed_date: order.proceed_date ?? null,
      delivery_floor: (order as { delivery_floor?: number }).delivery_floor ?? 1,
      delivery_has_lift: (order as { delivery_has_lift?: boolean }).delivery_has_lift ?? false,
      lines: detailLines.map((l) => ({
        key: nextKey(),
        id: l.id,
        sku: l.sku,
        qty: l.qty,
        unit_price: Number(l.unit_price),
      })),
    });
    setDirty(false);
    setDraftSeed(seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, wantsEdit, order, orderId, copyFrom, detailLines, draftSeed]);

  const mode: Mode = isNew ? "create" : viewRev != null ? "oldrev" : wantsEdit ? "edit" : "view";

  const revisions = revisionsQ.data?.revisions ?? [];
  const currentRev = revisions.length > 0 ? revisions[revisions.length - 1]!.revision : null;
  const viewedRevision: SalesOrderRevisionRow | null =
    viewRev != null ? (revisions.find((r) => r.revision === viewRev) ?? null) : null;

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
    () => (mode === "edit" || mode === "create" ? draftTemplateData(draft, base, refs) : null),
    [mode, draft, base, refs],
  );
  const debouncedDraftData = useDebounced(liveDraftData, 300);
  const templateData: SalesOrderTemplateData | null = useMemo(() => {
    if (mode === "oldrev" && viewedRevision) return snapshotTemplateData(viewedRevision.snapshot, base);
    if (mode === "edit" || mode === "create") return debouncedDraftData;
    return base;
  }, [mode, viewedRevision, base, debouncedDraftData]);

  const { url: pdfUrl } = usePdfCanvases(templateData);

  /* ── Writes — ONE page-level Save; every write mints a revision. ── */
  const saveMut = useSaveSalesOrderRevision(orderId ?? "", {
    onSuccess: (r) => {
      toast.success(`Saved · Rev ${r.revision}`);
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("edit");
          return next;
        },
        { replace: true },
      );
      setDraftSeed("");
      void revisionsQ.refetch();
      void baseQ.refetch();
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

  const safeCorrectionPayload = (): Record<string, unknown> => ({
    customer_name: draft.customer_name.trim(),
    customer_phone: draft.customer_phone.trim() || null,
    customer_email: draft.customer_email.trim() || null,
    customer_address: draft.customer_address.trim() || null,
    customer_address_line1: draft.customer_address_line1.trim() || null,
    customer_address_line2: draft.customer_address_line2.trim() || null,
    customer_address_city: draft.customer_address_city.trim() || null,
    customer_address_state: draft.customer_address_state.trim() || null,
    customer_address_postcode: draft.customer_address_postcode.trim() || null,
    customer_emergency: draft.customer_emergency.trim() || null,
    customer_billing: draft.customer_billing.trim() || null,
    proceed_date: draft.proceed_date,
    delivery_floor: draft.delivery_floor,
    delivery_has_lift: draft.delivery_has_lift,
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
    const lines = draftLinesPayload();
    if (lines.length === 0) return "An order needs at least one item";
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
    /* A BIRTH names the parties — only the EDIT door lost them to 0329. */
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

  const setField = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setDirty(true);
    setDraft((d) => ({ ...d, [k]: v }));
  };
  const setLine = (key: string, patch: Partial<DraftLine>) => {
    setDirty(true);
    setDraft((d) => ({
      ...d,
      lines: d.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    }));
  };

  const confirmDiscard = () => !dirty || window.confirm("Discard unsaved changes?");
  const enterEdit = () =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("edit", "1");
        return next;
      },
      { replace: true },
    );
  const cancelEdit = () => {
    if (!confirmDiscard()) return;
    if (isNew) return navigate("/operation/orders");
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("edit");
        return next;
      },
      { replace: true },
    );
    setDraftSeed("");
    setDirty(false);
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
    if (mode === "edit" && view !== "Order") {
      if (!confirmDiscard()) return;
      setDraftSeed("");
      setDirty(false);
    }
    setObjectView(view);
    setParams(
      (prev) => objectViewParams(prev, view, mode === "edit"),
      { replace: true },
    );
    if (view === "Order Route") return;
    if (view === "Order") {
      window.setTimeout(() => document.getElementById("sales-order-workspace")?.scrollIntoView(), 0);
    }
  };

  /* ── The money the left side states (same arithmetic as the register). ── */
  const editing = mode === "edit" || mode === "create";
  const money = useMemo(() => {
    if (editing) {
      const lineSum = draft.lines.reduce(
        (s, l) => s + (l.sku.trim() ? l.qty * l.unit_price : 0),
        0,
      );
      const addonSum = (base?.addons ?? []).reduce((s, a) => s + a.line_total, 0);
      return orderMoney({ lineSum, addonSum, paid: base?.paid ?? 0, controlBalance: null });
    }
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
    const lines = detailQ.data?.lines ?? [];
    const addons = detailQ.data?.addons ?? [];
    return orderMoney({
      lineSum: lines.reduce((s, l) => s + Number(l.unit_price ?? 0) * Number(l.qty ?? 0), 0),
      addonSum: addons.reduce((s, a) => s + Number(a.unit_price ?? 0) * Number(a.qty ?? 0), 0),
      paid: order?.paid,
      controlBalance: null,
    });
  }, [editing, mode, draft.lines, base, viewedRevision, detailQ.data, order]);

  const orderRoute: SalesOrderRouteModel | null = useMemo(() => {
    const detail = detailQ.data;
    const facts = routeFactsQ.data;
    if (!orderId || !detail?.order || !facts) return null;
    return resolveSalesOrderRoute({
      order: {
        id: orderId,
        so: detail.order.so,
        placedAt: detail.order.placed_at,
        deliveryDate: detail.order.delivery_date,
        doNumber: detail.order.do_number,
        dispatchedAt: detail.order.dispatched_at,
        deliveredAt: detail.order.delivered_at,
        invoiceNo: detail.order.invoice_no,
      },
      revisions: revisions.map((revision) => revision.revision),
      lineLabels: Object.fromEntries(detail.lines.map((line) => [line.sku, line.label?.trim() || line.sku])),
      allocation: facts.allocation,
      purchaseOrders: detail.pos.map((po) => ({
        id: po.id,
        currentFact: poReceivingProgress(po.lines.map((line) => ({
          qty: line.qty,
          received_qty: line.received_qty,
        }))).label,
        etaDate: po.eta_date,
        /* A file path proves a file exists but is not its document number. */
        supplierDoNumber: null,
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
        supplierDoNumber: record.do_number,
        status: warehouseReceiptStatusLabel(record.status),
        receivedAt: record.goods_received_at,
      })),
      delivery: {
        booking: facts.brief.appointment
          ? {
              date: facts.brief.appointment.dateIso,
              slot: facts.brief.appointment.slot,
              partnerName: facts.brief.appointment.carrier.partnerName,
            }
          : null,
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
      money: {
        known: money.known,
        total: money.total,
        paid: money.paid,
        outstanding: money.outstanding,
      },
      refunds: facts.refunds.map((refund) => ({
        id: refund.id,
        amount: Number(refund.amount),
        status: refund.status,
        requestedAt: refund.requested_at,
      })),
      loans: facts.loans.map((loan) => ({
        id: loan.id,
        label: loan.borrowed_label ?? loan.item_sku ?? loan.category ?? "Loan item",
        status: loan.status,
        source: loan.source,
        loanNoteNo: loan.loan_note_no,
        loanedAt: loan.loaned_at,
        returnedAt: loan.returned_at,
        returnedToSupplierAt: loan.returned_to_supplier_at,
      })),
      cases: facts.cases.map((item) => ({
        id: item.id,
        caseNo: item.caseNo,
        closed: item.statusIsClosed,
        openedAt: item.openedAt,
      })),
      claims: facts.claims.map((item) => ({
        id: item.id,
        claimNo: item.claim_no,
        poId: item.po_id,
        status: item.status,
        reportedAt: item.reported_at,
      })),
      work: (correctionWorkQ.data?.work ?? []).map((item) => ({
        id: item.id,
        module: item.module,
        title: item.consequence,
        state: item.state,
        createdAt: item.raised_at,
      })),
    });
  }, [orderId, detailQ.data, routeFactsQ.data, revisions, money, correctionWorkQ.data]);

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

  const headerRight = (
    <span className="flex items-center gap-2">
      {mode === "view" && objectView === "Order" && !showRoute && (
        <Button size="sm" variant="neutral" onClick={enterEdit} data-testid="workspace-edit">
          <Pencil size={14} /> Edit
        </Button>
      )}
      {/* The governed cancel sits beside the governed edit, exactly as the
          MASTER's Workspace ruling reads. An order already cancelled has
          nothing left to cancel, so the door is absent rather than refusing. */}
      {mode === "view" && objectView === "Order" && !showRoute && order && order.status !== "cancelled" && (
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
            <button type="button" onClick={() => setCancelOpen(true)} data-testid="workspace-cancel-so" className="w-full rounded-control px-2 py-1.5 text-left text-meta text-danger hover:bg-hovertint">Cancel SO</button>
          </div>
        </details>
      )}
      {(mode === "create" || (mode === "edit" && objectView === "Order")) && (
        <>
          <Button size="sm" variant="ghost" onClick={cancelEdit} data-testid="workspace-cancel">
            <X size={14} /> Discard
          </Button>
          <Button
            size="sm"
            variant="primary"
            loading={saveMut.isPending || createMut.isPending}
            onClick={mode === "create" ? onCreate : onSave}
            data-testid="workspace-save"
          >
            {mode === "create" ? "Create order" : "Save"}
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
        disabled={!pdfUrl}
        onClick={() => {
          if (pdfUrl) window.open(pdfUrl, "_blank");
        }}
        data-testid="workspace-print"
      >
        <Printer size={14} /> Print ▾
      </Button>
    </span>
  );

  const soWord = isNew ? "New Sales Order" : order ? `SO-${order.so}` : "Sales Order";
  const missingDateAction = order && !order.delivery_date
    ? missingDeliveryDateGuidance({
        so: order.so,
        customer: order.customer_name,
        salesperson: order.salespersons?.name,
        phone: order.customer_phone,
      })
    : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SalesOrderTabs
        identity={soWord}
        customer={order?.customer_name}
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
            void serviceCasesQ.refetch();
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
            <SalesOrderRoute route={orderRoute} />
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
        <div className="min-h-0 flex-1 overflow-auto bg-kit-slate-3 px-4 py-4">
          {(!isNew || copyFrom) && detailQ.isLoading && <Loading label={copyFrom ? "Preparing the copied draft" : "Opening the sales order"} />}
          {(!isNew || copyFrom) && !detailQ.isLoading && detailQ.isError && (
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
          )}

          {(isNew && !copyFrom || order) && (
            <div className="mx-auto grid max-w-6xl grid-cols-1 gap-3 xl:grid-cols-2" data-testid="sales-order-workspace">
              {(mode === "oldrev" || mode === "edit" || (mode === "create" && copyFrom)) && (
                <div className="px-1 py-1 text-meta text-base-600 xl:col-span-2">
                  {mode === "oldrev" && viewedRevision ? (
                    <span className="rounded-full bg-base-900 px-2 py-0.5 text-label font-semibold text-white">
                      Viewing Rev {viewedRevision.revision} · read-only
                    </span>
                  ) : mode === "edit" ? (
                    <span>Editing operational details only. Commercial changes require an amendment.</span>
                  ) : mode === "create" && copyFrom && order ? (
                    <span className="rounded-full bg-kit-blue-3 px-2 py-0.5 text-label font-semibold text-kit-blue-11">
                      Copied from SO-{order.so} · review before creating
                    </span>
                  ) : null}
                </div>
              )}
              {!isNew && (order?.source_ref ?? []).length > 0 && (
                  <div className="px-1 text-meta text-base-500">
                    Customer reference {(order?.source_ref ?? []).join(" · ")}
                  </div>
                )}

              {/* ① CUSTOMER */}
              <Section title={mode === "edit" ? "Edit operational details" : "Customer"}>
                {editing ? (
                  <div className="grid grid-cols-2 gap-3">
                    {mode === "edit" && <div className="col-span-2 text-label font-semibold text-base-600">Customer contact and address</div>}
                    <Input id="ws-name" label="Name" required value={draft.customer_name}
                      onChange={(e) => setField("customer_name", e.target.value)} />
                    <Input id="ws-phone" label="Phone" value={draft.customer_phone}
                      onChange={(e) => setField("customer_phone", e.target.value)} />
                    <Input id="ws-email" label="Email" value={draft.customer_email}
                      onChange={(e) => setField("customer_email", e.target.value)} />
                    <Input id="ws-emergency" label="Emergency contact" value={draft.customer_emergency}
                      onChange={(e) => setField("customer_emergency", e.target.value)} />
                    <Input id="ws-line1" label="Address line 1" value={draft.customer_address_line1}
                      onChange={(e) => setField("customer_address_line1", e.target.value)} />
                    <Input id="ws-line2" label="Address line 2" value={draft.customer_address_line2}
                      onChange={(e) => setField("customer_address_line2", e.target.value)} />
                    <Input id="ws-city" label="City" value={draft.customer_address_city}
                      onChange={(e) => setField("customer_address_city", e.target.value)} />
                    <Input id="ws-state" label="State" value={draft.customer_address_state}
                      onChange={(e) => setField("customer_address_state", e.target.value)} />
                    <Input id="ws-postcode" label="Postcode" value={draft.customer_address_postcode}
                      onChange={(e) => setField("customer_address_postcode", e.target.value)} />
                    <div className="col-span-2">
                      <Fact
                        label="Address preview"
                        value={[
                          draft.customer_address_line1,
                          draft.customer_address_line2,
                          draft.customer_address_postcode,
                          draft.customer_address_city,
                          draft.customer_address_state,
                        ].filter(Boolean).join(", ") || "Not given"}
                      />
                    </div>
                    <Input id="ws-billing" label="Billing address" value={draft.customer_billing}
                      onChange={(e) => setField("customer_billing", e.target.value)} />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-x-5 gap-y-3">
                    <Fact label="Name" value={
                      <span className={cjkClassName(displayHeader(mode, viewedRevision, order, "customer_name"))}>
                        {displayHeader(mode, viewedRevision, order, "customer_name") || "—"}
                      </span>
                    } />
                    <Fact label="Phone" value={displayHeader(mode, viewedRevision, order, "customer_phone") || "Not given"} />
                    <Fact label="Email" value={displayHeader(mode, viewedRevision, order, "customer_email") || "Not given"} />
                    <Fact label="Emergency contact" value={displayHeader(mode, viewedRevision, order, "customer_emergency") || "Not given"} />
                    <div className="col-span-2">
                      <Fact label="Address" value={displayHeader(mode, viewedRevision, order, "customer_address") || "Not given"} />
                    </div>
                  </div>
                )}
              </Section>

              {/* ② SOURCE — a BIRTH names the parties; an EDIT may not move
                  them. STAGE 3 (0329): salesperson · showroom · dealer decide
                  who gets paid, so they leave the direct-edit lane and travel
                  by request (GATES.md Test 3). The save RPC now REFUSES a
                  header carrying one, so leaving the pickers here would have
                  been a form that cannot save. */}
              <Section title={mode === "edit" ? "Order context" : "Sales ownership"}>
                {mode === "create" ? (
                  <div className="grid grid-cols-2 gap-3">
                    <Select id="ws-dealer" label="Dealer"
                      value={draft.dealer_id ?? ""}
                      onValueChange={(v) => setField("dealer_id", v || null)}
                      options={dealerOptions} placeholder="Pick a dealer" />
                    <Select id="ws-outlet" label="Showroom"
                      value={draft.outlet_id ?? "none"}
                      onValueChange={(v) => setField("outlet_id", v === "none" ? null : v)}
                      options={outletOptions} />
                    <Select id="ws-salesperson" label="Salesperson"
                      value={draft.salesperson_id ?? "none"}
                      onValueChange={(v) => setField("salesperson_id", v === "none" ? null : v)}
                      options={spOptions} />
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-x-5 gap-y-3">
                      {mode === "edit" && <div className="col-span-3 text-label font-semibold text-base-600">Sales ownership</div>}
                      <Fact label="Dealer" value={sourceName(mode, viewedRevision, order, "dealer") || "Not recorded"} />
                      <Fact label="Showroom" value={sourceName(mode, viewedRevision, order, "outlet") || "Not recorded"} />
                      <Fact label="Salesperson" value={sourceName(mode, viewedRevision, order, "salesperson") || "Not recorded"} />
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
              </Section>

              {/* ③ DATES */}
              <Section title="Dates">
                {mode === "create" ? (
                  <div className="grid grid-cols-3 gap-3">
                    <Fact label="Ordered" value={isNew ? "Today" : fmtDate(order?.placed_at ?? null)} />
                    <div>
                      <div className="text-label text-base-500 mb-1">Customer Delivery</div>
                      <DatePicker id="ws-promised" value={draft.delivery_date}
                        onChange={(iso) => setField("delivery_date", iso)} />
                      <div className="mt-1.5">
                        <Checkbox id="ws-tbd" label="Delivery date to be confirmed"
                          checked={draft.delivery_date_tbd}
                          onCheckedChange={(v) => setField("delivery_date_tbd", v)} />
                      </div>
                    </div>
                    <div>
                      <div className="text-label text-base-500 mb-1">Proceed date</div>
                      <DatePicker id="ws-proceed" value={draft.proceed_date}
                        onChange={(iso) => setField("proceed_date", iso)} />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-x-5 gap-y-3">
                    <Fact label="Ordered" value={fmtDate((displayHeader(mode, viewedRevision, order, "placed_at") || order?.placed_at) ?? null)} />
                    <Fact label="Customer Delivery" value={
                      promisedWord(mode, viewedRevision, order) === "No delivery date" ? (
                        <span data-attention="warning" className="inline-flex rounded-control bg-kit-amber-3 px-1.5 py-0.5 font-medium text-kit-amber-11">No delivery date</span>
                      ) : promisedWord(mode, viewedRevision, order)
                    } />
                    {mode === "edit" ? (
                      <div>
                        <div className="text-label text-base-500 mb-1">Proceed date</div>
                        <DatePicker id="ws-proceed" value={draft.proceed_date}
                          onChange={(iso) => setField("proceed_date", iso)} />
                      </div>
                    ) : (
                      <Fact label="Proceed date" value={fmtDate(displayHeader(mode, viewedRevision, order, "proceed_date")) || "Not recorded"} />
                    )}
                  </div>
                )}
              </Section>

              {/* ④ DELIVERY */}
              <Section title="Delivery">
                {editing ? (
                  <div className="grid grid-cols-3 gap-3 items-end">
                    <Input id="ws-floor" label="Floor" type="number" min={0}
                      value={String(draft.delivery_floor)}
                      onChange={(e) => setField("delivery_floor", Math.max(0, Number(e.target.value) || 0))} />
                    <div className="pb-2">
                      <Checkbox id="ws-lift" label="Lift available"
                        checked={draft.delivery_has_lift}
                        onCheckedChange={(v) => setField("delivery_has_lift", v)} />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-x-5 gap-y-3">
                    <Fact label="Floor" value={String(displayHeader(mode, viewedRevision, order, "delivery_floor") ?? (order as { delivery_floor?: number } | undefined)?.delivery_floor ?? "—")} />
                    <Fact label="Lift" value={liftWord(mode, viewedRevision, order)} />
                  </div>
                )}
              </Section>

              {/* ⑤ ITEMS */}
              <div className="xl:col-span-2">
              <Section title="Goods">
                {mode === "create" ? (
                  <div className="flex flex-col gap-2">
                    {draft.lines.map((l) => (
                      <div key={l.key} className="grid grid-cols-[1fr_84px_120px_32px] items-end gap-2">
                        <Input id={`ws-sku-${l.key}`} label="SKU" value={l.sku}
                          onChange={(e) => setLine(l.key, { sku: e.target.value })} />
                        <Input id={`ws-qty-${l.key}`} label="Qty" type="number" min={1}
                          value={String(l.qty)}
                          onChange={(e) => setLine(l.key, { qty: Math.max(1, Number(e.target.value) || 1) })} />
                        <Input id={`ws-price-${l.key}`} label="Unit price (RM)" type="number" min={0}
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
                )}

                {/* 3.5 · the amendment lane lives WITH the items, because
                    items are the contractual thing it proposes to change. It
                    locks nothing beside it — a phone fix stays free while a
                    proposal waits (`LOCK THE CONSEQUENCE`). */}
                {!isNew && mode === "view" && orderId && (
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
              </Section>
              </div>

              {/* ⑥ MONEY */}
              <div className="xl:col-span-2"><Section title="Money">
                <div className="grid grid-cols-3 gap-x-5">
                  <Fact label="Total" value={money.known && money.total != null ? <Money value={money.total} /> : "No price yet"} />
                  <Fact label="Paid" value={<Money value={money.paid} />} />
                  {/* ⭐ THE CUSTOMER-MONEY WORD IS `Outstanding` — owner ruling
                      2026-08-15, and it was already the dictionary's (CLAUDE.md
                      §7: what the CUSTOMER owes HQ). `balance` stays the goods
                      word for a short-delivery quantity; the two facts were
                      wearing one label. */}
                  <Fact
                    label="Outstanding"
                    value={
                      !money.known ? "No price yet" : money.outstanding > 0 ? <Money value={money.outstanding} /> : "Paid in full"
                    }
                  />
                </div>
                {/* ⭐ A DOOR, NEVER A DUPLICATE (ownership Law C). Sales Order
                    SUMMARISES money and may never gain a form for it — so the
                    one thing it adds is the way OUT, to the desk that owns
                    collection, already scoped to this order. Read-only: it
                    navigates, it writes nothing. */}
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
              </Section></div>

              {/* ⑦ WHAT THIS CHANGE STARTED ELSEWHERE — 3.4.
                  Shown only when there IS work: a section that says "nothing"
                  on every order is a section the operator learns to skip. */}
              {!isNew && mode !== "oldrev" && (correctionWorkQ.data?.work ?? []).length > 0 && (
                <Section title="What this change started elsewhere">
                  <CorrectionWorkList
                    work={correctionWorkQ.data?.work ?? []}
                    canClose={false}
                    emptyWord=""
                  />
                </Section>
              )}

              {!isNew && mode === "view" && order && (
                <section className="rounded-card border border-kit-slate-5 bg-white p-4 xl:col-span-2" aria-labelledby="sales-order-problems">
                  {missingDateAction && (
                    <details open className="mb-4 rounded-control border border-kit-slate-5 bg-kit-amber-3 p-3">
                      <summary className="cursor-pointer list-none">
                        <span className="block text-body font-semibold text-kit-amber-11">{missingDateAction.problem}</span>
                        <span className="block text-meta font-normal text-base-600">{missingDateAction.action}</span>
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
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 id="sales-order-problems" className="text-body font-semibold text-base-900">Problems</h2>
                      <p className="mt-0.5 text-meta text-base-600">Report a customer, product, delivery or installation problem.</p>
                    </div>
                    <Button variant="neutral" onClick={() => setProblemOpen(true)}>Report a problem</Button>
                  </div>
                  {(serviceCasesQ.data?.items ?? []).length > 0 && (
                    <div className="mt-3 divide-y divide-kit-slate-5 border-t border-kit-slate-5">
                      {(serviceCasesQ.data?.items ?? []).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => navigate(`/operation/service-cases?case=${encodeURIComponent(item.id)}`)}
                          className="flex w-full items-center justify-between gap-3 py-2 text-left hover:text-kit-blue-11"
                        >
                          <span>
                            <span className="block text-body font-medium">Service Case {item.caseNo}</span>
                            <span className="block text-meta text-base-600">{item.statusLabel ?? "Status not recorded"}</span>
                          </span>
                          <span className="text-meta text-kit-blue-11">Open case</span>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              )}

            </div>
          )}
        </div>

      )}
    </div>
  );
}

/* ── Read-side value pickers: the VIEWED revision's snapshot outranks the
 * current row; VIEW mode reads the row itself. ─────────────────────────────── */
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

function liftWord(mode: Mode, rev: SalesOrderRevisionRow | null, order: Orderish): string {
  const v =
    mode === "oldrev" && rev
      ? rev.snapshot.header?.["delivery_has_lift"]
      : bag(order)["delivery_has_lift"];
  if (v == null) return "Not recorded";
  return v ? "Yes" : "No";
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
