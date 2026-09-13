/**
 * DELIVERY ORDERS REGISTER — the arithmetic, held as tests.
 * Owner UI correction 2026-09-06.
 *
 * The properties the page cannot check for itself:
 *
 *  1. THIS TRIP's goods are the ONE shared derivation (trip_groups NULL = the
 *     whole order) — the same answer the DO page and the print path give.
 *  2. A document sits in at most ONE primary WORK TO DO queue, priority
 *     Record delivery result → Upload delivery photo → Upload signed DO —
 *     and an UNKNOWN photo ledger never invents a missing photo.
 *  3. The rail counts are cross-computed: each group over the other group's
 *     narrowing (Law D — a count is what clicking it produces).
 *  4. A voided document queues nowhere; completed work leaves the queue but
 *     the document stays countable in DOCUMENT STATUS forever.
 */
import { describe, it, expect } from "vitest";
import type { DeliveryOrderAttemptRow, DeliveryOrderRow } from "@/lib/queries";
import {
  buildDoRegisterRails,
  buildDoRegisterRow,
  doRegisterFooter,
  doWorkQueueOf,
  driverSubmissionOf,
  matchesDoFilters,
  submissionFilesOf,
  tripLinesOf,
  type DoRegisterRow,
  groupProofRecords,
  NO_PROOF_REVIEW,
  DO_WORK_QUEUES,
  DO_QUEUE_LABEL,
} from "./delivery-orders-register";

function doRow(over: Partial<DeliveryOrderRow> = {}): DeliveryOrderRow {
  return {
    id: "d-1",
    do_number: "DO-180826-3035",
    issued_at: "2026-08-18T01:47:00Z",
    trip_groups: null,
    delivery_date: "2026-08-20",
    time_slot: "Afternoon (12pm–3pm)",
    logistics_partner: "NETS",
    voided_at: null,
    void_reason: null,
    orders: {
      id: "a-1",
      so: 1322,
      customer_name: "kong chai yin",
      customer_address_city: "Klang",
      customer_address_state: "Selangor",
      delivery_date: "2026-08-25",
      delivery_date_tbd: false,
      do_file_path: null,
      order_lines: [
        { id: "l-1", sku: "mattress:M1401F-K", qty: 1 },
        { id: "l-2", sku: "sofa:S200-3", qty: 1 },
      ],
      ops_order_control: null,
      ...(over.orders ?? {}),
    },
    ...over,
  };
}

function build(
  over: Partial<DeliveryOrderRow> = {},
  attempts: DeliveryOrderAttemptRow[] = [],
  handoverKinds: Array<"ready_for_handover" | "handed_over" | "received_by_logistics"> = [],
): DoRegisterRow {
  const r = doRow(over);
  return buildDoRegisterRow(
    r,
    new Map([[r.do_number, attempts]]),
    new Map([[r.id, handoverKinds]]),
  );
}

const DELIVERED: DeliveryOrderAttemptRow = {
  do_number: "DO-180826-3035",
  result: "delivered",
  reason_key: null,
  recorded_at: "2026-08-20T09:00:00Z",
};

describe("tripLinesOf — one arithmetic with the DO page and the print path", () => {
  const lines = [
    { sku: "mattress:M1401F-K", qty: 1 },
    { sku: "sofa:S200-3", qty: 1 },
  ];

  it("trip_groups NULL or empty = the whole order", () => {
    expect(tripLinesOf(lines, null)).toHaveLength(2);
    expect(tripLinesOf(lines, [])).toHaveLength(2);
  });

  it("a split trip carries only its groups' lines", () => {
    const out = tripLinesOf(lines, ["sofa"]);
    expect(out).toHaveLength(1);
    expect(out[0]!.sku).toBe("sofa:S200-3");
  });
});

