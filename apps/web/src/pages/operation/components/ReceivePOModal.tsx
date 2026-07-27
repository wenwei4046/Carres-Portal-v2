import { useMemo, useState } from "react";
import { toast } from "sonner";
import { poLineReportable } from "@carres/shared";
import { ApiError } from "@/lib/api";
import {
  useOperationReceiveThreads,
  useOperationThreadsForPo,
  useReceivePoWithDoMutation,
  type operationPoListRow,
  type SupplierRow,
} from "@/lib/queries";
import DOFileUploadField from "../../../components/DOFileUploadField";
import { INPUT_CLS, Modal, ModalActions } from "./Modal";

/**
 * ReceivePOModal — per spec §18.4 F5 (rich receive-PO dialog).
 *
 * Mirrors `reference/proto/operation-screens.jsx` `POReceiveDialog` (lines
 * 693-789):
 *   - Title: "Receive {po.id} · attach Supplier DO"
 *   - Intro: "Booking goods from {supplier} into {warehouse}. Tick or set the
 *     quantity for each SKU on this delivery — anything unreceived stays open
 *     on the PO."
 *   - Per-line table: checkbox + SKU name + ordered/already-received summary +
 *     pending qty + receive-now qty input
 *   - "Receive all pending" + "Clear" ghost buttons + Σ total footer
 *   - Required Supplier DO number input + optional receiving note textarea
 *   - Real DO file upload (PDF/JPG/PNG ≤ 10 MB) via DOFileUploadField, which
 *     hits POST /api/storage/dos/sign-upload and streams to the
 *     `delivery-orders` Supabase Storage bucket. The Phase-4-era
 *     "simulated DO PDF placeholder" was retired by Phase 4.5 Chunk 1
 *     Task 38 (spec §8.6 + §0.1).
 *   - Required "Goods inspected and DO signed by warehouse" checkbox
 *   - Primary CTA: "Mark received" (when all pending) / "Receive partial"
 *     (when only some) — disabled until DO# ≥ 3 chars + signed + total > 0
 *     + a real DO file path is captured from the upload field
 *
 * Wires to `POST /api/operation/pos/:id/receive` with a SINGLE batched payload
 * carrying every ticked line plus the captured DO file path and number. Server
 * calls v3 RPC `operation_receive_po_with_do` (0045) atomically — any line
 * failure rolls back the whole receive (closes carry-forward
 * `phase-4.5-chunk-1-receive-rpc-v3-swap`). The `receivedQty` per line is the
 * NEW TOTAL after this DO (existing.received_qty + recv[sku]); the RPC
 * computes delta internally and rejects decreases.
 *
 * 2026-05-15 (Task 12 of supplier-thread-pickup-plan): for own_logistics
 * suppliers (supplier.kind === "own_logistics"), the modal grows a second
 * section at the bottom that lists per-thread ready-for-pickup rows. The
 * operator multi-selects threads, captures one shared DO# + uploaded file +
 * optional note + signed checkbox, and POSTs them in a single batch to
 * `/api/operation/pos/:poId/receive-threads` (Task 5 endpoint, wraps RPC
 * `operation_receive_threads` from migration 0107). Each ticked thread gets
 * its `pickup_event_id` stamped, and the PO sup_status advances to
 * `delivered` (all threads received) or `partially_shipped` (some still
 * pending). This replaces the legacy whole-PO receive flow for own_logistics
 * suppliers — factory_pickup suppliers continue to use the per-line table
 * above. Both sections render in the same modal so the operator can pick the
 * flow that matches the actual DO they're holding. The new section is hidden
 * for factory_pickup suppliers AND for own_logistics POs with zero ready
 * threads (supplier hasn't marked any thread ready yet).
 *
 * 2026-07-27 (R1 of the receiving & claim queue, migration 0284): receiving is
 * an INSPECTION, not a checkbox. Each line now reports THREE numbers instead of
 * one — Receive now · Damaged · Wrong item — and the column that used to say
 * "Pending" says **Pending delivery** (Jess's locked vocabulary: the goods are
 * not missing, the supplier simply has not sent them). A damaged or wrong unit
 * is deliberately NOT received: it never enters stock and its qty stays pending,
 * because the supplier still owes a good one. One DO may never account for more
 * units than the line still owes — the inputs clamp to the remaining allowance
 * and the RPC refuses the rest (`report_exceeds_ordered`).
 */
