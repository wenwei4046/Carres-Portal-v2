import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import * as statusModule from "./delivery-work-status";
import {
  deliveryWorkStatusOf,
  deliveryJourneyProgressOf,
  deliveryWorkStatusLabelOf,
  deliveryResultRecorded,
  deliveryFailed,
  deliveryGoodsMoved,
  DELIVERY_WORK_STATUS_KINDS,
  DELIVERY_WORK_STATUS_TONE,
  type DeliveryStatusSpell,
  type DeliveryWorkStatusInput,
} from "./delivery-work-status";
import { DELIVERY_ORDER_STATUS_LABEL } from "./delivery-order-status";
import type { DeliveryHandoverKind } from "./delivery-order-status";

/** A test speller — the words are this module's, the spelling is the caller's. */
const SPELL: DeliveryStatusSpell = {
  date: (iso) => `D(${iso})`,
  dateTime: (iso) => `T(${iso})`,
};

const base: DeliveryWorkStatusInput = {
  partnerName: "NETS",
  confirmedDate: null,
  confirmedTime: null,
  hasDeliveryOrder: false,
  handoverEvents: [],
  attempts: [],
};
const at = (...kinds: DeliveryHandoverKind[]) => kinds.map((kind) => ({ kind }));
const attempt = (
  result: "delivered" | "partial" | "failed",
  reasonKey: string | null = null,
  recordedAt = "2026-08-24T10:00:00Z",
) => ({ result, reasonKey, recordedAt });
const status = (over: Partial<DeliveryWorkStatusInput>) =>
  deliveryWorkStatusOf({ ...base, ...over }, SPELL);
const transfer = { intermediateLeg: true, legStop: "JB transit warehouse" } as const;

/**
 * ⭐ DELIVERY MASTER §8.4 — EVERY ROW OF THE TABLE (owner ruling 2026-09-25).
 * One row here per row there: the recorded facts, line one, its colour, line
 * two. If the law changes, this table changes with it; nothing else may.
 */
