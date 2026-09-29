// design-standard: not-a-list-page — Settings sits UNDER the Purchasing
// module tab bar, so UI-KIT §8.3's Module-tab law applies: no breadcrumb and
// no big title, because the active tab already says "Settings". Same shape as
// its siblings Claims and Receiving.
import { GOODS_ABSENCE_WORDS, SUPPLIER_ADDRESS_MAX } from "@carres/shared";
import { Block } from "./SalesOrderWorkspace";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  PURCHASING_NUMBER_RANGE,
  PRODUCTION_WORKING_DAYS_RANGE,
  TRANSIT_DAYS_RANGE,
  SUNDAY,
  WEEKDAYS,
  clockWordOf,
  lastChangeFor,
  settingValueLabel,
  workWeekLabel,
  type PurchasingCategory,
  type PurchasingDestinationSetting,
  type PurchasingNumberKey,
  type PurchasingSettingsResponse,
} from "@carres/shared";
import {
  usePurchasingSettings,
  useCreatePurchasingDestination,
  useSetProductionDays,
  useSetSupplierTransitDays,
  useSetSupplierTermsDays,
  useSetSupplierAddress,
  useSetPurchasingNumber,
  useSetPurchasingPoDays,
  useSetPurchasingPoWindows,
  useSetSupplierPoCutoff,
  useSetSupplierWorkWeek,
  useSetPurchasingSupplierCollection,
  useUpdatePurchasingDestination,
} from "@/lib/queries";
import Input from "@/components/kit/Input";
import Textarea from "@/components/kit/Textarea";
import Button from "@/components/kit/Button";
import Checkbox from "@/components/kit/Checkbox";
import { fmtDate } from "@/lib/fmt-date";
import { INPUT_CLS } from "./components/Modal";
import PurchasingTabs from "./PurchasingTabs";

/**
 * Purchasing → Settings — card P1 (migration 0303, Jess 2026-07-28).
 *
 * Every number the ordering engine reads, on one manager-only screen. Before
 * this page they were constants in four files: the sofa's production time
 * read 10 in the route, 5 in the urgent bypass and 14 in a read-only sheet
 * that also still claimed PO days were Mon + Thu.
 *
 * Two rules this screen exists to make visible:
 *
 *  · **A supplier × category with no number says `Set a number`** — it is not
 *    quietly planned on a 7. That line gets no order-by date at all (K1's
 *    rule: a quiet screen must mean *watched and fine*, never *nobody
 *    looked*), and the To Order tab names the pair out loud.
 *  · **Every row carries who changed it, when, and what it was before.**
 *
 * The matrix is derived from the catalog — only the factories that actually
 * own a SKU appear, so nobody reads a 10 × 3 grid of blanks.
 *
 * Words: `production working days` · `order-by buffer` · `PO days` are the
 * COPY-STANDARD vocabulary; `Earliest date a store may sell` and
 * `Supplier work week` are `docs/PURCHASING-WORKING-FLOW.md` §2 verbatim
 * (Jess 2026-07-28) and are being added to the vocabulary table in the same
 * PR. Nothing here invents a word.
 */

const CATEGORY_LABEL: Record<PurchasingCategory, string> = {
  sofa: "Sofa",
  bedframe: "Bedframe",
  mattress: "Mattress",
};

/** who · when · what it was before — a FACT line, so it carries a name, a
 *  date and a number and nothing else. */
function ChangeLine({
  settings,
  settingKey,
  supplierId = null,
  category = null,
}: {
  settings: PurchasingSettingsResponse;
  settingKey: string;
  supplierId?: string | null;
  category?: string | null;
}) {
  const change = lastChangeFor(settings, settingKey, supplierId, category);
  if (!change) return null;
  /**
   * 🔴 P20.4 — THIS LINE USED TO PRINT `· was {0}`.
   *
   * `oldValue` is `purchasing_setting_changes.old_value`, a plain `text`
   * column, and the two array-valued keys are recorded with `v_old::text` — so
   * for those keys the history carries the DATABASE's spelling of an array and
   * this line rendered it raw. Measured in production 2026-08-08: the entire
   * audit trail was two rows, both `supplier_work_week`, so the only two
   * history lines this page has ever shown read `· was {0}` and `· was {0,6}`.
   *
   * A work week must read as DAYS. `settingValueLabel` is the one place that
   * decides — it reads the same `workWeekLabel` the row above it uses for the
   * CURRENT value, so the history and the value can never disagree about what
   * `Mon–Sat` means, and `po_days` (the identical defect, waiting for the first
   * change) reads through it too.
   */
  const was = settingValueLabel(settingKey, change.oldValue);
  return (
    <div className="text-label text-base-500 mt-1" data-testid="setting-change-line">
      {change.changedBy ?? GOODS_ABSENCE_WORDS.notRecorded} · {fmtDate(change.changedAt)}
      {was ? ` · was ${was}` : ""}
    </div>
  );
}

