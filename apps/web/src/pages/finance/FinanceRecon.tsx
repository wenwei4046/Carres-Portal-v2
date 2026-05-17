import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  useFinanceBankStatements,
  useFinanceReconSuggest,
  useCreateBankStatement,
  useCreateReconciliation,
  type FinanceBankStatementRow,
  type FinanceReconCandidate,
} from "@/lib/queries";
import { rm, rmCompact } from "@/lib/format-currency";

/**
 * Finance Reconciliation page — Phase 5 Chunk B.
 *
 * Visual reference: `reference/proto/finance-recon.jsx:1-166`.
 * Wires:
 *   - useFinanceBankStatements: GET /api/finance/bank-statements (list + matched)
 *   - useFinanceReconSuggest: GET /api/finance/reconciliations/suggest/:id
 *     → finance_recon_suggest_matches RPC, returns top-6 candidates
 *   - useCreateReconciliation: POST /api/finance/reconciliations
 *   - useCreateBankStatement: POST /api/finance/bank-statements (manual entry)
 *
 * CSV bulk import (Q3=B Maybank2u 5-col format) is deferred to Chunk C /
 * Phase 9 — the Import button opens a manual single-row form for V1.
 *
 * Match flow (proto:83-132):
 *   - User clicks "Match…" on an unmatched bank line
 *   - MatchModal queries suggest endpoint, shows top-6 candidates as
 *     radio buttons sorted by abs(outstanding - amount)
 *   - User picks one, clicks Confirm match → POST /reconciliations with
 *     manualRef = "INV-2026-{dl}"
 *   - matched_ref shows up on the list after qk invalidates
 */
export default function FinanceRecon() {
  const lines = useFinanceBankStatements();
  const rows  = lines.data ?? [];

  const [matchTarget, setMatchTarget] = useState<FinanceBankStatementRow | null>(null);
  const [openTarget,  setOpenTarget]  = useState<FinanceBankStatementRow | null>(null);
  const [importOpen,  setImportOpen]  = useState(false);

  const matchedCount   = useMemo(() => rows.filter((r) => r.matched_ref !== null).length, [rows]);
  const unmatchedCount = rows.length - matchedCount;
  const inflow         = useMemo(() => rows.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0), [rows]);
  const outflow        = useMemo(() => -rows.filter((r) => r.amount < 0).reduce((s, r) => s + r.amount, 0), [rows]);

  return (
    <div className="p-9 max-w-[1400px] mx-auto">
      <header className="flex items-end justify-between gap-4 flex-wrap mb-7">
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            Finance · Books
          </div>
          <h1 className="font-display text-[32px] mt-1.5 mb-1 text-foreground tracking-[-0.02em]">
            Reconciliation
          </h1>
          <div className="text-[13px] text-muted-foreground">
            Match bank statement lines to ledger
          </div>
        </div>
        <button
          type="button"
          onClick={() => setImportOpen(true)}
          className="px-3 py-2 rounded-md border border-border bg-background text-[12px] font-semibold"
        >
          Import statement
        </button>
      </header>

      <div className="grid grid-cols-4 gap-3.5 mb-6">
        <Kpi label="Inflow" value={rmCompact(inflow)} hint="Across visible window" tone="ok" />
        <Kpi label="Outflow" value={rmCompact(outflow)} hint="Across visible window" tone="warn" />
        <Kpi label="Matched" value={String(matchedCount)} hint={rows.length > 0 ? `${Math.round(matchedCount / rows.length * 100)}% reconciled` : "—"} />
        <Kpi label="Unmatched" value={String(unmatchedCount)} hint="Need attention" tone={unmatchedCount > 0 ? "warn" : "ok"} accent={unmatchedCount > 0} />
      </div>

      <div className="bg-card rounded-md border border-border overflow-auto">
        <div
          className="grid items-center px-4 py-2.5 bg-muted/40 border-b border-border text-[10px] uppercase tracking-[0.06em] font-bold text-muted-foreground"
          style={{ gridTemplateColumns: "100px 1.6fr 130px 130px 140px", minWidth: 760 }}
        >
          <span>Date</span>
          <span>Description</span>
          <span className="text-right">Amount</span>
          <span>Match</span>
          <span className="text-right">Action</span>
        </div>

        {lines.isLoading ? (
          <div className="p-12 text-center text-[12.5px] text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-[12.5px] text-muted-foreground">
            No bank statement lines. Click Import statement to add one manually.
          </div>
        ) : (
          rows.map((r) => (
            <ReconRow
              key={r.id}
              row={r}
              onMatch={() => setMatchTarget(r)}
              onOpen={() => setOpenTarget(r)}
            />
          ))
        )}
      </div>

      <div className="mt-3.5 px-4 py-3 bg-muted/30 rounded-md text-[11.5px] text-muted-foreground flex gap-3">
        <span>💡</span>
        <span>
          Auto-match runs nightly using FPX customer reference + amount. Unmatched lines need a finance person to manually link them — usually customer transferred without quoting their SO number.
        </span>
      </div>

      {matchTarget && (
        <MatchModal
          line={matchTarget}
          onCancel={() => setMatchTarget(null)}
        />
      )}
      {openTarget && (
        <OpenMatchModal
          line={openTarget}
          onClose={() => setOpenTarget(null)}
        />
      )}
      {importOpen && (
        <ImportStatementModal onClose={() => setImportOpen(false)} />
      )}

      {lines.error && (
        <div className="mt-5 p-3 text-[12px] rounded-md bg-destructive/5 text-destructive border border-destructive/30">
          Failed to load bank statements: {String(lines.error)}
        </div>
      )}
    </div>
  );
}

