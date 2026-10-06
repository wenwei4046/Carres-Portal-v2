import { z } from "zod";
import { addWorkingDays, type WorkingDayOptions } from "./working-days";
import type { IssueIntake } from "./issue-tracker";

/**
 * REPORT A PROBLEM ON A UNIT — Stock MASTER §6 · §12.4, owner-approved design
 * 2026-09-26 (Unit Detail `⋮`).
 *
 * The observer chooses only what they SAW; the Portal derives the Issue
 * facts, the protective control and the one shared Work action. Nothing here
 * asks for Hold, Quarantine, Claim, write-off or a remedy.
 *
 * One arithmetic: the register, Unit Detail, the API and the tests all read
 * these words and sentences from here.
 */

export const unitProblemChoices = [
  { value: "damaged", label: "Damaged", observed: "damaged" },
  { value: "not_found", label: "Not found", observed: "missing" },
  { value: "wrong_item", label: "Wrong item", observed: "wrong_item" },
  { value: "missing_component", label: "Missing component", observed: "wrong_quantity" },
  { value: "label_problem", label: "Label / Unit ID problem", observed: "wrong_information" },
  { value: "something_else", label: "Something else", observed: "not_sure" },
] as const;

export type UnitProblem = (typeof unitProblemChoices)[number]["value"];
export type UnitProblemObserved = (typeof unitProblemChoices)[number]["observed"];

export const unitProblemValues = unitProblemChoices.map((c) => c.value) as [UnitProblem, ...UnitProblem[]];

export function unitProblemChoice(problem: UnitProblem) {
  return unitProblemChoices.find((c) => c.value === problem)!;
}

export const unitProblemEvidenceSchema = z.object({
  path: z.string().min(1),
  kind: z.enum(["photo", "video"]),
});

export const unitProblemReportInputSchema = z.object({
  /** 0526 — one request records at most one Issue; a retry answers with the first. */
  requestId: z.string().uuid(),
  problem: z.enum(unitProblemValues),
  /** The plain factual sentence the observer wrote. */
  note: z.string().trim().min(3).max(300),
  /** At least one photo or video, already uploaded to the `issue-evidence` bucket. */
  evidence: z.array(unitProblemEvidenceSchema).min(1),
  /** Defaults to today in Kuala Lumpur. */
  observedOn: z.string().date().optional(),
}).strict();
export type UnitProblemReportInput = z.infer<typeof unitProblemReportInputSchema>;

export interface UnitProblemUnit {
  id: string;
  unitCode: string;
  productName?: string | null;
  sku: string;
  availability: string;
  status: string;
  reservedRef?: string | null;
  soldOrderId?: string | null;
  siteName?: string | null;
}

/** The plain consequence the form prints BEFORE submit (Stock MASTER §6: "the
 *  Portal explains the consequence"). */
export function unitProblemConsequence(unit: UnitProblemUnit, problem: UnitProblem): string {
  const site = unit.siteName ?? "the Site";
  if (unit.status === "free") {
    return `After you submit, ${unit.unitCode} reads Cannot sell · Waiting inspection until ${site} checks it and records the result.`;
  }
  if (unit.status === "reserved" && unit.reservedRef) {
    return `${unit.unitCode} stays reserved for ${unit.reservedRef}. Sales sees this problem on the order until it is checked.`;
  }
  if (problem === "not_found") {
    return `The problem is recorded and ${site} gets the work to look for ${unit.unitCode}.`;
  }
  return `The problem is recorded and ${site} gets the check as work.`;
}

/** The one shared Work action the report opens, in the governed grammar
 *  (Stock MASTER §6: never `Damaged`, `Not found`, `Review` or `Handle`). */
