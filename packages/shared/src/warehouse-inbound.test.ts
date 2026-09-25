import { describe, it, expect } from "vitest";
import {
  buildInboundRegisterView,
  inboundArrivals,
  inboundDocumentWordOf,
  inboundExceptionLines,
  inboundStatusWordOf,
  filterInbound,
  inboundHref,
  INBOUND_UNMAPPED_SITE,
} from "./warehouse-inbound";
const input = {
  pos: [
    {
      id: "PO-1",
      supplier_id: "s",
      warehouse_id: "w",
      destination_id: null,
      status: "open",
      official_delivery_date: "2026-09-01",
      eta_date: "2026-09-02",
      placed_at: "2026-08-01",
      so: 12,
    },
  ],
  sites: [{ id: "w", name: "Klang" }],
  suppliers: [{ id: "s", name: "Factory" }],
  destinations: [],
  /* The governed receiving columns: three ordered, one accepted, one damaged.
     `Pending Delivery Qty` is 2 — the damaged piece arrived and the supplier
     still owes a correct one. */
  lines: [
    {
      po_id: "PO-1",
      qty: 3,
      destination_id: null,
      sku: null,
      identity_mode: "exact_unit" as const,
      received_qty: 1,
      damaged_qty: 1,
      wrong_item_qty: 0,
    },
  ],
  units: ["1", "2", "3"].map((id) => ({
    id,
    unit_code: `U1-000-00${id}`,
    po_no: "PO-1",
    qty: 1,
  })),
  receipts: [
    {
      id: "r",
      po_id: "PO-1",
      status: "posted",
      posted_at: "2026-09-01T10:00:00Z",
    },
  ],
  results: [
    {
      receipt_id: "r",
      stock_item_id: "1",
      outcome: "received",
      issue_kind: null,
    },
    {
      receipt_id: "r",
      stock_item_id: "2",
      outcome: "received_with_issue",
      issue_kind: "damaged",
    },
  ],
};
describe("Inbound physical projection", () => {
  it("reconciles exact units and preserves the original supplier date", () => {
    const [r] = inboundArrivals(input);
    expect([r.date, r.expected, r.received, r.remaining, r.issues]).toEqual([
      "2026-09-01",
      3,
      2,
      1,
      1,
    ]);
    expect(
      r.units.filter((u) => u.outcome === "not_received").map((u) => u.code),
    ).toEqual(["U1-000-003"]);
    /* THREE FILTERS, NOT FIVE. `Part received` and `With issue` were slices
       that overlapped everything; they are facts on the row now. */
    expect(filterInbound([r], new URLSearchParams("status=open"))).toHaveLength(
      1,
    );
    expect(
      filterInbound([r], new URLSearchParams("status=received")),
    ).toHaveLength(0);
  });
  it("ignores unposted and voided results, and later receipt supersedes not received", () => {
    expect(
      inboundArrivals({
        ...input,
        receipts: [{ ...input.receipts[0], status: "voided" }],
      })[0].received,
    ).toBe(0);
    const r = inboundArrivals({
      ...input,
      receipts: [
        ...input.receipts,
        { id: "r2", po_id: "PO-1", status: "posted", posted_at: "2026-09-02" },
      ],
      results: [
        ...input.results,
        {
          receipt_id: "r2",
          stock_item_id: "3",
          outcome: "received",
          issue_kind: null,
        },
      ],
    })[0];
    expect(r.remaining).toBe(0);
  });
  it("does not manufacture unit identities or infer receipt from stock status", () => {
    expect(inboundArrivals({ ...input, units: [] })[0].expected).toBe(0);
    expect(inboundArrivals({ ...input, results: [] })[0].received).toBe(0);
  });
  it("selects the exact Monitor scope and searches unit identities", () => {
    const rows = inboundArrivals(input);
    const p = new URLSearchParams(inboundHref(rows[0]).split("?")[1]);
    expect(filterInbound(rows, p)).toHaveLength(1);
    p.set("site", "other");
    expect(filterInbound(rows, p)).toHaveLength(0);
    expect(
      filterInbound(rows, new URLSearchParams("q=U1-000-003")),
    ).toHaveLength(1);
    expect(
      filterInbound(rows, new URLSearchParams("date=2026-09-02")),
    ).toHaveLength(0);
  });
  it("pages on the server while facet counts describe the complete result", () => {
    const first = inboundArrivals(input)[0];
    const second = {
      ...first,
      id: "PO-2",
      sourceId: "PO-2",
      siteId: "w2",
      site: "JB",
    };
    const view = buildInboundRegisterView(
      [first, second],
      new URLSearchParams("status=open"),
      0,
      1,
    );
    expect(view.rows).toHaveLength(1);
    expect(view.total).toBe(2);
    expect(view.facets.status.open).toBe(2);
    expect(view.facets.site).toEqual({ w: 1, w2: 1 });
  });
});

