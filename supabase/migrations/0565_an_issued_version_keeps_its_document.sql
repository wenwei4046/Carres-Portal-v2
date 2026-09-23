-- ---------------------------------------------------------------------------
-- 0565 · AN ISSUED VERSION KEEPS ITS DOCUMENT
--
-- THE RULE, APPROVED / LOCKED (`docs/orders/MASTER.md` § "Old versions and
-- signatures"): a revision prints its OWN stored document, and a missing
-- historical file is STATED, never rebuilt from current data.
--
-- `0564` shipped the half that could be kept with nothing stored: the page and
-- the sheet SAY they are a reconstruction. The owner's correction is that the
-- notice is for the LEGACY case only —
--
--   "Legacy PDFs that were never stored: use the approved reconstructed-copy
--    notice. Newly issued versions after this release: preserve their original
--    issued PDFs as required. A warning does not replace this capability."
--
-- ⛔ AND THE DOCUMENT DOES NOT LIVE ON THE REVISION ROW. The first draft of this
-- file added `document_path` to `sales_order_revisions` and the throwaway
-- replay refused it: `sales_order_revisions_no_rewrite` — *"a revision is never
-- rewritten"*. That guard is right and older than this card, so the document
-- gets its OWN row instead. A revision stays exactly what it was when it was
-- minted, and the paper that was issued for it is a second immutable fact
-- beside it.
--
-- ⭐ WRITTEN ONCE. `(order_id, revision)` is the primary key and there is no
-- UPDATE or DELETE path: not in the RPC, not in a policy, not in the bucket.
-- What the customer was shown does not change afterwards. A document that can
-- be replaced is not evidence of anything.
--
-- ⭐ WHY THE BROWSER PUTS THE BYTES THERE. PDF rendering is WASM and the Worker
-- cannot run it (the same reason `renderDoPdf` lives in `apps/web`). So the API
-- mints a SIGNED upload URL for a path IT chooses — the browser never names the
-- path — the bytes go there, and then this RPC records it, checking the path
-- again against the order and the version it claims to belong to.
--
-- ⭐ IT NEVER BLOCKS A VERSION. If the render or the upload fails, nothing is
-- recorded: the version exists, has no document, and the page draws the
-- reconstruction with its approved notice. Minting a version is business
-- truth; keeping its paper is a separate act that can fail on its own.
--
-- No existing row is read, written or backfilled. No row count is asserted.
-- Every version minted before this file keeps no row here, which is exactly
-- what makes it the reconstruction case.
-- ---------------------------------------------------------------------------

begin;

create table if not exists public.sales_order_revision_documents (
  order_id   uuid        not null references public.orders(id) on delete cascade,
  revision   int         not null,
  path       text        not null,
  bytes      int,
  stored_at  timestamptz not null default now(),
  stored_by  uuid        references auth.users(id),
  primary key (order_id, revision)
);

comment on table public.sales_order_revision_documents is
  '0565 · the PDF a Sales Order version was ISSUED as. One row per version, written once and never rewritten - `sales_order_revisions` itself is immutable (`sales_order_revisions_no_rewrite`), so the paper is recorded beside it rather than on it. No row for a version means no file was ever stored: the legacy case the page draws as a reconstruction and says so.';

alter table public.sales_order_revision_documents enable row level security;

/* READ: the internal roles that may already read a Sales Order. No dealer,
   supplier or partner. WRITE: nobody directly - the recorder below is
   SECURITY DEFINER and is the only door. */
drop policy if exists "revision_documents_read" on public.sales_order_revision_documents;
create policy "revision_documents_read" on public.sales_order_revision_documents for select
to authenticated
using ((select public.app_role()) in ('operation','principal','finance','hr','bd'));

-- ── the bucket ─────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('sales-order-documents', 'sales-order-documents', false)
on conflict (id) do nothing;

/* The sheet carries the customer's name, address and the money, so the same
   internal roles read it and nobody else. There is deliberately NO update or
   delete policy on this bucket. */
drop policy if exists "sales_order_documents_read" on storage.objects;
create policy "sales_order_documents_read" on storage.objects for select
to authenticated
using (
  bucket_id = 'sales-order-documents'
  and (select public.app_role()) in ('operation','principal','finance','hr','bd')
);

-- ── the recorder ───────────────────────────────────────────────────────────
create or replace function public.sales_order_record_revision_document(
  p_order_id uuid,
  p_revision int,
  p_path     text,
  p_bytes    int default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.app_role();
  v_path text := nullif(btrim(coalesce(p_path,'')), '');
begin
  if (v_role is null or v_role not in ('operation','principal')) then
    raise exception 'Operation/Principal only' using errcode = '42501';
  end if;
  if v_path is null then
    raise exception 'A stored document needs its path'
      using errcode = '22023', detail = 'document_path_required';
  end if;
  /* The API names the path from the order and the version; a caller that
     invented one would file a document under a version it does not belong to. */
  if v_path is distinct from ('sales-orders/' || p_order_id::text || '/rev-' || p_revision::text || '.pdf') then
    raise exception 'That path does not belong to this version'
      using errcode = '22023', detail = 'document_path_mismatch';
  end if;
  if not exists (select 1 from sales_order_revisions where order_id = p_order_id and revision = p_revision) then
    raise exception 'Version not found' using errcode = 'P0002';
  end if;

  begin
    insert into sales_order_revision_documents(order_id, revision, path, bytes, stored_by)
    values (p_order_id, p_revision, v_path, nullif(p_bytes, 0), auth.uid());
  exception when unique_violation then
    -- ⭐ WRITTEN ONCE. The paper a customer was issued is not re-issued.
    raise exception 'This version already keeps its issued document'
      using errcode = '22023', detail = 'document_already_stored';
  end;

  return jsonb_build_object('order_id', p_order_id, 'revision', p_revision,
                            'document_path', v_path, 'document_stored_at', now());
end $$;

revoke all on function public.sales_order_record_revision_document(uuid, int, text, int) from public, anon;
grant execute on function public.sales_order_record_revision_document(uuid, int, text, int) to authenticated;

commit;
