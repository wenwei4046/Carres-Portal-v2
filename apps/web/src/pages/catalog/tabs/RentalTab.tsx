import { useState } from "react";
import { Repeat, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { RentalPlan, ServicePackage } from "@carres/shared";
import {
  rentalContractValue,
  rentalMonthlySplit,
  serviceVisitIntervalMonths,
  serviceVisitsTotal,
} from "@carres/shared";
import { ApiError } from "@/lib/api";
import { rm } from "@/lib/format-currency";
import {
  useCreateRentalPlan,
  useCreateServicePackage,
  useDeleteRentalPlan,
  useDeleteServicePackage,
  usePatchRentalPlan,
  usePatchServicePackage,
  useRentalConfig,
  useSyncRentalPlanStripe,
} from "@/lib/queries";
import { INPUT_CLS, Modal, ModalActions } from "@/pages/operation/components/Modal";

/**
 * Rental — the Rental + Service Plan config tab (migrations 0248/0249; Loo
 * 2026-07-25). Two principal-owned, principal-gated subsystems, both DORMANT
 * until authored (empty tables → the POS rental lane, agreements, billings and
 * entitlements all stay asleep):
 *
 *   (a) Service packages — a cleaning/repair care plan: duration (months) ×
 *       visits-per-year (Loo: configurable — some plans 2/3/4 visits a year),
 *       optionally linked to a sellable `service`-category SKU and priced for
 *       standalone sale. Selling / attaching one later mints a
 *       service_entitlements schedule.
 *
 *   (b) Rental plans (rent-to-own) — a subscription offer on ONE sellable SKU:
 *       term × monthly fee (e.g. RM 59 × 84 months), plus the per-collection
 *       revenue split recorded in finance (supplier rate % + flat base
 *       commission % — the full commission hierarchy lives in the HR line, not
 *       here). A plan can bundle a service package for free.
 *
 * Data rides `useRentalConfig()` (GET /api/rental/config). Writes are
 * principal-only at RLS (0248 `*_write_principal`); non-principal roles see
 * the same tables read-only — mirrors the PromoTab gating idiom.
 */
export default function RentalTab({ isPrincipal }: { isPrincipal: boolean }) {
  const configQ = useRentalConfig();
  const [pkgOpen, setPkgOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);

  if (configQ.isPending) {
    return <div className="t-small text-base-500">Loading rental config…</div>;
  }
  if (configQ.error) {
    return (
      <div className="t-small text-danger">
        Failed to load the rental config. Try refreshing — your session may have expired.
      </div>
    );
  }

  const servicePackages: ServicePackage[] = configQ.data?.servicePackages ?? [];
  const rentalPlans: RentalPlan[] = configQ.data?.rentalPlans ?? [];

  return (
    <div className="flex flex-col gap-6 max-w-[1120px]">
      <section className="flex items-start justify-between gap-4">
        <p className="t-tiny text-base-500 max-w-[480px]">
          A <b>service package</b> is a care plan (cleaning visits over a duration) sold
          standalone or bundled free with a rental. A <b>rental plan</b> is a rent-to-own
          offer on one SKU — a monthly fee over a fixed term, with the supplier and
          commission split recorded per collected month. Both are dormant until authored
          and flipped Active.
        </p>
        {isPrincipal && (
          <div className="flex flex-wrap justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setPkgOpen(true)}
              className="btn-ghost text-[12px]"
              data-testid="package-add"
            >
              + New package
            </button>
            <button
              type="button"
              onClick={() => setPlanOpen(true)}
              className="btn-primary text-[12px]"
              data-testid="plan-add"
            >
              + New plan
            </button>
          </div>
        )}
      </section>

      <ServicePackagesSection
        packages={servicePackages}
        isPrincipal={isPrincipal}
        addOpen={pkgOpen}
        onCloseAdd={() => setPkgOpen(false)}
      />
      <RentalPlansSection
        plans={rentalPlans}
        packages={servicePackages}
        isPrincipal={isPrincipal}
        addOpen={planOpen}
        onCloseAdd={() => setPlanOpen(false)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const errMsg = (e: unknown, fallback: string): string =>
  e instanceof ApiError ? e.message : fallback;

/** "every 4 mo" / "every 2.4 mo" — visit cadence hint from visits/yr. */
function intervalLabel(visitsPerYear: number): string {
  const iv = serviceVisitIntervalMonths(visitsPerYear);
  return `every ${Number.isInteger(iv) ? iv : iv.toFixed(1)} mo`;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// (a) Service packages
// ---------------------------------------------------------------------------

const PKG_GRID = "minmax(150px,1.5fr) 80px 90px 130px 100px 110px 70px 120px";

function ServicePackagesSection({
  packages,
  isPrincipal,
  addOpen,
  onCloseAdd,
}: {
  packages: ServicePackage[];
  isPrincipal: boolean;
  addOpen: boolean;
  onCloseAdd: () => void;
}) {
  return (
    <section className="card p-5">
      <div className="t-h4 font-display flex items-center gap-2 mb-1">
        <Sparkles size={16} strokeWidth={1.75} className="text-primary" />
        Service packages
      </div>
      <p className="t-tiny text-base-500 mb-4 pb-3 border-b border-base-100">
        A care plan: N visits a year over the duration (e.g. 2 years × 2 visits/yr = 4
        visits). Price is the standalone selling price — RM 0 means free-attach only.
        Link a service-category SKU to sell it at the POS.
        {!isPrincipal && " Principal only — read-only for your role."}
      </p>

      {addOpen && isPrincipal && (
        <Modal title="New service package" onClose={onCloseAdd}>
          <PackageForm onDone={onCloseAdd} />
        </Modal>
      )}

      <div className="bg-base-50 border border-base-200 rounded-[4px] overflow-hidden">
        <div
          className="grid items-center gap-3 px-3 py-2 bg-base-100 border-b border-base-200"
          style={{ gridTemplateColumns: PKG_GRID }}
        >
          <div className="label">Package</div>
          <div className="label">Type</div>
          <div className="label text-right">Duration</div>
          <div className="label text-right">Visits</div>
          <div className="label text-right">Price</div>
          <div className="label">SKU</div>
          <div className="label">Active</div>
          <div className="label text-right">Manage</div>
        </div>
        {packages.length === 0 && (
          <div className="t-small text-base-500 px-3 py-4" data-testid="packages-empty">
            No service packages yet — author one to sell cleaning care standalone or
            bundle it free with a rental plan.
          </div>
        )}
        {packages.map((p) => (
          <PackageRow key={p.id} pkg={p} isPrincipal={isPrincipal} />
        ))}
      </div>
    </section>
  );
}

function PackageRow({ pkg, isPrincipal }: { pkg: ServicePackage; isPrincipal: boolean }) {
  const [editing, setEditing] = useState(false);
  const patch = usePatchServicePackage();
  const del = useDeleteServicePackage();

  function toggleActive() {
    patch.mutate(
      { id: pkg.id, patch: { active: !pkg.active } },
      {
        onSuccess: () => toast.success(pkg.active ? "Package deactivated" : "Package activated"),
        onError: (e: unknown) => toast.error(errMsg(e, "Update failed")),
      },
    );
  }

  function remove() {
    if (!confirm(`Delete the service package "${pkg.name}"?`)) return;
    del.mutate(pkg.id, {
      onSuccess: () => toast.success("Package deleted"),
      onError: (e: unknown) => toast.error(errMsg(e, "Delete failed")),
    });
  }

  if (editing) {
    return (
      <div className="px-3 py-3 border-b border-base-100 last:border-b-0 bg-white">
        <PackageForm pkg={pkg} onDone={() => setEditing(false)} />
      </div>
    );
  }

  return (
    <div
      className={`grid items-center gap-3 px-3 py-2 border-b border-base-100 last:border-b-0 ${pkg.active ? "" : "opacity-60"}`}
      style={{ gridTemplateColumns: PKG_GRID }}
      data-testid={`pkg-row-${pkg.id}`}
    >
      <div className="text-[13px] truncate">{pkg.name}</div>
      <div className="t-tiny text-base-500 capitalize">{pkg.serviceType}</div>
      <div className="text-right t-num text-[12px]">{pkg.durationMonths} mo</div>
      <div className="text-right t-num text-[12px]">
        {pkg.visitsPerYear} / yr · {serviceVisitsTotal(pkg.durationMonths, pkg.visitsPerYear)} total
      </div>
      <div className="text-right t-num text-[12px]">{rm(pkg.price)}</div>
      <div className="t-tiny text-base-500 truncate">{pkg.sku ?? "—"}</div>
      <div>
        {isPrincipal ? (
          <input
            type="checkbox"
            checked={pkg.active}
            disabled={patch.isPending}
            onChange={toggleActive}
            aria-label={`${pkg.name} active`}
            data-testid={`pkg-active-${pkg.id}`}
          />
        ) : (
          <span className={`pill ${pkg.active ? "pill-confirmed" : "pill-neutral"}`}>
            {pkg.active ? "Active" : "Off"}
          </span>
        )}
      </div>
      <div className="text-right flex justify-end gap-1.5">
        {isPrincipal && (
          <>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="btn-ghost text-[11px]"
              data-testid={`pkg-edit-${pkg.id}`}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={del.isPending}
              className="btn-danger text-[11px]"
              data-testid={`pkg-delete-${pkg.id}`}
            >
              Delete
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const DURATION_PRESETS = [
  { label: "1 year", months: 12 },
  { label: "2 years", months: 24 },
  { label: "3 years", months: 36 },
];

/** Create / edit a service package. `pkg` present = patch mode. */
function PackageForm({ pkg, onDone }: { pkg?: ServicePackage; onDone: () => void }) {
  const create = useCreateServicePackage();
  const patch = usePatchServicePackage();
  const busy = create.isPending || patch.isPending;

  const [name, setName] = useState(pkg?.name ?? "");
  const [serviceType, setServiceType] = useState<ServicePackage["serviceType"]>(
    pkg?.serviceType ?? "cleaning",
  );
  const [duration, setDuration] = useState(pkg ? String(pkg.durationMonths) : "24");
  const [visits, setVisits] = useState(pkg ? String(pkg.visitsPerYear) : "2");
  const [price, setPrice] = useState(pkg ? String(pkg.price) : "0");
  const [sku, setSku] = useState(pkg?.sku ?? "");
  const [active, setActive] = useState(pkg?.active ?? true);

  const durationNum = Math.floor(Number(duration));
  const visitsNum = Math.floor(Number(visits));
  const priceNum = round2(Number(price));
  const durationValid =
    duration.trim() !== "" && Number.isInteger(durationNum) && durationNum >= 1 && durationNum <= 120;
  const visitsValid =
    visits.trim() !== "" && Number.isInteger(visitsNum) && visitsNum >= 1 && visitsNum <= 12;
  const priceValid = price.trim() !== "" && Number.isFinite(priceNum) && priceNum >= 0;
  const valid = name.trim().length >= 1 && durationValid && visitsValid && priceValid;

  function save() {
    if (!valid || busy) return;
    const payload = {
      name: name.trim(),
      serviceType,
      durationMonths: durationNum,
      visitsPerYear: visitsNum,
      price: priceNum,
      sku: sku.trim() === "" ? null : sku.trim(),
      active,
    };
    if (pkg) {
      patch.mutate(
        { id: pkg.id, patch: payload },
        {
          onSuccess: () => {
            toast.success("Package updated");
            onDone();
          },
          onError: (e: unknown) => toast.error(errMsg(e, "Update failed")),
        },
      );
    } else {
      create.mutate(payload, {
        onSuccess: () => {
          toast.success("Package created");
          onDone();
        },
        onError: (e: unknown) => toast.error(errMsg(e, "Create failed")),
      });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="label mb-1">Package name</div>
        <input
          className={INPUT_CLS}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Mattress Care Plan (2 years)"
          maxLength={120}
          data-testid="pkg-name"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="label mb-1">Service type</div>
          <select
            className={INPUT_CLS}
            value={serviceType}
            onChange={(e) => setServiceType(e.target.value as ServicePackage["serviceType"])}
            data-testid="pkg-type"
          >
            <option value="cleaning">Cleaning</option>
            <option value="repair">Repair</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <div className="label mb-1">Standalone price (RM)</div>
          <input
            className={INPUT_CLS}
            type="number"
            min={0}
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            data-testid="pkg-price"
          />
        </div>
      </div>
      <div>
        <div className="label mb-1">Duration (months)</div>
        <div className="flex items-center gap-2">
          {DURATION_PRESETS.map((p) => (
            <button
              key={p.months}
              type="button"
              onClick={() => setDuration(String(p.months))}
              className={`${durationNum === p.months ? "btn-primary" : "btn-ghost"} text-[11px]`}
              data-testid={`pkg-duration-${p.months}`}
            >
              {p.label}
            </button>
          ))}
          <input
            className={`${INPUT_CLS} w-24`}
            type="number"
            min={1}
            max={120}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            data-testid="pkg-duration"
          />
        </div>
      </div>
      <div>
        <div className="label mb-1">Visits per year</div>
        <div className="flex items-center gap-2">
          <input
            className={`${INPUT_CLS} w-24`}
            type="number"
            min={1}
            max={12}
            value={visits}
            onChange={(e) => setVisits(e.target.value)}
            data-testid="pkg-visits"
          />
          {visitsValid && durationValid && (
            <span className="t-tiny text-base-500">
              {serviceVisitsTotal(durationNum, visitsNum)} visits total · {intervalLabel(visitsNum)}
            </span>
          )}
        </div>
      </div>
      <div>
        <div className="label mb-1">Service SKU (optional)</div>
        <input
          className={INPUT_CLS}
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          placeholder="Service-category SKU code sold at the POS"
          data-testid="pkg-sku"
        />
      </div>
      <label className="flex items-center gap-2 t-small">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          data-testid="pkg-form-active"
        />
        Active
      </label>
      <ModalActions
        onCancel={onDone}
        onPrimary={save}
        primary={pkg ? "Save package" : "Create package"}
        primaryDisabled={!valid}
        primaryPending={busy}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// (b) Rental plans (rent-to-own)
// ---------------------------------------------------------------------------

// 10 columns must fit the 1120px shell minus card padding (Loo 2026-07-25 —
// the Stripe column pushed MANAGE off the card edge). Mins sum ≈976px incl.
// the 9 gaps; the row container scrolls horizontally as the backstop.
const PLAN_GRID =
  "minmax(110px,1.2fr) 56px 80px 90px 70px 90px minmax(100px,1fr) 110px 52px 110px";

function RentalPlansSection({
  plans,
  packages,
  isPrincipal,
  addOpen,
  onCloseAdd,
}: {
  plans: RentalPlan[];
  packages: ServicePackage[];
  isPrincipal: boolean;
  addOpen: boolean;
  onCloseAdd: () => void;
}) {
  const pkgName = (id: string | null): string =>
    id ? (packages.find((p) => p.id === id)?.name ?? "Unknown package") : "—";

  return (
    <section className="card p-5">
      <div className="t-h4 font-display flex items-center gap-2 mb-1">
        <Repeat size={16} strokeWidth={1.75} className="text-primary" />
        Rental plans (rent-to-own)
      </div>
      <p className="t-tiny text-base-500 mb-4 pb-3 border-b border-base-100">
        One SKU rented at a monthly fee over a fixed term — the customer owns it at the
        end. The supplier rate and base commission are recorded against every collected
        month. A plan can include a service package for free.
        {!isPrincipal && " Principal only — read-only for your role."}
      </p>

      {addOpen && isPrincipal && (
        <Modal title="New rental plan" onClose={onCloseAdd}>
          <PlanForm packages={packages} onDone={onCloseAdd} />
        </Modal>
      )}

      {/* overflow-x-auto (not hidden): a viewport the grid mins outgrow scrolls
          inside the card instead of clipping the MANAGE column (UI-KIT law). */}
      <div className="bg-base-50 border border-base-200 rounded-[4px] overflow-x-auto">
        <div
          className="grid items-center gap-3 px-3 py-2 bg-base-100 border-b border-base-200"
          style={{ gridTemplateColumns: PLAN_GRID }}
        >
          <div className="label">SKU</div>
          <div className="label text-right">Term</div>
          <div className="label text-right">Monthly</div>
          <div className="label text-right">Contract</div>
          <div className="label text-right">Supplier</div>
          <div className="label text-right">Commission</div>
          <div className="label">Included package</div>
          <div className="label">Stripe</div>
          <div className="label">Active</div>
          <div className="label text-right">Manage</div>
        </div>
        {plans.length === 0 && (
          <div className="t-small text-base-500 px-3 py-4" data-testid="plans-empty">
            No rental plans yet — author one to prepare the POS rental lane (next phase).
          </div>
        )}
        {plans.map((p) => (
          <PlanRow
            key={p.id}
            plan={p}
            packages={packages}
            includedName={pkgName(p.includedPackageId)}
            isPrincipal={isPrincipal}
          />
        ))}
      </div>
    </section>
  );
}

function PlanRow({
  plan,
  packages,
  includedName,
  isPrincipal,
}: {
  plan: RentalPlan;
  packages: ServicePackage[];
  includedName: string;
  isPrincipal: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const patch = usePatchRentalPlan();
  const del = useDeleteRentalPlan();
  const sync = useSyncRentalPlanStripe();

  // 0255 — a plan needs its Stripe recurring Price before the POS lane can
  // collect online. Auto-synced on save; this button is the manual retry.
  function syncStripe() {
    sync.mutate(plan.id, {
      onSuccess: (res: { stripeSync: { status: string; message?: string } }) => {
        if (res.stripeSync.status === "synced") toast.success("Plan synced to Stripe");
        else toast.error(res.stripeSync.message ?? "Stripe sync failed");
      },
      onError: (e: unknown) => toast.error(errMsg(e, "Stripe sync failed")),
    });
  }

  function toggleActive() {
    patch.mutate(
      { id: plan.id, patch: { active: !plan.active } },
      {
        onSuccess: () => toast.success(plan.active ? "Plan deactivated" : "Plan activated"),
        onError: (e: unknown) => toast.error(errMsg(e, "Update failed")),
      },
    );
  }

  function remove() {
    if (!confirm(`Delete the rental plan on ${plan.sku} (${plan.termMonths} months)?`)) return;
    del.mutate(plan.id, {
      onSuccess: () => toast.success("Plan deleted"),
      onError: (e: unknown) => toast.error(errMsg(e, "Delete failed")),
    });
  }

  if (editing) {
    return (
      <div className="px-3 py-3 border-b border-base-100 last:border-b-0 bg-white">
        <PlanForm plan={plan} packages={packages} onDone={() => setEditing(false)} />
      </div>
    );
  }

  return (
    <div
      className={`grid items-center gap-3 px-3 py-2 border-b border-base-100 last:border-b-0 ${plan.active ? "" : "opacity-60"}`}
      style={{ gridTemplateColumns: PLAN_GRID }}
      data-testid={`plan-row-${plan.id}`}
    >
      <div className="text-[13px] truncate">{plan.sku}</div>
      <div className="text-right t-num text-[12px]">{plan.termMonths} mo</div>
      <div className="text-right t-num text-[12px]">{rm(plan.monthlyFee)}</div>
      <div className="text-right t-num text-[12px]">
        {rm(rentalContractValue(plan.monthlyFee, plan.termMonths))}
      </div>
      <div className="text-right t-num text-[12px]">{plan.supplierRatePct}%</div>
      <div className="text-right t-num text-[12px]">{plan.commissionBasePct}%</div>
      <div className="t-tiny text-base-500 truncate">{includedName}</div>
      <div className="flex flex-wrap items-center gap-1.5">
        {plan.stripePriceId ? (
          <span className="pill pill-confirmed" data-testid={`plan-stripe-${plan.id}`}>
            Synced
          </span>
        ) : (
          <>
            <span className="pill pill-neutral" data-testid={`plan-stripe-${plan.id}`}>
              Not synced
            </span>
            {isPrincipal && (
              <button
                type="button"
                onClick={syncStripe}
                disabled={sync.isPending}
                className="btn-ghost text-[11px]"
                data-testid={`plan-sync-${plan.id}`}
              >
                {sync.isPending ? "Syncing…" : "Sync"}
              </button>
            )}
          </>
        )}
      </div>
      <div>
        {isPrincipal ? (
          <input
            type="checkbox"
            checked={plan.active}
            disabled={patch.isPending}
            onChange={toggleActive}
            aria-label={`${plan.sku} ${plan.termMonths}-month plan active`}
            data-testid={`plan-active-${plan.id}`}
          />
        ) : (
          <span className={`pill ${plan.active ? "pill-confirmed" : "pill-neutral"}`}>
            {plan.active ? "Active" : "Off"}
          </span>
        )}
      </div>
      <div className="text-right flex justify-end gap-1.5">
        {isPrincipal && (
          <>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="btn-ghost text-[11px]"
              data-testid={`plan-edit-${plan.id}`}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={del.isPending}
              className="btn-danger text-[11px]"
              data-testid={`plan-delete-${plan.id}`}
            >
              Delete
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const TERM_PRESETS = [
  { label: "5 years", months: 60 },
  { label: "7 years", months: 84 },
];

/** Create / edit a rental plan. `plan` present = patch mode. A NEW plan
 *  defaults INACTIVE (Loo: author first, flip live deliberately). */
function PlanForm({
  plan,
  packages,
  onDone,
}: {
  plan?: RentalPlan;
  packages: ServicePackage[];
  onDone: () => void;
}) {
  const create = useCreateRentalPlan();
  const patch = usePatchRentalPlan();
  const busy = create.isPending || patch.isPending;

  const [sku, setSku] = useState(plan?.sku ?? "");
  const [term, setTerm] = useState(plan ? String(plan.termMonths) : "");
  const [fee, setFee] = useState(plan ? String(plan.monthlyFee) : "");
  const [supplierPct, setSupplierPct] = useState(plan ? String(plan.supplierRatePct) : "0");
  const [commissionPct, setCommissionPct] = useState(
    plan ? String(plan.commissionBasePct) : "0",
  );
  const [includedPackageId, setIncludedPackageId] = useState(plan?.includedPackageId ?? "");
  const [active, setActive] = useState(plan?.active ?? false);

  const termNum = Math.floor(Number(term));
  const feeNum = round2(Number(fee));
  const supplierNum = round2(Number(supplierPct));
  const commissionNum = round2(Number(commissionPct));
  const termValid = term.trim() !== "" && Number.isInteger(termNum) && termNum > 0;
  const feeValid = fee.trim() !== "" && Number.isFinite(feeNum) && feeNum >= 0;
  const supplierValid =
    supplierPct.trim() !== "" && Number.isFinite(supplierNum) && supplierNum >= 0 && supplierNum <= 100;
  const commissionValid =
    commissionPct.trim() !== "" &&
    Number.isFinite(commissionNum) &&
    commissionNum >= 0 &&
    commissionNum <= 100;
  const valid =
    sku.trim().length >= 1 && termValid && feeValid && supplierValid && commissionValid;

  const preview = termValid && feeValid && supplierValid && commissionValid;
  const split = preview ? rentalMonthlySplit(feeNum, supplierNum, commissionNum) : null;

  function save() {
    if (!valid || busy) return;
    const payload = {
      sku: sku.trim(),
      termMonths: termNum,
      monthlyFee: feeNum,
      supplierRatePct: supplierNum,
      commissionBasePct: commissionNum,
      includedPackageId: includedPackageId === "" ? null : includedPackageId,
      active,
    };
    if (plan) {
      patch.mutate(
        { id: plan.id, patch: payload },
        {
          onSuccess: () => {
            toast.success("Plan updated");
            onDone();
          },
          onError: (e: unknown) => toast.error(errMsg(e, "Update failed")),
        },
      );
    } else {
      create.mutate(payload, {
        onSuccess: () => {
          toast.success("Plan created");
          onDone();
        },
        onError: (e: unknown) => toast.error(errMsg(e, "Create failed")),
      });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="label mb-1">SKU</div>
        <input
          className={INPUT_CLS}
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          placeholder="Product SKU code (e.g. CLOUD-K)"
          data-testid="plan-sku"
        />
      </div>
      <div>
        <div className="label mb-1">Term (months)</div>
        <div className="flex items-center gap-2">
          {TERM_PRESETS.map((p) => (
            <button
              key={p.months}
              type="button"
              onClick={() => setTerm(String(p.months))}
              className={`${termNum === p.months ? "btn-primary" : "btn-ghost"} text-[11px]`}
              data-testid={`plan-term-${p.months}`}
            >
              {p.label}
            </button>
          ))}
          <input
            className={`${INPUT_CLS} w-24`}
            type="number"
            min={1}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            data-testid="plan-term"
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <div className="label mb-1">Monthly fee (RM)</div>
          <input
            className={INPUT_CLS}
            type="number"
            min={0}
            step="0.01"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            data-testid="plan-fee"
          />
        </div>
        <div>
          <div className="label mb-1">Supplier rate (%)</div>
          <input
            className={INPUT_CLS}
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={supplierPct}
            onChange={(e) => setSupplierPct(e.target.value)}
            data-testid="plan-supplier"
          />
        </div>
        <div>
          <div className="label mb-1">Commission base (%)</div>
          <input
            className={INPUT_CLS}
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={commissionPct}
            onChange={(e) => setCommissionPct(e.target.value)}
            data-testid="plan-commission"
          />
        </div>
      </div>
      {split && (
        <div
          className="t-tiny text-base-600 bg-base-50 border border-base-200 rounded-[4px] px-3 py-2"
          data-testid="plan-preview"
        >
          {rm(feeNum)} × {termNum} months = {rm(rentalContractValue(feeNum, termNum))} · supplier{" "}
          {rm(split.supplierShare)}/mo · commission {rm(split.commissionShare)}/mo · Carres{" "}
          {rm(split.carresShare)}/mo
        </div>
      )}
      <div>
        <div className="label mb-1">Included service package</div>
        <select
          className={INPUT_CLS}
          value={includedPackageId}
          onChange={(e) => setIncludedPackageId(e.target.value)}
          data-testid="plan-package"
        >
          <option value="">None</option>
          {packages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-2 t-small">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          data-testid="plan-form-active"
        />
        Active (visible to the POS rental lane once it ships)
      </label>
      <ModalActions
        onCancel={onDone}
        onPrimary={save}
        primary={plan ? "Save plan" : "Create plan"}
        primaryDisabled={!valid}
        primaryPending={busy}
      />
    </div>
  );
}
