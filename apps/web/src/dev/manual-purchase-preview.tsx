/**
 * MANUAL PURCHASE · PERMANENT REGISTER PREVIEW — DEV ONLY (Card 04).
 *
 * The REAL `OperationManualPurchase`, the REAL stylesheet; only the
 * register read is seeded (window.fetch answers the page's own API paths),
 * because the live screen is behind a login and live data cannot be made
 * to hold every column state at once: new null `req_no` beside stored
 * legacy REQ-/MPR- values (kept in the database, never displayed — Card
 * 08), all four Approval facts, `—` / one clickable PO / `2 POs`,
 * every structured For, one item and `+ n more`, one supplier and
 * `2 suppliers`, and a selectable Ready-to-order remainder for the
 * PO-Duty-beside-Issue bar.
 *
 * A separate vite entry (`manual-purchase-preview.html`), not a route:
 * `vite build` only emits `index.html`'s graph, so this cannot reach
 * production.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import OperationManualPurchase from "@/pages/operation/OperationManualPurchase";
import "@/index.css";

const KLANG = "11111111-1111-4111-8111-111111111111";
const BULOH = "22222222-2222-4222-8222-222222222222";
const S_HOOKA = "aaaaaaa1-0000-4000-8000-000000000001";
const S_OHANA = "aaaaaaa2-0000-4000-8000-000000000002";
const S_DORSETT = "aaaaaaa3-0000-4000-8000-000000000003";
const PO_A = "bbbbbbb1-0000-4000-8000-000000000001";
const PO_B = "bbbbbbb2-0000-4000-8000-000000000002";
const PO_C = "bbbbbbb3-0000-4000-8000-000000000003";
const SC_1 = "ccccccc1-0000-4000-8000-000000000001";
const U_SITI = "ddddddd1-0000-4000-8000-000000000001";
const U_LICHING = "ddddddd2-0000-4000-8000-000000000002";
const U_SHASHA = "ddddddd3-0000-4000-8000-000000000003";

let n = 0;
const rid = () => `eeeeeee${++n}-0000-4000-8000-00000000000${n}`;
const R1 = rid(), R2 = rid(), R3 = rid(), R4 = rid(), R5 = rid(), R6 = rid();

function req(over: Record<string, unknown>): Record<string, unknown> {
  return {
    required_by: null,
    why: null,
    approval_required: false,
    approved_at: null,
    approved_by: null,
    refused_at: null,
    refused_by: null,
    refuse_reason: null,
    for_service_case_id: null,
    for_staff_user_id: null,
    for_subsidiary_name: null,
    created_by: U_SITI,
    /* THE SERVER'S ONE IDENTITY, exactly as the register read carries it
       (`requested_by_name` / `requested_by_user_id`) — the page never looks a
       requester up a second time, so a fixture that seeds only `created_by`
       would make a working column read `Staff identity not recorded`. */
    requested_by_name: "Siti",
    requested_by_user_id: U_SITI,
    destination_id: KLANG,
    ...over,
  };
}

let ln = 0;
function line(over: Record<string, unknown>): Record<string, unknown> {
  return {
    id: `fffffff${++ln}-0000-4000-8000-0000000000${String(ln).padStart(2, "0")}`,
    supplier_id: S_HOOKA,
    destination_id: KLANG,
    approved_qty: null,
    issued_qty: 0,
    remaining_qty: 0,
    required_by: null,
    remark: null,
    po_id: null,
    cancelled_at: null,
    cancel_reason: null,
    received: false,
    po_ids: [],
    ...over,
  };
}