it("never declares completion when only some ordered Unit identities exist", () => {
  const [r] = inboundArrivals({
    ...input,
    lines: [
      {
        po_id: "PO-1",
        qty: 4,
        destination_id: null,
        identity_mode: "exact_unit" as const,
        received_qty: 0,
      },
    ],
  });
  expect(r.identitiesMissing).toBe(true);
});
it("uses the governed supplier reply when it changes the arrival date", () => {
  const [r] = inboundArrivals({
    ...input,
    promises: [
      {
        po_id: "PO-1",
        po_version: 1,
        kind: "tomorrow_delivery",
        answer: "delayed",
        new_date: "2026-09-05",
        about_date: null,
        previous_date: "2026-09-01",
        reason: "Transport",
        channel: "phone",
        recipient: "Factory",
        evidence: "proof",
        reported_by: "supplier",
        reported_at: "2026-09-01",
        recorded_by: "actor",
        recorded_at: "2026-09-01",
      },
    ],
  });
  expect(r.date).toBe("2026-09-05");
});
it("does not assign a split destination source to the PO header Site", () => {
  expect(
    inboundArrivals({
      ...input,
      destinations: [{ id: "elsewhere", warehouse_id: "w2" }],
      lines: [
        {
          po_id: "PO-1",
          qty: 3,
          destination_id: "elsewhere",
          identity_mode: "exact_unit" as const,
          received_qty: 0,
        },
      ],
    }),
  ).toEqual([]);
});

it("a later truck's not-received result cannot erase an earlier physical receipt", () => {
  const [r] = inboundArrivals({
    ...input,
    receipts: [
      ...input.receipts,
      {
        id: "second",
        po_id: "PO-1",
        status: "posted",
        posted_at: "2026-09-03",
      },
    ],
    results: [
      ...input.results,
      {
        receipt_id: "second",
        stock_item_id: "1",
        outcome: "not_received",
        issue_kind: null,
      },
      {
        receipt_id: "second",
        stock_item_id: "3",
        outcome: "received",
        issue_kind: null,
      },
    ],
  });
  expect([r.received, r.remaining, r.issues]).toEqual([3, 0, 1]);
});

it("voiding the earlier receipt removes its evidence even when a later arrival says not received", () => {
  const [r] = inboundArrivals({
    ...input,
    receipts: [
      { ...input.receipts[0], status: "voided" },
      {
        id: "second",
        po_id: "PO-1",
        status: "posted",
        posted_at: "2026-09-03",
      },
    ],
    results: [
      ...input.results,
      {
        receipt_id: "second",
        stock_item_id: "1",
        outcome: "not_received",
        issue_kind: null,
      },
      {
        receipt_id: "second",
        stock_item_id: "3",
        outcome: "received",
        issue_kind: null,
      },
    ],
  });
  expect([r.received, r.remaining, r.issues]).toEqual([1, 2, 0]);
});

