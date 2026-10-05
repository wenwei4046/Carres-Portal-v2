import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  RECEIVING_UNIT_OUTCOME_LABEL,
  documentDisplayNumber,
  type WarehouseConfirmationResult,
  type WarehouseConfirmationReportInput,
  warehouseReceiptProblems,
  warehouseReceiptProblemText,
  wrongItemClaimTypesFor,
  type ReceivingArrivalEvidence,
  type ReceivingUnitOutcome,
  type WarehouseIncomingPo,
  type WarehouseReceiptLineDraft,
} from "@carres/shared";
import TableScroller from "@/components/TableScroller";
import Checkbox from "@/components/kit/Checkbox";
import { ApiError } from "@/lib/api";
import { appDateTimeInput, appDateTimeInputToIso } from "@/lib/fmt-date";
import { useWarehouseConfirmReceiptMutation } from "@/lib/queries";
import ArrivalEvidenceUploadField from "@/components/ArrivalEvidenceUploadField";
import ClaimPhotoUploadField from "@/components/ClaimPhotoUploadField";
import DOFileUploadField from "@/components/DOFileUploadField";
import Modal from "@/components/kit/Modal";
import Button from "@/components/kit/Button";
import { controlClass } from "@/components/kit/field-recipe";
const INPUT_CLS = controlClass(false, "single");

/** Warehouse-owned physical report. The same Receiving engine either posts a
 * GRN or retains this exact session with blockers; normal receipt has no second
 * Operation approval. Confirmation applies to the exact displayed draft. */
interface Props {
  po: WarehouseIncomingPo;
  onClose: () => void;
  saved?: { saveKey: string; result: WarehouseConfirmationResult; report: WarehouseConfirmationReportInput };
}

const GRID = "1fr 76px 78px 72px 76px";

/** One physical result per governed expected Unit — the same three outcomes
 *  the ops Session records (ERP-ARCHITECTURE §3.4). */
type UnitState = {
  outcome: ReceivingUnitOutcome | null;
  issueKind: "damaged" | "wrong_item";
};

type ExpectedUnit = NonNullable<WarehouseIncomingPo["expected_units"]>[number];

