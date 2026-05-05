/**
 * PartnerRequestForDeliveryDialog — STUB.
 *
 * Created in Task 26 of Phase 4.5 Chunk 1 so the import in
 * `PartnerPickupsPage.tsx` resolves. Task 28 will replace this with the real
 * Accept / Reject RFD dialog (wired against the endpoints from Task 27).
 *
 * Until then, opening this dialog from the pickups table just shows the
 * placeholder copy + a Close button.
 */
export default function PartnerRequestForDeliveryDialog({
  poId,
  onClose,
}: {
  poId: string;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      className="fixed inset-0 bg-black/40 flex items-center justify-center"
    >
      <div className="bg-card border border-base-200 p-6 rounded-md">
        <p className="text-[13px] text-base-700">
          RFD dialog for {poId} (Task 28 will wire Accept / Reject)
        </p>
        <button
          onClick={onClose}
          className="mt-4 underline text-[12px] text-base-600"
        >
          Close
        </button>
      </div>
    </div>
  );
}