export function unitProblemAction(
  unit: UnitProblemUnit,
  problem: UnitProblem,
  today: string,
  opts: WorkingDayOptions = {},
): { trigger: string; ownerRule: "grn_duty"; action: string; recipient: string; requiredResult: string; dueOn: string } {
  const site = unit.siteName ?? "the Site";
  const id = unit.unitCode;
  const dueOn = addWorkingDays(today, 1, opts);
  const byProblem: Record<UnitProblem, { trigger: string; action: string; requiredResult: string }> = {
    damaged: {
      trigger: `${id} was reported damaged`,
      action: `Check the damage on ${id} and record the result`,
      requiredResult: "The inspection result is recorded",
    },
    not_found: {
      trigger: `${id} was not found`,
      action: `Look for ${id} at ${site} and scan it again`,
      requiredResult: `${id} is scanned again or reported as not found`,
    },
    wrong_item: {
      trigger: `${id} is not the product on its record`,
      action: `Check ${id} against its PO and record what arrived`,
      requiredResult: "The received product is recorded",
    },
    missing_component: {
      trigger: `${id} is missing parts`,
      action: `Check which parts of ${id} are missing and record them`,
      requiredResult: "The missing parts are recorded",
    },
    label_problem: {
      trigger: `${id} has a label or Unit ID problem`,
      action: `Check the label on ${id} and reprint it if needed`,
      requiredResult: `${id} carries a readable label`,
    },
    something_else: {
      trigger: `${id} needs an evidence check`,
      action: `Check ${id} and record what you find`,
      requiredResult: "The check result is recorded",
    },
  };
  return { ...byProblem[problem], ownerRule: "grn_duty", recipient: site, dueOn };
}

/** The Issue intake the report writes through the ONE Issue door. */
export function unitProblemIntake(
  unit: UnitProblemUnit,
  input: Pick<UnitProblemReportInput, "problem" | "note" | "evidence">,
  foundByName: string,
  observedOn: string,
): IssueIntake {
  const choice = unitProblemChoice(input.problem);
  const item = unit.productName ? `${unit.productName} · ${unit.sku}` : unit.sku;
  const photos = input.evidence.filter((e) => e.kind === "photo").length;
  const videos = input.evidence.filter((e) => e.kind === "video").length;
  const evidence = [
    ...(photos ? [{ kind: "photo" as const, count: photos }] : []),
    ...(videos ? [{ kind: "video" as const, count: videos }] : []),
  ];
  const impact =
    unit.status === "free"
      ? "This Unit cannot be sold until it is checked"
      : unit.status === "reserved" && unit.reservedRef
        ? `Sales Order ${unit.reservedRef} is at risk`
        : "No work was stopped";
  return {
    problemObject: "item",
    observedProblem: choice.observed,
    foundByKind: "warehouse",
    foundByName,
    observedOn,
    linkedObjects: [
      { kind: "unit", id: unit.id, label: unit.unitCode },
      ...(unit.soldOrderId && unit.reservedRef ? [{ kind: "sales_order" as const, id: unit.soldOrderId, label: unit.reservedRef }] : []),
    ],
    affectedObject: `Unit ${unit.unitCode} · ${item}`,
    impact,
    evidence,
    optionalDetail: input.note,
  };
}

/** Count again — a repeat look for a Unit an open `Not found` report names
 *  (Stock MASTER §6: "a repeat creates new evidence and says Count these
 *  Units again"). */
export function unitCountAgainAction(unit: UnitProblemUnit, today: string, opts: WorkingDayOptions = {}) {
  return unitProblemAction(unit, "not_found", today, opts);
}

/** The Make available for sale checks, in the order the confirm dialog prints
 *  them. Every check names why it fails (Stock MASTER §7). */
export function makeAvailableChecks(unit: UnitProblemUnit & { needsRepair?: boolean }, openProblems: number) {
  return [
    { key: "site", label: "Stock Location is recorded", pass: Boolean(unit.siteName), why: "No Site is recorded for this Unit" },
    { key: "problem", label: "No reported problem is still open", pass: openProblems === 0, why: openProblems === 1 ? "1 reported problem is still open" : `${openProblems} reported problems are still open` },
    { key: "repair", label: "Not in repair", pass: !unit.needsRepair, why: "This Unit is in repair" },
    { key: "road", label: "Not on the road", pass: unit.availability !== "in_transit", why: "This Unit is on the road" },
    { key: "reservation", label: "No Sales Order reservation", pass: unit.status !== "reserved", why: `Reserved for ${unit.reservedRef ?? "a Sales Order"}` },
  ];
}
