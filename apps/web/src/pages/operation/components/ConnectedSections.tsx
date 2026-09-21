/**
 * ⭐ THE SECTIONS OF AN EXPANDED ROW, ON THE NAVIGATION'S OWN LINE
 * (owner correction 2026-09-11; `docs/ui/MASTER.md` — the shared expansion
 * grammar).
 *
 * An expanded register row has grown from one child table into three sections,
 * and three boxes stacked with air between them do not say which record they
 * belong to. The owner asked for the line the portal's left navigation already
 * draws between a module and its pages — the same subtle curve — so this file
 * composes `components/tree-connector` into the section stack and nothing more.
 *
 * ```
 *   ▼ SO-1303
 *     │
 *     ├─ Goods on this order        ← actionable demand
 *     │
 *     ├─ ▸ Ready Stock              ← what is on the shelf for it
 *     │
 *     ╰─ Purchase order details     ← the read-only record
 *
 *   ▸ SO-1302                       ← the line NEVER reaches this row
 * ```
 *
 * THREE PROPERTIES, and every one of them is why the drawing is per-section
 * rather than one bar down the side:
 *
 * ① IT STARTS UNDER THE PARENT. The first elbow reaches UP past the top of the
 *   first section into the gap above it, so the line visibly comes from the row
 *   that was opened rather than beginning in mid-air.
 *
 * ② IT ENDS IN A CURVE AT THE LAST SECTION. The last section draws its elbow
 *   and no trunk, so there is structurally nothing to run on into the next
 *   Sales Order. It cannot leak; there is no line there to leak.
 *
 * ③ IT LANDS ON EACH SECTION'S HEADING. A section is not a one-line nav row, so
 *   `connectAt` is the pixel offset of its own heading's middle. The elbow
 *   points at the words, not at the middle of a table whose height depends on
 *   how much was bought.
 *
 * ⛔ AND IT IS NOT A NESTED CARD. The sections keep their own ordinary table
 * borders and their own frames; nothing wraps them in a second large box. The
 * hierarchy is drawn by a 1px line and an indent, which is what a tree is.
 */
import type { ReactNode } from "react";
import {
  ConnectorElbow,
  ConnectorTrunk,
  CONNECTOR_ELBOW_W,
} from "@/components/tree-connector";
import { useExpansionJoined } from "@/components/register/expansion-connector";

/** x of the trunk, inside the expansion cell — under the parent's own identity. */
export const SECTION_TRUNK_X = 10;
/** Where a section's box starts: clear of the elbow by the nav's own 4px. */
export const SECTION_PAD_L = SECTION_TRUNK_X + CONNECTOR_ELBOW_W + 4;
/** Air between two sections — the clear space the owner asked for. */
export const SECTION_GAP = 10;
/** Air above the first section, which the first elbow reaches up through. */
export const SECTION_TOP_GAP = 8;

/**
 * A ruled table's column header is `py-1.5` around an 11px label — 26px — so
 * the elbow turns in at 13. A section that leads with the 36px disclosure
 * handle turns in at 18. Both are stated, never measured at runtime: a line
 * that re-measures is a line that moves when a table loads.
 */
export const CONNECT_AT_TABLE_HEADER = "13px";
export const CONNECT_AT_DISCLOSURE = "18px";

export interface ConnectedSection {
  key: string;
  /** The offset of this section's own heading middle — see the two constants. */
  connectAt: string;
  node: ReactNode;
}

export default function ConnectedSections({
  sections,
  testId,
}: {
  sections: readonly ConnectedSection[];
  testId?: string;
}) {
  /* ⭐ INSIDE A GRID EXPANSION THE LINE COMES FROM THE CARET (§6.9, Card 12
     review 2026-09-21). The grid draws the drop and the curve in the caret's
     own column and hands over at the expansion cell's left edge, at
     `--expansion-join-y`; this stack carries it flat to the first child and
     lands that child's heading on the same height. Outside a grid (a detail
     panel) nothing changes. */
  const joined = useExpansionJoined();
  const firstAt = sections[0]?.connectAt ?? CONNECT_AT_TABLE_HEADER;
  return (
    <div
      data-testid={testId}
      data-connected-sections={joined ? "" : undefined}
      style={{
        paddingLeft: SECTION_PAD_L,
        paddingTop: joined ? `calc(var(--expansion-join-y, 21px) - ${firstAt})` : SECTION_TOP_GAP,
        paddingBottom: SECTION_TOP_GAP,
      }}
    >
      {sections.map((s, i) => {
        const isLast = i === sections.length - 1;
        return (
          <div
            key={s.key}
            className="relative"
            data-testid={`connected-section-${s.key}`}
            style={{ marginTop: i === 0 ? 0 : SECTION_GAP }}
          >
            {joined && i === 0 ? (
              /* The run: from the expansion cell's left edge to this box. */
              <span
                aria-hidden="true"
                data-testid={`section-run-${s.key}`}
                className="pointer-events-none absolute border-kit-slate-6"
                /* It ends ON the box's border — §6.9: the line visibly touches its
                   destination (a 4px shortfall left it floating, Card 12 walk). */
                style={{ left: -SECTION_PAD_L, width: SECTION_PAD_L, top: s.connectAt, borderTopWidth: 1, zIndex: 1 }}
              />
            ) : (
              <ConnectorElbow
                /* The trunk's x is measured from the SECTION's left edge, which
                   the padding above has already moved right. */
                left={SECTION_TRUNK_X - SECTION_PAD_L}
                gapAbove={i === 0 ? SECTION_TOP_GAP : SECTION_GAP}
                connectAt={s.connectAt}
                testId={`section-elbow-${s.key}`}
              />
            )}
            {!isLast && (
              <ConnectorTrunk
                left={SECTION_TRUNK_X - SECTION_PAD_L}
                from={s.connectAt}
                gapBelow={SECTION_GAP}
                testId={`section-trunk-${s.key}`}
              />
            )}
            {s.node}
          </div>
        );
      })}
    </div>
  );
}