const REGISTER = {
  requests: [
    // ① Other Purchase · Need approval (+ `Jess approves`) · Not ordered yet.
    req({
      id: R1, req_no: "MPR-20260829-7781", purpose: "other_purchase",
      why: "Spare castors for the delivery van",
      approval_required: true, required_by: "2026-09-05",
      created_at: "2026-08-29T03:10:00Z",
    }),
    // ② Service Case · Approved · Ready to order (SELECTABLE) · 2 items.
    req({
      id: R2, req_no: "MPR-20260829-4103", purpose: "service_case",
      for_service_case_id: SC_1, approval_required: true,
      approved_at: "2026-08-29T04:00:00Z", required_by: "2026-09-10",
      created_at: "2026-08-29T02:00:00Z",
    }),
    // ③ Historical REQ- number · RETIRED purpose · Refused.
    req({
      id: R3, req_no: "REQ-0042", purpose: "display",
      why: "Balakong floor sofa is worn.",
      approval_required: true, refused_at: "2026-08-20T02:00:00Z",
      refuse_reason: "a unit in Klang can move instead",
      created_at: "2026-08-20T01:00:00Z",
    }),
    // ④ Ready Stock · No approval needed · fully ordered on TWO POs.
    req({
      id: R4, req_no: "MPR-20260828-2210", purpose: "ready_stock",
      required_by: "2026-09-01", created_at: "2026-08-28T06:00:00Z",
    }),
    // ⑤ Internal Staff Purchase · Approved · part issued (one PO + remainder).
    req({
      id: R5, req_no: "MPR-20260827-0533", purpose: "internal_staff_purchase",
      for_staff_user_id: U_LICHING, approval_required: true,
      approved_at: "2026-08-27T08:00:00Z", required_by: "2026-09-15",
      created_at: "2026-08-27T05:00:00Z",
    }),
    // ⑥ Subsidiary Purchase · 2 suppliers · Multiple destinations.
    req({
      id: R6, req_no: null, purpose: "subsidiary_purchase",
      for_subsidiary_name: "HOUZS Sdn Bhd", required_by: "2026-09-20",
      created_at: "2026-08-27T02:00:00Z",
    }),
  ],
  lines: [
    line({ request_id: R1, sku: "CASTOR-75", qty: 8, remaining_qty: 8,
      item_label: "Castor 75mm", category: null }),
    /* ⭐ THE ENGINE'S OWN Order By — so `PO Safety Days` can be walked as a
       real MARGIN. One line is comfortable, one is already PAST its date; the
       parent shows the TIGHTER of the two. */
    line({ id: "l-r2-a", request_id: R2, sku: "5539-2NA", qty: 1, approved_qty: 1,
      remaining_qty: 1, order_by: "2026-09-04",
      item_label: "Booqit 2 Seater", category: "sofa" }),
    line({ id: "l-r2-b", request_id: R2, sku: "5539-CNR", qty: 1, approved_qty: 1,
      remaining_qty: 1, order_by: "2026-08-25",
      item_label: "Booqit Corner", category: "sofa" }),
    line({ request_id: R3, sku: "7011-3S", qty: 1, remaining_qty: 1,
      item_label: "Dorsett 3 Seater", category: "sofa", supplier_id: S_DORSETT }),
    /* ⭐ A LINE SPLIT ACROSS TWO POs — the case the settled goods table exists
       for. 3 units went onto PO_A and 1 onto PO_B; the expansion must print
       3 and 1, never 4 and 4. */
    line({ id: "l-r4-a", request_id: R4, sku: "B1201S-K", qty: 4, issued_qty: 4, po_id: PO_A,
      po_ids: [PO_A, PO_B],
      allocations: [
        { poId: PO_A, qty: 3, destinationId: KLANG },
        { poId: PO_B, qty: 1, destinationId: BULOH },
      ],
      item_label: "Sonic K", category: "mattress" }),
    /* Part issued: ONE allocation row plus a `To purchase` remainder row. */
    line({ id: "l-r5-a", request_id: R5, sku: "M1401F-Q", qty: 3, approved_qty: 2, issued_qty: 1,
      po_id: PO_C, po_ids: [PO_C], remaining_qty: 1,
      allocations: [{ poId: PO_C, qty: 1, destinationId: KLANG }],
      item_label: "Atlas Q", category: "bedframe", supplier_id: S_OHANA }),
    line({ request_id: R6, sku: "5539-L", qty: 1, remaining_qty: 1,
      item_label: "Booqit L Shape", category: "sofa", supplier_id: S_HOOKA }),
    line({ request_id: R6, sku: "7011-2S", qty: 1, remaining_qty: 1,
      item_label: "Dorsett 2 Seater", category: "sofa", supplier_id: S_DORSETT,
      destination_id: BULOH }),
  ],
  pos: [
    /* The ORIGINAL supplier-facing date (0428/0430) and the document's own
       supplier — the goods table's exact mapping reads both. */
    { id: PO_A, po_no: "PO-20260828-3301", official_delivery_date: "2026-09-18",
      supplier_id: S_HOOKA },
    { id: PO_B, po_no: "PO-20260828-6644", official_delivery_date: "2026-09-25",
      supplier_id: S_OHANA },
    { id: PO_C, po_no: "PO-20260827-9012", official_delivery_date: "2026-09-30",
      supplier_id: S_OHANA },
  ],
  /* A linked Service Case carries the CUSTOMER facts the four customer columns
     print — the case's customer, and the linked order's requested delivery date
     and delivery locality. All four are `null` on a case with no order, which is
     what the unlinked requests above walk. */
  serviceCases: [
    {
      id: SC_1,
      case_no: "SC-20260815-3311",
      customer_name: "Tan Mei Ling",
      requested_delivery_date: "2026-09-12",
      delivery_city: "Klang",
      delivery_state: "Selangor",
    },
  ],
  destinations: [
    { id: KLANG, name: "Carres Klang" },
    { id: BULOH, name: "AL Sungai Buloh" },
  ],
  suppliers: [
    { id: S_HOOKA, name: "Hooka", kind: "own_logistics" },
    { id: S_OHANA, name: "Ohana", kind: "own_logistics" },
    { id: S_DORSETT, name: "Dorsettloft", kind: "own_logistics" },
  ],
  users: [
    { id: U_SITI, name: "Siti" },
    { id: U_LICHING, name: "Li Ching" },
    { id: U_SHASHA, name: "Shasha" },
  ],
  approvers: [{ id: "u9", name: "Jess" }],
  canApprove: false,
  currentPoDuty: { userId: U_SHASHA, name: "Shasha" },
  actingPoDuty: null,
  poDutyUnavailable: false,
  mayIssue: true,
};

