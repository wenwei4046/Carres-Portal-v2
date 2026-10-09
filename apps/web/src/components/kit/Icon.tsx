/**
 * Icon — UI-KIT §5, card D0.5a; drawn in v4 since 9 Oct 2026.
 *
 * ONE MEANING, ONE GLYPH, and it is the TYPE that enforces it: `name` is a
 * union built from §5.3's map, so `<Icon name="edit3" />` does not compile and
 * the drift §5.2 measured (Pencil ×8 vs Edit3 ×3, AlertTriangle ×10 vs
 * TriangleAlert ×7, Filter ×2 vs SlidersHorizontal ×2) cannot happen again.
 *
 * THE GLYPH is Material Symbols Rounded, outlined, weight 300, drawn by the one
 * `MIcon` component (01 §3: "Never load a separate icon system per page"). The
 * meaning IDs, the props and the accessible names did not move; only the
 * drawing did. The font is loaded once in `index.css`.
 *
 * SIZE is a union of the three the law allows — 14 (in a row, in a pill) ·
 * 16 (buttons, toolbars, ⋮ — the default) · 18 (page-level actions, empty
 * states). They draw the v4 glyph sizes 16 · 18 · 20. A fourth size does not
 * compile either.
 *
 * COLOUR is deliberately absent: §5.1 says an icon inherits its text colour,
 * so this component never sets one. The parent decides, and a coloured icon
 * only ever happens inside a status pill.
 */
import MIcon from "@/components/carres/MIcon";
import { type IconSize } from "./tokens";

/**
 * UI-KIT §5.3, verbatim and complete. The keys are the MEANINGS; a meaning
 * whose name contains a space in the law is kebab-cased here (`on hold` →
 * `on-hold`) because a key with a space is not usable in JSX.
 */
const GLYPH = {
  // ACTIONS
  add: "add",
  edit: "edit",
  delete: "delete",
  confirm: "check",
  search: "search",
  jump: "keyboard_command_key",
  filter: "tune",
  refresh: "refresh",
  copy: "content_copy",
  download: "download",
  print: "print",
  open: "open_in_new",
  close: "close",
  overflow: "more_vert",
  flag: "flag",
  message: "chat_bubble",
  mail: "mail",
  call: "call",
  attach: "attach_file",
  settings: "settings",
  panelToggle: "left_panel_open",
  help: "help",
  lock: "lock",
  history: "history",
  // NAVIGATION
  back: "arrow_back",
  /** The previous period of a calendar control — its week or month. */
  previous: "chevron_left",
  forward: "chevron_right",
  expand: "expand_more",
  /** A column's Excel filter caret (Jess, 2026-08-01: GitHub/Excel's quiet
   *  ▼, never a sliders glyph). Shares the expand caret the way ready/confirm
   *  share the tick — one meaning still has one glyph. */
  columnFilter: "expand_more",
  collapse: "expand_less",
  // STATUS (inside a pill only)
  ready: "check",
  waiting: "schedule",
  late: "error",
  "on-hold": "pause_circle",
  // BUSINESS ENTITIES
  goods: "inventory_2",
  delivery: "local_shipping",
  money: "account_balance_wallet",
  supplier: "factory",
  customer: "person",
  people: "group",
  warehouse: "warehouse",
  order: "assignment",
  date: "calendar_month",
  /** Work that has no lawful working date (Work left rail, 2026-09-24). */
  noDate: "event_busy",
  /** The ERP modules as one group — the Work rail's `Module` heading. */
  modules: "grid_view",
  /** Register presentation choices — owner-approved icon plus visible word. */
  table: "table_chart",
  cards: "grid_view",
  note: "lightbulb",
  activity: "receipt_long",
  // The three made-to-order categories (Loo, 2026-07-31 — the To Order rail's
  // category level). One meaning, one glyph.
  mattress: "bed",
  bedframe: "single_bed",
  sofa: "weekend",
  pillow: "crop_landscape",
  protector: "layers",
} as const;

/** The panel-toggle meaning's second state: the panel is open. */
const PANEL_OPEN_GLYPH = "left_panel_close";

/** The three law sizes, drawn at the v4 glyph sizes (01 §3: 16 to 21). */
const GLYPH_SIZE: Record<IconSize, 16 | 18 | 20> = { 14: 16, 16: 18, 18: 20 };

/** Every meaning the portal has. Not a Lucide name — a business meaning. */
export type IconName = keyof typeof GLYPH;

/** Read by `/ui` and by the guard test, so the showcase cannot go stale. */
export const ICON_NAMES = Object.keys(GLYPH) as IconName[];

export default function Icon({
  name,
  size = 16,
  title,
  panelOpen = false,
}: {
  name: IconName;
  /** The two states of the same panel-toggle meaning. */
  panelOpen?: boolean;
  /** 14 in a row / in a pill · 16 default · 18 page-level. */
  size?: IconSize;
  /** Give an icon a title ONLY when it carries meaning no nearby word does. */
  title?: string;
}) {
  const glyph = name === "panelToggle" && panelOpen ? PANEL_OPEN_GLYPH : GLYPH[name];
  return (
    <span
      data-icon={name}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      role={title ? "img" : undefined}
      className="inline-flex shrink-0 items-center justify-center"
    >
      <MIcon name={glyph} size={GLYPH_SIZE[size]} />
    </span>
  );
}
