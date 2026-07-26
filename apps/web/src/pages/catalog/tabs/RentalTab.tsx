import { useMemo, useState } from "react";
import { Repeat, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type {
  CatalogResponse,
  ProductModelDto,
  RentalBuyPrice,
  RentalOffer,
  RentalOfferCategory,
  RentalOfferService,
  RentalPlan,
  ServicePackage,
} from "@carres/shared";
import {
  rentalContractValue,
  serviceSkuCode,
  serviceVisitIntervalMonths,
  serviceVisitsTotal,
} from "@carres/shared";
import { ApiError } from "@/lib/api";
import { rm } from "@/lib/format-currency";
import {
  useCatalog,
  useCreateRentalOffer,
  useCreateServicePackage,
  useDeleteRentalOffer,
  useDeleteServicePackage,
  usePatchRentalOffer,
  usePatchServicePackage,
  useRentalConfig,
  useSyncRentalPlanStripe,
} from "@/lib/queries";
import { INPUT_CLS, Modal, ModalActions } from "@/pages/operation/components/Modal";
import RentalOfferEditor from "../rental/RentalOfferEditor";

/**
 * Rental — the rent & buy config tab (migrations 0248/0249 + 0264; Loo
 * 2026-07-25 / 2026-07-26). Two principal-owned, principal-gated subsystems,
 * both DORMANT until authored:
 *
 *   (a) Offers — ONE per Modular model. The offer says which variants (or
 *       sofa compartments / combos) are on offer, prices them monthly (rent)
 *       and once (buy), prices the options the customer may choose (once or
 *       every month of the term), narrows the fabric to the exact colours,
 *       attaches the service plans and records the revenue split. A model is
 *       PICKED, never typed — the 0248 "type a SKU code" box is gone.
 *
 *   (b) Service packages — a care plan (duration × visits-a-year) that IS a
 *       SKU: `SVC-{MAT|BF|SOFA|ACC}-{CLEAN|REPAIR|SVCX}-{n}Y{visits}` is
 *       minted on save, so a plan can be sold, gifted and invoiced like any
 *       other product.
 *
 * Data rides `useRentalConfig()` (GET /api/rental/config) + `useCatalog()`.
 * Writes are principal-only at RLS (0248/0264 `*_write_principal`);
 * non-principal internal roles see everything read-only.
 */
export default function RentalTab({ isPrincipal }: { isPrincipal: boolean }) {
  const configQ = useRentalConfig();
  const catalogQ = useCatalog();
  const [pkgOpen, setPkgOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingOfferId, setEditingOfferId] = useState<string | null>(null);

  if (configQ.isPending || catalogQ.isPending) {
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
  const offers: RentalOffer[] = configQ.data?.rentalOffers ?? [];
  const plans: RentalPlan[] = configQ.data?.rentalPlans ?? [];
  const buyPrices: RentalBuyPrice[] = configQ.data?.buyPrices ?? [];
  const offerServices: RentalOfferService[] = configQ.data?.offerServices ?? [];
  const catalog = catalogQ.data;

  const editing = editingOfferId ? offers.find((o) => o.id === editingOfferId) ?? null : null;
  const editingModel =
    editing && catalog ? catalog.models.find((m) => m.id === editing.modelId) ?? null : null;

  return (
    <div className="flex flex-col gap-6 max-w-[1120px]">
      <section className="flex items-start justify-between gap-4">
        <p className="t-tiny text-base-500 max-w-[520px]">
          An <b>offer</b> says which model is on offer, in which variants, with which options and
          gifts — then prices it two ways: monthly to rent, or once to own. A <b>service package</b>{" "}
          is a care plan (visits over a duration) an offer can give away free or sell. Nothing
          reaches a store until the offer is switched on.
        </p>
        {isPrincipal && (
          <div className="flex flex-wrap justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setPkgOpen(true)}
              className="btn-ghost text-[12px]"
              data-testid="package-add"
            >
              + New service package
            </button>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="btn-primary text-[12px]"
              data-testid="offer-add"
            >
              + New offer
            </button>
          </div>
        )}
      </section>

      {editing && editingModel && catalog ? (
        <RentalOfferEditor
          key={editing.id}
          offer={editing}
          model={editingModel}
          catalog={catalog}
          plans={plans.filter((p) => p.offerId === editing.id)}
          buyPrices={buyPrices.filter((b) => b.offerId === editing.id)}
          offerServices={offerServices.filter((s) => s.offerId === editing.id)}
          packages={servicePackages}
          onClose={() => setEditingOfferId(null)}
        />
      ) : (
        <OffersSection
          offers={offers}
          plans={plans}
          buyPrices={buyPrices}
          offerServices={offerServices}
          catalog={catalog}
          isPrincipal={isPrincipal}
          onEdit={setEditingOfferId}
        />
      )}

      {pickerOpen && catalog && (
        <ModelPickerModal
          catalog={catalog}
          takenModelIds={new Set(offers.map((o) => o.modelId))}
          onClose={() => setPickerOpen(false)}
          onCreated={(id) => {
            setPickerOpen(false);
            setEditingOfferId(id);
          }}
        />
      )}

      <ServicePackagesSection
        packages={servicePackages}
        isPrincipal={isPrincipal}
        addOpen={pkgOpen}
        onCloseAdd={() => setPkgOpen(false)}
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
// (a) Offers
// ---------------------------------------------------------------------------

function OffersSection({
  offers,
  plans,
  buyPrices,
  offerServices,
  catalog,
  isPrincipal,
  onEdit,
}: {
  offers: RentalOffer[];
  plans: RentalPlan[];
  buyPrices: RentalBuyPrice[];
  offerServices: RentalOfferService[];
  catalog: CatalogResponse | undefined;
  isPrincipal: boolean;
  onEdit: (id: string) => void;
}) {
  return (
    <section className="card p-5">
      <div className="t-h4 font-display flex items-center gap-2 mb-1">
        <Repeat size={16} strokeWidth={1.75} className="text-primary" />
        Offers
        <span className="pill pill-neutral">{offers.length}</span>
      </div>
      <p className="t-tiny text-base-500 mb-4 pb-3 border-b border-base-100">
        One offer per model. Each offer can open the rent lane, the buy lane, or both.
        {!isPrincipal && " Principal only — read-only for your role."}
      </p>

      {offers.length === 0 && (
        <div className="t-small text-base-500 py-4" data-testid="offers-empty">
          No offers yet — pick a model to author the first rent-to-own or outright offer.
        </div>
      )}

      <div className="flex flex-col">
        {offers.map((o) => (
          <OfferRow
            key={o.id}
            offer={o}
            model={catalog?.models.find((m) => m.id === o.modelId) ?? null}
            plans={plans.filter((p) => p.offerId === o.id)}
            buyCount={buyPrices.filter((b) => b.offerId === o.id && b.active).length}
            serviceCount={offerServices.filter((s) => s.offerId === o.id && s.active).length}
            isPrincipal={isPrincipal}
            onEdit={() => onEdit(o.id)}
          />
        ))}
      </div>
    </section>
  );
}

function OfferRow({
  offer,
  model,
  plans,
  buyCount,
  serviceCount,
  isPrincipal,
  onEdit,
}: {
  offer: RentalOffer;
  model: ProductModelDto | null;
  plans: RentalPlan[];
  buyCount: number;
  serviceCount: number;
  isPrincipal: boolean;
  onEdit: () => void;
}) {
  const patch = usePatchRentalOffer();
  const del = useDeleteRentalOffer();
  const sync = useSyncRentalPlanStripe();

  const fees = plans.map((p) => p.monthlyFee).filter((f) => f > 0);
  const synced = plans.filter((p) => p.stripePriceId).length;
  const feeLabel =
    fees.length === 0
      ? "no monthly price yet"
      : fees.length === 1 || Math.min(...fees) === Math.max(...fees)
        ? `${rm(fees[0]!)} / mo`
        : `${rm(Math.min(...fees))}–${rm(Math.max(...fees))} / mo`;

  function toggleActive() {
    patch.mutate(
      { id: offer.id, patch: { active: !offer.active } },
      {
        onSuccess: () => toast.success(offer.active ? "Offer switched off" : "Offer is on sale"),
        onError: (e: unknown) => toast.error(errMsg(e, "Update failed")),
      },
    );
  }

  function remove() {
    if (!confirm(`Delete the offer on ${model?.name ?? "this model"} and all its prices?`)) return;
    del.mutate(offer.id, {
      onSuccess: () => toast.success("Offer deleted"),
      onError: (e: unknown) => toast.error(errMsg(e, "Delete failed")),
    });
  }

  /** Re-project every unsynced rent line into Stripe (the manual retry). */
  function syncStripe() {
    const pending = plans.filter((p) => !p.stripePriceId);
    if (pending.length === 0) return;
    let done = 0;
    for (const p of pending) {
      sync.mutate(p.id, {
        onSuccess: (res: { stripeSync: { status: string; message?: string } }) => {
          done += 1;
          if (res.stripeSync.status !== "synced") {
            toast.error(res.stripeSync.message ?? "Stripe sync failed");
          } else if (done === pending.length) {
            toast.success("Prices synced to Stripe");
          }
        },
        onError: (e: unknown) => toast.error(errMsg(e, "Stripe sync failed")),
      });
    }
  }

  return (
    <div
      className={`flex items-center gap-3 py-3 border-b border-base-100 last:border-b-0 flex-wrap ${offer.active ? "" : "opacity-60"}`}
      data-testid={`offer-row-${offer.id}`}
    >
      {model?.photoUrl ? (
        <img
          src={model.photoUrl}
          alt=""
          className="w-11 h-11 rounded-[8px] object-cover border border-base-200"
        />
      ) : (
        <div className="w-11 h-11 rounded-[8px] border border-dashed border-base-300 grid place-items-center text-base-300">
          ▦
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold truncate">
          {model?.name ?? "Unknown model"}
          <span className="t-tiny text-base-400 ml-2">{model?.modelKey}</span>
        </div>
        <div className="t-tiny text-base-500 truncate">
          {model?.category ?? "—"}
          {offer.rentEnabled && ` · Rent ${feeLabel}`}
          {offer.rentEnabled && plans.length > 0 && (
            <>
              {" "}
              · {plans.length} price row{plans.length === 1 ? "" : "s"}
              {plans[0] && ` · up to ${rm(rentalContractValue(Math.max(...fees, 0), Math.max(...plans.map((p) => p.termMonths))))} per contract`}
            </>
          )}
          {offer.buyEnabled && ` · Buy ${buyCount} target${buyCount === 1 ? "" : "s"}`}
          {serviceCount > 0 && ` · ${serviceCount} service plan${serviceCount === 1 ? "" : "s"}`}
        </div>
      </div>
      {offer.rentEnabled && plans.length > 0 && (
        <span
          className={`pill ${synced === plans.length ? "pill-confirmed" : "pill-neutral"}`}
          data-testid={`offer-stripe-${offer.id}`}
        >
          {synced} of {plans.length} synced
        </span>
      )}
      {isPrincipal && synced < plans.length && (
        <button
          type="button"
          onClick={syncStripe}
          disabled={sync.isPending}
          className="btn-ghost text-[11px]"
          data-testid={`offer-sync-${offer.id}`}
        >
          {sync.isPending ? "Syncing…" : "Sync"}
        </button>
      )}
      {isPrincipal ? (
        <label className="flex items-center gap-1.5 t-tiny text-base-500">
          <input
            type="checkbox"
            checked={offer.active}
            disabled={patch.isPending}
            onChange={toggleActive}
            aria-label={`${model?.name ?? "offer"} on sale`}
            data-testid={`offer-active-${offer.id}`}
          />
          On sale
        </label>
      ) : (
        <span className={`pill ${offer.active ? "pill-confirmed" : "pill-neutral"}`}>
          {offer.active ? "On sale" : "Draft"}
        </span>
      )}
      <button
        type="button"
        onClick={onEdit}
        className="btn-secondary text-[11px]"
        data-testid={`offer-edit-${offer.id}`}
      >
        {isPrincipal ? "Edit" : "View"}
      </button>
      {isPrincipal && (
        <button
          type="button"
          onClick={remove}
          disabled={del.isPending}
          className="btn-danger text-[11px]"
          data-testid={`offer-delete-${offer.id}`}
        >
          Delete
        </button>
      )}
    </div>
  );
}

/** Pick the model an offer is authored off — the Modular card wall, filtered
 *  to models that don't already have one (UNIQUE model_id). */
function ModelPickerModal({
  catalog,
  takenModelIds,
  onClose,
  onCreated,
}: {
  catalog: CatalogResponse;
  takenModelIds: Set<string>;
  onClose: () => void;
  onCreated: (offerId: string) => void;
}) {
  const create = useCreateRentalOffer();
  const [q, setQ] = useState("");

  const models = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return catalog.models
      .filter((m) => !m.discontinuedAt && !takenModelIds.has(m.id))
      .filter(
        (m) =>
          !needle ||
          m.name.toLowerCase().includes(needle) ||
          m.modelKey.toLowerCase().includes(needle),
      )
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
      .slice(0, 60);
  }, [catalog.models, q, takenModelIds]);

  function pick(m: ProductModelDto) {
    create.mutate(
      {
        modelId: m.id,
        // A sofa prices by its parts by default (Loo: the builder adds up);
        // everything else prices per variant.
        pricingMode: m.category === "sofa" ? "both" : "variant",
        rentEnabled: true,
        buyEnabled: true,
      },
      {
        onSuccess: (res: { offer: RentalOffer }) => {
          toast.success(`Offer started for ${m.name}`);
          onCreated(res.offer.id);
        },
        onError: (e: unknown) => toast.error(errMsg(e, "Could not start the offer")),
      },
    );
  }

  return (
    <Modal title="Pick the product" onClose={onClose} size="lg">
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search
            size={14}
            strokeWidth={1.75}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-base-400"
          />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search models…"
            aria-label="Search models"
            className={`${INPUT_CLS} pl-8`}
            data-testid="offer-model-search"
          />
        </div>
        {models.length === 0 && (
          <p className="t-small text-base-500" data-testid="offer-model-empty">
            No model matches — every other model already has an offer.
          </p>
        )}
        <div
          className="grid gap-2 max-h-[420px] overflow-y-auto"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))" }}
        >
          {models.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => pick(m)}
              disabled={create.isPending}
              className="flex items-start gap-2 p-2.5 border border-base-200 rounded-[6px] bg-base-50/60 hover:border-base-400 text-left disabled:opacity-50"
              data-testid={`offer-model-${m.modelKey}`}
            >
              {m.photoUrl ? (
                <img src={m.photoUrl} alt="" className="w-10 h-10 rounded-[4px] object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-[4px] border border-dashed border-base-300 grid place-items-center text-base-300">
                  ▦
                </div>
              )}
              <span className="min-w-0">
                <span className="block t-small font-semibold truncate">{m.name}</span>
                <span className="block t-tiny text-base-500 truncate">
                  {m.category} · {m.modelKey}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// (b) Service packages
// ---------------------------------------------------------------------------

const PKG_GRID = "minmax(150px,1.5fr) 90px 80px 90px 130px 100px minmax(120px,1fr) 70px 120px";

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
        A care plan: N visits a year over the duration (e.g. 2 years × 2 visits/yr = 4 visits). Each
        plan is its own SKU — <span className="t-num">SVC-MAT-CLEAN-1Y2</span> — so it can be sold,
        gifted and invoiced like any other product.
        {!isPrincipal && " Principal only — read-only for your role."}
      </p>

      {addOpen && isPrincipal && (
        <Modal title="Create service package" onClose={onCloseAdd}>
          <PackageForm onDone={onCloseAdd} />
        </Modal>
      )}

      <div className="bg-base-50 border border-base-200 rounded-[4px] overflow-x-auto">
        <div
          className="grid items-center gap-3 px-3 py-2 bg-base-100 border-b border-base-200 min-w-[900px]"
          style={{ gridTemplateColumns: PKG_GRID }}
        >
          <div className="label">Package</div>
          <div className="label">For</div>
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
            No service packages yet — author one to sell cleaning care standalone or bundle it free
            with an offer.
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
      className={`grid items-center gap-3 px-3 py-2 border-b border-base-100 last:border-b-0 min-w-[900px] ${pkg.active ? "" : "opacity-60"}`}
      style={{ gridTemplateColumns: PKG_GRID }}
      data-testid={`pkg-row-${pkg.id}`}
    >
      <div className="text-[13px] truncate">{pkg.name}</div>
      <div className="t-tiny text-base-500 capitalize">{pkg.category ?? "any"}</div>
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

const CATEGORY_CHIPS: { value: RentalOfferCategory; label: string; token: string }[] = [
  { value: "mattress", label: "Mattress", token: "MAT" },
  { value: "bedframe", label: "Bed frame", token: "BF" },
  { value: "sofa", label: "Sofa", token: "SOFA" },
  { value: "accessory", label: "Accessory", token: "ACC" },
];

/** Create / edit a service package. `pkg` present = patch mode. */
function PackageForm({ pkg, onDone }: { pkg?: ServicePackage; onDone: () => void }) {
  const create = useCreateServicePackage();
  const patch = usePatchServicePackage();
  const busy = create.isPending || patch.isPending;

  const [name, setName] = useState(pkg?.name ?? "");
  const [category, setCategory] = useState<RentalOfferCategory>(pkg?.category ?? "mattress");
  const [serviceType, setServiceType] = useState<ServicePackage["serviceType"]>(
    pkg?.serviceType ?? "cleaning",
  );
  const [duration, setDuration] = useState(pkg ? String(pkg.durationMonths) : "24");
  const [visits, setVisits] = useState(pkg ? String(pkg.visitsPerYear) : "2");
  const [price, setPrice] = useState(pkg ? String(pkg.price) : "0");
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

  // The SKU the server will mint — shown live so the operator sees the code
  // before saving (0264: duration × visits × category ARE the code).
  const previewSku =
    durationValid && visitsValid
      ? serviceSkuCode(category, serviceType, durationNum, visitsNum)
      : null;

  function save() {
    if (!valid || busy) return;
    const payload = {
      name: name.trim(),
      category,
      serviceType,
      durationMonths: durationNum,
      visitsPerYear: visitsNum,
      price: priceNum,
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
          placeholder="e.g. Mattress Care — 1 year"
          maxLength={120}
          data-testid="pkg-name"
        />
      </div>
      <div>
        <div className="label mb-1">Category</div>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORY_CHIPS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setCategory(c.value)}
              className={`${category === c.value ? "btn-primary" : "btn-ghost"} text-[11px]`}
              data-testid={`pkg-category-${c.value}`}
            >
              {c.label} <span className="t-num ml-1 opacity-70">{c.token}</span>
            </button>
          ))}
        </div>
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
            <option value="cleaning">Cleaning — CLEAN</option>
            <option value="repair">Repair — REPAIR</option>
            <option value="other">Other — SVCX</option>
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
      {previewSku && !pkg && (
        <div
          className="t-tiny text-base-600 bg-base-50 border border-base-200 rounded-[4px] px-3 py-2"
          data-testid="pkg-sku-preview"
        >
          Service SKU <b className="t-num">{previewSku}</b> — built from category × type × duration ×
          visits. Change any of them and the code changes with it, so two plans can never collide.
        </div>
      )}
      {pkg?.sku && (
        <div className="t-tiny text-base-500">
          SKU <b className="t-num">{pkg.sku}</b> — a minted code is permanent; a different duration
          or visit count wants a new package.
        </div>
      )}
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
