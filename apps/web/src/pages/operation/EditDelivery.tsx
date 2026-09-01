/**
 * EDIT DELIVERY — Delivery's own full-screen 50/50 surface.
 * Owner ruling 2026-08-24 · `docs/delivery/MASTER.md` §8 · migration 0379.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ WHY THIS PAGE EXISTS
 *
 * Double-clicking a Delivery Work row used to open the SALES ORDER. The owner
 * caught it on production: `onRowDoubleClick={openOrder}` sent a logistics
 * operator, mid-plan, into a commercial document they must not edit — and left
 * them with no surface at all for the thing they actually came to do. Delivery
 * owns the arrangement, so Delivery gets the screen for it.
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ ← Delivery Work   SO-1322 · Kong Chai Yin                Save Delivery  │
 * ├───────────────── 50% ──────────────────┬──────────────── 50% ───────────┤
 * │ FROM THE SALES ORDER (read-only)       │  LIVE DELIVERY ORDER PREVIEW   │
 * │   Customer · Phone · Delivery location │  the ACTUAL governed renderer, │
 * │   Building/floor/lift                  │  re-rendered as you type       │
 * │   Requested Delivery Date · preferred time   │                                │
 * │   [Open Sales Order to change]         │  Preview · No delivery order   │
 * │                                        │  yet   — or the real DO number │
 * │ DELIVERY OWNS THESE                    │                                │
 * │   Logistics Partner                    │                                │
 * │   Confirmed Delivery · Confirmed Time  │                                │
 * │   Expected arrival · Logistics note    │                                │
 * │   Actual reply proof                   │                                │
 * │   Driver / Vehicle (Condo only)        │                                │
 * └────────────────────────────────────────┴────────────────────────────────┘
 * ```
 *
 * ── THE LEFT COLUMN'S TWO HALVES ARE NOT DECORATION ─────────────────────────
 *
 * The Sales facts are printed, not bound. There is no input for the customer's
 * name, the address, the building or the promised date — and the SAVE payload
 * has no field for them either (`saveDeliveryArrangementInputSchema`), so this
 * page could not write one even by accident. When one of them is wrong the
 * answer is a door, `Open Sales Order to change`, never a second editor. That
 * is Architecture Law C: two forms for one act make two records.
 *
 * ── THE RIGHT COLUMN IS THE REAL DOCUMENT ───────────────────────────────────
 *
 * It renders `DoTemplate` — the same component the printed Delivery Order uses,
 * not a mock of it. So a change to a printable field is visible as the document
 * the customer will actually sign, and an operator can see that a two-line
 * address will not fit before a driver finds out. Before issuance the header
 * says `Preview · No delivery order yet`; afterwards it carries the real
 * number. Re-rendered on a 400ms debounce because a PDF render is not free.
 *
 * ── SAVE DELIVERY DOES NOT ISSUE ────────────────────────────────────────────
 *
 * `Save Delivery` records the arrangement and stops. The SYSTEM issues the DO
 * when the governed gate becomes true (`docs/delivery/MASTER.md` §3) — there is
 * no Issue, no Release and no Approve on this page, and there never may be.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  CHANGE_LOGISTICS_REASONS,
  isLogisticsChange,
  lineClass,
  type SaveDeliveryArrangementInput,
} from "@carres/shared";
import { fmtDate } from "@/lib/fmt-date";
import { displayCustomerName } from "@/lib/customer-name";
import { apiFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { lineName } from "./sales-order-facts";
import {
  useDeliveryArrangement,
  useDeliveryPartners,
  useSaveDeliveryArrangement,
} from "@/lib/queries";
import { renderDoPdf } from "@/lib/pdf/render";
import type { DoTemplateData } from "@/lib/pdf/types";
import ModuleHeader from "./components/ModuleHeader";
import { DATE_TO_BE_CONFIRMED_CELL } from "./sales-order-guidance";

/** Every visible word (COPY-STANDARD). */
export const ED = {
  page: "Edit Delivery",
  docTitle: "Edit Delivery — Carres",
  back: "Delivery",
  save: "Save Delivery",
  saving: "Saving…",
  saved: "Delivery arrangement saved",
  salesHeading: "From the Sales Order",
  deliveryHeading: "Delivery arranges these",
  openSalesOrder: "Open Sales Order to change",
  previewHeading: "Delivery Order preview",
  previewNone: "Preview · No delivery order yet",
  previewBuilding: "Building the preview…",
  customer: "Customer",
  phone: "Phone",
  location: "Delivery location",
  building: "Building",
  floor: "Floor",
  lift: "Lift",
  customerDelivery: "Requested Delivery Date",
  preferredTime: "Customer preferred time",
  partner: "Logistics Partner",
  confirmedDate: "Confirmed Delivery",
  confirmedTime: "Confirmed Time",
  expectedArrival: "Expected arrival time",
  note: "Logistics note",
  proof: "Actual reply proof",
  driver: "Driver",
  vehicle: "Vehicle",
  reason: "Why is the logistics partner changing?",
  pick: "Pick one",
  none: "No logistics picked",
  notGiven: "Not given",
  notRecorded: "Not recorded",
  noDate: "No delivery date",
  noTime: "No time agreed",
  hasLift: "Has a lift",
  noLift: "No lift",
  loadFailed: "That delivery could not be loaded",
  condoOnly: "Condo deliveries need a driver and vehicle before the day.",
  /** Delivery Card 05 — the chase door and the real reply evidence. */
  askPartner: (name: string) => `Ask ${name} for the delivery date`,
  copyMessage: "Copy message",
  copied: "Message copied",
  openGroup: "Open WhatsApp group",
  groupNotSet: "No WhatsApp group saved for this partner",
  sentIsNotConfirmed:
    "Sending is not confirmation. Record the date only after the partner replies, and upload the reply below.",
  uploadReply: "Upload reply screenshot",
  replaceReply: "Replace screenshot",
  replySaved: "Reply screenshot attached — Save Delivery keeps it",
  uploadFailed: "The screenshot could not be uploaded",
  uploadWrongType: "Use a JPG, PNG or WEBP screenshot",
  uploadTooLarge: "That screenshot is too large (max 10 MB)",
} as const;

