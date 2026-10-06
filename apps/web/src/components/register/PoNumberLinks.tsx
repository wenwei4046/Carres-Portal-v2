/**
 * The ONE `PO No` cell — every linked PO number on one line, comma-separated,
 * each its own link (rule and rulings: `po-number-links.ts`). Used by the
 * Sales Orders register and SO Batch; no page draws its own.
 */
import { Fragment, type ReactNode } from "react";

import type { PoNumberLink } from "./po-number-links";

/** The shared document-link recipe. */
const DOCUMENT_LINK_CLASS = "font-medium text-kit-blue-11 underline-offset-2 hover:underline";

export default function PoNumberLinks({
  numbers,
  onOpen,
  empty = null,
  testId,
  linkTestId,
}: {
  numbers: readonly PoNumberLink[];
  /** Opens the exact PO — each page keeps its own navigation (return state). */
  onOpen: (poId: string) => void;
  /** What the cell says when no PO is linked yet. */
  empty?: ReactNode;
  testId?: string;
  linkTestId?: string;
}) {
  /* One line, never wrapped: a list longer than the cell is clipped inside it
     and the column is dragged wider. The row keeps the standard 32px recipe. */
  return (
    <span className="block truncate" data-testid={testId}>
      {numbers.length === 0
        ? empty
        : numbers.map((po, index) => (
            <Fragment key={po.poId}>
              {index > 0 ? ", " : null}
              <button
                type="button"
                className={DOCUMENT_LINK_CLASS}
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
            </Fragment>
          ))}
    </span>
  );
}
