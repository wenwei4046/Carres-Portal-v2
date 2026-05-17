import { useEffect, useState } from "react";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/lib/api";
import { renderPoPdf } from "@/lib/pdf/render";
import type { PoTemplateData } from "@/lib/pdf/types";
import {
  useAssignPickupPartnerMutation,
  useDeliveryPartners,
  useOperationWarehouse,
  type operationPoListRow,
  type SupplierRow,
} from "@/lib/queries";
import { INPUT_CLS, Modal, ModalActions } from "./Modal";

/**
 * AssignPickupDialog — F1.A factory_pickup flow.
 *
 * Mirrors `reference/proto/operation-screens.jsx` `AssignPickupDialog`
 * (lines 645-691):
 *   - Title: "Assign pickup partner · {po.id}"
 *   - Intro: "{supplier.name} has {N} unit(s) ready for collection. Choose a
 *     partner to dispatch to their factory."
 *   - Optional warning band when `po.pickupRejection` exists ("Previous partner
 *     declined") — Phase 7 surface; renders if the field happens to be present.
 *   - Pickup details card (base-50 fill): "From {supplier}", "To {warehouse}",
 *     SKU summary
 *   - Required partner select (`{name} · {zones}` labels) — v3-S3.4 appends a
 *     synthetic last option `+ Outsource (one-time)` (value `__OUTSOURCE__`).
 *   - Selected partner preview (base-50 fill): bold name + mono contact + zones
 *   - v3-S3.4 — Outsource form (visible only when Outsource picked): name *,
 *     contact *, zones (optional). On submit, body sends the outsource trio
 *     INSTEAD of `partnerId`. Hono bridges via direct PO UPDATE; v3-S4 swaps
 *     to `operation_assign_partner_and_dispatch`.
 *   - v3-S2.4 — Required destination warehouse picker (defaults to
 *     `po.warehouse_id`; operation can override for divert-on-the-fly).
 *   - Selected warehouse preview card (mirrors the partner preview)
 *   - Primary CTA: "Assign partner" — disabled until either:
 *      (a) a registered partner + warehouse, OR
 *      (b) outsource name + outsource contact + warehouse.
 *
 * Wires to `POST /api/operation/pos/:id/assign-pickup-partner`. The
 * `warehouseId` is forwarded on the request body — the Hono route currently
 * captures it but does NOT pass it to the underlying RPC (per v3 spec §8.1
 * the eventual RPC `operation_assign_partner_and_dispatch` is v3-S4 work).
 * This component is forward-compatible: when the new RPC ships, no FE change
 * is needed.
 *
 * v3-S3.4 spec §8.3 — Print DO toast: after a successful outsource submit,
 * a toast shows a "Print DO for [name]" button. Click → fetches the existing
 * `GET /api/operation/pos/:id/print` PDF (with Authorization Bearer JWT) and
 * opens it in a new tab. Mirrors PoDetailModal.handlePrint.
 */
const OUTSOURCE_OPTION_VALUE = "__OUTSOURCE__";
interface Props {
  po: operationPoListRow;
  supplier: SupplierRow | undefined;
  warehouse: { id: string; name: string; address: string | null } | undefined;
  onClose: () => void;
}

