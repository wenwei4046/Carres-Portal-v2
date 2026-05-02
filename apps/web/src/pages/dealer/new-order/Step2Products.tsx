import type { CatalogResponse, FloorConfigDto } from "@carres/shared";
import type { DraftAddon, DraftLine, WizardDraft } from "./draft";
import ProductPicker from "./ProductPicker";

interface Props {
  draft: WizardDraft;
  onChange: (next: WizardDraft) => void;
  catalog: CatalogResponse;
}

/**
 * Step 2: products + addons + floor surcharge + running summary.
 *
 * Wires up ProductPicker (which handles category browse + 3 configurators),
 * an addon checklist, a floor/lift control, and a live line list with remove.
 *
 * Floor surcharge is computed inline here — pulls floor_config from catalog
 * (D5 ensures catalog refetch on Step 2 mount), uses the same formula as
 * `apps/web/src/lib/order-totals.ts` floorSurcharge() so the displayed total
 * matches what the order detail page will show post-submit.
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
    onChange({ ...draft, addons: [...draft.addons, next] });
  }

  // Live totals
  const lineSub = draft.lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const addonSub = draft.addons.reduce((s, a) => s + a.unitPrice * a.qty, 0);
  const itemsTotal = draft.lines.reduce((s, l) => s + l.qty, 0);
  const stair = computeStair(draft.delivery.floor, draft.delivery.hasLift, itemsTotal, cfg);
  const total = lineSub + addonSub + stair;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-7">
      {/* Left column: picker + addons + floor */}
      <div className="flex flex-col gap-7 min-w-0">
        <Section title="Products" hint="Browse the catalog and add to this order">
          <ProductPicker catalog={catalog} onAddLine={addLine} />
        </Section>

        <Section title="Add-ons" hint="Optional services">
          <div className="grid grid-cols-2 gap-2.5">
            {catalog.addons.map((a) => {
              const on = draft.addons.some((d) => d.key === a.key);
              return (
                <label
                  key={a.key}
                  className={`flex items-center gap-2.5 rounded-md border px-3 py-2.5 cursor-pointer ${
                    on ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggleAddon(a.key)}
                    className="w-4 h-4"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{a.name}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">
                      RM {a.price.toLocaleString()}
                    </div>
                  </div>
                </label>
              );
            })}
            {catalog.addons.length === 0 && (
              <p className="col-span-full text-xs text-muted-foreground">No addons configured.</p>
            )}
          </div>
        </Section>

        <Section
          title="Stair carry"
          hint={`1F–${cfg.freeUpToFloor}F free · RM ${cfg.perFloorPerItem} per floor per item from ${cfg.freeUpToFloor + 1}F`}
        >
          <div className="grid grid-cols-[1fr_auto] gap-3.5 items-end">
            <FieldLabel label="Delivery floor">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setDelivery({ floor: Math.max(1, draft.delivery.floor - 1) })}
                  className="px-2.5 py-2 rounded-md border border-border text-sm hover:border-primary/40"
                  aria-label="Decrease floor"
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  value={draft.delivery.floor}
                  onChange={(e) =>
                    setDelivery({ floor: Math.max(1, parseInt(e.target.value, 10) || 1) })
                  }
                  className="w-20 text-center px-2.5 py-2 text-sm font-mono rounded-md border border-border bg-card outline-none focus:border-primary"
                />
                <button
                  onClick={() => setDelivery({ floor: draft.delivery.floor + 1 })}
                  className="px-2.5 py-2 rounded-md border border-border text-sm hover:border-primary/40"
                  aria-label="Increase floor"
                >
                  +
                </button>
              </div>
            </FieldLabel>
            <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground font-body pb-2">
              <input
                type="checkbox"
                checked={draft.delivery.hasLift}
                onChange={(e) => setDelivery({ hasLift: e.target.checked })}
                className="w-3.5 h-3.5"
              />
              Has lift (no surcharge)
            </label>
          </div>
          {stair > 0 && (
            <p className="text-[11px] text-muted-foreground mt-2">
              {itemsTotal} item{itemsTotal === 1 ? "" : "s"} ×{" "}
              {draft.delivery.floor - cfg.freeUpToFloor} floor
              {draft.delivery.floor - cfg.freeUpToFloor === 1 ? "" : "s"} above {cfg.freeUpToFloor}F
              × RM {cfg.perFloorPerItem} ={" "}
              <span className="font-mono font-semibold text-foreground">
                RM {stair.toLocaleString()}
              </span>
            </p>
          )}
        </Section>
      </div>

      {/* Right column: running line list + totals */}
      <aside className="md:sticky md:top-0 md:self-start">
        <div className="rounded-md border border-border bg-card overflow-hidden">
          <div className="px-3.5 py-2.5 border-b border-border bg-secondary/30">
            <h3 className="text-xs uppercase tracking-[0.16em] text-muted-foreground font-semibold">
              Order summary
            </h3>
          </div>
          <div className="px-3.5 py-3 max-h-[360px] overflow-auto">
            {draft.lines.length === 0 && draft.addons.length === 0 && (
              <p className="text-xs text-muted-foreground py-3 text-center">No items yet.</p>
            )}
            {draft.lines.map((l) => (
              <div
                key={l.localId}
                className="flex items-start gap-2 py-2 border-b border-border last:border-0"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold truncate">{l.label}</div>
                  <div className="font-mono text-[10px] text-muted-foreground mt-0.5">
                    {l.sku}
                  </div>
                  <div className="flex items-center gap-1 mt-1.5">
                    <button
                      onClick={() => bumpLineQty(l.localId, -1)}
                      className="px-1.5 py-0.5 text-[11px] border border-border rounded hover:border-primary/40"
                      aria-label="Decrease quantity"
                    >
                      −
                    </button>
                    <span className="font-mono text-[11px] w-6 text-center">{l.qty}</span>
                    <button
                      onClick={() => bumpLineQty(l.localId, 1)}
                      className="px-1.5 py-0.5 text-[11px] border border-border rounded hover:border-primary/40"
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono text-xs font-semibold">
                    RM {(l.unitPrice * l.qty).toLocaleString()}
                  </div>
                  <button
                    onClick={() => removeLine(l.localId)}
                    className="text-[10px] text-muted-foreground hover:text-destructive mt-0.5"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            {draft.addons.map((a) => (
              <div
                key={a.key}
                className="flex items-center justify-between gap-2 py-2 border-b border-border last:border-0 text-muted-foreground"
              >
                <div className="text-xs">+ {a.name}</div>
                <div className="font-mono text-xs">RM {(a.unitPrice * a.qty).toLocaleString()}</div>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="px-3.5 py-3 border-t border-border bg-secondary/30 text-xs">
            <Row label="Subtotal" value={`RM ${lineSub.toLocaleString()}`} />
            {addonSub > 0 && <Row label="Add-ons" value={`RM ${addonSub.toLocaleString()}`} />}
            {stair > 0 && <Row label="Stair carry" value={`RM ${stair.toLocaleString()}`} />}
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
              <span className="text-sm font-semibold">Total</span>
              <span className="font-mono text-sm font-bold">RM {total.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function computeStair(
  floor: number,
  hasLift: boolean,
  totalQty: number,
  cfg: FloorConfigDto,
): number {
  if (hasLift) return 0;
  if (floor <= cfg.freeUpToFloor) return 0;
  return (floor - cfg.freeUpToFloor) * cfg.perFloorPerItem * totalQty;
}

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
        <h3 className="font-display text-base font-semibold tracking-tight">{title}</h3>
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
