import type { CatalogResponse } from "@carres/shared";
import { floorSurchargeRaw } from "@/lib/order-totals";
import {
  DISPOSAL_SIZE_OPTIONS,
  isDisposalAddon,
  type DraftAddon,
  type DraftLine,
  type WizardDraft,
} from "./draft";
import ProductPicker from "./ProductPicker";

interface Props {
  draft: WizardDraft;
  onChange: (next: WizardDraft) => void;
  catalog: CatalogResponse;
}

const RM = (n: number) =>
  `RM ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Step 2 — single-column layout matching proto/new-order-step2.jsx:
 *   Add products → Add-ons (3-col cards) → Stair carry (3-col grid with fee
 *   panel) → Order summary (full-width section at bottom).
 *
 * Floor surcharge math goes through `floorSurchargeRaw` (single source of
 * truth, also used by Step 3 + the order-detail page) so the wizard preview
 * and the order detail can never drift.
 */
export default function Step2Products({ draft, onChange, catalog }: Props) {
  const cfg = catalog.floorConfig;

  function setDelivery(patch: Partial<WizardDraft["delivery"]>) {
    onChange({ ...draft, delivery: { ...draft.delivery, ...patch } });
  }

  function addLine(line: DraftLine) {
    onChange({ ...draft, lines: [...draft.lines, line] });
  }

  function removeLine(localId: string) {
    onChange({ ...draft, lines: draft.lines.filter((l) => l.localId !== localId) });
  }

  function bumpLineQty(localId: string, delta: number) {
    onChange({
      ...draft,
      lines: draft.lines.map((l) =>
        l.localId === localId ? { ...l, qty: Math.max(1, l.qty + delta) } : l,
      ),
    });
  }

  function toggleAddon(addonKey: string) {
    const existing = draft.addons.find((a) => a.key === addonKey);
    if (existing) {
      onChange({ ...draft, addons: draft.addons.filter((a) => a.key !== addonKey) });
      return;
    }
    const meta = catalog.addons.find((a) => a.key === addonKey);
    if (!meta) return;
    const next: DraftAddon = { key: meta.key, qty: 1, unitPrice: meta.price, name: meta.name };
    // 2026-05-19 — disposal addons need a size pick before Step 2 will
    // advance. We init `attrs: {}` so the size dropdown renders empty (the
    // step2Valid gate keeps Continue disabled until a size is picked).
    if (isDisposalAddon(meta.key)) {
      next.attrs = {};
    }
    onChange({ ...draft, addons: [...draft.addons, next] });
  }

  function bumpAddonQty(addonKey: string, delta: number) {
    onChange({
      ...draft,
      addons: draft.addons.map((a) =>
        a.key === addonKey ? { ...a, qty: Math.max(1, a.qty + delta) } : a,
      ),
    });
  }

  function setAddonSize(addonKey: string, size: string) {
    onChange({
      ...draft,
      addons: draft.addons.map((a) =>
        a.key === addonKey
          ? { ...a, attrs: { ...(a.attrs ?? {}), size: size || undefined } }
          : a,
      ),
    });
  }

  function setFloor(next: number) {
    setDelivery({ floor: Math.max(1, next) });
  }

  function bumpStairItems(delta: number, maxItems: number) {
    // null means "auto = totalItems". First touch from + decrements from
    // totalItems, from − goes one below totalItems. Clamped [0, totalItems].
    const current = draft.delivery.stairItems ?? maxItems;
    const next = Math.max(0, Math.min(maxItems, current + delta));
    setDelivery({ stairItems: next });
  }

  // Live totals — same formula as Step 3 + order detail.
  const lineSub = draft.lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const addonSub = draft.addons.reduce((s, a) => s + a.unitPrice * a.qty, 0);
  const itemsTotal = draft.lines.reduce((s, l) => s + l.qty, 0);
  // stairItems = null sentinel → "auto = all items". Effective count is
  // clamped to itemsTotal so removing lines after lowering stairItems can't
  // produce stairItems > itemsTotal.
  const stairItemsEffective =
    draft.delivery.stairItems == null
      ? itemsTotal
      : Math.max(0, Math.min(itemsTotal, draft.delivery.stairItems));
  const stair = floorSurchargeRaw(
    draft.delivery.floor,
    draft.delivery.hasLift,
    stairItemsEffective,
    cfg,
  );
  const total = lineSub + addonSub + stair;
  const empty = draft.lines.length === 0 && draft.addons.length === 0 && stair === 0;

  return (
    <div className="flex flex-col gap-7">
      {/* ---------- Add products ---------- */}
      <Section title="Add products" hint="Pick category, model, then configure">
        <ProductPicker
          catalog={catalog}
          onAddLine={addLine}
          draftLines={draft.lines}
        />
      </Section>

      {/* ---------- Add-ons (3-col cards) ---------- */}
      <Section title="Add-ons" hint="Optional services — set quantity per item">
        {catalog.addons.length === 0 ? (
          <p className="text-xs text-base-500">No addons configured.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {catalog.addons.map((a) => {
              const selected = draft.addons.find((d) => d.key === a.key);
              if (!selected) {
                return (
                  <button
                    key={a.key}
                    type="button"
                    onClick={() => toggleAddon(a.key)}
                    className="text-left rounded px-3.5 py-3 transition-colors border-[1.5px] border-base-200 bg-white hover:border-primary/40"
                  >
                    <div className="text-sm font-medium">+ {a.name}</div>
                    <div className="font-mono text-[11px] text-base-500 mt-1">
                      {RM(a.price)}
                    </div>
                  </button>
                );
              }
              return (
                <div
                  key={a.key}
                  className="rounded px-3.5 py-3 border-[1.5px] border-primary bg-signature-50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">+ {a.name}</div>
                      <div className="font-mono text-[11px] text-base-500 mt-1">
                        {RM(selected.unitPrice)} ea
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleAddon(a.key)}
                      className="text-base-500 hover:text-destructive text-sm leading-none px-1 -mt-0.5"
                      aria-label={`Remove ${a.name}`}
                    >
                      ×
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-2">
                    <div className="flex items-center gap-1.5 bg-white border border-base-300 rounded px-1.5 py-0.5">
                      <button
                        type="button"
                        onClick={() => bumpAddonQty(a.key, -1)}
                        className="px-2 py-0.5 text-sm rounded hover:bg-base-100"
                        aria-label={`Decrease ${a.name} quantity`}
                      >
                        −
                      </button>
                      <span className="font-mono text-[12px] w-5 text-center tabular-nums">
                        {selected.qty}
                      </span>
                      <button
                        type="button"
                        onClick={() => bumpAddonQty(a.key, 1)}
                        className="px-2 py-0.5 text-sm rounded hover:bg-base-100"
                        aria-label={`Increase ${a.name} quantity`}
                      >
                        +
                      </button>
                    </div>
                    <span className="font-mono text-[12px] font-semibold text-primary">
                      {RM(selected.unitPrice * selected.qty)}
                    </span>
                  </div>
                  {/* 2026-05-19 — disposal size picker. Required to advance
                      Step 2 (see draft.ts step2Valid). Border turns red when
                      unset so the missing pick stands out at a glance. */}
                  {isDisposalAddon(a.key) && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-base-500">
                        Size
                      </span>
                      <select
                        value={selected.attrs?.size ?? ""}
                        onChange={(e) => setAddonSize(a.key, e.target.value)}
                        aria-label={`${a.name} size`}
                        className={`flex-1 h-7 px-2 border rounded text-[11.5px] bg-white outline-none focus:border-primary ${
                          selected.attrs?.size
                            ? "border-base-300"
                            : "border-destructive/60"
                        }`}
                      >
                        <option value="">Select size…</option>
                        {(DISPOSAL_SIZE_OPTIONS[a.key] ?? []).map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* ---------- Stair carry (3-col grid: floor / lift / fee panel) ---------- */}
      <Section
        title="Stair carry"
        hint={`1F–${cfg.freeUpToFloor}F free · ${RM(cfg.perFloorPerItem)} per floor per item from ${cfg.freeUpToFloor + 1}F`}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 items-end">
          <FieldLabel label="Floor">
            <div className="flex items-center gap-1.5 border border-base-300 bg-white rounded px-1.5 py-1">
              <button
                type="button"
                onClick={() => setFloor(draft.delivery.floor - 1)}
                className="px-2.5 py-1.5 rounded text-sm hover:bg-base-100"
                aria-label="Decrease floor"
              >
                −
              </button>
              <input
                type="text"
                inputMode="numeric"
                value={draft.delivery.floor}
                onChange={(e) => setFloor(parseInt(e.target.value, 10) || 1)}
                className="flex-1 min-w-0 text-center text-sm font-mono bg-transparent outline-none border-none py-1"
              />
              <button
                type="button"
                onClick={() => setFloor(draft.delivery.floor + 1)}
                className="px-2.5 py-1.5 rounded text-sm hover:bg-base-100"
                aria-label="Increase floor"
              >
                +
              </button>
            </div>
          </FieldLabel>

          <FieldLabel
            label={`Items needing stair carry (max ${itemsTotal})`}
          >
            <div className="flex items-center gap-1.5 border border-base-300 bg-white rounded px-1.5 py-1">
              <button
                type="button"
                onClick={() => bumpStairItems(-1, itemsTotal)}
                disabled={itemsTotal === 0 || stairItemsEffective === 0}
                className="px-2.5 py-1.5 rounded text-sm hover:bg-base-100 disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Decrease stair-carry item count"
              >
                −
              </button>
              <input
                type="text"
                inputMode="numeric"
                value={stairItemsEffective}
                onChange={(e) => {
                  const parsed = parseInt(e.target.value, 10);
                  const safe = Number.isFinite(parsed)
                    ? Math.max(0, Math.min(itemsTotal, parsed))
                    : 0;
                  setDelivery({ stairItems: safe });
                }}
                disabled={itemsTotal === 0}
                className="flex-1 min-w-0 text-center text-sm font-mono bg-transparent outline-none border-none py-1 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => bumpStairItems(1, itemsTotal)}
                disabled={itemsTotal === 0 || stairItemsEffective >= itemsTotal}
                className="px-2.5 py-1.5 rounded text-sm hover:bg-base-100 disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Increase stair-carry item count"
              >
                +
              </button>
            </div>
          </FieldLabel>

          <FieldLabel label="Lift available?">
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setDelivery({ hasLift: false })}
                className={pillClass(!draft.delivery.hasLift)}
              >
                No lift
              </button>
              <button
                type="button"
                onClick={() => setDelivery({ hasLift: true })}
                className={pillClass(draft.delivery.hasLift)}
              >
                Has lift
              </button>
            </div>
          </FieldLabel>

          <div
            className={`rounded px-3.5 py-3 text-right border ${
              stair > 0
                ? "border-primary bg-signature-50"
                : "border-base-200 bg-base-50"
            }`}
          >
            <div
              className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${
                stair > 0 ? "text-primary" : "text-base-500"
              }`}
            >
              Stair carry fee
            </div>
            <div
              className={`font-mono text-lg font-bold mt-0.5 ${
                stair > 0 ? "text-primary" : "text-base-700"
              }`}
            >
              {RM(stair)}
            </div>
          </div>
        </div>
        {stair > 0 && (
          <p className="text-[11px] text-base-500 mt-2.5">
            {stairItemsEffective} of {itemsTotal} item{itemsTotal === 1 ? "" : "s"} ×{" "}
            {draft.delivery.floor - cfg.freeUpToFloor} floor
            {draft.delivery.floor - cfg.freeUpToFloor === 1 ? "" : "s"} above {cfg.freeUpToFloor}F
            × {RM(cfg.perFloorPerItem)} ={" "}
            <span className="font-mono font-semibold text-base-900">{RM(stair)}</span>
          </p>
        )}
      </Section>

      {/* ---------- Order summary (full-width section at bottom) ---------- */}
      <div className="rounded border border-base-200 bg-white overflow-hidden">
        <div className="px-4 py-2.5 border-b border-base-200 bg-base-50 flex items-center justify-between">
          <span className="label">Order summary</span>
          <span className="font-mono text-[11px] text-base-500">
            {itemsTotal} item{itemsTotal === 1 ? "" : "s"}
          </span>
        </div>

        {empty ? (
          <p className="px-4 py-5 text-xs text-base-500 text-center">
            No items yet — pick a product above to get started.
          </p>
        ) : (
          <div>
            {draft.lines.map((l, i) => (
              <div
                key={l.localId}
                className={`flex items-start justify-between gap-3 px-4 py-2.5 ${i ? "border-t border-base-100" : ""}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] truncate">
                    {l.label} <span className="text-base-500">×{l.qty}</span>
                  </div>
                  <div className="font-mono text-[10px] text-base-500 mt-0.5">
                    {RM(l.unitPrice)} ea · {l.sku}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <button
                      type="button"
                      onClick={() => bumpLineQty(l.localId, -1)}
                      className="px-1.5 py-0.5 text-[11px] border border-base-200 rounded hover:border-primary/40"
                      aria-label="Decrease quantity"
                    >
                      −
                    </button>
                    <span className="font-mono text-[11px] w-6 text-center">{l.qty}</span>
                    <button
                      type="button"
                      onClick={() => bumpLineQty(l.localId, 1)}
                      className="px-1.5 py-0.5 text-[11px] border border-base-200 rounded hover:border-primary/40"
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      onClick={() => removeLine(l.localId)}
                      className="ml-2 text-[10px] text-base-500 hover:text-destructive"
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <span className="font-mono text-[13px] font-semibold whitespace-nowrap">
                  {RM(l.unitPrice * l.qty)}
                </span>
              </div>
            ))}
            {draft.addons.map((a) => (
              <div
                key={a.key}
                className="flex items-start justify-between gap-3 px-4 py-2.5 border-t border-base-100 text-base-600"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[13px]">
                    + {a.name}
                    {a.attrs?.size && (
                      <span className="text-base-700"> · {a.attrs.size}</span>
                    )}
                    {a.qty > 1 && <span className="text-base-500"> ×{a.qty}</span>}
                  </div>
                  <div className="font-mono text-[10px] text-base-500 mt-0.5">
                    {RM(a.unitPrice)} ea · service add-on
                  </div>
                </div>
                <span className="font-mono text-[13px] font-semibold whitespace-nowrap">
                  {RM(a.unitPrice * a.qty)}
                </span>
              </div>
            ))}
            {stair > 0 && (
              <div className="flex items-start justify-between gap-3 px-4 py-2.5 border-t border-base-100 text-base-600">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px]">+ Stair carry</div>
                  <div className="font-mono text-[10px] text-base-500 mt-0.5">
                    {itemsTotal} item{itemsTotal === 1 ? "" : "s"} · floor {draft.delivery.floor}
                    {draft.delivery.hasLift ? " (with lift)" : " (no lift)"}
                  </div>
                </div>
                <span className="font-mono text-[13px] font-semibold whitespace-nowrap">
                  {RM(stair)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Subtotal block */}
        <div className="px-4 py-3 border-t border-base-200 bg-base-50 text-[12px]">
          <Row label="Items subtotal" value={RM(lineSub)} />
          {addonSub > 0 && <Row label="Add-ons" value={RM(addonSub)} />}
          {stair > 0 && <Row label="Stair carry" value={RM(stair)} />}
          <div className="flex justify-between mt-2 pt-2 border-t border-base-200">
            <span className="text-sm font-semibold">Total</span>
            <span className="font-mono text-base font-bold">{RM(total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="font-display text-base font-semibold tracking-[-0.01em]">{title}</h3>
        {hint && <p className="text-[11px] text-base-500">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label block mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-base-600">
      <span>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

function pillClass(active: boolean) {
  return [
    "px-3 py-2.5 rounded border-[1.5px] text-sm font-semibold transition-colors",
    active
      ? "border-primary bg-signature-50 text-primary"
      : "border-base-300 bg-white text-base-700 hover:border-primary/40",
  ].join(" ");
}
