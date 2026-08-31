import { type WarehouseReceiptRow } from "@carres/shared";
import { fmtDateShort } from "@/lib/fmt-date";
import { DOC_TH, DocSection, Prop } from "./workspace-doc";

/**
 * ReceivingRecord — one entry of the `Goods Received` register (Card C2,
 * Jess 2026-08-03).
 *
 * **A historical register, and nothing else.** Her five architecture rulings
 * are what this file is shaped by, and each one removed something:
 *
 * 1. *"Receiving Records must remain a historical register only. Do not mix
 *    Receiving Review or exception handling into this page."* — so this pane
 *    has **no buttons, no forms and no door into Claims**. The only thing that
 *    moves is `View`, which opens the paper the supplier signed; that is part
 *    of the record, not an action on it.
 * 2. *"Remove the Activity section. A historical register should not contain
 *    another history block."* — and she was right about more than tidiness:
 *    every key the `posted` event carries (`do_number` · `units_counted` ·
 *    `goods_received_at` · `entry_source`) is ALREADY a field in the header
 *    above. It was a history inside a history, printing the same facts twice.
 * 3. *"Status is already represented by the rail."* — and because ruling 1
 *    narrows the register to POSTED records, status stops being a concept
 *    here at all. `submitted` and `returned` are REVIEW states, which is
 *    exactly what she told this page not to carry.
 *
 * The document number is the stored posting fact. An unmigrated row is named
 * `Legacy receipt`; a date/id reconstruction must never impersonate a GRN.
 *
 * When Void lands in its own slice, a voided record must still appear here and
 * in the list — history never deletes — with a quiet marker beside the number.
 * Nothing is built for it now; the shape simply leaves room.
 */

export default function ReceivingRecord({ record }: { record: WarehouseReceiptRow }) {
  const lines = record.lines ?? [];
  const total = lines.reduce(
    (a, l) => ({
      recv: a.recv + (l.received_now ?? 0),
      dmg: a.dmg + (l.damaged_qty ?? 0),
      wrong: a.wrong + (l.wrong_item_qty ?? 0),
    }),
    { recv: 0, dmg: 0, wrong: 0 },
  );
  const anyProblem = total.dmg > 0 || total.wrong > 0;

  return (
    <div className="px-4 py-4" data-testid="receiving-record">
      <div className="flex justify-end">
        <span
          className="text-page font-semibold font-mono text-kit-slate-12"
          data-testid="receiving-record-no"
        >
          {record.grn_number ?? "Legacy receipt"}
        </span>
      </div>

      <div className="mt-2">
        <Prop labelWidth="w-36" label="Goods Received At">
          <span className="tabular-nums">
            {record.goods_received_at
              ? fmtDateShort(record.goods_received_at)
              : "—"}
          </span>
        </Prop>
        <Prop labelWidth="w-36" label="Supplier">{record.supplier_name ?? "—"}</Prop>
        <Prop labelWidth="w-36" label="PO No.">
          <span className="font-mono">{record.po_id}</span>
        </Prop>
        <Prop labelWidth="w-36" label="Supplier DO No.">
          <span className="font-mono">{record.do_number}</span>
        </Prop>
        <Prop labelWidth="w-36" label="Signed DO">
          {record.do_file_url ? (
            <a
              href={record.do_file_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-kit-blue-11 hover:underline"
              data-testid="receiving-record-do"
            >
              View
            </a>
          ) : (
            /* Says which fact is missing rather than printing a dead link. A
               record filed before the evidence rule, or a file the storage
               layer would not sign, both land here. */
            <span className="text-kit-slate-9">Not on file</span>
          )}
        </Prop>
        <Prop labelWidth="w-36" label="Posted by">{record.posted_by_name ?? "—"}</Prop>
        <Prop labelWidth="w-36" label="Source">
          {record.submitted_from === "warehouse"
            ? "Warehouse"
            : record.submitted_from === "office"
              ? "Office"
              : "—"}
        </Prop>
        {record.note && <Prop labelWidth="w-36" label="Note">{record.note}</Prop>}
      </div>

      <DocSection title="Items">
        {/* This delivery's own numbers — the DELTA the Session stores, never a
            running total. The PO's cumulative figure lives on the PO. */}
        <div className={DOC_TH}>
          <span className="flex-1 font-medium">Description</span>
          <span className="w-12 text-right font-medium">Recv</span>
          {anyProblem && <span className="w-12 text-right font-medium">Dmgd</span>}
          {anyProblem && <span className="w-12 text-right font-medium">Wrong</span>}
        </div>
        {lines.map((l, i) => (
          <div
            key={`${l.id}-${i}`}
            className="flex gap-2 py-1.5 text-body border-b border-kit-slate-4"
            data-testid={`receiving-record-item-${i + 1}`}
          >
            <span className="flex-1 min-w-0 font-mono text-kit-slate-12 truncate">
              {l.sku}
            </span>
            <span className="w-12 text-right tabular-nums text-kit-slate-12">
              {l.received_now ?? 0}
            </span>
            {anyProblem && (
              <span
                className={`w-12 text-right tabular-nums ${
                  (l.damaged_qty ?? 0) > 0 ? "text-kit-red-11" : "text-kit-slate-9"
                }`}
              >
                {l.damaged_qty ?? 0}
              </span>
            )}
            {anyProblem && (
              <span
                className={`w-12 text-right tabular-nums ${
                  (l.wrong_item_qty ?? 0) > 0 ? "text-kit-red-11" : "text-kit-slate-9"
                }`}
              >
                {l.wrong_item_qty ?? 0}
              </span>
            )}
          </div>
        ))}
        <div className="flex gap-2 py-1.5 text-body border-b border-kit-slate-5">
          <span className="flex-1 text-label uppercase tracking-wide text-kit-slate-9">
            Total
          </span>
          <span className="w-12 text-right font-semibold tabular-nums text-kit-slate-12">
            {total.recv}
          </span>
          {anyProblem && (
            <span className="w-12 text-right font-semibold tabular-nums text-kit-red-11">
              {total.dmg}
            </span>
          )}
          {anyProblem && (
            <span className="w-12 text-right font-semibold tabular-nums text-kit-red-11">
              {total.wrong}
            </span>
          )}
        </div>
      </DocSection>
    </div>
  );
}
