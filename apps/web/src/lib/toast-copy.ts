/**
 * Toast copy constants for Phase 3 (Principal MVP).
 *
 * Sonner toast strings live here so the messages are consistent across the
 * approvals inbox, dealer admin, and any future Principal screens that fire
 * the same mutation. Centralising the strings also means QA only has one
 * place to grep when the wording needs a tweak.
 *
 * Convention: success messages start with the noun ("Refund · …", "BedHouse
 * KL …"). The `titleSegment` helper takes the first ` · `-separated chunk
 * from a longer approval title, e.g. `Refund · RM 2,400 · Damaged` → `Refund`.
 */
const titleSegment = (title: string): string => title.split(" · ")[0] ?? title;

export const TOAST = {
  approveRefund:     (title: string) => `Approved refund · ${titleSegment(title)}`,
  approveNewDealer:  (name: string)  => `${name} approved · now active`,
  rejectApproval:    (kind: string, title: string) =>
    `Rejected ${kind} · ${titleSegment(title)}`,
  inviteSuccess:     (name: string)  => `${name} invited · approval queued`,
  suspendSuccess:    (name: string)  => `${name} suspended`,
  reactivateSuccess: (name: string)  => `${name} reactivated`,
  termsUpdated:      (name: string)  => `Credit terms updated · ${name}`,
};
