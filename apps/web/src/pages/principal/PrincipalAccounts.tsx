import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  usePrincipalAccounts,
  useCreateAccount,
  useCreateStaff,
  usePrincipalDealers,
  usePrincipalEmailChanges,
  useDecideEmailChange,
  useSetAccountStatus,
  useResetAccountPassword,
  useStaffList,
  type AccountRow,
  type AppRole,
} from "@/lib/queries";
import { ApiError } from "@/lib/api";
// Aliased: this file already has a local `isShowroom` meaning "the ROLE being
// created is showroom". The shared helper answers a different question — "is
// THIS store row one of ours" — and reads `dealers.channel`.
import { minDeliveryDateISO, isShowroom as isShowroomStore } from "@carres/shared";
import type { CreatableAppRole, StaffColorKey, StaffGenderDto, StaffTierDto } from "@carres/shared";
import MYAddressFields from "@/components/MYAddressFields";
import { composeAddress } from "@/data/malaysia-postcodes";
import PrincipalStaffDrawer from "./PrincipalStaffDrawer";
import { ColorDotPicker, tierLabel } from "@/pages/dealer/staff/staff-ui";
import BirthdayWheelField from "@/pages/dealer/pos/date-keyin/BirthdayWheelField";

/**
 * Phase 10 · Principal · Accounts — `reference/proto/principal-accounts.jsx`
 * pixel parity (header + KPI tiles + filters + table + CreateAccountModal).
 *
 * Behavior parity:
 *   - List read from `GET /api/principal/accounts`
 *   - `+ New account` opens CreateAccountModal; on success invalidates the
 *     accounts query so the new row appears at the top.
 *   - Per-row actions surface based on status: active → Reset password +
 *     Disable; disabled → Re-enable. Proto's "Resend invite" mode is omitted
 *     for V1 because we don't email invites yet (no Supabase email template
 *     config) — accounts default to status='active' with a temp password.
 *
 * Color tone follows proto's role palette but translated to Tailwind tokens
 * defined in `apps/web/tailwind.config.ts`. Terracotta (proto's
 * `var(--brand-signature)`) ≡ `text-primary` / `bg-primary` in v2.
 *
 * Closes `phase-10-rotate-alpha-test-passwords` HIGH carry-forward.
 */

// 2026-07-18 (Loo) — the standalone Salesperson tile is GONE: floor staff are
// PIN identities provisioned inside a dealer/showroom store, not portal
// logins. Store-side choices = Dealer + Showroom only.
const ROLE_OPTIONS: { value: CreatableAppRole; label: string; hint: string }[] = [
  { value: "principal",   label: "Principal",     hint: "HQ · full access" },
  { value: "dealer",      label: "Dealer",        hint: "Owner · places orders" },
  { value: "showroom",    label: "Showroom",      hint: "Retail floor staff" },
  { value: "operation",   label: "Operations",    hint: "Warehouse + procurement" },
  { value: "supplier",    label: "Supplier",      hint: "External factory portal" },
  { value: "partner",     label: "Delivery Partner", hint: "Pickup + last mile" },
  { value: "finance",     label: "Finance",       hint: "AR / AP / payments" },
  { value: "bd",          label: "Business Dev",  hint: "Inquiries + dealer growth" },
  { value: "hr",          label: "HR",            hint: "Sales commission + staff" },
];

const ROLE_COLORS: Record<AppRole, string> = {
  principal:   "#D64F20", // var(--primary) — terracotta
  dealer:      "#3c5a78",
  salesperson: "#4a6a8a",
  showroom:    "#3c5a78",
  operation:   "#8a5a2b",
  supplier:    "#7a3f86",
  partner:     "#2f6a55",
  finance:     "#2e8a5a",
  bd:          "#6a4d8a",
  hr:          "#a8552f",
};

