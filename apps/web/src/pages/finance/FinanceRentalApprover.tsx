import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useRentalApprovals, useDecideRentalAgreement, type RentalApproval } from "@/lib/queries";
import { rm } from "@/lib/format-currency";
import { supabase } from "@/lib/supabase";

/** The private evidence bucket 0267 created. No delete policy — a signed
 *  agreement is evidence — and read access is `is_internal()`, which finance
 *  holds, so the browser can mint its own short-lived URL. */
const SIGNATURE_BUCKET = "rental-agreements";

/**
 * Open the signature the customer actually drew (0279).
 *
 * The approver is deciding thousands of ringgit of credit off the back of this
 * drawing; being told one exists is not the same as being able to look at it.
 * The bucket is private, so this mints a short-lived signed URL rather than
 * embedding anything — the same idiom the ops drawer uses for payment slips.
 */
function SignatureLink({ path }: { path: string }) {
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    try {
      // Stored bucket-prefixed (`rental-agreements/signatures/…`); the storage
      // API wants the key WITHIN the bucket.
      const key = path.startsWith(`${SIGNATURE_BUCKET}/`)
        ? path.slice(SIGNATURE_BUCKET.length + 1)
        : path;
      const { data, error } = await supabase.storage
        .from(SIGNATURE_BUCKET)
        .createSignedUrl(key, 3600);
      if (error || !data?.signedUrl) {
        toast.error(`Couldn't open the signature — ${error?.message ?? "no URL"}`);
        return;
      }
      window.open(data.signedUrl, "_blank", "noopener");
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={open}
      disabled={busy}
      data-testid="view-signature"
      className="text-[11.5px] font-medium text-primary underline underline-offset-2 disabled:opacity-50"
    >
      {busy ? "Opening…" : "View signature"}
    </button>
  );
}

/**
 * Finance → Rental Approver (migration 0268).
 *
 * Loo's T&C says participation in rent-to-own is "subject to credit
 * assessment". This is that assessment, and it is the only thing standing
 * between a signature at a store counter and a live 60/84-month contract.
 *
 * What Approve actually does (all inside one RPC): the agreement goes `active`,
 * its full monthly billing schedule is written, the rented unit is allocated
 * off the fleet, and any included service package mints its entitlement +
 * visits. NONE of that exists while the application is pending — which is why
 * Reject leaves nothing behind, and why the Stripe checkout button in the POS
 * stays refused until a decision lands here.
 *
 * Deliberately NOT a filter-tab inbox: a decided application leaves the queue
 * for good, and the history lives on the Rental agreements list. This page is
 * one question — "who gets credit today?" — and an empty state that is a real
 * answer, not a spinner.
 */
export default function FinanceRentalApprover() {
  const approvalsQ = useRentalApprovals();
  const rows = useMemo(() => approvalsQ.data?.approvals ?? [], [approvalsQ.data]);

  const totals = useMemo(
    () => ({
      count: rows.length,
      credit: rows.reduce((a, r) => a + Number(r.termTotal ?? 0), 0),
      monthly: rows.reduce((a, r) => a + Number(r.monthlyFee ?? 0), 0),
    }),
    [rows],
  );

  return (
    <div className="p-9 max-w-[1400px] mx-auto">
      <header className="flex items-end justify-between gap-4 flex-wrap mb-7">
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            Finance · Rental
          </div>
          <h1 className="font-display text-[32px] mt-1.5 mb-1 text-foreground tracking-[-0.02em]">
            Rental Approver
          </h1>
          <div className="text-[13px] text-muted-foreground">
            Credit assessment for rent-to-own · nothing is billed, allocated or charged until
            you approve
          </div>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-3.5 mb-6">
        <Kpi label="Waiting on you" value={String(totals.count)} hint="Applications undecided" />
        <Kpi
          label="Credit at stake"
          value={rm(totals.credit)}
          hint="Total over the full terms"
          accent
        />
        <Kpi label="Monthly if all approved" value={rm(totals.monthly)} hint="Combined monthly fee" />
      </div>

      {approvalsQ.isLoading ? (
        <div className="bg-card rounded-md border border-border p-12 text-center text-[12.5px] text-muted-foreground">
          Loading…
        </div>
      ) : approvalsQ.error ? (
        <div className="p-3 text-[12px] rounded-md bg-destructive/5 text-destructive border border-destructive/30">
          Failed to load the approval queue: {String(approvalsQ.error)}
        </div>
      ) : rows.length === 0 ? (
        <div
          className="bg-card rounded-md border border-border p-12 text-center"
          data-testid="approver-empty"
        >
          <div className="text-[15px] font-semibold text-foreground">Nothing waiting</div>
          <div className="text-[12.5px] text-muted-foreground mt-1">
            Every rental application has been decided. New ones land here the moment a store
            signs one.
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3.5" data-testid="approver-list">
          {rows.map((r) => (
            <ApplicationCard key={r.id} r={r} />
          ))}
        </div>
      )}

      <div className="mt-3.5 px-4 py-3 bg-muted/30 rounded-md text-[11.5px] text-muted-foreground">
        <b>Approve</b> puts the contract live: the monthly schedule is written, the unit is
        allocated, and the store can collect the first month by card.{" "}
        <b>Reject</b> fails the application and leaves no money behind — the reason you type is
        recorded against it.
      </div>
    </div>
  );
}