it("receipt evidence cannot cross between sources even for a mismatched Unit result", () => {
  const [r] = inboundArrivals({
    ...input,
    receipts: [{ ...input.receipts[0], po_id: "ANOTHER-PO" }],
  });
  expect([r.received, r.remaining, r.issues]).toEqual([0, 3, 0]);
});

it.each([
  "transfer",
  "customer-return",
  "failed-delivery-return",
  "repair-return",
  "supplier-replacement",
] as const)("projects %s only from its own exact Receiving results", (kind) => {
  const [r] = inboundArrivals({
    ...input,
    pos: [],
    arrivalSources: [
      {
        id: "source",
        source_no: "SOURCE-1",
        kind,
        claim_id: null,
        case_id: null,
        from_site_id: "origin",
        to_site_id: "w",
        party_id: "party",
        expected_date: "2026-09-06",
        collection_date: null,
        reason: "Authorised source",
        cancelled_at: null,
        created_at: "2026-09-01",
      },
    ],
    sourceUnits: input.units.map((u) => ({
      source_id: "source",
      stock_item_id: u.id,
      replaces_item_id: null,
    })),
    parties: [{ id: "party", name: "Recorded party" }],
    receipts: [
      { ...input.receipts[0], po_id: null, arrival_source_id: "source" },
    ],
  });
  expect([
    r.sourceType,
    r.sourceNo,
    r.expected,
    r.received,
    r.remaining,
    r.issues,
  ]).toEqual([kind, "SOURCE-1", 3, 2, 1, 1]);
  expect(
    filterInbound([r], new URLSearchParams(inboundHref(r).split("?")[1])),
  ).toHaveLength(1);
  expect(filterInbound([r], new URLSearchParams("source=unrelated"))).toEqual(
    [],
  );
});
describe("Document, products, status and exceptions", () => {
  const named = {
    ...input,
    units: input.units.map((u) => ({
      ...u,
      sku: u.id === "3" ? "BED-K" : "MAT-Q",
    })),
    lines: [
      {
        po_id: "PO-1",
        qty: 2,
        destination_id: null,
        sku: "MAT-Q",
        identity_mode: "exact_unit" as const,
        received_qty: 1,
        damaged_qty: 1,
        wrong_item_qty: 0,
      },
      {
        po_id: "PO-1",
        qty: 1,
        destination_id: null,
        sku: "BED-K",
        identity_mode: "exact_unit" as const,
        received_qty: 0,
        damaged_qty: 0,
        wrong_item_qty: 0,
      },
    ],
    skuNames: [
      { sku: "MAT-Q", name: "Cloud Mattress Queen" },
      { sku: "BED-K", name: "Oak Bedframe King" },
    ],
  };
  it("names every product with its own arranged and received counts", () => {
    const [r] = inboundArrivals(named);
    expect(r.documentWord).toBe("PO No");
    expect(r.documentNo).toBe("PO-1");
    expect(r.from).toBe("Factory");
    expect(r.products).toEqual([
      { sku: "MAT-Q", name: "Cloud Mattress Queen", qty: 2, received: 2, category: null },
      { sku: "BED-K", name: "Oak Bedframe King", qty: 1, received: 0, category: null },
    ]);
    expect(r.units.find((u) => u.id === "1")?.product).toBe(
      "Cloud Mattress Queen",
    );
  });
  it("issue counts stay a subset of received — 4 received with 1 damaged never becomes 5", () => {
    const [r] = inboundArrivals(named);
    expect(r.received).toBe(2);
    expect(r.issues).toBe(1);
    expect(r.received + r.remaining).toBe(r.expected);
  });
  it("speaks one progress word and keeps exceptions beside it, not instead of it", () => {
    const [r] = inboundArrivals(named);
    expect(inboundStatusWordOf(r)).toBe("Part received");
    const lines = inboundExceptionLines(r, "2026-09-07");
    expect(lines).toContain("U1-000-002 · Damaged");
    expect(
      lines.some((l) => l.startsWith("Expected arrival was 2026-09-01")),
    ).toBe(true);
    expect(lines).toContain(
      "Expected arrival was 2026-09-01. Pending Delivery Qty 2",
    );
    expect(
      inboundStatusWordOf({
        ...r,
        quantities: { ...r.quantities, arrivedQty: 0, pendingDeliveryQty: 3 },
      }),
    ).toBe("Not received yet");
    expect(
      inboundStatusWordOf({
        ...r,
        quantities: { ...r.quantities, arrivedQty: 3, pendingDeliveryQty: 0 },
      }),
    ).toBe("Received");
  });
  it("a Unit received at a different Site is a named location exception", () => {
    const [r] = inboundArrivals({
      ...named,
      sites: [...named.sites, { id: "w2", name: "JB" }],
      receipts: [{ ...named.receipts[0], actual_site_id: "w2" }],
    });
    expect(inboundExceptionLines(r, "2026-09-07")).toContain(
      "U1-000-001 · Received at JB, not Klang",
    );
  });
  it("`open` keeps unfinished arrangements and the facet counts agree", () => {
    const rows = inboundArrivals(named);
    expect(filterInbound(rows, new URLSearchParams("status=open"))).toHaveLength(
      1,
    );
    const done = {
      ...rows[0],
      quantities: { ...rows[0].quantities, pendingDeliveryQty: 0 },
      identitiesMissing: false,
    };
    expect(
      filterInbound([done], new URLSearchParams("status=open")),
    ).toHaveLength(0);
    const view = buildInboundRegisterView(rows, new URLSearchParams(), 0, 50);
    expect(view.facets.status.open).toBe(1);
  });
  it("keeps every posted session viewable with its GRN number", () => {
    const [r] = inboundArrivals({
      ...named,
      receipts: [
        {
          ...named.receipts[0],
          grn_no: "GRN-060926-1111",
          goods_received_at: "2026-09-01",
        },
      ],
    });
    expect(r.sessions).toEqual([
      {
        id: "r",
        grnNo: "GRN-060926-1111",
        doNumber: null,
        postedAt: "2026-09-01T10:00:00Z",
        receivedAt: "2026-09-01",
        actualSite: null,
      },
    ]);
  });
  it("gives each source kind the document its number belongs to", () => {
    expect(inboundDocumentWordOf("transfer")).toBe("Transfer No");
    expect(inboundDocumentWordOf("repair-return")).toBe("Repair Order No");
    expect(inboundDocumentWordOf("supplier-replacement")).toBe("Claim No");
    expect(inboundDocumentWordOf("customer-return")).toBe("Case No");
    expect(inboundDocumentWordOf("failed-delivery-return")).toBe("Case No");
  });
  it("a return names the customer as origin, never the carrier", () => {
    const [r] = inboundArrivals({
      ...input,
      pos: [],
      arrivalSources: [
        {
          id: "source",
          source_no: "CS-1",
          kind: "customer-return" as const,
          claim_id: null,
          case_id: "case",
          from_site_id: null,
          to_site_id: "w",
          party_id: "party",
          expected_date: "2026-09-06",
          collection_date: null,
          reason: "Return",
          cancelled_at: null,
          created_at: "2026-09-01",
          sales_order_ref: "CR12345",
        },
      ],
      sourceUnits: input.units.map((u) => ({
        source_id: "source",
        stock_item_id: u.id,
        replaces_item_id: null,
      })),
      parties: [{ id: "party", name: "NETS Logistics" }],
      receipts: [],
    });
    expect(r.from).toBe("Customer · CR12345");
    expect(r.from).not.toContain("NETS");
  });
});

