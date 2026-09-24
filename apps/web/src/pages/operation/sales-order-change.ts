/**
 * The whole-page Sales Order draft's pure helpers (0562) — no React.
 *
 * ONE ladder for goods words (the Register footer's `goodsCategoryWordOf`,
 * Law D), services named with their billing quantity, and the Before/After
 * rows the review and the waiting request both print.
 */
import { GOODS_CATEGORY_WORDS, fmtMoney, goodsCategoryWordOf } from "@carres/shared";
import { addonSizeOptions, disposalUnitSizes, composeDisposalSizeSummary, type DraftAddon as PosAddon } from "../dealer/new-order/draft";

/** Adapt the office draft to the POS's existing per-unit size contract. */
export function serviceSizeDraft(a: EditAddon, sizeOptions?: string[] | null): PosAddon {
  return { key: a.addon_key, name: a.addon_key, qty: a.qty, unitPrice: a.unit_price,
    sizeOptions: sizeOptions ?? undefined,
    attrs: { size: typeof a.attrs?.size === "string" ? a.attrs.size : undefined,
      sizes: Array.isArray(a.attrs?.sizes) ? a.attrs.sizes.map((s) => typeof s === "string" ? s : "") : undefined } };
}

export function resizeService(a: EditAddon, qty: number, sizeOptions?: string[] | null): Partial<EditAddon> {
  const nextQty = Math.max(1, Math.floor(Number.isFinite(qty) ? qty : 1));
  const pos = serviceSizeDraft(a, sizeOptions);
  if (!addonSizeOptions(pos).length) return { qty: nextQty };
  const sizes = disposalUnitSizes({ ...pos, qty: nextQty });
  return { qty: nextQty, attrs: { ...a.attrs, sizes, size: composeDisposalSizeSummary(sizes) } };
}

export function sizeServiceUnit(a: EditAddon, index: number, size: string): Partial<EditAddon> {
  const sizes = disposalUnitSizes(serviceSizeDraft(a));
  if (index < 0 || index >= sizes.length) return {};
  sizes[index] = size;
  return { attrs: { ...a.attrs, sizes, size: composeDisposalSizeSummary(sizes) } };
}

export interface EditLine {
  key: string;
  id?: string;
  sku: string;
  qty: number;
  unit_price: number;
  attrs?: Record<string, unknown> | null;
  /** Struck through; leaves the order only when the change takes effect. */
  removed?: boolean;
  /** Added in this draft (not yet on the order). */
  added?: boolean;
}
export interface EditAddon {
  key: string;
  id?: string;
  addon_key: string;
  qty: number;
  unit_price: number;
  attrs?: Record<string, unknown> | null;
  removed?: boolean;
  added?: boolean;
}

/** The COPY-STANDARD word for a line whose SKU has no catalogue row. */
export const NOT_IN_CATALOG = "Not in catalog";

const live = <T extends { removed?: boolean }>(rows: T[]) => rows.filter((r) => !r.removed);

/** `Qty: Bedframe 2 · Pillow 2` — goods only, the Register's ladder and order. */
export function qtyWords(
  lines: Array<Pick<EditLine, "sku" | "qty" | "attrs" | "removed">>,
  categoryOf: (sku: string) => string | null,
): string {
  const counts = new Map<string, number>();
  for (const l of live(lines)) {
    const w = goodsCategoryWordOf({ sku: l.sku, attrs: l.attrs ?? null, category: categoryOf(l.sku) });
    const word = w === "Other goods" ? NOT_IN_CATALOG : w;
    if (word === "Service") continue;
    counts.set(word, (counts.get(word) ?? 0) + Number(l.qty));
  }
  const rank = (k: string) => {
    const i = (GOODS_CATEGORY_WORDS as readonly string[]).indexOf(k);
    return i < 0 ? 99 : i;
  };
  const parts = [...counts].sort((a, b) => rank(a[0]) - rank(b[0])).map(([k, n]) => `${k} ${n}`);
  return parts.length ? parts.join(" · ") : "No goods";
}

/**
 * A disposal service — the old mattress, sofa or bed frame the lorry takes
 * away — known by the catalogue's own Service SKU family `SVC-DISPOSE-…`
 * (0172; production 2026-09-24: mattress · sofa · big sofa · bed frame). Not a
 * name match. Falsifier: the catalogue gains a service category — read that.
 */
export const isDisposalService = (catalogServiceSku: string | null | undefined): boolean =>
  typeof catalogServiceSku === "string" && catalogServiceSku.startsWith("SVC-DISPOSE-");

/** `Dispose old mattress ×2 · Delivery fee` — name, and quantity when above 1. */
export function servicesWords(
  addons: Array<Pick<EditAddon, "addon_key" | "qty" | "removed" | "attrs">>,
  nameOf: (key: string) => string,
): string {
  const parts = live(addons).map((a) => {
    const config = configWords(a.attrs);
    return `${nameOf(a.addon_key)}${config ? ` · ${config}` : ""}${a.qty > 1 ? ` ×${a.qty}` : ""}`;
  });
  return parts.length ? parts.join(" · ") : "None";
}

