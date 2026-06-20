import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, Minus, AlertTriangle, Search, ChevronDown, X } from "lucide-react";
import { toast } from "sonner";
import type {
  CatalogResponse,
  ComboComponentDto,
  ComboCreateInput,
  ComboDto,
  ProductCategory,
} from "@carres/shared";
import { comboCreateInput, comboPatchInput } from "@carres/shared";
import { ApiError } from "@/lib/api";
import { useCreateCombo, useDeleteCombo, useUpdateCombo } from "@/lib/queries";
import { INPUT_CLS, Modal } from "@/pages/operation/components/Modal";
import { CodeChip } from "../components/atoms";

/**
 * Combos (套餐) — the 4th Product & Maintenance tab. A combo is a fixed-set
 * bundle sold at ONE combo price; its component SKUs split the price back out
 * via explodeCombo() at submit time (migration 0177, shared `combo.ts`).
 *
 * This tab is principal-gated EXACTLY like the Maintenance delivery-fee /
 * fabric-tier editors: combos_write_principal RLS + the API's 403 are the real
 * boundary, and the UI here just hides Add/Edit/Delete from non-principals so
 * they get a friendly read-only list rather than a 403 toast.
 *
 *   • List      — name · combo price · component summary · active/inactive
 *                 badge; Edit + (soft-)Delete per row (principal only). Inactive
 *                 combos render faded, like discontinued models.
 *   • Editor    — modal create/edit: name + combo price + component rows
 *                 (searchable SKU picker + qty stepper, ≥1 row). Validated by
 *                 the SAME `comboCreateInput` / `comboPatchInput` zod the API
 *                 uses (§9.5 — one schema, two consumers).
 *   • Readouts  — implied discount (Σ component catalog price × qty vs combo
 *                 price) + a non-blocking sofa-mutex warning (the 0089 category
 *                 rule rejects orders mixing sofa with mattress/bedframe, so a
 *                 combo doing that would be unsellable — warn the author).
 */

