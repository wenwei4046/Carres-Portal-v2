import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import * as XLSX from "xlsx";
import { deliveryQueueLeads, myHolidaySet } from "@carres/shared";
import EmptyState from "@/components/kit/EmptyState";
import Select from "@/components/kit/Select";
import { SectionCard } from "@/components/SectionPanel";
import {
  useCatalog,
  useDeliveryArrangements,
  useDeliveryOrdersRegister,
  useDeliveryPartners,
  useOperationOrders,
  usePurchasingSettings,
} from "@/lib/queries";
import { appTodayIso, fmtDate, fmtMonth } from "@/lib/fmt-date";
import ModuleHeader from "./components/ModuleHeader";
import { buildDeliveryMonitorCards } from "./delivery-monitor";
import { useWarehouseInbound } from "./useWarehouseInbound";
import {
  DR,
  ageingBuckets,
  ageingRowsOf,
  cannotDeliverWord,
  commitmentLine,
  commitmentRowsOf,
  contactLine,
  contactResultGroups,
  contactRowsOf,
  contactsOverdueToday,
  doHref,
  failedReasonGroups,
  failedRowsOf,
  firstDeliveryLine,
  firstDeliveryRowsOf,
  firstVisitWord,
  partnerLine,
  partnerRowsOf,
  proofCounts,
  proofRowsOf,
  rateWord,
  registerRowsOf,
  reportMonthsOf,
  returnRowsOf,
  scheduleDaysOf,
  scheduleLine,
  warehouseLine,
  warehouseRowsOf,
} from "./delivery-report";

/**
 * Reports → Delivery (docs/delivery/MASTER.md §12 — 【DELIVERY】 CARD 17).
 *
 * The ten central listings, on the Payment/Receiving report grammar: it
 * stores nothing, every row is a door, every exclusion is stated on screen,
 * and a rate with too few records is withheld. The arithmetic lives in
 * `delivery-report.ts`; this file only reads, composes and exports.
 *
 * The month filter governs the DATED listings. Exception Ageing and the
 * overdue-contact count are TODAY's facts and say so.
 */

// design-standard: not-a-list-page — this is a REPORT (computed figures over
// the Monitor and Delivery Orders reads). It draws the Delivery destination
// header and its own sectioned body, never a Register.

function Head({ children, note }: { children: React.ReactNode; note: string }) {
  return (
    <div className="mb-2">
      <h2 className="text-strong">{children}</h2>
      <p className="text-label font-normal text-base-500">{note}</p>
    </div>
  );
}

function Row({ to, children, testId }: { to: string; children: React.ReactNode; testId?: string }) {
  return (
    <Link
      to={to}
      data-testid={testId}
      className="flex items-center justify-between gap-3 rounded-control border border-base-200 bg-white px-2 py-1.5 hover:bg-hovertint"
    >
      {children}
    </Link>
  );
}

function Empty({ children }: { children: string }) {
  return <p className="text-label font-normal text-base-400">{children}</p>;
}

function Counts({ items }: { items: Array<{ word: string; count: number }> }) {
  if (items.length === 0) return null;
  return <p className="text-body font-semibold mb-2">{items.map((i) => `${i.count} ${i.word}`).join(" · ")}</p>;
}

const INBOUND_RETURNS = new URLSearchParams({ sourceType: "failed-delivery-return" });

