import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { qk } from "@/lib/queries";
import { apiFetch } from "@/lib/api";

/**
 * Phase 10 · Principal · Audit log — `reference/proto/principal-views.jsx`
 * L142-180 pixel parity.
 *
 * Read-only timeline. 8 role chips at top (all + 7 distinct roles) toggle a
 * filter; rows render in 3-col grid: role chip / action+actor / mono
 * timestamp. proto's 7 roles were principal/dealer/logistics/supplier/
 * finance/bd/system — v2 swaps `logistics` → `operation` per migration 0121
 * and drops `system` because the v2 audit_log doesn't synthesise system
 * actor rows yet.
 */

type AuditRow = {
  id: string;
  role: string | null;
  actor: string | null;
  action: string;
  dealerId: string | null;
  ref: string | null;
  occurredAt: string;
};

const ROLE_FILTERS = [
  "all",
  "principal",
  "dealer",
  "operation",
  "supplier",
  "partner",
  "finance",
  "bd",
] as const;

/**
 * MPR IS RETIRED FROM PRESENTATION (Purchasing Card 08, 2026-09-04). The
 * stored audit evidence is never rewritten — a legacy row still holds its
 * `MPR-…`/`REQ-…` token — but the SCREEN translates that token to the
 * visible label `Manual Purchase`. New Manual Purchase rows reference the
 * request UUID internally, and a UUID is never printed either.
 */
const LEGACY_REQUEST_TOKEN = /\b(?:MPR-\d{8}-\d{4}|REQ-\d+)\b/;
const UUID_TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function displayAction(action: string): string {
  return action.replace(
    new RegExp(LEGACY_REQUEST_TOKEN.source, "g"),
    "Manual Purchase",
  );
}

function displayRef(ref: string | null): string | null {
  if (!ref) return null;
  const trimmed = ref.trim();
  if (LEGACY_REQUEST_TOKEN.test(trimmed)) return "Manual Purchase";
  if (UUID_TOKEN.test(trimmed)) return null;
  return trimmed.slice(0, 8);
}

const ROLE_COLORS: Record<string, string> = {
  principal: "#D64F20",
  dealer:    "#3c5a78",
  operation: "#8a5a2b",
  supplier:  "#7a3f86",
  partner:   "#2f6a55",
  finance:   "#2e8a5a",
  bd:        "#6a4d8a",
};

export default function PrincipalAudit() {
  const [roleFilter, setRoleFilter] = useState<typeof ROLE_FILTERS[number]>("all");
  const { data, isLoading } = useQuery<{ rows: AuditRow[] }>({
    queryKey: qk.principal.audit({ role: roleFilter }),
    queryFn: () =>
      apiFetch(`/api/principal/audit${roleFilter === "all" ? "" : `?role=${roleFilter}`}`),
  });
  const rows = data?.rows ?? [];

  const formatTs = useMemo(() => {
    return (iso: string) => {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
  }, []);

  return (
    <div className="px-9 py-8 pb-14">
      <div className="mb-[22px]">
        <div className="kicker">HQ · Compliance</div>
        <h1 className="font-display text-page leading-[1.05] mt-1.5 tracking-[-0.025em] font-semibold">
          Audit log
        </h1>
        <div className="text-body text-base-600 mt-1.5">
          Every meaningful action, every role, immutable timeline.
        </div>
      </div>

      <div className="flex gap-1 mb-3.5 p-1 bg-base-100 rounded w-fit">
        {ROLE_FILTERS.map((r) => (
          <button
            key={r}
            onClick={() => setRoleFilter(r)}
            className={`px-3.5 py-1.5 text-meta rounded cursor-pointer capitalize ${
              roleFilter === r
                ? "bg-white text-base-900 font-semibold"
                : "text-base-600 font-medium"
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      <div className="bg-white border border-base-200 rounded">
        {isLoading && (
          <div className="p-8 text-center text-meta text-base-500">Loading…</div>
        )}
        {!isLoading && rows.length === 0 && (
          <div className="p-8 text-center text-meta text-base-500">No entries.</div>
        )}
        {rows.map((e, i) => (
          <div
            key={e.id}
            className={`px-[18px] py-3 grid gap-3.5 items-center text-body ${i ? "border-t border-base-100" : ""}`}
            style={{ gridTemplateColumns: "auto 1fr auto" }}
          >
            <RoleChip role={e.role ?? "system"} />
            <div className="min-w-0">
              <div className="text-base-900">{displayAction(e.action)}</div>
              <div className="text-label text-base-500 mt-0.5">
                {e.actor ?? "—"}
                {displayRef(e.ref) ? ` · ${displayRef(e.ref)}` : ""}
              </div>
            </div>
            <div className="font-mono text-label text-base-400 whitespace-nowrap">
              {formatTs(e.occurredAt)}
            </div>
          </div>
        ))}
      </div>

      {rows.length > 0 && (
        <div className="text-label text-base-500 mt-3 text-right">
          {rows.length} entries (latest first, max 500).
        </div>
      )}
    </div>
  );
}

function RoleChip({ role }: { role: string }) {
  const color = ROLE_COLORS[role] ?? "#5a5a5a";
  return (
    <span
      className="inline-block px-2.5 py-[2px] rounded bg-base-100 text-label font-semibold uppercase tracking-[0.05em]"
      style={{ color }}
    >
      {role}
    </span>
  );
}
