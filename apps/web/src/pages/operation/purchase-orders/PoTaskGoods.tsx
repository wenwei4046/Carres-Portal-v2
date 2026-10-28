/**
 * THE GOODS OF A PURCHASE ORDER, INSIDE ITS TASK — read-only, and drawn to fit
 * the Tasks panel at 320 (01 §2) as well as on a wide screen.
 *
 *   TEST Mattress
 *   Queen
 *   Order Qty 6   Received Qty 2   Pending Delivery Qty 4
 *
 * The three quantities keep their governed names (COPY "Purchasing UI
 * dictionary") and wrap as whole pairs, so no number is cut or scrolled out of
 * sight. Nothing is counted here: every number is the caller's.
 */
export interface PoTaskGoodsLine {
  key: string;
  name: string;
  /** The size or the SKU, under the name. */
  detail?: string | null;
  orderQty: number;
  receivedQty: number;
  pendingQty: number;
}

export default function PoTaskGoods({ label, lines }: { label: string; lines: readonly PoTaskGoodsLine[] }) {
  return (
    <ul className="m-0 flex list-none flex-col p-0" aria-label={label} data-testid="po-task-goods">
      {lines.map((line) => (
        <li key={line.key} className="flex flex-col gap-0.5 border-t border-c-row-line py-2 first:border-t-0 first:pt-0" data-testid={`po-task-goods-${line.key}`}>
          <span className="break-words text-body text-c-ink">{line.name}</span>
          {line.detail ? <span className="break-words text-meta text-c-secondary">{line.detail}</span> : null}
          <dl className="m-0 flex flex-wrap gap-x-3 gap-y-0.5 text-meta">
            {([["Order Qty", line.orderQty], ["Received Qty", line.receivedQty], ["Pending Delivery Qty", line.pendingQty]] as const).map(([word, qty]) => (
              <div key={word} className="flex items-baseline gap-1 whitespace-nowrap">
                <dt className="text-c-secondary">{word}</dt>
                <dd className="m-0 font-medium tabular-nums text-c-ink">{qty}</dd>
              </div>
            ))}
          </dl>
        </li>
      ))}
    </ul>
  );
}
