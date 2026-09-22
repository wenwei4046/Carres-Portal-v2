import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import {
  findCollisions,
  staleBaselineEntries,
  collisionMessage,
} from "./migration-collisions.mjs";

/* The directory is overridable so the gate's own regression test can run THE
   SHIPPED SCRIPT against a fixture instead of a copy of its logic. */
const DEFAULT_DIR = "supabase/migrations";
const dir = process.env.MIGRATIONS_DIR ?? DEFAULT_DIR;
const files = (await readdir(dir)).filter((file) => file.endsWith(".sql")).sort();
const invalid = files.filter((file) => !/^\d{4}[a-z]?_[a-z0-9_]+\.sql$/.test(file));
if (invalid.length) throw new Error(`Invalid migration filenames: ${invalid.join(", ")}`);

/**
 * ⭐ TWO FILES MAY NOT SHARE A MIGRATION NUMBER.
 *
 * Measured 2026-08-24: `0376_the_import_carries_the_suppliers_own_code.sql`
 * merged to `main` while a branch already carried
 * `0376_an_app_that_opened_is_not_a_pdf_that_arrived.sql`. Git saw no conflict
 * — the filenames differ — and THIS SCRIPT PASSED, because it validated the
 * SHAPE of a name and never compared one name to another. The collision was
 * found by hand, against `origin/main`, after CI was already green.
 *
 * The number IS the apply order. Two files claiming one position leaves that
 * order undefined, which is red line 7's whole subject.
 *
 * ── AND THE DAMAGE IS NOT HYPOTHETICAL ──────────────────────────────────────
 *
 * ELEVEN collisions already exist here, and in FIVE of them one file of the
 * pair NEVER APPLIED — measured against `supabase_migrations.schema_migrations`
 * on 2026-08-24:
 *
 *   0165 · `ops_order_control_payments`   NOT APPLIED
 *   0166 · `ops_bulk_complete_orders`     NOT APPLIED
 *   0204 · `pwp_codes_name_binding`       NOT APPLIED
 *   0239 · `counterparty_whatsapp_group`  NOT APPLIED
 *   0242 · `loan_logistics_legs`          NOT APPLIED
 *
 * (0206 · 0232 · 0233 · 0241 · 0255 applied both halves; 0267 applied all
 * three.) Whether those five ever run is a PRODUCTION decision and is reported
 * to the owner, not decided here.
 *
 * They are BASELINED, not fixed: they are committed, and five of them are
 * half-applied. Renumbering would edit committed migrations (red line 6) and
 * would not make the missing halves apply.
 *
 * The baseline is a FIXED LIST rather than "ignore old numbers", so a twelfth
 * cannot join it silently, and a pair that stops colliding must leave it. A
 * suffix letter stays legal — `0376a_…` exists precisely so a follow-up can sit
 * behind a number without taking it.
 */
const COLLISION_BASELINE = new Set([
  "0165", "0166", "0204", "0206", "0232", "0233",
  "0239", "0241", "0242", "0255", "0267",
  /* 0417 · two lanes merged sixteen seconds apart on 2026-09-03 (#1066, then
     #1065) and both carried an 0417. Both halves are committed, so the rename
     path is closed (immutability, red line 6) and the pair is baselined the
     way the eleven above were. Measured state at baselining:
     `the_partner_says_it_cannot_deliver` APPLIED (tracker row carries the
     exact file name) · `the_register_names_the_site_and_the_holder`
     NOT APPLIED — that half is the other lane's apply debt and a production
     decision reported to the owner, not decided here. */
  "0417",
  /* 0424 · two lanes merged eight minutes apart on 2026-09-04 (#1091, then
     #1093) and both carried an 0424. Both halves are committed, so the rename
     path is closed (immutability, red line 6) and the pair is baselined the
     way 0417 was. Measured state at baselining:
     `outbound_hands_over_exact_units_and_the_holder_moves` APPLIED
     (production defines `delivery_order_units_immutable`) ·
     `a_manual_purchase_has_no_number_only_its_po_does` NOT APPLIED —
     that half is Purchasing Card 08's own governed apply step, staged BY
     NAME immediately after this baseline unblocks the deploy. The two
     halves touch disjoint objects (Delivery Order units vs
     purchase_requests), so their relative order is immaterial. */
  "0424",
  /* 0489 · two lanes merged seventeen minutes apart on 2026-09-13 (#1266, then
     #1267) and both carried an 0489. Both halves are committed, so the rename
     path is closed (immutability, red line 6) and the pair is baselined the
     way 0417 and 0424 were. Measured state at baselining: BOTH halves are
     APPLIED and the tracker defines their order —
     `one_sales_order_keeps_one_collection_owner` at 07:30 UTC (Payment, a
     rolled-back probe first) · `proof_is_reviewed_and_every_attempt_keeps_its_evidence`
     at 08:24 UTC (Delivery). The two halves touch disjoint objects
     (payment_collection_owners and its three doors vs Delivery proof/attempt
     evidence), so their relative order is immaterial. */
  "0489",
]);