it("replacement identities are not counted twice as original PO Units", () => {
  const [r] = inboundArrivals({
    ...input,
    units: [
      ...input.units,
      { id: "replacement", unit_code: "U1-000-004", po_no: "PO-1", qty: 1 },
    ],
    sourceUnits: [
      {
        source_id: "replacement-source",
        stock_item_id: "replacement",
        replaces_item_id: "2",
      },
    ],
  });
  expect(r.expected).toBe(3);
});

/* ── THE APPROVED RECEIVING CONTRACT (2026-09-15) ──────────────────────────
   Every case below FAILED before this card. They are the defects, written
   down so they cannot come back. */

/** Order Qty 10 — six correct, two damaged, two never sent. */
const tenOrdered = {
  ...input,
  pos: [{ ...input.pos[0], id: "PO-Q" }],
  lines: [
    {
      po_id: "PO-Q",
      qty: 10,
      destination_id: null,
      sku: "SKU-A",
      identity_mode: "exact_unit" as const,
      received_qty: 6,
      damaged_qty: 2,
      wrong_item_qty: 0,
    },
  ],
  units: Array.from({ length: 10 }, (_, i) => ({
    id: `q${i + 1}`,
    unit_code: `UQ-${i + 1}`,
    po_no: "PO-Q",
    qty: 1,
    sku: "SKU-A",
  })),
  receipts: [
    { id: "rq", po_id: "PO-Q", status: "posted", posted_at: "2026-09-01" },
  ],
  results: Array.from({ length: 8 }, (_, i) => ({
    receipt_id: "rq",
    stock_item_id: `q${i + 1}`,
    outcome: i < 6 ? "received" : "received_with_issue",
    issue_kind: i < 6 ? null : "damaged",
  })),
};

