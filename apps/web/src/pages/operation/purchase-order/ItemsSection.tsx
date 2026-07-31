/**
 * Purchase Order · ITEMS — the first section of the rebuilt page, and the first
 * business page in the portal to render through a Design System component.
 *
 * **Why this section first.** It is the one an operator spends the review in
 * (Loo, 2026-07-31 — *"Operator 80% 的时间是在 Review PO,不是填写 PO"*), its
 * business rules are already shipped and tested in `packages/shared`, and it
 * needs no column that does not exist and no migration. Every other section of
 * the page is blocked on one or the other.
 *
 * **Four Table decisions, all ruled rather than invented (Loo, 2026-07-31):**
 * use the existing `DataTable` and do not rewrite it · rows 40px, with 48 and
 * 56 kept in the tokens for elsewhere · the Orders header, unchanged · the
 * empty and loading states `DataTable` already carries, replaced portal-wide
 * later rather than forked here.
 *
 * **The row is a BUILD — one physical thing.** That is the unit an operator can
 * point at (*that* sofa, not "line 3 of 5") and the unit `Remove`, `Create
 * Another Purchase Order` and `Move` all act on.
 *
 * **Size and Qty are the two facts this table exists to stop hiding.** Live on
 * 2026-07-31 the preview printed `B1201S` for a King and `B1201S` for a Queen,
 * and showed 14 lines where Nice Future had 16 mattresses to build.
 *
 * This file spells no word of its own: every string is a caller-visible label
 * ruled by Loo in the 2026-07-31 design freeze, and each is owed a
 * COPY-STANDARD row.
 */
import DataTable, { type Column } from "@/components/kit/DataTable";
import DropdownMenu, { type MenuItem } from "@/components/kit/DropdownMenu";
import Button from "@/components/kit/Button";
import Icon from "@/components/kit/Icon";
import SectionHeader from "@/components/kit/SectionHeader";
import {
  TO_ORDER_WORDS as W,
  itemsCount,
  moveToTarget,
  unitLabel,
  type ToOrderBuildRef,
} from "@carres/shared";

export interface MoveTarget {
  key: string;
  /** `Purchase Order 2` — what the operator sees, composed by the caller. */
  label: string;
}

export default function ItemsSection({
  builds,
  category,
  canRearrange,
  moveTargets,
  loading = false,
  onRemove,
  onSplit,
  onMove,
  onOpenOrder,
}: {
  builds: readonly ToOrderBuildRef[];
  /** Decides what one unit is called — sofas, mattresses, bedframes. */
  category: string;
  /**
   * False on sofa. A sofa purchase order carries exactly one customer order, so
   * there is nothing to split out of it and moving would be the merge the
   * category boundary forbids.
   */
  canRearrange: boolean;
  /** Every OTHER document on this proposal. Empty = no Move item at all. */
  moveTargets: readonly MoveTarget[];
  loading?: boolean;
  onRemove: (buildKey: string) => void;
  onSplit: (buildKey: string) => void;
  onMove: (buildKey: string, toKey: string) => void;
  onOpenOrder: (orderId: string) => void;
}) {
  const columns: readonly Column<ToOrderBuildRef>[] = [
    {
      key: "ref",
      label: W.itemsColRef,
      width: 16,
      cell: (b) => (b.so != null ? `SO-${b.so}` : "—"),
    },
    {
      key: "item",
      label: W.itemsColItem,
      width: 44,
      // The ordinal only when a sibling would read identically — PETER's two
      // Booqits are different sofas and an operator removing one has to know
      // which. It is NOT `title`: that carries the size, and Size is a column.
      cell: (b) =>
        b.ordinal != null ? `${unitLabel(category, 1)} ${b.ordinal} — ${b.model}` : b.model,
    },
    {
      key: "size",
      // Null where the category HAS no size, which is a different fact from
      // nobody having typed one — every sofa reads the dash for the first
      // reason and no mattress can read it for the second.
      label: W.itemsColSize,
      width: 16,
      cell: (b) => b.size ?? "—",
    },
    {
      key: "qty",
      label: W.itemsColQty,
      width: 12,
      align: "right",
      numeric: true,
      cell: (b) => b.qty,
    },
    {
      key: "action",
      label: W.itemsColAction,
      width: 12,
      align: "right",
      cell: (b) => (
        <DropdownMenu
          label={W.itemsMenu}
          trigger={
            <Button
              variant="ghost"
              size="sm"
              aria-label={W.itemsMenu}
              data-testid={`items-menu-${b.buildKey}`}
            >
              {/* The kit's 40 meanings hold exactly one kebab, and it is
                  `overflow` — a name invented here would not compile. */}
              <Icon name="overflow" size={16} />
            </Button>
          }
          items={menuFor(b)}
        />
      ),
    },
  ];

  function menuFor(b: ToOrderBuildRef): MenuItem[] {
    const items: MenuItem[] = [];
    // Move is the SECOND step, never the first: until a split has happened
    // there is nowhere to move to, and a menu item with no destination is a
    // dead end wearing a verb (Loo, 2026-07-31).
    if (canRearrange) {
      for (const t of moveTargets) {
        items.push({
          key: `move-${t.key}`,
          label: moveToTarget(t.label),
          onSelect: () => onMove(b.buildKey, t.key),
        });
      }
      items.push({
        key: "split",
        label: W.itemsSplit,
        onSelect: () => onSplit(b.buildKey),
      });
    }
    items.push({
      key: "remove",
      label: W.itemsRemove,
      onSelect: () => onRemove(b.buildKey),
    });
    items.push({
      key: "open",
      label: W.itemsOpenOrder,
      separatorBefore: true,
      onSelect: () => onOpenOrder(b.orderId),
    });
    return items;
  }

  return (
    <section data-testid="po-items">
      {/* Items is permanently expanded (Loo, 2026-07-31) — it is the region the
          review happens in, so it takes no `collapsible` and the component
          draws no chevron for it to not do anything. */}
      <SectionHeader
        title={W.itemsHeading}
        testId="po-items-header"
        meta={
          <span className="tabular-nums" data-testid="po-items-count">
            {itemsCount(builds.length, builds.reduce((n, b) => n + b.qty, 0))}
          </span>
        }
      />
      <DataTable
        rows={builds}
        columns={columns}
        rowId={(b) => b.buildKey}
        loading={loading}
        empty={W.itemsEmpty}
        label={W.itemsTableLabel}
      />
    </section>
  );
}