describe("the row's facts", () => {
  it("maps the document facts — partner, confirmed date, requested date, goods", () => {
    const row = build();
    expect(row.logisticsPartner).toBe("NETS");
    expect(row.confirmedDelivery).toBe("2026-08-20");
    expect(row.requestedDelivery).toBe("2026-08-25");
    expect(row.customer).toBe("Kong Chai Yin");
    expect(row.lines).toHaveLength(2);
    expect(row.goodsSummary).toContain("×1");
    expect(row.status.kind).toBe("created");
    expect(row.latestResult).toBeNull();
  });

  it("the LATEST attempt is the result — not the first", () => {
    const row = build({}, [
      { ...DELIVERED, result: "failed", reason_key: "customer_unreachable", recorded_at: "2026-08-19T09:00:00Z" },
      DELIVERED,
    ]);
    expect(row.latestResult).toBe("delivered");
  });

  it("the photo ledger: absent = UNKNOWN (null), [] = known-empty, THIS document's rows = present", () => {
    expect(build().photosPresent).toBeNull();
    expect(
      build({ orders: { ...doRow().orders, ops_order_control: { delivery_photos: [] } } })
        .photosPresent,
    ).toBe(false);
    expect(
      build({
        orders: {
          ...doRow().orders,
          ops_order_control: {
            delivery_photos: [
              { path: "p.jpg", at: "t", by: null, doNumber: "DO-180826-3035", kind: "photo" },
            ],
          },
        },
      }).photosPresent,
    ).toBe(true);
  });

  it("a file stamped with ANOTHER document is not this document's photo", () => {
    const row = build({
      orders: {
        ...doRow().orders,
        ops_order_control: {
          delivery_photos: [
            { path: "p.jpg", at: "t", by: null, doNumber: "DO-OTHER", kind: "photo" },
          ],
        },
      },
    });
    expect(row.photosPresent).toBe(false);
    expect(row.submission).toEqual({ known: true, photos: 0, videos: 0, unbound: 0 });
  });
});

/**
 * ⭐ THE BINDING (owner ruling 2026-09-11). The defect these tests exist to
 * keep dead: one Sales Order, two Delivery Orders, ONE ledger - and a register
 * that counted the ledger told both rows the same number.
 */
describe("driverSubmissionOf - what came back from THIS trip", () => {
  const ledger = [
    { path: "a.jpg", at: "1", by: null, doNumber: "DO-A", kind: "photo" as const },
    { path: "b.jpg", at: "2", by: null, doNumber: "DO-A", kind: "photo" as const },
    { path: "c.mp4", at: "3", by: null, doNumber: "DO-A", kind: "video" as const },
    { path: "d.jpg", at: "4", by: null, doNumber: "DO-B", kind: "photo" as const },
    { path: "legacy.jpg", at: "5", by: null },
  ];

  it("counts only the files stamped with this document", () => {
    expect(driverSubmissionOf(ledger, "DO-A")).toEqual({
      known: true,
      photos: 2,
      videos: 1,
      unbound: 1,
    });
    expect(driverSubmissionOf(ledger, "DO-B")).toEqual({
      known: true,
      photos: 1,
      videos: 0,
      unbound: 1,
    });
  });

  it("an ABSENT ledger is UNKNOWN, never a fabricated zero", () => {
    expect(driverSubmissionOf(undefined, "DO-A").known).toBe(false);
    expect(driverSubmissionOf(null, "DO-A").known).toBe(false);
    /* A ledger that arrived and holds nothing is a real zero. */
    expect(driverSubmissionOf([], "DO-A")).toEqual({
      known: true,
      photos: 0,
      videos: 0,
      unbound: 0,
    });
  });

  it("a stamped entry with no kind is the photo it could only have been", () => {
    expect(
      driverSubmissionOf([{ path: "x.jpg", at: "1", doNumber: "DO-A" }], "DO-A"),
    ).toEqual({ known: true, photos: 1, videos: 0, unbound: 0 });
  });

  it("the viewer opens exactly what the count counted (Law D)", () => {
    expect(submissionFilesOf(ledger, "DO-A", "photo").map((f) => f.path)).toEqual([
      "a.jpg",
      "b.jpg",
    ]);
    expect(submissionFilesOf(ledger, "DO-A", "video").map((f) => f.path)).toEqual(["c.mp4"]);
    expect(submissionFilesOf(ledger, "DO-B", "video")).toEqual([]);
    /* An unstamped file belongs to NO document's viewer. */
    expect(
      submissionFilesOf(ledger, "DO-A", "photo").some((f) => f.path === "legacy.jpg"),
    ).toBe(false);
  });
});

