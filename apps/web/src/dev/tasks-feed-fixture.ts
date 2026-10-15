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
import { addWorkingDays, internalTaskOccurrenceId, internalTaskResultReference, myHolidaySet, projectInternalTaskWork, type InternalTask, type OperationWorkCompleted, type OperationWorkItem, type OperationWorkModule, type OperationWorkResponse } from "@carres/shared";
import { appTodayIso } from "@/lib/fmt-date";
import type { PoTemplateData } from "@/lib/pdf/types";

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
  /* A Purchase Order is its own number; a Sales Order is an order id. */
  const id = seed.kind === "purchase_order" ? seed.label : `test-${index + 1}`;
  const destination = seed.module === "purchasing" ? `/operation/procurement?po=${seed.label}` : `/operation/orders/so/${id}`;
  return {
    contractVersion: 2,
    id: `${seed.module}:test-${index + 1}:${seed.ruleKey}`,
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

/* ── TEST internal tasks (`+ Task`): one a colleague added for the preview
   person, one the preview person added for the colleague, one finished. ── */
export const TEST_COLLEAGUE = { id: "00000000-0000-4000-8000-0000000000b2", name: "TEST · Staff B", email: "staff-b@carres.local" } as const;
const TASK_FOR_ME = "00000000-0000-4000-8000-0000000000c1";
const TASK_FOR_COLLEAGUE = "00000000-0000-4000-8000-0000000000c2";
const TASK_DONE = "00000000-0000-4000-8000-0000000000c3";

type Person = { id: string; name: string; email: string };
const personOf = (who: { id: string; name: string }) => ({ userId: who.id, name: who.name });

function testInternalTasks(me: Person, today: string): InternalTask[] {
  const base = { detail: null, doneAt: null, doneBy: null } as const;
  const added = (by: { id: string; name: string }, at: string) => [{ event: "added" as const, at, actor: personOf(by) }];
  return [
    { ...base, id: TASK_FOR_ME, title: "TEST · Get the new product photographs", dueOn: today, createdAt: `${today}T01:20:00.000Z`,
      detail: "TEST data. Ask TEST Supplier A for the photographs of the two new models and put them in the shared folder.",
      createdBy: personOf(TEST_COLLEAGUE), assignedTo: personOf(me), events: added(TEST_COLLEAGUE, `${today}T01:20:00.000Z`) },
    { ...base, id: TASK_FOR_COLLEAGUE, title: "TEST · Count the showroom price tags", dueOn: workingDay(today, 1), createdAt: `${today}T02:05:00.000Z`,
      createdBy: personOf(me), assignedTo: personOf(TEST_COLLEAGUE), events: added(me, `${today}T02:05:00.000Z`) },
  ];
}

/** `/api/operation/internal-tasks/:id` for one TEST task. */
export function testInternalTask(id: string, me: Person): InternalTask | null {
  return testInternalTasks(me, appTodayIso()).find((task) => task.id === id) ?? null;
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
    staff: [{ userId: me.id, name: me.name, email: me.email }, { userId: TEST_COLLEAGUE.id, name: TEST_COLLEAGUE.name, email: TEST_COLLEAGUE.email }],
    sources: (["orders", "purchasing", "receiving", "delivery", "payment", "issue_tracker", "workspace"] as const).map((key) => ({
      key, state: "healthy" as const, observedAt: `${today}T01:00:00.000Z`, lastSuccessfulAt: `${today}T01:00:00.000Z`, errorLabel: null,
    })),
    items: [
      ...SEEDS.map((seed, index) => item(seed, index, me, today)),
      /* Internal tasks, in the production projection's own shape. */
      ...projectInternalTaskWork({
        tasks: testInternalTasks(me, today).map(({ id, title, dueOn, createdAt, createdBy, assignedTo }) => ({ id, title, dueOn, createdAt, createdBy, assignedTo })),
        today, observedAt: `${today}T01:00:00.000Z`,
      }),
    ],
    completed: [
      done(1, "purchasing", "purchasing.po_window", "PO-261013-9010", 2),
      done(2, "delivery", "issue_delivery_order", "SO-9099", 1),
      { occurrenceId: internalTaskOccurrenceId(TASK_DONE), module: "workspace", ruleKey: "internal_task", actionOn: today, objectLabel: "TEST · Print the new price list",
        completedAt: `${today}T03:15:00.000Z`, completedBy: { userId: me.id, name: me.name }, resultReference: internalTaskResultReference(TASK_DONE) },
    ],
  } as OperationWorkResponse;
}