const collisions = findCollisions(files, COLLISION_BASELINE);
if (collisions.length) throw new Error(collisionMessage(collisions));
/* The baseline describes THE REAL migrations directory, so it is only checked
   against that one. Running the gate over a fixture (its own regression test)
   must not report every historical pair as "no longer colliding". */
if (dir === DEFAULT_DIR) {
  const staleBaseline = staleBaselineEntries(files, COLLISION_BASELINE);
  if (staleBaseline.length) {
    throw new Error(
      `Baselined collision(s) no longer collide; remove them from COLLISION_BASELINE: ${staleBaseline.join(", ")}`,
    );
  }
}

const base = process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : "HEAD^";
let changed = [];
try {
  changed = execFileSync("git", ["diff", "--name-status", `${base}...HEAD`, "--", dir], { encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean);
} catch {
  console.log("No merge base available; filename validation only.");
}
/**
 * CORRECTED BEFORE THEY EVER APPLIED (owner ruling 2026-09-10).
 *
 * Red line 6 protects APPLIED history. These two files were merged in #1200
 * and could never apply anywhere: their sanity blocks compared
 * `pg_get_function_identity_arguments()` — which includes argument NAMES
 * (`p_order_id uuid, …`) — against a types-only string, so the check raised
 * on every run and rolled the whole file back. Production was measured at
 * 0462 with none of 0463's objects present when the correction was made.
 *
 * The exemption is pinned to the corrected content (the git blob id), not to
 * the file name, so any further edit to either file is refused again.
 */
const UNAPPLIED_CORRECTIONS = new Map([
  ["0463_customer_money_reaches_the_ledger.sql", "bed48b6452a27697ae137b526b2c932360b9fff6"],
  ["0466_an_invoice_is_where_revenue_is_recognised.sql", "9550670bb2965b78ba9b01074c67204b9b677acd"],
]);
const isApprovedCorrection = (line) => {
  const [status, path] = line.split("\t");
  const approved = UNAPPLIED_CORRECTIONS.get(path?.split("/").pop());
  if (status !== "M" || !approved) return false;
  return execFileSync("git", ["rev-parse", `HEAD:${path}`], { encoding: "utf8" }).trim() === approved;
};
const altered = changed.filter((line) => !line.startsWith("A\t") && !isApprovedCorrection(line));
if (altered.length) throw new Error(`Committed migrations are immutable; only new files are allowed:\n${altered.join("\n")}`);
/**
 * A dollar-quoted body is CODE THIS MIGRATION DEFINES, not SQL it runs.
 *
 * The guard below exists to stop a migration from destroying production data
 * while it applies. A `delete from` inside `create function … $$ … $$` does
 * nothing at apply time: it is the application's own statement, guarded by its
 * own role checks, floors and transaction, and it runs when a user acts.
 *
 * Without this, the guard forbids ever AMENDING an RPC that prunes rows — and
 * the repository already ships several (`sales_order_save_revision` since 0340,
 * `sales_order_create` since 0327, the purchasing and rental writers). The
 * teeth are unchanged: a bare `drop table` / `truncate` / `delete from` at
 * migration level still fails, and so does one inside a `do $$ … $$` block,
 * which IS executed on apply.
 */
function stripFunctionBodies(sql) {
  return sql
    .replace(/\bdo\s+\$([A-Za-z_][A-Za-z0-9_]*)?\$[\s\S]*?\$\1?\$/gi, (m) => m)
    .replace(
      /\bcreate\s+(?:or\s+replace\s+)?function\b[\s\S]*?\$([A-Za-z_][A-Za-z0-9_]*)?\$[\s\S]*?\$\1?\$/gi,
      "create function <body omitted>",
    );
}

/**
 * A COMMENT EXECUTES NOTHING, so the guard must not read one.
 *
 * Measured 2026-08-20: migration 0367 was blocked by the sentence "it revoked
 * INSERT/UPDATE/ DELETE from `authenticated`" in its own header — prose
 * EXPLAINING a revoke, matched as `delete from`. A guard that fires on the
 * description of a change rather than the change teaches people to stop writing
 * descriptions, which is the opposite of what this repository wants.
 */
function stripComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ");
}

