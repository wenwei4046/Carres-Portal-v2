/**
 * The pieces the Other debtors and Other receipts pages share: the line list
 * a person types, the cancel-with-a-reason question, a fact card and the
 * failed-read notice. Kit components only.
 */
import { useState, type ReactNode } from "react";
import type { MoneyInAccountOption } from "@carres/shared/other-money-in";
import { parseTypedAmount, sumMoney } from "@carres/shared/other-money-in";
import Button from "@/components/kit/Button";
import Input from "@/components/kit/Input";
import Modal from "@/components/kit/Modal";
import Select from "@/components/kit/Select";
import Textarea from "@/components/kit/Textarea";
import { SectionCard } from "@/components/SectionPanel";
import { rm } from "@/lib/format-currency";
import { FieldError } from "@/components/kit/FieldFrame";

export function accountLabel(a: Pick<MoneyInAccountOption, "code" | "name">): string {
  return `${a.code} · ${a.name}`;
}

/* ── the line list ─────────────────────────────────────────────────────────── */

export interface TypedLine {
  key: string;
  account_code: string;
  description: string;
  amount: string;
}

let lineSeq = 0;
export function blankLine(): TypedLine {
  lineSeq += 1;
  return { key: `line-${lineSeq}`, account_code: "", description: "", amount: "" };
}

export type LineErrors = Record<string, { account?: string; amount?: string }>;

/**
 * Turn typed lines into what the API takes. A row left completely blank is
 * dropped (the form always offers one); a half-typed row is refused with the
 * field that is missing, never guessed.
 */
export function readLines(lines: TypedLine[]): {
  lines: Array<{ account_code: string; description: string | null; amount: number }>;
  errors: LineErrors;
} {
  const out: Array<{ account_code: string; description: string | null; amount: number }> = [];
  const errors: LineErrors = {};
  for (const l of lines) {
    const blank = !l.account_code && !l.description.trim() && !l.amount.trim();
    if (blank) continue;
    const amount = parseTypedAmount(l.amount);
    const e: { account?: string; amount?: string } = {};
    if (!l.account_code) e.account = "Choose an account.";
    if (amount === null) e.amount = "Type the amount.";
    else if (Number.isNaN(amount)) e.amount = "Type the amount in numbers, like 1500.00.";
    else if (amount <= 0) e.amount = "The amount must be more than RM 0.00.";
    else if (Math.abs(Math.round(amount * 100) - amount * 100) > 1e-6) e.amount = "An amount has at most two decimals.";
    if (e.account || e.amount) {
      errors[l.key] = e;
      continue;
    }
    out.push({ account_code: l.account_code, description: l.description.trim() || null, amount: amount as number });
  }
  return { lines: out, errors };
}

/** The total of what has been typed so far — every row that reads as money. */
export function typedTotal(lines: TypedLine[]): number {
  return sumMoney(
    lines.map((l) => {
      const n = parseTypedAmount(l.amount);
      return n === null || Number.isNaN(n) ? 0 : n;
    }),
  );
}

export function LinesEditor({
  idPrefix,
  lines,
  onChange,
  accounts,
  errors,
  accountPlaceholder = "Choose an account",
}: {
  idPrefix: string;
  lines: TypedLine[];
  onChange: (next: TypedLine[]) => void;
  accounts: MoneyInAccountOption[];
  errors: LineErrors;
  accountPlaceholder?: string;
}) {
  const options = accounts.map((a) => ({ value: a.code, label: accountLabel(a) }));
  const set = (key: string, patch: Partial<TypedLine>) =>
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  return (
    <div className="flex flex-col gap-3" data-testid={`${idPrefix}-lines`}>
      {lines.map((l, i) => (
        <div key={l.key} className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)_auto] md:items-end">
          <Select
            id={`${idPrefix}-account-${i}`}
            label="Account"
            value={l.account_code || undefined}
            onValueChange={(v) => set(l.key, { account_code: v })}
            options={options}
            placeholder={accountPlaceholder}
            error={errors[l.key]?.account}
          />
          <Input
            id={`${idPrefix}-description-${i}`}
            label="Description"
            value={l.description}
            maxLength={500}
            onChange={(e) => set(l.key, { description: e.target.value })}
          />
          <Input
            id={`${idPrefix}-amount-${i}`}
            label="Amount (RM)"
            inputMode="decimal"
            value={l.amount}
            onChange={(e) => set(l.key, { amount: e.target.value })}
            error={errors[l.key]?.amount}
          />
          <Button
            variant="ghost"
            size="md"
            aria-label={`Remove line ${i + 1}`}
            disabled={lines.length === 1}
            onClick={() => onChange(lines.filter((x) => x.key !== l.key))}
          >
            Remove
          </Button>
        </div>
      ))}
      <div>
        <Button variant="neutral" size="sm" icon="add" onClick={() => onChange([...lines, blankLine()])}>
          Add line
        </Button>
      </div>
    </div>
  );
}

/* ── cancel, with a reason ─────────────────────────────────────────────────── */

export function CancelWithReason({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  busy,
  refusal,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  busy: boolean;
  refusal: string | null;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [missing, setMissing] = useState(false);
  const close = (o: boolean) => {
    if (!o) {
      setReason("");
      setMissing(false);
    }
    onOpenChange(o);
  };
  return (
    <Modal
      open={open}
      onOpenChange={close}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={() => close(false)}>
            Back
          </Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={() => {
              if (!reason.trim()) {
                setMissing(true);
                return;
              }
              onConfirm(reason.trim());
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Textarea
          id="money-in-cancel-reason"
          label="Reason"
          required
          rows={3}
          maxLength={500}
          value={reason}
          error={missing ? "Type the reason." : undefined}
          onChange={(e) => {
            setReason(e.target.value);
            if (e.target.value.trim()) setMissing(false);
          }}
        />
        {refusal && (
          <FieldError>
            {refusal}
          </FieldError>
        )}
      </div>
    </Modal>
  );
}

/* ── a fact card, and a read that failed ───────────────────────────────────── */

export function Facts({ title, children, testId }: { title: string; children: ReactNode; testId?: string }) {
  return (
    <SectionCard>
      <div className="p-3" data-testid={testId}>
        <h2 className="text-strong mb-2">{title}</h2>
        <div className="text-body flex flex-col gap-1">{children}</div>
      </div>
    </SectionCard>
  );
}

export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p>
      <span className="text-kit-slate-11">{label}: </span>
      {children}
    </p>
  );
}

/** A read that failed says so, and never prints 0.00 in its place. */
export function LoadFailed({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div role="alert" className="p-6 text-body flex flex-col items-start gap-3">
      <p>{what} could not be loaded. Try again.</p>
      <Button variant="neutral" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

export function money(n: number | null | undefined): string {
  return n == null || !Number.isFinite(Number(n)) ? "Amount not available" : rm(Number(n));
}