/* ── The Purchase Order behind a TEST task, as `/api/operation/pos` answers
   it for one PO: enough for the task's steps, History and Files. ─────────── */

const TEST_SUPPLIERS = [
  { id: "00000000-0000-4000-8000-00000000a001", name: "TEST Supplier A", whatsapp_group_url: "https://chat.whatsapp.com/TEST-GROUP-A" },
  { id: "00000000-0000-4000-8000-00000000a002", name: "TEST Supplier B", whatsapp_group_url: null },
];

/** `/api/operation/suppliers` for the previews. */
export function testTaskSuppliers() {
  return { suppliers: TEST_SUPPLIERS.map((supplier) => ({ ...supplier, kind: "own_logistics", cat_covered: [], lead_time: null })) };
}

/** `/api/operation/pos?poId=…` for one TEST Purchase Order. */
export function testTaskPo(poId: string) {
  const today = appTodayIso();
  const seed = SEEDS.find((candidate) => candidate.label === poId);
  if (!seed || seed.module !== "purchasing") return { pos: [], destinations: [], referencedDestinations: [] };
  const supplier = seed?.recipient === "TEST Supplier B" ? TEST_SUPPLIERS[1]! : TEST_SUPPLIERS[0]!;
  const sentOn = workingDay(today, -6);
  return {
    pos: [{
      id: poId, supplier_id: supplier.id, version: 2, status: "sent",
      official_delivery_date: workingDay(today, seed?.day ?? 0), eta_date: workingDay(today, seed?.day ?? 0),
      destination_id: "w1", warehouse_id: "w1",
      purchase_order_lines: [
        { id: `${poId}-1`, sku: "TEST-MAT-Q", model_name: "TEST Mattress", size: "Queen", qty: 6, received_qty: 2 },
        { id: `${poId}-2`, sku: "TEST-BF-K", model_name: "TEST Bedframe", size: "King", qty: 3, received_qty: 0 },
      ],
      sources: [
        { kind: "sales_order", reference: "SO-9101", order_id: "00000000-0000-4000-8000-000000009101" },
        { kind: "sales_order", reference: "SO-9102", order_id: "00000000-0000-4000-8000-000000009102" },
      ],
      sends: [
        { channel: "whatsapp", note: null, sent_at: `${sentOn}T02:10:00.000Z`, kind: "external_open", recipient: null, po_version: 2, sent_by_name: "TEST · Staff A", po_revisions: null },
        { channel: "whatsapp", note: null, sent_at: `${sentOn}T02:14:00.000Z`, kind: "confirmed_sent", recipient: "TEST group", po_version: 2, sent_by_name: "TEST · Staff A", po_revisions: null },
      ],
      promises: [],
      do_number: null, do_file_path: null, do_uploaded_at: null,
    }],
    destinations: [{ id: "w1", name: "Carres Klang" }],
    referencedDestinations: [],
  };
}

/** Owning PO document read: reuse the same known TEST version and goods facts. */
export function testTaskPoDocument(poId: string): PoTemplateData | null {
  const source = testTaskPo(poId);
  const po = source.pos[0];
  if (!po) return null;
  const supplier = TEST_SUPPLIERS.find((candidate) => candidate.id === po.supplier_id)!;
  return {
    po_id: po.id, po_number: po.id, version: po.version,
    issue_date: po.sends[0]!.sent_at.slice(0, 10),
    supplier: { name: supplier.name, address: null, contact: null },
    destination: { name: source.destinations[0]!.name, address: "TEST destination" },
    delivery_instructions: null, eta_date: po.eta_date,
    so_refs: po.sources.map((item) => Number(item.reference.slice(3))),
    issued_by: "TEST · Staff A",
    lines: po.purchase_order_lines.map((line) => ({
      sku: line.sku, description: `${line.model_name} ${line.size}`,
      qty: line.qty, unit: "pc", identity_mode: "quantity", unit_codes: null,
    })),
    terms: "TEST document only",
  };
}
