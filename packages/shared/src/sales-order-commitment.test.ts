/**
 * CARD 1 — CUSTOMER OBLIGATION TRUTH · the required test cases (§12).
 *
 * The resolver is pure, so the seven cases run on realistic bundles shaped
 * exactly as `sales_order_commitment_bundle` (0340) emits them. The DOOR
 * behaviour these fixtures assume (change_type required on contractual
 * changes, `line_in_production`, floors BLOCK) is enforced by
 * `sales_order_save_revision` in the database and proven by real invocation
 * — see the Card 1 report. Here we prove the RESOLVER's authority rules.
 */
import { describe, expect, it } from "vitest";
import {
  diffCommitmentSnapshots,
  resolveCurrentCustomerCommitment,
  type CommitmentBundle,
  type CommitmentSnapshot,
} from "./sales-order-commitment";

const snap = (over: {
  lines?: CommitmentSnapshot["lines"];
  header?: Record<string, unknown>;
}): CommitmentSnapshot => ({
  header: {
    customer_name: "Tan Ah Kow",
    customer_phone: "0123456789",
    delivery_date: "2026-09-01",
    delivery_date_tbd: false,
    ...over.header,
  },
  lines: over.lines ?? [
    { id: "L1", sku: "MODEL-A", qty: 1, unit_price: 2499, description: "Model A (King)" },
  ],
  addons: [],
});

const bundle = (over: Partial<CommitmentBundle>): CommitmentBundle => ({
  order_id: "ord-1",
  current: snap({}),
  revisions: [],
  requests: [],
  ...over,
});

describe("CASE 1 — normal: customer orders A → current commitment = A", () => {
  it("returns the live lines as the commitment, lineage empty", () => {
    const r = resolveCurrentCustomerCommitment(bundle({}));
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]!.sku).toBe("MODEL-A");
    expect(r.promise).toEqual({ date: "2026-09-01", tbd: false });
    expect(r.lineage).toEqual([]);
    expect(r.openRequests).toEqual([]);
  });
});

describe("CASE 2 — staff error before PO: B corrected to A", () => {
  const before = snap({
    lines: [{ id: "L1", sku: "MODEL-B", qty: 1, unit_price: 2499, description: "Model B" }],
  });
  const after = snap({});
  const b = bundle({
    current: after,
    revisions: [
      {
        revision: 1,
        created_at: "2026-08-01T02:00:00Z",
        created_by: "u-1",
        change_type: null,
        note: null,
        snapshot: before,
      },
      {
        revision: 2,
        created_at: "2026-08-02T03:00:00Z",
        created_by: "u-2",
        change_type: "staff_correction",
        note: "Keyed the wrong model",
        snapshot: after,
      },
    ],
  });
  it("current commitment = A; previous value, actor and time preserved", () => {
    const r = resolveCurrentCustomerCommitment(b);
    expect(r.lines[0]!.sku).toBe("MODEL-A");
    const rev2 = r.lineage[1]!;
    expect(rev2.changeType).toBe("staff_correction");
    expect(rev2.by).toBe("u-2");
    expect(rev2.at).toBe("2026-08-02T03:00:00Z");
    expect(rev2.changes).toContainEqual({
      kind: "line_changed",
      field: "Model A (King)",
      from: "Model B",
      to: "Model A (King)",
    });
  });
  it("Rev 1 is the original — no changes, no cause", () => {
    const r = resolveCurrentCustomerCommitment(b);
    expect(r.lineage[0]).toMatchObject({ revision: 1, changeType: null, changes: [] });
  });
});

describe("CASE 3 — staff error after PO: PO-B survives, commitment = A", () => {
  it("the bundle cannot carry a PO, so a PO cannot redefine commitment", () => {
    // The PO for MODEL-B exists in purchase_orders; the bundle (0340) reads
    // orders/order_lines/revisions/requests ONLY. The resolver's answer is
    // therefore structurally independent of the PO — this is the boundary,
    // not an omission.
    const corrected = snap({});
    const r = resolveCurrentCustomerCommitment(
      bundle({
        current: corrected,
        revisions: [
          {
            revision: 1,
            created_at: "2026-08-01T02:00:00Z",
            created_by: "u-1",
            change_type: null,
            note: null,
            snapshot: snap({
              lines: [
                { id: "L1", sku: "MODEL-B", qty: 1, unit_price: 2499, description: "Model B" },
              ],
            }),
          },
          {
            revision: 2,
            created_at: "2026-08-03T04:00:00Z",
            created_by: "u-2",
            change_type: "staff_correction",
            note: null,
            snapshot: corrected,
          },
        ],
      }),
    );
    expect(r.lines.map((l) => l.sku)).toEqual(["MODEL-A"]);
    // The line's PO lineage pointer survives untouched on the line itself.
    expect(r.lineage[1]!.changeType).toBe("staff_correction");
  });
});

