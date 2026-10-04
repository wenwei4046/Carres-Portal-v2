import type { ReceivingEvent } from "@/lib/queries";

const WORDS: Record<ReceivingEvent["event"], string> = {
  posted: "Receiving saved", submitted: "Count submitted", resubmitted: "Count submitted again",
  returned: "Count returned", amended: "Receiving amended", voided: "Receiving voided",
};
export function receivingEventLabel(event: ReceivingEvent["event"]): string {
  return WORDS[event] ?? "Activity";
}