const TABLE: Array<{
  facts: string;
  input: Partial<DeliveryWorkStatusInput>;
  line1: string;
  tone: "green" | "orange" | "red" | "none";
  line2: string | null;
}> = [
  { facts: "no partner on the scope", input: { partnerName: null }, line1: "Assign logistics", tone: "orange", line2: null },
  { facts: "partner set, no contact record, the partner contacts the customer", input: {}, line1: "Get delivery date from NETS", tone: "orange", line2: null },
  { facts: "partner set, no contact record, Carres contacts the customer", input: { contactBy: "operation" }, line1: "Get delivery date from customer", tone: "orange", line2: null },
  {
    facts: "latest contact result is Waiting for Customer Reply",
    input: { latestContact: { result: "waiting_customer_reply", recordedOn: "2026-09-08" } },
    line1: "Waiting for customer reply", tone: "orange", line2: "Asked D(2026-09-08)",
  },
  { facts: "scheduled date recorded, no time — a CUSTOMER leg", input: { confirmedDate: "2026-09-14" }, line1: "Scheduled", tone: "green", line2: null },
  { facts: "scheduled date and time — a CUSTOMER leg", input: { confirmedDate: "2026-09-14", confirmedTime: "2 PM to 5 PM" }, line1: "Scheduled", tone: "green", line2: "2 PM to 5 PM" },
  { facts: "scheduled date recorded — a TRANSFER leg", input: { ...transfer, confirmedDate: "2026-09-14", confirmedTime: "9 AM to 12 PM" }, line1: "Transfer scheduled", tone: "none", line2: "9 AM to 12 PM" },
  {
    facts: "DO exists, no handover recorded",
    input: { confirmedDate: "2026-09-14", hasDeliveryOrder: true, handoverDate: "2026-09-13" },
    line1: "Waiting for NETS pickup", tone: "none", line2: "Handover D(2026-09-13)",
  },
  {
    facts: "handed over and the partner's receipt recorded — a CUSTOMER leg",
    input: { hasDeliveryOrder: true, handoverEvents: [{ kind: "handed_over" }, { kind: "received_by_logistics", recordedAt: "2026-09-14T09:30:00Z" }] },
    line1: "Collected by NETS", tone: "none", line2: "Collected T(2026-09-14T09:30:00Z)",
  },
  {
    facts: "handed over and the partner's receipt recorded — a TRANSFER leg",
    input: { ...transfer, hasDeliveryOrder: true, handoverEvents: [{ kind: "received_by_logistics", recordedAt: "2026-09-14T09:30:00Z" }] },
    line1: "Collected for transfer", tone: "none", line2: "Collected T(2026-09-14T09:30:00Z)",
  },
  {
    facts: "collected, and the partner recorded an ETA — a CUSTOMER leg",
    input: { hasDeliveryOrder: true, handoverEvents: at("received_by_logistics"), expectedArrival: "14:30" },
    line1: "On the way to customer", tone: "none", line2: "ETA 14:30",
  },
  {
    facts: "collected, and the partner recorded an ETA — a TRANSFER leg",
    input: { ...transfer, hasDeliveryOrder: true, handoverEvents: at("received_by_logistics"), expectedArrival: "14:30" },
    line1: "In transit to JB transit warehouse", tone: "none", line2: "ETA 14:30",
  },
  {
    facts: "scheduled day passed with no result",
    input: { confirmedDate: "2026-09-10", hasDeliveryOrder: true, handoverEvents: at("received_by_logistics"), todayIso: "2026-09-12" },
    line1: "Overdue", tone: "red", line2: "Ask NETS for the result",
  },
  {
    facts: "attempt delivered on an intermediate Journey leg",
    input: { ...transfer, hasDeliveryOrder: true, attempts: [attempt("delivered")], proof: { photoUploaded: false, signedDoUploaded: false, acceptedOn: null } },
    line1: "Arrived at JB transit warehouse", tone: "green", line2: null,
  },
  {
    facts: "attempt delivered on the CUSTOMER leg, proof accepted",
    input: { hasDeliveryOrder: true, attempts: [attempt("delivered")], proof: { photoUploaded: true, signedDoUploaded: true, acceptedOn: "2026-08-25" } },
    line1: "Delivered to customer", tone: "green", line2: "Proof accepted D(2026-08-25)",
  },
  {
    facts: "attempt delivered on the CUSTOMER leg, photo missing",
    input: { hasDeliveryOrder: true, attempts: [attempt("delivered")], proof: { photoUploaded: false, signedDoUploaded: true, acceptedOn: null } },
    line1: "Delivered to customer", tone: "orange", line2: "Delivery photo not uploaded",
  },
  {
    facts: "attempt failed — a CUSTOMER leg",
    input: { hasDeliveryOrder: true, attempts: [attempt("failed", "customer_unreachable")] },
    line1: "Failed Delivery", tone: "red", line2: "Customer unreachable",
  },
  {
    facts: "attempt partial — a CUSTOMER leg",
    input: { hasDeliveryOrder: true, attempts: [attempt("partial", "customer_unreachable")] },
    line1: "Failed Delivery", tone: "red", line2: "Customer unreachable",
  },
  {
    facts: "attempt failed — a TRANSFER leg",
    input: { ...transfer, hasDeliveryOrder: true, attempts: [attempt("failed", "customer_unreachable")] },
    line1: "Transfer failed", tone: "red", line2: "Customer unreachable",
  },
  {
    facts: "a required Sales fact missing on a Monitor row — the fact, never the deadline",
    input: { missingFacts: ["Building type not recorded"], todayIso: "2026-09-12" },
    line1: "Order details incomplete", tone: "orange", line2: "Building type not recorded",
  },
];