export const totalOf = (lines: EditLine[], addons: EditAddon[]) =>
  live(lines).reduce((n, l) => n + l.qty * l.unit_price, 0) + live(addons).reduce((n, a) => n + a.qty * a.unit_price, 0);

/** A line's configuration as the page prints it under the description. */
export function configWords(attrs: Record<string, unknown> | null | undefined): string {
  if (!attrs) return "";
  const out: string[] = [];
  const size = attrs["size"];
  if (typeof size === "string" && size) out.push(size);
  const opts = attrs["options"];
  if (Array.isArray(opts)) for (const o of opts) {
    const r = o as { kind?: string; label?: string; value?: string };
    if (r.label || r.value) out.push(r.kind === "fabric" ? `Fabric ${r.label ?? r.value}` : String(r.label ?? r.value));
  }
  const specials = attrs["specials"];
  if (Array.isArray(specials)) for (const sp of specials) {
    const r = sp as { soDescription?: string; label?: string };
    if (r.soDescription || r.label) out.push(String(r.soDescription ?? r.label));
  }
  const gap = attrs["gap"];
  if (typeof gap === "string" && gap) out.push(`Mattress gap: ${gap === "KIV" ? "Confirm later" : gap}`);
  return out.join(" · ");
}

export interface DiffRow {
  what: string;
  before: string;
  after: string;
}

/** Before/After rows: changed header facts, each changed line and service, then Qty, Services, total. */
export function diffRows(args: {
  header: Array<{ label: string; before: string; after: string }>;
  before: { lines: EditLine[]; addons: EditAddon[] };
  after: { lines: EditLine[]; addons: EditAddon[] };
  nameOfSku: (sku: string) => string;
  nameOfAddon: (key: string) => string;
  categoryOf: (sku: string) => string | null;
}): DiffRow[] {
  const { before, after } = args;
  const rows: DiffRow[] = args.header.map((h) => ({ what: h.label, before: h.before || "—", after: h.after || "—" }));
  const beforeLine = new Map(before.lines.filter((l) => l.id).map((l) => [l.id!, l]));
  const describe = (l: EditLine) =>
    `${l.qty} × ${fmtMoney(l.unit_price)}${configWords(l.attrs) ? ` · ${configWords(l.attrs)}` : ""}`;
  for (const l of after.lines) {
    const was = l.id ? beforeLine.get(l.id) : undefined;
    const changed =
      l.added || l.removed || !was ||
      was.sku !== l.sku || was.qty !== l.qty || was.unit_price !== l.unit_price ||
      JSON.stringify(was.attrs ?? null) !== JSON.stringify(l.attrs ?? null);
    if (!changed) continue;
    rows.push({
      what: `${args.nameOfSku(l.sku)} (${l.sku})`,
      before: !was || l.added ? "—" : describe(was),
      after: l.removed ? "Cancelled" : describe(l),
    });
  }
  /* Services are paired by row id; a snapshot's services carry none, so they
     fall back to their key — otherwise an untouched service reads as new. */
  const beforeAddon = new Map(before.addons.filter((x) => x.id).map((x) => [x.id!, x]));
  const beforeAddonByKey = new Map<string, EditAddon[]>();
  for (const x of before.addons) beforeAddonByKey.set(x.addon_key, [...(beforeAddonByKey.get(x.addon_key) ?? []), x]);
  for (const a of after.addons) {
    const was = (a.id ? beforeAddon.get(a.id) : undefined) ?? (a.added ? undefined : beforeAddonByKey.get(a.addon_key)?.shift());
    const changed = a.added || a.removed || !was || was.qty !== a.qty || was.unit_price !== a.unit_price;
    if (!changed) continue;
    rows.push({
      what: args.nameOfAddon(a.addon_key),
      before: !was || a.added ? "—" : `${was.qty} × ${fmtMoney(was.unit_price)}`,
      after: a.removed ? "Cancelled" : `${a.qty} × ${fmtMoney(a.unit_price)}`,
    });
  }
  const qb = qtyWords(before.lines, args.categoryOf);
  const qa = qtyWords(after.lines, args.categoryOf);
  rows.push({ what: "Qty", before: qb, after: qa });
  const sb = servicesWords(before.addons, args.nameOfAddon);
  const sa = servicesWords(after.addons, args.nameOfAddon);
  if (sb !== sa) rows.push({ what: "Services", before: sb, after: sa });
  rows.push({
    what: "Total payable",
    before: fmtMoney(totalOf(before.lines, before.addons)),
    after: fmtMoney(totalOf(after.lines, after.addons)),
  });
  return rows;
}
