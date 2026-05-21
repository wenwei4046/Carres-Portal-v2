import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import {
  usePrincipalDealer,
  useDealerSetStatus,
  useUpdateDealer,
  type PrincipalDealerRecentOrder,
} from "@/lib/queries";
import { TOAST } from "@/lib/toast-copy";
import DealerStatusPill from "./DealerStatusPill";

/**
 * Right slide-in drawer for a single dealer. Mirrors the proto's
 * `DealerDrawer` (`reference/proto/principal-dealers.jsx` lines 121-225)
 * minus the Credit terms editor — Carres business model has no HQ→dealer
 * credit (customer pays HQ direct; dealer just sells), so credit_limit /
 * payment_terms columns stay unused in the schema and absent from this UI.
 *
 * Layout (top → bottom):
 *   1. Header — dealer id kicker (first 8 chars) + name + close X
 *   2. Status pill + region/joined date row
 *   3. Stat tiles — Orders / GMV / Outstanding (3-col)
 *   4. Recent orders panel (last 8) or empty placeholder
 *   5. Action footer — status-aware:
 *        active    → Suspend (with window.confirm)
 *        suspended → Reactivate
 *        pending   → "Awaiting approval · review in Approvals tab"
 *        rejected  → "Application rejected." (no actions)
 *
 * Outstanding semantic: `orders.total - orders.paid` summed across this
 * dealer's orders = how much end customers still owe HQ via this dealer.
 * Dealers chase customers for the 50% top-up gate before they can proceed
 * an order (see Phase 2C `proceedBlockers` payment_below_50 code).
 *
 * Data source: `usePrincipalDealer(dealerId)` returns
 *   { dealer (snake_case), recentOrders (camelCase) } — the mixed casing
 *   is intentional Phase 2C-aligned (server returns whatever the RPC
 *   produces) and we render both shapes inline rather than re-adapt.
 *
 * Suspend uses `window.confirm` to match the proto. Per global CLAUDE.md
 * #5 (Surgical Changes), this is a single one-shot dialog — no need to
 * pull in a custom AlertDialog primitive for one button.
 */
interface Props {
  dealerId: string;
  onClose: () => void;
}

