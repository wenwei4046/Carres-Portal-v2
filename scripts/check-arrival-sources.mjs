/** Local PostgreSQL contract test. Uses PGlite; never connects to Supabase.
 * PGLITE_MODULE may name an isolated installation. This fixture models the
 * existing tables, not the full production migration chain. */
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const { PGlite } = await import(
  process.env.PGLITE_MODULE || "@electric-sql/pglite"
);
const db = new PGlite();
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
await db.exec(`
create role authenticated; create role anon; create schema auth; create schema storage;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create function app_role() returns text language sql as $$select current_setting('test.role',true)$$;
create function is_internal() returns boolean language sql as $$select app_role() in ('operation','principal')$$;
create function is_operation() returns boolean language sql as $$select is_internal()$$;
create table app_users(id uuid primary key);
create table warehouses(id uuid primary key,name text);
create table stock_operating_parties(id uuid primary key,name text,kind text,active boolean default true);
create table supplier_claims(id uuid primary key,claim_no text,customer_resolution text);
create table service_cases(id uuid primary key,case_no text,order_id uuid,evidence jsonb default '[]');
create table ops_stock_items(id uuid primary key default gen_random_uuid(),unit_code text unique,sku text,warehouse_id uuid,status text,supplier text,po_no text,ownership text,qty int default 1,holder_party_id uuid,reserved_ref text,needs_repair boolean default false,sold_order_id uuid,hold_claim_id uuid,hold_reason text,held_at timestamptz,last_verified_at timestamptz,updated_at timestamptz);
create table warehouse_receipts(id uuid primary key,po_id text not null,warehouse_id uuid,actual_site_id uuid,do_number text,do_file_path text,note text,lines jsonb,status text,submitted_from text,goods_received_at date,submitted_by uuid,posted_by uuid,posted_at timestamptz,grn_no text unique,save_key uuid unique,posted_duty_holder uuid,posted_duty_cover uuid,posted_authority text,void_at timestamptz,void_by uuid,void_reason text);
create table receiving_unit_results(id uuid primary key default gen_random_uuid(),receipt_id uuid references warehouse_receipts(id),stock_item_id uuid,unit_code text,outcome text,issue_kind text,note text,created_at timestamptz default now(),unique(receipt_id,stock_item_id));
create table receiving_events(id uuid primary key default gen_random_uuid(),receipt_id uuid,event text,actor_id uuid,payload jsonb);
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(bucket_id text,name text);
alter table storage.objects enable row level security;
create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
create sequence test_codes;
create function allocate_formal_document_code(text,text) returns text language sql as $$select $1||'-20260907-'||nextval('test_codes')::text$$;
create function allocate_unit_id() returns text language sql as $$select 'U1-'||nextval('test_codes')::text$$;
create function receiving_require_post_authority() returns jsonb language plpgsql as $$begin if current_setting('test.duty',true)<>'yes' then raise exception 'not GRN Duty' using errcode='42501'; end if; return jsonb_build_object('normal_user_id',auth.uid(),'acting_user_id',null,'is_superuser',false,'is_cover',false); end$$;
`);
const receiving = await readFile(
  new URL(
    "../supabase/migrations/0426_a_posted_receiving_wears_its_grn_number.sql",
    import.meta.url,
  ),
  "utf8",
);
const start = receiving.indexOf(
  "create or replace function public.receiving_record_unit_results(",
);
await db.exec(receiving.slice(start, receiving.indexOf("$fn$;", start) + 5));
await db.exec(
  await readFile(
    new URL(
      "../supabase/drafts/arrival_sources_and_receiving.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
await db.exec(`create trigger hold_guard before update on ops_stock_items for each row execute function ops_stock_hold_transition_guard();
insert into app_users values('${id(1)}'); insert into warehouses values('${id(2)}','Origin'),('${id(3)}','Destination');
insert into stock_operating_parties(id,name,kind) values('${id(4)}','Origin holder','warehouse_operator'),('${id(5)}','Carrier','delivery_operator'),('${id(6)}','Destination holder','warehouse_operator');
select set_config('test.uid','${id(1)}',false),set_config('test.role','operation',false),set_config('test.duty','yes',false);
`);
const sql = async (q, p = []) => (await db.query(q, p)).rows;
const rpc = async (name, p) =>
  (
    await sql(
      `select ${name}(${p.map((_, i) => "$" + (i + 1)).join(",")}) as result`,
      p,
    )
  )[0].result;
const unit = async (n, over = {}) => {
  const u = {
    id: id(n),
    unit_code: `U1-000-${n}`,
    sku: "fixture",
    warehouse_id: id(2),
    status: "free",
    holder_party_id: id(4),
    qty: 1,
    ...over,
  };
  await sql(
    `insert into ops_stock_items(${Object.keys(u)}) values(${Object.keys(u)
      .map((_, i) => "$" + (i + 1))
      .join(",")})`,
    Object.values(u),
  );
  return u;
};
const source = (n, ids, over = {}) => ({
  id: id(n),
  kind: "transfer",
  claim_id: null,
  case_id: null,
  from_site_id: id(2),
  to_site_id: id(3),
  party_id: id(5),
  expected_date: "2026-09-07",
  collection_date: "2026-09-06",
  reason: "Recorded request",
  unit_ids: ids,
  ...over,
});
const handover = (n, units) => ({
  key: id(n),
  kind: "collected",
  unit_ids: units,
  party_id: id(5),
  person: "Fixture collector",
  occurred_at: "2026-09-06T08:00:00Z",
  evidence: "Signed fixture handover",
});
const receive = (n, units) => ({
  key: id(n),
  goods_received_at: "2026-09-07",
  actual_site_id: id(3),
  holder_party_id: id(6),
  handover_person: "Fixture receiver",
  do_number: "DO-" + n,
  do_file_path: id(100) + "/fixture.pdf",
  note: "",
  units: units.map(([n, outcome = "received", issue_kind = null]) => ({
    stock_item_id: id(n),
    outcome,
    issue_kind,
    note: "",
  })),
});
for (const n of [10, 11, 12]) await unit(n);
const plan = source(100, [id(10), id(11), id(12)]);
const a = await rpc("arrival_source_create", [plan]);
assert.equal(a.id, id(100));
assert.deepEqual(await rpc("arrival_source_create", [plan]), a);
await assert.rejects(
  rpc("arrival_source_create", [{ ...plan, reason: "Different intent" }]),
  /key already used/,
);
await rpc("arrival_source_handover", [
  id(100),
  handover(101, [id(10), id(11)]),
]);
assert.equal(
  (
    await sql("select holder_party_id from ops_stock_items where id=$1", [
      id(12),
    ])
  )[0].holder_party_id,
  id(4),
);
await assert.rejects(
  rpc("arrival_source_plan", [id(100), { reason: "Cancel" }, true]),
  /goods have moved/,
);
await sql("insert into storage.objects values($1,$2)", [
  "arrival-proofs",
  id(100) + "/fixture.pdf",
]);
await sql("select set_config('test.duty','no',false)");
await assert.rejects(
  rpc("receiving_arrival_post", [id(100), receive(102, [[10]])]),
  /not GRN Duty/,
);
await sql("select set_config('test.duty','yes',false)");
const r = await rpc("receiving_arrival_post", [
  id(100),
  receive(102, [
    [10],
    [11, "received_with_issue", "damaged"],
    [12, "not_received"],
  ]),
]);
assert.ok(r.grn_no.startsWith("GRN-"));
assert.equal(r.posted_duty_holder, id(1));
assert.deepEqual(
  (
    await sql(
      "select status,warehouse_id,holder_party_id from ops_stock_items where id=$1",
      [id(12)],
    )
  )[0],
  { status: "free", warehouse_id: id(2), holder_party_id: id(4) },
);
assert.equal(
  (await sql("select status from ops_stock_items where id=$1", [id(11)]))[0]
    .status,
  "on_hold",
);
await assert.rejects(
  rpc("receiving_arrival_post", [id(100), receive(103, [[10]])]),
  /already received/,
);
assert.equal(
  (await sql("select count(*)::int n from warehouse_receipts"))[0].n,
  1,
);
// Repair retains identity; replacement allocates a new one and leaves defect unchanged.
await sql("insert into supplier_claims values($1,$2,$3),($4,$5,$6)", [
  id(20),
  "SC-REPAIR",
  "repair",
  id(21),
  "SC-REPLACE",
  "replace",
]);
await unit(30, {
  status: "on_hold",
  hold_reason: "inspection",
  hold_claim_id: id(20),
});
await unit(31, {
  status: "on_hold",
  hold_reason: "damaged",
  hold_claim_id: id(21),
});
await rpc("arrival_source_create", [
  source(200, [id(30)], { kind: "repair-return", claim_id: id(20) }),
]);
await rpc("arrival_source_handover", [id(200), handover(201, [id(30)])]);
await sql("insert into storage.objects values($1,$2)", [
  "arrival-proofs",
  id(200) + "/fixture.pdf",
]);
await rpc("receiving_arrival_post", [
  id(200),
  { ...receive(202, [[30]]), do_file_path: id(200) + "/fixture.pdf" },
]);
assert.equal(
  (await sql("select status from ops_stock_items where id=$1", [id(30)]))[0]
    .status,
  "on_hold",
);
await rpc("arrival_source_create", [
  source(300, [id(31)], { kind: "supplier-replacement", claim_id: id(21) }),
]);
const replacement = (
  await sql("select * from arrival_source_units where source_id=$1", [id(300)])
)[0];
assert.notEqual(replacement.stock_item_id, id(31));
assert.equal(replacement.replaces_item_id, id(31));
assert.equal(
  (await sql("select status from ops_stock_items where id=$1", [id(31)]))[0]
    .status,
  "on_hold",
);
await assert.rejects(
  rpc("arrival_source_create", [
    source(301, [id(31)], { kind: "supplier-replacement", claim_id: id(21) }),
  ]),
  /open arrival work/,
);
const beforeChange = (
  await sql("select updated_at from ops_stock_items where id=$1", [id(10)])
)[0].updated_at;
await sql(
  "update ops_stock_items set updated_at=updated_at+interval '1 second' where id=$1",
  [id(10)],
);
await assert.rejects(
  rpc("receiving_arrival_void", [r.id, "Unsafe reversal"]),
  /changed after Receiving/,
);
assert.equal(
  (await sql("select status from warehouse_receipts where id=$1", [r.id]))[0]
    .status,
  "posted",
);
await sql("update ops_stock_items set updated_at=$1 where id=$2", [
  beforeChange,
  id(10),
]);
await rpc("receiving_arrival_void", [r.id, "Fixture count corrected"]);
assert.equal(
  (await sql("select status from ops_stock_items where id=$1", [id(10)]))[0]
    .status,
  "transferred",
);
assert.equal(
  (await sql("select status from warehouse_receipts where id=$1", [r.id]))[0]
    .status,
  "voided",
);

await sql(
  "insert into service_cases(id,case_no,order_id,evidence) values($1,$2,$3,$4)",
  [
    id(60),
    "CASE-RETURN",
    id(600),
    JSON.stringify([
      {
        path: "case/photo.jpg",
        kind: "photo",
        slot: "front",
        at: "2026-09-05",
      },
    ]),
  ],
);
await unit(61, { status: "sold", sold_order_id: id(600) });
const approval = {
  approved: true,
  note: "Operation reviewed the remedy and policy",
  photo_date: "2026-09-05",
  evidence_paths: ["case/photo.jpg"],
  condition_required: true,
  passed_conditions: [
    "no_stain",
    "no_liquid_odour",
    "no_pests",
    "sanitary",
    "no_tear_burn_cut",
    "no_customer_damage",
    "correct_item",
    "safe_wrapped",
  ],
};
const ret = source(500, [id(61)], {
  kind: "customer-return",
  case_id: id(60),
  case_approval: approval,
});
await assert.rejects(
  rpc("arrival_source_create", [
    { ...ret, case_approval: { ...approval, passed_conditions: [] } },
  ]),
  /condition check/,
);
await rpc("arrival_source_create", [ret]);
await assert.rejects(
  rpc("arrival_source_handover", [id(500), handover(501, [id(61)])]),
  /photos required/,
);
await sql("insert into storage.objects values($1,$2)", [
  "arrival-proofs",
  id(500) + "/doorstep.jpg",
]);
await rpc("arrival_source_handover", [
  id(500),
  {
    ...handover(502, [id(61)]),
    kind: "collection_refused",
    collection_review: {
      passed_conditions: [],
      evidence_paths: [id(500) + "/doorstep.jpg"],
    },
  },
]);
assert.equal(
  (await sql("select status from ops_stock_items where id=$1", [id(61)]))[0]
    .status,
  "sold",
);
await assert.rejects(
  rpc("arrival_source_handover", [
    id(500),
    { ...handover(505, [id(61)]), kind: "carrier_received" },
  ]),
  /accepted doorstep/,
);
await rpc("arrival_source_handover", [
  id(500),
  {
    ...handover(503, [id(61)]),
    collection_review: {
      passed_conditions: approval.passed_conditions,
      evidence_paths: [id(500) + "/doorstep.jpg"],
    },
  },
]);
await rpc("receiving_arrival_post", [
  id(500),
  { ...receive(504, [[61]]), do_file_path: id(500) + "/doorstep.jpg" },
]);
assert.equal(
  (await sql("select status from ops_stock_items where id=$1", [id(61)]))[0]
    .status,
  "on_hold",
);
await unit(70, { status: "reserved", reserved_ref: "SO-RESERVED" });
await rpc("arrival_source_create", [
  source(700, [id(70)], { sales_order_ref: "SO-RESERVED" }),
]);
await rpc("arrival_source_handover", [id(700), handover(701, [id(70)])]);
await sql("insert into storage.objects values($1,$2)", [
  "arrival-proofs",
  id(700) + "/proof.jpg",
]);
await rpc("receiving_arrival_post", [
  id(700),
  {
    ...receive(702, [[70, "received_with_issue", "damaged"]]),
    do_file_path: id(700) + "/proof.jpg",
  },
]);
assert.deepEqual(
  (
    await sql(
      "select status,reserved_ref,needs_repair from ops_stock_items where id=$1",
      [id(70)],
    )
  )[0],
  { status: "reserved", reserved_ref: "SO-RESERVED", needs_repair: true },
);
// Eligibility is rechecked at handover, after the source was planned.
await unit(80);
await rpc("arrival_source_create", [source(800, [id(80)])]);
await sql("update ops_stock_items set status='sold' where id=$1", [id(80)]);
await assert.rejects(
  rpc("arrival_source_handover", [
    id(800),
    { ...handover(801, [id(80)]), kind: "carrier_received" },
  ]),
  /changed since planning/,
);
assert.equal(
  (
    await sql("select holder_party_id from ops_stock_items where id=$1", [
      id(80),
    ])
  )[0].holder_party_id,
  id(4),
);
// Database privileges and the RPC role gate remain effective without the API.
await db.exec("set role authenticated");
assert.ok((await sql("select count(*)::int n from arrival_sources"))[0].n > 0);
await assert.rejects(
  sql("update arrival_sources set reason='unauthorised'"),
  /permission denied/,
);
await sql("select set_config('test.role','dealer',false)");
assert.equal(
  (await sql("select count(*)::int n from arrival_sources"))[0].n,
  0,
);
await assert.rejects(
  rpc("arrival_source_create", [source(900, [id(80)])]),
  /operation or principal only/,
);
await db.exec("reset role");
console.log(
  "PASS: Case approval, failed condition denial, doorstep refusal without movement, return inspection and reserved Unit protection.",
);
console.log(
  "PASS: source validation, idempotency, partial handover, cancellation guard, GRN Duty, partial/issue receipt, retained holder, duplicate prevention, repair identity, replacement identity.",
);
await db.close();
