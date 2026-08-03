-- ============================================================================
-- 0317 — the record stops claiming a send  (Jess, 2026-08-03)
--
-- `docs/ACTION-FLOW-STANDARD.md` **Law 8 — the Observation Law** binds the
-- RECORD, not only the screen:
--
--     The portal records only facts it directly observes.
--     It never records outcomes that happen outside the portal
--     unless they are explicitly confirmed inside the portal.
--
--     Opening an external application, copying text, or generating a file
--     does not prove that the external outcome occurred.
--
-- Phase 3 (PR `7a36f1cb`) fixed the operator's timeline and stopped there.
-- `purchasing_record_send` still wrote two sentences the portal never watched
-- happen:
--
--     po_history : 'sent to Ohana via whatsapp (Revision 1)'
--     audit_log  : 'PO PO-2032 — sent via whatsapp (rev 1)'
--
-- What the portal actually observed was a LINK BEING CLICKED. It did not
-- observe a message leaving, arriving, or being read.
--
-- WHY THIS IS THE HALF THAT MATTERED. Measured 2026-08-03: `po_history` has
-- exactly ONE reader in the whole portal — `apps/api/src/routes/supplier/
-- activity.ts`, the SUPPLIER dashboard, which prints `.text` raw. Policy
-- `po_history_read` (0002) admits a supplier to their own PO's rows. So the
-- claim was not merely wrong on our screen; it was shown to the factory, over
-- our name. A page can be re-rendered. A record cannot be un-written.
--
-- TWO WORDS CHANGE. NOTHING ELSE.
--   `sent … via {channel}`  ->  `{Channel} opened`   the event we observed
--   `Revision N`            ->  `Snapshot N`         `purchase_orders` is never
--       edited by this path (proved 2026-08-03: the ONLY writer of
--       `po_revisions` is this function, and it only ever SELECTs the PO).
--       Git, Google Docs, Office and every ERP mean "the document changed" by
--       `Revision`, so the word kept manufacturing a belief that is false.
--       The STORE keeps its names — `po_revisions` and `rev_no` are internal,
--       and an internal name never defines UI truth (Jess, 2026-08-03).
--
-- `print` IS DELIBERATELY NOT MAPPED (Jess, 2026-08-03): *"Print PDF currently
-- records nothing by approved business rule. If `print` is unreachable today,
-- leave the branch untouched. Do not add `Print opened`, `PDF generated`, or
-- any new copy."* It falls through to the stored value — exactly what this
-- function already interpolated — so this migration introduces no new copy for
-- it. Print recording belongs to another card.
--
-- NO BACKFILL. The two existing rows are test data (CLAUDE.md's clean-start
-- law); nothing is rewritten and nothing is deleted. A guard below fails the
-- migration if either is ever touched.
--
-- NOT CHANGED, on purpose: the signature · the gate · the CHECK · the snapshot
-- payload · the revision-minting rule · the policies · the grants · every
-- table, column and route name.
--
-- VERIFIED BEFORE APPLYING — in a rolled-back transaction on production, as a
-- real `operation` user (`shasha@carres.com`) through the live gate:
--   · both doors called; 4 records written; all 4 free of `sent` and `Revision`
--   · exact sentences asserted:
--       'WhatsApp opened · Snapshot 1' · 'Email opened · Snapshot 1'
--       'PO PO-2032 — WhatsApp opened · Snapshot 1'
--   · the two 2026-08-02 rows still read `sent to …` — proof of NO backfill
--   · NEGATIVE CONTROL: the same harness run against the OLD function fails
--     with `A2 FAIL: 2 new record(s) still claim a send or a Revision`
--   · rollback verified total (md5(prosrc) unchanged, 2 sends, 1 revision)
-- ============================================================================

create or replace function public.purchasing_record_send(
  p_po_id   text,
  p_channel text,
  p_note    text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_role  app_role;
  v_uid   uuid;
  v_actor text;
  v_po    purchase_orders;
  v_snap  jsonb;
  v_last  po_revisions;
  v_rev   po_revisions;
  v_door  text;
begin
  v_role := public.purchasing_supplier_call_gate();
  v_uid  := auth.uid();

  if p_channel is null or p_channel not in ('whatsapp','email','print') then
    raise exception 'channel must be whatsapp, email or print'
      using errcode = '22023', detail = 'invalid_channel';
  end if;

  select * into v_po from purchase_orders where id = p_po_id for update;
  if not found then
    raise exception 'PO % not found', p_po_id using errcode = '42P01', detail = 'po_not_found';
  end if;

  -- What the supplier is being given, right now: the facts that change what
  -- they must DO — the date, where it goes, and every line.
  select jsonb_build_object(
           'eta_date',       v_po.eta_date,
           'destination_id', v_po.destination_id,
           'lines', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'sku', l.sku, 'qty', l.qty, 'destination_id', l.destination_id
                    ) order by l.sku, l.id)
               from purchase_order_lines l where l.po_id = p_po_id), '[]'::jsonb)
         ) into v_snap;

  select * into v_last from po_revisions
   where po_id = p_po_id order by rev_no desc limit 1;

  if v_last.id is null or v_last.snapshot is distinct from v_snap then
    insert into po_revisions (po_id, rev_no, snapshot, created_by)
    values (p_po_id, coalesce(v_last.rev_no, 0) + 1, v_snap, v_uid)
    returning * into v_rev;
  else
    -- Unchanged since the last time: the supplier is not being asked to
    -- replace anything, so this is the SAME snapshot.
    v_rev := v_last;
  end if;

  insert into po_sends (po_id, revision_id, channel, note, sent_by)
  values (p_po_id, v_rev.id, p_channel, nullif(btrim(coalesce(p_note, '')), ''), v_uid);

  -- Only the two doors Jess ruled get a word. `print` falls through to the
  -- stored value — no new copy is invented for a branch nothing can reach.
  v_door := case p_channel
              when 'whatsapp' then 'WhatsApp'
              when 'email'    then 'Email'
              else p_channel
            end;
  v_actor := coalesce((select name from app_users where id = v_uid), initcap(v_role::text));

  insert into po_history (po_id, text, by_role)
  values (p_po_id, format('%s opened · Snapshot %s', v_door, v_rev.rev_no), v_role);
  insert into audit_log (role, actor_text, action, ref)
  values (v_role, v_actor,
          format('PO %s — %s opened · Snapshot %s', p_po_id, v_door, v_rev.rev_no),
          p_po_id);

  return jsonb_build_object('po_id', p_po_id, 'channel', p_channel, 'revision', v_rev.rev_no);
end;
$function$;

-- ---------------------------------------------------------------------------
-- sanity — the retired words can never come back through this door
-- ---------------------------------------------------------------------------
do $$
declare v_src text;
begin
  select prosrc into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'purchasing_record_send';

  if v_src ~* 'sent to |sent via' then
    raise exception '0317: purchasing_record_send still writes a send claim';
  end if;
  if v_src ~ 'Revision' then
    raise exception '0317: purchasing_record_send still writes the word Revision';
  end if;
  if v_src !~ 'Snapshot %s' then
    raise exception '0317: the observed-event sentence is missing';
  end if;
  -- A defaulted parameter mints a SECOND signature (rule 8, learned on 0310).
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'purchasing_record_send') <> 1 then
    raise exception '0317: exactly ONE signature must survive';
  end if;
  -- NO BACKFILL: the historical rows stay exactly as they were written.
  if (select count(*) from po_history where text like 'sent to %') <> 2 then
    raise exception '0317: a historical row was rewritten — this card backfills nothing';
  end if;
end $$;
