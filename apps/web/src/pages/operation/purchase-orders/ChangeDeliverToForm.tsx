/**
 * `Change Deliver To` — Purchasing MASTER §5.4 (Jess, 2026-09-22 · build
 * boundary confirmed 2026-09-25 · built 2026-09-29, migration 0609).
 *
 * Part of a PO's goods go to another Deliver To. The SAME PO keeps its number
 * and gets its next version; the moved qty joins the line already going
 * there, or becomes a new line. Exact-unit goods move by Unit and keep their
 * Unit IDs. The screen never asks the operator to type anything twice: the
 * facts are grey automatic boxes, the Units are pre-selected (the line's last
 * n IDs, the planner's rule) and `Review changes` shows the version before
 * anything is saved. The words are COPY-STANDARD's Change Deliver To row.
 */
import { useMemo, useState } from "react";
import { poDocumentNumberOf, purchasingRefusal } from "@carres/shared";
import Button from "@/components/kit/Button";
import Checkbox from "@/components/kit/Checkbox";
import Input from "@/components/kit/Input";
import Select from "@/components/kit/Select";
import Textarea from "@/components/kit/Textarea";
import { useChangePoDeliverTo, type operationPoListRow } from "@/lib/queries";
import { Fact } from "../SalesOrderWorkspace";
import { SO_HEAD_ROW, SO_ROW, SO_TABLE, SO_TD, SO_TH } from "../components/so-document-table";

type PoLine = operationPoListRow["purchase_order_lines"][number];

export interface ChangeDeliverToUnit {
  unit_code: string;
  status: string;
  po_line_id?: string | null;
}

/** The goods' own identity on this PO: same SKU and same configuration. */
function goodsKeyOf(line: PoLine): string {
  const attrs = (line as { attrs?: unknown }).attrs;
  return `${line.sku}|${attrs == null ? "" : JSON.stringify(attrs)}`;
}

export function itemNameOf(line: Pick<PoLine, "sku" | "model_name" | "size">): string {
  const name = line.model_name?.trim() || line.sku;
  return line.size ? `${name} · ${line.size}` : name;
}

export interface ChangeDeliverToRow {
  key: string;
  item: string;
  destinationId: string;
  qty: number;
}

/**
 * The version the operator is about to save, for the moved goods only: every
 * line of the same item after the change. One arithmetic with the SQL door
 * (0609): the whole line changes its Deliver To; part of it lowers the line
 * and joins the line already going to the new Deliver To, or becomes one.
 * `blocked` = the whole line would fold into a sibling, which the door refuses.
 */
export function changeDeliverToPreview(
  lines: readonly PoLine[],
  poDestinationId: string | null,
  lineId: string,
  qty: number,
  newDestinationId: string,
): { rows: ChangeDeliverToRow[]; total: number; blocked: boolean } {
  const line = lines.find((l) => l.id === lineId);
  if (!line) return { rows: [], total: 0, blocked: false };
  const key = goodsKeyOf(line);
  const effective = (l: PoLine) => l.destination_id ?? poDestinationId ?? "";
  const same = lines.filter((l) => goodsKeyOf(l) === key);
  const target = same.find((l) => l.id !== line.id && effective(l) === newDestinationId) ?? null;
  const whole = qty === line.qty;
  const rows: ChangeDeliverToRow[] = same.map((l) => {
    if (l.id === line.id) {
      return whole
        ? { key: l.id, item: itemNameOf(l), destinationId: newDestinationId, qty: l.qty }
        : { key: l.id, item: itemNameOf(l), destinationId: effective(l), qty: l.qty - qty };
    }
    if (!whole && target && l.id === target.id) {
      return { key: l.id, item: itemNameOf(l), destinationId: effective(l), qty: l.qty + qty };
    }
    return { key: l.id, item: itemNameOf(l), destinationId: effective(l), qty: l.qty };
  });
  if (!whole && !target) {
    rows.push({ key: "new", item: itemNameOf(line), destinationId: newDestinationId, qty });
  }
  return {
    rows,
    total: rows.reduce((sum, r) => sum + r.qty, 0),
    blocked: whole && target != null,
  };
}

/** The line's last n incoming Unit IDs — the pre-selection (MASTER §5.4). */
export function lastUnitsOf(codes: readonly string[], n: number): string[] {
  return [...codes].sort().slice(Math.max(0, codes.length - n));
}