function ReconRow({
  row, onMatch, onOpen,
}: {
  row: FinanceBankStatementRow;
  onMatch: () => void;
  onOpen:  () => void;
}) {
  const positive = row.amount > 0;
  const tone = row.matched_ref ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive";

  return (
    <div
      className="grid items-center px-4 py-3 border-b border-border text-[12.5px]"
      style={{ gridTemplateColumns: "100px 1.6fr 130px 130px 140px", minWidth: 760 }}
    >
      <span className="font-mono text-[11px] text-muted-foreground">{row.statement_date.slice(5)}</span>
      <span>{row.description}</span>
      <span className={`font-mono text-right font-bold ${positive ? "text-success" : "text-primary"}`}>
        {positive ? "+" : ""}{rm(Math.abs(row.amount)).replace("RM ", "")}
      </span>
      <span>
        <span className={`px-2 py-0.5 rounded text-[10.5px] font-bold ${tone}`}>
          {row.matched_ref ?? "Unmatched"}
        </span>
      </span>
      <span className="text-right">
        {row.matched_ref ? (
          <button
            type="button"
            onClick={onOpen}
            className="text-[11px] px-2.5 py-1 rounded border border-border bg-background hover:bg-muted/40"
          >
            Open
          </button>
        ) : (
          <button
            type="button"
            onClick={onMatch}
            className="text-[11px] px-2.5 py-1 rounded bg-primary text-primary-foreground font-semibold"
          >
            Match…
          </button>
        )}
      </span>
    </div>
  );
}

