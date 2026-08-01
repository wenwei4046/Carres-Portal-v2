/**
 * Icon — UI-KIT §5, card D0.5a.
 *
 * ONE MEANING, ONE GLYPH, and it is the TYPE that enforces it: `name` is a
 * union built from §5.3's map, so `<Icon name="edit3" />` does not compile and
 * the drift §5.2 measured (Pencil ×8 vs Edit3 ×3, AlertTriangle ×10 vs
 * TriangleAlert ×7, Filter ×2 vs SlidersHorizontal ×2) cannot happen again.
 *
 * SIZE is a union of the three the law allows — 14 (in a row, in a pill) ·
 * 16 (buttons, toolbars, ⋮ — the default) · 18 (page-level actions, empty
 * states). A fourth size does not compile either.
 *
 * COLOUR is deliberately absent: §5.1 says an icon inherits its text colour,
 * so this component never sets one. The parent decides, and a coloured icon
 * only ever happens inside a status pill.
 *
 * STROKE is ✅ FROZEN (Q4, Jess 2026-07-28) at Lucide's own 2. **There is no
 * `strokeWidth` prop** — D0.5a carried one so `/ui` could render 2 and 1.5 side
 * by side, and the moment the answer arrived that prop became the only way to
 * draw a stroke the law does not have. Deleting it is the enforcement: a second
 * stroke width no longer compiles.
 */
import {
  AlertCircle,
  ArrowLeft,
  Bed,
  BedDouble,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleHelp,
  ClipboardList,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Factory,
  Flag,
  History,
  Lightbulb,
  Lock,
  MessageCircle,
  MoreVertical,
  Package,
  Paperclip,
  Pencil,
  Phone,
  Plus,
  Printer,
  PauseCircle,
  RefreshCw,
  ScrollText,
  Search,
  Settings,
  SlidersHorizontal,
  Sofa,
  Trash2,
  Truck,
  User,
  Users,
  Wallet,
  Warehouse,
  X,
} from "lucide-react";
import { ICON_STROKE, type IconSize } from "./tokens";

/**
 * UI-KIT §5.3, verbatim and complete. The keys are the MEANINGS; a meaning
 * whose name contains a space in the law is kebab-cased here (`on hold` →
 * `on-hold`) because a key with a space is not usable in JSX.
 */
const GLYPH = {
  // ACTIONS
  add: Plus,
  edit: Pencil,
  delete: Trash2,
  confirm: Check,
  search: Search,
  filter: SlidersHorizontal,
  refresh: RefreshCw,
  copy: Copy,
  download: Download,
  print: Printer,
  open: ExternalLink,
  close: X,
  overflow: MoreVertical,
  flag: Flag,
  message: MessageCircle,
  call: Phone,
  attach: Paperclip,
  settings: Settings,
  help: CircleHelp,
  lock: Lock,
  history: History,
  // NAVIGATION
  back: ArrowLeft,
  forward: ChevronRight,
  expand: ChevronDown,
  /** A column's Excel filter caret (Jess, 2026-08-01: GitHub/Excel's quiet
   *  ▼, never a sliders glyph). Shares ChevronDown the way ready/confirm
   *  share Check — one meaning still has one glyph. */
  columnFilter: ChevronDown,
  collapse: ChevronUp,
  // STATUS (inside a pill only)
  ready: Check,
  waiting: Clock,
  late: AlertCircle,
  "on-hold": PauseCircle,
  // BUSINESS ENTITIES
  goods: Package,
  delivery: Truck,
  money: Wallet,
  supplier: Factory,
  customer: User,
  people: Users,
  warehouse: Warehouse,
  order: ClipboardList,
  date: CalendarDays,
  note: Lightbulb,
  activity: ScrollText,
  // The three made-to-order categories (Loo, 2026-07-31 — the To Order rail's
  // category level). One meaning, one glyph; stroke stays the law's 2.
  mattress: BedDouble,
  bedframe: Bed,
  sofa: Sofa,
} as const;

/** Every meaning the portal has. Not a Lucide name — a business meaning. */
export type IconName = keyof typeof GLYPH;

/** Read by `/ui` and by the guard test, so the showcase cannot go stale. */
export const ICON_NAMES = Object.keys(GLYPH) as IconName[];

export default function Icon({
  name,
  size = 16,
  title,
}: {
  name: IconName;
  /** 14 in a row / in a pill · 16 default · 18 page-level. */
  size?: IconSize;
  /** Give an icon a title ONLY when it carries meaning no nearby word does. */
  title?: string;
}) {
  const Glyph = GLYPH[name];
  return (
    <Glyph
      size={size}
      strokeWidth={ICON_STROKE}
      data-icon={name}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      role={title ? "img" : undefined}
    />
  );
}