export default function ChangeDeliverToForm({
  po,
  supplierName,
  destinations,
  activeDestinations,
  units,
  onSaved,
  onCancel,
}: {
  po: operationPoListRow;
  supplierName: string;
  destinations: Array<{ id: string; name: string }>;
  activeDestinations: Array<{ id: string; name: string }>;
  units: readonly ChangeDeliverToUnit[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const save = useChangePoDeliverTo(po.id);
  const lines = po.purchase_order_lines;
  const poDestinationId = po.destination_id ?? null;
  const nameOf = (id: string) => destinations.find((d) => d.id === id)?.name ?? "Not recorded";
  const openOf = (l: PoLine) => l.qty - l.received_qty;
  const firstMovable = lines.find((l) => openOf(l) > 0) ?? null;

  const [lineId, setLineId] = useState(firstMovable?.id ?? "");
  const [qtyText, setQtyText] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [reason, setReason] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [reviewed, setReviewed] = useState(false);
  const [refusal, setRefusal] = useState<{ wrong: string; todo: string } | null>(null);

  const line = lines.find((l) => l.id === lineId) ?? null;
  const open = line ? openOf(line) : 0;
  const currentDestinationId = line ? line.destination_id ?? poDestinationId ?? "" : "";
  const qty = Number(qtyText);
  const qtyValid = qtyText.trim() !== "" && Number.isInteger(qty) && qty >= 1 && qty <= open;
  const lineUnits = useMemo(
    () => units
      .filter((u) => line != null && u.po_line_id === line.id && u.status === "incoming")
      .map((u) => u.unit_code)
      .sort(),
    [units, line],
  );
  const byUnit = line != null && (line.identity_mode === "exact_unit" || lineUnits.length > 0);
  const nextVersion = (po.version ?? 1) + 1;
  const nextDocNo = poDocumentNumberOf(po.id, nextVersion);
  const item = line ? itemNameOf(line) : "";

  const preview = line && qtyValid && destinationId
    ? changeDeliverToPreview(lines, poDestinationId, line.id, qty, destinationId)
    : null;

  /* Any change to what moves throws the review away: the operator saves only
     the version they last looked at. */
  const touch = () => { setReviewed(false); setRefusal(null); };
  const chooseLine = (id: string) => {
    setLineId(id); setQtyText(""); setDestinationId(""); setChosen([]); touch();
  };
  const changeQty = (text: string) => {
    setQtyText(text);
    const n = Number(text);
    setChosen(Number.isInteger(n) && n >= 1 ? lastUnitsOf(lineUnits, n) : []);
    touch();
  };
  const toggleUnit = (code: string, on: boolean) => {
    setChosen((current) => (on ? [...current, code].sort() : current.filter((c) => c !== code)));
    touch();
  };

  /* The FACT, then the ACT (COPY two-line law), in the order a person fills
     the form. The server refuses the same things by code. */
  const gap: { wrong: string; todo: string } | null = !line
    ? { wrong: "All goods on this purchase order are received.", todo: "Use a transfer instead." }
    : open <= 0
      ? purchasingRefusal("all_received", { sku: item, po: poDocumentNumberOf(po.id, po.version ?? 1) })
      : !qtyValid
        ? { wrong: qtyText.trim() === "" ? "Qty to move is empty." : "Qty to move is more than the qty you can move.", todo: `Enter a whole number from 1 to ${open}.` }
        : !destinationId
          ? { wrong: "New Deliver To is empty.", todo: "Choose where these goods go." }
          : byUnit && chosen.length !== qty
            ? purchasingRefusal("unit_count_mismatch", { qty })
            : preview?.blocked
              ? purchasingRefusal("deliver_to_line_exists", { sku: item, destination: nameOf(destinationId) })
              : !reason.trim()
                ? { wrong: "Reason is empty.", todo: "Say why these goods go to another Deliver To." }
                : null;

  const destinationOptions = activeDestinations
    .filter((d) => d.id !== currentDestinationId)
    .map((d) => ({ value: d.id, label: d.name }));

  return (
    <div data-testid="change-deliver-to-form">
      <div className="space-y-3">
        <Select
          id="cdt-item"
          label="Item"
          value={lineId}
          onValueChange={chooseLine}
          options={lines.map((l) => ({
            value: l.id,
            label: openOf(l) > 0
              ? `${itemNameOf(l)} · ${nameOf(l.destination_id ?? poDestinationId ?? "")}`
              : `${itemNameOf(l)} · All received · use a transfer instead`,
            disabled: openOf(l) <= 0,
          }))}
        />
        {line ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Fact label="Current Deliver To" value={nameOf(currentDestinationId)} idPrefix="cdt-fact" framed automatic />
            <Fact label="Qty on this PO" value={String(line.qty)} idPrefix="cdt-fact" framed automatic />
            <Fact label="Qty you can move" value={String(open)} idPrefix="cdt-fact" framed automatic />
          </div>
        ) : null}
        {line && open > 0 ? (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
              <Input
                id="cdt-qty"
                label="Qty to move"
                type="number"
                min={1}
                max={open}
                inputMode="numeric"
                value={qtyText}
                onChange={(event) => changeQty(event.target.value)}
              />
              <Select
                id="cdt-destination"
                label="New Deliver To"
                placeholder="New Deliver To"
                value={destinationId}
                onValueChange={(value) => { setDestinationId(value); touch(); }}
                options={destinationOptions}
              />
            </div>
            {byUnit && qtyValid ? (
              <fieldset data-testid="cdt-units">
                <legend className="text-label font-medium text-kit-slate-11">Units moving</legend>
                <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                  {lineUnits.map((code) => (
                    <div key={code} className="font-mono text-meta">
                      <Checkbox
                        id={`cdt-unit-${code}`}
                        label={code}
                        checked={chosen.includes(code)}
                        onCheckedChange={(on) => toggleUnit(code, on)}
                      />
                    </div>
                  ))}
                </div>
              </fieldset>
            ) : null}
            <Textarea
              id="cdt-reason"
              label="Reason"
              rows={2}
              value={reason}
              onChange={(event) => { setReason(event.target.value); touch(); }}
            />
          </>
        ) : null}
      </div>

      {gap ? (
        <div className="mt-3" data-testid="cdt-gap">
          <div className="text-meta text-kit-red-11">{gap.wrong}</div>
          <div className="text-meta text-kit-slate-11">{gap.todo}</div>
        </div>
      ) : null}

      {reviewed && preview && !gap ? (
        <div className="mt-4" data-testid="cdt-review">
          <div className="mb-2 text-body font-semibold text-kit-slate-12">
            <span className="font-mono">{nextDocNo}</span> · {supplierName}
          </div>
          <table className={SO_TABLE}>
            <thead>
              <tr className={SO_HEAD_ROW}>
                <th className={`${SO_TH} text-left`}>Item</th>
                <th className={`${SO_TH} text-left`}>Deliver To</th>
                <th className={`${SO_TH} text-right`}>Qty</th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((row) => (
                <tr key={row.key} className={SO_ROW}>
                  <td className={SO_TD}>{row.item}</td>
                  <td className={SO_TD}>{nameOf(row.destinationId)}</td>
                  <td className={`${SO_TD} text-right tabular-nums`}>{row.qty}</td>
                </tr>
              ))}
              <tr className={SO_ROW}>
                <td className={`${SO_TD} font-semibold`} colSpan={2}>Total unchanged</td>
                <td className={`${SO_TD} text-right font-semibold tabular-nums`} data-testid="cdt-total">{preview.total}</td>
              </tr>
            </tbody>
          </table>
          <div className="mt-2 text-meta text-kit-slate-11">
            Version ({nextVersion}) must be sent to {supplierName} again
          </div>
        </div>
      ) : null}

      {refusal ? (
        <div className="mt-3" role="alert" data-testid="cdt-refusal">
          <div className="text-meta text-kit-red-11">{refusal.wrong}</div>
          <div className="text-meta text-kit-slate-11">{refusal.todo}</div>
        </div>
      ) : null}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="neutral" onClick={onCancel}>Cancel</Button>
        {reviewed && !gap ? (
          <Button
            variant="primary"
            loading={save.isPending}
            data-testid="cdt-save"
            onClick={() => {
              if (!line || gap) return;
              setRefusal(null);
              save.mutate(
                {
                  lineId: line.id,
                  qty,
                  destinationId,
                  reason: reason.trim(),
                  ...(byUnit ? { unitCodes: chosen } : {}),
                },
                {
                  onSuccess: onSaved,
                  onError: (cause) => {
                    const body = (cause as { body?: { code?: string } }).body;
                    setRefusal(purchasingRefusal(body?.code, {
                      sku: item,
                      po: nextDocNo,
                      destination: nameOf(destinationId),
                      qty: open,
                    }));
                  },
                },
              );
            }}
          >
            Save version ({nextVersion})
          </Button>
        ) : (
          <Button
            variant="primary"
            disabled={!!gap}
            data-testid="cdt-review-button"
            onClick={() => { if (!gap) setReviewed(true); }}
          >
            Review changes
          </Button>
        )}
      </div>
    </div>
  );
}
