/**
 * ASSIGN LOGISTICS — Delivery's own write, over one or many scopes.
 * Owner ruling 2026-08-24 · `docs/delivery/MASTER.md` §8 · migration 0379.
 *
 * ── THE THREE RULES IT EXISTS TO OBEY ───────────────────────────────────────
 *
 * 1. **Only partners valid for the selected routes.** A carrier that does not
 *    cover Kelantan cannot be offered for a Kelantan trip — offering it makes
 *    the operator's mistake the system's fault. Coverage comes from the ONE
 *    governed region rule (`REGION_CARRIER`, `lib/region.ts`), the same one the
 *    Orders list has always suggested from.
 * 2. **Klang Valley defaults to NETS.** The MASTER's §2 rule, applied as a
 *    PRE-SELECTION and never as a lock: the operator can pick anyone the
 *    coverage admits, because the MASTER is equally explicit that default
 *    coverage is "configurable and audited, never hard-coded to NETS".
 * 3. **Never silently replace an existing partner.** When any selected scope
 *    already has one, the dialog asks for a governed reason BEFORE it will
 *    submit — and the server refuses the same request for the same reason, so
 *    the rule holds even for a caller that is not this dialog.
 *
 * ── WHAT IT NEVER DOES ──────────────────────────────────────────────────────
 *
 * It does not issue a Delivery Order, and it has no Release and no Approve.
 * The SYSTEM issues a DO when the governed gate becomes true; assigning a
 * carrier is one of the facts that gate reads, never the act itself.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CHANGE_LOGISTICS_REASONS,
  DEFAULT_KV_LOGISTICS,
  isLogisticsChange,
  latestWarehouseReadyDate,
  partnerJourneyCalendar,
  type AssignLogisticsInput,
} from "@carres/shared";
import { fmtDate } from "@/lib/fmt-date";
import { useAssignLogistics, useDeliveryPartners, type DeliveryPartnerRow } from "@/lib/queries";
import { detectState, REGION_CARRIER, regionForAddress } from "@/lib/region";
import type { DeliveryScopeRow } from "../delivery-work";

/** Every visible word (COPY-STANDARD). */
export const AL_WORDS = {
  title: "Assign logistics",
  changeTitle: "Change logistics",
  partner: "Logistics partner",
  /* Two selects, two placeholders — the partner select borrowed the reason's
     word on day one (`Pick a reason` over a list of carriers; walk finding
     2026-08-24). */
  partnerPlaceholder: "Pick a logistics partner",
  reason: "Why is this changing?",
  reasonPlaceholder: "Pick a reason",
  note: "Note (optional)",
  cancel: "Cancel",
  submit: "Assign logistics",
  submitChange: "Change logistics",
  noPartners: "No logistics partner covers every selected address",
  coverageHint: "Only partners covering the selected addresses are listed.",
  changeWarn: (n: number) =>
    n === 1
      ? "1 of these already has a logistics partner. Changing it is recorded with your reason."
      : `${n} of these already have a logistics partner. Changing them is recorded with your reason.`,
  /* Delivery Card 03 (0411, MASTER §5.1) — the ONE backward calculation,
     shown as a fact. It informs; it never blocks. */
  readyBy: "Latest Carres Warehouse ready date",
  pickupOn: (partner: string, d: string) => `${partner} picks up from KL on ${d}`,
  surcharge: (partner: string, areas: string) =>
    `${partner} may charge extra for: ${areas}`,
} as const;

/** journey_regions key for a scope's address — state-level, because TEOW's
 *  Melaka and JB weeks differ. null = no governed region ⇒ silence. */
export function journeyRegionKeyFor(address: string | null | undefined): string | null {
  const state = detectState(address ?? "");
  if (state === "Melaka") return "Melaka";
  if (state === "Johor") return "JB";
  return null;
}

/** The computed chain lines for the chosen partner over the selected scopes.
 *  A scope with no region, no date or no partner calendar contributes nothing
 *  (absence stays silent — the 0283/T7 law). */
