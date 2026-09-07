/**
 * storageObligation — ONE storage figure for the Work engine and the Delivery
 * money gate (payment/MASTER.md §2 · §7 · the 2026-09-07 gate-convergence
 * slice), so the gate and Payment's own readers cannot disagree.
 *
 * TWO SOURCES EXIST TODAY, and this composer is their one precedence law:
 *
 *   INVOICE-BACKED (0436/0438) — the SO's live ISSUED storage-kind papers.
 *     When ANY exist, they ARE the storage obligation: the §2 model
 *     (`issued live invoice obligations − allocated money`) wins over the
 *     keyed legacy figure, the same shape as priced-lines-beat-keyed-balance
 *     in `orderMoney`. An SO carrying BOTH a keyed legacy fee and storage
 *     papers speaks the papers — never both, never a double count.
 *
 *   LEGACY C9 (`storageHold` over ops_order_control) — the shipped 2026-07-27
 *     ruling's columns. It remains the fallback for an SO with NO storage
 *     paper, BYTE-IDENTICAL to before: collected_at clears it, the override
 *     ladder holds, and the date-walked accrual stays where it always was.
 *
 * SUBTRACT ONCE. `orders.paid` is one pool that covers goods FIRST, then
 * storage. The gate's `orderMoney` clamps goods at zero and then ADDS the
 * storage figure — so this composer hands it the NETTED remainder:
 *
 *   totalOut   = max(0, goods + storage − paid)
 *   goodsOut   = max(0, goods − paid)
 *   storageNet = totalOut − goodsOut
 *
 * which makes `orderMoney(...).outstanding === totalOut` exactly — a customer
 * who paid past the goods value has the excess honoured against storage, and
 * a fully paid SO leaves NO stale storage hold. The legacy path is NOT netted
 * (C9 never read `paid`; collected_at is its clearing fact) — legacy
 * behaviour is preserved, not reinterpreted.
 *
 * RELEASE (C9's `storage_waiver_status = 'approved'`) passes through from the
 * control row for BOTH sources: it lifts the HOLD and never the debt, exactly
 * as shipped. Note the 2026-09-01 delivery ruling made money-in-full ABSOLUTE
 * at the DO door — the SQL gate does not honour a release; this passthrough
 * keeps the drawer/worklist words and the shipped TS gate behaviour
 * unchanged (history honoured), it does not reopen a door.
 */

export interface StorageObligationInput {
  /** Σ live ISSUED storage-kind invoices (amount + tax) — §2 exactly. */
  invoiceStorageSum: number;
  /** The order's goods value (lines + addons), when priced. */
  goodsTotal: number | null;
  /** `orders.paid`. */
  paid: number | string | null;
  /** The legacy C9 answer for this SO (`storageHold`). */
  legacyOwing: number;
  /** C9's release flag (`storage_waiver_status === 'approved'`). */
  legacyReleased: boolean;
}

export interface StorageObligationResult {
  /** What to hand `orderMoney` as `storageOwing` — already netted on the
   *  invoice path so the combined outstanding subtracts `paid` exactly once. */
  owing: number;
  /** The gross obligation the customer is asked for (the papers' sum, or the
   *  legacy fee) — the figure a message quotes before payments. */
  gross: number;
  released: boolean;
  source: "invoices" | "legacy" | "none";
}

function n(v: number | string | null | undefined): number {
  if (v == null || v === "") return 0;
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export function storageObligation({
  invoiceStorageSum,
  goodsTotal,
  paid,
  legacyOwing,
  legacyReleased,
}: StorageObligationInput): StorageObligationResult {
  const storage = Math.max(0, n(invoiceStorageSum));
  if (storage > 0) {
    const goods = Math.max(0, n(goodsTotal));
    const paidNum = Math.max(0, n(paid));
    const totalOut = Math.max(0, goods + storage - paidNum);
    const goodsOut = Math.max(0, goods - paidNum);
    return {
      owing: totalOut - goodsOut,
      gross: storage,
      released: legacyReleased,
      source: "invoices",
    };
  }
  const legacy = Math.max(0, n(legacyOwing));
  return {
    owing: legacy,
    gross: legacy,
    released: legacyReleased,
    source: legacy > 0 ? "legacy" : "none",
  };
}

/** Σ live ISSUED storage-kind invoices (amount + tax) from a raw invoices
 *  select — the §2 storage obligation, spelled once for every feeder. */
export function invoiceStorageSumOf(
  invoices:
    | Array<{
        kind: string;
        status: string;
        amount: number | string;
        tax_amount: number | string;
        voided_at: string | null;
      }>
    | null
    | undefined,
): number {
  return (invoices ?? [])
    .filter((i) => i.kind !== "sales" && i.status === "issued" && !i.voided_at)
    .reduce((s, i) => s + n(i.amount) + n(i.tax_amount), 0);
}
