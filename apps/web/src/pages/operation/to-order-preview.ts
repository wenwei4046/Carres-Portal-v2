import {
  defaultDocuments,
  isOnePoPerOrder,
  toOrderBuilds,
  validateIssuePlan,
  type IssueDocument,
  type IssuePlanCheck,
  type ToOrderBuildRef,
  type ToOrderProposal,
} from "@carres/shared";

/**
 * The Purchase Order Preview's state — the arrangement an operator makes before
 * issuing.
 *
 * **It lives in this browser tab and nowhere else.** Splitting, moving,
 * removing and un-including rearrange documents that exist only until the page
 * is refreshed, at which point the server's own suggestion comes back. Nothing
 * here is ever stored, which is what keeps a Proposal a computed view rather
 * than the Draft PO this module deleted on 2026-07-30.
 *
 * Kept out of the component so the rules can be tested without rendering, and
 * so the page has one place to look when it needs to know what a Split does.
 */

export interface PreviewDoc extends IssueDocument {
  /** The builds on this document, in the order they were put there. */
  builds: ToOrderBuildRef[];
  /** Every build here belongs to this customer; null when several do. */
  customer: string | null;
  so: number | null;
}

export interface PreviewState {
  docs: IssueDocument[];
}

export function initialState(proposal: ToOrderProposal): PreviewState {
  return { docs: defaultDocuments(proposal) };
}

/** Hydrate the arrangement with the facts the screen needs to draw it. */
export function describe(proposal: ToOrderProposal, state: PreviewState): PreviewDoc[] {
  const byKey = new Map(toOrderBuilds(proposal).map((b) => [b.buildKey, b]));
  return state.docs.map((d) => {
    const builds = d.buildKeys
      .map((k) => byKey.get(k))
      .filter((b): b is ToOrderBuildRef => Boolean(b));
    const customers = new Set(builds.map((b) => b.customer));
    const sos = new Set(builds.map((b) => b.so));
    return {
      ...d,
      builds,
      customer: customers.size === 1 ? [...customers][0] : null,
      so: sos.size === 1 ? ([...sos][0] ?? null) : null,
    };
  });
}

export function check(proposal: ToOrderProposal, state: PreviewState): IssuePlanCheck {
  return validateIssuePlan(proposal, state.docs);
}

/**
 * Split and Move only exist where a purchase order may hold more than one
 * customer order. A sofa document carries exactly one — fabric, size and
 * configuration make a merged sofa dangerous — so on sofa there is nothing to
 * split and moving would be the merge the rule forbids. This is not a limit
 * this file invented; it falls straight out of the frozen PO boundary.
 */
export function canRearrange(proposal: ToOrderProposal): boolean {
  return !isOnePoPerOrder(proposal.category);
}

function nextKey(docs: readonly IssueDocument[]): string {
  let n = docs.length + 1;
  const taken = new Set(docs.map((d) => d.key));
  while (taken.has(`d${n}`)) n += 1;
  return `d${n}`;
}

/** This visit only: leave a whole document out of the issue, or put it back. */
export function toggleInclude(state: PreviewState, key: string): PreviewState {
  return {
    docs: state.docs.map((d) => (d.key === key ? { ...d, include: !d.include } : d)),
  };
}

/**
 * Take a build off the purchase order it is on. It is not held, not excluded
 * and not cancelled — it is simply not on THIS document, so the next
 * recomputation finds it still unordered and offers it again.
 *
 * A document emptied this way is dropped: an empty purchase order is refused by
 * the server anyway, and leaving one on screen invites a click that cannot work.
 */
export function removeBuild(state: PreviewState, buildKey: string): PreviewState {
  const docs = state.docs
    .map((d) => ({ ...d, buildKeys: d.buildKeys.filter((k) => k !== buildKey) }))
    .filter((d) => d.buildKeys.length > 0);
  return { docs };
}

/** Put a build back on a document it was taken off. */
export function restoreBuild(
  state: PreviewState,
  proposal: ToOrderProposal,
  buildKey: string,
): PreviewState {
  if (state.docs.some((d) => d.buildKeys.includes(buildKey))) return state;
  const b = toOrderBuilds(proposal).find((x) => x.buildKey === buildKey);
  if (!b) return state;
  // Back where it belongs: its own customer's document for a sofa, the one
  // merged document otherwise. A new document if neither exists any more.
  const home = isOnePoPerOrder(proposal.category)
    ? state.docs.find((d) =>
        d.buildKeys.some(
          (k) => toOrderBuilds(proposal).find((x) => x.buildKey === k)?.orderId === b.orderId,
        ),
      )
    : state.docs[0];
  if (home) {
    return {
      docs: state.docs.map((d) =>
        d.key === home.key ? { ...d, buildKeys: [...d.buildKeys, buildKey] } : d,
      ),
    };
  }
  return { docs: [...state.docs, { key: nextKey(state.docs), include: true, buildKeys: [buildKey] }] };
}

/** Everything not on a document right now. */
export function removedBuilds(
  proposal: ToOrderProposal,
  state: PreviewState,
): ToOrderBuildRef[] {
  const on = new Set(state.docs.flatMap((d) => d.buildKeys));
  return toOrderBuilds(proposal).filter((b) => !on.has(b.buildKey));
}

/** Move builds onto their own new purchase order. */
export function splitOut(state: PreviewState, buildKeys: readonly string[]): PreviewState {
  const moving = new Set(buildKeys);
  if (moving.size === 0) return state;
  const rest = state.docs
    .map((d) => ({ ...d, buildKeys: d.buildKeys.filter((k) => !moving.has(k)) }))
    .filter((d) => d.buildKeys.length > 0);
  return {
    docs: [...rest, { key: nextKey(state.docs), include: true, buildKeys: [...moving] }],
  };
}

/** Move a build onto an existing purchase order. */
export function moveBuild(
  state: PreviewState,
  buildKey: string,
  toKey: string,
): PreviewState {
  if (!state.docs.some((d) => d.key === toKey)) return state;
  const docs = state.docs
    .map((d) =>
      d.key === toKey
        ? { ...d, buildKeys: [...d.buildKeys.filter((k) => k !== buildKey), buildKey] }
        : { ...d, buildKeys: d.buildKeys.filter((k) => k !== buildKey) },
    )
    .filter((d) => d.buildKeys.length > 0);
  return { docs };
}