/** One editable number. Save lights up only when the value really moved. */
function NumberRow({
  label,
  hint,
  unit,
  value,
  min,
  max,
  canEdit,
  pending,
  onSave,
  testId,
  children,
}: {
  label: string;
  hint: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  canEdit: boolean;
  pending: boolean;
  onSave: (n: number) => void;
  testId: string;
  children?: React.ReactNode;
}) {
  const [draft, setDraft] = useState(String(value));
  const n = Number(draft);
  const valid = Number.isInteger(n) && n >= min && n <= max;
  const dirty = valid && n !== value;

  return (
    <div className="py-3 border-b border-base-100 last:border-b-0">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-[240px]">
          <div className="text-body text-base-900">{label}</div>
          <div className="text-meta text-base-500 mt-0.5">{hint}</div>
          {children}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={min}
            max={max}
            step={1}
            value={draft}
            disabled={!canEdit}
            onChange={(e) => setDraft(e.target.value)}
            className={`${INPUT_CLS} w-24 disabled:opacity-60`}
            data-testid={testId}
          />
          <span className="text-meta text-base-500 w-[86px]">{unit}</span>
          {canEdit && (
            <button
              type="button"
              disabled={!dirty || pending}
              onClick={() => onSave(n)}
              className="btn-primary text-meta disabled:opacity-40"
              data-testid={`${testId}-save`}
            >
              Save
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** A weekday picker — Mon…Sat. **Sunday is never offered**: it is a
 *  non-working day for everyone, and a checkbox for it would read as though it
 *  could be switched on (the same reason a logistics company gets no Sunday
 *  rule of its own, T9). */
function DayPicker({
  selected,
  canEdit,
  onChange,
  testId,
  days = WEEKDAYS,
}: {
  selected: readonly number[];
  canEdit: boolean;
  onChange: (days: number[]) => void;
  testId: string;
  /** Which weekdays are OFFERED — the PO-days picker stops at Friday. */
  days?: typeof WEEKDAYS;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap" data-testid={testId}>
      {days.map((w) => {
        const on = selected.includes(w.day);
        return (
          <button
            key={w.day}
            type="button"
            aria-pressed={on}
            disabled={!canEdit}
            onClick={() =>
              onChange(
                on ? selected.filter((d) => d !== w.day) : [...selected, w.day],
              )
            }
            className={[
              "inline-flex items-center justify-center w-11 h-7 rounded-md text-meta font-semibold border transition-colors disabled:opacity-60",
              on
                ? "border-base-900 bg-base-900 text-white"
                : "border-base-200 bg-white text-base-500 hover:border-base-500",
            ].join(" ")}
            data-testid={`${testId}-${w.day}`}
          >
            {w.label}
          </button>
        );
      })}
    </div>
  );
}

type DestinationDraft = {
  mode: "add" | "edit";
  id: string | null;
  name: string;
  address: string;
  active: boolean;
  isDefault: boolean;
  wasDefault: boolean;
  warehouseLinked: boolean;
};

type CollectionDraft = {
  destinationId: string;
  partnerId: string;
};

const newDestinationDraft = (): DestinationDraft => ({
  mode: "add",
  id: null,
  name: "",
  address: "",
  active: true,
  isDefault: false,
  wasDefault: false,
  warehouseLinked: false,
});

function editDestinationDraft(destination: PurchasingDestinationSetting): DestinationDraft {
  return {
    mode: "edit",
    id: destination.id,
    name: destination.name,
    address: destination.address ?? "",
    active: destination.active,
    isDefault: destination.isDefault,
    wasDefault: destination.isDefault,
    warehouseLinked: destination.warehouseLinked,
  };
}

/** `embedded` renders this as a SECTION of the one Settings Workspace, which
 *  draws its own section navigation. Without it the page brings the whole
 *  Purchasing tab bar along and the operator sees two navigations at once.
 *  The standalone Purchasing tab is untouched. */
export default function OperationPurchasingSettings({
  embedded = false,
}: { embedded?: boolean } = {}) {
  const { data, isLoading, error } = usePurchasingSettings();
  const setNumber = useSetPurchasingNumber();
  const setPoDays = useSetPurchasingPoDays();
  const setProduction = useSetProductionDays();
  const setTransit = useSetSupplierTransitDays();
  const setTerms = useSetSupplierTermsDays();
  const setAddress = useSetSupplierAddress();
  const setWorkWeek = useSetSupplierWorkWeek();
  const createDestination = useCreatePurchasingDestination();
  const updateDestination = useUpdatePurchasingDestination();
  const setSupplierCollection = useSetPurchasingSupplierCollection();

  const [poDraft, setPoDraft] = useState<number[] | null>(null);
  const [weekDraft, setWeekDraft] = useState<Record<string, number[]>>({});
  const [prodDraft, setProdDraft] = useState<Record<string, string>>({});
  const [transitDraft, setTransitDraft] = useState<Record<string, string>>({});
  const [termsDraft, setTermsDraft] = useState<Record<string, string>>({});
  /* 0611 · keyed `${supplierId}:${kind}` so the two addresses never share a draft. */
  const [addressDraft, setAddressDraft] = useState<Record<string, string>>({});
  const [destinationDraft, setDestinationDraft] = useState<DestinationDraft | null>(null);
  const [collectionDrafts, setCollectionDrafts] = useState<Record<string, CollectionDraft>>({});

  const canEdit = data?.canEdit ?? false;

  const rows = useMemo(() => {
    if (!data) return [];
    return data.suppliers.flatMap((s) =>
      s.categories.map((category) => ({
        supplier: s,
        category,
        workingDays:
          data.productionDays.find(
            (p) => p.supplierId === s.id && p.category === category,
          )?.workingDays ?? null,
      })),
    );
  }, [data]);

  const fail = (e: unknown) =>
    toast.error(
      (e as Error)?.message ??
        "That did not save. Try again; if it keeps failing, ask a developer to check the API.",
    );

  if (isLoading) {
    return (
      <div className="h-full flex flex-col">
        {!embedded && <PurchasingTabs />}
        <div className="px-9 py-8 text-body text-base-500">Loading settings…</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="h-full flex flex-col">
        {!embedded && <PurchasingTabs />}
        <div className="px-9 py-8">
          <div className="max-w-[560px] rounded-[10px] border border-danger bg-error-soft p-4">
            <div className="text-body font-semibold text-danger mb-1">
              Couldn&rsquo;t load settings.
            </div>
            <div className="text-meta text-base-600">
              {(error as Error | undefined)?.message ??
                "Try again. If it keeps failing, ask a developer to check the API."}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const poDays = poDraft ?? data.poDays;
  const poDirty =
    poDraft !== null &&
    [...poDraft].sort().join(",") !== [...data.poDays].sort().join(",");

  return (
    <div className="h-full flex flex-col">
      {!embedded && <PurchasingTabs />}
      <div className="px-9 py-8 pb-14 overflow-auto" data-testid="purchasing-settings">
        {/* The governed Settings page header — kicker + page title, the same
            size, spacing and typography Sales Order Settings has drawn since it
            shipped. This page opened straight onto a paragraph until 2026-09-09
            and was the only Settings section with no title at all. */}
        <div className="mb-5">
          <div className="kicker">Purchasing</div>
          <h1 className="text-page font-display mt-1.5 text-base-900">Purchasing Settings</h1>
        </div>
        <div className="text-body text-base-600 mb-[18px] max-w-[720px]">
          The settings the ordering engine reads. Change one here and SO Batch Purchase uses it
          the same day.
          {/* Owner report 2026-09-29: the shared login was offered Save and
              every save failed. Settings are changed by a manager signed in
              with their OWN account; the sentence says so. */}
          {!canEdit && " Only a manager signed in with their own account can change these."}
        </div>

        {/* ⭐ PO WINDOWS (Purchasing MASTER §5.6.1, owner 2026-09-24/25): the
            days a window opens and its two times, in ONE card. Work and SO
            Batch read these through the same window reader. */}
        <div className="mb-8 max-w-[860px]" data-testid="po-windows-settings">
          <PoWindowsSection
            settings={data}
            canEdit={canEdit}
            poDays={poDays}
            poDirty={poDirty}
            onPoDays={setPoDraft}
            savingPoDays={setPoDays.isPending}
            onSavePoDays={() =>
              setPoDays.mutateAsync({ days: poDays }).then(() => setPoDraft(null))
            }
            onFail={fail}
          />
        </div>

        <div className="mb-8 max-w-[860px]" data-testid="deliver-to-settings">
          <Block
            title="Deliver To"
            subtitle="Where suppliers may send goods. The default is used until staff choose another."
            headerSlot={canEdit && destinationDraft?.mode !== "add" ? (
              <button
                type="button"
                className="btn-secondary text-meta shrink-0"
                onClick={() => setDestinationDraft(newDestinationDraft())}
              >
                Add Deliver To
              </button>
            ) : undefined}
          >

          {destinationDraft && (
            <div className="mb-3 border-b border-kit-slate-5 bg-white pb-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-meta font-semibold text-base-700">
                  Name
                  <input
                    type="text"
                    value={destinationDraft.name}
                    disabled={destinationDraft.warehouseLinked}
                    onChange={(event) =>
                      setDestinationDraft((draft) =>
                        draft ? { ...draft, name: event.target.value } : draft,
                      )
                    }
                    className={`${INPUT_CLS} mt-1 disabled:bg-base-50 disabled:text-base-500`}
                  />
                </label>
                <label className="text-meta font-semibold text-base-700">
                  Address
                  <input
                    type="text"
                    value={destinationDraft.address}
                    disabled={destinationDraft.warehouseLinked}
                    onChange={(event) =>
                      setDestinationDraft((draft) =>
                        draft ? { ...draft, address: event.target.value } : draft,
                      )
                    }
                    className={`${INPUT_CLS} mt-1 disabled:bg-base-50 disabled:text-base-500`}
                  />
                </label>
              </div>

              {destinationDraft.mode === "edit" && (
                <div className="mt-3 flex flex-wrap gap-5 text-meta text-base-700">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={destinationDraft.active}
                      disabled={destinationDraft.isDefault}
                      onChange={(event) =>
                        setDestinationDraft((draft) =>
                          draft ? { ...draft, active: event.target.checked } : draft,
                        )
                      }
                    />
                    Available for new POs
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={destinationDraft.isDefault}
                      disabled={!destinationDraft.active || destinationDraft.wasDefault}
                      onChange={(event) =>
                        setDestinationDraft((draft) =>
                          draft ? { ...draft, isDefault: event.target.checked } : draft,
                        )
                      }
                    />
                    Default
                  </label>
                </div>
              )}

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  className="btn-secondary text-meta"
                  onClick={() => setDestinationDraft(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary text-meta disabled:opacity-40"
                  disabled={
                    destinationDraft.name.trim().length === 0 ||
                    createDestination.isPending ||
                    updateDestination.isPending
                  }
                  onClick={() => saveDestination(destinationDraft)}
                >
                  {destinationDraft.mode === "add" ? "Add" : "Save"}
                </button>
              </div>
            </div>
          )}

          <div className="overflow-hidden bg-white">
            {data.destinations.length === 0 ? (
              <div className="p-4 text-body text-base-600">No Deliver To has been added yet.</div>
            ) : (
              data.destinations.map((destination) => (
                <div
                  key={destination.id}
                  className="flex items-start justify-between gap-4 border-b border-base-100 px-4 py-3 last:border-b-0"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-body font-semibold text-base-900">
                        {destination.name}
                      </span>
                      {destination.isDefault && (
                        <span className="rounded-full bg-base-100 px-2 py-0.5 text-label text-base-600">
                          Default
                        </span>
                      )}
                      {!destination.active && (
                        <span className="rounded-full bg-base-100 px-2 py-0.5 text-label text-base-600">
                          Not available for new POs
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-meta text-base-500">
                      {destination.address ?? "Address not set"}
                    </div>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      className="btn-secondary text-meta shrink-0"
                      onClick={() => setDestinationDraft(editDestinationDraft(destination))}
                    >
                      Edit
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
          </Block>
        </div>

        <div className="mb-8 max-w-[860px]" data-testid="supplier-collection-settings">
          <Block title="Supplier collection" subtitle={"Who collects from a supplier that does not deliver, and where those goods always go. Issue review reads this rule; it does not ask again."}>
          <div className="overflow-hidden bg-white">
            {(data.supplierCollections ?? []).length === 0 ? (
              <div className="p-4 text-body text-base-600">
                No supplier needs Carres to arrange collection.
              </div>
            ) : (
              (data.supplierCollections ?? []).map((rule) => {
                const draft = collectionDrafts[rule.supplierId] ?? {
                  destinationId: rule.destinationId ?? "",
                  partnerId: rule.partnerId ?? "",
                };
                const partnerName = (data.deliveryPartners ?? []).find(
                  (partner) => partner.id === draft.partnerId,
                )?.name;
                const destinationName = data.destinations.find(
                  (destination) => destination.id === draft.destinationId,
                )?.name;
                const dirty =
                  draft.destinationId !== (rule.destinationId ?? "") ||
                  draft.partnerId !== (rule.partnerId ?? "");
                const complete = draft.destinationId !== "" && draft.partnerId !== "";
                return (
                  <div
                    key={rule.supplierId}
                    className="border-b border-base-100 px-4 py-3 last:border-b-0"
                  >
                    <div className="text-body font-semibold text-base-900">
                      {rule.supplierName}
                    </div>
                    <div className="mt-2 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                      <label className="text-meta font-semibold text-base-700">
                        Collector
                        <select
                          aria-label={`Collector for ${rule.supplierName}`}
                          value={draft.partnerId}
                          disabled={!canEdit}
                          onChange={(event) =>
                            setCollectionDrafts((current) => ({
                              ...current,
                              [rule.supplierId]: {
                                ...draft,
                                partnerId: event.target.value,
                              },
                            }))
                          }
                          className={`${INPUT_CLS} mt-1 disabled:bg-base-50 disabled:text-base-500`}
                        >
                          <option value="">Choose collector</option>
                          {(data.deliveryPartners ?? []).map((partner) => (
                            <option key={partner.id} value={partner.id}>{partner.name}</option>
                          ))}
                        </select>
                      </label>
                      <label className="text-meta font-semibold text-base-700">
                        Deliver To
                        <select
                          aria-label={`Deliver To for ${rule.supplierName}`}
                          value={draft.destinationId}
                          disabled={!canEdit}
                          onChange={(event) =>
                            setCollectionDrafts((current) => ({
                              ...current,
                              [rule.supplierId]: {
                                ...draft,
                                destinationId: event.target.value,
                              },
                            }))
                          }
                          className={`${INPUT_CLS} mt-1 disabled:bg-base-50 disabled:text-base-500`}
                        >
                          <option value="">Choose Deliver To</option>
                          {data.destinations
                            .filter((destination) => destination.active || destination.id === draft.destinationId)
                            .map((destination) => (
                              <option key={destination.id} value={destination.id}>{destination.name}</option>
                            ))}
                        </select>
                      </label>
                      {canEdit && (
                        <button
                          type="button"
                          disabled={!dirty || !complete || setSupplierCollection.isPending}
                          className="btn-primary text-meta disabled:opacity-40"
                          onClick={() =>
                            setSupplierCollection
                              .mutateAsync({
                                supplierId: rule.supplierId,
                                destinationId: draft.destinationId,
                                partnerId: draft.partnerId,
                              })
                              .then(() => {
                                setCollectionDrafts((current) => {
                                  const next = { ...current };
                                  delete next[rule.supplierId];
                                  return next;
                                });
                                toast.success("Saved");
                              })
                              .catch(fail)
                          }
                        >
                          Save
                        </button>
                      )}
                    </div>
                    <div className="mt-2 text-meta text-base-500">
                      {partnerName && destinationName
                        ? `${partnerName} collects from ${rule.supplierName} and delivers to ${destinationName}.`
                        : "Set both the collector and Deliver To before issuing a PO."}
                    </div>
                    <ChangeLine
                      settings={data}
                      settingKey="supplier_collection"
                      supplierId={rule.supplierId}
                    />
                  </div>
                );
              })
            )}
          </div>
          </Block>
        </div>

        {/* ── Production working days, per supplier × category ─────────────── */}
        <div className="mb-8 max-w-[860px]">
          <Block title="Production working days" subtitle={"How long each factory takes to make an item. Only the factories that have SKUs appear here."}>
          <div className="bg-white">
            {rows.length === 0 && (
              <div className="py-4 text-body text-base-600">
                No factory has SKUs yet. Add SKUs in Operation Catalog and the
                factory appears here.
              </div>
            )}
            {rows.map(({ supplier, category, workingDays }) => {
              const key = `${supplier.id}::${category}`;
              const draft = prodDraft[key] ?? (workingDays == null ? "" : String(workingDays));
              const n = Number(draft);
              const valid =
                draft !== "" &&
                Number.isInteger(n) &&
                n >= PRODUCTION_WORKING_DAYS_RANGE.min &&
                n <= PRODUCTION_WORKING_DAYS_RANGE.max;
              const dirty = valid && n !== workingDays;
              return (
                <div
                  key={key}
                  className="py-3 border-b border-base-100 last:border-b-0 flex items-start justify-between gap-4 flex-wrap"
                  data-testid={`production-row-${category}`}
                >
                  <div className="min-w-[240px]">
                    <div className="text-body text-base-900">
                      {supplier.name} · {CATEGORY_LABEL[category]}
                    </div>
                    {workingDays == null && (
                      <div className="text-meta text-warning mt-0.5" data-testid="set-a-number">
                        Set a number
                      </div>
                    )}
                    <ChangeLine
                      settings={data}
                      settingKey="production_days"
                      supplierId={supplier.id}
                      category={category}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={PRODUCTION_WORKING_DAYS_RANGE.min}
                      max={PRODUCTION_WORKING_DAYS_RANGE.max}
                      step={1}
                      value={draft}
                      disabled={!canEdit}
                      onChange={(e) =>
                        setProdDraft((d) => ({ ...d, [key]: e.target.value }))
                      }
                      className={`${INPUT_CLS} w-24 disabled:opacity-60`}
                      data-testid={`production-days-${category}`}
                    />
                    <span className="text-meta text-base-500 w-[86px]">working days</span>
                    {canEdit && (
                      <button
                        type="button"
                        disabled={!dirty || setProduction.isPending}
                        onClick={() =>
                          setProduction
                            .mutateAsync({ supplierId: supplier.id, category, days: n })
                            .then(() => {
                              setProdDraft((d) => {
                                const next = { ...d };
                                delete next[key];
                                return next;
                              });
                              toast.success("Saved");
                            })
                            .catch(fail)
                        }
                        className="btn-primary text-meta disabled:opacity-40"
                        data-testid={`production-save-${category}`}
                      >
                        Save
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-label text-base-500 mt-2">
            One factory at a time. A PO already sent keeps the date it was sent
            with.
          </p>
          </Block>
        </div>

        {/* ── Transit days, per supplier ───────────────────────────────────
            THE SECOND LEG OF THE LEAD TIME (owner correction, 2026-09-09).
            `purchasing_supplier_settings.transit_days` and its audited write
            door have existed since migration 0318, and NOTHING in the portal
            has ever shown or set them — while Manual Purchase told the operator
            "Add transit days for {supplier} in Settings". This is that field.
            The stored values are read as they are; nothing is defaulted, and a
            supplier nobody has set reads `Set a number`. */}
        <div className="mb-8 max-w-[860px]" data-testid="transit-days-settings">
          <Block title="Transit days" subtitle={"Working days between the factory finishing and the goods reaching Carres. Counted on the Carres work week, not the factory’s."}>
          <div className="bg-white">
            {data.suppliers.length === 0 && (
              <div className="py-4 text-body text-base-600">
                No factory has SKUs yet. Add SKUs in Operation Catalog and the
                factory appears here.
              </div>
            )}
            {data.suppliers.map((s) => {
              const draft =
                transitDraft[s.id] ?? (s.transitDays == null ? "" : String(s.transitDays));
              const n = Number(draft);
              const valid =
                draft !== "" &&
                Number.isInteger(n) &&
                n >= TRANSIT_DAYS_RANGE.min &&
                n <= TRANSIT_DAYS_RANGE.max;
              const dirty = valid && n !== s.transitDays;
              return (
                <div
                  key={s.id}
                  className="py-3 border-b border-base-100 last:border-b-0 flex items-start justify-between gap-4 flex-wrap"
                  data-testid={`transit-row-${s.id}`}
                >
                  <div className="min-w-[240px]">
                    <div className="text-body text-base-900">{s.name}</div>
                    {s.transitDays == null && (
                      <div
                        className="text-meta text-warning mt-0.5"
                        data-testid={`transit-set-a-number-${s.id}`}
                      >
                        Set a number
                      </div>
                    )}
                    <ChangeLine
                      settings={data}
                      settingKey="supplier_transit_days"
                      supplierId={s.id}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={TRANSIT_DAYS_RANGE.min}
                      max={TRANSIT_DAYS_RANGE.max}
                      step={1}
                      value={draft}
                      disabled={!canEdit}
                      onChange={(e) =>
                        setTransitDraft((d) => ({ ...d, [s.id]: e.target.value }))
                      }
                      className={`${INPUT_CLS} w-24 disabled:opacity-60`}
                      data-testid={`transit-days-${s.id}`}
                    />
                    <span className="text-meta text-base-500 w-[86px]">working days</span>
                    {canEdit && (
                      <button
                        type="button"
                        disabled={!dirty || setTransit.isPending}
                        onClick={() =>
                          setTransit
                            .mutateAsync({ supplierId: s.id, days: n })
                            .then(() => {
                              setTransitDraft((d) => {
                                const next = { ...d };
                                delete next[s.id];
                                return next;
                              });
                              toast.success("Saved");
                            })
                            .catch(fail)
                        }
                        className="btn-primary text-meta disabled:opacity-40"
                        data-testid={`transit-save-${s.id}`}
                      >
                        Save
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-label text-base-500 mt-2">
            Order By allows for this time as well as production time, so the
            Safety days stay whole.
          </p>
          </Block>
        </div>

        {/* ── Payment terms, per supplier (0530) ───────────────────────────
            Days after the bill date. A PO's own terms win over these; the
            bill form fills in the due date from whichever is set. Empty = not
            set, and nothing waits on it. */}
        <div className="mb-8 max-w-[860px]" data-testid="terms-days-settings">
          <Block title="Payment terms" subtitle={"Days after the supplier’s bill date that the bill is due. A PO’s own terms come first."}>
          <div className="bg-white">
            {data.suppliers.map((s) => {
              const saved = s.termsDays ?? null;
              const draft = termsDraft[s.id] ?? (saved == null ? "" : String(saved));
              const n = draft.trim() === "" ? null : Number(draft);
              const valid = n === null || (Number.isInteger(n) && n >= 0 && n <= 365);
              const dirty = valid && n !== saved;
              return (
                <div
                  key={s.id}
                  className="py-3 border-b border-base-100 last:border-b-0 flex items-end justify-between gap-4 flex-wrap"
                  data-testid={`terms-row-${s.id}`}
                >
                  <div className="min-w-[240px] text-body text-base-900">{s.name}</div>
                  <div className="flex items-end gap-2">
                    <div className="w-32">
                      <Input
                        id={`terms-days-${s.id}`}
                        label="Terms (days)"
                        type="number"
                        min={0}
                        max={365}
                        step={1}
                        value={draft}
                        disabled={!canEdit}
                        error={valid ? undefined : "0 to 365"}
                        onChange={(e) => setTermsDraft((d) => ({ ...d, [s.id]: e.target.value }))}
                      />
                    </div>
                    {canEdit && (
                      <button
                        type="button"
                        disabled={!dirty || setTerms.isPending}
                        onClick={() =>
                          setTerms
                            .mutateAsync({ supplierId: s.id, days: n })
                            .then(() => {
                              setTermsDraft((d) => {
                                const next = { ...d };
                                delete next[s.id];
                                return next;
                              });
                              toast.success("Saved");
                            })
                            .catch(fail)
                        }
                        className="btn-primary text-meta disabled:opacity-40"
                        data-testid={`terms-save-${s.id}`}
                      >
                        Save
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          </Block>
        </div>

        {/* ── Supplier addresses (0611) ─────────────────────────────────────
            `Address` prints on the PO and Repair Order PDFs; `Return address`
            is a Purchase Return's `Return To` (Purchasing §9.6). Two separate
            facts, saved one at a time: one is never copied into the other,
            and a blank saves nothing recorded. */}
        <div className="mb-8 max-w-[860px]" data-testid="supplier-address-settings">
          <Block title="Supplier addresses" subtitle="The Address prints on the PO. Purchase Returns go to the Return address.">
          <div className="bg-white">
            {data.suppliers.map((s) => (
              <div
                key={s.id}
                className="py-3 border-b border-base-100 last:border-b-0"
                data-testid={`address-row-${s.id}`}
              >
                <div className="mb-2 text-body font-semibold text-base-900">{s.name}</div>
                <div className="grid grid-cols-1 gap-3 min-[820px]:grid-cols-2">
                  {(["address", "returnAddress"] as const).map((kind) => {
                    const key = `${s.id}:${kind}`;
                    const saved = (kind === "address" ? s.address : s.returnAddress) ?? "";
                    const draft = addressDraft[key] ?? saved;
                    const dirty = draft.trim() !== saved.trim();
                    const label = kind === "address" ? "Address" : "Return address";
                    return (
                      <div key={kind} className="flex flex-col gap-2">
                        <Textarea
                          id={`supplier-${kind}-${s.id}`}
                          label={label}
                          rows={3}
                          maxLength={SUPPLIER_ADDRESS_MAX}
                          value={draft}
                          disabled={!canEdit}
                          placeholder={canEdit ? undefined : GOODS_ABSENCE_WORDS.notRecorded}
                          onChange={(e) => setAddressDraft((d) => ({ ...d, [key]: e.target.value }))}
                        />
                        {canEdit && (
                          <div>
                            <button
                              type="button"
                              disabled={!dirty || setAddress.isPending}
                              onClick={() =>
                                setAddress
                                  .mutateAsync({ supplierId: s.id, kind, text: draft })
                                  .then(() => {
                                    setAddressDraft((d) => {
                                      const next = { ...d };
                                      delete next[key];
                                      return next;
                                    });
                                    toast.success("Saved");
                                  })
                                  .catch(fail)
                              }
                              className="btn-primary text-meta disabled:opacity-40"
                              data-testid={`supplier-${kind}-save-${s.id}`}
                            >
                              Save
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          </Block>
        </div>

        {/* ── Supplier work week ───────────────────────────────────────────── */}
        <div className="mb-8 max-w-[860px]">
          <Block title="Supplier work week" subtitle={"The days each factory works. Pick the days it is open."}>
          <div className="bg-white">
            {data.suppliers.map((s) => {
              const off = weekDraft[s.id] ?? s.offDays ?? [SUNDAY];
              const working = WEEKDAYS.map((w) => w.day).filter((d) => !off.includes(d));
              const dirty =
                weekDraft[s.id] !== undefined &&
                [...off].sort().join(",") !== [...(s.offDays ?? [SUNDAY])].sort().join(",");
              return (
                <div
                  key={s.id}
                  className="py-3 border-b border-base-100 last:border-b-0 flex items-start justify-between gap-4 flex-wrap"
                >
                  <div className="min-w-[200px]">
                    <div className="text-body text-base-900">{s.name}</div>
                    <div className="text-meta text-base-500 mt-0.5">
                      {workWeekLabel(off)}
                    </div>
                    <ChangeLine
                      settings={data}
                      settingKey="supplier_work_week"
                      supplierId={s.id}
                    />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <DayPicker
                      selected={working}
                      canEdit={canEdit}
                      onChange={(days) =>
                        setWeekDraft((d) => ({
                          ...d,
                          // Sunday is never offered and is always stored as
                          // off: it is a non-working day for everyone, and a
                          // checkbox for it would read as though a phone call
                          // could buy one.
                          [s.id]: [
                            SUNDAY,
                            ...WEEKDAYS.map((w) => w.day).filter((x) => !days.includes(x)),
                          ],
                        }))
                      }
                      testId={`work-week-${s.id}`}
                    />
                    {canEdit && (
                      <button
                        type="button"
                        disabled={!dirty || off.length === 0 || off.length > 5 || setWorkWeek.isPending}
                        onClick={() =>
                          setWorkWeek
                            .mutateAsync({ supplierId: s.id, offDays: off })
                            .then(() => {
                              setWeekDraft((d) => {
                                const next = { ...d };
                                delete next[s.id];
                                return next;
                              });
                              toast.success("Saved");
                            })
                            .catch(fail)
                        }
                        className="btn-primary text-meta disabled:opacity-40"
                        data-testid={`work-week-save-${s.id}`}
                      >
                        Save
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          </Block>
        </div>

        {/* ── The single numbers ───────────────────────────────────────────── */}
        <div className="mb-8 max-w-[860px]">
          <Block title="The other numbers">
          <div className="bg-white">
            <NumberRow
              label="Safety days"
              hint="Extra time allowed for delays."
              unit="working days"
              value={data.orderByBufferDays}
              min={PURCHASING_NUMBER_RANGE.order_by_buffer_days.min}
              max={PURCHASING_NUMBER_RANGE.order_by_buffer_days.max}
              canEdit={canEdit}
              pending={setNumber.isPending}
              testId="safety-days"
              onSave={(n) => saveNumber("order_by_buffer_days", n)}
            >
              <ChangeLine settings={data} settingKey="order_by_buffer_days" />
            </NumberRow>

            <NumberRow
              label="Earliest date a store may sell"
              hint="A sofa, bed frame or mattress cannot be sold for a date closer than this."
              unit="days"
              value={data.earliestSellDays}
              min={PURCHASING_NUMBER_RANGE.earliest_sell_days.min}
              max={PURCHASING_NUMBER_RANGE.earliest_sell_days.max}
              canEdit={canEdit}
              pending={setNumber.isPending}
              testId="earliest-sell-days"
              onSave={(n) => saveNumber("earliest_sell_days", n)}
            >
              <ChangeLine settings={data} settingKey="earliest_sell_days" />
            </NumberRow>

            {/* 0422 — the sibling of the row above: CALENDAR days, same
                unit, same 0..365, same audited `purchasing_set_number` door.
                The Manual Purchase create door refuses a Delivery Date
                earlier than Proceed Date + this; 0 means no floor. */}
            <NumberRow
              label="Earliest Delivery Date a Manual Purchase Request may ask for"
              hint="A Manual Purchase Request cannot ask for a Delivery Date closer than this to its Proceed Date."
              unit="days"
              value={data.manualPurchaseMinDeliveryDays}
              min={PURCHASING_NUMBER_RANGE.manual_purchase_min_delivery_days.min}
              max={PURCHASING_NUMBER_RANGE.manual_purchase_min_delivery_days.max}
              canEdit={canEdit}
              pending={setNumber.isPending}
              testId="manual-purchase-min-delivery-days"
              onSave={(n) => saveNumber("manual_purchase_min_delivery_days", n)}
            >
              <ChangeLine settings={data} settingKey="manual_purchase_min_delivery_days" />
            </NumberRow>

            <NumberRow
              label="Confirm delivery date"
              hint="Working days before the delivery date this call is raised."
              unit="working days"
              value={data.logisticsCallWorkingDays}
              min={PURCHASING_NUMBER_RANGE.logistics_call_working_days.min}
              max={PURCHASING_NUMBER_RANGE.logistics_call_working_days.max}
              canEdit={canEdit}
              pending={setNumber.isPending}
              testId="logistics-call-days"
              onSave={(n) => saveNumber("logistics_call_working_days", n)}
            >
              <ChangeLine settings={data} settingKey="logistics_call_working_days" />
            </NumberRow>

            {/* 0602 · 0603 — §9.7: "the governed setting supplies the period".
                Each Repair Order keeps the value that applied when the
                Supplier's receipt was recorded, so a change here never moves an
                existing RO's target. */}
            {data.repairReturnWorkingDays != null && (
              <NumberRow
                label="Repair return target"
                hint="Counted from when the Supplier receives the Repair Order."
                unit="working days"
                value={data.repairReturnWorkingDays}
                min={PURCHASING_NUMBER_RANGE.repair_return_working_days.min}
                max={PURCHASING_NUMBER_RANGE.repair_return_working_days.max}
                canEdit={canEdit}
                pending={setNumber.isPending}
                testId="repair-return-working-days"
                onSave={(n) => saveNumber("repair_return_working_days", n)}
              >
                <ChangeLine settings={data} settingKey="repair_return_working_days" />
              </NumberRow>
            )}

          </div>
          </Block>
        </div>

        {/* ⭐ SUPPLIER CLAIMS (Purchasing MASTER §9.5, owner-approved / LOCKED
            2026-09-06; storage 0606): the two reply-timing numbers, Office
            working days. The Supplier Claims lane reads them for `Reply
            expected`, `Reply overdue` and the escalation Work; a change never
            moves an existing claim's dated obligation. */}
        {data.claimReplyWaitingDays != null && data.claimEscalationExtraDays != null && (
          <div className="mt-8 max-w-[860px]" data-testid="supplier-claims-settings">
            <Block title="Supplier Claims">
              <div className="bg-white">
                <NumberRow
                  label="Reply waiting days"
                  hint="From the day we ask the supplier to the day a reply is expected."
                  unit="Office working days"
                  value={data.claimReplyWaitingDays}
                  min={PURCHASING_NUMBER_RANGE.claim_reply_waiting_days.min}
                  max={PURCHASING_NUMBER_RANGE.claim_reply_waiting_days.max}
                  canEdit={canEdit}
                  pending={setNumber.isPending}
                  testId="claim-reply-waiting-days"
                  onSave={(n) => saveNumber("claim_reply_waiting_days", n)}
                >
                  <ChangeLine settings={data} settingKey="claim_reply_waiting_days" />
                </NumberRow>
                <NumberRow
                  label="Extra days before escalation"
                  hint="After a missed reply, before the Purchasing Approver is asked to decide."
                  unit="Office working days"
                  value={data.claimEscalationExtraDays}
                  min={PURCHASING_NUMBER_RANGE.claim_escalation_extra_days.min}
                  max={PURCHASING_NUMBER_RANGE.claim_escalation_extra_days.max}
                  canEdit={canEdit}
                  pending={setNumber.isPending}
                  testId="claim-escalation-extra-days"
                  onSave={(n) => saveNumber("claim_escalation_extra_days", n)}
                >
                  <ChangeLine settings={data} settingKey="claim_escalation_extra_days" />
                </NumberRow>
              </div>
            </Block>
          </div>
        )}
      </div>
    </div>
  );

  function saveNumber(key: PurchasingNumberKey, value: number) {
    setNumber
      .mutateAsync({ key, value })
      .then(() => toast.success("Saved"))
      .catch(fail);
  }

  function saveDestination(draft: DestinationDraft) {
    const address = draft.address.trim() || null;
    const request =
      draft.mode === "add"
        ? createDestination.mutateAsync({ name: draft.name.trim(), address })
        : updateDestination.mutateAsync({
            destinationId: draft.id!,
            name: draft.name.trim(),
            address,
            active: draft.active,
            isDefault: draft.isDefault,
          });
    request
      .then(() => {
        setDestinationDraft(null);
        toast.success("Saved");
      })
      .catch(fail);
  }
}

/**
 * ⭐ PO WINDOWS — `PO Days` · `First PO window` · `Second PO window` with its
 * switch (MASTER §5.6.1; storage and audited door 0585). A change never
 * rewrites an issued PO; the SQL door records the old and new value, and the
 * history line reads it in clock words.
 */
function PoWindowsSection({
  settings,
  canEdit,
  poDays,
  poDirty,
  onPoDays,
  savingPoDays,
  onSavePoDays,
  onFail,
}: {
  settings: PurchasingSettingsResponse;
  canEdit: boolean;
  poDays: number[];
  poDirty: boolean;
  onPoDays: (days: number[]) => void;
  savingPoDays: boolean;
  onSavePoDays: () => Promise<unknown>;
  onFail: (e: unknown) => void;
}) {
  const saved = settings.poWindows;
  const setWindows = useSetPurchasingPoWindows();
  const [draft, setDraft] = useState<{ first: string; second: string; secondEnabled: boolean } | null>(null);
  const current = draft ?? {
    first: saved?.first ?? "",
    second: saved?.second ?? "",
    secondEnabled: saved?.secondEnabled ?? false,
  };
  const dirty =
    draft !== null &&
    (draft.first !== (saved?.first ?? "") ||
      draft.second !== (saved?.second ?? "") ||
      draft.secondEnabled !== (saved?.secondEnabled ?? false));
  /* The same two rules the SQL door enforces, said before the round trip. */
  const problem =
    current.first === ""
      ? "The first PO window needs a time."
      : current.secondEnabled && current.second === ""
        ? "The second PO window needs a time."
        : current.second !== "" && current.second <= current.first
          ? "The second PO window must be later than the first."
          : null;
  const patch = (next: Partial<typeof current>) => setDraft({ ...current, ...next });

  return (
    <Block title="PO windows" subtitle="When POs are bought each day. Lines added before a window are bought in it.">
      <div className="bg-white">
        <div className="py-3 border-b border-base-100">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-[240px]">
              <div className="text-body text-base-900">PO Days</div>
              <div className="text-meta text-base-500 mt-0.5">The days a PO window opens.</div>
              <ChangeLine settings={settings} settingKey="po_days" />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <DayPicker
                selected={poDays}
                canEdit={canEdit}
                onChange={onPoDays}
                testId="po-days"
                /* Jess, 2026-08-01: the Carres OFFICE does not work Saturday. */
                days={WEEKDAYS.filter((w) => w.day <= 5)}
              />

            </div>
          </div>
        </div>

        {saved == null ? (
          <p className="py-3 text-meta text-kit-slate-11" data-testid="po-windows-unread">
            Could not be loaded
          </p>
        ) : (
          <div className="py-3" data-testid="po-windows">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                id="po-window-first"
                type="time"
                label="First PO window"
                hint="Lines added before this time are bought in this window."
                value={current.first}
                disabled={!canEdit}
                onChange={(e) => patch({ first: e.target.value })}
              />
              <div className="flex flex-col gap-2">
                {/* The switch sits on the second window it governs, above its
                    time: decide whether there IS one, then give it a time. */}
                <Checkbox
                  id="po-window-second-on"
                  label="Use a second PO window"
                  checked={current.secondEnabled}
                  disabled={!canEdit}
                  onCheckedChange={(on) => patch({ secondEnabled: on, second: current.second || (saved.second ?? "16:00") })}
                />
                <Input
                  id="po-window-second"
                  type="time"
                  label="Second PO window"
                  hint="Lines added after the first window are bought here."
                  value={current.second}
                  disabled={!canEdit || !current.secondEnabled}
                  onChange={(e) => patch({ second: e.target.value })}
                />
              </div>
            </div>
            <ChangeLine settings={settings} settingKey="po_windows" />
            {canEdit && (
              <div className="mt-3 flex items-center gap-3">
                {/* ONE Save for the card: it stores whichever of the two facts
                    moved, PO Days first, each through its own audited door. */}
                <Button
                  size="sm"
                  disabled={
                    (!dirty && !poDirty) ||
                    (dirty && problem != null) ||
                    (poDirty && poDays.length === 0) ||
                    setWindows.isPending ||
                    savingPoDays
                  }
                  onClick={async () => {
                    try {
                      if (poDirty) await onSavePoDays();
                      if (dirty) {
                        await setWindows.mutateAsync({
                          first: current.first,
                          second: current.second === "" ? null : current.second,
                          secondEnabled: current.secondEnabled,
                        });
                        setDraft(null);
                      }
                      toast.success("Saved");
                    } catch (e) {
                      onFail(e);
                    }
                  }}
                  data-testid="po-windows-save"
                >
                  Save
                </Button>
                {dirty && problem ? (
                  <span className="text-meta text-kit-red-11" data-testid="po-windows-problem">{problem}</span>
                ) : null}
              </div>
            )}
            <SupplierLastPoTimes settings={settings} canEdit={canEdit} onFail={onFail} />
          </div>
        )}
      </div>
    </Block>
  );
}

/**
 * ⭐ A SUPPLIER'S OWN `Last PO time` (MASTER §5.6.1 "a supplier's governed
 * earlier cut-off always wins"; door 0585 `purchasing_set_supplier_po_cutoff`).
 * Owner 2026-09-29: it belongs in Settings beside the windows, never in the
 * database by hand. Empty = the supplier uses the PO windows. The time must be
 * earlier than the last PO window of the day; the door refuses anything else.
 */
function SupplierLastPoTimes({
  settings,
  canEdit,
  onFail,
}: {
  settings: PurchasingSettingsResponse;
  canEdit: boolean;
  onFail: (e: unknown) => void;
}) {
  const setCutoff = useSetSupplierPoCutoff();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const w = settings.poWindows;
  const last = w ? (w.secondEnabled && w.second ? w.second : w.first) : null;
  const save = (supplierId: string, cutoff: string | null) =>
    setCutoff
      .mutateAsync({ supplierId, cutoff })
      .then(() => {
        setDrafts((d) => {
          const next = { ...d };
          delete next[supplierId];
          return next;
        });
        toast.success("Saved");
      })
      .catch(onFail);
  if (settings.suppliers.length === 0) return null;
  return (
    <div className="mt-4 border-t border-base-100 pt-3" data-testid="supplier-last-po-times">
      <div className="text-body text-base-900">Last PO time for one supplier</div>
      <div className="text-meta text-base-500 mt-0.5">
        Only for a supplier that needs POs earlier. The rest use the PO windows.
      </div>
      <div className="mt-2">
        {settings.suppliers.map((s) => {
          const saved = s.poCutoff ?? "";
          const value = drafts[s.id] ?? saved;
          const dirty = value !== saved;
          const late = value !== "" && last != null && value >= last;
          return (
            <div key={s.id} className="py-2 border-b border-base-100 last:border-b-0" data-testid={`last-po-time-${s.id}`}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-[200px]">
                  <div className="text-body text-base-900">{s.name}</div>
                  <div className="text-meta text-base-500">
                    {saved ? clockWordOf(saved) : "Uses the PO windows"}
                  </div>
                  <ChangeLine settings={settings} settingKey="supplier_po_cutoff" supplierId={s.id} />
                </div>
                <div className="flex items-start gap-2">
                  {/* An empty time input draws the browser's own `--:-- --`,
                      a dash on screen (owner 2026-09-28). A supplier with no
                      time shows a door instead; opening it starts at the
                      first PO window, which the person then moves. */}
                  {value === "" && !(s.id in drafts) ? (
                    canEdit ? (
                      <Button
                        variant="neutral"
                        size="sm"
                        onClick={() => setDrafts((d) => ({ ...d, [s.id]: w?.first ?? "" }))}
                        data-testid={`last-po-time-${s.id}-open`}
                      >
                        Set a time
                      </Button>
                    ) : null
                  ) : (
                    <>
                      <Input
                        id={`last-po-time-${s.id}-input`}
                        type="time"
                        aria-label={`Last PO time for ${s.name}`}
                        value={value}
                        disabled={!canEdit}
                        error={late ? "Must be earlier than the last PO window." : undefined}
                        onChange={(e) => setDrafts((d) => ({ ...d, [s.id]: e.target.value }))}
                      />
                      {canEdit && (
                        <Button
                          size="sm"
                          disabled={!dirty || value === "" || late || setCutoff.isPending}
                          onClick={() => save(s.id, value)}
                          data-testid={`last-po-time-${s.id}-save`}
                        >
                          Save
                        </Button>
                      )}
                      {canEdit && saved !== "" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={setCutoff.isPending}
                          onClick={() => save(s.id, null)}
                          data-testid={`last-po-time-${s.id}-clear`}
                        >
                          Use the PO windows
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