export function readyByLines(
  scopes: DeliveryScopeRow[],
  partner: DeliveryPartnerRow | undefined,
): { so: number; pickupDay: string; readyBy: string }[] {
  if (!partner) return [];
  const calendar = partnerJourneyCalendar(partner);
  if (!calendar.pickupDays) return [];
  const out: { so: number; pickupDay: string; readyBy: string }[] = [];
  for (const s of scopes) {
    const address =
      s.o.customer_address ??
      [s.o.customer_address_line1, s.o.customer_address_city, s.o.customer_address_state]
        .filter(Boolean)
        .join(", ");
    const region = journeyRegionKeyFor(address);
    const date = s.confirmedIso ?? s.customerDeliveryIso;
    if (!region || !date) continue;
    const chain = latestWarehouseReadyDate({
      customerDateIso: date,
      region,
      calendar,
    });
    if (chain.kind !== "chain") continue;
    out.push({ so: s.so, pickupDay: chain.pickupDay, readyBy: chain.warehouseReadyBy });
  }
  return out;
}

/**
 * Which partners may carry EVERY selected scope.
 *
 * The intersection, deliberately: a bulk assignment writes ONE partner onto all
 * of them, so a carrier that covers four of five is not a valid answer for the
 * fifth. When the selection spans regions with no common carrier the list is
 * empty and the dialog says so rather than offering a partner that cannot go.
 */
export function partnersForScopes(
  scopes: DeliveryScopeRow[],
  partners: { id: string; name: string }[],
): { id: string; name: string }[] {
  const allowedNames = scopes.map((s) => {
    const address =
      s.o.customer_address ??
      [s.o.customer_address_line1, s.o.customer_address_city, s.o.customer_address_state]
        .filter(Boolean)
        .join(", ");
    /* An address nothing recognises falls to `Other` — the overflow carriers.
       That is the honest answer: we do not know where this is, so only the
       partners who go anywhere may be offered. Guessing KV here would put a
       Klang Valley truck on a Sabah address. */
    const region = regionForAddress(address ?? "") ?? "Other";
    const rule = REGION_CARRIER[region];
    return new Set([rule.primary, ...(rule.alt ? [rule.alt] : [])]);
  });
  if (allowedNames.length === 0) return [];
  const common = allowedNames.reduce<Set<string>>(
    (acc, names) => new Set([...acc].filter((n) => names.has(n))),
    allowedNames[0]!,
  );
  return partners.filter((p) => common.has(p.name));
}

/** The pre-selected partner: the governed default when every scope is Klang Valley. */
export function defaultPartnerFor(
  scopes: DeliveryScopeRow[],
  candidates: { id: string; name: string }[],
): string | null {
  const allKv = scopes.every((s) => {
    const address =
      s.o.customer_address ??
      [s.o.customer_address_city, s.o.customer_address_state].filter(Boolean).join(", ");
    return (regionForAddress(address ?? "") ?? "Other") === "KV";
  });
  if (allKv) {
    const nets = candidates.find((p) => p.name === DEFAULT_KV_LOGISTICS);
    if (nets) return nets.id;
  }
  return candidates.length === 1 ? candidates[0]!.id : null;
}