export default function WarehouseCountModal({ po, onClose, saved }: Props) {
  const lines = po.lines ?? [];

  const storedLines = saved?.report.lines ?? [];
  const storedNumbers = (key: "receivedNow" | "damagedQty" | "wrongItemQty") =>
    Object.fromEntries(storedLines.filter((line) => line.id && typeof line[key] === "number")
      .map((line) => [line.id!, line[key] as number]));
  const storedPhotos = (key: "damagedPhotos" | "wrongItemPhotos") =>
    Object.fromEntries(storedLines.filter((line) => line.id).map((line) =>
      [line.id!, (line[key] ?? []).filter((photo): photo is string => typeof photo === "string")]));
  const [recv, setRecv] = useState<Record<string, number>>(() => storedNumbers("receivedNow"));
  const [dmg, setDmg] = useState<Record<string, number>>(() => storedNumbers("damagedQty"));
  const [wrong, setWrong] = useState<Record<string, number>>(() => storedNumbers("wrongItemQty"));
  const [dmgPhotos, setDmgPhotos] = useState<Record<string, string[]>>(() => storedPhotos("damagedPhotos"));
  const [wrongType, setWrongType] = useState<Record<string, string>>(() => Object.fromEntries(storedLines.filter((line) => line.id && line.wrongItemClaimType).map((line) => [line.id!, line.wrongItemClaimType!])));
  const [wrongPhotos, setWrongPhotos] = useState<Record<string, string[]>>(() => storedPhotos("wrongItemPhotos"));
  const [doNumber, setDoNumber] = useState(saved?.report.doNumber ?? "");
  /** Physical arrival is explicit. Unknown is not the time this form opened. */
  const [receivedAt, setReceivedAt] = useState(() => saved?.report.goodsReceivedTime ? appDateTimeInput(saved.report.goodsReceivedTime) : "");
  const [note, setNote] = useState(saved?.report.note ?? "");
  const [doFilePath, setDoFilePath] = useState<string | null>(saved?.report.doFilePath ?? null);
  const [arrivalEvidence, setArrivalEvidence] = useState<
    ReceivingArrivalEvidence[]
  >(saved?.report.arrivalEvidence ?? []);

  const submit = useWarehouseConfirmReceiptMutation();

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
          (u) => u.status === "incoming" && u.po_line_id === l.id,
        ),
      );
    }
    return m;
  }, [po.expected_units, po.lines]);

  /** New forms retain the source-prefilled proposal until explicit confirmation.
   * Saved reports restore only recorded outcomes; an unanswered Unit stays unknown. */
  const [unitStates, setUnitStates] = useState<Record<string, UnitState>>(() => {
    const o: Record<string, UnitState> = {};
    for (const l of po.lines ?? []) {
      const units = (po.expected_units ?? []).filter(
        (u) => u.status === "incoming" && u.po_line_id === l.id,
      );
      const cap = Math.max(0, Number(l.qty || 0) - Number(l.received_qty || 0));
      units.forEach((u, i) => {
        const previous = storedLines.find((line) => line.id === l.id)?.units?.find((item) => item.unitCode === u.unit_code);
        o[u.id] = {
          outcome: previous?.outcome ?? (saved ? null : i < cap ? "received" : "not_received"),
          issueKind: previous?.issueKind ?? "damaged",
        };
      });
    }
    return o;
  });
  const setUnit = (id: string, patch: Partial<UnitState>) =>
    setUnitStates((s) => ({
      ...s,
      [id]: {
        ...(s[id] ?? { outcome: null, issueKind: "damaged" }),
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
            if (!st?.outcome || st.outcome === "not_received") continue;
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
  const [saveKey] = useState(() => saved?.saveKey ?? crypto.randomUUID());
  const [savedReport, setSavedReport] = useState<WarehouseConfirmationResult | null>(saved?.result ?? null);
  const [confirmed, setConfirmed] = useState(false);
  const saving = useRef(false);
  const unitResultsKnown = (lineId: string) => (unitsByLine.get(lineId) ?? []).every((unit) => Boolean(unitStates[unit.id]?.outcome));
  const report: WarehouseConfirmationReportInput = {
    ...saved?.report,
    poId: po.po_id, doNumber: doNumber.trim(), doFilePath,
    goodsReceivedTime: receivedAt ? appDateTimeInputToIso(receivedAt) : null,
    note: note.trim() || undefined, arrivalEvidence,
    lines: draftLines.filter((line) => {
      const source = lines.find((item) => item.id === line.id);
      return (source && pendingOf(source) > 0) || (unitsByLine.get(line.id)?.length ?? 0) > 0;
    }).map((line) => ({
      id: line.id,
      receivedNow: (unitsByLine.get(line.id)?.length ?? 0) ? (unitResultsKnown(line.id) ? line.receivedNow : null) : recv[line.id] ?? null,
      damagedQty: (unitsByLine.get(line.id)?.length ?? 0) ? (unitResultsKnown(line.id) ? line.damagedQty : null) : dmg[line.id] ?? null,
      wrongItemQty: (unitsByLine.get(line.id)?.length ?? 0) ? (unitResultsKnown(line.id) ? line.wrongItemQty : null) : wrong[line.id] ?? null,
      damagedPhotos: [...line.damagedPhotos, ...(storedLines.find((item) => item.id === line.id)?.damagedPhotos ?? []).filter((photo) => typeof photo !== "string")],
      wrongItemPhotos: [...line.wrongItemPhotos, ...(storedLines.find((item) => item.id === line.id)?.wrongItemPhotos ?? []).filter((photo) => typeof photo !== "string")],
      wrongItemClaimType: line.wrongItemClaimType ?? undefined,
      units: (unitsByLine.get(line.id) ?? []).flatMap((unit) => {
        const state = unitStates[unit.id];
        if (!state?.outcome) return [];
        return [{ unitCode: unit.unit_code, note: storedLines.find((item) => item.id === line.id)?.units?.find((item) => item.unitCode === unit.unit_code)?.note, outcome: state.outcome,
          ...(state.outcome === "received_with_issue" ? { issueKind: state.issueKind } : {}) }];
      }),
    })),
  };
  // A changed source read must never silently erase previously reported goods.
  // Unmatched facts stay on the same report for the engine/Operation to resolve.
  let sourceChanged = false;
  for (const original of storedLines) {
    const current = report.lines?.find((line) => line.id === original.id);
    if (!current) { sourceChanged = true; report.lines?.push(original); }
    else for (const unit of original.units ?? []) {
      if (!current.units?.some((item) => item.unitCode === unit.unitCode)) {
        sourceChanged = true;
        current.units?.push(unit);
      }
    }
  }
  const quantitiesKnown = (report.lines ?? []).every((line) =>
    line.receivedNow != null && line.damagedQty != null && line.wrongItemQty != null);
  const reportSnapshot = JSON.stringify(report);
  useEffect(() => { setConfirmed(false); }, [reportSnapshot]);
  const ready = confirmed && !sourceChanged && !submit.isPending;

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
    id: string, value: string, max: number,
  ) {
    setter((prev) => {
      const next = { ...prev };
      if (value === "" || !Number.isFinite(Number(value))) delete next[id];
      else next[id] = Math.max(0, Math.min(max, Math.trunc(Number(value))));
      return next;
    });
  }

  async function save() {
    if (!ready || saving.current) return;
    saving.current = true;
    try {
      const result = await submit.mutateAsync({ saveKey, report,
        ...(savedReport ? { receiptId: savedReport.id, revision: savedReport.revision } : {}),
      });
      setSavedReport(result);
      if (result.status === "posted" && result.grn_no) {
        toast.success(`Receiving saved · ${documentDisplayNumber(result.grn_no)}`);
        onClose();
      }
    } catch (e: unknown) {
      if (e instanceof ApiError) toast.error(e.message || "Could not save the count");
      else toast.error(e instanceof Error ? e.message : "Could not save the count");
    } finally {
      saving.current = false;
    }
  }

  return (
    <Modal open title={`Count ${documentDisplayNumber(po.po_id)}`} width="wide"
      onOpenChange={(open) => { if (!open && !saving.current) onClose(); }}
      footer={<>
        <Button onClick={onClose} disabled={submit.isPending}>Cancel</Button>
        <Button variant="primary" onClick={save} disabled={!ready} loading={submit.isPending}>
          {confirmed ? "Save Receiving" : "Save — confirm receiving results"}
        </Button>
      </>}>
      <fieldset disabled={submit.isPending} className="min-w-0 border-0 p-0 m-0">
      <div className="text-meta text-base-600 mb-3.5 font-body">
        Goods from <strong>{po.supplier_name ?? "the factory"}</strong>. For each
        item: how many arrived good, how many arrived damaged, how many are the
        wrong item. Anything not counted stays{" "}
        <strong>pending delivery</strong> on the PO.
      </div>

      <TableScroller label="Items" testId="warehouse-count-scroller">
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
                    {unitResultsKnown(l.id) ? <>{v?.receivedNow ?? 0} good
                    {damagedNow > 0 ? ` · ${damagedNow} damaged` : ""}
                    {wrongNow > 0 ? ` · ${wrongNow} wrong item` : ""}</> : "Not recorded"}
                  </div>
                ) : (
                  <>
                    <input
                      type="number"
                      min={0}
                      max={allowance(l.id, pending, "recv")}
                      value={recv[l.id] ?? ""}
                      disabled={disabled}
                      onChange={(e) =>
                        setNum(
                          setRecv,
                          l.id,
                          e.target.value,
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
                      value={dmg[l.id] ?? ""}
                      disabled={disabled}
                      onChange={(e) =>
                        setNum(
                          setDmg,
                          l.id,
                          e.target.value,
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
                      value={wrong[l.id] ?? ""}
                      disabled={disabled}
                      onChange={(e) =>
                        setNum(
                          setWrong,
                          l.id,
                          e.target.value,
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
                  outcome: null,
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
                      value={st.outcome ?? ""}
                      onChange={(e) =>
                        setUnit(u.id, {
                          outcome: (e.target.value || null) as ReceivingUnitOutcome | null,
                        })
                      }
                      aria-label={`Outcome for ${u.unit_code}`}
                      data-testid={`warehouse-unit-outcome-${u.unit_code}`}
                      className="flex-1 min-w-[150px] px-2 py-1.5 border border-base-300 rounded-[4px] text-meta bg-white outline-none focus:border-base-500"
                    >
                      <option value="" disabled>Not recorded</option>
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
            {quantitiesKnown ? <>
              Σ {totals.good} good
              {totals.damaged > 0 ? ` · ${totals.damaged} damaged` : ""}
              {totals.wrong > 0 ? ` · ${totals.wrong} wrong item` : ""}
            </> : "Not recorded"}
          </div>
        </div>
      </div>

      </TableScroller>
      <div className="grid gap-3 mb-4">
        <div>
          <label className="label mb-1.5 block" htmlFor="wh-received-at">
            Goods Received Date *
          </label>
          <input
            id="wh-received-at"
            type="datetime-local"
            value={receivedAt}
            max={appDateTimeInput()}
            onChange={(e) => setReceivedAt(e.target.value)}
            className={INPUT_CLS}
          />
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

      <div className="text-body text-kit-slate-11 mb-3" data-testid="warehouse-count-note">
        {!confirmed ? "Prefilled results are not confirmed. Check the goods before saving."
          : !savedReport ? "Receiving results confirmed. Not saved yet." : null}
      </div>
      {sourceChanged && <p role="alert" className="text-body text-kit-red-9">Not available. Go back and reload.</p>}
      <Checkbox id="warehouse-confirm-results"
        label="I checked the goods and confirm these receiving results."
        checked={confirmed} onCheckedChange={setConfirmed} disabled={submit.isPending || sourceChanged} />
      {savedReport?.status === "draft" && (
        <div role="status" className="text-body text-kit-red-9 my-3">
          <p>Receiving report saved. No GRN created.</p>
          {savedReport.blockers.map((blocker) => <p key={blocker.code}>{blocker.message}</p>)}
        </div>
      )}

      {problems.length > 0 && (
        <div
          className="text-label text-danger mb-3 font-body"
          data-testid="warehouse-count-problems"
        >
          {problems.map(warehouseReceiptProblemText).join(" · ")}
        </div>
      )}

      </fieldset>

    </Modal>
  );
}
