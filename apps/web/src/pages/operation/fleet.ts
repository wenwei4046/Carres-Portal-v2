import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DeliveryZone, FleetCrew, FleetDayCrew, FleetLeave, FleetLorry, FleetStop, RateCard } from "@carres/shared/fleet";
import { apiFetch } from "@/lib/api";
import { DELIVERY_SETTINGS_QUERY_KEY } from "@/lib/queries";

/**
 * Carres' own lorries (migration 0724) — Weisiang's decision (Mr Lim,
 * WhatsApp 2026-10-22): Fleet Day, Run sheet, Live Map, Lorry Capacity and
 * Crew Leave, the Houzs way. Jess was not part of this decision. Words are in
 * COPY-STANDARD "Carres lorries words".
 */
export const FL = {
  fleetDay: "Fleet Day",
  liveMap: "Live Map",
  capacity: "Lorry Capacity",
  crewLeave: "Crew Leave",
  runSheet: "Run sheet",
  printRunSheets: "Print run sheets",
  day: "Day",
  month: "Month",
  lorry: "Lorry",
  lorryCapacity: "Capacity",
  driver: "Driver",
  helper: "Helper",
  noDriver: "No driver",
  noHelper: "No helper",
  stops: "Stops",
  revenue: "Revenue",
  crew: "Crew",
  proposed: "Proposed",
  confirmed: "Confirmed",
  confirmCrew: "Confirm crew",
  noLorryMatched: "No lorry matched",
  noLorryMatchedNote: "Delivery dates for Carres Lorries whose vehicle is not one of its plates.",
  lastSeen: "Last seen",
  position: "Position",
  openMap: "Open map",
  noPosition: "No position yet",
  oldPosition: "Over 30 minutes old",
  workingDays: "Working days",
  trips: "Trips",
  utilisation: "Utilisation",
  stopsPerTrip: "Stops per trip",
  revenuePerTrip: "Revenue per trip",
  from: "From",
  to: "To",
  reason: "Reason",
  role: "Role",
  addLeave: "Add leave",
  remove: "Remove",
  noOwnFleet: "Carres Lorries is not set up. Add its Vehicles and Drivers in Settings, Logistics.",
  noLorries: "Carres Lorries has no lorry yet. Add one in Settings, Logistics, Carres Lorries, Vehicles.",
  noLeave: "No crew leave recorded.",
  failed: "This page could not be loaded. Try again.",
  saveFailed: "Not saved. Try again.",
  /* 0725 — Fleet, Fleet Health, Delivery Zones, Rate Cards (Weisiang's decision 2026-10-22). */
  fleet: "Fleet",
  lorries: "Lorries",
  plate: "Plate",
  vehicleType: "Type",
  phone: "Phone",
  name: "Name",
  status: "Status",
  active: "Active",
  inactive: "Inactive",
  addLorry: "Add lorry",
  addCrew: "Add crew",
  save: "Save",
  edit: "Edit",
  cancel: "Cancel",
  deactivate: "Deactivate",
  activate: "Activate",
  noCrew: "Carres Lorries has no crew yet. Add a driver or helper.",
  fleetHealth: "Fleet Health",
  puspakom: "PUSPAKOM",
  roadTax: "Road tax",
  insurance: "Insurance",
  service: "Service",
  overdue: "Overdue",
  dueSoon: "Due soon",
  ok: "OK",
  notRecorded: "Not recorded",
  zones: "Delivery Zones",
  zone: "Zone",
  postcodes: "Postcode ranges",
  postcodesHint: "47, 46-47, 58200-58299",
  addZone: "Add zone",
  noZones: "No delivery zone yet.",
  findZone: "Which zone is this postcode?",
  postcode: "Postcode",
  noZone: "No zone",
  notInAddressList: "Not in the address list",
  rateCards: "Rate Cards",
  company: "Logistics company",
  everyOtherZone: "Every other zone",
  basis: "Per",
  perItem: "Item",
  perOrder: "Delivery order",
  firstUnit: "1st",
  secondUnit: "2nd",
  furtherUnit: "Each further",
  minCharge: "Minimum",
  addRate: "Add rate",
  noRates: "This Logistics company has no rate card yet.",
  rateCardCost: "Rate card cost",
  noRateCard: "No rate card for this Logistics company and zone",
  /* Houzs charge rules and reconciliation (Houzs DeliveryRateCards.tsx, Weisiang's ruling 2026-10-22). */
  overageCap: "Cap",
  overageEach: "Each over cap",
  sofaBands: "Sofa bands",
  sofaBandsHint: "1-3 50, 4+ 80",
  sofaBandsBad: "Write sofa bands as 1-3 50, 4-5 70, 6+ 90.",
  serviceCharge: "Service",
  pickupCharge: "Pickup",
  disposalCharge: "Disposal",
  reconciliation: "Reconciliation",
  doNo: "Delivery Order",
  date: "Date",
  bill: "Bill",
  items: "Items",
  sofas: "Sofas",
  billed: "Billed",
  expected: "Rate card cost",
  difference: "Difference",
  match: "Match",
  mismatch: "Mismatch",
  noCard: "No rate card",
  noBilled: "No delivery order on a Logistics bill in these dates.",
  reconNote: "Service, pickup and disposal are not counted from the goods.",
  reconRefused: "Only Finance or the people named for Delivery settings see delivery charges.",
  refusals: {
    on_leave: "This person is on leave that day.",
    already_crewed: "This person is already on another lorry that day.",
    not_a_driver: "Choose an active driver.",
    not_a_helper: "Choose an active helper.",
    not_own_lorry: "This lorry is not a Carres lorry.",
    /* a zone name or a company's rate card for that zone is already there (23505) */
    already_exists: "This is already saved. Edit the existing row instead.",
    zone_has_rates: "This zone still has rate cards. Remove them in Rate Cards first.",
  } as Record<string, string>,
} as const;