function fmtRM(n: number): string {
  return n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function CombosTab({
  catalog,
  isPrincipal,
}: {
  catalog: CatalogResponse;
  isPrincipal: boolean;
}) {
  const combos = catalog.combos ?? [];
  const del = useDeleteCombo();
  // null = closed · "new" = create · a ComboDto = edit that combo
  const [editing, setEditing] = useState<ComboDto | "new" | null>(null);

  // sku → catalog price (admin bundle has every SKU incl. pos_active=false).
  const priceBySku = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of catalog.skus) m.set(s.sku, s.price);
    return m;
  }, [catalog.skus]);

  function removeCombo(combo: ComboDto) {
    if (
      !confirm(
        `Disable combo "${combo.name}"? It will no longer be offered at checkout and ` +
          `will show as inactive here. Re-enable it later by editing it and toggling Active back on.`,
      )
    )
      return;
    del.mutate(combo.id, {
      onSuccess: () => toast.success(`${combo.name} disabled`),
      onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : "Disable failed"),
    });
  }

  return (
    <section className="max-w-[860px]">
      <div className="flex items-center justify-between mb-1">
        <div className="t-h4 font-display">Combos</div>
        {isPrincipal && (
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="btn-primary text-[12px] inline-flex items-center gap-1.5"
            data-testid="combos-add"
          >
            <Plus size={14} strokeWidth={2.4} /> New combo
          </button>
        )}
      </div>
      <p className="t-tiny text-base-500 mb-3">
        Fixed-set bundles sold at one combo price. The components split the price back out at
        checkout. Pricing is principal-only.
        {!isPrincipal && " Read-only for your role."}
      </p>

      <div className="bg-white border border-base-200 rounded-[4px] overflow-hidden">
        <div
          className="grid items-center gap-3 px-3 py-2 bg-base-50 border-b border-base-200"
          style={{ gridTemplateColumns: "minmax(160px,1.4fr) 120px minmax(180px,1.6fr) 90px 120px" }}
        >
          <div className="label">Name</div>
          <div className="label text-right">Combo price</div>
          <div className="label">Components</div>
          <div className="label">Status</div>
          <div className="label text-right">{isPrincipal ? "Actions" : ""}</div>
        </div>
        {combos.length === 0 && (
          <div className="t-small text-base-500 px-3 py-4">No combos configured.</div>
        )}
        {combos.map((combo) => (
          <ComboRow
            key={combo.id}
            combo={combo}
            priceBySku={priceBySku}
            isPrincipal={isPrincipal}
            deleting={del.isPending}
            onEdit={() => setEditing(combo)}
            onDelete={() => removeCombo(combo)}
          />
        ))}
      </div>

      {isPrincipal && editing !== null && (
        <ComboEditor
          catalog={catalog}
          combo={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// List row
// ---------------------------------------------------------------------------

function componentSummary(components: ComboComponentDto[]): string {
  const n = components.length;
  const head = components
    .slice(0, 3)
    .map((c) => `${c.sku} ×${c.qty}`)
    .join(", ");
  const tail = n > 3 ? `, +${n - 3} more` : "";
  return `${n} item${n === 1 ? "" : "s"}: ${head}${tail}`;
}

function ComboRow({
  combo,
  priceBySku,
  isPrincipal,
  deleting,
  onEdit,
  onDelete,
}: {
  combo: ComboDto;
  priceBySku: Map<string, number>;
  isPrincipal: boolean;
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const componentsTotal = combo.components.reduce(
    (sum, c) => sum + (priceBySku.get(c.sku) ?? 0) * c.qty,
    0,
  );
  const saves = componentsTotal - combo.comboPrice;

  return (
    <div
      className={`grid items-center gap-3 px-3 py-2 border-b border-base-100 last:border-b-0 ${
        combo.active ? "" : "opacity-50"
      }`}
      style={{ gridTemplateColumns: "minmax(160px,1.4fr) 120px minmax(180px,1.6fr) 90px 120px" }}
      data-testid={`combo-row-${combo.id}`}
    >
      <div>
        <div className="t-small font-semibold text-base-900">{combo.name}</div>
        <div className="t-tiny text-base-400">
          <CodeChip>{combo.comboKey}</CodeChip>
        </div>
      </div>
      <div className="text-right font-mono text-[12px] text-base-800">
        RM {fmtRM(combo.comboPrice)}
        {saves > 0 && (
          <div className="t-tiny text-base-400 font-sans">saves RM {fmtRM(saves)}</div>
        )}
      </div>
      <div className="t-tiny text-base-600">{componentSummary(combo.components)}</div>
      <div>
        {combo.active ? (
          <span className="pill pill-confirmed">Active</span>
        ) : (
          <span className="pill pill-neutral">Inactive</span>
        )}
      </div>
      <div className="text-right flex justify-end gap-3">
        {isPrincipal && (
          <>
            <button
              type="button"
              onClick={onEdit}
              className="t-tiny font-semibold text-base-700 hover:text-base-900 underline"
              data-testid={`combo-edit-${combo.id}`}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={deleting}
              className="btn-danger text-[11px]"
              data-testid={`combo-delete-${combo.id}`}
            >
              Disable
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Searchable SKU picker
// ---------------------------------------------------------------------------

type SkuOption = CatalogResponse["skus"][number];

/** Cap the rendered list so a 1k-SKU catalog never paints all rows at once. */
const SKU_RESULT_CAP = 50;

/**
 * A searchable single-SKU picker — replaces the old native <select> that
 * listed all ~1017 SKUs. Controlled `value` is the SKU code (same string the
 * native select drove); `onChange(code)` reports a pick (or "" when cleared).
 *
 * Behaviour:
 *   • text input filters `options` by code OR description (case-insensitive),
 *     capping the rendered list at SKU_RESULT_CAP with a "refine search" hint
 *     when more match;
 *   • click a result (or Enter on the highlighted one) to pick → input collapses
 *     to show the picked code;
 *   • ArrowUp / ArrowDown move the highlight, Escape closes, blur closes;
 *   • a small clear (X) button resets the row's SKU.
 *
 * Self-contained (plain React, no new deps) so it touches nothing outside this
 * tab and can't regress the PO flow.
 */
function SkuPicker({
  value,
  options,
  onChange,
  testId,
}: {
  value: string;
  options: SkuOption[];
  onChange: (sku: string) => void;
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => options.find((o) => o.sku === value),
    [options, value],
  );

  // Filter by code OR description, case-insensitive; cap the rendered list.
  const q = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return options;
    return options.filter(
      (o) =>
        o.sku.toLowerCase().includes(q) ||
        (o.description ?? "").toLowerCase().includes(q),
    );
  }, [options, q]);
  const shown = matches.slice(0, SKU_RESULT_CAP);
  const overflow = matches.length - shown.length;

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  function openPanel() {
    setQuery("");
    setHighlight(0);
    setOpen(true);
    // focus the search box on next paint
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function pick(sku: string) {
    onChange(sku);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, shown.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = shown[highlight];
      if (opt) pick(opt.sku);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div className="relative flex-1" ref={wrapRef}>
      {open ? (
        <div className="relative">
          <Search
            size={14}
            strokeWidth={2.2}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-base-400 pointer-events-none"
          />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlight(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Search by code or description…"
            className={`${INPUT_CLS} pl-8`}
            data-testid={testId}
            role="combobox"
            aria-expanded="true"
            aria-autocomplete="list"
          />
          <div
            className="absolute z-20 left-0 right-0 mt-1 max-h-60 overflow-auto rounded-[4px] border border-base-200 bg-white shadow-md"
            role="listbox"
            data-testid={`${testId}-list`}
          >
            {shown.length === 0 ? (
              <div className="t-tiny text-base-400 px-3 py-2">No SKUs match.</div>
            ) : (
              shown.map((o, idx) => (
                <button
                  key={o.id}
                  type="button"
                  role="option"
                  aria-selected={idx === highlight}
                  // onMouseDown (not onClick) so the pick fires before the
                  // input's blur can close the panel.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(o.sku);
                  }}
                  onMouseEnter={() => setHighlight(idx)}
                  className={`block w-full text-left px-3 py-1.5 ${
                    idx === highlight ? "bg-base-100" : "hover:bg-base-50"
                  }`}
                  data-testid={`${testId}-opt-${o.sku}`}
                >
                  <span className="font-mono text-[12px] text-base-900">{o.sku}</span>
                  {o.description ? (
                    <span className="t-tiny text-base-500 ml-2">{o.description}</span>
                  ) : null}
                </button>
              ))
            )}
            {overflow > 0 && (
              <div className="t-tiny text-base-400 px-3 py-1.5 border-t border-base-100">
                +{overflow} more — refine your search
              </div>
            )}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={openPanel}
          className={`${INPUT_CLS} flex items-center justify-between text-left ${
            value ? "font-mono" : "text-base-400"
          }`}
          data-testid={testId}
        >
          <span className="truncate">
            {value ? (
              <>
                {value}
                {selected?.description ? (
                  <span className="t-tiny text-base-500 ml-2 font-sans">
                    {selected.description}
                  </span>
                ) : null}
              </>
            ) : (
              "Select a SKU…"
            )}
          </span>
          {value ? (
            <span
              role="button"
              aria-label="clear SKU"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              className="ml-1 text-base-400 hover:text-base-700 shrink-0"
              data-testid={`${testId}-clear`}
            >
              <X size={14} strokeWidth={2.2} />
            </span>
          ) : (
            <ChevronDown size={14} strokeWidth={2.2} className="text-base-400 shrink-0" />
          )}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor (create + edit)
// ---------------------------------------------------------------------------

interface DraftRow {
  sku: string;
  qty: number;
}

/** Categories that trigger the 0089 sofa-mutex when mixed with sofa. */
const MUTEX_AGAINST_SOFA: ReadonlySet<ProductCategory> = new Set(["mattress", "bedframe"]);

function ComboEditor({
  catalog,
  combo,
  onClose,
}: {
  catalog: CatalogResponse;
  combo: ComboDto | null;
  onClose: () => void;
}) {
  const create = useCreateCombo();
  const update = useUpdateCombo();
  const editing = combo !== null;

  const [name, setName] = useState(combo?.name ?? "");
  const [price, setPrice] = useState(combo ? String(combo.comboPrice) : "");
  const [active, setActive] = useState(combo?.active ?? true);
  const [rows, setRows] = useState<DraftRow[]>(
    combo
      ? combo.components.map((c) => ({ sku: c.sku, qty: c.qty }))
      : [{ sku: "", qty: 1 }],
  );

  const busy = create.isPending || update.isPending;

  // sku → catalog price + category (admin bundle has all SKUs + models).
  const priceBySku = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of catalog.skus) m.set(s.sku, s.price);
    return m;
  }, [catalog.skus]);

  const categoryBySku = useMemo(() => {
    const catByModel = new Map<string, ProductCategory>();
    for (const model of catalog.models) catByModel.set(model.id, model.category);
    const m = new Map<string, ProductCategory>();
    for (const s of catalog.skus) {
      const cat = catByModel.get(s.modelId);
      if (cat) m.set(s.sku, cat);
    }
    return m;
  }, [catalog.models, catalog.skus]);

  // Sorted SKU options for the picker (by code).
  const skuOptions = useMemo(
    () => [...catalog.skus].sort((a, b) => a.sku.localeCompare(b.sku)),
    [catalog.skus],
  );

  // --- derived: components payload ---------------------------------------
  const components = rows
    .map((r, i) => ({ sku: r.sku.trim(), qty: r.qty, sortOrder: i }))
    .filter((r) => r.sku.length > 0);

  // --- implied discount --------------------------------------------------
  const priceNum = Number(price);
  const priceValid = Number.isFinite(priceNum) && priceNum >= 0;
  const componentsTotal = components.reduce(
    (sum, c) => sum + (priceBySku.get(c.sku) ?? 0) * c.qty,
    0,
  );
  const anyMissingPrice = components.some((c) => !priceBySku.has(c.sku));
  const saves = priceValid ? componentsTotal - priceNum : 0;
  const savesPct =
    priceValid && componentsTotal > 0 ? (saves / componentsTotal) * 100 : 0;

  // --- sofa-mutex author warning -----------------------------------------
  const hasSofa = components.some((c) => categoryBySku.get(c.sku) === "sofa");
  const hasMutexPartner = components.some((c) => {
    const cat = categoryBySku.get(c.sku);
    return cat !== undefined && MUTEX_AGAINST_SOFA.has(cat);
  });
  const mutexWarning = hasSofa && hasMutexPartner;

  // --- validation via the shared zod (one schema, two consumers) ---------
  const candidate = {
    name: name.trim(),
    comboPrice: priceNum,
    active,
    components: components.map((c) => ({ sku: c.sku, qty: c.qty, sortOrder: c.sortOrder })),
  };
  const schema = editing ? comboPatchInput : comboCreateInput;
  const parsed = schema.safeParse(candidate);
  const canSave = parsed.success && !busy;

  function setRow(i: number, patch: Partial<DraftRow>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((rs) => [...rs, { sku: "", qty: 1 }]);
  }
  function removeRow(i: number) {
    setRows((rs) => (rs.length <= 1 ? rs : rs.filter((_, idx) => idx !== i)));
  }

  async function save() {
    if (!parsed.success) return;
    // comboKey is NOT a form field — the server derives it on create and
    // ignores it on edit (the patch never sends it).
    const payload: ComboCreateInput = {
      name: candidate.name,
      comboPrice: candidate.comboPrice,
      active: candidate.active,
      components: candidate.components,
    };
    try {
      if (editing && combo) {
        await update.mutateAsync({ id: combo.id, patch: payload });
        toast.success(`Updated ${candidate.name}`);
      } else {
        await create.mutateAsync(payload);
        toast.success(`Added ${candidate.name}`);
      }
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Save failed");
    }
  }

  return (
    <Modal title={editing ? "Edit combo" : "New combo"} onClose={onClose} size="lg">
      <div className="flex flex-col gap-4">
        {/* Scalar fields */}
        <div className="flex flex-wrap gap-4 items-end">
          <label className="block flex-1 min-w-[220px]">
            <span className="label block mb-1">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Bedroom Starter Set"
              className={INPUT_CLS}
              data-testid="combo-name"
            />
          </label>
          <label className="block">
            <span className="label block mb-1">Combo price (RM)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className={`${INPUT_CLS} w-40`}
              data-testid="combo-price"
            />
          </label>
          <label className="inline-flex items-center gap-2 pb-2 select-none cursor-pointer">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="accent-primary"
              data-testid="combo-active"
            />
            <span className="t-small text-base-700">Active</span>
          </label>
        </div>

        {/* Component rows */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="label">Components</span>
            <button
              type="button"
              onClick={addRow}
              className="btn-ghost text-[12px] inline-flex items-center gap-1"
              data-testid="combo-add-row"
            >
              <Plus size={13} strokeWidth={2.4} /> Add row
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {rows.map((row, i) => {
              const skuPrice = row.sku ? priceBySku.get(row.sku.trim()) : undefined;
              const cat = row.sku ? categoryBySku.get(row.sku.trim()) : undefined;
              return (
                <div
                  key={i}
                  className="flex items-center gap-2"
                  data-testid={`combo-comp-row-${i}`}
                >
                  <SkuPicker
                    value={row.sku}
                    options={skuOptions}
                    onChange={(sku) => setRow(i, { sku })}
                    testId={`combo-comp-sku-${i}`}
                  />
                  {/* qty stepper */}
                  <div className="inline-flex items-center border border-base-300 rounded-[4px] overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setRow(i, { qty: Math.max(1, row.qty - 1) })}
                      className="px-2 py-2 text-base-600 hover:bg-base-100 disabled:opacity-40"
                      disabled={row.qty <= 1}
                      aria-label={`decrease qty row ${i + 1}`}
                    >
                      <Minus size={13} strokeWidth={2.4} />
                    </button>
                    <input
                      type="number"
                      min={1}
                      step="1"
                      value={row.qty}
                      onChange={(e) => {
                        const v = Math.floor(Number(e.target.value));
                        setRow(i, { qty: Number.isFinite(v) && v >= 1 ? v : 1 });
                      }}
                      className="w-12 text-center text-[13px] border-x border-base-300 py-2 outline-none"
                      data-testid={`combo-comp-qty-${i}`}
                      aria-label={`qty row ${i + 1}`}
                    />
                    <button
                      type="button"
                      onClick={() => setRow(i, { qty: row.qty + 1 })}
                      className="px-2 py-2 text-base-600 hover:bg-base-100"
                      aria-label={`increase qty row ${i + 1}`}
                    >
                      <Plus size={13} strokeWidth={2.4} />
                    </button>
                  </div>
                  {/* per-row catalog price hint */}
                  <span className="t-tiny text-base-400 w-28 text-right font-mono">
                    {row.sku
                      ? skuPrice !== undefined
                        ? `RM ${fmtRM(skuPrice * row.qty)}`
                        : "no price"
                      : ""}
                    {cat ? <span className="ml-1 text-base-300">{cat[0].toUpperCase()}</span> : null}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    disabled={rows.length <= 1}
                    className="p-2 text-base-400 hover:text-danger disabled:opacity-30"
                    aria-label={`remove row ${i + 1}`}
                    data-testid={`combo-comp-remove-${i}`}
                  >
                    <Trash2 size={14} strokeWidth={2} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sofa-mutex warning (non-blocking) */}
        {mutexWarning && (
          <div
            className="flex items-start gap-2 rounded-[4px] border border-warning/40 bg-warning-soft px-3 py-2.5"
            data-testid="combo-mutex-warning"
          >
            <AlertTriangle size={16} strokeWidth={2} className="text-warning mt-0.5 shrink-0" />
            <p className="t-tiny text-base-700">
              This combo mixes a <b>sofa</b> with a <b>mattress / bedframe</b>. Orders containing it
              will be rejected at checkout by the category rule. Split it into separate combos.
            </p>
          </div>
        )}

        {/* Implied-discount readout */}
        <div
          className="rounded-[4px] border border-base-200 bg-base-50 px-3 py-2.5 t-small"
          data-testid="combo-discount-readout"
        >
          <span className="text-base-600">
            Components total <b className="font-mono text-base-800">RM {fmtRM(componentsTotal)}</b>
          </span>
          <span className="text-base-400 mx-2">·</span>
          <span className="text-base-600">
            Combo price{" "}
            <b className="font-mono text-base-800">
              RM {fmtRM(priceValid ? priceNum : 0)}
            </b>
          </span>
          <span className="text-base-400 mx-2">·</span>
          {saves >= 0 ? (
            <span className="text-base-700">
              Saves <b className="font-mono text-primary">RM {fmtRM(saves)}</b>
              {componentsTotal > 0 && (
                <span className="text-base-500"> ({savesPct.toFixed(1)}%)</span>
              )}
            </span>
          ) : (
            <span className="text-danger">
              Marked up <b className="font-mono">RM {fmtRM(-saves)}</b> (above component total)
            </span>
          )}
          {anyMissingPrice && (
            <span className="block t-tiny text-base-400 mt-1">
              A component has no catalog price — treated as RM 0 in this readout.
            </span>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 mt-1">
          <button type="button" onClick={onClose} className="btn-ghost text-[12px]">
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            className="btn-primary text-[12px] disabled:opacity-40"
            data-testid="combo-save"
          >
            {busy ? "Saving…" : editing ? "Save changes" : "Create combo"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