/**
 * The prepared WhatsApp message — plain facts, primary-school English, and
 * NOTHING that reads as a confirmation (`docs/delivery/MASTER.md` §2: prepared,
 * copied, opened or sent never means confirmed). Pure and exported for its test.
 */
export function chaseMessageFor(input: {
  so: number | null;
  customer: string | null;
  address: string | null;
  building: string | null;
  goods: string[];
  requestedDate: string | null; // already formatted, or null
}): string {
  const lines = [
    `SO-${input.so ?? "?"} · ${input.customer ?? ""}`.trim(),
    input.address ?? "",
    input.building ? `Building: ${input.building}` : "",
    input.goods.length > 0 ? `Goods: ${input.goods.join(", ")}` : "",
    input.requestedDate ? `Customer asked: ${input.requestedDate}` : "Customer date not given yet",
    "Please confirm the delivery date and time.",
  ];
  return lines.filter(Boolean).join("\n");
}

/** A printed fact, quiet when it is an absence (the register's own rule). */
function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-label font-semibold uppercase tracking-wide text-kit-slate-9">
        {label}
      </span>
      <span className={value ? "text-body text-kit-slate-12" : "text-body text-kit-slate-9"}>
        {value ?? ED.notGiven}
      </span>
    </div>
  );
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-label font-semibold uppercase tracking-wide text-kit-slate-9">
        {label}
      </span>
      {children}
      {hint ? <span className="text-label text-kit-slate-9">{hint}</span> : null}
    </label>
  );
}

const INPUT =
  "h-8 rounded-control border border-kit-slate-6 bg-white px-2 text-body text-kit-slate-12";