const PICK = {
  items: [
    { sku: "5539-2NA", label: "Booqit 2 Seater", supplier: "Hooka", onHand: 3, reserved: 1, free: 2 },
    { sku: "5539-CNR", label: "Booqit Corner", supplier: "Hooka", onHand: 0, reserved: 0, free: 0 },
  ],
  stockWarehouse: "Carres Klang",
};

/* ── CARD 05 — the OBJECT read, seeded per request ──────────────────────────
   `?approver=1` on the preview URL walks the actual-approver view (money +
   Approve/Refuse); without it the ordinary-Operations view renders — the
   same screen minus the money, exactly the server contract. */
const AS_APPROVER = new URLSearchParams(window.location.search).get("approver") === "1";

const DETAIL_POS: Record<string, unknown[]> = {
  [R4]: [
    { id: PO_A, po_no: "PO-20260828-3301", placed_at: "2026-08-28T06:30:00Z",
      po_delivery_date: "2026-09-08", supplier_delivery_date: "2026-09-15", ordered_qty: 2 },
    { id: PO_B, po_no: "PO-20260828-6644", placed_at: "2026-08-28T06:30:00Z",
      po_delivery_date: "2026-09-08", supplier_delivery_date: null, ordered_qty: 2 },
  ],
  [R5]: [
    { id: PO_C, po_no: "PO-20260827-9012", placed_at: "2026-08-27T08:20:00Z",
      po_delivery_date: "2026-09-05", supplier_delivery_date: null, ordered_qty: 1 },
  ],
};
const DETAIL_HISTORY: Record<string, unknown[]> = {
  [R1]: [
    { kind: "created", occurred_at: "2026-08-29T03:10:00Z", actor: "Siti",
      actor_role: "operation", units: 8 },
  ],
  [R2]: [
    { kind: "created", occurred_at: "2026-08-29T02:00:00Z", actor: "Siti",
      actor_role: "operation", units: 2 },
    { kind: "approved", occurred_at: "2026-08-29T04:00:00Z", actor: "Jess",
      actor_role: "principal", requested_units: 2, approved_units: 2 },
  ],
  [R3]: [
    { kind: "created", occurred_at: "2026-08-20T01:00:00Z", actor: null,
      actor_role: null, units: 1 },
    { kind: "refused", occurred_at: "2026-08-20T02:00:00Z", actor: "Jess",
      actor_role: "principal", reason: "a unit in Klang can move instead" },
  ],
  [R4]: [
    { kind: "created", occurred_at: "2026-08-28T06:00:00Z", actor: "Siti",
      actor_role: "operation", units: 4 },
    { kind: "po_issued", occurred_at: "2026-08-28T06:30:00Z", actor: null,
      actor_role: null, po_no: "PO-20260828-3301", units: 2 },
    { kind: "po_issued", occurred_at: "2026-08-28T06:30:00Z", actor: null,
      actor_role: null, po_no: "PO-20260828-6644", units: 2 },
  ],
  [R5]: [
    { kind: "created", occurred_at: "2026-08-27T05:00:00Z", actor: "Li Ching",
      actor_role: "operation", units: 3 },
    { kind: "approved", occurred_at: "2026-08-27T08:00:00Z", actor: "Jess",
      actor_role: "principal", requested_units: 3, approved_units: 2 },
    { kind: "po_issued", occurred_at: "2026-08-27T08:20:00Z", actor: null,
      actor_role: null, po_no: "PO-20260827-9012", units: 1 },
  ],
  [R6]: [
    { kind: "created", occurred_at: "2026-08-27T02:00:00Z", actor: "Siti",
      actor_role: "operation", units: 2 },
  ],
};

