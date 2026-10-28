import Button from "@/components/kit/Button";
import Modal from "@/components/kit/Modal";
import { FieldError } from "@/components/kit/FieldFrame";

/**
 * Asks "are you sure" before an action that cannot be undone. The message says
 * what will happen; Cancel is the way out and the confirm button names the act.
 */
export default function ConfirmActionDialog({ open, title, message, confirmLabel, pending, error, onConfirm, onCancel }: {
  open: boolean; title: string; message: string; confirmLabel: string;
  pending?: boolean; error?: string | null; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <Modal open={open} onOpenChange={(o) => !o && !pending && onCancel()} title={title} description={message}
      footer={<>
        <Button variant="neutral" disabled={pending} onClick={onCancel}>Cancel</Button>
        <Button variant="primary" loading={pending} onClick={onConfirm}>{confirmLabel}</Button>
      </>}>
      {error ? <FieldError>{error}</FieldError> : null}
    </Modal>
  );
}
