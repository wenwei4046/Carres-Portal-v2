/**
 * Tabs — UI-KIT §6 Box Dictionary, card D0.5b.
 *
 * **A tab bar is a STAGE PICKER, and §8.2 already ruled what that means**: one
 * is always on, clicking the active one does nothing, and there is no ✕ chip —
 * there is nothing to clear into. That distinction was found the hard way on
 * Purchasing's To Order tab, where re-clicking the active stage threw away the
 * supplier filter. Radix's `Tabs` has exactly that behaviour, which is why the
 * kit does not hand-roll it.
 *
 * `tabs` are DATA and each carries its own `value`; the ACTIVE value is the
 * caller's state, because on most pages it belongs in the URL (`?tab=`) and
 * every existing deep link must keep working.
 *
 * **Underline, not a pill.** §3.5 rules the hover: darken the TEXT, never the
 * background — a filled tab would be a second selection language beside the
 * blue wash the rest of the portal uses.
 */
import * as RadixTabs from "@radix-ui/react-tabs";
import type { ReactNode } from "react";
import Badge from "./Badge";

export interface TabDef {
  value: string;
  /** The word — from COPY-STANDARD, never invented at the call site. */
  label: string;
  /** A neutral count. It is a `Badge`, so it can never carry a status colour. */
  count?: number;
}

export default function Tabs({
  tabs,
  value,
  onValueChange,
  label,
  children,
}: {
  tabs: TabDef[];
  value: string;
  onValueChange: (value: string) => void;
  /** Accessible name for the tab list. */
  label: string;
  /** The panels — one `Tabs.Panel` per tab. */
  children: ReactNode;
}) {
  return (
    <RadixTabs.Root value={value} onValueChange={onValueChange} data-kit="tabs">
      <RadixTabs.List aria-label={label} className="flex items-center gap-4 border-b border-kit-slate-6">
        {tabs.map((t) => (
          <RadixTabs.Trigger
            key={t.value}
            value={t.value}
            className={
              "flex items-center gap-2 border-b-2 border-transparent px-1 py-2 text-body text-kit-slate-11 " +
              "hover:text-kit-slate-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kit-blue-9 " +
              "data-[state=active]:border-kit-blue-9 data-[state=active]:text-kit-slate-12"
            }
          >
            {t.label}
            {t.count !== undefined && <Badge>{t.count}</Badge>}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {children}
    </RadixTabs.Root>
  );
}

/** One tab's content. Kept as a named export so a panel cannot exist alone. */
export function TabPanel({ value, children }: { value: string; children: ReactNode }) {
  return (
    <RadixTabs.Content value={value} className="pt-4 focus-visible:outline-none">
      {children}
    </RadixTabs.Content>
  );
}