describe("⭐ Delivery MASTER §8.4 — the table, row by row", () => {
  for (const row of TABLE) {
    it(`${row.facts} → ${row.line1}`, () => {
      const s = status(row.input);
      expect(s.label).toBe(row.line1);
      expect(s.tone).toBe(row.tone);
      expect(s.second).toBe(row.line2);
      /* The status IS the label function's word for its kind — never a
         second spelling decided somewhere else. */
      expect(s.label).toBe(
        deliveryWorkStatusLabelOf(s.kind, { partner: row.input.partnerName === undefined ? "NETS" : row.input.partnerName, stop: row.input.legStop }),
      );
    });
  }

  it("every kind of the ladder is reached by a row of the table", () => {
    const reached = new Set(TABLE.map((row) => status(row.input).kind));
    expect([...DELIVERY_WORK_STATUS_KINDS].filter((k) => !reached.has(k))).toEqual([]);
  });

  it("the partner's real name comes from the data; the role word stands in only where none exists", () => {
    expect(status({ partnerName: "AL Logistics" }).label).toBe("Get delivery date from AL Logistics");
    expect(status({ partnerName: "TEOW", hasDeliveryOrder: true }).label).toBe("Waiting for TEOW pickup");
    expect(status({ partnerName: "  ", hasDeliveryOrder: true }).label).toBe("Waiting for logistics pickup");
    expect(status({ partnerName: null, confirmedDate: "2026-09-10", todayIso: "2026-09-12" }).second).toBe(
      "Ask logistics for the result",
    );
  });

  it("an unnamed transfer stop never borrows the customer's town", () => {
    const leg = { intermediateLeg: true, legStop: null, hasDeliveryOrder: true };
    expect(status({ ...leg, attempts: [attempt("delivered")] }).label).toBe("Arrived at warehouse");
    expect(status({ ...leg, handoverEvents: at("received_by_logistics"), expectedArrival: "14:00" }).label).toBe(
      "In transit to warehouse",
    );
  });

  it("a day without a time is a COMPLETE arrangement — no rung asks for a time (owner ruling 2026-09-24)", () => {
    expect(DELIVERY_WORK_STATUS_KINDS).not.toContain("confirm_time");
    const s = status({ confirmedDate: "2026-09-14" });
    expect(s.kind).toBe("confirmed");
    expect(s.second).toBeNull();
  });

  it("the contact deadline is never a sentence on line two — the row owns that fact", () => {
    const s = status({ todayIso: "2026-09-12" });
    expect(s.second).toBeNull();
    expect(s.secondTone).toBeNull();
    expect(Object.keys(s)).toEqual(["kind", "label", "tone", "second", "secondTone", "reasonLabel"]);
  });

  it("without today handed in, no row is ever Overdue — the arithmetic keeps no clock", () => {
    expect(status({ confirmedDate: "2026-09-10", confirmedTime: "9 AM to 12 PM" }).label).toBe("Scheduled");
  });

  it("the LATEST attempt decides — a redelivery after a failure reads Delivered to customer", () => {
    expect(
      status({
        hasDeliveryOrder: true,
        attempts: [
          attempt("failed", "customer_unreachable", "2026-08-20T09:00:00Z"),
          attempt("delivered", null, "2026-08-24T09:00:00Z"),
        ],
      }).label,
    ).toBe("Delivered to customer");
  });

  it("`Proof Accepted` is the ONE fact that turns the result green — every other delivered row is orange (§6.1)", () => {
    const delivered = (proof: DeliveryWorkStatusInput["proof"]) =>
      status({ hasDeliveryOrder: true, handoverEvents: at("received_by_logistics"), attempts: [attempt("delivered")], proof });
    expect(delivered(null).tone).toBe("orange");
    expect(delivered(null).second).toBeNull();
    const pending = delivered({ photoUploaded: true, signedDoUploaded: true, acceptedOn: null, review: { state: "pending", reason: null } });
    expect(pending.second).toBe("Check delivery proof");
    expect(pending.secondTone).toBe("orange");
    const rejected = delivered({ photoUploaded: true, signedDoUploaded: true, acceptedOn: null, review: { state: "rejected", reason: "Photo shows the lobby" } });
    expect(rejected.second).toBe("Proof Rejected · Photo shows the lobby");
    const more = delivered({ photoUploaded: true, signedDoUploaded: true, acceptedOn: null, review: { state: "more_required", reason: "Need the signed paper" } });
    expect(more.second).toBe("More Proof Required · Need the signed paper");
    const noSigned = delivered({ photoUploaded: true, signedDoUploaded: false, acceptedOn: null });
    expect(noSigned.second).toBe("Upload signed Delivery Order");
    /* A missing file still names the file before it names the review. */
    expect(delivered({ photoUploaded: false, signedDoUploaded: true, acceptedOn: null, review: { state: "pending", reason: null } }).second).toBe(
      "Delivery photo not uploaded",
    );
  });

  it("Ready for handover and Handed over WITHOUT the partner's receipt are still the pickup wait", () => {
    expect(status({ hasDeliveryOrder: true, handoverEvents: at("ready_for_handover", "handed_over") }).label).toBe(
      "Waiting for NETS pickup",
    );
  });

  it("only the overdue rung and the two failures are red", () => {
    expect(DELIVERY_WORK_STATUS_KINDS.filter((k) => DELIVERY_WORK_STATUS_TONE[k] === "red")).toEqual([
      "overdue",
      "failed",
      "transfer_failed",
    ]);
  });

  it("the result, failure and goods-moved predicates read the kinds, never the words", () => {
    expect(DELIVERY_WORK_STATUS_KINDS.filter(deliveryResultRecorded)).toEqual(["arrived", "delivered", "failed", "transfer_failed"]);
    expect(DELIVERY_WORK_STATUS_KINDS.filter(deliveryFailed)).toEqual(["failed", "transfer_failed"]);
    expect(DELIVERY_WORK_STATUS_KINDS.filter(deliveryGoodsMoved)).toEqual([
      "collected", "collected_for_transfer", "delivering", "in_transit", "arrived", "delivered", "failed", "transfer_failed",
    ]);
  });
});

