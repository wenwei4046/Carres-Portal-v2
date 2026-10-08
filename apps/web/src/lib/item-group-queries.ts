import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

/**
 * 0659 — the Finance item groups a new catalog product can start in, and the
 * group each category starts in (Finance MASTER §0 "Item groups"; the field on
 * the catalog's new-product forms is Chew's §1 exception). Finance keeps the
 * groups; the catalog only offers them when a product is made.
 */
export interface ItemGroupChoices {
  groups: { id: string; name: string }[];
  /** category → the id of the group its products start in */
  starts: Record<string, string>;
}

export function useItemGroupChoices() {
  return useQuery({
    queryKey: ["catalog", "item-groups"] as const,
    queryFn: () => apiFetch<ItemGroupChoices>("/api/catalog/item-groups"),
    staleTime: 5 * 60_000,
  });
}
