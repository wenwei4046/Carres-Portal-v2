/**
 * storageObligation — ONE storage figure for the Work engine and the Delivery
 * money gate (payment/MASTER.md §2 · §7 · the 2026-09-07 gate-convergence
 * slice), so the gate and Payment's own readers cannot disagree.
 *
 * TWO SOURCES EXIST TODAY, and this composer is their one precedence law.
 *
 * ⛔ PRECEDENCE IS KEYED ON THE ORDER BEING UNDER THE INVOICE MODEL, NOT ON A
 * LIVE PAPER EXISTING RIGHT NOW (2026-09-08 boundary review). The first shape
 * of this rule asked `invoiceStorageSum > 0`, and it had two defects the
 * review named and these tests now pin:
 *
 *   (a) VOIDING THE LAST PAPER RESURRECTED THE OLD C9 CHARGE. A void is the
 *       §12 waiver/correction path; falling back to the legacy figure made a
 *       waived obligation come back from the dead.
 *   (b) A MIXED ORDER HID MONEY. One product group invoiced while another
 *       still sat in the legacy columns meant the papers silently spoke for
 *       the whole order and the un-cased group's fee vanished.
 *
 *   INVOICE-BACKED (0436/0438) — the SO has storage-paper HISTORY (any
 *     storage-kind invoice ever, voided ones included). That order is under
 *     the invoice model: its storage obligation is the LIVE ISSUED papers,
 *     and zero live papers means ZERO — never a fallback to C9.
 *
 *   LEGACY C9 (`storageHold` over ops_order_control) — an order with NO
 *     storage-paper history keeps the shipped 2026-07-27 ruling, byte for
 *     byte: `collected_at` clears it, the override ladder holds, the
 *     date-walked accrual is untouched.
 *
 *   MIXED (both) — the two models cannot be reconciled by arithmetic: the
 *     legacy columns are ONE per-order figure with no group breakdown, so
 *     nothing can say whether a keyed fee is the same debt as a paper or a
 *     different group's. This composer therefore does NOT guess. The invoice
 *     model DECIDES the money — the waiver ruling is explicit, and (a) forces
 *     the zero-paper and one-paper answers to agree — while the legacy figure
 *     is carried out as `unreconciledLegacy`: said on screen, raised as work
 *     to resolve, never merged into a paper figure and never silently
 *     dropped. It does not invent a second delivery hold. The state is also
 *     made unbirthable going forward: `payment_storage_start` refuses to open
 *     a case while an uncollected legacy fee stands (0442). ⛔ WHETHER AN
 *     UNRECONCILED LEGACY FEE SHOULD ALSO HOLD THE DELIVERY IS AN OWNER
 *     DECISION, recorded as open in payment/MASTER.md — today it is work, not
 *     a hold.
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
  /** The SO has storage-paper HISTORY — any storage-kind invoice ever, a
   *  voided one included. THIS, not a live sum, decides the model: a waived
   *  (voided) paper must never fall back to the legacy charge. */
  storagePaperHistory: boolean;
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
  source: "invoices" | "legacy" | "mixed" | "none";
  /** A legacy C9 fee standing on an order that is ALSO under the invoice
   *  model — carried, never dropped, never merged into the paper figure.
   *  Zero on every ordinary order. A screen showing this says so. */
  unreconciledLegacy: number;
}

function n(v: number | string | null | undefined): number {
  if (v == null || v === "") return 0;
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export function storageObligation({
  invoiceStorageSum,
  storagePaperHistory,
  goodsTotal,
  paid,
  legacyOwing,
  legacyReleased,
}: StorageObligationInput): StorageObligationResult {
  const storage = Math.max(0, n(invoiceStorageSum));
  const legacy = Math.max(0, n(legacyOwing));

  if (!storagePaperHistory) {
    // Never brought into the invoice model — the shipped C9 answer, untouched.
    return {
      owing: legacy,
      gross: legacy,
      released: legacyReleased,
      source: legacy > 0 ? "legacy" : "none",
      unreconciledLegacy: 0,
    };
  }

  // Under the invoice model. The papers net against `orders.paid` ONCE: goods
  // are covered first, the remainder of the payment falls on storage.
  const goods = Math.max(0, n(goodsTotal));
  const paidNum = Math.max(0, n(paid));
  const nettedStorage =
    Math.max(0, goods + storage - paidNum) - Math.max(0, goods - paidNum);

  if (legacy === 0) {
    return {
      owing: nettedStorage,
      gross: storage,
      released: legacyReleased,
      source: "invoices",
      unreconciledLegacy: 0,
    };
  }
  // MIXED — the invoice model DECIDES the money (the waiver ruling is
  // explicit: a voided paper must not resurrect an old charge, and that must
  // read the same whether zero or one paper survives). The legacy figure is
  // neither merged nor dropped: it is carried out as `unreconciledLegacy`,
  // said on screen, and raised as WORK to resolve. It does not invent a
  // second delivery hold.
  return {
    owing: nettedStorage,
    gross: storage,
    released: legacyReleased,
    source: "mixed",
    unreconciledLegacy: legacy,
  };
}

/** Does this order have storage-paper HISTORY — any storage-kind invoice
 *  ever, voided ones included? The model switch, spelled once for every
 *  feeder: an order with history is under the invoice model forever, so a
 *  waived (voided) paper can never fall back to the legacy charge. */
export function hasStoragePaperHistory(
  invoices: Array<{ kind: string }> | null | undefined,
): boolean {
  return (invoices ?? []).some((i) => i.kind !== "sales");
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
