/**
 * Tabs — the module tab bar (UI-KIT §6 · §8.2 · §8.3, card D0.5b).
 *
 * **It is a STAGE picker, and §8.2 already ruled what that means** (added
 * 2026-07-28 by Purchasing P2): exactly one is on, always; clicking the one that
 * is on does NOTHING, because there is no "nothing selected" view to clear to;
 * and it carries no ✕ chip. Radix Tabs gives that shape for free — a trigger
 * only fires `onValueChange` when the value actually changes — so the rule is
 * satisfied by the primitive rather than by every page remembering it. A test
 * pins it, because "it happens not to fire" is a fact that can regress.
 *
 * **It renders the BAR and no panels.** Every tabbed page in the portal is
 * deep-linked (`?tab=…`) and the panels belong to the router; a component that
 * owned them would fight the URL and break every link Jess has bookmarked.
 *
 * **A count is a `Badge`, never a coloured pill.** §3.4: a status is a pill, so
 * anything else wearing a tone is a status in disguise. A tab count is a count.
 *
 * §8.3 is the other half and it is NOT here: a module-tabbed page drops its
 * breadcrumb and big title because the active tab already says where you are.
 * That is `PageShell`'s `variant`, card D0.5c.
 */
import * as RadixTabs from "@radix-ui/react-tabs";
import Badge from "./Badge";
import Icon, { type IconName } from "./Icon";

export interface TabDef {
  value: string;
  /** The word. Owned by COPY-STANDARD, never by this file. */
  label: string;
  /** Omit entirely when there is nothing to count — a `0` badge on every tab
   *  is five numbers saying nothing, and §1.3 is a budget. */
  count?: number;
  disabled?: boolean;
  icon?: IconName;
}

/**
 * The segmented control's drawing, for the few tab bars that are plain buttons
 * with `role="tab"` rather than this component. One drawing, written once:
 * a page takes these and adds nothing of its own.
 */
export const SEGMENTED_TRACK = "inline-flex items-center gap-0 rounded-[10px] bg-c-track p-[3px]";
export const SEGMENT = "whitespace-nowrap rounded-lg px-3 py-[5px] text-body";
export const SEGMENT_ON = "bg-c-select-pill font-medium text-c-select-fg [box-shadow:var(--shadow-lift)]";
export const SEGMENT_OFF = "font-normal text-c-tab hover:bg-c-track-hover";

export default function Tabs({
  tabs,
  value,
  onValueChange,
  label,
  fill = false,
  orientation = "horizontal",
  variant = "underline",
}: {
  tabs: readonly TabDef[];
  value: string;
  onValueChange: (value: string) => void;
  /** What the bar switches between, for a screen reader. Never drawn. */
  label: string;
  /** The tabs share the bar's width by their own length, with no gap — a narrow pane that
   *  must keep every tab on one row (Work's Communication, Workspace §5.10). */
  fill?: boolean;
  orientation?: "horizontal" | "vertical";
  variant?: "underline" | "segmented";
}) {
  /* THE SEGMENTED CONTROL (01 §3, owner 11 Oct 2026: tabs are the shell's one
   * shared control). List tabs, view switches and Settings tabs are all this
   * one drawing: track `--c-track`, radius 10, pad 3 · segment pad 5 × 12 at
   * 13 · selected the theme's pill with its text at 500 and the soft lift ·
   * others 400 in the quiet grey. No underline and no indicator bar.
   * `variant` is kept so callers need no edit; both values draw the same.
   * Keyboard focus is the shell's one outline (`--c-focus`, offset −2). */
  void variant;
  return (
    <RadixTabs.Root orientation={orientation} value={value} onValueChange={onValueChange}>
      <RadixTabs.List
        aria-label={label}
        data-kit="tabs"
        data-variant={variant}
        className={
          `${fill ? "flex" : "inline-flex"} items-center rounded-[10px] bg-c-track p-[3px] ` +
          "gap-0 data-[orientation=vertical]:flex-col data-[orientation=vertical]:items-stretch"
        }
      >
        {tabs.map((t) => (
          <RadixTabs.Trigger
            key={t.value}
            value={t.value}
            disabled={t.disabled}
            data-kit="tab"
            className={
              `relative flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-[5px] text-body ${fill ? "flex-auto justify-center" : ""} ` +
              "data-[orientation=vertical]:justify-start " +
              "data-[state=inactive]:font-normal data-[state=inactive]:text-c-tab data-[state=inactive]:hover:bg-c-track-hover " +
              "data-[state=active]:bg-c-select-pill data-[state=active]:font-medium data-[state=active]:text-c-select-fg data-[state=active]:[box-shadow:var(--shadow-lift)] " +
              "disabled:opacity-40 disabled:cursor-not-allowed"
            }
          >
            {t.icon && <Icon name={t.icon} />}
            {t.label}
            {t.count !== undefined && <Badge>{t.count}</Badge>}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
    </RadixTabs.Root>
  );
}
