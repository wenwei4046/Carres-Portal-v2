/**
 * The Z-INDEX LADDER — UI-KIT §4.4, card D0.5b.
 *
 * Fifteen levels are in use across the portal today (`1 · 10 · 20 · 30 · 40 ·
 * 50 · 55 · 60 · 70 · 90 · 100 · 110 · 120`). Five survive, and §4.4's rule is
 * that they are **reachable only through components** — so this module is the
 * ONE file in `components/kit/**` allowed to write a `z-` class, and
 * `kit-source.test.ts` asserts exactly that. A component that wants a new layer
 * has to come here first, which is the friction §0.3 asks for.
 *
 * Two of the five have no class string yet, on purpose: `DataTable` and
 * `PageShell` are D0.5c, and an exported constant nobody imports is the same
 * disease as a column nobody writes. The ladder still LISTS them, because the
 * record is what makes the set closed — D0.5c reads its layer from here rather
 * than picking a number.
 *
 * Toast (50) is sonner's own: it renders its host, it sets its own stacking,
 * and the kit never emits that class. Listed for completeness, owned elsewhere.
 */

export interface ZLayer {
  layer: string;
  z: number;
  owner: string;
  /** The card that gives this layer a component. */
  card: string;
}

/** §4.4, in the order the law states it. Five, and there is no sixth. */
export const Z_LADDER: readonly ZLayer[] = [
  { layer: "sticky table header", z: 10, owner: "DataTable", card: "D0.5c" },
  { layer: "toolbar / bulk bar", z: 20, owner: "PageShell", card: "D0.5c" },
  { layer: "popover · dropdown · tooltip", z: 30, owner: "Radix portal", card: "D0.5b" },
  { layer: "modal · drawer", z: 40, owner: "Radix portal", card: "D0.5b" },
  { layer: "toast", z: 50, owner: "sonner", card: "shipped" },
] as const;

/**
 * Layer 1 — the sticky table head, owned by `DataTable` (D0.5c). It rises over
 * the rows scrolling under it and over nothing else, which is why it is the
 * bottom of the ladder rather than a number picked to win an argument.
 */
export const Z_TABLE_HEAD = "z-10";

/** Layer 3 — everything that floats beside the thing that opened it. */
export const Z_FLOATING = "z-30";

/** Layer 4 — everything that takes the screen. */
export const Z_DIALOG = "z-40";