describe("doWorkQueueOf — one primary queue, canonical facts only", () => {
  it("out for delivery → Record delivery result, before anything else", () => {
    const row = build({}, [], ["ready_for_handover", "handed_over", "received_by_logistics"]);
    expect(row.status.kind).toBe("out_for_delivery");
    expect(row.queue).toBe("record_result");
  });

  it("a recorded delivery with a KNOWN-empty ledger → Upload delivery photo", () => {
    const row = build(
      { orders: { ...doRow().orders, ops_order_control: { delivery_photos: [] } } },
      [DELIVERED],
    );
    expect(row.queue).toBe("upload_photo");
  });

  it("an UNKNOWN ledger never invents a missing photo — the signed-DO gap queues instead", () => {
    const row = build({}, [DELIVERED]);
    expect(row.photosPresent).toBeNull();
    expect(row.queue).toBe("upload_signed_do");
  });

  it("photo saved + signed DO on file → the upload work is done, and the REVIEW is owed (§6.1, 0489)", () => {
    const row = build(
      {
        orders: {
          ...doRow().orders,
          do_file_path: "do/signed.pdf",
          ops_order_control: {
            delivery_photos: [
              { path: "p.jpg", at: "t", by: null, doNumber: "DO-180826-3035", kind: "photo" },
            ],
          },
        },
      },
      [DELIVERED],
    );
    expect(row.queue).toBe("check_proof");
    expect(row.proofReview.state).toBe("pending");
    expect(row.status.kind).toBe("delivered");
  });

  it("ANOTHER document's photo never closes this document's upload work", () => {
    const row = build(
      {
        orders: {
          ...doRow().orders,
          do_file_path: "do/signed.pdf",
          ops_order_control: {
            delivery_photos: [
              { path: "p.jpg", at: "t", by: null, doNumber: "DO-OTHER", kind: "photo" },
            ],
          },
        },
      },
      [DELIVERED],
    );
    expect(row.queue).toBe("upload_photo");
  });

  it("a created document queues nowhere — nothing is due yet", () => {
    expect(build().queue).toBeNull();
  });

  it("a failed result queues nowhere here — its next Work is the exception's, not an upload", () => {
    const row = build({}, [{ ...DELIVERED, result: "failed", reason_key: "customer_unreachable" }]);
    expect(row.queue).toBeNull();
    expect(row.status.kind).toBe("exception");
  });

  it("a voided document queues nowhere, whatever its history", () => {
    expect(
      doWorkQueueOf({
        status: { kind: "cancelled", label: "Cancelled", reasonLabel: null },
        latestResult: "delivered",
        photosPresent: false,
        signedDoPresent: false,
      }),
    ).toBeNull();
  });
});

describe("§6.1 — the proof review, one arithmetic with Monitor and the DO object", () => {
  const filed = {
    orders: {
      ...doRow().orders,
      do_file_path: "do/signed.pdf",
      do_uploaded_at: "2026-08-21T02:00:00Z",
      ops_order_control: {
        delivery_photos: [
          { path: "p.jpg", at: "2026-08-21T01:00:00Z", by: null, doNumber: "DO-180826-3035", kind: "photo" as const },
        ],
      },
    },
  };
  const review = (decision: "accepted" | "more_required" | "rejected", reviewed_at: string, reason: string | null = null) => ({
    id: `r-${decision}`,
    order_id: doRow().orders.id,
    do_number: "DO-180826-3035",
    attempt_id: null,
    decision,
    reason,
    reviewed_by: null,
    reviewed_at,
  });
  const withReviews = (reviews: ReturnType<typeof review>[]) => {
    const r = doRow(filed);
    return buildDoRegisterRow(
      r,
      new Map([[r.do_number, [DELIVERED]]]),
      new Map([[r.id, []]]),
      groupProofRecords(reviews, []),
    );
  };

  it("`Proof Accepted` leaves every queue and names its day", () => {
    const row = withReviews([review("accepted", "2026-08-22T01:00:00Z")]);
    expect(row.queue).toBeNull();
    expect(row.proofReview).toEqual({ state: "accepted", reason: null, reviewedAt: "2026-08-22T01:00:00Z", label: "Proof Accepted" });
  });

  it("`Proof Rejected` / `More Proof Required` reopen `Upload delivery photo`, carrying the reason", () => {
    const rejected = withReviews([review("rejected", "2026-08-22T01:00:00Z", "The photo shows the lobby")]);
    expect(rejected.queue).toBe("upload_photo");
    expect(rejected.proofReview).toMatchObject({ state: "rejected", reason: "The photo shows the lobby" });
    const more = withReviews([review("more_required", "2026-08-22T01:00:00Z", "Need the signed paper")]);
    expect(more.queue).toBe("upload_photo");
    expect(more.proofReview.state).toBe("more_required");
  });

  it("the LATEST review decides, and a file newer than it reopens the question", () => {
    const superseded = withReviews([
      review("rejected", "2026-08-22T01:00:00Z", "Lobby"),
      review("accepted", "2026-08-23T01:00:00Z"),
    ]);
    expect(superseded.proofReview.state).toBe("accepted");
    const reopened = withReviews([review("accepted", "2026-08-20T23:00:00Z")]);
    expect(reopened.proofReview.state).toBe("pending");
    expect(reopened.queue).toBe("check_proof");
  });

  it("a result that never reached the customer has nothing to review, whatever the ledger holds", () => {
    const r = doRow(filed);
    const row = buildDoRegisterRow(
      r,
      new Map([[r.do_number, [{ ...DELIVERED, result: "failed" as const, reason_key: "customer_unreachable" }]]]),
      new Map([[r.id, []]]),
      groupProofRecords([], []),
    );
    expect(row.proofReview).toEqual(NO_PROOF_REVIEW);
    expect(row.queue).toBeNull();
  });

  it("the rails count the review queue like any other", () => {
    const rows = [withReviews([]), withReviews([review("accepted", "2026-08-22T01:00:00Z")])];
    expect(buildDoRegisterRails(rows, { queue: null, status: null }).work.check_proof).toBe(1);
    expect(DO_WORK_QUEUES).toContain("check_proof");
    expect(DO_QUEUE_LABEL.check_proof).toBe("Check delivery proof");
  });
});