/**
 * REVOKING A PRIVILEGE IS NOT USING IT.
 *
 * `truncate` was matched as a bare word, so `revoke truncate on t from
 * authenticated` — which takes the power to empty a table AWAY — was read as
 * destroying data and blocked. Measured 2026-08-20 on migration 0367, whose
 * whole purpose is to remove write grants a new table inherits by default; the
 * TRUNCATE grant matters there precisely because TRUNCATE empties a table
 * WITHOUT firing the row trigger that refuses a delete.
 *
 * The guard now matches TRUNCATE only where it is a statement VERB — at the
 * start of a statement — so `revoke`/`grant` lists no longer trip it. Its teeth
 * are unchanged: `truncate t;` still fails, including inside a `do $$ … $$`
 * block, which IS executed on apply.
 */
const DESTRUCTIVE = [
  /\bdrop\s+(table|schema|column)\b/i,
  /(^|;)\s*truncate\b/i,
  /\bdelete\s+from\b/i,
];

for (const line of changed.filter((entry) => entry.startsWith("A\t"))) {
  const file = line.slice(2);
  const sql = await readFile(file, "utf8");
  const scanned = stripComments(stripFunctionBodies(sql));
  if (DESTRUCTIVE.some((re) => re.test(scanned))) {
    throw new Error(`${file} contains destructive SQL and requires the governed manual review/apply path.`);
  }
}

/**
 * A GUARD THAT FORCES AN ANSWER MUST REFUSE WHITESPACE.
 *
 * Measured 2026-09-22: one-argument `btrim()` in Postgres trims the SPACE
 * character and nothing else (`btrim(E'\t') = ''` is false), so every guard
 * written as `nullif(btrim(coalesce(x, '')), '') is null`, `btrim(x) = ''` or
 * `length(btrim(x)) = 0` accepted a single tab or a single line break as a
 * real answer. 114 of them, across cancel reasons, party names, delivery
 * numbers, receiver names and evidence paths. `0558` rewrote them all to ask
 * the only question that is actually being asked: does this value contain any
 * character that is NOT whitespace — `coalesce(x, '') !~ '[^[:space:]]'`.
 *
 * NOTHING FAILED WHEN THEY WERE WRONG, and nothing would fail if a future
 * rebuild of one of these functions carried the old shape forward instead:
 * the web forms use JavaScript `.trim()`, which does strip tab and newline, so
 * only a caller that is not the web form ever reaches the hole. A rule that
 * lives in the database needs a check that reads the database's own text.
 *
 * So: for each function below, find the LAST migration that defines it, read
 * THAT body, and count. A count, not a presence — most of these functions
 * guard more than one box, and "contains the string somewhere" would pass with
 * every door but one reverted. Whole-file matching would be vacuous for the
 * same reason: `0558` defines 80 functions in one file.
 *
 * If you legitimately remove a door (the field stops being required), drop its
 * row here in the same commit and say so in the PR.
 */