function detailAnswer(id: string) {
  const request = REGISTER.requests.find((r) => r.id === id);
  const lines = REGISTER.lines
    .filter((l) => l.request_id === id)
    .map((l) => (AS_APPROVER ? { ...l, unit_cost: l.sku === "5539-CNR" ? 400 : 850 } : l));
  return {
    request,
    serviceCaseNo:
      (request as { for_service_case_id?: string | null } | undefined)
        ?.for_service_case_id != null
        ? "SC-20260815-3311"
        : null,
    requested_by_name:
      id === R3 ? null : (REGISTER.users.find(
        (u) => u.id === (request as { created_by?: string } | undefined)?.created_by,
      )?.name ?? null),
    lines,
    pos: DETAIL_POS[id] ?? [],
    history: DETAIL_HISTORY[id] ?? [],
    destinations: REGISTER.destinations,
    suppliers: REGISTER.suppliers,
    users: REGISTER.users,
    approvers: REGISTER.approvers,
    canApprove: AS_APPROVER,
  };
}

/**
 * WHAT THE PREVIEW HAS "SAVED", so `Change selection` · `Save changes` ·
 * `Cancel` can actually be walked without a database.
 */
const SAVED: Record<string, string[]> = { "l-r2-a": ["unit-0001"] };

const UNIT = (
  itemId: string,
  unitCode: string,
  over: Record<string, unknown> = {},
) => ({
  itemId,
  unitCode,
  identityScope: "unit",
  sku: "5539-2NA",
  goodsReceivedDate: "2026-07-02",
  stockLocation: "Carres Klang",
  supplier: "Ohana",
  sourceRef: "PO-20260701-8814",
  condition: "new",
  ownership: "carres_owned",
  qty: 1,
  reservedForThisLine: false,
  blocked: null,
  ...over,
});