describe("the rails — Law D cross-counting", () => {
  const rows = [
    build(), // created
    build({ id: "d-2", do_number: "DO-2" }, [], ["ready_for_handover", "handed_over", "received_by_logistics"]), // out → record_result
    build(
      { id: "d-3", do_number: "DO-3", orders: { ...doRow().orders, ops_order_control: { delivery_photos: [] } } },
      [{ ...DELIVERED, do_number: "DO-3" }],
    ), // delivered → upload_photo
    build({ id: "d-4", do_number: "DO-4", voided_at: "2026-08-19T02:00:00Z", void_reason: "rescheduled" }), // cancelled
  ];
  // Each build() used its own attempts map, so re-key by do_number for clarity.
  function buildAll(): DoRegisterRow[] {
    return rows;
  }

  it("counts each queue and each status truthfully with nothing picked", () => {
    const rails = buildDoRegisterRails(buildAll(), { queue: null, status: null });
    expect(rails.work.record_result).toBe(1);
    expect(rails.work.upload_photo).toBe(1);
    expect(rails.work.upload_signed_do).toBe(0);
    expect(rails.status.created).toBe(1);
    expect(rails.status.out_for_delivery).toBe(1);
    expect(rails.status.delivered).toBe(1);
    expect(rails.status.cancelled).toBe(1);
    expect(rails.total).toBe(4);
  });

  it("a picked queue narrows the status counts, and a picked status narrows the queues", () => {
    const withQueue = buildDoRegisterRails(buildAll(), { queue: "upload_photo", status: null });
    expect(withQueue.status.delivered).toBe(1);
    expect(withQueue.status.created).toBe(0);
    const withStatus = buildDoRegisterRails(buildAll(), { queue: null, status: "created" });
    expect(withStatus.work.record_result).toBe(0);
    expect(withStatus.work.upload_photo).toBe(0);
  });

  it("matchesDoFilters answers exactly what the counts promised", () => {
    const all = buildAll();
    const photoQueue = all.filter((r) =>
      matchesDoFilters(r, { queue: "upload_photo", status: null }),
    );
    expect(photoQueue.map((r) => r.doNumber)).toEqual(["DO-3"]);
  });
});

describe("the footer", () => {
  it("states narrowed-versus-total explicitly, and the singular truthfully", () => {
    expect(doRegisterFooter(4, 4)).toBe("4 delivery orders");
    expect(doRegisterFooter(1, 4)).toBe("1 of 4 delivery orders");
    expect(doRegisterFooter(1, 1)).toBe("1 delivery order");
  });
});
