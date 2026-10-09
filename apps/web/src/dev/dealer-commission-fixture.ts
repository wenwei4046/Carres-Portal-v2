/**
 * DEV ONLY — one made-up dealer's commission for the previews of the dealer
 * statement (Finance's Statement view and the store's own Commission page,
 * step 3, 0664). Names are invented; fixture evidence is not production
 * evidence.
 *
 * Two months ago SO-2101 earned RM337.50, paid by PV-000123 on the 15th of
 * last month. Last month SO-2101's balance, SO-2107 and SO-2109 earned
 * RM1,262.50; this month SO-2118 has earned RM650 so far and SO-2109 was
 * cancelled. Carres owes RM1,912.50; RM900 is still to come.
 */
import type { DcOrder, DcPaymentChoice, DcSource, DcStatementSource } from "@carres/shared/dealer-commission";
import { appTodayIso } from "@/lib/fmt-date";

const TODAY = appTodayIso();
const monthsBack = (n: number) => {
  const [y, m] = TODAY.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 - n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const M0 = monthsBack(0);
const M1 = monthsBack(1);
const M2 = monthsBack(2);

export const DEALER = { id: "d-example", name: "Example Furniture Gallery Sdn Bhd" };
const OTHER = { id: "d-sample", name: "Sample Home Living" };

const line = (category: string, value: number, rate: number) => ({ modelId: null, category, value, rate, qty: 1 });
const order = (o: Partial<DcOrder> & Pick<DcOrder, "orderId" | "so">): DcOrder => ({
  dealerId: DEALER.id, outletId: "o-example", addons: 0, lines: [], payments: [], ...o,
});

export const ORDERS: DcOrder[] = [
  order({ orderId: "o2101", so: 2101, orderedOn: `${M2}-03`, customer: "LIM KUAN YANG",
    lines: [line("sofa", 3000, 25), line("service", 300, 0)],
    payments: [{ paidOn: `${M2}-05`, amount: 1650 }, { paidOn: `${M1}-07`, amount: 1650 }] }),
  order({ orderId: "o2107", so: 2107, orderedOn: `${M1}-12`, customer: "NURUL AIN BINTI ISMAIL",
    lines: [line("mattress", 4000, 25)], payments: [{ paidOn: `${M1}-14`, amount: 2400 }] }),
  order({ orderId: "o2109", so: 2109, orderedOn: `${M1}-20`, customer: "WONG MEI LING", cancelledOn: `${M0}-06`,
    lines: [line("sofa", 1800, 25)], payments: [{ paidOn: `${M1}-21`, amount: 1000 }] }),
  order({ orderId: "o2115", so: 2115, orderedOn: `${M0}-02`, customer: "TAN SRI DATO' SERI MUHAMMAD HAFIZUDDIN BIN ABDUL RAHMAN",
    lines: [line("bedframe", 2000, 25)], payments: [{ paidOn: `${M0}-03`, amount: 800 }] }),
  order({ orderId: "o2118", so: 2118, orderedOn: `${M0}-04`, customer: "SITI AMINAH",
    lines: [line("mattress", 2600, 25)], payments: [{ paidOn: `${M0}-05`, amount: 2600 }] }),
];

export const STATEMENT: DcStatementSource = {
  today: TODAY,
  dealer: DEALER,
  orders: ORDERS,
  quotas: [],
  payments: [{ id: "pay-123", voucherId: "pv-123", voucherNo: "PV-000123", paidOn: `${M1}-15`, amount: 337.5 }],
};

/** The month's report read: orders placed before the month's end, as the database gives them. */
export function source(month: string): DcSource {
  const [y, m] = month.split("-").map(Number);
  const next = new Date(Date.UTC(y!, m!, 1)).toISOString().slice(0, 10);
  const before = (d: string) => d < next;
  return {
    settings: { defaultRate: 25 }, rates: [], quotas: [], models: [],
    dealers: [DEALER, OTHER],
    outlets: [{ id: "o-example", name: "Example Gallery Kota Damansara", dealerId: DEALER.id }],
    orders: ORDERS.filter((o) => before(o.orderedOn ?? "")).map((o) => ({
      ...o,
      payments: (o.payments ?? []).filter((p) => before(p.paidOn)),
      cancelledOn: o.cancelledOn && before(o.cancelledOn) ? o.cancelledOn : null,
    })),
  };
}

export const PAYMENT_CHOICES: DcPaymentChoice[] = [
  { id: "pv-130", voucherNo: "PV-000130", voucherDate: `${M0}-08`, payee: DEALER.name, amount: 1262.5, narration: "Commission last month" },
  { id: "pv-128", voucherNo: "PV-000128", voucherDate: `${M0}-06`, payee: "Office rent", amount: 4500, narration: null },
];
