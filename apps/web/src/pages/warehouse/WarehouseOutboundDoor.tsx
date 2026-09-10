// design-standard: not-a-list-page — the external Warehouse role's minimum
// responsive customer-DO handover door (Warehouse Card 03 §9/§13).
import { useMemo } from "react";
import {
  warehouseOutboundCards,
  type DeliveryWarehouseScheduleEvent,
} from "@carres/shared";
import { useDeliveryWarehouseSchedule } from "@/lib/queries";
import { fmtDate } from "@/lib/fmt-date";
import PageHeader from "@/components/PageHeader";
import { OutboundUnitWork } from "@/pages/operation/WarehouseOutboundWork";

/**
 * WAREHOUSE (external role) — Outbound handover door.
 *
 * The same feed, the same card arithmetic and the SAME governed act doors as
 * the internal Outbound page (Law C: one door, never a duplicate writer).
 * The server already narrows the feed to this login's bound Site and refuses
 * any act on another Site's Units; nothing here is a second boundary. No
 * price, payment, Delivery Result or customer proof exists on this surface.
 */
export default function WarehouseOutboundDoor() {
  const { data, isLoading, error } = useDeliveryWarehouseSchedule();
  const events = useMemo(
    () => (data?.events ?? []) as DeliveryWarehouseScheduleEvent[],
    [data],
  );
  const cards = useMemo(() => warehouseOutboundCards(events), [events]);
  const dates = [...new Set(cards.map((c) => c.eventDate))].sort();

  return (
    <div className="px-4 py-6 sm:px-9 sm:py-8 pb-14" data-testid="warehouse-outbound-door">
      <PageHeader kicker="Warehouse" title="Outbound" className="mb-3" />
      <div className="text-body text-base-600 mb-[18px]">
        Goods scheduled for pickup from this warehouse. Scan, check and pack
        each Unit, then record which exact Units were loaded and attach proof.
      </div>
      {isLoading ? (
        <p className="text-body text-base-500">Loading…</p>
      ) : error ? (
        <p className="text-body text-base-600">
          The schedule could not be loaded. {error.message}
        </p>
      ) : dates.length === 0 ? (
        <p className="text-body text-base-500" data-testid="wod-empty">
          No pickups are assigned to this warehouse.
        </p>
      ) : (
        dates.map((date) => (
          <section key={date} className="mb-5">
            <h2 className="mb-2 text-label font-semibold uppercase tracking-wide text-base-600">
              {fmtDate(date)}
            </h2>
            {cards
              .filter((c) => c.eventDate === date)
              .map((card) => (
                <div
                  key={card.doNumber}
                  className="mb-3 rounded border border-base-200 bg-white"
                  data-testid={`wod-card-${card.doNumber}`}
                >
                  <div className="border-b border-base-200 px-3 py-2 text-[13px]">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                      <span className="font-mono font-semibold text-base-800">
                        {card.doNumber}
                      </span>
                      <span className="text-base-600">{card.logisticsPartner}</span>
                      <span className="text-base-500">
                        {card.fromLocation} → {card.toCustomer}
                      </span>
                    </div>
                    <div className="mt-0.5 text-base-700" data-testid="wod-tally">
                      Required {card.unitsRequired} · Loaded {card.handedOver} · Not
                      loaded {card.notHandedOver}
                    </div>
                  </div>
                  <OutboundUnitWork card={card} />
                </div>
              ))}
          </section>
        ))
      )}
    </div>
  );
}
