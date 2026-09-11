import { useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import type { ApEvent, ApFile } from "@carres/shared/schemas/finance-ap";
import { SectionCard } from "@/components/SectionPanel";
import Button from "@/components/kit/Button";
import Modal from "@/components/kit/Modal";
import { fieldAreaCls } from "@/components/Field";
import { fmtDate } from "@/lib/fmt-date";
import { openApFile, useUploadApFile, type ApDocKind } from "@/lib/payables-queries";
import { EVENT_WORD, refusal, word } from "./payables-words";

/** The three payables views, switched the way Payments ↔ Invoices switch:
 *  words in the toolbar, the current one marked. */
export function PayablesSwitch({ current }: { current: "bills" | "vouchers" | "unpaid" }) {
  const views = [
    { key: "bills", to: "/finance/bills", label: "Bills" },
    { key: "vouchers", to: "/finance/payment-vouchers", label: "Payment Vouchers" },
    { key: "unpaid", to: "/finance/ap-outstanding", label: "Unpaid by Supplier" },
  ] as const;
  return (
    <span className="flex items-center gap-3 text-body" data-testid="payables-switch">
      {views.map((v) =>
        v.key === current
          ? <span key={v.key} aria-current="page" className="font-semibold">{v.label}</span>
          : <Link key={v.key} to={v.to}>{v.label}</Link>,
      )}
    </span>
  );
}

export function Facts({ title, children, testId }: { title: string; children: ReactNode; testId?: string }) {
  return (
    <SectionCard>
      <div className="p-3" data-testid={testId}>
        <h2 className="text-strong mb-2">{title}</h2>
        <div className="text-body">{children}</div>
      </div>
    </SectionCard>
  );
}

/** One fact per row: the label, then the value — an absent value already
 *  arrives as words from the caller. */
export function FactRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 py-0.5">
      <span className="w-40 shrink-0 text-base-500">{label}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

export function HistoryCard({ events }: { events: ApEvent[] }) {
  return (
    <Facts title="History">
      {events.length === 0
        ? <p>No history yet.</p>
        : events.map((e, i) => (
          <p key={i}>
            {word(EVENT_WORD, e.action)} · {fmtDate(e.at, { time: true })} · {e.actor_name ?? "Name not available"}
            {e.note ? ` · ${e.note}` : ""}
          </p>
        ))}
    </Facts>
  );
}

/** The supplier's invoice, the bank slip, the receipt — attached to the
 *  document. Files are evidence: they can be added, never removed. */
export function FilesCard({ kind, id, files, canAdd }: {
  kind: ApDocKind;
  id: string;
  files: ApFile[];
  canAdd: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const upload = useUploadApFile(kind, id);
  const open = (path: string) => {
    openApFile(path).catch((e: unknown) => toast.error(`The file could not be opened — ${refusal(e)}`));
  };
  return (
    <Facts title="Files" testId="ap-files">
      {files.length === 0
        ? <p>No file attached yet.</p>
        : files.map((f) => (
          <p key={f.id}>
            <button type="button" className="underline underline-offset-2" onClick={() => open(f.storage_path)}>
              {f.file_name}
            </button>
            {" · "}{fmtDate(f.uploaded_at, { time: true })} · {f.uploaded_by_name ?? "Name not available"}
          </p>
        ))}
      {canAdd && (
        <div className="mt-2">
          <input
            ref={input}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className="hidden"
            aria-label="Choose a file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              upload.mutate(file, {
                onSuccess: () => toast.success(`${file.name} attached`),
                onError: (err) => toast.error(refusal(err)),
              });
            }}
          />
          <Button icon="attach" loading={upload.isPending} onClick={() => input.current?.click()}>
            Attach file
          </Button>
        </div>
      )}
    </Facts>
  );
}

/** Cancel and Return to draft both need a reason, and the reason goes on the
 *  document's history. */
export function ReasonModal({ open, title, description, action, busy, onClose, onSubmit }: {
  open: boolean;
  title: string;
  description: string;
  action: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const ready = reason.trim().length > 0;
  return (
    <Modal
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={title}
      description={description}
      footer={
        <span className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!ready} loading={busy} onClick={() => onSubmit(reason.trim())}>
            {action}
          </Button>
        </span>
      }
    >
      <label className="block text-body">
        Reason
        <textarea
          aria-label="Reason"
          className={`${fieldAreaCls} mt-1`}
          rows={3}
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
    </Modal>
  );
}

/** A read that failed says so and offers the retry; it never shows an empty
 *  document or a zero. */
export function ReadFailed({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div role="alert" className="p-6 text-body">
      <p>{what} could not be loaded. Try again.</p>
      <button type="button" className="btn-secondary mt-3" onClick={onRetry}>Try again</button>
    </div>
  );
}