function stockAnswer(requestId: string) {
  /* ② Service Case — an approved CONCRETE NEED. One line already holds a Unit
     (so `Change selection` is walkable), one is free to choose. */
  if (requestId === R2) {
    return {
      requestId,
      reference: "MPR-20260829-4103",
      intent: "concrete_need",
      approved: true,
      lines: [
        {
          demandId: "l-r2-a",
          sku: "5539-2NA",
          item: "Booqit 2 Seater",
          requestedQty: 1,
          approvedQty: 1,
          issuedQty: 0,
          availableQty: 2,
          reservedQty: SAVED["l-r2-a"]?.length ?? 0,
          remainingQty: Math.max(0, 1 - (SAVED["l-r2-a"]?.length ?? 0)),
          stockBlock: null,
          units: [
            UNIT("unit-0001", "U1-000-014", {
              reservedForThisLine: (SAVED["l-r2-a"] ?? []).includes("unit-0001"),
            }),
            UNIT("unit-0002", "U1-000-021", {
              goodsReceivedDate: "2026-06-11",
              stockLocation: "AL Sungai Buloh",
              supplier: "Hooka",
              sourceRef: null,
              condition: "exhibition",
              ownership: "supplier_consignment",
            }),
            /* A counted row SHOWS and is not a Unit (0453 · 0368). */
            UNIT("unit-0003", "QTY-5539-2NA", {
              identityScope: "quantity",
              condition: null,
              sourceRef: null,
              qty: 12,
              blocked: "counted_stock",
            }),
          ],
        },
        {
          demandId: "l-r2-b",
          sku: "5539-CNR",
          item: "Booqit Corner",
          requestedQty: 1,
          approvedQty: 1,
          issuedQty: 0,
          availableQty: 0,
          reservedQty: 0,
          remainingQty: 1,
          stockBlock: null,
          units: [],
        },
      ],
    };
  }
  /* ⑤ Internal Staff Purchase — ADDITIONAL replenishment: the shelf shows
     and is not netted against the ask. */
  if (requestId === R5) {
    return {
      requestId,
      reference: "MPR-20260827-0533",
      intent: "additional_stock",
      approved: true,
      lines: [
        {
          demandId: "l-r5-a",
          sku: "B1201S-K",
          item: "Sonic K",
          requestedQty: 4,
          approvedQty: null,
          issuedQty: 0,
          availableQty: 14,
          reservedQty: 0,
          remainingQty: 4,
          stockBlock: "additional_stock",
          units: [UNIT("unit-0101", "U1-000-101", { sku: "B1201S-K" })],
        },
      ],
    };
  }
  /* ① Other Purchase — approved nothing yet, and it recorded NO intent.
     THE `demandId` IS THE REGISTER'S OWN LINE ID. The goods row, the cell, the
     frame and the connector share one identity, so a fixture that invented a
     second id would make every cell read `Not checked` — the truthful answer to
     a read that carried no entry for the line, and exactly the wrong state to
     walk the read-only reasons on. */
  return {
    requestId,
    reference: null,
    intent: null,
    approved: requestId !== R1,
    lines: [
      {
        demandId:
          (REGISTER.lines.find((l) => l.request_id === requestId)?.id as string) ??
          `l-${requestId}-a`,
        sku: "CASTOR-75",
        item: "Castor 75mm",
        requestedQty: 8,
        approvedQty: null,
        issuedQty: 0,
        availableQty: 0,
        reservedQty: 0,
        remainingQty: 8,
        stockBlock: requestId === R1 ? "not_approved" : "intent_not_recorded",
        units: [],
      },
    ],
  };
}

/* The page's own reads, answered locally — nothing leaves the browser. */
const realFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const answer = (body: unknown) =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  if (url.includes("/purchasing/requests/detail/")) {
    return answer(detailAnswer(url.split("/detail/")[1].split("?")[0]));
  }
  if (url.includes("/purchasing/requests/already-have")) {
    const sku = new URL(url, window.location.origin).searchParams.get("sku") ?? "";
    return answer({
      sku,
      alreadyOnPo: sku === "5539-2NA" ? 1 : 0,
      firstPo: sku === "5539-2NA" ? { id: "PO-20260828-3301", eta: "2026-09-08" } : null,
    });
  }
  if (url.includes("/purchasing/requests/issue-costs")) {
    return answer({ costs: [
      { sku: "5539-2NA", unitCost: 850 },
      { sku: "5539-CNR", unitCost: 400 },
    ] });
  }
  if (url.includes("/purchasing/requests/") && url.includes("/decide")) {
    return answer({ id: "x", req_no: null, decision: "approved" });
  }
  if (url.includes("/purchasing/requests/issue")) {
    return answer({ poIds: [], documents: 1 });
  }
  /**
   * MANUAL PURCHASE · READY STOCK ALLOCATION — the read each goods line's own
   * `Ready Stock` cell makes when it is opened, and the ONE save.
   *
   * The fixtures deliberately hold every state the ruling names at once: an
   * approved CONCRETE NEED that can choose, a saved allocation that can be
   * changed, an ADDITIONAL replenishment that is read-only, and a request that
   * recorded no intent at all.
   */
  if (url.includes("/stock-allocation")) {
    const requestId = url.split("/requests/")[1]?.split("/")[0] ?? "";
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body ?? "{}"));
      SAVED[body.demandId] = body.itemIds ?? [];
      return answer({
        demandId: body.demandId,
        reference: "MPR-20260829-4103",
        reserved: (body.itemIds ?? []).length,
        added: 0,
        removed: 0,
        unitIds: body.itemIds ?? [],
        remainingQty: 0,
      });
    }
    return answer(stockAnswer(requestId));
  }
  if (url.includes("/purchasing/requests")) return answer(REGISTER);
  if (url.includes("pick-items")) return answer(PICK);
  if (url.includes("/api/")) return answer({});
  return realFetch(input, init);
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={["/operation?tab=manual-purchase"]}>
        <div className="h-screen bg-white">
          <OperationManualPurchase />
        </div>
      </MemoryRouter>
    </QueryClientProvider>
  </StrictMode>,
);