export default function AssignPickupDialog({
  po,
  supplier,
  warehouse,
  onClose,
}: Props) {
  const partnersQ = useDeliveryPartners();
  const partners = partnersQ.data?.partners ?? [];
  const [partnerId, setPartnerId] = useState<string>("");
  const assign = useAssignPickupPartnerMutation(po.id);

  // v3-S3.4 — outsource form state. Lives alongside partnerId; the partner
  // <select>'s synthetic '__OUTSOURCE__' option flips between paths.
  const [outsourceName, setOutsourceName] = useState<string>("");
  const [outsourceContact, setOutsourceContact] = useState<string>("");
  const [outsourceZones, setOutsourceZones] = useState<string>("");
  const isOutsource = partnerId === OUTSOURCE_OPTION_VALUE;

  // v3-S2.4 — destination warehouse picker: default to the PO's current
  // destination, but allow override (e.g. divert when origin WH is full).
  const warehousesQ = useOperationWarehouse();
  const warehouses = warehousesQ.data?.warehouses ?? [];
  const [warehouseId, setWarehouseId] = useState<string>("");

  useEffect(() => {
    if (!partnerId && partners.length > 0) setPartnerId(partners[0].id);
  }, [partnerId, partners]);

  // Initialize warehouse selection once the list loads. Prefer the PO's own
  // warehouse_id when it appears in the response; otherwise fall back to the
  // first available warehouse so the form is still submittable.
  useEffect(() => {
    if (warehouseId || warehouses.length === 0) return;
    const match = warehouses.find((w) => w.id === po.warehouse_id);
    setWarehouseId(match ? match.id : warehouses[0].id);
  }, [warehouseId, warehouses, po.warehouse_id]);

  const partner = partners.find((p) => p.id === partnerId);
  const selectedWarehouse = warehouses.find((w) => w.id === warehouseId);
  const lines = po.purchase_order_lines ?? [];
  const totalUnits = lines.reduce((s, l) => s + Number(l.qty || 0), 0);

  // Validity: warehouse always required. For partner path, partnerId must be a
  // real (non-synthetic) partner. For outsource path, name + contact required.
  const validPartnerPath =
    !!partnerId && partnerId !== OUTSOURCE_OPTION_VALUE && !!warehouseId;
  const validOutsourcePath =
    isOutsource &&
    outsourceName.trim().length > 0 &&
    outsourceContact.trim().length > 0 &&
    !!warehouseId;
  const valid = (validPartnerPath || validOutsourcePath) && !assign.isPending;

  // v3-S3.4 spec §8.3 — Print DO for outsource.
  // 2026-05-12 (Loo): server returns JSON; @react-pdf renders client-side.
  async function printDoForOutsource(name: string) {
    try {
      const data = await apiFetch<PoTemplateData>(
        `/api/operation/pos/${po.id}/print-data`,
      );
      const blob = await renderPoPdf(data);
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank", "noopener,noreferrer");
      if (!win) {
        const a = document.createElement("a");
        a.href = url;
        a.download = `${po.id}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : `Print DO for ${name} failed`,
      );
    }
  }

  async function submit() {
    if (!valid) return;
    try {
      if (isOutsource) {
        const payload: {
          outsourcePartnerName: string;
          outsourcePartnerContact: string;
          outsourcePartnerZones?: string;
          warehouseId: string;
        } = {
          outsourcePartnerName: outsourceName.trim(),
          outsourcePartnerContact: outsourceContact.trim(),
          warehouseId,
        };
        const trimmedZones = outsourceZones.trim();
        if (trimmedZones) payload.outsourcePartnerZones = trimmedZones;
        await assign.mutateAsync(payload);
        // v3-S3.4 §8.3 — Print DO toast. Toast lifetime defaults to a few
        // seconds; the action button gives operation one click to grab the
        // PDF for the ad-hoc transporter.
        const name = outsourceName.trim();
        toast.success(`${po.id} assigned to ${name} (outsource)`, {
          action: {
            label: `Print DO for ${name}`,
            onClick: () => {
              void printDoForOutsource(name);
            },
          },
        });
        onClose();
        return;
      }
      // Partner path (unchanged from v3-S2.4).
      await assign.mutateAsync({ partnerId, warehouseId });
      toast.success(
        `${po.id} assigned${partner ? ` to ${partner.name}` : ""} · awaiting their accept`,
      );
      onClose();
    } catch (e: unknown) {
      if (e instanceof ApiError) toast.error(e.message || "Assign partner failed");
      else toast.error(e instanceof Error ? e.message : "Assign partner failed");
    }
  }

  return (
    <Modal title={`Assign pickup partner · ${po.id}`} onClose={onClose}>
      <div className="text-[12px] text-base-600 mb-3.5 font-body">
        <strong>{supplier?.name ?? "Supplier"}</strong> has {totalUnits} unit
        {totalUnits === 1 ? "" : "s"} ready for collection. Choose a partner to
        dispatch to their factory.
      </div>

      <div
        className="card mb-3.5 px-3.5 py-2.5"
        style={{ background: "var(--base-50)" }}
      >
        <div className="label mb-1.5">Pickup details</div>
        <div className="text-[12px] font-body">
          From <strong>{supplier?.name ?? "Supplier"}</strong>
        </div>
        <div className="text-[12px] font-body mt-0.5">
          To <strong>{warehouse?.name ?? "Warehouse"}</strong>
        </div>
        <div className="font-mono text-[11px] text-base-500 mt-1.5">
          {lines.map((l) => `${l.sku} ×${l.qty}`).join(" · ") || "—"}
        </div>
      </div>

      <div className="label mb-1.5">Delivery partner *</div>
      {partnersQ.isLoading ? (
        <div className="text-[12px] text-base-500 mb-3.5">Loading partners…</div>
      ) : partnersQ.isError ? (
        <div className="text-[12px] text-destructive mb-3.5">
          Couldn&rsquo;t load partners — try again later.
        </div>
      ) : partners.length === 0 ? (
        <div className="text-[12px] text-warning mb-3.5">
          No delivery partners on file.
        </div>
      ) : (
        <select
          value={partnerId}
          onChange={(e) => setPartnerId(e.target.value)}
          aria-label="Delivery partner"
          className={`${INPUT_CLS} mb-3.5`}
        >
          {partners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.zones ? ` · ${p.zones}` : ""}
            </option>
          ))}
          {/* v3-S3.4 — synthetic last option for one-shot outsource transporters
              (spec §8.2). Selecting it hides the partner preview and reveals
              the outsource form below. */}
          <option value={OUTSOURCE_OPTION_VALUE}>
            + Outsource (one-time)
          </option>
        </select>
      )}

      {!isOutsource && partner && (
        <div className="text-[12px] text-base-600 px-3 py-2.5 bg-base-50 rounded-[4px] mb-3.5">
          <div>
            <strong>{partner.name}</strong>
          </div>
          {partner.contact && (
            <div className="mt-1">
              Contact: <span className="font-mono">{partner.contact}</span>
            </div>
          )}
          {partner.zones && <div>Zones: {partner.zones}</div>}
        </div>
      )}

      {/*
       * v3-S3.4 — Outsource form (spec §8.2). Visible only when the synthetic
       * '+ Outsource (one-time)' option is picked. Name + contact are
       * required; zones is optional. Submit gates on these via `validOutsourcePath`.
       */}
      {isOutsource && (
        <div
          className="px-3 py-2.5 bg-base-50 rounded-[4px] mb-3.5"
          data-testid="assign-pickup-outsource-form"
        >
          <div className="label mb-1.5">
            Outsource partner name <span className="text-destructive">*</span>
          </div>
          <input
            type="text"
            value={outsourceName}
            onChange={(e) => setOutsourceName(e.target.value)}
            aria-label="Outsource partner name"
            className={`${INPUT_CLS} mb-3`}
            placeholder="e.g. Ah Beng Lorry"
          />
          <div className="label mb-1.5">
            Contact (phone/email) <span className="text-destructive">*</span>
          </div>
          <input
            type="text"
            value={outsourceContact}
            onChange={(e) => setOutsourceContact(e.target.value)}
            aria-label="Contact (phone/email)"
            className={`${INPUT_CLS} mb-3`}
            placeholder="+60 12-345 6789"
          />
          <div className="label mb-1.5">Zones / area covered</div>
          <input
            type="text"
            value={outsourceZones}
            onChange={(e) => setOutsourceZones(e.target.value)}
            aria-label="Zones / area covered"
            className={`${INPUT_CLS}`}
            placeholder="e.g. Klang Valley"
          />
        </div>
      )}

      {/*
       * v3-S2.4 — destination warehouse picker. Layout mirrors the partner
       * select pattern above (label · input · preview card) for consistency.
       * Defaults to po.warehouse_id; operation can override when the original
       * destination is full or otherwise unavailable.
       */}
      <div className="label mb-1.5">
        Destination warehouse <span className="text-destructive">*</span>
      </div>
      {warehousesQ.isLoading ? (
        <div className="text-[12px] text-base-500 mb-3.5">
          Loading warehouses…
        </div>
      ) : warehousesQ.isError ? (
        <div className="text-[12px] text-destructive mb-3.5">
          Couldn&rsquo;t load warehouses — try again later.
        </div>
      ) : warehouses.length === 0 ? (
        <div className="text-[12px] text-warning mb-3.5">
          No warehouses on file.
        </div>
      ) : (
        <select
          value={warehouseId}
          onChange={(e) => setWarehouseId(e.target.value)}
          aria-label="Destination warehouse"
          className={`${INPUT_CLS} mb-3.5`}
        >
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      )}

      {selectedWarehouse && (
        <div
          className="text-[12px] text-base-600 px-3 py-2.5 bg-base-50 rounded-[4px] mb-3.5"
          data-testid="assign-pickup-warehouse-preview"
        >
          <div>
            <strong>{selectedWarehouse.name}</strong>
          </div>
          {selectedWarehouse.address && (
            <div className="font-mono text-[11px] mt-1">
              {selectedWarehouse.address}
            </div>
          )}
        </div>
      )}

      <ModalActions
        onCancel={onClose}
        onPrimary={submit}
        primary="Assign partner"
        primaryDisabled={
          !valid || partners.length === 0 || warehouses.length === 0
        }
        primaryPending={assign.isPending}
      />
    </Modal>
  );
}