describe("Physical arrival and accepted fulfilment are different facts", () => {
  it("six correct, two damaged, two absent → received 6, pending 4, damaged 2, arrived 8", () => {
    const [r] = inboundArrivals(tenOrdered);
    expect(r.quantities).toEqual({
      orderQty: 10,
      receivedQty: 6,
      damagedQty: 2,
      wrongItemQty: 0,
      pendingDeliveryQty: 4,
      arrivedQty: 8,
      known: true,
    });
  });

  it("FULLY ARRIVED IS NOT FULLY FULFILLED — damage never settles the debt", () => {
    const [r] = inboundArrivals({
      ...tenOrdered,
      lines: [
        { ...tenOrdered.lines[0], received_qty: 8, damaged_qty: 2 },
      ],
    });
    /* Ten pieces are on the floor and the supplier still owes two. */
    expect(r.quantities.arrivedQty).toBe(10);
    expect(r.quantities.pendingDeliveryQty).toBe(2);
    expect(inboundStatusWordOf(r)).toBe("Part received");
    expect(filterInbound([r], new URLSearchParams("status=received"))).toEqual(
      [],
    );
    expect(
      filterInbound([r], new URLSearchParams("status=open")),
    ).toHaveLength(1);
  });

  it("only accepted correct goods close the arrangement", () => {
    const [r] = inboundArrivals({
      ...tenOrdered,
      lines: [
        { ...tenOrdered.lines[0], received_qty: 10, damaged_qty: 0 },
      ],
    });
    expect(r.quantities.pendingDeliveryQty).toBe(0);
    expect(inboundStatusWordOf(r)).toBe("Received");
    expect(
      filterInbound([r], new URLSearchParams("status=received")),
    ).toHaveLength(1);
  });

  it("an unreadable receipt reports UNKNOWN, never a zero", () => {
    const [r] = inboundArrivals({ ...tenOrdered, results: [] });
    expect(r.quantities.known).toBe(false);
    expect(inboundStatusWordOf(r)).toBe("Records incomplete");
  });
});

