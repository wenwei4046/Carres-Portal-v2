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

export interface TabDef {
  value: string;
  /** The word. Owned by COPY-STANDARD, never by this file. */
  label: string;
  /** Omit entirely when there is nothing to count — a `0` badge on every tab
   *  is five numbers saying nothing, and §1.3 is a budget. */
  count?: number;
  disabled?: boolean;
}

export default function Tabs({
  tabs,
  value,
  onValueChange,
  label,
}: {
  tabs: readonly TabDef[];
  value: string;
  onValueChange: (value: string) => void;
  /** What the bar switches between, for a screen reader. Never drawn. */
  label: string;
}) {
  return (
    <RadixTabs.Root value={value} onValueChange={onValueChange}>
      <RadixTabs.List
        aria-label={label}
        data-kit="tabs"
        className="flex items-center gap-4 border-b border-kit-slate-5"
      >
        {tabs.map((t) => (
          <RadixTabs.Trigger
            key={t.value}
            value={t.value}
            disabled={t.disabled}
            data-kit="tab"
            /* §3.5: "Underline tab hover — darken the text, not the
             * background." The selected tab is the only blue on the bar.
             *
             * The indicator is a BACKGROUND BAR, not a border, and that is
             * deliberate: §4.3 says borders are "1px only… no coloured
             * borders", so the usual `border-b-2 border-blue` would break the
             * law twice over. §3.5 assumes tabs are underlined and §4.3
             * forbids the underline — reported to the kit, and built the way
             * that breaks neither. */
            className={
              "group relative flex items-center gap-2 px-1 py-2 text-body " +
              "text-kit-slate-11 hover:text-kit-slate-12 " +
              "data-[state=active]:text-kit-slate-12 " +
              "disabled:opacity-40 disabled:cursor-not-allowed " +
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kit-blue-9"
            }
          >
            {t.label}
            {t.count !== undefined && <Badge>{t.count}</Badge>}
            <span
              aria-hidden="true"
              data-kit="tab-indicator"
              className="absolute inset-x-0 bottom-0 h-0.5 bg-transparent group-data-[state=active]:bg-kit-blue-9"
            />
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
    </RadixTabs.Root>
  );
}