describe("the two journey ladders share no word", () => {
  const customer = ["confirmed", "collected", "delivering", "delivered", "failed"] as const;
  const transferKinds = ["transfer_scheduled", "collected_for_transfer", "in_transit", "arrived", "transfer_failed"] as const;

  it("a transfer leg can never print a customer word, and the reverse", () => {
    const customerWords = customer.map((k) => deliveryWorkStatusLabelOf(k, { partner: "NETS", stop: "JB WH" }));
    const transferWords = transferKinds.map((k) => deliveryWorkStatusLabelOf(k, { partner: "NETS", stop: "JB WH" }));
    for (const word of transferWords) expect(customerWords).not.toContain(word);
    for (const word of transferWords) expect(word).not.toMatch(/customer/i);
    for (const word of customerWords) expect(word).not.toMatch(/^Arrived/);
  });

  it("the same facts on both legs land on their own ladder", () => {
    const facts = { hasDeliveryOrder: true, handoverEvents: at("received_by_logistics"), attempts: [attempt("delivered")] };
    expect(status({ ...facts }).kind).toBe("delivered");
    expect(status({ ...facts, ...transfer }).kind).toBe("arrived");
  });
});

describe("journey progress is independent of work urgency", () => {
  it("keeps collection visible when Sales details are missing and the day has passed", () => {
    const input = { ...base, confirmedDate: "2026-09-01", todayIso: "2026-09-14", missingFacts: ["Floor not recorded"], handoverEvents: at("received_by_logistics") };
    expect(deliveryWorkStatusOf(input, SPELL).kind).toBe("details_incomplete");
    expect(deliveryJourneyProgressOf(input, SPELL).label).toBe("Collected by NETS");
  });

  it("does not infer transit from a planned day or a warehouse-only handover", () => {
    const input = { ...base, hasDeliveryOrder: true, handoverEvents: at("handed_over"), expectedArrival: "14:00" };
    expect(deliveryJourneyProgressOf(input, SPELL).kind).toBe("waiting_pickup");
  });

  it("progress is the same status function with the two overlays removed — the same words", () => {
    const input = { ...base, ...transfer, hasDeliveryOrder: true, handoverEvents: at("received_by_logistics"), expectedArrival: "14:00" };
    expect(deliveryJourneyProgressOf(input, SPELL)).toEqual(deliveryWorkStatusOf(input, SPELL));
  });
});

/* ── ⭐ RETIRED FOR GOOD (owner ruling 2026-09-25) ──────────────────────────── */

const RETIRED_WORDS = [
  "Operation must assign logistics",
  "must record the result",
  "Scheduled for",
  "Goods collected by",
  "is delivering to the customer",
  "Confirm delivery time",
  "Transfer confirmed",
  "Delivery failed",
  "Stock risk",
  "Logistics details incomplete",
  "DO not released",
  "Call customer",
  "Out for delivery",
  "Waiting for customer date",
  "Delivery confirmed",
  "Waiting for warehouse",
  "Ready for handover",
] as const;