const BLANK_ANSWER_DOORS = [
  ["_payment_voucher_validate", 1],
  ["_sales_order_proceed", 3],
  ["_set_order_address_0391_locked_impl", 1],
  ["_update_order_0391_locked_impl", 1],
  ["arrival_source_create", 2],
  ["arrival_source_handover", 2],
  ["arrival_source_plan", 1],
  ["commission_reopen_run", 1],
  ["create_rental_agreement", 2],
  ["dealer_invite", 3],
  ["delivery_handover_record", 3],
  ["delivery_leg_document_mint", 1],
  ["delivery_payment_approval_decide", 1],
  ["delivery_payment_approval_request", 1],
  ["delivery_proof_review", 1],
  ["delivery_save_partner_driver", 1],
  ["delivery_save_partner_vehicle", 2],
  ["delivery_set_partner_details", 1],
  ["delivery_template_save", 2],
  ["delivery_trip_document_mint", 1],
  ["finance_exception_clear", 1],
  ["finance_exception_open", 1],
  ["finance_party_create", 1],
  ["finance_party_update", 1],
  ["gl_customer_party_for_order", 1],
  ["gl_money_move_reverse", 1],
  ["issue_record_action_result", 1],
  ["office_receive_post", 2],
  ["operation_abandon_order", 1],
  ["operation_add_annotation", 1],
  ["operation_assign_partner_and_dispatch", 2],
  ["operation_attach_do_and_deliver", 2],
  ["operation_cancel_po", 1],
  ["operation_receive_po_with_do", 2],
  ["operation_receive_threads", 2],
  ["ops_stock_bind_units", 1],
  ["other_debtor_invoice_cancel", 1],
  ["other_receipt_void", 1],
  ["partner_attach_pod", 2],
  ["partner_pickup_threads", 1],
  ["payment_collection_owner_handover", 1],
  ["payment_invoice_void_replace", 1],
  ["payment_record_delivery_date_request", 1],
  ["payment_record_message_sent", 2],
  ["payment_record_storage_inspection", 4],
  ["payment_set_bank_account", 1],
  ["payment_set_collection_timing", 1],
  ["payment_set_storage_rule", 1],
  ["payment_storage_close", 1],
  ["payment_storage_extra_free", 2],
  ["payment_storage_start", 1],
  ["payment_template_save", 2],
  ["payment_void", 1],
  ["payment_voucher_cancel", 1],
  ["payment_voucher_reject", 1],
  ["purchasing_cancel_demand", 1],
  ["purchasing_decide_request", 1],
  ["purchasing_po_document", 1],
  ["purchasing_require_reply_evidence", 3],
  ["receiving_amend", 4],
  ["receiving_arrival_post", 3],
  ["receiving_arrival_void", 1],
  ["receiving_validate_session_extras", 1],
  ["receiving_void", 1],
  ["refund_request", 1],
  ["rental_approve_agreement", 1],
  ["sales_order_create_unchecked_0374", 1],
  ["sales_order_save_revision_unchecked_0354", 1],
  ["sales_order_submit_attribution", 1],
  ["sales_order_withdraw_attribution", 1],
  ["supplier_advance_application_cancel", 1],
  ["supplier_advance_money_back_cancel", 1],
  ["supplier_bill_cancel", 1],
  ["supplier_mark_delivered", 2],
  ["warehouse_import_holiday_calendar", 2],
  ["warehouse_receipt_return", 1],
  ["warehouse_resubmit_receipt", 2],
  ["warehouse_save_special_date", 1],
  ["warehouse_set_site_details", 1],
  ["warehouse_submit_receipt", 2],
];

/* Every `create [or replace] function <name>(` body in one file. */
function functionBodies(sql, fn) {
  const head = new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+(?:public\\.)?${fn}\\s*\\(`, "gi");
  const bodies = [];
  for (let m = head.exec(sql); m; m = head.exec(sql)) {
    const tag = /\bas\s+(\$[A-Za-z_]*\$)/i.exec(sql.slice(m.index, m.index + 4000));
    if (!tag) continue;
    const start = m.index + tag.index + tag[0].length;
    const end = sql.indexOf(tag[1], start);
    bodies.push(sql.slice(start, end < 0 ? sql.length : end));
  }
  return bodies;
}

/* This rule reads THIS repository's own migration history, so it cannot run
   against a fixture directory: the gate's regression test writes one-line
   files that define nothing, and every row below would throw. */
if (dir === DEFAULT_DIR) {
  const sources = new Map();
  for (const file of files) sources.set(file, await readFile(`${dir}/${file}`, "utf8"));
  for (const [fn, want] of BLANK_ANSWER_DOORS) {
    let lastFile = null;
    let lastBody = null;
    for (const file of files) {
      const bodies = functionBodies(sources.get(file), fn);
      if (bodies.length) {
        lastFile = file;
        lastBody = bodies[bodies.length - 1];
      }
    }
    if (!lastBody) {
      throw new Error(`No migration defines ${fn}, so its blank-answer check is stale. Fix the list in this script.`);
    }
    const got = lastBody.split("[^[:space:]]").length - 1;
    if (got < want) {
      throw new Error(
        `${lastFile} is the last definition of ${fn} and it asks for a non-blank answer ${got} time(s), not ${want}. ` +
          `One-argument btrim() trims the space character only, so that guard accepts a tab or a newline as an answer. ` +
          `Use coalesce(x, '') !~ '[^[:space:]]' (0558).`,
      );
    }
  }
}

console.log(`Validated ${files.length} migration filenames and ${changed.length} migration change(s). No migration was applied.`);
