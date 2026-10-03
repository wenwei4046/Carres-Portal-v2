import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "./api";
import { useAuth } from "./auth";
import { qk, type GlobalActivityRow } from "./queries";

/** Reuses the shared immutable Activity feed. Addressing does not create work,
 * transfer the PIC, or turn the recipient into the recorded actor. */
export function useAddressedActivity() {
  const userId = useAuth((s) => s.user?.id);
  const role = useAuth((s) => s.role);
  const events = useQuery({
    queryKey: qk.operation.addressedActivity(userId ?? ""),
    queryFn: () => apiFetch<GlobalActivityRow[]>("/api/operation/activity?addressed=me"),
    enabled: Boolean(userId && (role === "operation" || role === "principal")), refetchInterval: 30_000,
  });
  useEffect(() => {
    if (!userId || !events.data) return;
    const key = `carres:activity-seen:${userId}`;
    let seen: string[] = [];
    try { seen = JSON.parse(localStorage.getItem(key) ?? "[]"); } catch { /* First visit. */ }
    if (!Array.isArray(seen)) seen = [];
    const latest = new Map<string, GlobalActivityRow>();
    for (const event of events.data) {
      if (event.detail?.recipient_id !== userId || !["amendment.submitted", "amendment.applied", "amendment.rejected"].includes(event.action ?? "")) continue;
      const amendment = String(event.detail.amendment_id ?? event.id);
      const previous = latest.get(amendment);
      if (!previous) latest.set(amendment, event);
      else if (!seen.includes(event.id)) seen.push(event.id);
    }
    // One current outcome per amendment; never flash "waiting" for an
    // amendment that already took effect. Bound simultaneous interruptions.
    for (const event of [...latest.values()].filter((e) => !seen.includes(e.id)).slice(0, 5).reverse()) {
      const state = event.detail?.status === "applied" ? "Saved" : event.detail?.status === "rejected" ? "Rejected" : "Submitted";
      toast.info(`SO-${event.so} · Amendment request · ${state}`, {
        id: `activity-${userId}-${event.id}`,
        description: event.actor_name ?? undefined,
        action: event.order_id ? { label: "View", onClick: () => { window.location.assign(`/operation/orders/so/${event.order_id}`); } } : undefined,
      });
      seen.push(event.id);
    }
    try { localStorage.setItem(key, JSON.stringify(seen.slice(-500))); } catch { /* Feed remains readable. */ }
  }, [events.data, userId]);
}