export default function OperationDeliveryReport() {
  const ordersQ = useOperationOrders();
  const partnersQ = useDeliveryPartners();
  const docsQ = useDeliveryOrdersRegister();
  const arrangementsQ = useDeliveryArrangements();
  const settingsQ = usePurchasingSettings();
  const catalogQ = useCatalog();
  /* Inbound's own arrivals for goods coming back from a failed visit (0490):
     the Warehouse's actual receipt, never the Logistics report. */
  const inboundQ = useWarehouseInbound(INBOUND_RETURNS);
  const today = appTodayIso();

  const partners = useMemo(() => partnersQ.data?.partners ?? [], [partnersQ.data]);
  const partnerNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of partners) m.set(p.id, p.name);
    return m;
  }, [partners]);
  const arrangements = useMemo(() => arrangementsQ.data?.arrangements ?? [], [arrangementsQ.data]);
  const arrangementsByScope = useMemo(() => {
    const m = new Map<string, (typeof arrangements)[number]>();
    for (const a of arrangements) m.set(`${a.order_id}#${a.leg}`, a);
    return m;
  }, [arrangements]);
  const contacts = useMemo(() => arrangementsQ.data?.contacts ?? [], [arrangementsQ.data]);
  const attempts = useMemo(() => docsQ.data?.attempts ?? [], [docsQ.data]);
  const handoverEvents = useMemo(() => docsQ.data?.handoverEvents ?? [], [docsQ.data]);
  const queueLeads = useMemo(() => (settingsQ.data ? deliveryQueueLeads(settingsQ.data) : undefined), [settingsQ.data]);
  const holidays = useMemo(() => myHolidaySet(), []);
  const addonNameByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of catalogQ.data?.addons ?? []) if (a.key && a.name) m.set(a.key, a.name);
    return m;
  }, [catalogQ.data]);

  /* The SAME Monitor cards Monitor draws — one arithmetic for today's facts. */
  const cards = useMemo(
    () =>
      buildDeliveryMonitorCards({
        orders: ordersQ.data?.orders ?? [],
        deliveryOrders: docsQ.data?.deliveryOrders ?? [],
        attempts,
        contacts,
        handoverEvents,
        proofReviews: docsQ.data?.proofReviews ?? [],
        attemptEvidence: docsQ.data?.attemptEvidence ?? [],
        partnerNameById,
        arrangements: arrangementsByScope,
        queueLeads,
        holidays,
        addonNameByKey,
        todayIso: today,
      }),
    [ordersQ.data, docsQ.data, attempts, contacts, handoverEvents, partnerNameById, arrangementsByScope, queueLeads, holidays, addonNameByKey, today],
  );
  /* The SAME register rows the Delivery Orders register prints. */
  const rows = useMemo(
    () =>
      registerRowsOf({
        deliveryOrders: docsQ.data?.deliveryOrders ?? [],
        attempts,
        handoverEvents,
        proofReviews: docsQ.data?.proofReviews,
        attemptEvidence: docsQ.data?.attemptEvidence,
      }),
    [docsQ.data, attempts, handoverEvents],
  );

  const months = useMemo(
    () => reportMonthsOf({ attempts, contacts, arrangements, handoverEvents, cannotDeliver: arrangementsQ.data?.cannotDeliver }),
    [attempts, contacts, arrangements, handoverEvents, arrangementsQ.data],
  );
  const [pickedMonth, setPickedMonth] = useState<string | null>(null);
  const month = pickedMonth && months.includes(pickedMonth) ? pickedMonth : months[0] ?? null;
  const m = month ?? "0000-00";

  const commitment = useMemo(() => commitmentRowsOf(rows, attempts, m), [rows, attempts, m]);
  const firstVisits = useMemo(() => firstDeliveryRowsOf(rows, attempts, m), [rows, attempts, m]);
  const failed = useMemo(() => failedRowsOf(rows, attempts, m), [rows, attempts, m]);
  const partnerRows = useMemo(
    () => partnerRowsOf({ rows, attempts, cannotDeliver: arrangementsQ.data?.cannotDeliver, partners, month: m }),
    [rows, attempts, arrangementsQ.data, partners, m],
  );
  const cannotDeliverRows = useMemo(
    () => (arrangementsQ.data?.cannotDeliver ?? []).filter((e) => e.recorded_at.slice(0, 7) === m),
    [arrangementsQ.data, m],
  );
  const warehouse = useMemo(() => warehouseRowsOf(rows, handoverEvents, m), [rows, handoverEvents, m]);
  const proof = useMemo(() => proofRowsOf(rows, attempts, m), [rows, attempts, m]);
  const schedule = useMemo(() => scheduleDaysOf(arrangements, partnerNameById, m), [arrangements, partnerNameById, m]);
  const contactRows = useMemo(
    () => contactRowsOf({ contacts, rows, cards, partnerNameById, month: m }),
    [contacts, rows, cards, partnerNameById, m],
  );
  const arrivals = inboundQ.isError ? null : inboundQ.data?.arrivals ?? [];
  const returns = useMemo(() => returnRowsOf({ rows, attempts, arrivals, month: m }), [rows, attempts, arrivals, m]);
  const ageing = useMemo(() => ageingRowsOf(cards, attempts, today), [cards, attempts, today]);
  const overdueContacts = contactsOverdueToday(cards);
  const noRequested = commitment.filter((r) => r.kept === null).length;
  const untimedHandovers = warehouse.filter((r) => r.byDeliveryDay === null).length;

  const soWord = (r: { so: number; customer: string }) => `SO-${r.so} · ${r.customer}`;

  /* §12 read-only EXPORT — the same figures the listings print, one sheet
     per listing, computed at export time from the same reads. */
  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const add = (name: string, sheetRows: Record<string, unknown>[]) =>
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheetRows), name);
    add("Commitment", commitment.map((r) => ({
      "DO No": r.row.doNumber, SO: `SO-${r.row.so}`, Customer: r.row.customer,
      "Requested Delivery Date": r.row.requestedTbd ? "" : r.row.requestedDelivery ?? "",
      "Delivered on": r.deliveredOn,
      Result: r.kept === null ? DR.noRequestedDate : r.kept ? DR.keptRequestedDate : DR.afterRequestedDate })));
    add("First delivery", firstVisits.map((r) => ({
      "DO No": r.row.doNumber, SO: `SO-${r.row.so}`, Customer: r.row.customer,
      "First visit": r.first.recorded_at.slice(0, 10), Result: firstVisitWord(r.first.result) })));
    add("Failed delivery", failed.map((r) => ({
      "DO No": r.row.doNumber, SO: `SO-${r.row.so}`, Customer: r.row.customer,
      Logistics: r.row.logisticsPartner ?? "", "Failed on": r.attempt.recorded_at.slice(0, 10),
      Reason: r.reason, Category: r.category ?? "" })));
    add("Partners", partnerRows.map((r) => ({
      Logistics: r.name, Trips: r.trips, Delivered: r.delivered, "Partly delivered": r.partial,
      Failed: r.failed, "Cannot Deliver": r.cannotDeliver ?? DR.notAvailable })));
    add("Warehouse", warehouse.map((r) => ({
      "DO No": r.row.doNumber, "Confirmed Delivery": r.row.confirmedDelivery ?? "",
      Ready: r.readyAt?.slice(0, 10) ?? "", "Handed over": r.handedOverAt?.slice(0, 10) ?? "",
      "Received by logistics": r.receivedAt?.slice(0, 10) ?? "",
      Result: r.byDeliveryDay === null ? "" : r.byDeliveryDay ? DR.handedOverByDeliveryDay : DR.handedOverAfterDeliveryDay })));
    add("Proof", proof.map((r) => ({
      "DO No": r.row.doNumber, SO: `SO-${r.row.so}`, "Delivered on": r.reachedOn,
      Proof: r.word, Missing: r.missing.join(" · ") })));
    add("Schedule", schedule.map((d) => ({
      Day: d.day, Deliveries: d.total, Booked: d.booked,
      Logistics: d.byPartner.map((p) => `${p.name} ${p.count}`).join(" · ") })));
    add("Contacts", contactRows.map((r) => ({
      SO: r.scopeWord, "Contacted on": r.contact.contacted_at.slice(0, 10), Purpose: r.purpose,
      Result: r.result, "On behalf of": r.onBehalfOf ?? "" })));
    add("Returns", returns.map((r) => ({
      "DO No": r.row.doNumber, "Failed on": r.attempt.recorded_at.slice(0, 10),
      "Where the goods are": r.whereGoods, Inbound: r.inbound })));
    add("Exceptions", ageing.map((r) => ({
      SO: `SO-${r.card.scope.so}`, Customer: r.card.customerName, "DO No": r.card.doNumber ?? "",
      Exception: r.kind, Since: r.sinceIso, Days: r.days })));
    XLSX.writeFile(wb, `Delivery report ${month ?? "all"}.xlsx`);
  };

  const failedRead = ordersQ.isError || docsQ.isError || arrangementsQ.isError || partnersQ.isError;
  const loading = ordersQ.isLoading || docsQ.isLoading || arrangementsQ.isLoading || partnersQ.isLoading;

  return (
    <div className="flex h-full min-h-0 flex-col bg-kit-canvas" data-testid="delivery-report">
      <ModuleHeader testId="delivery-report-destination-header" word={DR.page} docTitle={DR.docTitle} destinationHeader />
      {failedRead ? (
        <div className="p-6" data-testid="delivery-report-error">
          <EmptyState title={DR.failed} detail={DR.tryAgain} />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1100px] p-6">
            <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-label uppercase tracking-[0.12em] text-base-500">{DR.eyebrow}</div>
                <h1 className="text-xl font-semibold">{DR.page}</h1>
              </div>
              <div className="flex items-end gap-2">
                <button className="btn-secondary" onClick={exportExcel} disabled={loading} data-testid="report-export">
                  {DR.exportExcel}
                </button>
                <div className="w-[180px]">
                  <Select
                    id="delivery-report-month"
                    label={DR.month}
                    value={month ?? undefined}
                    onValueChange={setPickedMonth}
                    disabled={months.length === 0}
                    placeholder={DR.noMonth}
                    options={months.map((mm) => ({ value: mm, label: fmtMonth(mm) }))}
                  />
                </div>
              </div>
            </header>

            {loading ? (
              <p className="text-body text-base-500">{DR.loading}</p>
            ) : (
              <div className="space-y-4">
                {/* 1 · Delivery Commitment Performance */}
                <SectionCard>
                  <div className="p-3" data-testid="report-commitment">
                    <Head note={`Source: the latest result that reached the customer, against the Sales Order's Requested Delivery Date. Month: the day the result was recorded. Journey legs before the last are warehouse trips and are excluded.${noRequested > 0 ? ` ${noRequested} with no requested date ${noRequested === 1 ? "is" : "are"} listed but not counted.` : ""}`}>
                      {DR.commitment}
                    </Head>
                    <p className="text-body font-semibold mb-2">{commitmentLine(commitment)}</p>
                    <div className="space-y-1">
                      {commitment.map((r) => (
                        <Row key={r.row.id} to={doHref(r.row)}>
                          <span className="min-w-0">
                            <span className="block text-body font-semibold">{r.row.doNumber} · {soWord(r.row)}</span>
                            <span className="block text-label font-normal">
                              Requested {r.row.requestedTbd || !r.row.requestedDelivery ? "not stated" : fmtDate(r.row.requestedDelivery)} · Delivered {fmtDate(r.deliveredOn)}
                            </span>
                          </span>
                          <span className={`shrink-0 text-body font-semibold ${r.kept === false ? "text-red-600" : r.kept ? "text-green-600" : ""}`}>
                            {r.kept === null ? DR.noRequestedDate : r.kept ? DR.keptRequestedDate : DR.afterRequestedDate}
                          </span>
                        </Row>
                      ))}
                      {commitment.length === 0 && <Empty>{DR.emptyCommitment}</Empty>}
                    </div>
                  </div>
                </SectionCard>

                {/* 2 · First Delivery Success */}
                <SectionCard>
                  <div className="p-3" data-testid="report-first-delivery">
                    <Head note="Source: each Delivery Order's FIRST recorded visit — actual delivery events only, never a plan. Month: the day of that first visit. Journey legs before the last are excluded.">
                      {DR.firstDelivery}
                    </Head>
                    <p className="text-body font-semibold mb-2">{firstDeliveryLine(firstVisits)}</p>
                    <div className="space-y-1">
                      {firstVisits.map((r) => (
                        <Row key={r.row.id} to={doHref(r.row)}>
                          <span className="min-w-0">
                            <span className="block text-body font-semibold">{r.row.doNumber} · {soWord(r.row)}</span>
                            <span className="block text-label font-normal">{fmtDate(r.first.recorded_at)} · {r.row.logisticsPartner ?? DR.noLogisticsNamed}</span>
                          </span>
                          <span className={`shrink-0 text-body font-semibold ${r.first.result === "failed" ? "text-red-600" : r.first.result === "delivered" ? "text-green-600" : "text-orange-600"}`}>
                            {firstVisitWord(r.first.result)}
                          </span>
                        </Row>
                      ))}
                      {firstVisits.length === 0 && <Empty>{DR.emptyFirst}</Empty>}
                    </div>
                  </div>
                </SectionCard>

                {/* 3 · Failed Delivery Analysis */}
                <SectionCard>
                  <div className="p-3" data-testid="report-failed">
                    <Head note="Source: every failed visit with the OBSERVED reason the driver gave. Month: the day it failed. The reviewed root cause is a Service Case matter and stays apart from this listing.">
                      {DR.failedAnalysis}
                    </Head>
                    <Counts items={failedReasonGroups(failed).map((g) => ({ word: g.category ? `${g.reason} (${g.category})` : g.reason, count: g.count }))} />
                    <div className="space-y-1">
                      {failed.map((r) => (
                        <Row key={`${r.row.id}-${r.attempt.recorded_at}`} to={doHref(r.row)}>
                          <span className="min-w-0">
                            <span className="block text-body font-semibold">{r.row.doNumber} · {soWord(r.row)}</span>
                            <span className="block text-label font-normal">{fmtDate(r.attempt.recorded_at)} · {r.row.logisticsPartner ?? DR.noLogisticsNamed}</span>
                          </span>
                          <span className="shrink-0 text-body font-semibold text-red-600">{r.reason}</span>
                        </Row>
                      ))}
                      {failed.length === 0 && <Empty>{DR.emptyFailed}</Empty>}
                    </div>
                  </div>
                </SectionCard>

                {/* 4 · Logistics Partner Performance */}
                <SectionCard>
                  <div className="p-3" data-testid="report-partners">
                    <Head note="Source: customer-leg results by the partner named on the Delivery Order, and the partner's own Cannot Deliver records. Month: the day each was recorded. Journey legs before the last are warehouse trips and are excluded. NETS has no acceptance-speed measure — NETS is responsible without Accept. Warehouse work is measured apart, even when both are NETS.">
                      {DR.partners}
                    </Head>
                    <div className="space-y-1">
                      {partnerRows.map((r) => (
                        <Row key={r.name} to={r.href}>
                          <span className="min-w-0">
                            <span className="block text-body font-semibold">{r.name}</span>
                            <span className="block text-label font-normal">{partnerLine(r)}</span>
                          </span>
                          <span className="shrink-0 text-body font-semibold">{`Delivered ${rateWord(r.delivered, r.trips)}`}</span>
                        </Row>
                      ))}
                      {partnerRows.length === 0 && <Empty>{DR.emptyPartners}</Empty>}
                      {cannotDeliverRows.map((e) => (
                        <div key={e.id} className="rounded-control border border-base-200 bg-white px-2 py-1.5">
                          <span className="block text-body font-semibold">{DR.cannotDeliver} · {(e.partner_id && partnerNameById.get(e.partner_id)) || DR.noLogisticsNamed}</span>
                          <span className="block text-label font-normal">{fmtDate(e.recorded_at)} · {cannotDeliverWord(e)}{e.note ? ` · ${e.note}` : ""}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </SectionCard>

                {/* 5 · Warehouse Performance */}
                <SectionCard>
                  <div className="p-3" data-testid="report-warehouse">
                    <Head note={`Source: the handover chain — Ready · Handed over · Received by logistics — against the trip's confirmed delivery day. Month: the day of the handover. Warehouse is measured apart from Logistics.${untimedHandovers > 0 ? ` ${untimedHandovers} with no confirmed delivery day ${untimedHandovers === 1 ? "is" : "are"} listed but not counted.` : ""}`}>
                      {DR.warehouse}
                    </Head>
                    <p className="text-body font-semibold mb-2">{warehouseLine(warehouse)}</p>
                    <div className="space-y-1">
                      {warehouse.map((r) => (
                        <Row key={r.row.id} to={doHref(r.row)}>
                          <span className="min-w-0">
                            <span className="block text-body font-semibold">{r.row.doNumber} · {soWord(r.row)}</span>
                            <span className="block text-label font-normal">
                              Ready {r.readyAt ? fmtDate(r.readyAt) : "not recorded"} · Handed over {r.handedOverAt ? fmtDate(r.handedOverAt) : "not recorded"} · Received by logistics {r.receivedAt ? fmtDate(r.receivedAt) : "not recorded"}
                            </span>
                          </span>
                          <span className={`shrink-0 text-body font-semibold ${r.byDeliveryDay === false ? "text-red-600" : r.byDeliveryDay ? "text-green-600" : ""}`}>
                            {r.byDeliveryDay === null ? "" : r.byDeliveryDay ? DR.handedOverByDeliveryDay : DR.handedOverAfterDeliveryDay}
                          </span>
                        </Row>
                      ))}
                      {warehouse.length === 0 && <Empty>{DR.emptyWarehouse}</Empty>}
                    </div>
                  </div>
                </SectionCard>

                {/* 6 · Delivery Proof Control */}
                <SectionCard>
                  <div className="p-3" data-testid="report-proof">
                    <Head note="Source: every result that reached the customer, with the Delivery Orders register's own proof and review state. Month: the day the result was recorded. A newer upload reopens the review.">
                      {DR.proof}
                    </Head>
                    <Counts items={proofCounts(proof)} />
                    <div className="space-y-1">
                      {proof.map((r) => (
                        <Row key={r.row.id} to={doHref(r.row)}>
                          <span className="min-w-0">
                            <span className="block text-body font-semibold">{r.row.doNumber} · {soWord(r.row)}</span>
                            <span className="block text-label font-normal">
                              Delivered {fmtDate(r.reachedOn)}{r.missing.length > 0 ? ` · ${r.missing.join(" · ")}` : ""}{r.row.proofReview.reason ? ` · ${r.row.proofReview.reason}` : ""}
                            </span>
                          </span>
                          <span className={`shrink-0 text-body font-semibold ${r.word === "Proof Accepted" ? "text-green-600" : r.word === "Proof Rejected" ? "text-red-600" : "text-orange-600"}`}>
                            {r.word}
                          </span>
                        </Row>
                      ))}
                      {proof.length === 0 && <Empty>{DR.emptyProof}</Empty>}
                    </div>
                  </div>
                </SectionCard>

                {/* 7 · Schedule and Capacity */}
                <SectionCard>
                  <div className="p-3" data-testid="report-schedule">
                    <Head note="Source: Delivery's own arrangements with a confirmed day, whatever happened later. Month: the confirmed day. Booked means a day AND a time were agreed.">
                      {DR.schedule}
                    </Head>
                    <p className="text-body font-semibold mb-2">{scheduleLine(schedule)}</p>
                    <div className="space-y-1">
                      {schedule.map((d) => (
                        <Row key={d.day} to={d.href}>
                          <span className="min-w-0">
                            <span className="block text-body font-semibold">{fmtDate(d.day)}</span>
                            <span className="block text-label font-normal">{d.byPartner.map((p) => `${p.name} ${p.count}`).join(" · ")}</span>
                          </span>
                          <span className="shrink-0 text-body font-semibold tabular-nums">{d.total} deliver{d.total === 1 ? "y" : "ies"} · {d.booked} booked</span>
                        </Row>
                      ))}
                      {schedule.length === 0 && <Empty>{DR.emptySchedule}</Empty>}
                    </div>
                  </div>
                </SectionCard>

                {/* 8 · Customer Contact Performance */}
                <SectionCard>
                  <div className="p-3" data-testid="report-contacts">
                    <Head note={`Source: every contact record — the customer or the partner, by Operation or recorded on a partner's behalf. Month: the day of the contact. Today's fact: ${overdueContacts} ${DR.contactsOverdueToday.toLowerCase()} on Monitor.`}>
                      {DR.contacts}
                    </Head>
                    <p className="text-body font-semibold mb-2">{contactLine(contactRows)}</p>
                    <Counts items={contactResultGroups(contactRows).map((g) => ({ word: g.result, count: g.count }))} />
                    <div className="space-y-1">
                      {overdueContacts > 0 && (
                        <Row to="/operation?tab=delivery&view=no_confirmed_date&late=1" testId="report-contacts-overdue">
                          <span className="block text-body font-semibold">{DR.contactsOverdueToday}</span>
                          <span className="shrink-0 text-body font-semibold text-red-600 tabular-nums">{overdueContacts}</span>
                        </Row>
                      )}
                      {contactRows.map((r) => (
                        <Row key={r.contact.id} to={r.href}>
                          <span className="min-w-0">
                            <span className="block text-body font-semibold">{r.scopeWord}</span>
                            <span className="block text-label font-normal">
                              {fmtDate(r.contact.contacted_at)} · {r.purpose} · {r.result}{r.onBehalfOf ? ` · ${DR.recordedOnBehalfOf} ${r.onBehalfOf}` : ""}
                            </span>
                          </span>
                        </Row>
                      ))}
                      {contactRows.length === 0 && <Empty>{DR.emptyContacts}</Empty>}
                    </div>
                  </div>
                </SectionCard>

                {/* 9 · Return-to-Warehouse Control */}
                <SectionCard>
                  <div className="p-3" data-testid="report-returns">
                    <Head note={`Source: every visit that did not leave the goods with the customer, joined to Inbound's own arrival for that Delivery Order. Month: the day of the visit. A Logistics report never substitutes for the Warehouse's actual receipt.${arrivals === null ? ` ${DR.inboundNotAvailable}.` : ""}`}>
                      {DR.returns}
                    </Head>
                    <div className="space-y-1">
                      {returns.map((r) => (
                        <Row key={`${r.row.id}-${r.attempt.recorded_at}`} to={r.href}>
                          <span className="min-w-0">
                            <span className="block text-body font-semibold">{r.row.doNumber} · {soWord(r.row)}</span>
                            <span className="block text-label font-normal">{fmtDate(r.attempt.recorded_at)} · {r.whereGoods}</span>
                          </span>
                          <span className={`shrink-0 text-body font-semibold ${r.inbound.startsWith(DR.receivedAtInbound) ? "text-green-600" : "text-orange-600"}`}>{r.inbound}</span>
                        </Row>
                      ))}
                      {returns.length === 0 && <Empty>{DR.emptyReturns}</Empty>}
                    </div>
                  </div>
                </SectionCard>

                {/* 10 · Exception Ageing */}
                <SectionCard>
                  <div className="p-3" data-testid="report-ageing">
                    <Head note="Today's facts — an exception has no month. The same three queues Monitor counts as Exceptions (Overdue · Failed Delivery · proof missing), aged from the day the fact became true.">
                      {DR.ageing}
                    </Head>
                    <Counts items={ageingBuckets(ageing).map((b) => ({ word: b.bucket, count: b.count }))} />
                    <div className="space-y-1">
                      {ageing.map((r) => (
                        <Row key={r.card.scopeId} to={r.href}>
                          <span className="min-w-0">
                            <span className="block text-body font-semibold">{r.card.doNumber ? `${r.card.doNumber} · ` : ""}SO-{r.card.scope.so} · {r.card.customerName}</span>
                            <span className="block text-label font-normal">{r.kind} since {fmtDate(r.sinceIso)} · {r.card.logisticsPartnerName ?? DR.noLogisticsNamed}</span>
                          </span>
                          <span className={`shrink-0 text-body font-semibold tabular-nums ${r.days > 7 ? "text-red-600" : "text-orange-600"}`}>{r.days} day{r.days === 1 ? "" : "s"}</span>
                        </Row>
                      ))}
                      {ageing.length === 0 && <Empty>{DR.emptyAgeing}</Empty>}
                    </div>
                  </div>
                </SectionCard>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
