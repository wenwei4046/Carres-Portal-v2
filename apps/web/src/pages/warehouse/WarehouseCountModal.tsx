import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  RECEIVING_UNIT_OUTCOME_LABEL,
  warehouseReceiptProblems,
  warehouseReceiptProblemText,
  wrongItemClaimTypesFor,
  type ReceivingArrivalEvidence,
  type ReceivingUnitOutcome,
  type WarehouseIncomingPo,
  type WarehouseReceiptLineDraft,
} from "@carres/shared";
import { ApiError } from "@/lib/api";
import { useWarehouseSubmitReceiptMutation } from "@/lib/queries";
import ArrivalEvidenceUploadField from "@/components/ArrivalEvidenceUploadField";
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
 * This is R1's inspection, unchanged: three numbers per line under a
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

const GRID = "1fr 76px 78px 72px 76px";

/** One physical result per governed expected Unit — the same three outcomes
 *  the ops Session records (ERP-ARCHITECTURE §3.4). */
type UnitState = {
  outcome: ReceivingUnitOutcome;
  issueKind: "damaged" | "wrong_item";
};

type ExpectedUnit = NonNullable<WarehouseIncomingPo["expected_units"]>[number];

export default function WarehouseCountModal({ po, onClose }: Props) {
  const lines = po.lines ?? [];

  const [recv, setRecv] = useState<Record<string, number>>({});
  const [dmg, setDmg] = useState<Record<string, number>>({});
  const [wrong, setWrong] = useState<Record<string, number>>({});
  const [dmgPhotos, setDmgPhotos] = useState<Record<string, string[]>>({});
  const [wrongType, setWrongType] = useState<Record<string, string>>({});
  const [wrongPhotos, setWrongPhotos] = useState<Record<string, string[]>>({});
  const [doNumber, setDoNumber] = useState("");
  const [note, setNote] = useState("");
  const [doFilePath, setDoFilePath] = useState<string | null>(null);
  const [arrivalEvidence, setArrivalEvidence] = useState<
    ReceivingArrivalEvidence[]
  >([]);

  const submit = useWarehouseSubmitReceiptMutation();

  /** What the line still owes. Derived, never stored — the same arithmetic R1
   *  uses, so this form and the PO row can never disagree. */
  function pendingOf(l: { qty: number; received_qty: number }): number {
    return Math.max(0, Number(l.qty || 0) - Number(l.received_qty || 0));
  }

  /** The governed Units still expected, grouped by the LINE they were born
   *  for (0442 `po_line_id`) — the exact IDs the supplier was told to write
   *  on the packages. Two lines of one SKU are two lines. */
  const unitsByLine = useMemo(() => {
    const m = new Map<string, ExpectedUnit[]>();
    for (const l of po.lines ?? []) {
      m.set(
        l.id,
        (po.expected_units ?? []).filter(
          (u) => u.status === "incoming" && (u.po_line_id ? u.po_line_id === l.id : u.sku === l.sku),
        ),
      );
    }
    return m;
  }, [po.expected_units, po.lines]);

  /** Prefilled `received` up to the line's remaining count — a complete
   *  delivery is zero typing — and `not_received` beyond it (the same rule
   *  the ops Session applies). */
  const [unitStates, setUnitStates] = useState<Record<string, UnitState>>(() => {
    const o: Record<string, UnitState> = {};
    for (const l of po.lines ?? []) {
      const units = (po.expected_units ?? []).filter(
        (u) => u.status === "incoming" && (u.po_line_id ? u.po_line_id === l.id : u.sku === l.sku),
      );
      const cap = Math.max(0, Number(l.qty || 0) - Number(l.received_qty || 0));
      units.forEach((u, i) => {
        o[u.id] = {
          outcome: i < cap ? "received" : "not_received",
          issueKind: "damaged",
        };
      });
    }
    return o;
  });
  const setUnit = (id: string, patch: Partial<UnitState>) =>
    setUnitStates((s) => ({
      ...s,
      [id]: {
        ...(s[id] ?? { outcome: "not_received", issueKind: "damaged" }),
        ...patch,
      },
    }));

  /** A unit-checked line DERIVES its three numbers from the unit outcomes —
   *  one arithmetic, shared with the payload and the evidence gate. A line
   *  without governed Units keeps the typed counts. */
  const draftLines: WarehouseReceiptLineDraft[] = useMemo(
    () =>
      lines.map((l) => {
        const units = unitsByLine.get(l.id) ?? [];
        let receivedNow = recv[l.id] || 0;
        let damagedQty = dmg[l.id] || 0;
        let wrongItemQty = wrong[l.id] || 0;
        if (units.length > 0) {
          receivedNow = 0;
          damagedQty = 0;
          wrongItemQty = 0;
          for (const u of units) {
            const st = unitStates[u.id];
            if (!st || st.outcome === "not_received") continue;
            if (st.outcome === "received") receivedNow += 1;
            else if (st.issueKind === "wrong_item") wrongItemQty += 1;
            else damagedQty += 1;
          }
        }
        return {
          id: l.id,
          sku: l.sku,
          pendingDelivery: pendingOf(l),
          receivedNow,
          damagedQty,
          damagedPhotos: dmgPhotos[l.id] ?? [],
          wrongItemQty,
          wrongItemClaimType: wrongType[l.id] ?? null,
          wrongItemPhotos: wrongPhotos[l.id] ?? [],
          category: l.category,
        };
      }),
    [
      lines,
      recv,
      dmg,
      wrong,
      dmgPhotos,
      wrongType,
      wrongPhotos,
      unitsByLine,
      unitStates,
    ],
  );

  /** ONE gate — the same function the server mirrors statement for statement,
   *  so the disabled button and the 422 cannot disagree. */
  const problems = useMemo(
    () => warehouseReceiptProblems({ doNumber, doFilePath, lines: draftLines }),
    [doNumber, doFilePath, draftLines],
  );
  const ready = problems.length === 0 && !submit.isPending;

  /** The ONE per-line view the rows, the claim panels and the payload read. */
  const viewBy = new Map(draftLines.map((d) => [d.id, d]));

  const totals = draftLines.reduce(
    (acc, l) => ({
      good: acc.good + l.receivedNow,
      damaged: acc.damaged + l.damagedQty,
      wrong: acc.wrong + l.wrongItemQty,
    }),
    { good: 0, damaged: 0, wrong: 0 },
  );
  const issueTotal = totals.damaged + totals.wrong;

  /** The three numbers share ONE budget: a delivery may never account for more
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
        poId: po.po_id,
        doNumber: doNumber.trim(),
        doFilePath,
        note: note.trim() || undefined,
        ...(arrivalEvidence.length > 0 ? { arrivalEvidence } : {}),
        lines: draftLines
          .filter(
            (l) => l.receivedNow > 0 || l.damagedQty > 0 || l.wrongItemQty > 0,
          )
          .map((l) => {
            const units = unitsByLine.get(l.id) ?? [];
            return {
              id: l.id,
              receivedNow: l.receivedNow,
              // The unit outcomes ride the line — the derived numbers above
              // and this list can never disagree (one arithmetic).
              ...(units.length > 0
                ? {
                    units: units.map((u) => {
                      const st = unitStates[u.id] ?? {
                        outcome: "not_received" as const,
                        issueKind: "damaged" as const,
                      };
                      return {
                        unitCode: u.unit_code,
                        outcome: st.outcome,
                        ...(st.outcome === "received_with_issue"
                          ? { issueKind: st.issueKind }
                          : {}),
                      };
                    }),
                  }
                : {}),
              ...(l.damagedQty > 0
                ? {
                    damagedQty: l.damagedQty,
                    damagedPhotos: [...l.damagedPhotos],
                  }
                : {}),
              ...(l.wrongItemQty > 0
                ? {
                    wrongItemQty: l.wrongItemQty,
                    wrongItemClaimType: l.wrongItemClaimType ?? undefined,
                    wrongItemPhotos: [...l.wrongItemPhotos],
                  }
                : {}),
            };
          }),
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
          <div className="label text-right">Pending delivery</div>
          <div className="label text-right">Arrived good</div>
          <div className="label text-right">Damaged</div>
          <div className="label text-right">Wrong item</div>
        </div>

        {lines.map((l) => {
          const pending = pendingOf(l);
          const units = unitsByLine.get(l.id) ?? [];
          const hasUnits = units.length > 0;
          const disabled = pending === 0 && !hasUnits;
          const v = viewBy.get(l.id);
          const damagedNow = v?.damagedQty ?? 0;
          const wrongNow = v?.wrongItemQty ?? 0;
          const hasIssue = damagedNow > 0 || wrongNow > 0;
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
                <div className="font-mono text-meta text-right font-semibold">
                  {pending}
                </div>
                {hasUnits ? (
                  /* The three numbers are DERIVED from the unit outcomes below
                     — read-only here, so the row and the outcomes can never
                     disagree. */
                  <div
                    className="font-mono text-meta text-right"
                    style={{ gridColumn: "3 / 6" }}
                    data-testid={`warehouse-derived-${l.sku}`}
                  >
                    {v?.receivedNow ?? 0} good
                    {damagedNow > 0 ? ` · ${damagedNow} damaged` : ""}
                    {wrongNow > 0 ? ` · ${wrongNow} wrong item` : ""}
                  </div>
                ) : (
                  <>
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
                  </>
                )}
              </div>

              {/* One row per governed expected Unit: the code the supplier was
                  told to write on the package, and what became of it. Wrapping
                  flex rows with big selects — this form lives on a phone. */}
              {units.map((u) => {
                const st = unitStates[u.id] ?? {
                  outcome: "not_received" as const,
                  issueKind: "damaged" as const,
                };
                return (
                  <div
                    key={u.id}
                    className="flex flex-wrap items-center gap-2 px-3.5 py-2 border-t border-dashed border-base-100"
                    data-testid={`warehouse-unit-${u.unit_code}`}
                  >
                    <span className="font-mono text-meta text-base-700 min-w-[96px]">
                      {u.unit_code}
                    </span>
                    <select
                      value={st.outcome}
                      onChange={(e) =>
                        setUnit(u.id, {
                          outcome: e.target.value as ReceivingUnitOutcome,
                        })
                      }
                      aria-label={`Outcome for ${u.unit_code}`}
                      data-testid={`warehouse-unit-outcome-${u.unit_code}`}
                      className="flex-1 min-w-[150px] px-2 py-1.5 border border-base-300 rounded-[4px] text-meta bg-white outline-none focus:border-base-500"
                    >
                      {(
                        [
                          "received",
                          "received_with_issue",
                          "not_received",
                        ] as const
                      ).map((o) => (
                        <option key={o} value={o}>
                          {RECEIVING_UNIT_OUTCOME_LABEL[o]}
                        </option>
                      ))}
                    </select>
                    {st.outcome === "received_with_issue" && (
                      <select
                        value={st.issueKind}
                        onChange={(e) =>
                          setUnit(u.id, {
                            issueKind: e.target.value as
                              | "damaged"
                              | "wrong_item",
                          })
                        }
                        aria-label={`Issue kind for ${u.unit_code}`}
                        data-testid={`warehouse-unit-issue-${u.unit_code}`}
                        className="px-2 py-1.5 border border-base-300 rounded-[4px] text-meta bg-white outline-none focus:border-base-500"
                      >
                        <option value="damaged">Damaged</option>
                        <option value="wrong_item">Wrong item</option>
                      </select>
                    )}
                  </div>
                );
              })}

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

                  {damagedNow > 0 && (
                    <ClaimPhotoUploadField
                      poId={po.po_id}
                      doNumber={doNumber || "count"}
                      paths={dmgPhotos[l.id] ?? []}
                      onChange={(paths) =>
                        setDmgPhotos((prev) => ({ ...prev, [l.id]: paths }))
                      }
                      label={`Photo of the damage (${damagedNow} unit${damagedNow === 1 ? "" : "s"})`}
                      testId={`warehouse-damaged-photos-${l.sku}`}
                    />
                  )}

                  {wrongNow > 0 && (
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
                        label={`Photo of the wrong item (${wrongNow} unit${wrongNow === 1 ? "" : "s"})`}
                        testId={`warehouse-wrong-photos-${l.sku}`}
                      />
                    </>
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
          </div>
        </div>
      </div>

      <div className="grid gap-3 mb-4">
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
        </div>
        {/* Arrival evidence is a DIFFERENT fact from the signed DO: what the
            truck/pallet looked like when it arrived. Photo and video both
            count (owner instruction §5C); optional, never a gate. */}
        <div className="px-3 py-2.5 border border-dashed border-base-300 rounded-[4px] bg-white">
          <div className="text-label text-base-600 mb-2 font-body">
            Arrival evidence{" "}
            <span className="text-base-400">
              (photo or video of the goods as they arrived · ≤10 MB each)
            </span>
          </div>
          <ArrivalEvidenceUploadField
            poId={po.po_id}
            doNumber={doNumber}
            entries={arrivalEvidence}
            onChange={setArrivalEvidence}
            testId="warehouse-arrival-evidence"
          />
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
        {issueTotal > 0 && (
          <>
            {" "}
            The damaged and wrong-item units open a{" "}
            <strong>claim against the factory</strong> with the photos above.
          </>
        )}
      </div>

      {problems.length > 0 && (
        <div
          className="text-label text-danger mb-3 font-body"
          data-testid="warehouse-count-problems"
        >
          {problems.map(warehouseReceiptProblemText).join(" · ")}
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