export default function EditDelivery() {
  const { orderId } = useParams<{ orderId: string }>();
  const [searchParams] = useSearchParams();
  const leg = Number(searchParams.get("leg") ?? "0") || 0;
  const navigate = useNavigate();

  const detailQ = useDeliveryArrangement(orderId, leg);
  const partnersQ = useDeliveryPartners();
  const save = useSaveDeliveryArrangement(orderId, leg);

  const order = detailQ.data?.order;
  const arrangement = detailQ.data?.arrangement ?? null;
  const partners = useMemo(() => partnersQ.data?.partners ?? [], [partnersQ.data]);

  /* ── The form. Seeded from the arrangement ONCE it arrives, never on every
        render: re-seeding would throw away what the operator is typing. ───── */
  const [form, setForm] = useState<SaveDeliveryArrangementInput>({});
  const [reason, setReason] = useState("");
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !detailQ.data) return;
    seeded.current = true;
    setForm({
      partnerId: arrangement?.partner_id ?? null,
      confirmedDate: arrangement?.confirmed_date ?? null,
      confirmedTime: arrangement?.confirmed_time ?? null,
      expectedArrival: arrangement?.expected_arrival ?? null,
      logisticsNote: arrangement?.logistics_note ?? null,
      replyProofPath: arrangement?.reply_proof_path ?? null,
      driverName: arrangement?.driver_name ?? null,
      vehicle: arrangement?.vehicle ?? null,
    });
  }, [detailQ.data, arrangement]);

  const set = useCallback(
    <K extends keyof SaveDeliveryArrangementInput>(
      key: K,
      value: SaveDeliveryArrangementInput[K],
    ) => setForm((f) => ({ ...f, [key]: value })),
    [],
  );

  /* ── Delivery Card 05: the chase door — prepared words, never confirmation. */
  const chosenPartner = useMemo(
    () => partners.find((p) => p.id === form.partnerId) ?? null,
    [partners, form.partnerId],
  );
  const chaseMessage = useMemo(() => {
    if (!order) return "";
    return chaseMessageFor({
      so: (order.so as number | null) ?? null,
      customer: displayCustomerName((order.customer_name as string | null) ?? "") || null,
      address:
        ((order.customer_address as string | null) ??
          [order.customer_address_city, order.customer_address_state]
            .filter(Boolean)
            .join(", ")) || null,
      building:
        ((order as { building_type?: string | null }).building_type as string | null) ?? null,
      goods: (order.order_lines ?? []).map((l) => lineName({ sku: l.sku })),
      requestedDate: order.delivery_date_tbd
        ? null
        : order.delivery_date
          ? fmtDate(order.delivery_date)
          : null,
    });
  }, [order]);
  const copyChase = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(chaseMessage);
      toast.success(ED.copied);
    } catch {
      toast.error("Could not copy — select the text and copy it yourself");
    }
  }, [chaseMessage]);

  /* ── Delivery Card 05: the REAL reply evidence — an upload, not a typed path. */
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const uploadReply = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      setUploadError(null);
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file || !orderId) return;
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        setUploadError(ED.uploadWrongType);
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setUploadError(ED.uploadTooLarge);
        return;
      }
      setUploadBusy(true);
      try {
        const sign = await apiFetch<{ token: string; path: string }>(
          `/api/operation/delivery-arrangements/${encodeURIComponent(orderId)}/reply-proof/sign-upload?leg=${leg}`,
          { method: "POST", body: JSON.stringify({ mimeType: file.type, sizeBytes: file.size }) },
        );
        const { error } = await supabase.storage
          .from("proof-of-delivery")
          .uploadToSignedUrl(sign.path, sign.token, file);
        if (error) throw new Error(error.message);
        set("replyProofPath", sign.path);
        toast.success(ED.replySaved);
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : ED.uploadFailed);
      } finally {
        setUploadBusy(false);
      }
    },
    [orderId, leg, set],
  );

  const partnerName = useMemo(
    () => partners.find((p) => p.id === form.partnerId)?.name ?? null,
    [partners, form.partnerId],
  );

  /* The SAME predicate the server runs — the form cannot ask for a reason the
     server does not require, nor stay quiet about one it does. */
  const needsReason = isLogisticsChange(arrangement?.partner_id, form.partnerId ?? null);

  /* A Condo trip needs a name and a plate in advance; a landed house does not,
     and asking for one there is a field nobody can fill. */
  const isCondo = /condo|apartment|flat|serviced/i.test(
    String((order as { building_type?: string } | undefined)?.building_type ?? ""),
  );

  // ── THE LIVE PREVIEW ──────────────────────────────────────────────────────
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const previewData = useMemo<DoTemplateData | null>(() => {
    if (!order) return null;
    const address =
      (order.customer_address as string | null) ??
      [
        order.customer_address_line1,
        order.customer_address_line2,
        order.customer_address_city,
        order.customer_address_postcode,
        order.customer_address_state,
      ]
        .filter(Boolean)
        .join(", ");
    return {
      /* Before issuance the document has no number, and the preview says so
         rather than inventing one — a fake number on a preview is the kind of
         thing that ends up read aloud to a driver. */
      do_number: (order.do_number as string | null) ?? ED.previewNone,
      issue_date: new Date().toISOString().slice(0, 10),
      order_id: order.id,
      order_code: `SO-${order.so}`,
      customer: {
        name: displayCustomerName((order.customer_name as string | null) ?? ""),
        address: address || ED.notGiven,
        phone: (order.customer_phone as string | null) ?? null,
        emergency: (order.customer_emergency as string | null) ?? null,
      },
      dealer: { name: "Carres", contact: null },
      partner: partnerName ? { name: partnerName } : null,
      lines: (order.order_lines ?? []).map((l) => ({
        sku: l.sku,
        description: l.sku,
        qty: Number(l.qty) || 0,
        unit: "pc",
        line_total: 0,
        category: lineClass(l.sku),
        attrs: l.attrs ?? null,
      })),
      currency: "MYR",
      delivery_date: form.confirmedDate ?? null,
      delivery: {
        floor: (order.delivery_floor as number | null) ?? null,
        has_lift: (order.delivery_has_lift as boolean | null) ?? null,
        address: address || null,
      },
    };
  }, [order, partnerName, form.confirmedDate]);

  useEffect(() => {
    if (!previewData) return;
    let cancelled = false;
    setPreviewing(true);
    /* 400ms: a PDF render is not free, and re-rendering on every keystroke
       would make the form feel like it is fighting back. */
    const t = setTimeout(() => {
      void renderDoPdf(previewData)
        .then((blob) => {
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          setPreviewUrl((old) => {
            if (old) URL.revokeObjectURL(old);
            return url;
          });
        })
        .catch(() => {
          /* A preview that cannot render must never block the FORM. The
             operator's arrangement is the point; the picture is the aid. */
        })
        .finally(() => {
          if (!cancelled) setPreviewing(false);
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [previewData]);

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  const submit = () => {
    if (needsReason && !reason) return;
    save.mutate(
      { ...form, ...(needsReason ? { reason: reason as SaveDeliveryArrangementInput["reason"] } : {}) },
      {
        onSuccess: () => {
          toast.success(ED.saved);
          navigate("/operation?tab=delivery");
        },
        onError: (e: Error) => toast.error(e.message),
      },
    );
  };

  const backToWork = () => navigate("/operation?tab=delivery");

  if (detailQ.isError) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-kit-canvas">
        <ModuleHeader testId="edit-delivery-header" word={ED.page} docTitle={ED.docTitle} destinationHeader />
        <div className="flex flex-1 items-center justify-center">
          <p className="text-body text-kit-slate-12">{ED.loadFailed}</p>
        </div>
      </div>
    );
  }

  const so = order ? `SO-${order.so}` : "";
  const customer = order ? displayCustomerName((order.customer_name as string | null) ?? "") : "";

  return (
    <div className="flex h-full min-h-0 flex-col bg-kit-canvas" data-testid="edit-delivery">
      <ModuleHeader
        testId="edit-delivery-header"
        word={ED.page}
        page={order ? `${so} · ${customer}` : undefined}
        docTitle={ED.docTitle}
        destinationHeader
        right={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={backToWork}
              data-testid="edit-delivery-back"
              className="inline-flex h-7 items-center gap-1.5 rounded-control border border-kit-slate-6 bg-white px-3 text-meta font-medium text-kit-slate-12 hover:bg-kit-slate-3"
            >
              <ArrowLeft size={14} strokeWidth={2} /> {ED.back}
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={save.isPending || (needsReason && !reason)}
              data-testid="edit-delivery-save"
              className="inline-flex h-7 items-center rounded-control bg-kit-blue-9 px-3 text-meta font-semibold text-white hover:opacity-90 disabled:opacity-40"
            >
              {save.isPending ? ED.saving : ED.save}
            </button>
          </div>
        }
      />

      <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 overflow-hidden p-2">
        {/* ── LEFT: the form ─────────────────────────────────────────────── */}
        <div
          className="flex min-h-0 flex-col gap-4 overflow-y-auto rounded-control border border-kit-slate-5 bg-white p-4"
          data-testid="edit-delivery-form"
        >
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-meta font-semibold uppercase tracking-wide text-kit-slate-11">
                {ED.salesHeading}
              </h2>
              {order ? (
                <div className="flex flex-wrap items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => navigate(`/operation/orders/so/${order.id}`)}
                    data-testid="edit-delivery-open-sales-order"
                    className="inline-flex items-center gap-1 text-meta font-medium text-blue-700 underline-offset-2 hover:underline"
                  >
                    {ED.openSalesOrder} <ExternalLink size={12} strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      navigate(
                        `/operation/orders/so/${encodeURIComponent(order.id)}?route=1`,
                      )
                    }
                    data-testid="edit-delivery-open-order-route"
                    className="inline-flex items-center gap-1 text-meta font-medium text-blue-700 underline-offset-2 hover:underline"
                  >
                    Open Order Route <ExternalLink size={12} strokeWidth={2} />
                  </button>
                </div>
              ) : null}
            </div>
            {/* READ-ONLY, and there is no input for any of it. Wrong facts are
                corrected at their owner, never here. */}
            <div className="grid grid-cols-2 gap-3">
              <Fact label={ED.customer} value={customer || null} />
              <Fact label={ED.phone} value={(order?.customer_phone as string | null) ?? null} />
              <Fact
                label={ED.location}
                value={
                  ((order?.customer_address as string | null) ??
                    [order?.customer_address_city, order?.customer_address_state]
                      .filter(Boolean)
                      .join(", ")) || null
                }
              />
              <Fact
                label={ED.building}
                value={((order as { building_type?: string } | undefined)?.building_type as string) ?? null}
              />
              <Fact
                label={ED.floor}
                value={
                  order?.delivery_floor != null ? String(order.delivery_floor) : null
                }
              />
              <Fact
                label={ED.lift}
                value={
                  order?.delivery_has_lift == null
                    ? null
                    : order.delivery_has_lift
                      ? ED.hasLift
                      : ED.noLift
                }
              />
              <Fact
                label={ED.customerDelivery}
                value={
                  order?.delivery_date_tbd
                    ? DATE_TO_BE_CONFIRMED_CELL
                    : order?.delivery_date
                      ? fmtDate(order.delivery_date)
                      : null
                }
              />
            </div>
          </section>

          <hr className="border-kit-slate-5" />

          <section className="flex flex-col gap-3">
            <h2 className="text-meta font-semibold uppercase tracking-wide text-kit-slate-11">
              {ED.deliveryHeading}
            </h2>

            <Field label={ED.partner}>
              <select
                className={INPUT}
                value={form.partnerId ?? ""}
                onChange={(e) => set("partnerId", e.target.value || null)}
                data-testid="edit-delivery-partner"
              >
                <option value="">{ED.none}</option>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>

            {chosenPartner && (
              <div
                className="flex flex-col gap-2 rounded-control border border-kit-slate-5 bg-white p-3"
                data-testid="edit-delivery-chase"
              >
                <span className="text-meta font-semibold text-kit-slate-12">
                  {ED.askPartner(chosenPartner.name)}
                </span>
                <pre
                  className="whitespace-pre-wrap font-sans text-meta text-kit-slate-11"
                  data-testid="edit-delivery-chase-message"
                >
                  {chaseMessage}
                </pre>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex h-7 items-center rounded-control border border-kit-slate-6 bg-white px-3 text-meta font-medium text-kit-slate-12 hover:bg-kit-slate-3"
                    onClick={copyChase}
                    data-testid="edit-delivery-copy-message"
                  >
                    {ED.copyMessage}
                  </button>
                  {chosenPartner.whatsapp_group_url ? (
                    <a
                      className="inline-flex h-7 items-center rounded-control border border-kit-slate-6 bg-white px-3 text-meta font-medium text-kit-slate-12 hover:bg-kit-slate-3"
                      href={chosenPartner.whatsapp_group_url}
                      target="_blank"
                      rel="noreferrer"
                      data-testid="edit-delivery-open-whatsapp"
                    >
                      {ED.openGroup}
                    </a>
                  ) : (
                    <span className="text-label text-kit-slate-9">{ED.groupNotSet}</span>
                  )}
                </div>
                <span className="text-label text-kit-amber-11">{ED.sentIsNotConfirmed}</span>
              </div>
            )}

            {needsReason && (
              <Field label={ED.reason}>
                <select
                  className={INPUT}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  data-testid="edit-delivery-reason"
                >
                  <option value="">{ED.pick}</option>
                  {CHANGE_LOGISTICS_REASONS.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label={ED.confirmedDate}>
                <input
                  type="date"
                  className={INPUT}
                  value={form.confirmedDate ?? ""}
                  onChange={(e) => set("confirmedDate", e.target.value || null)}
                  data-testid="edit-delivery-confirmed-date"
                />
              </Field>
              <Field label={ED.confirmedTime}>
                <input
                  className={INPUT}
                  placeholder={ED.noTime}
                  value={form.confirmedTime ?? ""}
                  onChange={(e) => set("confirmedTime", e.target.value || null)}
                  data-testid="edit-delivery-confirmed-time"
                />
              </Field>
              <Field label={ED.expectedArrival}>
                <input
                  type="time"
                  className={INPUT}
                  value={form.expectedArrival ?? ""}
                  onChange={(e) => set("expectedArrival", e.target.value || null)}
                  data-testid="edit-delivery-expected-arrival"
                />
              </Field>
              <Field label={ED.proof}>
                <div className="flex flex-col gap-1" data-testid="edit-delivery-proof">
                  <div className="flex items-center gap-2">
                    <label className="inline-flex h-7 cursor-pointer items-center rounded-control border border-kit-slate-6 bg-white px-3 text-meta font-medium text-kit-slate-12 hover:bg-kit-slate-3">
                      {form.replyProofPath ? ED.replaceReply : ED.uploadReply}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={uploadReply}
                        disabled={uploadBusy}
                        data-testid="edit-delivery-proof-upload"
                      />
                    </label>
                    {form.replyProofPath ? (
                      <span
                        className="text-label text-kit-slate-11"
                        data-testid="edit-delivery-proof-path"
                      >
                        {form.replyProofPath.split("/").pop()}
                      </span>
                    ) : (
                      <span className="text-label text-kit-slate-9">{ED.notRecorded}</span>
                    )}
                  </div>
                  {uploadError && (
                    <span className="text-label text-danger" data-testid="edit-delivery-proof-error">
                      {uploadError}
                    </span>
                  )}
                </div>
              </Field>
            </div>

            <Field label={ED.note}>
              <textarea
                rows={3}
                className="rounded-control border border-kit-slate-6 bg-white px-2 py-1.5 text-body text-kit-slate-12"
                value={form.logisticsNote ?? ""}
                onChange={(e) => set("logisticsNote", e.target.value || null)}
                data-testid="edit-delivery-note"
              />
            </Field>

            {isCondo && (
              <div className="grid grid-cols-2 gap-3" data-testid="edit-delivery-condo">
                <Field label={ED.driver} hint={ED.condoOnly}>
                  <input
                    className={INPUT}
                    value={form.driverName ?? ""}
                    onChange={(e) => set("driverName", e.target.value || null)}
                    data-testid="edit-delivery-driver"
                  />
                </Field>
                <Field label={ED.vehicle}>
                  <input
                    className={INPUT}
                    value={form.vehicle ?? ""}
                    onChange={(e) => set("vehicle", e.target.value || null)}
                    data-testid="edit-delivery-vehicle"
                  />
                </Field>
              </div>
            )}
          </section>
        </div>

        {/* ── RIGHT: the real document ───────────────────────────────────── */}
        <div
          className="flex min-h-0 flex-col rounded-control border border-kit-slate-5 bg-white"
          data-testid="edit-delivery-preview"
        >
          <div className="flex items-center justify-between border-b border-kit-slate-5 px-4 py-2">
            <h2 className="text-meta font-semibold uppercase tracking-wide text-kit-slate-11">
              {ED.previewHeading}
            </h2>
            <span className="text-meta text-kit-slate-11" data-testid="edit-delivery-preview-number">
              {(order?.do_number as string | null) ?? ED.previewNone}
            </span>
          </div>
          <div className="min-h-0 flex-1 bg-kit-slate-3">
            {previewUrl ? (
              <iframe
                title={ED.previewHeading}
                src={previewUrl}
                className="h-full w-full"
                data-testid="edit-delivery-preview-frame"
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="text-meta text-kit-slate-11">
                  {previewing ? ED.previewBuilding : ED.previewBuilding}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
