/**
 * Finance tables keep the person's own saved column layouts on the server
 * (migration 0704; Chew 2026-10-21, 「可以」; docs/finance/MASTER.md §4.2).
 * The same personal layouts Purchase Orders pilots (0528; ui MASTER §6.7
 * rule 4): order, hidden, widths and sort, up to 10 per table, one Default,
 * seen only by the person who saved them. A Finance exception: Finance
 * listings join the pilot as `finance_<table>`.
 *
 * Every Finance `look="finance"` DataGrid passes `useFinancePersonalLayouts`
 * to `personalLayouts`, with its own listing. A failed read leaves the Columns
 * menu without saved layouts; the table still works.
 */
import { useMemo } from "react";
import type { DataGridPersonalLayouts } from "@/components/register/DataGrid";
import { useRegisterLayouts, useSaveRegisterLayout, useSetDefaultRegisterLayout } from "@/lib/queries";

/** A Finance table's listing: `finance_` then lower-case letters, digits and `_`. */
export type FinanceLayoutListing = `finance_${string}`;

export function useFinancePersonalLayouts(listing: FinanceLayoutListing): DataGridPersonalLayouts {
  const layoutsQ = useRegisterLayouts(listing);
  const saveLayout = useSaveRegisterLayout(listing);
  const setDefaultLayout = useSetDefaultRegisterLayout(listing);
  return useMemo<DataGridPersonalLayouts>(() => {
    const rows = Array.isArray(layoutsQ.data?.layouts) ? layoutsQ.data.layouts : [];
    return {
      layouts: rows.map((l) => ({ id: l.id, name: l.name, layout: l.layout, isDefault: l.is_default })),
      limit: layoutsQ.data?.limit ?? 10,
      onSave: async (name, layout) => {
        try {
          await saveLayout.mutateAsync({ name, layout });
        } catch (e) {
          const code = (e as { body?: { code?: string } }).body?.code;
          throw new Error(code === "register_layout_limit"
            ? "You can keep 10 layouts. Save under an existing name to replace one."
            : "The layout could not be saved. Try again.");
        }
      },
      onSetDefault: async (id) => {
        try {
          await setDefaultLayout.mutateAsync(id);
        } catch {
          throw new Error("Your default could not be saved. Try again.");
        }
      },
    };
  }, [layoutsQ.data, saveLayout, setDefaultLayout]);
}