function ApplicationCard({ r }: { r: RentalApproval }) {
  const decide = useDecideRentalAgreement();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  const busy = decide.isPending;

  const run = (approve: boolean, note?: string) => {
    decide.mutate(
      { id: r.id, approve, note },
      {
        onSuccess: () => {
          toast.success(
            approve ? `${r.agreementNo} approved` : `${r.agreementNo} rejected`,
          );
          setRejecting(false);
          setReason("");
        },
        onError: (e) => toast.error(String((e as Error)?.message ?? e)),
      },
    );
  };

  return (
    <div
      className="bg-card rounded-md border border-border overflow-hidden"
      data-testid={`approver-card-${r.agreementNo}`}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap px-4 py-3.5 border-b border-border">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="font-mono text-[14px] font-semibold text-foreground">
              {r.agreementNo}
            </span>
            {/* 0279 — the signature is real now, so the pill states a fact
                instead of apologising for a missing feature. An unsigned row
                can no longer reach this queue (approve refuses it), so the
                amber branch only ever describes a pre-0279 application. */}
            {r.signedAt ? (
              <span
                className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"
                title={`Signed ${new Date(r.signedAt).toLocaleString()}`}
              >
                Signed by {r.signedName ?? "customer"}
                {r.templateVersion != null ? ` · T&C v${r.templateVersion}` : ""}
              </span>
            ) : (
              <span
                className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200"
                title="This application predates signature capture — no signature is on file, and approval is now refused without one."
              >
                Not signed yet
              </span>
            )}
            {r.signaturePath ? <SignatureLink path={r.signaturePath} /> : null}
          </div>
          <div className="text-[12.5px] text-muted-foreground mt-1">
            {r.customer.name}
            {r.customer.phone ? ` · ${r.customer.phone}` : ""}
            {r.dealer ? ` · ${r.dealer.name}` : " · HQ direct"}
            {r.salesperson ? ` · ${r.salesperson.name}` : ""}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-mono text-[18px] font-semibold text-foreground tabular-nums">
            {rm(r.termTotal)}
          </div>
          <div className="text-[11.5px] text-muted-foreground">
            {rm(r.monthlyFee)} / mo × {r.termMonths} months
          </div>
        </div>
      </div>

      <div className="grid gap-x-6 gap-y-2 px-4 py-3.5 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Product" value={r.sku} mono />
        <Field label="Starts" value={r.startDate} />
        <Field label="Applied" value={new Date(r.createdAt).toLocaleDateString()} />
        <Field label="Email" value={r.customer.email ?? "—"} />
        <Field label="Address" value={r.customer.address ?? "—"} />
        <Field label="Due once at signing" value={r.oneOffTotal > 0 ? rm(r.oneOffTotal) : "—"} />
        {r.orderSo ? <Field label="Sales order" value={`SO-${r.orderSo}`} mono /> : null}
        {r.notes ? <Field label="Note from the store" value={r.notes} /> : null}
      </div>

      {/* The CBM check is planned, not built (Loo 2026-07-26) — the page says
          that plainly instead of showing a button that does nothing. */}
      <div className="px-4 pb-2 text-[11.5px] text-muted-foreground">
        {r.creditReference
          ? `Credit bureau: ${r.creditReference}`
          : "Credit bureau (CBM) check is not wired yet — assess this one by hand."}
      </div>

      {rejecting ? (
        <div className="px-4 py-3.5 border-t border-border bg-muted/20">
          <label className="block text-[11px] uppercase tracking-[0.06em] font-bold text-muted-foreground mb-1.5">
            Why is this rejected?
          </label>
          <textarea
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-[13px]"
            rows={2}
            value={reason}
            autoFocus
            placeholder="e.g. adverse credit record · income not verified"
            onChange={(e) => setReason(e.target.value)}
            data-testid="approver-reason"
          />
          <div className="flex items-center gap-2 mt-2.5">
            <button
              type="button"
              disabled={busy || reason.trim().length === 0}
              onClick={() => run(false, reason.trim())}
              className="px-3 py-2 rounded-md bg-destructive text-destructive-foreground text-[12px] font-semibold disabled:opacity-40"
              data-testid="approver-reject-confirm"
            >
              {busy ? "Rejecting…" : "Reject application"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setRejecting(false);
                setReason("");
              }}
              className="px-3 py-2 rounded-md border border-border text-[12px] font-semibold"
            >
              Cancel
            </button>
            <span className="text-[11.5px] text-muted-foreground ml-1">
              The reason is required and is kept on the record.
            </span>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-4 py-3.5 border-t border-border">
          <button
            type="button"
            disabled={busy}
            onClick={() => run(true)}
            className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-[12px] font-semibold disabled:opacity-40"
            data-testid="approver-approve"
          >
            {busy ? "Working…" : "Approve"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setRejecting(true)}
            className="px-3 py-2 rounded-md border border-border text-[12px] font-semibold text-destructive disabled:opacity-40"
            data-testid="approver-reject"
          >
            Reject
          </button>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-[0.06em] font-bold text-muted-foreground">
        {label}
      </div>
      <div className={`text-[13px] text-foreground break-words ${mono ? "font-mono" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`bg-card rounded-md border p-4 ${accent ? "border-primary/40" : "border-border"}`}
    >
      <div className="text-[10px] uppercase tracking-[0.06em] font-bold text-muted-foreground">
        {label}
      </div>
      <div className="font-mono text-[24px] font-semibold text-foreground tabular-nums mt-1">
        {value}
      </div>
      <div className="text-[11.5px] text-muted-foreground mt-0.5">{hint}</div>
    </div>
  );
}
