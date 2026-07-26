import { Check } from "lucide-react";

/** T5 — booking progress spine (read-only). WHERE the delivery is, in 3
 *  seconds: a checklist, not a status word. Every tick DERIVES from a signal
 *  the Delivery card already reads — nothing here writes, and the parent must
 *  feed the SAME sources the header chip uses so the two can never disagree:
 *  partner = the card's own carrier name · confirmed = booking_stage (0277)
 *  · DO = orders.do_number (auto-assigned on dispatch, 0098) · delivered =
 *  the same pipeline signal as the "Delivered ✓" chip. The photo row stays
 *  greyed "later" until T6 ships the upload. */

type SpineState = "done" | "todo" | "later";

export default function BookingSpine({
  partnerAssigned,
  customerConfirmed,
  doIssued,
  delivered,
}: {
  partnerAssigned: boolean;
  customerConfirmed: boolean;
  doIssued: boolean;
  delivered: boolean;
}) {
  const steps: { label: string; state: SpineState }[] = [
    { label: "Logistic assigned", state: partnerAssigned ? "done" : "todo" },
    { label: "Customer confirmed", state: customerConfirmed ? "done" : "todo" },
    { label: "Delivery order issued", state: doIssued ? "done" : "todo" },
    { label: "Delivered", state: delivered ? "done" : "todo" },
    { label: "Delivery photo", state: "later" },
  ];
  return (
    <div className="px-3 py-2 border-t border-base-100">
      {steps.map((s) => (
        <div
          key={s.label}
          data-testid="spine-row"
          data-state={s.state}
          className="flex items-center gap-1.5 py-[3px] text-[12px] leading-none"
        >
          {s.state === "done" ? (
            <Check
              size={13}
              strokeWidth={3}
              aria-hidden
              className="text-base-900 shrink-0"
            />
          ) : (
            <span
              aria-hidden
              className={`h-[11px] w-[11px] rounded-[3px] border-[1.5px] shrink-0 ${
                s.state === "later" ? "border-base-200" : "border-base-300"
              }`}
            />
          )}
          <span
            className={
              s.state === "done"
                ? "font-medium text-base-900"
                : s.state === "later"
                  ? "text-base-300"
                  : "text-base-500"
            }
          >
            {s.label}
          </span>
          {s.state === "later" && (
            <span className="text-[11px] text-base-300">· later</span>
          )}
        </div>
      ))}
    </div>
  );
}
