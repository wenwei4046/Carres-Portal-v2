import { useMemo, useState } from "react";
import {
  usePrincipalAccounts,
  useCreateAccount,
  useSetAccountStatus,
  useResetAccountPassword,
  type AccountRow,
  type AppRole,
} from "@/lib/queries";
import MYAddressFields from "@/components/MYAddressFields";
import { composeAddress } from "@/data/malaysia-postcodes";

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

const ROLE_OPTIONS: { value: AppRole; label: string; hint: string }[] = [
  { value: "principal",   label: "Principal",     hint: "HQ · full access" },
  { value: "dealer",      label: "Dealer",        hint: "Owner · places orders" },
  { value: "salesperson", label: "Salesperson",   hint: "Outlet rep · places orders" },
  { value: "showroom",    label: "Showroom",      hint: "Retail floor staff" },
  { value: "operation",   label: "Operations",    hint: "Warehouse + procurement" },
  { value: "supplier",    label: "Supplier",      hint: "External factory portal" },
  { value: "partner",     label: "Delivery Partner", hint: "Pickup + last mile" },
  { value: "finance",     label: "Finance",       hint: "AR / AP / payments" },
  { value: "bd",          label: "Business Dev",  hint: "Inquiries + dealer growth" },
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
};

export default function PrincipalAccounts() {
  const { data, isLoading } = usePrincipalAccounts();
  const users = data?.users ?? [];

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | AppRole>("all");
  const [statusFilter, setStatusFilter] =
    useState<"all" | "active" | "invited" | "disabled">("all");
  const [showCreate, setShowCreate] = useState(false);

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
        <CreateAccountModal onClose={() => setShowCreate(false)} />
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------

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
  const roleColor = ROLE_COLORS[user.role] ?? "#5a5a5a";
  const roleLabel = ROLE_OPTIONS.find((r) => r.value === user.role)?.label ?? user.role;

  const setStatus = useSetAccountStatus(user.id);
  const [showReset, setShowReset] = useState(false);

  const disable = () => {
    if (!confirm(`Disable ${user.name}? They will be signed out.`)) return;
    setStatus.mutate({ status: "disabled" });
  };
  const enable = () => setStatus.mutate({ status: "active" });

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
// Reset-password modal — confirms before flipping a password since the new
// value needs to be communicated to the user out-of-band.
// ----------------------------------------------------------------------------

function ResetPasswordModal({ user, onClose }: { user: AccountRow; onClose: () => void }) {
  const [tempPassword, setTempPassword] = useState(generateTempPassword);
  const reset = useResetAccountPassword(user.id, {
    onSuccess: () => onClose(),
  });

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
          <div className="text-[12px] text-base-600 mt-1">
            {user.name} ({user.email}). Give them the new password directly — we
            don't email it.
          </div>
        </div>
        <div className="p-6 flex flex-col gap-3">
          <FieldLabel>New temporary password</FieldLabel>
          <div className="flex items-center gap-2 px-3 py-2 bg-base-50 border border-base-200 rounded">
            <code className="flex-1 font-mono text-[13px] text-base-900 tracking-[0.05em]">
              {tempPassword}
            </code>
            <button
              onClick={() => setTempPassword(generateTempPassword())}
              className="text-[11px] font-semibold text-base-600 px-2 py-1 border border-base-200 rounded hover:bg-white cursor-pointer"
            >
              ↻ Regenerate
            </button>
          </div>
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
            onClick={() => reset.mutate({ tempPassword })}
            disabled={reset.isPending}
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

function CreateAccountModal({ onClose }: { onClose: () => void }) {
  const [draft, setDraft] = useState({
    name: "",
    email: "",
    role: "dealer" as AppRole,
    title: "",
    companyName: "",
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
    tempPassword: generateTempPassword(),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // 2026-05-22 (Loo) — showroom shares the dealer schema (channel='showroom'
  // under the hood) so it carries the same SSM + contact + address + outlet
  // requirements. The wider `needsOrg` covers all roles that need a company
  // row at all (incl. supplier/partner); `dealerLike` is the stricter set
  // that needs the full Malaysia-business profile.
  const needsOrg = draft.role === "dealer" || draft.role === "showroom" || draft.role === "supplier" || draft.role === "partner";
  const dealerLike = draft.role === "dealer" || draft.role === "showroom";
  const create = useCreateAccount({
    onSuccess: () => onClose(),
  });

  function set<K extends keyof typeof draft>(k: K, v: (typeof draft)[K]) {
    setDraft((d) => ({ ...d, [k]: v }));
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
    if (!draft.name.trim()) e.name = "Required";
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
      if (draft.ssmCode.trim().length < 6) e.ssmCode = "Required (≥6 chars)";
      if (draft.contactName.trim().length < 2) e.contactName = "Required";
      if (draft.contactPhone.trim().length < 7) e.contactPhone = "Required (≥7 digits)";
    }
    if (draft.tempPassword.length < 8) e.tempPassword = "Min 8 chars";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function submit() {
    if (!validate()) return;
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
      name: draft.name.trim(),
      email: draft.email.trim().toLowerCase(),
      role: draft.role,
      title: draft.title.trim() || null,
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
      ssmCode: dealerLike ? draft.ssmCode.trim() : undefined,
      contactName: dealerLike ? draft.contactName.trim() : undefined,
      contactPhone: dealerLike ? draft.contactPhone.trim() : undefined,
      tempPassword: draft.tempPassword,
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

          {needsOrg && (
            <div className="p-3.5 bg-base-50 border border-base-200 rounded flex flex-col gap-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-base-700">
                New{" "}
                {draft.role === "dealer"
                  ? "dealer"
                  : draft.role === "showroom"
                    ? "showroom"
                    : draft.role === "supplier"
                      ? "supplier"
                      : "delivery partner"}{" "}
                organisation
              </div>
              <Field label="Company name" error={errors.companyName}>
                <Input
                  value={draft.companyName}
                  onChange={(v) => set("companyName", v)}
                  placeholder={
                    draft.role === "dealer"
                      ? "e.g. BedHouse KL Sdn Bhd"
                      : draft.role === "showroom"
                        ? "e.g. Carres KL Showroom"
                        : draft.role === "supplier"
                          ? "e.g. Hookka Industries"
                          : "e.g. JT Express"
                  }
                />
              </Field>
              {dealerLike && (
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
                A new {draft.role} record will be created and this user will be the owner.
              </div>
            </div>
          )}

          <Field label="Temporary password" hint="Give this to the user directly. They can change it after first login.">
            <div className="flex items-center gap-2 px-3 py-2 bg-base-50 border border-base-200 rounded">
              <code className="flex-1 font-mono text-[13px] text-base-900 tracking-[0.05em]">
                {draft.tempPassword}
              </code>
              <button
                type="button"
                onClick={() => set("tempPassword", generateTempPassword())}
                className="text-[11px] font-semibold text-base-600 px-2 py-1 border border-base-200 rounded hover:bg-white cursor-pointer"
              >
                ↻ Regenerate
              </button>
            </div>
            {errors.tempPassword && (
              <div className="text-[11px] text-primary mt-1">{errors.tempPassword}</div>
            )}
          </Field>

          {create.isError && (
            <div className="text-[12px] text-primary">
              {create.error?.message ?? "Account creation failed"}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-base-100 bg-base-50 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={create.isPending}
            className="px-4 py-[9px] text-[13px] font-semibold text-base-600 rounded hover:bg-base-100 cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={create.isPending}
            className="px-[18px] py-[9px] bg-base-900 text-white text-[13px] font-semibold rounded hover:bg-base-800 cursor-pointer disabled:opacity-50"
          >
            {create.isPending ? "Creating…" : "Create account"}
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

function generateTempPassword() {
  const adj = ["Brisk", "Calm", "Bold", "Clear", "Swift", "Bright", "Quiet", "Warm"];
  const noun = ["Linen", "Coral", "Dawn", "Tide", "Stone", "Ember", "Cloud", "Pine"];
  const num = Math.floor(Math.random() * 90) + 10;
  return `${adj[Math.floor(Math.random() * adj.length)]}-${noun[Math.floor(Math.random() * noun.length)]}-${num}`;
}
