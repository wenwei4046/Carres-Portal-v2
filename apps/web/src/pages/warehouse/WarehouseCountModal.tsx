import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  receivingProblemCopy,
  receivingUnitIdProblems,
  warehouseReceiptProblems,
  warehouseReceiptProblemText,
  wrongItemClaimTypesFor,
  type WarehouseIncomingPo,
  type WarehouseReceiptLine,
  type WarehouseReceiptLineDraft,
  type ReceivingLineInput,
} from "@carres/shared";
import { ApiError } from "@/lib/api";
import { useWarehouseSubmitReceiptMutation } from "@/lib/queries";
import ClaimPhotoUploadField from "@/components/ClaimPhotoUploadField";
import DOFileUploadField from "@/components/DOFileUploadField";
import {
  INPUT_CLS,
  Modal,
  ModalActions,
} from "@/pages/operation/components/Modal";

/**
 * WarehouseCountModal — R6: the receiving form, in the warehouse's own hands.
 *
 * This is the warehouse physical count: distinct quantity facts per line under a
 * **Pending delivery** column, and a claim panel that appears the moment a
 * problem is reported (R2's evidence law, asked by R2's own shared function).
 * The card says the inspection form must exist and be proven by ops first —
 * it does, so this screen ASSEMBLES it rather than inventing a second one.
 *
 * ── What is different from the ops modal, and why ────────────────────────────
 *
 * 1. **Nothing moves when this is saved.** The count is filed; Carres checks it
 *    in, and that check-in is what replays it through the receive engine. The
 *    footer says so in one sentence, because a warehouse clerk who believes the
 *    stock has moved will not chase the PO that is still open.
 * 2. **No "goods inspected" tick-box.** COPY-STANDARD's no-decorative-checkbox
 *    law: a box that only records "I say I did it" is banned. The photo of the
 *    signed DO is the evidence, and it is required.
 * 3. **`receivedNow` is a DELTA.** The warehouse counts THIS truck; the running
 *    total is worked out at check-in, against the line as it stands then.
 *    Storing a total would be right when it was typed and wrong when it was
 *    replayed.
 *
 * The word `Receive` does not appear as a verb anywhere on this screen —
 * COPY-STANDARD pins the arrival of goods to `Check in`, and that is ops's move,
 * not this one.
 *
 * **R8 (2026-07-28): the footer button is `Return count to Carres`, not
 * `Save count`.** R6 reached for the form law ("a button that merely stores what
 * you typed is `Save`") and reported it; Loo ruled that this one does not merely
 * store — it hands the count to Carres and the state becomes `Waiting Carres
 * check`. A button that changes whose problem something is has never been a
 * `Save`. The four strings are in COPY-STANDARD's "warehouse count words".
 */
interface Props {
  po: WarehouseIncomingPo;
  onClose: () => void;
}

const GRID = "minmax(150px,1fr) repeat(6,82px)";

function storedLine(po: WarehouseIncomingPo, lineId: string) {
  return po.open_receipt?.lines.find((line) =>
    ("poLineId" in line ? line.poLineId : line.id) === lineId,
  ) ?? null;
}

function storedQty(line: WarehouseReceiptLine | ReceivingLineInput | null, current: keyof ReceivingLineInput, legacy: keyof WarehouseReceiptLine | null): number {
  if (!line) return 0;
  if ("poLineId" in line) return Number(line[current]) || 0;
  return legacy ? Number(line[legacy]) || 0 : 0;
}