export default function AssignLogisticsDialog({
  scopes,
  open,
  onOpenChange,
  onAssigned,
}: {
  scopes: DeliveryScopeRow[];
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onAssigned: () => void;
}) {
  const partnersQ = useDeliveryPartners();
  const assign = useAssignLogistics();
  const partners = useMemo(() => partnersQ.data?.partners ?? [], [partnersQ.data]);

  const candidates = useMemo(() => partnersForScopes(scopes, partners), [scopes, partners]);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [reason, setReason] = useState<string>("");
  const [note, setNote] = useState<string>("");

  const chosen = partnerId ?? defaultPartnerFor(scopes, candidates);
  const chosenRow = useMemo(
    () => partners.find((p) => p.id === chosen),
    [partners, chosen],
  );
  /* Delivery Card 03 — the backward-calculation facts for the chosen carrier.
     Empty arrays render nothing: absence stays silent. */
  const ready = useMemo(() => readyByLines(scopes, chosenRow), [scopes, chosenRow]);
  const surchargeAreas = chosenRow?.surcharge_areas ?? [];

  /* How many of these would be REPLACED rather than filled in. The same
     predicate the server runs, so the dialog cannot ask for something the
     server does not require, nor stay quiet about something it does. */
  const changing = useMemo(
    () => scopes.filter((s) => isLogisticsChange(s.logisticsId, chosen)).length,
    [scopes, chosen],
  );
  const needsReason = changing > 0;

  if (!open) return null;

  const submit = () => {
    if (!chosen) return;
    if (needsReason && !reason) return;
    const input: AssignLogisticsInput = {
      scopes: scopes.map((s) => ({ orderId: s.orderId, leg: s.leg ?? 0 })),
      partnerId: chosen,
      ...(needsReason ? { reason: reason as AssignLogisticsInput["reason"] } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    };
    assign.mutate(input, {
      onSuccess: (r) => {
        toast.success(
          r.assigned === 1
            ? `1 delivery scope assigned to ${r.partner}`
            : `${r.assigned} delivery scopes assigned to ${r.partner}`,
        );
        onAssigned();
        onOpenChange(false);
      },
      onError: (e: Error) => toast.error(e.message),
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={needsReason ? AL_WORDS.changeTitle : AL_WORDS.title}
      data-testid="assign-logistics-dialog"
    >
      <div className="w-full max-w-md rounded-control border border-kit-slate-6 bg-white shadow-lg">
        <div className="border-b border-kit-slate-5 px-4 py-3">
          <h2 className="text-body font-semibold text-kit-slate-12">
            {needsReason ? AL_WORDS.changeTitle : AL_WORDS.title}
          </h2>
          <p className="mt-0.5 text-meta text-kit-slate-11">
            {scopes.length === 1
              ? "1 delivery scope"
              : `${scopes.length} delivery scopes`}
          </p>
        </div>

        <div className="flex flex-col gap-3 px-4 py-3">
          <label className="flex flex-col gap-1">
            <span className="text-meta font-medium text-kit-slate-12">{AL_WORDS.partner}</span>
            <select
              className="h-8 rounded-control border border-kit-slate-6 px-2 text-body"
              value={chosen ?? ""}
              onChange={(e) => setPartnerId(e.target.value || null)}
              data-testid="assign-logistics-partner"
            >
              <option value="">{AL_WORDS.partnerPlaceholder}</option>
              {candidates.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <span className="text-label text-kit-slate-9">{AL_WORDS.coverageHint}</span>
          </label>

          {candidates.length === 0 && (
            <p className="text-meta text-kit-amber-11" data-testid="assign-logistics-no-partners">
              {AL_WORDS.noPartners}
            </p>
          )}

          {ready.length > 0 && chosenRow && (
            <div
              className="rounded-control bg-kit-slate-3 px-2 py-1.5 text-meta text-kit-slate-11"
              data-testid="assign-logistics-ready-by"
            >
              {ready.map((r) => (
                <p key={r.so}>
                  {scopes.length > 1 ? `SO ${r.so} · ` : ""}
                  {AL_WORDS.pickupOn(chosenRow.name, fmtDate(r.pickupDay))} —{" "}
                  {AL_WORDS.readyBy}: <span className="font-semibold">{fmtDate(r.readyBy)}</span>
                </p>
              ))}
            </div>
          )}

          {ready.length > 0 && surchargeAreas.length > 0 && chosenRow && (
            <p className="text-meta text-kit-amber-11" data-testid="assign-logistics-surcharge">
              {AL_WORDS.surcharge(chosenRow.name, surchargeAreas.join(", "))}
            </p>
          )}

          {needsReason && (
            <>
              <p
                className="rounded-control bg-kit-amber-3 px-2 py-1.5 text-meta text-kit-amber-11"
                data-testid="assign-logistics-change-warning"
              >
                {AL_WORDS.changeWarn(changing)}
              </p>
              <label className="flex flex-col gap-1">
                <span className="text-meta font-medium text-kit-slate-12">{AL_WORDS.reason}</span>
                <select
                  className="h-8 rounded-control border border-kit-slate-6 px-2 text-body"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  data-testid="assign-logistics-reason"
                >
                  <option value="">{AL_WORDS.reasonPlaceholder}</option>
                  {CHANGE_LOGISTICS_REASONS.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-meta font-medium text-kit-slate-12">{AL_WORDS.note}</span>
            <input
              className="h-8 rounded-control border border-kit-slate-6 px-2 text-body"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              data-testid="assign-logistics-note"
            />
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-kit-slate-5 px-4 py-3">
          <button
            type="button"
            className="h-8 rounded-control border border-kit-slate-6 bg-white px-3 text-meta font-medium text-kit-slate-12 hover:bg-kit-slate-3"
            onClick={() => onOpenChange(false)}
          >
            {AL_WORDS.cancel}
          </button>
          <button
            type="button"
            className="h-8 rounded-control bg-kit-blue-9 px-3 text-meta font-semibold text-white hover:opacity-90 disabled:opacity-40"
            disabled={!chosen || (needsReason && !reason) || assign.isPending}
            onClick={submit}
            data-testid="assign-logistics-submit"
          >
            {needsReason ? AL_WORDS.submitChange : AL_WORDS.submit}
          </button>
        </div>
      </div>
    </div>
  );
}