describe("An unlinked purchasing destination is a mapping gap, not an empty shelf", () => {
  const unlinked = {
    ...tenOrdered,
    pos: [{ ...tenOrdered.pos[0], destination_id: "d-direct" }],
    destinations: [
      { id: "d-direct", warehouse_id: null, name: "Ohana" },
    ],
  };

  it("still produces the row, named by the destination's own record", () => {
    const [r] = inboundArrivals(unlinked);
    expect(r.siteMapped).toBe(false);
    expect(r.destinationName).toBe("Ohana");
    expect(r.site).toBe("Ohana — no Site linked");
  });

  it("belongs to no Site's tab and is reached only by asking for it", () => {
    const rows = inboundArrivals(unlinked);
    /* A Site's own list never gains goods bound somewhere else … */
    expect(filterInbound(rows, new URLSearchParams("site=w"))).toEqual([]);
    /* … and the Schedule, which asks by Site or not at all, is untouched. */
    expect(filterInbound(rows, new URLSearchParams())).toEqual([]);
    expect(
      filterInbound(rows, new URLSearchParams(`site=${INBOUND_UNMAPPED_SITE}`)),
    ).toHaveLength(1);
    const view = buildInboundRegisterView(rows, new URLSearchParams(), 0, 50);
    expect(view.facets.site[INBOUND_UNMAPPED_SITE]).toBe(1);
  });
});

describe("Counted stock is not a missing record", () => {
  it("a quantity line mints no Unit IDs and is not called incomplete", () => {
    const [r] = inboundArrivals({
      ...input,
      lines: [
        {
          po_id: "PO-1",
          qty: 4,
          destination_id: null,
          sku: "SKU-C",
          identity_mode: "quantity" as const,
          received_qty: 0,
        },
      ],
      units: [],
      receipts: [],
      results: [],
    });
    expect(r.identitiesMissing).toBe(false);
    expect(r.quantities.orderQty).toBe(4);
    expect(r.quantities.pendingDeliveryQty).toBe(4);
  });

  it("damage on counted stock is still reported, by quantity", () => {
    const [r] = inboundArrivals({
      ...input,
      lines: [
        {
          po_id: "PO-1",
          qty: 4,
          destination_id: null,
          sku: "SKU-C",
          identity_mode: "quantity" as const,
          received_qty: 2,
          damaged_qty: 1,
          wrong_item_qty: 1,
        },
      ],
      units: [],
    });
    const lines = inboundExceptionLines(r, "2026-09-07");
    expect(lines).toContain("Damaged Qty 1 · counted stock");
    expect(lines).toContain("Wrong Item Qty 1 · counted stock");
  });

  it("an exact-unit line with fewer Unit IDs than ordered is STILL incomplete", () => {
    const [r] = inboundArrivals({
      ...input,
      lines: [
        {
          po_id: "PO-1",
          qty: 9,
          destination_id: null,
          identity_mode: "exact_unit" as const,
          received_qty: 0,
        },
      ],
    });
    expect(r.identitiesMissing).toBe(true);
  });
});

describe("Each delivery note keeps its own receipt and date", () => {
  it("carries the supplier's own DO number per posted session", () => {
    const [r] = inboundArrivals({
      ...input,
      receipts: [
        {
          ...input.receipts[0],
          do_number: "DO-8821",
          goods_received_at: "2026-09-01",
        },
        {
          id: "r2",
          po_id: "PO-1",
          status: "posted",
          posted_at: "2026-09-04T09:00:00Z",
          do_number: "DO-8930",
          goods_received_at: "2026-09-04",
        },
      ],
    });
    expect(r.sessions.map((s) => [s.doNumber, s.receivedAt])).toEqual([
      ["DO-8821", "2026-09-01"],
      ["DO-8930", "2026-09-04"],
    ]);
  });
});

describe("Three dates, three questions", () => {
  it("separates PO Issued, PO Delivery Date and the supplier's own answer", () => {
    const [r] = inboundArrivals(input);
    expect(r.poIssued).toBe("2026-08-01");
    expect(r.poDeliveryDate).toBe("2026-09-01");
    /* No evidenced supplier reply exists, so there is no supplier date — the
       cell reads `Not confirmed` rather than repeating Carres's own plan. */
    expect(r.supplierDeliveryDate).toBe(null);
  });
});
