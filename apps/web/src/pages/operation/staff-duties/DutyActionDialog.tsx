import type { ReactNode } from "react";
import Button from "@/components/kit/Button";
import Modal from "@/components/kit/Modal";

/**
 * The one focused surface a Staff & Duties act opens (workspace/MASTER.md
 * §§4.3, 4.4). It is the kit `Modal` — Radix's focus trap, Escape and
 * focus-return — with the three things every duty act shares:
 *
 *   · the DUTY printed as a fact, never as a field. A picker here would be a
 *     second way to choose a duty, competing with the catalogue that already
 *     decided which one is open (Law C: a door, never a duplicate);
 *   · the refusal printed BESIDE the action, in the server's own words;
 *   · one primary action, disabled while the write is in flight.
 *
 * It holds no validation and no business rule of its own: the form inside
 * owns its fields, and the SQL door owns the answer.
 */
export default function DutyActionDialog({
  open,
  onOpenChange,
  title,
  dutyLabel,
  submitLabel,
  submitTestId,
  pending,
  error,
  onSubmit,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  dutyLabel: string;
  submitLabel: string;
  submitTestId: string;
  pending: boolean;
  /** The refusal to print, whether the browser guided early or the server
   *  refused. Never rewritten, never reduced to `Invalid`. */
  error: string | null;
  onSubmit: () => void;
  children: ReactNode;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="primary"
            data-testid={submitTestId}
            disabled={pending}
            onClick={onSubmit}
          >
            {submitLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap items-baseline gap-x-3 pb-1">
        <span className="w-28 shrink-0 text-label text-kit-slate-9">Duty</span>
        <span className="text-body font-medium text-kit-slate-12">
          {dutyLabel}
        </span>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
      {error ? (
        <p
          role="alert"
          data-testid={`${submitTestId}-error`}
          className="mt-3 text-meta text-kit-red-11"
        >
          {error}
        </p>
      ) : null}
    </Modal>
  );
}