function MatchModal({
  line, onCancel,
}: {
  line: FinanceBankStatementRow;
  onCancel: () => void;
}) {
  const suggest = useFinanceReconSuggest(line.id);
  const candidates = suggest.data?.candidates ?? [];
  const [pick, setPick] = useState<number | null>(null);

  const createRec = useCreateReconciliation({
    onSuccess: () => {
      toast.success(`Matched to INV-${String(pick).padStart(4, "0")}`);
      onCancel();
    },
    onError: (e) => toast.error(`Match failed: ${e.message}`),
  });

  function submit() {
    if (pick === null) return;
    createRec.mutate({
      bankStatementId: line.id,
      manualRef:       `INV-${String(pick).padStart(4, "0")}`,
    });
  }

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center">
      <div onClick={onCancel} className="absolute inset-0 bg-black/40" aria-hidden="true" />
      <div
        role="dialog"
        aria-label="Match bank line"
        className="relative w-[480px] max-w-[92vw] p-6 rounded-md bg-card shadow-2xl"
      >
        <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Reconciliation</div>
        <div className="font-display text-[20px] mt-1">Match bank line</div>
        <div className="text-[12px] text-muted-foreground mt-1.5 mb-4">
          {line.description} ·{" "}
          <span className={`font-mono font-semibold ${line.amount > 0 ? "text-success" : "text-primary"}`}>
            {line.amount > 0 ? "+" : ""}RM {Math.abs(line.amount).toFixed(2)}
          </span>
        </div>

        <div className="text-[10px] uppercase tracking-[0.06em] font-semibold text-muted-foreground mb-1.5">
          Suggested matches
        </div>

        <div className="flex flex-col gap-1.5 mb-4 max-h-[320px] overflow-auto">
          {suggest.isLoading ? (
            <div className="p-3 text-[12px] text-muted-foreground text-center border border-dashed border-border rounded">
              Loading candidates…
            </div>
          ) : candidates.length === 0 ? (
            <div className="p-3 text-[12px] text-muted-foreground text-center border border-dashed border-border rounded">
              No open invoices to match against.
            </div>
          ) : (
            candidates.map((c) => <CandidateRow key={c.dl} c={c} pick={pick} setPick={setPick} bankAmount={line.amount} />)
          )}
        </div>

        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-2 rounded-md border border-border text-[12.5px]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pick === null || createRec.isPending}
            className="px-3 py-2 rounded-md bg-primary text-primary-foreground font-semibold text-[12.5px] disabled:opacity-60"
          >
            {createRec.isPending ? "Matching…" : "Confirm match"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CandidateRow({
  c, pick, setPick, bankAmount,
}: {
  c: FinanceReconCandidate;
  pick: number | null;
  setPick: (v: number) => void;
  bankAmount: number;
}) {
  const close = Math.abs(c.outstanding - bankAmount) < 1;
  const selected = pick === c.dl;
  return (
    <label
      className={`flex items-center gap-2.5 px-3 py-2 rounded border cursor-pointer ${
        selected
          ? "border-primary bg-primary/5"
          : "border-border bg-background"
      }`}
    >
      <input
        type="radio"
        checked={selected}
        onChange={() => setPick(c.dl)}
        className="accent-primary"
      />
      <div className="flex-1 min-w-0">
        <div className="font-mono text-[12px] font-semibold">{c.invoice_no}</div>
        <div className="text-[11px] text-muted-foreground truncate">{c.customer_name}</div>
      </div>
      <div className={`font-mono text-[12px] font-semibold ${close ? "text-success" : "text-foreground"}`}>
        {rm(c.outstanding)}
      </div>
    </label>
  );
}

function OpenMatchModal({
  line, onClose,
}: {
  line: FinanceBankStatementRow;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center">
      <div onClick={onClose} className="absolute inset-0 bg-black/40" aria-hidden="true" />
      <div
        role="dialog"
        aria-label="Matched bank line"
        className="relative w-[420px] max-w-[92vw] p-6 rounded-md bg-card shadow-2xl"
      >
        <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Reconciliation</div>
        <div className="font-display text-[20px] mt-1 mb-4">Matched line</div>
        <div className="grid gap-2 text-[13px]">
          <Row k="Bank line"   v={line.id.slice(0, 8)} />
          <Row k="Date"        v={line.statement_date} />
          <Row k="Description" v={line.description} />
          <Row k="Amount"      v={
            <span className={`font-mono font-bold ${line.amount > 0 ? "text-success" : "text-primary"}`}>
              {line.amount > 0 ? "+" : ""}RM {Math.abs(line.amount).toFixed(2)}
            </span>
          } />
          <Row k="Matched to"  v={<span className="font-mono font-semibold">{line.matched_ref}</span>} />
        </div>
        <div className="flex justify-end mt-5">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded-md bg-primary text-primary-foreground font-semibold text-[12.5px]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between pb-2 border-b border-dashed border-border">
      <span className="text-muted-foreground">{k}</span>
      <span>{v}</span>
    </div>
  );
}

function ImportStatementModal({ onClose }: { onClose: () => void }) {
  const [statementDate, setStatementDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription]     = useState("");
  const [amount, setAmount]               = useState("");
  const [reference, setReference]         = useState("");

  const create = useCreateBankStatement({
    onSuccess: () => {
      toast.success("Bank statement line imported");
      onClose();
    },
    onError: (e) => toast.error(`Import failed: ${e.message}`),
  });

  function submit() {
    const amt = parseFloat(amount);
    if (!amt) {
      toast.error("Amount required");
      return;
    }
    create.mutate({
      statementDate,
      description,
      amount:    amt,
      reference: reference || null,
      currency:  "MYR",
    });
  }

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center">
      <div onClick={onClose} className="absolute inset-0 bg-black/40" aria-hidden="true" />
      <div
        role="dialog"
        aria-label="Import bank statement line"
        className="relative w-[440px] max-w-[92vw] p-6 rounded-md bg-card shadow-2xl"
      >
        <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Reconciliation</div>
        <div className="font-display text-[20px] mt-1 mb-4">Import statement line</div>

        <div className="text-[10px] uppercase tracking-[0.06em] font-semibold text-muted-foreground mb-1">Statement date</div>
        <input
          type="date"
          aria-label="Statement date"
          value={statementDate}
          onChange={(e) => setStatementDate(e.target.value)}
          className="w-full px-2.5 py-1.5 border border-border rounded text-[12.5px] mb-3 bg-background"
        />

        <div className="text-[10px] uppercase tracking-[0.06em] font-semibold text-muted-foreground mb-1">Description</div>
        <input
          aria-label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. FPX TRF · Tan Mei Ling"
          className="w-full px-2.5 py-1.5 border border-border rounded text-[12.5px] mb-3 bg-background"
        />

        <div className="text-[10px] uppercase tracking-[0.06em] font-semibold text-muted-foreground mb-1">
          Amount (positive = inflow, negative = outflow)
        </div>
        <input
          aria-label="Amount"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="5970"
          className="w-full px-2.5 py-1.5 border border-border rounded text-[12.5px] mb-3 bg-background"
        />

        <div className="text-[10px] uppercase tracking-[0.06em] font-semibold text-muted-foreground mb-1">Reference (optional)</div>
        <input
          aria-label="Reference"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="FPX-8821"
          className="w-full px-2.5 py-1.5 border border-border rounded text-[12.5px] mb-4 bg-background"
        />

        <div className="text-[11.5px] text-muted-foreground mb-3 px-3 py-2 rounded bg-muted/30">
          CSV bulk import (Maybank2u 5-col format) lands in Chunk C / Phase 9. V1 supports manual single-line entry.
        </div>

        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded-md border border-border text-[12.5px]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={create.isPending || !description || !amount}
            className="px-3 py-2 rounded-md bg-primary text-primary-foreground font-semibold text-[12.5px] disabled:opacity-60"
          >
            {create.isPending ? "Importing…" : "Import"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Kpi({
  label, value, hint, tone, accent,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "warn" | "ok";
  accent?: boolean;
}) {
  const valueTone = tone === "warn" ? "text-primary" : tone === "ok" ? "text-success" : "text-foreground";
  return (
    <div className={`bg-card rounded-md border ${accent ? "border-primary" : "border-border"} px-5 py-[18px]`}>
      <div className={`text-[10px] uppercase tracking-[0.06em] font-semibold ${accent ? "text-primary" : "text-muted-foreground"}`}>
        {label}
      </div>
      <div className={`font-display text-[26px] mt-1.5 leading-none tabular-nums ${valueTone}`}>
        {value}
      </div>
      {hint && <div className="text-[11px] text-muted-foreground mt-1.5">{hint}</div>}
    </div>
  );
}
