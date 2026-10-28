/**
 * The ONE `PO No` cell — every linked PO number on one line, comma-separated,
 * each its own link (rule and rulings: `po-number-links.ts`). Used by the
 * Sales Orders register and SO Batch; no page draws its own.
 */
import { Fragment, type ReactNode } from "react";

import type { PoNumberLink } from "./po-number-links";

/** The shared document-link recipe. */
const DOCUMENT_LINK_CLASS = "font-medium text-kit-blue-11 underline-offset-2 hover:underline";
/** A record number in a kit cell (01 §3 links): ink, dotted underline, solid on hover. */
const KIT_LINK_CLASS = "font-medium text-c-ink underline decoration-c-secondary decoration-dotted underline-offset-[3px] hover:decoration-solid";

export default function PoNumberLinks({
  numbers,
  onOpen,
  empty = null,
  testId,
  linkTestId,
  wrap = false,
}: {
  numbers: readonly PoNumberLink[];
  /** Opens the exact PO — each page keeps its own navigation (return state). */
  onOpen: (poId: string) => void;
  /** What the cell says when no PO is linked yet. */
  empty?: ReactNode;
  testId?: string;
  linkTestId?: string;
  /** A two-line cell (01 §5): the list wraps inside its column, never cut. */
  wrap?: boolean;
}) {
  /* On a 32px row: one line, a list longer than the cell is clipped inside it
     and the column is dragged wider. In a two-line cell (`wrap`) it wraps. */
  return (
    <span className={wrap ? "block break-words" : "block truncate"} data-testid={testId}>
      {numbers.length === 0
        ? empty
        : numbers.map((po, index) => (
            <Fragment key={po.poId}>
              {index > 0 ? " " : null}
              {/* The comma stays with its number, so a wrapped list never
                  starts a line with `,` (seen on SO Batch, 15 Oct 2026). */}
              <span className="whitespace-nowrap">
                <button
                  type="button"
                  className={wrap ? KIT_LINK_CLASS : DOCUMENT_LINK_CLASS}
                  data-testid={linkTestId}
                  data-po-id={po.poId}
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpen(po.poId);
                  }}
                  onDoubleClick={(event) => event.stopPropagation()}
                >
                  {po.display}
                </button>
                {index < numbers.length - 1 ? "," : null}
              </span>
            </Fragment>
          ))}
    </span>
  );
}