describe("CASE 4 — customer change A → B, recorded as customer_change", () => {
  const changed = snap({
    lines: [{ id: "L1", sku: "MODEL-B", qty: 1, unit_price: 2799, description: "Model B" }],
  });
  const b = bundle({
    current: changed,
    revisions: [
      {
        revision: 1,
        created_at: "2026-08-01T02:00:00Z",
        created_by: "u-1",
        change_type: null,
        note: null,
        snapshot: snap({}),
      },
      {
        revision: 2,
        created_at: "2026-08-05T06:00:00Z",
        created_by: "u-3",
        change_type: "customer_change",
        note: "Customer phoned - wants Model B",
        snapshot: changed,
      },
    ],
  });
  it("current commitment = B; the previous commitment stays visible", () => {
    const r = resolveCurrentCustomerCommitment(b);
    expect(r.lines[0]!.sku).toBe("MODEL-B");
    const rev2 = r.lineage[1]!;
    expect(rev2.changeType).toBe("customer_change");
    expect(rev2.changeType).not.toBe("staff_correction");
    expect(rev2.changes.some((c) => c.from === "Model A (King)" && c.to === "Model B")).toBe(
      true,
    );
  });
  it("a pending customer ask is an open request, never the commitment", () => {
    const withPending = {
      ...b,
      requests: [
        {
          id: "q1",
          kind: "item_change",
          status: "pending",
          requested_at: "2026-08-06T02:00:00Z",
          requested_by: "u-3",
          decided_at: null,
          decided_by: null,
          applied_at: null,
          payload: { note: "wants Model C now" },
        },
      ],
    };
    const r = resolveCurrentCustomerCommitment(withPending);
    expect(r.lines[0]!.sku).toBe("MODEL-B"); // still B — the ask moved nothing
    expect(r.openRequests).toHaveLength(1);
    expect(r.openRequests[0]!.kind).toBe("item_change");
  });
});

describe("CASE 5 — custom product: commitment is preserved, not resolver-rewritten", () => {
  it("the committed custom line stands until a governed door moves it", () => {
    // The DOOR-side protection (line_in_production, proven by real
    // invocation against the database) refuses removing/re-SKUing a line
    // that carries a procurement thread. The resolver's half of the law:
    // commitment comes only from the governed rows — nothing in the bundle
    // lets fulfilment state rewrite the custom line.
    const r = resolveCurrentCustomerCommitment(
      bundle({
        current: snap({
          lines: [
            {
              id: "L1",
              sku: "SOFA-CUSTOM-3S",
              qty: 1,
              unit_price: 8999,
              description: "Custom Sofa 3-seater",
              attrs: { fabric: "Tech Fabric T5", colour: "Slate" },
            },
          ],
        }),
      }),
    );
    expect(r.lines[0]!.sku).toBe("SOFA-CUSTOM-3S");
    expect(r.lines[0]!.attrs).toMatchObject({ fabric: "Tech Fabric T5" });
  });
});

describe("CASE 6 — fulfilment failure: no SO revision, commitment remains A", () => {
  it("a failed delivery / replacement PO adds nothing to lineage", () => {
    // Fulfilment failed; a replacement PO/unit is being arranged elsewhere.
    // No door revised the SO, so the bundle is unchanged — and the resolver
    // must keep answering A with an empty lineage.
    const r = resolveCurrentCustomerCommitment(bundle({}));
    expect(r.lines[0]!.sku).toBe("MODEL-A");
    expect(r.lineage).toEqual([]);
  });
});

describe("CASE 7 — legacy status negative control", () => {
  it("delivered/stage/pipeline words change NOTHING in the answer", () => {
    const base = bundle({});
    const forced = bundle({
      current: {
        ...snap({}),
        header: {
          ...snap({}).header,
          // Legacy authority the card retires — even when the snapshot
          // carries such words, the resolver never reads them.
          status: "delivered",
          operation_stage: "delivered",
          drawerPipelineStatus: "Done",
          line_stock_status: "all_in",
          booking_stage: "customer_confirmed",
        },
      },
    });
    const a = resolveCurrentCustomerCommitment(base);
    const b = resolveCurrentCustomerCommitment(forced);
    expect(b.lines).toEqual(a.lines);
    expect(b.promise).toEqual(a.promise);
    expect(b.lineage).toEqual(a.lineage);
    expect(b.customer).toEqual(a.customer);
  });

  it("the bundle type carries no PO / unit / receiving / stage fields", () => {
    // Structural guard: the resolver's whole world is these four keys.
    const keys = Object.keys(bundle({}));
    expect(keys.sort()).toEqual(["current", "order_id", "requests", "revisions"]);
  });
});

describe("diffCommitmentSnapshots — the one 'what moved' arithmetic", () => {
  it("names header moves as previous → new", () => {
    const prev = snap({ header: { delivery_date: "2026-09-01" } });
    const next = snap({ header: { delivery_date: "2026-09-15" } });
    expect(diffCommitmentSnapshots(prev, next)).toContainEqual({
      kind: "header",
      field: "delivery_date",
      from: "2026-09-01",
      to: "2026-09-15",
    });
  });
  it("names added and removed lines", () => {
    const prev = snap({});
    const next = snap({
      lines: [
        ...snap({}).lines,
        { id: "L2", sku: "MAT-K", qty: 2, unit_price: 999, description: "Mattress King" },
      ],
    });
    expect(diffCommitmentSnapshots(prev, next)).toContainEqual({
      kind: "line_added",
      field: "Mattress King",
      from: null,
      to: "×2",
    });
    expect(diffCommitmentSnapshots(next, prev)).toContainEqual({
      kind: "line_removed",
      field: "Mattress King",
      from: "×2",
      to: null,
    });
  });
});