export interface FleetLorryHealth {
  puspakomDue: string | null;
  roadTaxDue: string | null;
  insuranceDue: string | null;
  serviceDue: string | null;
}

export interface FleetPayload {
  company: { id: string; name: string } | null;
  lorries: Array<FleetLorry & FleetLorryHealth & { templateDriverName: string | null; templateDriverPhone: string | null }>;
  crew: FleetCrew[];
  leave: FleetLeave[];
  crewDays: FleetDayCrew[];
  stops: FleetStop[];
  positions: Array<{ vehicleId: string; lat: number; lng: number; recordedAt: string; source: string }>;
}

export function useFleet(from: string, to: string = from) {
  return useQuery({
    queryKey: ["fleet", from, to],
    queryFn: () => apiFetch<FleetPayload>(`/api/operation/fleet?from=${from}&to=${to}`),
  });
}

/** One write helper: post or delete, then re-read every fleet view. */
export function useFleetWrite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ path, method = "POST", body }: { path: string; method?: "POST" | "DELETE"; body?: unknown }) =>
      apiFetch(`/api/operation/fleet${path}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fleet"] }),
  });
}

/** The refusal's own sentence when the door named it, else the plain retry line. */
export function refusalOf(error: unknown): string {
  const code = (error as { code?: string; body?: { code?: string } } | null)?.body?.code
    ?? (error as { code?: string } | null)?.code;
  return (code && FL.refusals[code]) || FL.saveFailed;
}

/** A plain map link: no API key, opens the phone's or browser's own map. */
export const mapHref = (lat: number, lng: number) => `https://www.google.com/maps?q=${lat},${lng}`;

export const monthRange = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
};

/* ── 0725 · Delivery Zones and Rate Cards (Weisiang's decision 2026-10-22) ── */
export interface PricingPayload {
  companies: Array<{ id: string; name: string; ownFleet: boolean; active: boolean }>;
  zones: DeliveryZone[];
  rates: RateCard[];
}

export function usePricing() {
  return useQuery({ queryKey: ["fleet", "pricing"], queryFn: () => apiFetch<PricingPayload>("/api/operation/fleet/pricing") });
}

export interface ReconcileRow {
  doId: string; doNo: string; deliveryDate: string | null; partnerId: string; company: string; bills: string[];
  zone: string | null; items: number; sofas: number; billed: number; expected: number | null;
  lines: Array<{ kind: string; label: string; amount: number }>; difference: number | null; factsComplete: boolean;
}

export function useReconcile(range: { from: string; to: string }) {
  const qs = new URLSearchParams(Object.entries(range).filter(([, v]) => v)).toString();
  return useQuery({
    queryKey: ["fleet", "reconcile", range],
    queryFn: () => apiFetch<{ rows: ReconcileRow[] }>(`/api/operation/fleet/reconcile${qs ? `?${qs}` : ""}`),
  });
}

/** Lorry and crew rows are saved through Settings → Logistics' own doors, so both views re-read. */
export function useSettingsWrite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ path, body }: { path: string; body: unknown }) =>
      apiFetch(`/api/operation/delivery-settings${path}`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fleet"] });
      qc.invalidateQueries({ queryKey: DELIVERY_SETTINGS_QUERY_KEY });
    },
  });
}
