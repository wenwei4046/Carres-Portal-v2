import { useMemo } from "react";
import {
  categoryEntriesFromCatalog,
  makeCategoryOf,
  type CategoryOf,
} from "@carres/shared";
import { useCatalog } from "./queries";

/**
 * THE category resolver, for web pages (ERP-ARCHITECTURE §3.1 — every module
 * asks the catalog). Built from the cached catalog bundle (`useCatalog`, 5-min
 * staleTime, one cache entry portal-wide) so every surface answers "what kind
 * of product is this?" identically. Before the bundle arrives — or if it
 * errors — the resolver's internal fallback chain answers, so callers never
 * branch on loading state.
 */
export function useCategoryOf(): CategoryOf {
  const { data } = useCatalog();
  return useMemo(
    () =>
      makeCategoryOf(
        categoryEntriesFromCatalog(data?.models ?? [], data?.skus ?? []),
      ),
    [data],
  );
}
