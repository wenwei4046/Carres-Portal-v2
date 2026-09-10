import { describe, it, expect } from "vitest";
import {
  buildInboundRegisterView,
  inboundArrivals,
  inboundDocumentWordOf,
  inboundExceptionLines,
  inboundStatusWordOf,
  filterInbound,
  inboundHref,
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
    expect(
      filterInbound([r], new URLSearchParams("status=part-received")),
    ).toHaveLength(1);
    expect(
      filterInbound([r], new URLSearchParams("status=with-issue")),
    ).toHaveLength(1);
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
      new URLSearchParams("status=part-received"),
      0,
      1,
    );
    expect(view.rows).toHaveLength(1);
    expect(view.total).toBe(2);
    expect(view.facets.status["part-received"]).toBe(2);
    expect(view.facets.site).toEqual({ w: 1, w2: 1 });
  });
});

it("never declares completion when only some ordered Unit identities exist", () => {
  const [r] = inboundArrivals({
    ...input,
    lines: [{ po_id: "PO-1", qty: 4, destination_id: null }],
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
      lines: [{ po_id: "PO-1", qty: 3, destination_id: "elsewhere" }],
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
      { po_id: "PO-1", qty: 2, destination_id: null, sku: "MAT-Q" },
      { po_id: "PO-1", qty: 1, destination_id: null, sku: "BED-K" },
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
      { sku: "MAT-Q", name: "Cloud Mattress Queen", qty: 2, received: 2 },
      { sku: "BED-K", name: "Oak Bedframe King", qty: 1, received: 0 },
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
    expect(inboundStatusWordOf({ ...r, received: 0, remaining: 3 })).toBe(
      "Not received yet",
    );
    expect(inboundStatusWordOf({ ...r, received: 3, remaining: 0 })).toBe(
      "Received",
    );
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
      received: 3,
      remaining: 0,
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
