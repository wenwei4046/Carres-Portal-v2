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
  /* v4 UI kit (01 §3 · UI-KIT "Tabs"). Two shapes, one grammar:
   *   tabs   · pad 5 × 12 · 13 · radius 8 · gap 2 · selected 600 in the theme
   *            select colours · others 500 transparent tab grey · hover grey.
   *   switch · a view switch inside a card: the ground-colour round track,
   *            pad 3, buttons pad 4 × 10 at 12.
   * No underline and no indicator bar: the selected wash IS the indicator.
   * Keyboard focus is the shell's one outline (`--c-focus`, offset −2). */
  const segmented = variant === "segmented";
  return (
    <RadixTabs.Root orientation={orientation} value={value} onValueChange={onValueChange}>
      <RadixTabs.List
        aria-label={label}
        data-kit="tabs"
        data-variant={variant}
        className={
          (segmented
            ? "inline-flex items-center rounded-full bg-c-ground p-[3px] "
            : "flex items-center ") +
          `${fill ? "gap-0" : "gap-0.5"} data-[orientation=vertical]:flex-col data-[orientation=vertical]:items-stretch`
        }
      >
        {tabs.map((t) => (
          <RadixTabs.Trigger
            key={t.value}
            value={t.value}
            disabled={t.disabled}
            data-kit="tab"
            className={
              `relative flex items-center gap-1.5 whitespace-nowrap rounded-lg font-medium ${fill ? "flex-auto justify-center" : ""} ` +
              (segmented ? "px-2.5 py-1 text-meta " : "px-3 py-[5px] text-body ") +
              "data-[orientation=vertical]:justify-start " +
              "data-[state=inactive]:text-c-tab data-[state=inactive]:hover:bg-c-hover " +
              "data-[state=active]:bg-c-select-bg data-[state=active]:font-semibold data-[state=active]:text-c-select-fg " +
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
