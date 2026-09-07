import { describe, it, expect } from "vitest";
import {
  inboundArrivals,
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