describe("the retired words never return from the ladder, and no word names a mood", () => {
  /* Every kind × every name shape the label function can be handed. */
  const every = DELIVERY_WORK_STATUS_KINDS.flatMap((k) => [
    deliveryWorkStatusLabelOf(k),
    deliveryWorkStatusLabelOf(k, { partner: "NETS", stop: "JB transit warehouse" }),
  ]);

  it("no retired word, no document word", () => {
    for (const label of every) {
      for (const retired of RETIRED_WORDS) expect(label).not.toContain(retired);
      expect(label).not.toBe(DELIVERY_ORDER_STATUS_LABEL.created);
    }
  });

  it("no mood, no bare Waiting, no dash", () => {
    for (const label of every) {
      expect(label).not.toMatch(/pending|awaiting|in progress|booked|unscheduled/i);
      expect(label).not.toMatch(/^Waiting$/);
      expect(label).not.toMatch(/[—–-]/);
    }
  });

  it("one option per printed word: every kind's role-word label is its own", () => {
    const options = DELIVERY_WORK_STATUS_KINDS.map((k) => deliveryWorkStatusLabelOf(k));
    expect(new Set(options).size).toBe(DELIVERY_WORK_STATUS_KINDS.length);
  });
});

/* ── ⭐ ONE LABEL FUNCTION — NO SECOND PATH (Architecture Law D) ─────────────
   The 2026-09-25 measurement found the register printing one spelling and the
   schedule card another, through two functions over one set of facts. These
   scans make a second path fail the build: the journey words are spelled in
   exactly one source file, the retired relabeller is gone, and no retired word
   survives in source. */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SOURCE_DIRS = ["packages/shared/src", "apps/web/src", "apps/api/src"];
const LADDER_FILE = "packages/shared/src/delivery-work-status.ts";

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === "dist") continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && !full.includes(`${"/"}test${"/"}`)) out.push(full);
    }
  };
  for (const dir of SOURCE_DIRS) walk(join(ROOT, dir));
  return out;
}

describe("⭐ one status function and one label function print every surface", () => {
  const files = sourceFiles().map((full) => ({ path: relative(ROOT, full), text: readFileSync(full, "utf8") }));

  it("the module exports exactly one label function and no relabeller", () => {
    const exported = Object.keys(statusModule);
    expect(exported).toContain("deliveryWorkStatusLabelOf");
    expect(exported).not.toContain("deliveryJourneyProgressFromStatus");
    expect(exported.filter((name) => /Label/.test(name))).toEqual(["deliveryWorkStatusLabelOf"]);
  });

  it("the journey words are spelled in ONE source file", () => {
    const journeyOnly = [
      "Get delivery date from",
      "Transfer scheduled",
      "Collected for transfer",
      "On the way to customer",
      "In transit to",
      "Delivered to customer",
      "Transfer failed",
    ];
    const offenders = files
      .filter((f) => f.path !== LADDER_FILE)
      .flatMap((f) => journeyOnly.filter((w) => f.text.includes(w)).map((w) => `${f.path}: ${w}`));
    expect(offenders).toEqual([]);
  });

  it("no second status derivation survives anywhere", () => {
    /* `confirm_time` survives ONLY in the Monitor URL resolver, which maps a
       stored `?status=confirm_time` link onto `Scheduled` (the URL law). */
    const urlResolver = "apps/web/src/pages/operation/delivery-monitor.ts";
    const offenders = files
      .filter(
        (f) =>
          /function\s+(legWorkStatusOf|deliveryJourneyProgressFromStatus)\b/.test(f.text) ||
          (f.path !== urlResolver && /\bconfirm_time\b/.test(f.text)),
      )
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("no retired word survives in source", () => {
    /* `Delivery failed` survives ONLY as the reason library's catch-all
       logistic reason label (`delivery_failed`), which no ruling has re-worded
       yet; `Out for delivery` and `Ready for handover` are the DOCUMENT
       ladder's own words (§3.1, §4.1) and are checked on the Monitor files
       only, below. */
    const allowed: Record<string, readonly string[]> = {
      "Delivery failed": ["packages/shared/src/delivery-reasons.ts"],
    };
    const monitorOnly = new Set(["Out for delivery", "Ready for handover", "Waiting for warehouse", "Delivery confirmed", "Waiting for customer date"]);
    const monitorFiles = /(delivery-work|delivery-monitor|OperationDelivery|DeliveryBrief|MonitorTwoLines|delivery-work-status)\.(ts|tsx)$/;
    const offenders: string[] = [];
    for (const f of files) {
      for (const word of RETIRED_WORDS) {
        if (monitorOnly.has(word) && !monitorFiles.test(f.path)) continue;
        if (allowed[word]?.includes(f.path)) continue;
        const hit = word === "Call customer" ? /["'`]Call customer["'`]|Open Call customer/.test(f.text) : f.text.includes(word);
        if (hit) offenders.push(`${f.path}: ${word}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
