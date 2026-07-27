// design-standard: not-a-list-page — a drawer over one agreement, not a
// browsable list. The table is a fixed 60/84-row schedule with no filtering,
// sorting or paging, so ListPageShell's chrome would be furniture around a
// receipt. Same call the parent OperationRental page makes.
import { useState } from "react";
import { toast } from "sonner";
import { useRentalCollections, useRecordRentalPayment } from "@/lib/queries";
import { rm } from "@/lib/format-currency";

/**
 * What has actually been collected on one rental agreement (0281).
 *
 * The problem this solves is small to describe and was expensive to live with:
 * `rental_billings` held 84 rows and had NO writer, so every month showed as
 * unpaid forever and the only true answer lived in the Stripe dashboard.
 * Finance had two systems and one of them lied.
 *
 * The three figures at the top are the ones a human actually asks about:
 * what the contract is worth, what has come in, and what is still to come.
 * "Late" is derived from the due date server-side rather than stored, so it can
 * never be a stale flag someone forgot to clear — but nothing here CHASES a
 * late payment. That is the dunning ladder, and it is segment 2b.
 */
export default function RentalCollectionsPanel({
  agreementId,
  onClose,
}: {
  agreementId: string;
  onClose: () => void;
}) {
  const q = useRentalCollections(agreementId);
  const record = useRecordRentalPayment(agreementId);
  const [recordingSeq, setRecordingSeq] = useState<number | null>(null);

  const data = q.data;

  const doRecord = (seq: number) => {
    setRecordingSeq(seq);
    record.mutate(
      { seq, method: "bank_transfer" },
      {
        onSuccess: () => {
          toast.success(`Instalment ${seq} recorded`);
          setRecordingSeq(null);
        },
        onError: (e) => {
          toast.error(String((e as Error)?.message ?? e));
          setRecordingSeq(null);
        },
      },
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/30"
      onClick={onClose}
      data-testid="rental-collections-overlay"
    >
      <div
        className="h-full w-full max-w-[760px] bg-card overflow-y-auto shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="font-mono text-[15px] font-semibold text-foreground">
              {data?.agreement.agreementNo ?? "Collections"}
            </div>
            {data && (
              <div className="text-[12.5px] text-muted-foreground mt-0.5">
                {rm(data.agreement.monthlyFee)} / mo × {data.agreement.termMonths} months ·{" "}
                <span className="font-mono">{data.agreement.sku}</span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[13px] text-muted-foreground hover:text-foreground"
          >
            Close
          </button>
        </header>

        {q.isPending && (
          <div className="p-8 text-[13px] text-muted-foreground">Loading collections…</div>
        )}
        {q.error && (
          <div className="p-8 text-[13px] text-danger">
            {String((q.error as Error)?.message ?? q.error)}
          </div>
        )}

        {data && (
          <>
            <div className="grid grid-cols-3 gap-px bg-border border-b border-border">
              <Figure label="Contract value" value={rm(data.totals.contractValue)} />
              <Figure label="Collected" value={rm(data.totals.collected)} />
              {/* The number a credit decision is actually about. */}
              <Figure label="Still to come" value={rm(data.totals.outstanding)} strong />
            </div>

            <div className="px-6 py-3 border-b border-border text-[12.5px] text-muted-foreground">
              {data.totals.paidCount} of {data.agreement.termMonths} months collected
              {data.totals.lateCount > 0 ? (
                <>
                  {" · "}
                  <span className="text-danger font-semibold">
                    {data.totals.lateCount} past due
                  </span>
                  {/* Say plainly that nobody is chasing yet, rather than let a
                      red number imply a process that does not exist. */}
                  <span className="text-muted-foreground">
                    {" "}
                    — no automatic reminders yet
                  </span>
                </>
              ) : null}
              {/* 0295 — a refused card is a DIFFERENT problem from an unpaid
                  month and needs a different call, so it gets its own count
                  rather than being folded into "past due". */}
              {(data.totals.declinedCount ?? 0) > 0 ? (
                <>
                  {" · "}
                  <span className="text-danger font-semibold" data-testid="declined-count">
                    {data.totals.declinedCount} card declined
                  </span>
                </>
              ) : null}
              {(data.totals.unattachedDeclines ?? 0) > 0 ? (
                <>
                  {" · "}
                  <span className="text-danger font-semibold">
                    {data.totals.unattachedDeclines} declined with no month to match
                  </span>
                </>
              ) : null}
            </div>

            <table className="w-full border-collapse text-[13px]">
              <thead className="bg-base-700 text-white">
                <tr>
                  <Th>#</Th>
                  <Th>Due</Th>
                  <Th>Amount</Th>
                  <Th>Status</Th>
                  <Th>How</Th>
                  <Th>Split</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {data.billings.map((b) => (
                  <tr
                    key={b.id}
                    className="border-t border-base-100 align-top"
                    data-testid={`collection-row-${b.seq}`}
                  >
                    <td className="px-3 py-2 t-num text-base-500">{b.seq}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-base-700">{b.dueDate}</td>
                    <td className="px-3 py-2 whitespace-nowrap t-num">{rm(b.amountDue)}</td>
                    <td className="px-3 py-2">
                      {b.status === "paid" ? (
                        <span className="text-emerald-700 font-semibold whitespace-nowrap">Paid</span>
                      ) : b.lastDecline ? (
                        /* 0295 — "Card declined" outranks "Past due" because it
                           is the more specific fact AND the one with an action
                           behind it: the money did not fail to be asked for, it
                           was refused. The reason underneath is what decides
                           whether finance asks for a new card or a top-up. */
                        <span data-testid={`declined-${b.seq}`}>
                          <span className="text-danger font-semibold whitespace-nowrap">
                            Card declined
                          </span>
                          <div className="text-[11.5px] text-base-500 mt-0.5">
                            {b.lastDecline.at.slice(0, 10)}
                            {(b.declineCount ?? 0) > 1 ? ` · ${b.declineCount} tries` : ""}
                          </div>
                          {b.lastDecline.reason ? (
                            <div className="text-[11.5px] text-base-600 mt-0.5 max-w-[200px] whitespace-normal">
                              {b.lastDecline.reason}
                            </div>
                          ) : null}
                        </span>
                      ) : b.late ? (
                        <span className="text-danger font-semibold whitespace-nowrap">Past due</span>
                      ) : (
                        <span className="text-base-500">Due</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[12px] text-base-600">
                      {b.method ?? "—"}
                      {b.reference ? (
                        <div className="font-mono text-[11.5px] text-base-400">{b.reference}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-[12px] text-base-600 whitespace-nowrap">
                      {b.supplierShare == null ? (
                        "—"
                      ) : (
                        <>
                          <div>supplier {rm(b.supplierShare)}</div>
                          <div>sales {rm(b.commissionShare ?? 0)}</div>
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {b.status !== "paid" && (
                        <button
                          type="button"
                          onClick={() => doRecord(b.seq)}
                          disabled={record.isPending}
                          data-testid={`record-${b.seq}`}
                          className="text-[12px] font-medium text-primary underline underline-offset-2 disabled:opacity-50"
                        >
                          {recordingSeq === b.seq ? "Recording…" : "Record transfer"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="px-6 py-4 text-[12px] text-muted-foreground leading-relaxed">
              Card payments record themselves when Stripe collects them, and a refused card records
              itself too — every attempt the bank turns down is kept, so a month that says “Card
              declined” has been asked for and refused, not simply left alone. “Record transfer” is
              for money that never touched Stripe — a bank transfer or cash at the counter — and it
              goes through the same door, so the supplier and sales split is always worked out the
              same way. Recording the money is also what clears the decline.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Figure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="bg-card px-5 py-4">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={`t-num mt-1 ${strong ? "text-[20px] font-semibold text-foreground" : "text-[18px] text-foreground"}`}
      >
        {value}
      </div>
    </div>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide">
      {children}
    </th>
  );
}