interface Props {
  po: operationPoListRow;
  supplier: SupplierRow | undefined;
  warehouse: { id: string; name: string; address: string | null } | undefined;
  onClose: () => void;
}

function suggestDoNumber(): string {
  return "DO-" + (5200 + Math.floor(Math.random() * 800));
}

export default function ReceivePOModal({
  po,
  supplier,
  warehouse,
  onClose,
}: Props) {
  const lines = useMemo(() => po.purchase_order_lines ?? [], [po]);

  // 0076 (Loo 2026-05-10): per-LINE desired qty (keyed by line UUID, not
  // sku). Multi-variant POs may carry the same SKU twice with different
  // attrs — the sku-based key would collide. line.id is the post-migration
  // UUID PK and is unique per row.
  const [recv, setRecv] = useState<Record<string, number>>(() => {
    const o: Record<string, number> = {};
    for (const l of lines) {
      o[l.id] = Math.max(0, Number(l.qty || 0) - Number(l.received_qty || 0));
    }
    return o;
  });
  // R1: what THIS delivery found wrong, per line. Starts empty — a clean
  // delivery submits exactly the payload it always did.
  const [dmg, setDmg] = useState<Record<string, number>>({});
  const [wrong, setWrong] = useState<Record<string, number>>({});
  const [doNumber, setDoNumber] = useState(suggestDoNumber);
  const [doNote, setDoNote] = useState("");
  const [signed, setSigned] = useState(false);
  // Real DO file path captured from DOFileUploadField. The field uploads to
  // Supabase Storage first; the canonical path comes back here and rides the
  // single receive mutation call to the v3 RPC `operation_receive_po_with_do`
  // alongside the per-line received_qty totals.
  const [doFilePath, setDoFilePath] = useState<string | null>(null);

  const receive = useReceivePoWithDoMutation(po.id);

  // Task 12 — own_logistics per-thread flow. Fetch threads only when the
  // supplier is own_logistics; factory_pickup POs skip the round-trip
  // entirely. The query keys off the PO id and shares the supplierThreads
  // cache family with the supplier-side endpoint (same rows, just a different
  // role-gated reader).
  const isOwnLogistics = supplier?.kind === "own_logistics";
  const threadsQuery = useOperationThreadsForPo(po.id, { enabled: isOwnLogistics });
  const readyThreads = useMemo(
    () =>
      (threadsQuery.data ?? []).filter(
        (t) => t.supplier_ready_at !== null && t.pickup_event_id === null,
      ),
    [threadsQuery.data],
  );
  const [selectedThreadIds, setSelectedThreadIds] = useState<Set<string>>(
    new Set(),
  );
  const receiveThreads = useOperationReceiveThreads();

  const canReceiveThreads =
    doNumber.trim().length >= 3 &&
    signed &&
    !!doFilePath &&
    selectedThreadIds.size > 0 &&
    !receiveThreads.isPending;

  function toggleThread(id: string) {
    setSelectedThreadIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submitThreads() {
    if (!canReceiveThreads || !doFilePath) return;
    try {
      const res = await receiveThreads.mutateAsync({
        poId: po.id,
        threadIds: Array.from(selectedThreadIds),
        doNumber: doNumber.trim(),
        doFilePath,
        doNote: doNote.trim() || undefined,
      });
      toast.success(
        `${po.id} received · DO ${doNumber.trim()} · ${res.thread_count} thread${res.thread_count === 1 ? "" : "s"}`,
      );
      onClose();
    } catch (e: unknown) {
      if (e instanceof ApiError)
        toast.error(e.message || "Receive threads failed");
      else
        toast.error(e instanceof Error ? e.message : "Receive threads failed");
    }
  }

  const totalReceiving = Object.values(recv).reduce((s, n) => s + (n || 0), 0);
  const totalDamaged = Object.values(dmg).reduce((s, n) => s + (n || 0), 0);
  const totalWrong = Object.values(wrong).reduce((s, n) => s + (n || 0), 0);
  const totalIssue = totalDamaged + totalWrong;
  const totalPending = lines.reduce((s, l) => s + poLineReportable(l), 0);
  const valid =
    doNumber.trim().length >= 3 &&
    signed &&
    // R1: a delivery where EVERYTHING arrived broken is still a delivery worth
    // recording, so an issue-only DO may be submitted.
    totalReceiving + totalIssue > 0 &&
    !!doFilePath &&
    !receive.isPending;

  /** R1: the three numbers share one budget — a DO may never account for more
   *  units than the line still owes. `field` is the one being typed into; the
   *  other two are what it has to leave room for. */
  function allowance(id: string, pending: number, field: "recv" | "dmg" | "wrong") {
    const used =
      (field === "recv" ? 0 : recv[id] || 0) +
      (field === "dmg" ? 0 : dmg[id] || 0) +
      (field === "wrong" ? 0 : wrong[id] || 0);
    return Math.max(0, pending - used);
  }
  function setLine(id: string, val: number, pending: number) {
    const max = allowance(id, pending, "recv");
    setRecv((prev) => ({ ...prev, [id]: Math.max(0, Math.min(max, val)) }));
  }
  /** Reporting a problem TAKES its units from Receive-now, which was
   *  auto-filled rather than typed. The operator says "2 of these are broken"
   *  and the good count follows by itself — the alternative (silently
   *  clamping the damaged box back to 0 because Receive-now already claims
   *  every unit) is the kind of trap a low-computer-literate operator has no
   *  way to diagnose. */
  function setDamaged(id: string, val: number, pending: number) {
    const max = Math.max(0, pending - (wrong[id] || 0));
    const next = Math.max(0, Math.min(max, val));
    setDmg((prev) => ({ ...prev, [id]: next }));
    setRecv((prev) => ({
      ...prev,
      [id]: Math.min(prev[id] || 0, Math.max(0, pending - next - (wrong[id] || 0))),
    }));
  }
  function setWrongItem(id: string, val: number, pending: number) {
    const max = Math.max(0, pending - (dmg[id] || 0));
    const next = Math.max(0, Math.min(max, val));
    setWrong((prev) => ({ ...prev, [id]: next }));
    setRecv((prev) => ({
      ...prev,
      [id]: Math.min(prev[id] || 0, Math.max(0, pending - next - (dmg[id] || 0))),
    }));
  }
  function receiveAllPending() {
    const o: Record<string, number> = {};
    for (const l of lines) {
      // Whatever is already reported as a problem is NOT arriving good, so
      // "all pending" means all the rest.
      o[l.id] = Math.max(
        0,
        poLineReportable(l) - (dmg[l.id] || 0) - (wrong[l.id] || 0),
      );
    }
    setRecv(o);
  }
  function clearAll() {
    const zero = Object.fromEntries(lines.map((l) => [l.id, 0]));
    setRecv(zero);
    setDmg({});
    setWrong({});
  }

  async function submit() {
    if (!valid || !doFilePath) return;
    try {
      // v3 batched call: build lines as { id, receivedQty: NEW TOTAL }. The
      // recv[id] state holds "qty to add on this DO" (a delta from existing
      // received_qty); the v3 RPC expects the new total after this DO and
      // computes delta internally. Submit only ticked lines (qty > 0); the
      // RPC rejects empty arrays with detail='lines_empty', which we already
      // guard via `totalReceiving > 0` in `valid`.
      // 0076 (Loo 2026-05-10): payload now keys by line UUID `id` instead of
      // sku — multi-variant POs can carry the same SKU twice with different
      // attrs and the RPC needs the unambiguous lookup key.
      // R1: a line rides the payload when it received something OR when the
      // inspection found something wrong with it — an all-broken delivery has
      // a delta of 0 and still has to be recorded.
      const tickedLines = lines
        .map((l) => ({
          id: l.id,
          receivedQty: Number(l.received_qty || 0) + (recv[l.id] || 0),
          damagedQty: dmg[l.id] || 0,
          wrongItemQty: wrong[l.id] || 0,
          delta: recv[l.id] || 0,
        }))
        .filter((x) => x.delta > 0 || x.damagedQty > 0 || x.wrongItemQty > 0)
        .map(({ id, receivedQty, damagedQty, wrongItemQty }) => ({
          id,
          receivedQty,
          // Omitted when clean, so a normal delivery sends byte-for-byte the
          // payload it sent before R1 (the RPC reads an absent key as 0).
          ...(damagedQty > 0 ? { damagedQty } : {}),
          ...(wrongItemQty > 0 ? { wrongItemQty } : {}),
        }));
      await receive.mutateAsync({
        doNumber: doNumber.trim(),
        doFilePath,
        lines: tickedLines,
      });
      const allReceived = totalReceiving === totalPending;
      const issueBit =
        totalIssue > 0
          ? ` · issue: ${[
              totalDamaged > 0 ? `${totalDamaged} damaged` : null,
              totalWrong > 0 ? `${totalWrong} wrong item` : null,
            ]
              .filter(Boolean)
              .join(" · ")}`
          : "";
      toast.success(
        allReceived
          ? `${po.id} received · DO ${doNumber.trim()} · ${totalReceiving} unit${totalReceiving === 1 ? "" : "s"}${issueBit}`
          : `${po.id} partial · DO ${doNumber.trim()} · ${totalReceiving} unit${totalReceiving === 1 ? "" : "s"} booked${issueBit}`,
      );
      onClose();
    } catch (e: unknown) {
      if (e instanceof ApiError) toast.error(e.message || "Receive failed");
      else toast.error(e instanceof Error ? e.message : "Receive failed");
    }
  }

  return (
    <Modal
      title={`Receive ${po.id} · attach Supplier DO`}
      onClose={onClose}
      size="lg"
    >
      <div className="text-[12px] text-base-600 mb-3.5 font-body">
        Booking goods from <strong>{supplier?.name ?? "supplier"}</strong> into{" "}
        <strong>{warehouse?.name ?? "warehouse"}</strong>. Check each SKU on this
        delivery: how many arrived good, how many arrived damaged, how many are
        the wrong item. Anything not received stays pending delivery on the PO.
      </div>

      {/* Per-line receive grid — R1: an inspection, not a checkbox. */}
      <div className="card p-0 mb-3.5" data-testid="receive-po-lines-table">
        <div
          className="grid items-center gap-2 px-3.5 py-2.5 bg-base-50 border-b border-base-100"
          style={{ gridTemplateColumns: "28px 1fr 76px 78px 72px 76px" }}
        >
          <div></div>
          <div className="label">SKU</div>
          <div className="label text-right">Pending delivery</div>
          <div className="label text-right">Receive now</div>
          <div className="label text-right">Damaged</div>
          <div className="label text-right">Wrong item</div>
        </div>
        {lines.map((l) => {
          const pending = poLineReportable(l);
          const checked = (recv[l.id] || 0) > 0;
          const disabled = pending === 0;
          // 0076 (2026-05-10): variant suffix (e.g. "Natural Oak · 12\"")
          // distinguishes multi-variant lines that share the same SKU.
          const attrs = l.attrs as Record<string, unknown> | null | undefined;
          const variantBits: string[] = [];
          if (attrs) {
            if (typeof attrs.color === "string") variantBits.push(attrs.color);
            if (typeof attrs.gap === "string") variantBits.push(attrs.gap);
            if (typeof attrs.fabric_name === "string") variantBits.push(attrs.fabric_name);
          }
          const variantLabel = variantBits.length > 0 ? variantBits.join(" · ") : null;
          return (
            <label
              key={l.id}
              className={`grid items-center gap-2 px-3.5 py-2.5 border-t border-base-100 ${disabled ? "opacity-50" : "cursor-pointer"}`}
              style={{ gridTemplateColumns: "28px 1fr 76px 78px 72px 76px" }}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={(e) =>
                  setLine(
                    l.id,
                    e.target.checked
                      ? allowance(l.id, pending, "recv")
                      : 0,
                    pending,
                  )
                }
                className="accent-primary"
                aria-label={`Tick ${l.sku} to receive`}
              />
              <div>
                <div className="text-[12px] font-body">{l.sku}</div>
                {variantLabel && (
                  <div className="text-[10.5px] text-base-700 font-body">
                    {variantLabel}
                  </div>
                )}
                <div className="font-mono text-[10px] text-base-500 mt-0.5">
                  Ordered {l.qty} · already received {l.received_qty}
                </div>
              </div>
              <div className="font-mono text-[12px] text-right font-semibold">
                {pending}
              </div>
              <input
                type="number"
                min={0}
                max={allowance(l.id, pending, "recv")}
                value={recv[l.id] || 0}
                disabled={disabled}
                onChange={(e) =>
                  setLine(l.id, parseInt(e.target.value, 10) || 0, pending)
                }
                aria-label={`Receive qty for ${l.sku}`}
                className="px-2 py-1.5 border border-base-300 rounded-[4px] text-[12px] text-right bg-white outline-none focus:border-base-500"
              />
              {/* R1: the two inspection numbers. Neither books stock — they
                  keep their qty in Pending delivery until the supplier
                  replaces the unit. */}
              <input
                type="number"
                min={0}
                max={allowance(l.id, pending, "dmg")}
                value={dmg[l.id] || 0}
                disabled={disabled}
                onChange={(e) =>
                  setDamaged(l.id, parseInt(e.target.value, 10) || 0, pending)
                }
                aria-label={`Damaged qty for ${l.sku}`}
                data-testid={`receive-damaged-${l.sku}`}
                className="px-2 py-1.5 border border-base-300 rounded-[4px] text-[12px] text-right bg-white outline-none focus:border-base-500"
              />
              <input
                type="number"
                min={0}
                max={allowance(l.id, pending, "wrong")}
                value={wrong[l.id] || 0}
                disabled={disabled}
                onChange={(e) =>
                  setWrongItem(l.id, parseInt(e.target.value, 10) || 0, pending)
                }
                aria-label={`Wrong item qty for ${l.sku}`}
                data-testid={`receive-wrong-${l.sku}`}
                className="px-2 py-1.5 border border-base-300 rounded-[4px] text-[12px] text-right bg-white outline-none focus:border-base-500"
              />
            </label>
          );
        })}
        <div className="flex justify-between items-center px-3.5 py-2 bg-base-50 border-t border-base-100">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={receiveAllPending}
              className="btn-ghost text-[11px] py-0.5 px-2"
            >
              Receive all pending
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="btn-ghost text-[11px] py-0.5 px-2"
            >
              Clear
            </button>
          </div>
          <div
            className="font-mono text-[11px] font-semibold"
            data-testid="receive-po-totals"
          >
            {/* R1: the footer speaks the same three words as the columns —
                received / damaged / wrong item — so the operator never has to
                map one vocabulary onto another. */}
            Σ {totalReceiving} received
            {totalDamaged > 0 ? ` · ${totalDamaged} damaged` : ""}
            {totalWrong > 0 ? ` · ${totalWrong} wrong item` : ""} this DO
          </div>
        </div>
      </div>

      {totalIssue > 0 && (
        <div
          className="text-[11px] text-base-600 mb-3.5 font-body px-3 py-2 border border-dashed border-base-300 rounded-[4px]"
          data-testid="receive-po-issue-note"
        >
          Damaged and wrong-item units are not booked into stock. Their qty stays{" "}
          <strong>pending delivery</strong> until the supplier sends good ones.
        </div>
      )}

      <div className="grid gap-3 mb-4">
        <div>
          <label className="label mb-1.5 block" htmlFor="receive-do-number">
            Supplier DO number *
          </label>
          <input
            id="receive-do-number"
            value={doNumber}
            onChange={(e) => setDoNumber(e.target.value)}
            className={INPUT_CLS}
          />
          <div className="text-[10px] text-base-500 mt-1 font-body">
            From the signed delivery order accompanying the goods.
          </div>
        </div>
        <div>
          <label className="label mb-1.5 block" htmlFor="receive-do-note">
            Receiving note (optional)
          </label>
          <textarea
            id="receive-do-note"
            rows={2}
            value={doNote}
            onChange={(e) => setDoNote(e.target.value)}
            placeholder="e.g. 2 cartons short · damage to packaging on unit 4"
            className={`${INPUT_CLS} resize-y`}
          />
        </div>
        <div className="px-3 py-2.5 border border-dashed border-base-300 rounded-[4px] bg-white">
          <div className="text-[11px] text-base-600 mb-2 font-body">
            Attach signed DO file{" "}
            <span className="text-base-400">(PDF/JPG/PNG · ≤10 MB)</span>
          </div>
          <DOFileUploadField
            poId={po.id}
            doNumber={doNumber}
            onUploaded={(path) => setDoFilePath(path)}
          />
        </div>
        <label className="flex gap-2 items-center px-3 py-2.5 border border-dashed border-base-300 rounded-[4px] cursor-pointer">
          <input
            type="checkbox"
            checked={signed}
            onChange={(e) => setSigned(e.target.checked)}
            className="accent-primary"
          />
          <span className="text-[12px] font-body">
            Goods inspected and DO signed by warehouse
          </span>
        </label>
      </div>

      {/* Task 12 (2026-05-15) — own_logistics per-thread receive section.
          Visible only for own_logistics suppliers WITH 1+ ready-but-not-
          yet-picked-up threads. Re-uses the DO# / note / file / signed
          fields above (own_logistics receive batches all selected threads
          under one DO). factory_pickup POs skip this section entirely; the
          per-line table + ModalActions footer button remain the only path. */}
      {isOwnLogistics && readyThreads.length > 0 && (
        <section
          className="card p-3.5 mb-3.5 border-base-200"
          data-testid="receive-po-ready-threads-section"
        >
          <h3 className="text-[10px] uppercase tracking-[0.12em] text-base-500 mb-2 font-body">
            Ready threads ({readyThreads.length})
          </h3>
          <div className="grid gap-1">
            {readyThreads.map((t) => (
              <label
                key={t.id}
                className="flex items-center gap-2 py-1 cursor-pointer"
                data-testid={`receive-po-ready-thread-${t.id}`}
              >
                <input
                  type="checkbox"
                  checked={selectedThreadIds.has(t.id)}
                  onChange={() => toggleThread(t.id)}
                  className="accent-primary"
                  aria-label={`Tick thread for SO-${t.order_dl}`}
                />
                <span className="text-[12px] font-body">
                  SO-{t.order_dl}
                  {t.customer_name ? ` · ${t.customer_name}` : ""}
                </span>
              </label>
            ))}
          </div>
          <div className="flex justify-end mt-3">
            <button
              type="button"
              onClick={submitThreads}
              disabled={!canReceiveThreads}
              className="btn-primary text-[12px] disabled:opacity-40"
              data-testid="receive-po-receive-threads-btn"
            >
              {receiveThreads.isPending
                ? "Receiving…"
                : `Receive ${selectedThreadIds.size} thread${selectedThreadIds.size === 1 ? "" : "s"}`}
            </button>
          </div>
        </section>
      )}

      <ModalActions
        onCancel={onClose}
        onPrimary={submit}
        primary={
          totalIssue > 0
            ? "Receive · report issue"
            : totalReceiving === totalPending
              ? "Mark received"
              : "Receive partial"
        }
        primaryDisabled={!valid}
        primaryPending={receive.isPending}
      />
    </Modal>
  );
}
