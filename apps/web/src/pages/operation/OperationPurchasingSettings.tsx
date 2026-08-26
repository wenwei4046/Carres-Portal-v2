// design-standard: not-a-list-page — Settings sits UNDER the Purchasing
// module tab bar, so UI-KIT §8.3's Module-tab law applies: no breadcrumb and
// no big title, because the active tab already says "Settings". Same shape as
// its siblings Claims and Receiving.
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  PURCHASING_NUMBER_RANGE,
  PRODUCTION_WORKING_DAYS_RANGE,
  SUNDAY,
  WEEKDAYS,
  lastChangeFor,
  settingValueLabel,
  workWeekLabel,
  type PurchasingCategory,
  type PurchasingNumberKey,
  type PurchasingSettingsResponse,
} from "@carres/shared";
import {
  usePurchasingSettings,
  useSetProductionDays,
  useSetPurchasingNumber,
  useSetPurchasingPoDays,
  useSetSupplierWorkWeek,
} from "@/lib/queries";
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
      {change.changedBy ?? "—"} · {fmtDate(change.changedAt)}
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
  const setWorkWeek = useSetSupplierWorkWeek();

  const [poDraft, setPoDraft] = useState<number[] | null>(null);
  const [weekDraft, setWeekDraft] = useState<Record<string, number[]>>({});
  const [prodDraft, setProdDraft] = useState<Record<string, string>>({});

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
        <div className="px-9 py-8 text-body text-base-500">Loading the numbers…</div>
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
              Couldn&rsquo;t load the numbers.
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
        <div className="text-body text-base-600 mb-[18px] max-w-[720px]">
          The numbers the ordering engine reads. Change one here and the
          order timing on SO Batch Purchase moves the same day.
          {!canEdit && " Manager only — read-only for your role."}
        </div>

        {/* ── Production working days, per supplier × category ─────────────── */}
        <section className="mb-8 max-w-[860px]">
          <h2 className="text-strong font-semibold text-base-900 mb-1">
            Production working days
          </h2>
          <p className="text-meta text-base-500 mb-3">
            How long each factory takes to make an item. Only the factories that
            have SKUs appear here.
          </p>
          <div className="bg-white border border-base-200 rounded-[10px] px-4">
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
            One factory at a time — a PO already sent keeps the date it was sent
            with.
          </p>
        </section>

        {/* ── Supplier work week ───────────────────────────────────────────── */}
        <section className="mb-8 max-w-[860px]">
          <h2 className="text-strong font-semibold text-base-900 mb-1">
            Supplier work week
          </h2>
          <p className="text-meta text-base-500 mb-3">
            The days each factory works. Pick the days it is open.
          </p>
          <div className="bg-white border border-base-200 rounded-[10px] px-4">
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
        </section>

        {/* ── The single numbers ───────────────────────────────────────────── */}
        <section className="mb-8 max-w-[860px]">
          <h2 className="text-strong font-semibold text-base-900 mb-3">
            The other numbers
          </h2>
          <div className="bg-white border border-base-200 rounded-[10px] px-4">
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

            <div className="py-3 border-b border-base-100 last:border-b-0">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-[240px]">
                  <div className="text-body text-base-900">PO days</div>
                  <div className="text-meta text-base-500 mt-0.5">
                    The days POs are sent. A late line never waits for one.
                  </div>
                  <ChangeLine settings={data} settingKey="po_days" />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <DayPicker
                    selected={poDays}
                    canEdit={canEdit}
                    onChange={setPoDraft}
                    testId="po-days"
                    /* Jess, 2026-08-01: the Carres OFFICE does not work
                     * Saturday, and a PO run nobody is in the office to run
                     * is a checkbox that lies. Supplier work weeks keep
                     * their Saturday — Ohana works it. */
                    days={WEEKDAYS.filter((w) => w.day <= 5)}
                  />
                  {canEdit && (
                    <button
                      type="button"
                      disabled={!poDirty || poDays.length === 0 || setPoDays.isPending}
                      onClick={() =>
                        setPoDays
                          .mutateAsync({ days: poDays })
                          .then(() => {
                            setPoDraft(null);
                            toast.success("Saved");
                          })
                          .catch(fail)
                      }
                      className="btn-primary text-meta disabled:opacity-40"
                      data-testid="po-days-save"
                    >
                      Save
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );

  function saveNumber(key: PurchasingNumberKey, value: number) {
    setNumber
      .mutateAsync({ key, value })
      .then(() => toast.success("Saved"))
      .catch(fail);
  }
}
