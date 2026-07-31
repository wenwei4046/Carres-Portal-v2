/**
 * Purchase Order Workspace — ONE purchase order, five regions.
 *
 * Design System: `docs/03-page-patterns.md` → Review → Carres Examples.
 *
 * This replaces the accordion stack, where every future purchase order was a
 * collapsed strip and the operator worked inside whichever one they had opened.
 * The frozen shape (Loo, 2026-07-31) is one purchase order filling the pane and
 * the LIST of them living in the left rail — because the thing an operator
 * reviews is a document, and a document deserves the page.
 *
 * The region ORDER is the point, not the styling:
 *
 *     Header                  who am I sending to
 *     Supplier Communication  can I reach them
 *     Items                   what am I sending          ← the largest region
 *     Notes to Supplier
 *     Issue                   the one primary action
 *
 * *"Operator 一打开:我会寄给谁 → 我要寄什么。比 我要寄什么 → 最后才想到寄给谁
 * 更符合人的思考"* — which is why Communication sits ABOVE Items and collapsed,
 * costing two rows, rather than at the bottom of a long table where it is
 * missed.
 *
 * **This step is STRUCTURE.** Supplier Communication and Notes are empty
 * regions on purpose: they are blocked on a table and on words nobody has
 * ruled, and drawing a body for them now would be inventing both. Items is the
 * only region with real content, and it is unchanged.
 *
 * **No new word enters the portal here.** Every string is one the page already
 * shows or one Loo wrote in the 2026-07-31 freeze.
 */
import { useState } from "react";
import SectionHeader from "@/components/kit/SectionHeader";
import { TO_ORDER_WORDS as W } from "@carres/shared";
import ItemsSection, { type MoveTarget } from "./ItemsSection";
import type { PreviewDoc } from "../to-order-preview";

/** Section titles Loo wrote in the frozen layout. Owed COPY-STANDARD rows. */
export const WORKSPACE_WORDS = {
  communication: "Supplier Communication",
  notes: "Notes to Supplier",
} as const;

export default function PurchaseOrderWorkspace({
  doc,
  index,
  total,
  supplierLabel,
  destinationName,
  orderByLabel,
  category,
  canRearrange,
  moveTargets,
  onInclude,
  onRemove,
  onSplit,
  onMove,
  onOpenOrder,
}: {
  doc: PreviewDoc;
  index: number;
  total: number;
  /** `Ohana · Sofa` — the proposal this document belongs to. */
  supplierLabel: string;
  /** The destination currently chosen for the issue. */
  destinationName: string | null;
  /** `Order by Wed, 15 Jul 26`, already composed by the caller. */
  orderByLabel: string | null;
  category: string;
  canRearrange: boolean;
  moveTargets: readonly MoveTarget[];
  onInclude: () => void;
  onRemove: (buildKey: string) => void;
  onSplit: (buildKey: string) => void;
  onMove: (buildKey: string, toKey: string) => void;
  onOpenOrder: (orderId: string) => void;
}) {
  // Collapsed by default, both of them. A region an operator opens only when
  // something is unusual should not spend height on every other visit.
  const [headerOpen, setHeaderOpen] = useState(false);
  const [commsOpen, setCommsOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);

  /** `Ohana · Sofa · Carres Klang · Order by Wed, 15 Jul 26` */
  const headerLine = [supplierLabel, destinationName, orderByLabel]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className="flex-1 min-h-0 flex flex-col bg-white border border-base-200 rounded-[8px] overflow-hidden"
      data-testid="po-workspace"
    >
      <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-base-200">
        <input
          type="checkbox"
          checked={doc.include}
          onChange={onInclude}
          aria-label={W.include}
          title={W.include}
          data-testid={`to-order-include-${doc.key}`}
          className="shrink-0"
        />
        <span className="text-body font-semibold text-base-900 whitespace-nowrap">
          PO {index} of {total}
        </span>
        {doc.customer != null ? (
          <span className="text-body text-base-900 truncate">{doc.customer}</span>
        ) : null}
        {doc.so != null ? (
          <span className="text-meta text-base-600 whitespace-nowrap">SO-{doc.so}</span>
        ) : null}
        {/* No count here. This bar says WHICH document; the count belongs to
            the region that owns the fact, and the queue row carries it for
            scanning. Two of them in one block is the defect this page just
            fixed once. */}
      </div>

      {!doc.include ? (
        <div className="shrink-0 px-4 py-1.5 text-meta text-base-600">{W.includeOffHelp}</div>
      ) : null}

      <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-base-100">
        {/* ── 1 · Header ───────────────────────────────────────────────── */}
        <section data-testid="po-region-header">
          <SectionHeader
            title={headerLine}
            testId="po-header"
            collapsible
            open={headerOpen}
            onToggle={() => setHeaderOpen((v) => !v)}
          />
          {headerOpen ? (
            <div className="px-4 pb-3" data-testid="po-header-body">
              {/* STRUCTURE ONLY. What a Header must eventually hold — the
                  supplier's address, telephone, Attn and terms — has no column
                  in `suppliers`, and `Ship via` has no ruled word. One fact
                  that exists and is ruled is drawn; nothing is invented to
                  fill the region out. */}
              <dl className="text-meta">
                <dt className="text-label uppercase tracking-wide text-base-500">
                  {W.destination}
                </dt>
                <dd className="text-base-900">{destinationName ?? "—"}</dd>
              </dl>
            </div>
          ) : null}
        </section>

        {/* ── 2 · Supplier Communication — STRUCTURE ONLY ──────────────── */}
        <section data-testid="po-region-communication">
          <SectionHeader
            title={WORKSPACE_WORDS.communication}
            testId="po-comms"
            collapsible
            open={commsOpen}
            onToggle={() => setCommsOpen((v) => !v)}
          />
          {commsOpen ? <div className="px-4 pb-3" data-testid="po-comms-body" /> : null}
        </section>

        {/* ── 3 · Items — the region the review happens in ─────────────── */}
        <ItemsSection
          builds={doc.builds}
          category={category}
          canRearrange={canRearrange}
          moveTargets={moveTargets}
          onRemove={onRemove}
          onSplit={onSplit}
          onMove={onMove}
          onOpenOrder={onOpenOrder}
        />

        {/* ── 4 · Notes to Supplier — STRUCTURE ONLY ───────────────────── */}
        <section data-testid="po-region-notes">
          <SectionHeader
            title={WORKSPACE_WORDS.notes}
            testId="po-notes"
            collapsible
            open={notesOpen}
            onToggle={() => setNotesOpen((v) => !v)}
          />
          {notesOpen ? <div className="px-4 pb-3" data-testid="po-notes-body" /> : null}
        </section>
      </div>
    </div>
  );
}