export default function DealerDrawer({ dealerId, onClose }: Props) {
  const { data, isLoading } = usePrincipalDealer(dealerId);
  const setStatus = useDealerSetStatus(dealerId);
  const update = useUpdateDealer(dealerId);

  // 2026-05-22 (Loo) — local editor state for the four newer fields. Synced
  // from server data via the effect below; touching any input flips dirty so
  // the Save button enables. Address stays as a plain textarea for the v1
  // editor (cascade-pre-fill would need a parser; deferred).
  const [draft, setDraft] = useState({
    address: "",
    ssmCode: "",
    contactName: "",
    contactPhone: "",
  });
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (data?.dealer) {
      setDraft({
        address: data.dealer.address ?? "",
        ssmCode: data.dealer.ssm_code ?? "",
        contactName: data.dealer.contact_name ?? "",
        contactPhone: data.dealer.contact_phone ?? "",
      });
      setDirty(false);
    }
  }, [data?.dealer]);

  if (isLoading || !data) {
    return (
      <div className="fixed inset-0 z-[90] flex justify-end">
        <button
          type="button"
          aria-label="Close drawer"
          onClick={onClose}
          className="absolute inset-0 bg-black/40 cursor-pointer border-0 p-0"
        />
        <div
          className="relative bg-white h-screen p-7"
          style={{ width: 520 }}
        >
          <div className="text-base-500 text-[13px]">Loading…</div>
        </div>
      </div>
    );
  }

  const dealer = data.dealer;
  const recentOrders = data.recentOrders ?? [];
  const outstandingNum = Number(dealer.outstanding ?? 0);

  function setField<K extends keyof typeof draft>(k: K, v: string) {
    setDraft((d) => ({ ...d, [k]: v }));
    setDirty(true);
  }

  async function saveProfile() {
    // Send only fields that changed AND meet min-length (server zod has
    // floors at address ≥ 5 / ssm ≥ 6 / name ≥ 2 / phone ≥ 7); pushing
    // shorter values would 422.
    const payload: Record<string, string> = {};
    if (draft.address.trim().length >= 5 && draft.address !== (dealer.address ?? "")) {
      payload.address = draft.address.trim();
    }
    if (draft.ssmCode.trim().length >= 6 && draft.ssmCode !== (dealer.ssm_code ?? "")) {
      payload.ssmCode = draft.ssmCode.trim();
    }
    if (
      draft.contactName.trim().length >= 2 &&
      draft.contactName !== (dealer.contact_name ?? "")
    ) {
      payload.contactName = draft.contactName.trim();
    }
    if (
      draft.contactPhone.trim().length >= 7 &&
      draft.contactPhone !== (dealer.contact_phone ?? "")
    ) {
      payload.contactPhone = draft.contactPhone.trim();
    }
    if (Object.keys(payload).length === 0) {
      toast.info("No changes to save");
      return;
    }
    try {
      await update.mutateAsync(payload);
      toast.success(`${dealer.name} profile updated`);
      setDirty(false);
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        toast.error(e.message || "Failed to update dealer");
      } else {
        toast.error(e instanceof Error ? e.message : "Failed to update dealer");
      }
    }
  }

  async function suspend() {
    if (
      !window.confirm(
        `Suspend ${dealer.name}? They won't be able to place new orders.`,
      )
    ) {
      return;
    }
    try {
      await setStatus.mutateAsync({ status: "suspended" });
      toast.success(TOAST.suspendSuccess(dealer.name));
      onClose();
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        toast.error(e.message || "Failed to suspend dealer");
      } else {
        toast.error(e instanceof Error ? e.message : "Failed to suspend dealer");
      }
    }
  }

  async function reactivate() {
    try {
      await setStatus.mutateAsync({ status: "active" });
      toast.success(TOAST.reactivateSuccess(dealer.name));
      onClose();
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        toast.error(e.message || "Failed to reactivate dealer");
      } else {
        toast.error(e instanceof Error ? e.message : "Failed to reactivate dealer");
      }
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex justify-end">
      <button
        type="button"
        aria-label="Close drawer"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 cursor-pointer border-0 p-0"
      />
      <div
        className="relative bg-white h-screen overflow-auto p-7"
        style={{ width: 520 }}
      >
        <div className="flex justify-between items-start mb-[18px]">
          <div>
            <div className="kicker">{dealer.id.slice(0, 8)}</div>
            <h2 className="font-display text-[22px] leading-tight mt-1 tracking-tight font-semibold">
              {dealer.name}
            </h2>
            <div className="text-[12px] text-base-600 mt-1">
              {dealer.contact ?? "—"}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-base-500 text-lg bg-transparent border-0 cursor-pointer leading-none px-1"
          >
            ×
          </button>
        </div>

        <div className="flex gap-2 mb-[18px] items-center">
          <DealerStatusPill status={dealer.status} />
          <span className="text-[11.5px] text-base-500">
            {dealer.region} · joined {dealer.joined_date ?? "—"}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-[22px]">
          <Stat label="Orders" v={dealer.order_count ?? 0} />
          <Stat
            label="GMV"
            v={`RM ${(Number(dealer.gmv ?? 0) / 1000).toFixed(1)}k`}
          />
          <Stat
            label="Outstanding"
            v={
              outstandingNum > 0
                ? `RM ${outstandingNum.toLocaleString()}`
                : "—"
            }
            accent={outstandingNum > 0}
          />
        </div>

        <div className="mb-[18px]">
          <div className="text-[10px] uppercase tracking-wider text-base-500 font-semibold mb-2">
            Recent orders
          </div>
          {recentOrders.length > 0 ? (
            <div className="bg-white border border-base-200 rounded-md">
              {recentOrders.map((o: PrincipalDealerRecentOrder, i: number) => (
                <div
                  key={o.id}
                  className={`px-3.5 py-2.5 flex justify-between text-[12px] ${
                    i ? "border-t border-base-100" : ""
                  }`}
                >
                  <div>
                    <div className="font-mono text-[11px] font-semibold">
                      SO-{o.so}
                    </div>
                    <div className="text-[11px] text-base-500">
                      {o.customerName ?? "—"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-semibold">
                      RM {Number(o.total).toLocaleString()}
                    </div>
                    <div className="text-[10px] text-base-500 uppercase">
                      {o.status.replace("_", " ")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-base-50 rounded-md p-6 text-center text-[12px] text-base-500">
              No orders yet.
            </div>
          )}
        </div>

        {/* 2026-05-22 (Loo) — profile editor. Backfills the four fields
            added in migrations 0144/0145/0146 (address, ssm_code, contact_name,
            contact_phone) for existing dealers, and lets the principal correct
            them later. Save button disabled until something changes. */}
        <div className="mb-[18px] pt-[18px] border-t border-base-100">
          <div className="text-[10px] uppercase tracking-wider text-base-500 font-semibold mb-2">
            Dealer profile
          </div>
          <div className="grid gap-3">
            <ProfileField label="SSM code">
              <input
                value={draft.ssmCode}
                onChange={(e) => setField("ssmCode", e.target.value)}
                placeholder="e.g. 201801234567"
                className="w-full px-3 py-2 border border-base-200 rounded text-[13px] outline-none focus:border-primary"
              />
            </ProfileField>
            <div className="grid grid-cols-2 gap-3">
              <ProfileField label="Contact person">
                <input
                  value={draft.contactName}
                  onChange={(e) => setField("contactName", e.target.value)}
                  placeholder="e.g. Aisha Rahman"
                  className="w-full px-3 py-2 border border-base-200 rounded text-[13px] outline-none focus:border-primary"
                />
              </ProfileField>
              <ProfileField label="Contact phone">
                <input
                  value={draft.contactPhone}
                  onChange={(e) => setField("contactPhone", e.target.value)}
                  placeholder="e.g. 012-3344556"
                  className="w-full px-3 py-2 border border-base-200 rounded text-[13px] outline-none focus:border-primary"
                />
              </ProfileField>
            </div>
            <ProfileField label="Business address" hint="Single text field — full address line">
              <textarea
                value={draft.address}
                onChange={(e) => setField("address", e.target.value)}
                placeholder="109, Jalan SS 25/2, Taman Mayang, 47301 Petaling Jaya, Selangor"
                rows={3}
                className="w-full px-3 py-2 border border-base-200 rounded text-[13px] outline-none focus:border-primary resize-none"
              />
            </ProfileField>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={saveProfile}
                disabled={!dirty || update.isPending}
                className="btn-primary disabled:opacity-50"
              >
                {update.isPending ? "Saving…" : "Save profile"}
              </button>
            </div>
          </div>
        </div>

        <div className="pt-[18px] border-t border-base-100 flex gap-2">
          {dealer.status === "active" && (
            <button
              type="button"
              onClick={suspend}
              disabled={setStatus.isPending}
              className="btn-secondary flex-1 text-primary disabled:opacity-50"
            >
              Suspend
            </button>
          )}
          {dealer.status === "suspended" && (
            <button
              type="button"
              onClick={reactivate}
              disabled={setStatus.isPending}
              className="btn-primary flex-1 disabled:opacity-50"
            >
              Reactivate
            </button>
          )}
          {dealer.status === "pending" && (
            <div className="flex-1 text-[11.5px] text-base-500 text-center p-2">
              Awaiting approval · review in{" "}
              <strong className="text-primary">Approvals</strong> tab
            </div>
          )}
          {dealer.status === "rejected" && (
            <div className="flex-1 text-[11.5px] text-base-500 text-center p-2">
              Application rejected.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Editor-row label + optional hint, used by the dealer profile editor. */
function ProfileField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[9.5px] uppercase tracking-wider text-base-500 font-semibold mb-1">
        {label}
      </div>
      {hint ? (
        <div className="text-[10px] text-base-500 mb-1.5 leading-snug">{hint}</div>
      ) : null}
      {children}
    </div>
  );
}

/** Stat tile inside the drawer header strip. Three of these per drawer. */
function Stat({
  label,
  v,
  accent,
}: {
  label: string;
  v: string | number;
  accent?: boolean;
}) {
  return (
    <div className="bg-base-50 p-3 rounded">
      <div className="text-[9.5px] uppercase tracking-wider text-base-500 font-semibold mb-1">
        {label}
      </div>
      <div
        className={`font-mono text-base font-bold ${
          accent ? "text-primary" : "text-base-900"
        }`}
      >
        {v}
      </div>
    </div>
  );
}
