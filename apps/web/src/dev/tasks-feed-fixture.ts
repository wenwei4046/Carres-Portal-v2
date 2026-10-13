/**
 * A TEST WORK FEED FOR THE SHELL PREVIEWS — DEV ONLY.
 *
 * One signed-in person's work as `/api/operation/work` answers it (contract
 * v2), so the shell's Tasks panel can be walked and measured without a login:
 * late, today, later this week, no date, covered for a colleague, waiting for
 * an answer, and finished today. Every party and number is a TEST value; the
 * sentences are the production rules' own. Dates count from the machine's
 * Malaysia today in Office working days.
 */
import { addWorkingDays, myHolidaySet, type OperationWorkCompleted, type OperationWorkItem, type OperationWorkModule, type OperationWorkResponse } from "@carres/shared";
import { appTodayIso } from "@/lib/fmt-date";

const holidays = myHolidaySet();
function workingDay(from: string, n: number): string {
  if (n >= 0) return addWorkingDays(from, n, { holidays });
  let cur = from, left = -n;
  while (left > 0) {
    const d = new Date(`${cur}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    cur = d.toISOString().slice(0, 10);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6 && !holidays.has(cur)) left -= 1;
  }
  return cur;
}

interface Seed {
  module: OperationWorkModule;
  ruleKey: string;
  kind: string;
  label: string;
  action: string;
  problem: string;
  recipient: string | null;
  /** Office working days from today; `null` = no working date. */
  day: number | null;
  late?: number;
  waiting?: { asked: number; answerBy: number };
  coveredFor?: string;
}

const SEEDS: Seed[] = [
  { module: "purchasing", ruleKey: "purchasing.supplier_date_passed", kind: "purchase_order", label: "PO-261001-9001", action: "Ask TEST Supplier A when the goods will arrive", problem: "Supplier delivery date passed", recipient: "TEST Supplier A", day: -4, late: 4 },
  { module: "purchasing", ruleKey: "purchasing.supplier_date_passed", kind: "purchase_order", label: "PO-260925-9002", action: "Ask TEST Supplier B when the goods will arrive", problem: "Supplier delivery date passed", recipient: "TEST Supplier B", day: -12, late: 12 },
  { module: "purchasing", ruleKey: "purchasing.confirm_tomorrows_delivery", kind: "purchase_order", label: "PO-261006-9003", action: "Click WhatsApp, ask TEST Supplier B for the Supplier DO for PO-261006-9003", problem: "Goods are due tomorrow", recipient: "TEST Supplier B", day: 0 },
  { module: "delivery", ruleKey: "assign_logistics", kind: "sales_order", label: "SO-9104", action: "Call TEST Logistics A", problem: "Logistics not assigned", recipient: "TEST Logistics A", day: 0 },
  { module: "payment", ruleKey: "payment.collect_customer_balance", kind: "sales_order", label: "SO-9105", action: "Ask TEST customer C to pay", problem: "Balance due before delivery", recipient: "TEST customer C", day: 1 },
  { module: "orders", ruleKey: "ask_delivery_date", kind: "sales_order", label: "SO-9106", action: "Call TEST customer D", problem: "No delivery date", recipient: "TEST customer D", day: null },
  { module: "delivery", ruleKey: "confirm_delivery_date", kind: "sales_order", label: "SO-9107", action: "Call TEST Logistics A", problem: "Delivery date not confirmed", recipient: "TEST Logistics A", day: 2, coveredFor: "TEST · Staff B" },
  { module: "purchasing", ruleKey: "purchasing.supplier_reply", kind: "purchase_order", label: "PO-261008-9008", action: "Ask TEST Supplier A to confirm the PO", problem: "Supplier has not answered", recipient: "TEST Supplier A", day: 0, waiting: { asked: -1, answerBy: 1 } },
];

function item(seed: Seed, index: number, me: { id: string; name: string }, today: string): OperationWorkItem {
  const actionOn = seed.day === null ? null : workingDay(today, seed.day);
  const id = `test-${index + 1}`;
  const destination = seed.module === "purchasing" ? `/operation/procurement?po=${seed.label}` : `/operation/orders/so/${id}`;
  return {
    contractVersion: 2,
    id: `${seed.module}:${id}:${seed.ruleKey}`,
    module: seed.module,
    ruleKey: seed.ruleKey,
    ruleVersion: 1,
    object: { kind: seed.kind, id, label: seed.label },
    problem: seed.problem,
    action: seed.action,
    recipient: seed.recipient,
    requiredResult: "The module's own result is recorded",
    completionPredicate: "the owning module's fact exists",
    completionStatement: "The module's own result is recorded",
    owner: seed.coveredFor ? {
      rule: "duty", dutyKey: null,
      normal: { userId: "00000000-0000-4000-8000-0000000000bb", name: seed.coveredFor },
      activeCover: { userId: me.id, name: me.name },
      coverEvidence: { id: "cover-test", startsOn: today, endsOn: today },
      acting: { userId: me.id, name: me.name }, state: "covered",
    } : {
      rule: "duty", dutyKey: null, normal: { userId: me.id, name: me.name }, activeCover: null, coverEvidence: null,
      acting: { userId: me.id, name: me.name }, state: "primary",
    },
    timing: {
      businessDueOn: actionOn,
      actionOn,
      placement: actionOn === null ? "no_working_date" : seed.late ? "missed" : "on_day",
      missedAge: { state: "counted", workingDays: seed.late ?? 0, basis: { calendarKey: "module+person", from: actionOn ?? today, to: today } },
      eligibility: "eligible",
      noDateReason: actionOn === null ? "The owning rule has no working date" : null,
      calendar: {
        module: { key: seed.module, source: seed.module, state: "ready" },
        actor: { key: "person:test", source: "people", state: "ready" },
        holidayName: null,
      },
    },
    communication: null,
    blocker: null,
    nextConsequence: null,
    interaction: { mode: "open_module", fallbackDestination: destination },
    destination,
    observedAt: `${today}T01:00:00.000Z`,
    sourceVersion: `${today}T01:00:00.000Z`,
    tone: seed.late ? "danger" : "warning",
    locked: false,
    broken: false,
    ...(seed.waiting ? { lifecycle: {
      state: "waiting" as const,
      waitingSince: `${workingDay(today, seed.waiting.asked)}T03:00:00.000Z`,
      replyDueOn: workingDay(today, seed.waiting.answerBy),
      replyMissed: false, channel: "whatsapp" as const, contactKind: "supplier" as const, contactId: null, lastReplyAt: null,
    } } : {}),
  } as OperationWorkItem;
}

/** The feed for one signed-in person. `me.id` must be a UUID. */
export function testTasksFeed(me: { id: string; name: string; email: string }): OperationWorkResponse {
  const today = appTodayIso();
  const done = (index: number, module: OperationWorkModule, ruleKey: string, label: string, hourUtc: number): OperationWorkCompleted => ({
    occurrenceId: `${module}:done-${index}:${ruleKey}`, module, ruleKey, actionOn: today, objectLabel: label,
    completedAt: `${today}T0${hourUtc}:15:00.000Z`, completedBy: { userId: me.id, name: me.name }, resultReference: label,
  });
  return {
    contractVersion: 2,
    complete: true,
    generatedOn: today,
    closureReceipt: null,
    staff: [{ userId: me.id, name: me.name, email: me.email }],
    sources: (["orders", "purchasing", "receiving", "delivery", "payment", "issue_tracker"] as const).map((key) => ({
      key, state: "healthy" as const, observedAt: `${today}T01:00:00.000Z`, lastSuccessfulAt: `${today}T01:00:00.000Z`, errorLabel: null,
    })),
    items: SEEDS.map((seed, index) => item(seed, index, me, today)),
    completed: [
      done(1, "purchasing", "purchasing.po_window", "PO-261013-9010", 2),
      done(2, "delivery", "issue_delivery_order", "SO-9099", 1),
    ],
  } as OperationWorkResponse;
}