export default function PrincipalAccounts() {
  const { data, isLoading } = usePrincipalAccounts();
  const users = data?.users ?? [];

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | AppRole>("all");
  const [statusFilter, setStatusFilter] =
    useState<"all" | "active" | "invited" | "disabled">("all");
  // `?new=showroom` — the Showrooms page's "+ New showroom" button lands here
  // with the modal already open on the right role (Loo 2026-07-19), so opening
  // one of our own stores is a single click from where you noticed it missing.
  const [searchParams, setSearchParams] = useSearchParams();
  const openOnShowroom = searchParams.get("new") === "showroom";
  const [showCreate, setShowCreate] = useState(openOnShowroom);
  /** Close the modal AND drop `?new=` so a later "+ New account" opens plain. */
  function closeCreate() {
    setShowCreate(false);
    if (openOnShowroom) {
      const next = new URLSearchParams(searchParams);
      next.delete("new");
      setSearchParams(next, { replace: true });
    }
  }

  const filtered = useMemo(() => {
    return users.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (statusFilter !== "all" && u.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !u.name.toLowerCase().includes(q) &&
          !u.email.toLowerCase().includes(q) &&
          !(u.title ?? "").toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [users, roleFilter, statusFilter, search]);

  const total = users.length;
  const active = users.filter((u) => u.status === "active").length;
  const invited = users.filter((u) => u.status === "invited").length;
  const disabled = users.filter((u) => u.status === "disabled").length;

  return (
    <div className="px-9 py-8 pb-14">
      {/* Header */}
      <div className="flex items-end justify-between gap-6 mb-[22px] flex-wrap">
        <div>
          <div className="kicker">HQ · Admin</div>
          <h1 className="font-display text-[30px] leading-[1.05] mt-1.5 tracking-[-0.025em] font-semibold">
            Accounts
          </h1>
          <div className="text-[13px] text-base-600 mt-1.5">
            Provision portal access for every role. {total} accounts · {active} active
            · {invited} pending invite{disabled ? ` · ${disabled} disabled` : ""}.
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-[18px] py-[10px] bg-base-900 text-white text-[13px] font-semibold rounded inline-flex items-center gap-2 hover:bg-base-800 cursor-pointer"
        >
          <span className="text-[14px]">+</span> New account
        </button>
      </div>

      {/* 0240 — store email-change approvals (renders only when pending). */}
      <EmailChangeRequestsPanel />

      {/* KPI tiles */}
      <div className="grid gap-3 mb-[18px]" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <KpiTile label="Total accounts" value={total} sub="across all roles" />
        <KpiTile label="Active" value={active} sub="logged in recently" tone="success" />
        <KpiTile label="Pending invite" value={invited} sub="not yet accepted" tone="warn" />
        <KpiTile label="Disabled" value={disabled} sub="access revoked" />
      </div>

      {/* Filters */}
      <div className="flex gap-2.5 mb-3.5 flex-wrap items-center">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email, title…"
          className="flex-1 min-w-[220px] px-3 py-2 border border-base-200 rounded text-[13px] bg-white outline-none focus:border-base-700"
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as "all" | AppRole)}
          className="px-3 py-2 border border-base-200 rounded text-[13px] bg-white"
        >
          <option value="all">All roles</option>
          {ROLE_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
        <div className="flex gap-1 p-1 bg-base-100 rounded">
          {(["all", "active", "invited", "disabled"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setStatusFilter(k)}
              className={`px-3 py-1.5 text-[12px] rounded cursor-pointer ${
                statusFilter === k
                  ? "bg-white text-base-900 font-semibold"
                  : "text-base-600 font-medium"
              }`}
            >
              {k === "all" ? "All" : k.charAt(0).toUpperCase() + k.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-auto bg-white border border-base-200 rounded">
        <table className="w-full border-collapse text-[13px]" style={{ minWidth: 820 }}>
          <thead>
            <tr className="bg-base-50 border-b border-base-200">
              <Th>User</Th>
              <Th>Role</Th>
              <Th>Title</Th>
              <Th>Status</Th>
              <Th>Created</Th>
              <Th>Last seen</Th>
              <Th right>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="p-10 text-center text-[12px] text-base-500">
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="p-10 text-center text-[12px] text-base-500">
                  No accounts match those filters.
                </td>
              </tr>
            )}
            {filtered.map((u) => (
              <UserRow key={u.id} user={u} />
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreateAccountModal
          initialRole={openOnShowroom ? "showroom" : "dealer"}
          onClose={closeCreate}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------

/**
 * 0240 (Loo 2026-07-19) — store email-change approval queue. A dealer
 * principal files the request from the POS; approving here performs the REAL
 * login-email swap (service_role, /api/principal/accounts routes). Hidden
 * entirely while nothing is pending.
 */
export function EmailChangeRequestsPanel() {
  const { data } = usePrincipalEmailChanges();
  const decide = useDecideEmailChange();
  const pending = (data?.requests ?? []).filter((r) => r.status === "pending");
  if (pending.length === 0) return null;

  function approve(r: (typeof pending)[number]) {
    if (
      !confirm(
        `Approve changing ${r.dealerName ?? "this store"}'s login email to ${r.requestedEmail}?\n` +
          `(Currently ${r.currentEmail} — the store signs in with the new email once approved.)`,
      )
    ) {
      return;
    }
    decide.mutate(
      { id: r.id, action: "approve" },
      {
        onSuccess: () => toast.success(`Approved — ${r.requestedEmail} is now the login`),
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not approve"),
      },
    );
  }

  function reject(r: (typeof pending)[number]) {
    const note = prompt(
      `Reject ${r.dealerName ?? "this store"}'s email change — note for the store (optional):`,
    );
    if (note === null) return; // cancelled the dialog
    decide.mutate(
      { id: r.id, action: "reject", note: note.trim() || undefined },
      {
        onSuccess: () => toast.success("Rejected — the store will see your note"),
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not reject"),
      },
    );
  }

  return (
    <section
      className="rounded-md border border-warning/40 bg-warning-soft/40 p-5 mb-[22px]"
      data-testid="email-change-panel"
    >
      <h2 className="text-xs uppercase tracking-[0.16em] text-base-700 font-semibold mb-3">
        Store email change requests ({pending.length})
      </h2>
      <ul className="divide-y divide-border">
        {pending.map((r) => (
          <li
            key={r.id}
            className="py-2.5 flex items-center justify-between gap-3 flex-wrap"
            data-testid={`email-change-row-${r.id}`}
          >
            <div className="min-w-0 text-sm">
              <div className="font-medium">
                {r.dealerName ?? "—"}
                <span className="ml-2 text-[11px] text-muted-foreground font-normal">
                  by {r.requestedByName ?? "Store owner"} ·{" "}
                  {new Date(r.createdAt).toLocaleDateString("en-MY", {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
              </div>
              <div className="text-[12.5px] text-muted-foreground font-mono mt-0.5">
                {r.currentEmail} → <span className="text-foreground">{r.requestedEmail}</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                type="button"
                onClick={() => approve(r)}
                disabled={decide.isPending}
                data-testid={`email-change-approve-${r.id}`}
                className="text-[12px] font-semibold text-white bg-base-900 hover:bg-base-800 rounded px-3 py-1.5 disabled:opacity-50"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => reject(r)}
                disabled={decide.isPending}
                data-testid={`email-change-reject-${r.id}`}
                className="text-[12px] font-semibold text-destructive hover:bg-base-100 rounded px-3 py-1.5 disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-base-500 ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function KpiTile({ label, value, sub, tone }: { label: string; value: number; sub: string; tone?: "success" | "warn" }) {
  const valueClass =
    tone === "success" ? "text-success" :
    tone === "warn"    ? "text-primary" :
    "text-base-900";
  return (
    <div className="bg-white border border-base-200 rounded p-4">
      <div className="kicker text-[9px]">{label}</div>
      <div className={`font-display text-[28px] font-semibold mt-1.5 tracking-[-0.02em] ${valueClass}`}>
        {value}
      </div>
      <div className="text-[11px] text-base-500 mt-0.5">{sub}</div>
    </div>
  );
}

function UserRow({ user }: { user: AccountRow }) {
  const initials = user.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  // ROLE_COLORS is a total Record<AppRole, string>, so no fallback is needed
  // (the old grey hex fallback was dead code — dropped to keep the RULE A
  // hex ratchet at its baseline when the hr colour joined the record).
  const roleColor = ROLE_COLORS[user.role];
  const roleLabel = ROLE_OPTIONS.find((r) => r.value === user.role)?.label ?? user.role;

  const setStatus = useSetAccountStatus(user.id);
  const [showReset, setShowReset] = useState(false);
  const [showStaff, setShowStaff] = useState(false);

  const disable = () => {
    if (!confirm(`Disable ${user.name}? They will be signed out.`)) return;
    setStatus.mutate({ status: "disabled" });
  };
  const enable = () => setStatus.mutate({ status: "active" });

  // 0233 — HQ manages a store's PIN staff. Only dealer/showroom accounts have a
  // staff roster (they own a `dealers` row).
  const canManageStaff =
    (user.role === "dealer" || user.role === "showroom") && !!user.dealerId;

  return (
    <tr className="border-t border-base-100">
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <div
            className="w-[30px] h-[30px] rounded-full text-white grid place-items-center text-[10.5px] font-semibold flex-shrink-0"
            style={{ background: roleColor }}
          >
            {initials}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-base-900">{user.name}</div>
            <div className="text-[11px] text-base-500">{user.email}</div>
          </div>
        </div>
      </td>
      <td className="px-4 py-2.5">
        <div
          className="inline-block px-2.5 py-[2px] rounded bg-base-100 text-[10.5px] font-semibold uppercase tracking-[0.05em]"
          style={{ color: roleColor }}
        >
          {roleLabel}
        </div>
        {user.orgName && (
          <div className="text-[10.5px] text-base-500 mt-[3px]">{user.orgName}</div>
        )}
      </td>
      <td className="px-4 py-2.5 text-base-700">{user.title || "—"}</td>
      <td className="px-4 py-2.5"><StatusPill status={user.status} /></td>
      <td className="px-4 py-2.5 font-mono text-[11.5px] text-base-600">
        {user.createdAt?.slice(0, 10) ?? "—"}
      </td>
      <td className="px-4 py-2.5 text-[11.5px] text-base-500">
        {user.lastSeenAt ? user.lastSeenAt.slice(0, 10) : "—"}
      </td>
      <td className="px-4 py-2.5 text-right whitespace-nowrap">
        {canManageStaff && (
          <RowAction onClick={() => setShowStaff(true)}>Staff</RowAction>
        )}
        {user.status === "active" && (
          <>
            <RowAction onClick={() => setShowReset(true)}>Reset password</RowAction>
            <RowAction onClick={disable} tone="danger" disabled={setStatus.isPending}>
              Disable
            </RowAction>
          </>
        )}
        {user.status === "disabled" && (
          <RowAction onClick={enable} tone="success" disabled={setStatus.isPending}>
            Re-enable
          </RowAction>
        )}
        {showReset && (
          <ResetPasswordModal user={user} onClose={() => setShowReset(false)} />
        )}
        {showStaff && user.dealerId && (
          <PrincipalStaffDrawer
            dealerId={user.dealerId}
            storeKind={user.role === "showroom" ? "showroom" : "dealer"}
            orgName={user.orgName ?? user.name}
            onClose={() => setShowStaff(false)}
          />
        )}
      </td>
    </tr>
  );
}

function RowAction({
  children,
  onClick,
  tone,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: "danger" | "success";
  disabled?: boolean;
}) {
  const colorClass =
    tone === "danger"  ? "text-primary" :
    tone === "success" ? "text-success" :
    "text-base-700";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`ml-0.5 px-2.5 py-[5px] text-[11.5px] font-semibold rounded hover:bg-base-100 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${colorClass}`}
    >
      {children}
    </button>
  );
}

function StatusPill({ status }: { status: AccountRow["status"] }) {
  const map = {
    active:   { label: "Active",   bg: "bg-success-soft",      c: "text-success" },
    invited:  { label: "Invited",  bg: "bg-primary/10",        c: "text-primary" },
    disabled: { label: "Disabled", bg: "bg-base-100",          c: "text-base-500" },
  } as const;
  const m = map[status];
  return (
    <span className={`inline-block px-2.5 py-[2px] rounded text-[10.5px] font-semibold uppercase tracking-[0.05em] ${m.bg} ${m.c}`}>
      {m.label}
    </span>
  );
}

// ----------------------------------------------------------------------------
// Reset-password modal — the admin TYPES the new password (twice; Loo
// 2026-07-19: no auto-generated value) and hands it to the user out-of-band.
// ----------------------------------------------------------------------------

function ResetPasswordModal({ user, onClose }: { user: AccountRow; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const reset = useResetAccountPassword(user.id, {
    onSuccess: () => onClose(),
  });
  const valid = password.length >= 8 && password === confirmPw;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] grid place-items-center p-5"
      style={{ background: "rgba(20,18,16,0.55)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded w-full max-w-[460px] overflow-hidden"
      >
        <div className="px-6 pt-5 pb-4 border-b border-base-100">
          <div className="kicker text-[9px]">HQ · Admin</div>
          <h2 className="font-display text-[20px] mt-1 tracking-[-0.02em] font-semibold">
            Reset password
          </h2>
          {/* min-w-0 + break-words: long emails must wrap, never clip/overlap. */}
          <div className="text-[12px] text-base-600 mt-1 min-w-0 break-words leading-relaxed">
            {user.name} (<span className="break-all">{user.email}</span>) — type the new
            password, then give it to them directly. We don&apos;t email it.
          </div>
        </div>
        <div className="p-6 flex flex-col gap-3">
          <Field label="New password" hint="Min 8 characters">
            <Input type="password" value={password} onChange={setPassword} />
          </Field>
          <Field label="Confirm password" hint="Type it again · must match">
            <Input type="password" value={confirmPw} onChange={setConfirmPw} />
          </Field>
          {confirmPw.length > 0 && password !== confirmPw && (
            <div className="text-[12px] text-destructive">Passwords don&apos;t match.</div>
          )}
          {reset.isError && (
            <div className="text-[12px] text-primary">
              {reset.error?.message ?? "Reset failed"}
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-base-100 bg-base-50 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={reset.isPending}
            className="px-4 py-[9px] text-[13px] font-semibold text-base-600 rounded hover:bg-base-100 cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => reset.mutate({ tempPassword: password })}
            disabled={!valid || reset.isPending}
            className="px-[18px] py-[9px] bg-base-900 text-white text-[13px] font-semibold rounded hover:bg-base-800 cursor-pointer disabled:opacity-50"
          >
            {reset.isPending ? "Rotating…" : "Confirm reset"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Create-account modal — mirrors proto with role picker grid + conditional
// org-creation block for dealer/supplier/partner.
// ----------------------------------------------------------------------------

function CreateAccountModal({
  initialRole = "dealer",
  onClose,
}: {
  initialRole?: CreatableAppRole;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState({
    name: "",
    email: "",
    role: initialRole,
    title: "",
    companyName: "",
    // 2026-07-18 (Loo) — the store's FIRST staff identity + 6-digit PIN,
    // provisioned right here so the store is born ACTIVATED (first login
    // lands straight on the PIN screen). Dealer ladder defaults to Dealer
    // Principal; showroom caps at Sales Manager.
    staffName: "",
    staffRole: "principal" as StaffTierDto,
    staffPin: "",
    staffPinConfirm: "",
    // 0241 (Loo 2026-07-19) — profile parity with the POS Add-staff form: the
    // two staff-create doors collect the SAME data.
    staffEmail: "",
    staffBirthday: "",
    staffGender: "" as StaffGenderDto | "",
    staffPhone: "",
    staffColor: "flame" as StaffColorKey,
    // 2026-05-22 (Loo) — region dropped from the form (structured address
    // below carries state/city; region was a free-text duplicate). The DB
    // column stays — existing dealers retain their value; new creations get
    // "—" as the API-side default.
    // 2026-05-22 (Loo) — dealer address uses the same cascading MY picker as
    // the Sales Order customer address (Line 1 + optional Line 2 + state → city
    // → postcode). composeAddress() flattens these into the single string
    // dealers.address stores.
    addressLine1: "",
    addressLine2: "",
    addressState: "",
    addressCity: "",
    addressPostcode: "",
    // 2026-05-22 (Loo) — Malaysia SSM registration number, required for
    // dealer role. Old format "123456-A" or new 12-digit "201801234567".
    ssmCode: "",
    // 2026-05-22 (Loo) — dealer PIC name + phone (separate from the portal
    // user's name/email above — this is the dealer company's contact person
    // for ops/finance comms).
    contactName: "",
    contactPhone: "",
    // 2026-05-22 (Loo) — explicit name for the default outlet seeded at
    // create-account time. Server falls back to companyName when blank; the
    // UI pre-fills with companyName so the "common case = outlet name same
    // as company" path takes zero clicks.
    outletName: "",
    // 2026-07-19 (Loo) — the login password is typed MANUALLY (twice), not
    // auto-generated: the admin decides it and hands it over directly.
    tempPassword: "",
    tempPasswordConfirm: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // 2026-05-22 (Loo) — showroom is a dealer-with-channel='showroom' under the
  // hood. The wider `needsOrg` covers all roles that need a company row at
  // all (incl. supplier/partner); `dealerLike` is the store set that needs an
  // address + first-staff PIN. Since 2026-07-19 the full Malaysia-business
  // profile (SSM + PIC contact) is DEALER-ONLY — see `isShowroom` below.
  const needsOrg = draft.role === "dealer" || draft.role === "showroom" || draft.role === "supplier" || draft.role === "partner";
  const dealerLike = draft.role === "dealer" || draft.role === "showroom";
  // 2026-07-19 (Loo) — a showroom is Carres' OWN store: no company name, no
  // SSM, no PIC contact, no personal full-name/job-title. The form collapses
  // to Showroom name + login email + address + first staff PIN; the account's
  // display name auto-derives from the showroom name.
  const isShowroom = draft.role === "showroom";
  const create = useCreateAccount({
    onSuccess: () => onClose(),
  });

  // 2026-07-18 (Loo) — "existing organisation" mode: pick a store that already
  // exists and ONLY add a staff identity (Manager / Sales Person / Dealer
  // Principal) + PIN to it — no login, no re-entering address/SSM/contact.
  // Rides the principal staff-create endpoint (?dealerId=), zero new API.
  const [orgMode, setOrgMode] = useState<"new" | "existing">("new");
  const [existingDealerId, setExistingDealerIdRaw] = useState("");
  const existingMode = dealerLike && orgMode === "existing";
  const dealersQ = usePrincipalDealers({}, { enabled: existingMode });
  const existingStaffQ = useStaffList(existingDealerId || undefined, {
    enabled: existingMode && !!existingDealerId,
  });
  // The picked store's kind comes from the server; until it resolves, fall
  // back to the clicked role tile.
  const staffKind: "dealer" | "showroom" = existingMode
    ? (existingStaffQ.data?.storeKind ?? (draft.role === "showroom" ? "showroom" : "dealer"))
    : draft.role === "showroom"
      ? "showroom"
      : "dealer";
  const createStaff = useCreateStaff();

  function setExistingDealerId(id: string) {
    setExistingDealerIdRaw(id);
    if (errors.existingDealer) setErrors((e) => ({ ...e, existingDealer: "" }));
  }

  // A showroom pick can invalidate a previously chosen principal tier.
  useEffect(() => {
    if (staffKind === "showroom" && draft.staffRole === "principal") {
      setDraft((d) => ({ ...d, staffRole: "manager" }));
    }
  }, [staffKind, draft.staffRole]);

  function set<K extends keyof typeof draft>(k: K, v: (typeof draft)[K]) {
    setDraft((d) => {
      const next = { ...d, [k]: v };
      // Keep the initial-staff tier valid for the picked store kind: showrooms
      // have no principal tier; switching back to dealer restores the default.
      if (k === "role") {
        if (v === "showroom" && next.staffRole === "principal") next.staffRole = "manager";
        if (v === "dealer" && d.role !== "dealer") next.staffRole = "principal";
      }
      return next;
    });
    if (errors[k as string]) setErrors((e) => ({ ...e, [k as string]: "" }));
  }

  // MYAddressFields fires partial patches like `{ addressState: next,
  // addressCity: "", addressPostcode: "" }` when state changes (city/postcode
  // reset cascade). One merge, one error-clear pass per touched key.
  function setAddress(patch: Partial<typeof draft>) {
    setDraft((d) => ({ ...d, ...patch }));
    setErrors((e) => {
      const next = { ...e };
      for (const k of Object.keys(patch)) {
        if (next[k]) next[k] = "";
      }
      return next;
    });
  }

  function validate() {
    const e: Record<string, string> = {};
    // Existing-organisation mode: only the store pick + staff identity matter.
    if (existingMode) {
      if (!existingDealerId) e.existingDealer = "Pick a store";
      if (!draft.staffName.trim()) e.staffName = "Required";
      validateStaffProfile(e);
      if (!/^[0-9]{6}$/.test(draft.staffPin)) e.staffPin = "Must be exactly 6 digits";
      else if (draft.staffPinConfirm !== draft.staffPin) e.staffPinConfirm = "PINs don't match";
      setErrors(e);
      return Object.keys(e).length === 0;
    }
    // Showroom skips the personal full name — the account's display name
    // derives from the showroom name at submit.
    if (!isShowroom && !draft.name.trim()) e.name = "Required";
    if (!draft.email.trim()) e.email = "Required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email)) e.email = "Invalid email";
    if (needsOrg && !draft.companyName.trim()) e.companyName = "Required";
    // 2026-05-22 (Loo) — mirror Sales Order Step 1 address validation
    // (apps/web/src/pages/dealer/new-order/draft.ts step1FirstIssue): Line 1
    // ≥ 5 chars, state + city + postcode all picked. Line 2 stays optional.
    // SSM code: ≥ 6 chars (covers both old "123456-A" + new 12-digit format).
    if (dealerLike) {
      if (draft.addressLine1.trim().length < 5) e.addressLine1 = "Required (≥5 chars)";
      else if (!draft.addressState) e.addressState = "Required";
      else if (!draft.addressCity) e.addressCity = "Required";
      else if (!draft.addressPostcode) e.addressPostcode = "Required";
      // 2026-07-19 (Loo) — SSM + PIC contact are dealer-only: a showroom is
      // Carres' own store, no external company registration or PIC needed.
      if (draft.role === "dealer") {
        if (draft.ssmCode.trim().length < 6) e.ssmCode = "Required (≥6 chars)";
        if (draft.contactName.trim().length < 2) e.contactName = "Required";
        if (draft.contactPhone.trim().length < 7) e.contactPhone = "Required (≥7 digits)";
      }
      // 2026-07-18 (Loo) — first staff + PIN are part of store creation; the
      // PIN format is hard-gated to exactly 6 digits and must be typed TWICE.
      if (!draft.staffName.trim()) e.staffName = "Required";
      validateStaffProfile(e);
      if (!/^[0-9]{6}$/.test(draft.staffPin)) e.staffPin = "Must be exactly 6 digits";
      else if (draft.staffPinConfirm !== draft.staffPin) e.staffPinConfirm = "PINs don't match";
    }
    if (draft.tempPassword.length < 8) e.tempPassword = "Min 8 chars";
    else if (draft.tempPasswordConfirm !== draft.tempPassword)
      e.tempPasswordConfirm = "Passwords don't match";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  // 0241 profile parity — same requirements as the POS Add-staff form.
  function validateStaffProfile(e: Record<string, string>) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.staffEmail.trim())) e.staffEmail = "Valid email required";
    if (!draft.staffBirthday) e.staffBirthday = "Required";
    if (!draft.staffGender) e.staffGender = "Required";
  }

  /** The staff profile payload shared by both create doors. */
  function staffProfilePayload() {
    return {
      email: draft.staffEmail.trim().toLowerCase(),
      birthday: draft.staffBirthday,
      gender: draft.staffGender === "" ? undefined : draft.staffGender,
      phone: draft.staffPhone.trim() ? draft.staffPhone.trim() : undefined,
      color: draft.staffColor,
    };
  }

  function submit() {
    if (!validate()) return;
    if (existingMode) {
      createStaff.mutate(
        {
          dealerId: existingDealerId,
          name: draft.staffName.trim(),
          staffRole: draft.staffRole,
          pin: draft.staffPin,
          ...staffProfilePayload(),
        },
        {
          onSuccess: (s) => {
            toast.success(`Staff added · ${s.name}`);
            onClose();
          },
          onError: (err) =>
            toast.error(err instanceof ApiError ? err.message : "Could not add staff"),
        },
      );
      return;
    }
    // Dealer address: flatten the 5 structured fields into the single string
    // dealers.address stores (mirrors how composeAddress is used for the SO
    // customer_address path).
    const composedAddress = dealerLike
      ? composeAddress({
          line1: draft.addressLine1,
          line2: draft.addressLine2,
          state: draft.addressState,
          city: draft.addressCity,
          postcode: draft.addressPostcode,
        })
      : undefined;
    create.mutate({
      // Showroom: the account's display name IS the showroom name (there's no
      // separate person to name — it's Carres' own store login).
      name: isShowroom ? draft.companyName.trim() : draft.name.trim(),
      email: draft.email.trim().toLowerCase(),
      role: draft.role,
      title: isShowroom ? null : draft.title.trim() || null,
      companyName: needsOrg ? draft.companyName.trim() : undefined,
      // Region dropped from the form — API still accepts it (optional zod),
      // server-side defaults to "—" when absent (see accounts.ts dealer
      // insert). Existing dealers retain their region values.
      // outletName: send only if dealer/showroom AND non-blank; the server
      // falls back to companyName when this is omitted.
      outletName:
        dealerLike && draft.outletName.trim().length > 0
          ? draft.outletName.trim()
          : undefined,
      address: composedAddress,
      // Dealer-only business profile — a showroom (Carres' own store) sends
      // none of these; the server writes null.
      ssmCode: draft.role === "dealer" ? draft.ssmCode.trim() : undefined,
      contactName: draft.role === "dealer" ? draft.contactName.trim() : undefined,
      contactPhone: draft.role === "dealer" ? draft.contactPhone.trim() : undefined,
      tempPassword: draft.tempPassword,
      initialStaff: dealerLike
        ? {
            name: draft.staffName.trim(),
            staffRole: draft.staffRole,
            pin: draft.staffPin,
            ...staffProfilePayload(),
          }
        : undefined,
    });
  }

  const roleMeta = ROLE_OPTIONS.find((r) => r.value === draft.role);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] grid place-items-center p-5"
      style={{ background: "rgba(20,18,16,0.55)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded w-full overflow-auto"
        style={{ maxWidth: 560, maxHeight: "90vh" }}
      >
        <div className="px-6 pt-5 pb-4 border-b border-base-100">
          <div className="kicker text-[9px]">HQ · Admin</div>
          <h2 className="font-display text-[22px] mt-1 tracking-[-0.02em] font-semibold">
            New account
          </h2>
          <div className="text-[12px] text-base-600 mt-1">
            Provision portal access. Choose a role; we'll set up the right permissions.
          </div>
        </div>

        <div className="p-6 flex flex-col gap-4">
          {/* Role picker grid */}
          <Field label="Role" hint={roleMeta?.hint}>
            <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
              {ROLE_OPTIONS.map((r) => {
                const isActive = draft.role === r.value;
                return (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => set("role", r.value)}
                    className={`px-3 py-2.5 border-[1.5px] rounded text-left flex flex-col gap-px transition-colors cursor-pointer ${
                      isActive ? "" : "border-base-200 bg-white"
                    }`}
                    style={isActive ? {
                      borderColor: ROLE_COLORS[r.value],
                      background: `${ROLE_COLORS[r.value]}10`,
                    } : undefined}
                  >
                    <div
                      className="text-[12.5px] font-semibold"
                      style={{ color: isActive ? ROLE_COLORS[r.value] : undefined }}
                    >
                      {r.label}
                    </div>
                    <div className="text-[10.5px] text-base-500">{r.hint}</div>
                  </button>
                );
              })}
            </div>
          </Field>

          {/* 2026-07-18 (Loo) — dealer/showroom can either open a NEW store or
              pick an EXISTING one and only add staff (no address/SSM re-entry,
              no new login). */}
          {dealerLike && (
            <div className="flex gap-2">
              {(["new", "existing"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setOrgMode(m)}
                  data-testid={`acct-orgmode-${m}`}
                  className={`px-3 py-2 rounded border-[1.5px] text-[12px] font-semibold cursor-pointer transition-colors ${
                    orgMode === m
                      ? "border-base-900 bg-base-900 text-white"
                      : "border-base-200 bg-white text-base-600 hover:bg-base-50"
                  }`}
                >
                  {m === "new" ? "New organisation" : "Existing organisation · add staff only"}
                </button>
              ))}
            </div>
          )}

          {existingMode && (
            <div className="p-3.5 bg-base-50 border border-base-200 rounded flex flex-col gap-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-base-700">
                Existing organisation
              </div>
              <Field
                label="Store"
                hint="Company / SSM / address stay untouched — you're only adding a staff identity + PIN"
                error={errors.existingDealer}
              >
                <select
                  value={existingDealerId}
                  onChange={(e) => setExistingDealerId(e.target.value)}
                  data-testid="acct-existing-store"
                  className="w-full px-3 py-2.5 border border-base-200 rounded text-[13px] bg-white cursor-pointer"
                >
                  <option value="">— pick a store —</option>
                  {/* Grouped so our own showrooms never read as dealerships
                      (Loo 2026-07-19). Partitioned with the shared helper, not
                      `=== 'showroom'` per group, so an unexpected channel value
                      lands under Dealers rather than vanishing. */}
                  {[
                    { label: "Our showrooms", mine: true },
                    { label: "Dealers", mine: false },
                  ].map(({ label, mine }) => {
                    const rows = (dealersQ.data?.dealers ?? []).filter(
                      (d) => isShowroomStore(d.channel) === mine,
                    );
                    if (rows.length === 0) return null;
                    return (
                      <optgroup key={label} label={label}>
                        {rows.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              </Field>
              {existingDealerId && existingStaffQ.data && (
                <div className="text-[11px] text-base-500">
                  {existingStaffQ.data.storeKind === "showroom" ? "Showroom" : "Dealer"} ·{" "}
                  {existingStaffQ.data.staff.filter((s) => s.active).length} existing staff
                </div>
              )}
            </div>
          )}

          {/* 2026-07-19 (Loo) — showroom is Carres' own store: no personal
              full name / job title. Only the login email remains. */}
          {!existingMode && isShowroom && (
            <Field label="Email address" hint="The store's login" error={errors.email}>
              <Input
                type="email"
                value={draft.email}
                onChange={(v) => set("email", v)}
                placeholder="e.g. kl-showroom@carres.com"
              />
            </Field>
          )}

          {!existingMode && !isShowroom && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Full name" error={errors.name}>
                  <Input value={draft.name} onChange={(v) => set("name", v)} placeholder="e.g. Lily Ong" />
                </Field>
                <Field label="Email address" error={errors.email}>
                  <Input
                    type="email"
                    value={draft.email}
                    onChange={(v) => set("email", v)}
                    placeholder="name@company.com"
                  />
                </Field>
              </div>

              <Field label="Job title" hint="Optional · shown in audit log + sidebar profile">
                <Input value={draft.title} onChange={(v) => set("title", v)} placeholder="e.g. Owner, Warehouse Manager" />
              </Field>
            </>
          )}

          {needsOrg && !existingMode && (
            <div className="p-3.5 bg-base-50 border border-base-200 rounded flex flex-col gap-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-base-700">
                {/* 2026-07-19 (Loo) — a showroom is Carres' own store, not an
                    external organisation: one name field, no SSM/PIC. */}
                {draft.role === "showroom"
                  ? "New showroom"
                  : `New ${
                      draft.role === "dealer"
                        ? "dealer"
                        : draft.role === "supplier"
                          ? "supplier"
                          : "delivery partner"
                    } organisation`}
              </div>
              <Field
                label={isShowroom ? "Showroom name" : "Company name"}
                hint={isShowroom ? "Carres' own store · also used as the outlet + account name" : undefined}
                error={errors.companyName}
              >
                <Input
                  value={draft.companyName}
                  onChange={(v) => set("companyName", v)}
                  placeholder={
                    draft.role === "dealer"
                      ? "e.g. BedHouse KL Sdn Bhd"
                      : draft.role === "showroom"
                        ? "e.g. Carres KL Showroom"
                        : draft.role === "supplier"
                          ? "e.g. Ohana Industries"
                          : "e.g. JT Express"
                  }
                />
              </Field>
              {draft.role === "dealer" && (
                <>
                  <Field label="Outlet name" hint="Default outlet · falls back to company name when blank">
                    <Input
                      value={draft.outletName}
                      onChange={(v) => set("outletName", v)}
                      placeholder={draft.companyName || "Same as company name"}
                    />
                  </Field>
                  <Field label="SSM code" hint="Required · company registration number (e.g. 201801234567 or 123456-A)" error={errors.ssmCode}>
                    <Input
                      value={draft.ssmCode}
                      onChange={(v) => set("ssmCode", v)}
                      placeholder="201801234567"
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Contact person" hint="Required · dealer PIC name" error={errors.contactName}>
                      <Input
                        value={draft.contactName}
                        onChange={(v) => set("contactName", v)}
                        placeholder="e.g. Aisha Rahman"
                      />
                    </Field>
                    <Field label="Contact phone" hint="Required" error={errors.contactPhone}>
                      <Input
                        value={draft.contactPhone}
                        onChange={(v) => set("contactPhone", v)}
                        placeholder="e.g. 012-3344556"
                      />
                    </Field>
                  </div>
                </>
              )}
              {dealerLike && (
                <>
                  <div>
                    <div className="text-[9.5px] uppercase tracking-wider text-base-500 font-semibold mb-1">
                      Business address
                    </div>
                    <div className="text-[10px] text-base-500 mb-2 leading-snug">
                      Required · prints on Sales Order PDFs when no outlet is attached
                    </div>
                    <MYAddressFields
                      data={{
                        addressLine1: draft.addressLine1,
                        addressLine2: draft.addressLine2,
                        addressState: draft.addressState,
                        addressCity: draft.addressCity,
                        addressPostcode: draft.addressPostcode,
                      }}
                      onChange={setAddress}
                    />
                    {(errors.addressLine1 ||
                      errors.addressState ||
                      errors.addressCity ||
                      errors.addressPostcode) && (
                      <div className="text-[11px] text-destructive mt-1.5">
                        {errors.addressLine1 ||
                          errors.addressState ||
                          errors.addressCity ||
                          errors.addressPostcode}
                      </div>
                    )}
                  </div>
                </>
              )}
              <div className="text-[11px] text-base-500 leading-relaxed">
                {isShowroom
                  ? "Carres' own store — no company registration or contact person needed. The email above becomes its login."
                  : `A new ${draft.role} record will be created and this user will be the owner.`}
              </div>
            </div>
          )}

          {/* 2026-07-18 (Loo) — first staff identity + 6-digit PIN, provisioned
              with the store so it opens ACTIVATED (first login = PIN screen).
              Dealer ladder: Dealer Principal / Manager / Sales Person.
              Showroom ladder: Sales Manager / Sales Executive (no principal —
              that's Carres itself). */}
          {dealerLike && (
            <div className="p-3.5 bg-base-50 border border-base-200 rounded flex flex-col gap-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-base-700">
                {existingMode ? "New staff · PIN sign-in" : "First staff · PIN sign-in"}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Staff name" error={errors.staffName}>
                  <Input
                    value={draft.staffName}
                    onChange={(v) => set("staffName", v)}
                    placeholder={draft.contactName || "e.g. Aisha Rahman"}
                  />
                </Field>
                <Field label="Position">
                  <select
                    value={draft.staffRole}
                    onChange={(e) => set("staffRole", e.target.value as StaffTierDto)}
                    className="w-full px-3 py-2 border border-base-200 rounded text-[13px] bg-white cursor-pointer"
                    data-testid="acct-staff-tier"
                  >
                    {(staffKind === "showroom"
                      ? (["manager", "salesperson"] as StaffTierDto[])
                      : (["principal", "manager", "salesperson"] as StaffTierDto[])
                    ).map((t) => (
                      <option key={t} value={t}>
                        {tierLabel(t, staffKind)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              {/* 0241 — profile parity with the POS Add-staff form. */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Email" error={errors.staffEmail}>
                  <Input
                    value={draft.staffEmail}
                    onChange={(v) => set("staffEmail", v)}
                    placeholder="aisha@store.com"
                  />
                </Field>
                <Field label="Phone (optional)">
                  <Input
                    value={draft.staffPhone}
                    onChange={(v) => set("staffPhone", v)}
                    placeholder="012-3456789"
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Birthday" error={errors.staffBirthday}>
                  {/* Same drum picker as the Sales Order customer birthday. */}
                  <BirthdayWheelField
                    value={draft.staffBirthday}
                    todayIso={minDeliveryDateISO(0)}
                    onChange={(iso) => set("staffBirthday", iso)}
                    testId="acct-staff-birthday"
                  />
                </Field>
                <Field label="Gender" error={errors.staffGender}>
                  <select
                    value={draft.staffGender}
                    onChange={(e) => set("staffGender", e.target.value as StaffGenderDto | "")}
                    data-testid="acct-staff-gender"
                    className="w-full px-3 py-2 border border-base-200 rounded text-[13px] bg-white cursor-pointer"
                  >
                    <option value="">— select —</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </Field>
              </div>
              <Field label="Avatar colour">
                <ColorDotPicker
                  value={draft.staffColor}
                  onChange={(c) => set("staffColor", c)}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="PIN code"
                  hint="Exactly 6 digits · unlocks the POS staff screen"
                  error={errors.staffPin}
                >
                  <Input
                    value={draft.staffPin}
                    onChange={(v) => set("staffPin", v.replace(/[^0-9]/g, "").slice(0, 6))}
                    placeholder="e.g. 224466"
                  />
                </Field>
                <Field
                  label="Confirm PIN"
                  hint="Type it again · must match"
                  error={errors.staffPinConfirm}
                >
                  <Input
                    value={draft.staffPinConfirm}
                    onChange={(v) => set("staffPinConfirm", v.replace(/[^0-9]/g, "").slice(0, 6))}
                    placeholder="e.g. 224466"
                  />
                </Field>
              </div>
              {draft.staffPinConfirm.length === 6 && draft.staffPin !== draft.staffPinConfirm && (
                <div className="text-[11px] text-destructive -mt-1.5">PINs don't match.</div>
              )}
            </div>
          )}

          {/* 2026-07-19 (Loo) — the login password is typed manually (twice),
              never auto-generated. */}
          {!existingMode && (
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Login password"
                hint="Min 8 characters · give it to the user directly"
                error={errors.tempPassword}
              >
                <Input
                  type="password"
                  value={draft.tempPassword}
                  onChange={(v) => set("tempPassword", v)}
                />
              </Field>
              <Field
                label="Confirm password"
                hint="Type it again · must match"
                error={errors.tempPasswordConfirm}
              >
                <Input
                  type="password"
                  value={draft.tempPasswordConfirm}
                  onChange={(v) => set("tempPasswordConfirm", v)}
                />
              </Field>
            </div>
          )}

          {!existingMode && create.isError && (
            <div className="text-[12px] text-primary">
              {create.error?.message ?? "Account creation failed"}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-base-100 bg-base-50 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={create.isPending || createStaff.isPending}
            className="px-4 py-[9px] text-[13px] font-semibold text-base-600 rounded hover:bg-base-100 cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={create.isPending || createStaff.isPending}
            className="px-[18px] py-[9px] bg-base-900 text-white text-[13px] font-semibold rounded hover:bg-base-800 cursor-pointer disabled:opacity-50"
          >
            {existingMode
              ? createStaff.isPending
                ? "Adding…"
                : "Add staff"
              : create.isPending
                ? "Creating…"
                : "Create account"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <FieldLabel>{label}</FieldLabel>
        {error && <span className="text-[11px] text-primary">{error}</span>}
      </div>
      {children}
      {hint && !error && <div className="text-[11px] text-base-500 mt-1">{hint}</div>}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-base-700">
      {children}
    </label>
  );
}

function Input({ value, onChange, type = "text", placeholder }: { value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2.5 border border-base-200 rounded text-[13px] bg-white outline-none focus:border-base-700"
    />
  );
}

