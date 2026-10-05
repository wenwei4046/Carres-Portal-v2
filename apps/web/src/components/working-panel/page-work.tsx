/**
 * PAGE WORK — the shared Working Panel host's page-supplied source.
 *
 * LOCALHOST PROPOSAL (owner flow "Tasks, Working Panel and document view",
 * 2026-10-05). Never deployed until the owner confirms the walk.
 *
 * Entering a module page, the right Working Panel shows THAT page's
 * highest-priority actionable work. The page does not invent work: it hands
 * the host items read from an EXISTING source — the Work engine's items (owner,
 * permissions and completion facts already resolved on the server) or the
 * module's own task source. The host only orders them and remembers which one
 * the operator chose by hand. Nothing here ticks, orders, reserves or sends.
 *
 *   order    Missed (earliest first) → due today (earliest first) → next
 *            (earliest first) → no working date.
 *   choice   the top item, unless the operator opened another one by hand;
 *            that choice survives a refresh (sessionStorage, this tab only)
 *            while the item still exists.
 *   never    derived from the table's current filter or search.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type PageWorkBucket = "missed" | "today" | "next" | "no_date";

export interface PageWorkItem {
  /** Stable identity — the Work item id, or the PO window key. */
  key: string;
  bucket: PageWorkBucket;
  /** Earliest first inside a bucket: an ISO date or a window key
   *  (`2026-10-05T11:30`). Null sorts last. */
  sortAt: string | null;
  /** The record the work is about, as the source names it (`SO-1368`,
   *  `11:30 AM PO window`). */
  label: string;
  /** The source's own action sentence. */
  action: string;
  /** The Working Panel body for this item — the shared CompactModuleCard.
   *  `close` closes the right area (the card's own ×). */
  render: (close: () => void) => ReactNode;
}

export interface PageWorkSource {
  /** One key per page (`so-batch`, `sales-orders`, `purchase-orders`). */
  pageKey: string;
  /** The page's COPY name: `SO Batch Purchase`, `Sales Orders`, … */
  pageName: string;
  state: "loading" | "failed" | "ready";
  items: PageWorkItem[];
  retry?: () => void;
}

const BUCKET_RANK: Record<PageWorkBucket, number> = { missed: 0, today: 1, next: 2, no_date: 3 };

/** The host's one ordering — pages never order their own work. */
export function orderPageWork(items: readonly PageWorkItem[]): PageWorkItem[] {
  return [...items].sort((a, b) => {
    const rank = BUCKET_RANK[a.bucket] - BUCKET_RANK[b.bucket];
    if (rank !== 0) return rank;
    if (a.sortAt === b.sortAt) return a.key.localeCompare(b.key);
    if (a.sortAt === null) return 1;
    if (b.sortAt === null) return -1;
    return a.sortAt.localeCompare(b.sortAt);
  });
}

const PICK_PREFIX = "carres.workingPanel.pick.";

function readPick(pageKey: string): string | null {
  try {
    return window.sessionStorage.getItem(PICK_PREFIX + pageKey);
  } catch {
    return null;
  }
}

function writePick(pageKey: string, key: string | null): void {
  try {
    if (key === null) window.sessionStorage.removeItem(PICK_PREFIX + pageKey);
    else window.sessionStorage.setItem(PICK_PREFIX + pageKey, key);
  } catch {
    /* Private window or blocked storage: the choice lives for this visit only. */
  }
}

type Registry = {
  source: PageWorkSource | null;
  setSource: (next: PageWorkSource | null, pageKey: string) => void;
};

const PageWorkContext = createContext<Registry | null>(null);

export function PageWorkProvider({ children }: { children: ReactNode }) {
  const [source, setSourceState] = useState<PageWorkSource | null>(null);
  const setSource = useCallback((next: PageWorkSource | null, pageKey: string) => {
    setSourceState((current) => {
      /* A page leaving clears only ITS OWN source — never the next page's. */
      if (next === null) return current?.pageKey === pageKey ? null : current;
      return next;
    });
  }, []);
  const value = useMemo(() => ({ source, setSource }), [source, setSource]);
  return <PageWorkContext.Provider value={value}>{children}</PageWorkContext.Provider>;
}

/** A page registers its work source while it is mounted. Pass a memoised
 *  source; `null` while the page has none to offer. */
export function usePageWork(source: PageWorkSource | null): void {
  const registry = useContext(PageWorkContext);
  const setSource = registry?.setSource;
  const pageKey = source?.pageKey ?? null;
  useEffect(() => {
    if (!setSource || !source) return;
    setSource(source, source.pageKey);
  }, [setSource, source]);
  useEffect(() => {
    if (!setSource || !pageKey) return;
    return () => setSource(null, pageKey);
  }, [setSource, pageKey]);
}

/** The host's read of the current page's work. */
export function useCurrentPageWork(): PageWorkSource | null {
  return useContext(PageWorkContext)?.source ?? null;
}

/**
 * The selected item: the operator's own choice while it still exists, else the
 * top of the ordered list. `choose` records a hand-picked item.
 */
export function usePageWorkSelection(source: PageWorkSource | null) {
  const ordered = useMemo(() => orderPageWork(source?.items ?? []), [source?.items]);
  const pageKey = source?.pageKey ?? null;
  const [picked, setPicked] = useState<string | null>(() => (pageKey ? readPick(pageKey) : null));
  useEffect(() => {
    setPicked(pageKey ? readPick(pageKey) : null);
  }, [pageKey]);
  const selected = ordered.find((item) => item.key === picked) ?? ordered[0] ?? null;
  const choose = useCallback(
    (key: string) => {
      if (!pageKey) return;
      setPicked(key);
      writePick(pageKey, key);
    },
    [pageKey],
  );
  return { ordered, selected, choose };
}