export default function WarehouseCountModal({ po, onClose }: Props) {
  const lines = po.lines ?? [];

  const [recv, setRecv] = useState<Record<string, number>>(() => Object.fromEntries(lines.map((line) => [line.id, storedQty(storedLine(po, line.id), "receivedQty", "received_now")])));
  const [dmg, setDmg] = useState<Record<string, number>>(() => Object.fromEntries(lines.map((line) => [line.id, storedQty(storedLine(po, line.id), "damagedQty", "damaged_qty")])));
  const [wrong, setWrong] = useState<Record<string, number>>(() => Object.fromEntries(lines.map((line) => [line.id, storedQty(storedLine(po, line.id), "wrongItemQty", "wrong_item_qty")])));
  const [extra, setExtra] = useState<Record<string, number>>(() => Object.fromEntries(lines.map((line) => [line.id, storedQty(storedLine(po, line.id), "extraQty", null)])));
  const [unitIds, setUnitIds] = useState<Record<string, string[]>>(() => Object.fromEntries(lines.map((line) => {
    const stored = storedLine(po, line.id);
    return [line.id, stored && "poLineId" in stored ? [...stored.unitIds] : []];
  })));
  const [dmgPhotos, setDmgPhotos] = useState<Record<string, string[]>>(() => Object.fromEntries(lines.map((line) => {
    const stored = storedLine(po, line.id);
    return [line.id, stored && "poLineId" in stored ? [...stored.damagedPhotos] : []];
  })));
  const [wrongType, setWrongType] = useState<Record<string, string>>(() => Object.fromEntries(lines.map((line) => {
    const stored = storedLine(po, line.id);
    return [line.id, stored && "poLineId" in stored ? stored.wrongItemReason ?? "" : stored?.wrong_item_claim_type ?? ""];
  })));
  const [wrongPhotos, setWrongPhotos] = useState<Record<string, string[]>>(() => Object.fromEntries(lines.map((line) => {
    const stored = storedLine(po, line.id);
    return [line.id, stored && "poLineId" in stored ? [...stored.wrongItemPhotos] : []];
  })));
  const [extraEvidence, setExtraEvidence] = useState<Record<string, string[]>>(() => Object.fromEntries(lines.map((line) => {
    const stored = storedLine(po, line.id);
    return [line.id, stored && "poLineId" in stored ? [...stored.extraEvidence] : []];
  })));
  const [doNumber, setDoNumber] = useState(po.open_receipt?.do_number ?? "");
  const [note, setNote] = useState(po.open_receipt?.note ?? "");
  const [doFilePath, setDoFilePath] = useState<string | null>(po.open_receipt?.do_file_path ?? null);
  const [goodsReceivedAt, setGoodsReceivedAt] = useState(() => {
    const value = po.open_receipt?.goods_received_timestamp;
    if (!value) return "";
    const date = new Date(value);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
  });

  const submit = useWarehouseSubmitReceiptMutation();

  /** What the line still owes. Derived, never stored — the same arithmetic R1
   *  uses, so this form and the PO row can never disagree. */
  function pendingOf(l: { qty: number; received_qty: number }): number {
    return Math.max(0, Number(l.qty || 0) - Number(l.received_qty || 0));
  }

  const draftLines: WarehouseReceiptLineDraft[] = useMemo(
    () =>
      lines.map((l) => ({
        id: l.id,
        sku: l.sku,
        pendingDelivery: pendingOf(l),
        receivedNow: recv[l.id] || 0,
        damagedQty: dmg[l.id] || 0,
        damagedPhotos: dmgPhotos[l.id] ?? [],
        wrongItemQty: wrong[l.id] || 0,
        wrongItemClaimType: wrongType[l.id] ?? null,
        wrongItemPhotos: wrongPhotos[l.id] ?? [],
        category: l.category,
      })),
    [lines, recv, dmg, wrong, dmgPhotos, wrongType, wrongPhotos],
  );

  /** ONE gate — the same function the server mirrors statement for statement,
   *  so the disabled button and the 422 cannot disagree. */
  const problems = useMemo(
    () => warehouseReceiptProblems({ doNumber, doFilePath, lines: draftLines }),
    [doNumber, doFilePath, draftLines],
  );
  const sessionLines: ReceivingLineInput[] = lines.map((line) => ({
    poLineId: line.id,
    sku: line.sku,
    receivedQty: recv[line.id] || 0,
    damagedQty: dmg[line.id] || 0,
    wrongItemQty: wrong[line.id] || 0,
    extraQty: extra[line.id] || 0,
    unitIds: unitIds[line.id] ?? [],
    damagedPhotos: dmgPhotos[line.id] ?? [],
    wrongItemPhotos: wrongPhotos[line.id] ?? [],
    extraEvidence: extraEvidence[line.id] ?? [],
    wrongItemReason: wrongType[line.id] || null,
  }));
  const sessionProblems = [
    ...(!goodsReceivedAt ? [receivingProblemCopy("goods_received_at_missing")] : []),
    ...sessionLines.flatMap((line) => {
      const identity = receivingUnitIdProblems(line, { expectedUnitIds: lines.find((source) => source.id === line.poLineId)?.unit_ids ?? [], wrongSourceUnitIds: [] });
      const facts = identity.map((key) => key === "unit_id_missing"
        ? receivingProblemCopy("unit_id_missing", { item: line.sku, document: po.po_id })
        : key === "duplicate_unit_id"
          ? { fact: `A Unit ID is repeated for ${line.sku}`, action: "Scan each physical Unit once" }
          : { fact: `A Unit ID for ${line.sku} is not on ${po.po_id}`, action: "Check the label and scan the correct Unit ID" });
      if (line.extraQty > 0 && line.extraEvidence.length === 0) facts.push(receivingProblemCopy("extra_goods_found"));
      return facts;
    }),
  ];
  const ready = problems.length === 0 && sessionProblems.length === 0 && !submit.isPending;

  const totals = draftLines.reduce(
    (acc, l) => ({
      good: acc.good + l.receivedNow,
      damaged: acc.damaged + l.damagedQty,
      wrong: acc.wrong + l.wrongItemQty,
      extra: acc.extra + (extra[l.id] || 0),
    }),
    { good: 0, damaged: 0, wrong: 0, extra: 0 },
  );

  /** Received, damaged and wrong share the ordered-line budget: a delivery may never account for more
   *  units than the line still owes. `field` is the box being typed into. */
  function allowance(
    id: string,
    pending: number,
    field: "recv" | "dmg" | "wrong",
  ): number {
    const used =
      (field === "recv" ? 0 : recv[id] || 0) +
      (field === "dmg" ? 0 : dmg[id] || 0) +
      (field === "wrong" ? 0 : wrong[id] || 0);
    return Math.max(0, pending - used);
  }

  function setNum(
    setter: (fn: (prev: Record<string, number>) => Record<string, number>) => void,
    id: string,
    val: number,
    max: number,
  ) {
    setter((prev) => ({ ...prev, [id]: Math.max(0, Math.min(max, val)) }));
  }

  async function save() {
    if (!ready || !doFilePath) return;
    try {
      await submit.mutateAsync({
        receiptId: po.open_receipt?.status === "draft" || po.open_receipt?.status === "returned" ? po.open_receipt.id : undefined,
        expectedVersion: po.open_receipt?.lock_version ?? 0,
        session: {
          sourceKind: "purchase_order",
          sourceId: po.po_id,
          expectedVersion: po.source_version,
          supplierDoNo: doNumber.trim(),
          signedDoPath: doFilePath,
          goodsReceivedAt: new Date(goodsReceivedAt).toISOString(),
          note: note.trim() || null,
          lines: sessionLines,
        },
      });
      // COPY-STANDARD's done message for this direction of the pair, with the
      // PO and the DO it is about.
      toast.success(
        `Count returned to Carres · ${po.po_id} · DO ${doNumber.trim()}`,
      );
      onClose();
    } catch (e: unknown) {
      if (e instanceof ApiError) toast.error(e.message || "Could not save the count");
      else toast.error(e instanceof Error ? e.message : "Could not save the count");
    }
  }

  return (
    <Modal title={`Count ${po.po_id}`} onClose={onClose} size="lg">
      {po.open_receipt?.status === "returned" && po.open_receipt.return_reason ? (
        <div className="mb-3 border-l-2 border-danger pl-3 text-body"><p className="font-semibold">Count returned to warehouse</p><p>{po.open_receipt.return_reason}</p></div>
      ) : null}
      <div className="text-meta text-base-600 mb-3.5 font-body">
        Goods from <strong>{po.supplier_name ?? "the factory"}</strong>. For each
        item: how many arrived good, how many arrived damaged, how many are the
        wrong item. Anything not counted stays{" "}
        <strong>pending delivery</strong> on the PO.
      </div>

      <div className="card p-0 mb-3.5" data-testid="warehouse-count-lines">
        <div
          className="grid items-center gap-2 px-3.5 py-2.5 bg-base-50 border-b border-base-100"
          style={{ gridTemplateColumns: GRID }}
        >
          <div className="label">Item</div>
          <div className="label text-right">Order Qty</div>
          <div className="label text-right">Received Qty</div>
          <div className="label text-right">Damaged Qty</div>
          <div className="label text-right">Wrong Item Qty</div>
          <div className="label text-right">Pending Delivery Qty</div>
          <div className="label text-right">Extra Qty</div>
        </div>

        {lines.map((l) => {
          const pending = pendingOf(l);
          const pendingAfter = Math.max(0, pending - (recv[l.id] || 0));
          const disabled = pending === 0;
          const hasIssue = (dmg[l.id] || 0) > 0 || (wrong[l.id] || 0) > 0 || (extra[l.id] || 0) > 0;
          return (
            <div key={l.id} className="border-t border-base-100">
              <div
                className={`grid items-center gap-2 px-3.5 py-2.5 ${disabled ? "opacity-50" : ""}`}
                style={{ gridTemplateColumns: GRID }}
              >
                <div>
                  <div className="text-meta font-body">{l.sku}</div>
                  <div className="font-mono text-label text-base-500 mt-0.5">
                    Ordered {l.qty} · already checked in {l.received_qty}
                  </div>
                </div>
                <div className="font-mono text-meta text-right">{l.qty}</div>
                <input
                  type="number"
                  min={0}
                  max={allowance(l.id, pending, "recv")}
                  value={recv[l.id] || 0}
                  disabled={disabled}
                  onChange={(e) =>
                    setNum(
                      setRecv,
                      l.id,
                      parseInt(e.target.value, 10) || 0,
                      allowance(l.id, pending, "recv"),
                    )
                  }
                  aria-label={`Good units for ${l.sku}`}
                  data-testid={`warehouse-good-${l.sku}`}
                  className="px-2 py-1.5 border border-base-300 rounded-[4px] text-meta text-right bg-white outline-none focus:border-base-500"
                />
                <input
                  type="number"
                  min={0}
                  max={allowance(l.id, pending, "dmg")}
                  value={dmg[l.id] || 0}
                  disabled={disabled}
                  onChange={(e) =>
                    setNum(
                      setDmg,
                      l.id,
                      parseInt(e.target.value, 10) || 0,
                      allowance(l.id, pending, "dmg"),
                    )
                  }
                  aria-label={`Damaged units for ${l.sku}`}
                  data-testid={`warehouse-damaged-${l.sku}`}
                  className="px-2 py-1.5 border border-base-300 rounded-[4px] text-meta text-right bg-white outline-none focus:border-base-500"
                />
                <input
                  type="number"
                  min={0}
                  max={allowance(l.id, pending, "wrong")}
                  value={wrong[l.id] || 0}
                  disabled={disabled}
                  onChange={(e) =>
                    setNum(
                      setWrong,
                      l.id,
                      parseInt(e.target.value, 10) || 0,
                      allowance(l.id, pending, "wrong"),
                    )
                  }
                  aria-label={`Wrong item units for ${l.sku}`}
                  data-testid={`warehouse-wrong-${l.sku}`}
                  className="px-2 py-1.5 border border-base-300 rounded-[4px] text-meta text-right bg-white outline-none focus:border-base-500"
                />
                <div className="font-mono text-meta text-right font-semibold" data-testid={`warehouse-pending-${l.sku}`}>{pendingAfter}</div>
                <input
                  type="number"
                  min={0}
                  value={extra[l.id] || 0}
                  onChange={(e) => setNum(setExtra, l.id, parseInt(e.target.value, 10) || 0, 500)}
                  aria-label={`Extra Qty for ${l.sku}`}
                  data-testid={`warehouse-extra-${l.sku}`}
                  className="px-2 py-1.5 border border-base-300 rounded-[4px] text-meta text-right bg-white outline-none focus:border-base-500"
                />
              </div>

              <div className="grid gap-1 border-t border-base-100 px-3.5 py-2.5">
                <label className="text-label text-base-600" htmlFor={`wh-unit-${l.id}`}>Unit ID — enter Received, Damaged, Wrong Item, then Extra labels</label>
                <textarea
                  id={`wh-unit-${l.id}`}
                  aria-label={`Unit ID for ${l.sku}`}
                  data-testid={`warehouse-unit-${l.sku}`}
                  value={(unitIds[l.id] ?? []).join("\n")}
                  onChange={(e) => setUnitIds((current) => ({ ...current, [l.id]: e.target.value.split(/[\n,]/).map((value) => value.trim()).filter(Boolean) }))}
                  className={`${INPUT_CLS} min-h-16 font-mono`}
                />
                <p className="text-label text-base-500">PO Unit IDs: {l.unit_ids.length ? l.unit_ids.join(", ") : "None recorded"}</p>
              </div>

              {/* R2's claim panel, unchanged: it exists only once a problem has
                  actually been reported, so a clean delivery never sees it. */}
              {hasIssue && (
                <div
                  className="px-3.5 pb-3 pt-1 bg-base-50/60 grid gap-2"
                  data-testid={`warehouse-claim-panel-${l.sku}`}
                >
                  <div className="text-label uppercase tracking-[0.12em] text-base-500 font-body">
                    Photos Carres will show the factory
                  </div>

                  {(dmg[l.id] || 0) > 0 && (
                    <ClaimPhotoUploadField
                      poId={po.po_id}
                      doNumber={doNumber || "count"}
                      paths={dmgPhotos[l.id] ?? []}
                      onChange={(paths) =>
                        setDmgPhotos((prev) => ({ ...prev, [l.id]: paths }))
                      }
                      label={`Photo of the damage (${dmg[l.id]} unit${(dmg[l.id] || 0) === 1 ? "" : "s"})`}
                      testId={`warehouse-damaged-photos-${l.sku}`}
                    />
                  )}

                  {(wrong[l.id] || 0) > 0 && (
                    <>
                      <div className="flex items-center gap-2 flex-wrap">
                        <label
                          className="text-label text-base-600 font-body"
                          htmlFor={`wh-wrong-kind-${l.id}`}
                        >
                          What is wrong with it?
                        </label>
                        <select
                          id={`wh-wrong-kind-${l.id}`}
                          value={wrongType[l.id] ?? ""}
                          onChange={(e) =>
                            setWrongType((prev) => ({
                              ...prev,
                              [l.id]: e.target.value,
                            }))
                          }
                          data-testid={`warehouse-wrong-kind-${l.sku}`}
                          className="px-2 py-1 border border-base-300 rounded-[4px] text-meta bg-white outline-none focus:border-base-500"
                        >
                          <option value="">Choose…</option>
                          {wrongItemClaimTypesFor(l.category).map((o) => (
                            <option key={o.key} value={o.key}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <ClaimPhotoUploadField
                        poId={po.po_id}
                        doNumber={doNumber || "count"}
                        paths={wrongPhotos[l.id] ?? []}
                        onChange={(paths) =>
                          setWrongPhotos((prev) => ({ ...prev, [l.id]: paths }))
                        }
                        label={`Photo of the wrong item (${wrong[l.id]} unit${(wrong[l.id] || 0) === 1 ? "" : "s"})`}
                        testId={`warehouse-wrong-photos-${l.sku}`}
                      />
                    </>
                  )}
                  {(extra[l.id] || 0) > 0 && (
                    <ClaimPhotoUploadField
                      poId={po.po_id}
                      doNumber={doNumber || "count"}
                      paths={extraEvidence[l.id] ?? []}
                      onChange={(paths) => setExtraEvidence((prev) => ({ ...prev, [l.id]: paths }))}
                      label={`Extra goods evidence (${extra[l.id]} unit${(extra[l.id] || 0) === 1 ? "" : "s"})`}
                      testId={`warehouse-extra-evidence-${l.sku}`}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}

        <div className="flex justify-end items-center px-3.5 py-2 bg-base-50 border-t border-base-100">
          <div
            className="font-mono text-label font-semibold"
            data-testid="warehouse-count-totals"
          >
            Σ {totals.good} good
            {totals.damaged > 0 ? ` · ${totals.damaged} damaged` : ""}
            {totals.wrong > 0 ? ` · ${totals.wrong} wrong item` : ""}
            {totals.extra > 0 ? ` · ${totals.extra} extra` : ""}
          </div>
        </div>
      </div>

      <div className="grid gap-3 mb-4">
        <div>
          <label className="label mb-1.5 block" htmlFor="wh-goods-received-at">
            Goods Received At *
          </label>
          <input id="wh-goods-received-at" type="datetime-local" value={goodsReceivedAt} onChange={(e) => setGoodsReceivedAt(e.target.value)} className={INPUT_CLS} />
        </div>
        <div>
          <label className="label mb-1.5 block" htmlFor="wh-do-number">
            DO number *
          </label>
          <input
            id="wh-do-number"
            value={doNumber}
            onChange={(e) => setDoNumber(e.target.value)}
            placeholder="From the paper the driver hands you"
            className={INPUT_CLS}
          />
        </div>
        <div className="px-3 py-2.5 border border-dashed border-base-300 rounded-[4px] bg-white">
          <div className="text-label text-base-600 mb-2 font-body">
            Photo of the signed DO *{" "}
            <span className="text-base-400">(PDF/JPG/PNG · ≤10 MB)</span>
          </div>
          <DOFileUploadField
            poId={po.po_id}
            doNumber={doNumber || "count"}
            onUploaded={(path) => setDoFilePath(path)}
          />
          {doFilePath ? <p className="mt-1 text-label text-base-500">Signed DO photo recorded</p> : null}
        </div>
        <div>
          <label className="label mb-1.5 block" htmlFor="wh-note">
            Note for Carres (optional)
          </label>
          <textarea
            id="wh-note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. driver left before we opened carton 3"
            className={`${INPUT_CLS} resize-y`}
          />
        </div>
      </div>

      {/* Say what pressing the button does — and, just as importantly, what it
          does NOT do. A clerk who believes the stock has moved will not chase
          the PO that is still open. */}
      <div
        className="text-label text-base-600 mb-3.5 font-body px-3 py-2 border border-dashed border-base-300 rounded-[4px]"
        data-testid="warehouse-count-note"
      >
        Nothing moves yet. Carres checks this in, and the stock is booked then.
        Damaged, wrong and extra Units stay out of available stock; their evidence continues in the governed supplier process.
      </div>

      {problems.length > 0 && (
        <div
          className="text-label text-danger mb-3 font-body"
          data-testid="warehouse-count-problems"
        >
          {problems.map(warehouseReceiptProblemText).join(" · ")}
        </div>
      )}
      {sessionProblems.length > 0 && (
        <div className="mb-3 grid gap-1 text-label font-body" data-testid="warehouse-session-problems">
          {sessionProblems.map((problem, index) => <div key={`${problem.fact}-${index}`}><p className="font-semibold text-danger">{problem.fact}</p><p className="text-base-600">{problem.action}</p></div>)}
        </div>
      )}

      <ModalActions
        onCancel={onClose}
        onPrimary={save}
        primary="Return count to Carres"
        primaryDisabled={!ready}
        primaryPending={submit.isPending}
      />
    </Modal>
  );
}
