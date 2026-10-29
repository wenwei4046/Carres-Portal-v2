-- =============================================================================
-- 0731 · A disabled login holds no role, and "delivered" needs its real file
--
-- Audit 2026-10-29 (commit 945f667), three holes:
--
--   1. custom_access_token_hook returned the event UNTOUCHED when the account
--      had no active row (0267/0302). The role/dealer_id/partner_id that
--      createUser wrote into raw_app_meta_data therefore stayed in every new
--      token, and the API's authMiddleware reads exactly those claims. Now the
--      hook strips them, so a disabled login's next token carries no role and
--      the API answers 401. (The API side also bans the GoTrue user, so no new
--      token is issued at all; this is the belt to that brace.)
--
--   2. partner_attach_pod and supplier_mark_delivered accepted any non-blank
--      string as the proof file. Now the path must sit under the thread / PO it
--      proves, and the object must exist in its bucket — the same rule the
--      handover route already applies (`handover/<id>/`).
--
--   3. delivery-orders, proof-of-delivery and orders-attachments had no size or
--      type limit, and any login of a store could overwrite another order's
--      payment slip (0006's dealer UPDATE policy keyed on the folder only).
--
-- Bodies below are the LATEST definitions (0302 hook, 0560 RPCs) with only the
-- marked lines changed; every 0560 blank-answer guard is carried forward.
-- =============================================================================

-- ── 1 · the hook strips the role from a non-active account ──────────────────

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_user_id    uuid;
  v_user_row   record;
  v_meta       jsonb;
begin
  v_user_id := (event->>'user_id')::uuid;

  select role::text        as role,
         dealer_id::text    as dealer_id,
         supplier_id::text  as supplier_id,
         partner_id::text   as partner_id,
         outlet_id::text    as outlet_id,
         warehouse_id::text as warehouse_id
    into v_user_row
    from public.app_users
    where id = v_user_id
      and status = 'active';

  -- 0731: no active row → remove what createUser seeded, never pass it through.
  if v_user_row.role is null then
    return jsonb_set(
      event,
      '{claims, app_metadata}',
      coalesce(event #> '{claims, app_metadata}', '{}'::jsonb)
        - 'role' - 'dealer_id' - 'supplier_id' - 'partner_id' - 'outlet_id' - 'warehouse_id',
      true
    );
  end if;

  v_meta := jsonb_strip_nulls(jsonb_build_object(
    'role',         v_user_row.role,
    'dealer_id',    v_user_row.dealer_id,
    'supplier_id',  v_user_row.supplier_id,
    'partner_id',   v_user_row.partner_id,
    'outlet_id',    v_user_row.outlet_id,
    'warehouse_id', v_user_row.warehouse_id
  ));

  return jsonb_set(
    event,
    '{claims, app_metadata}',
    coalesce(event #> '{claims, app_metadata}', '{}'::jsonb) || v_meta,
    true
  );
end;
$function$;

grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from public, anon, authenticated;

-- ── 2a · partner_attach_pod: the POD and signature are this thread's files ──

CREATE OR REPLACE FUNCTION public.partner_attach_pod(p_thread_id uuid, p_pod_path text, p_do_number text, p_do_note text, p_signed boolean, p_signature_url text DEFAULT NULL::text, p_signed_by text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_thread     order_supplier_threads;
  v_partner_id uuid;
  v_user_id    uuid;
  v_prefix     text := p_thread_id::text || '/';
  v_sig        text := nullif(btrim(coalesce(p_signature_url, '')), '');
BEGIN
  v_partner_id := public.app_partner_id();
  v_user_id    := (select auth.uid());

  IF (public.app_role() is null or public.app_role() <> 'partner') THEN
    RAISE EXCEPTION 'forbidden: partner role only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;
  IF v_partner_id IS NULL THEN
    RAISE EXCEPTION 'forbidden: partner_id missing on JWT'
      USING ERRCODE = '42501', DETAIL = 'no_partner_id';
  END IF;

  IF p_signed IS NULL OR p_signed = false THEN
    RAISE EXCEPTION 'customer must sign DO'
      USING ERRCODE = 'P0001', DETAIL = 'do_required';
  END IF;

  IF p_pod_path IS NULL OR coalesce(p_pod_path, '') !~ '[^[:space:]]' THEN
    RAISE EXCEPTION 'pod_path required'
      USING ERRCODE = '22023', DETAIL = 'pod_path_required';
  END IF;

  IF p_do_number IS NULL OR (length(btrim(p_do_number)) < 3 or coalesce(p_do_number, '') !~ '[^[:space:]]') THEN
    RAISE EXCEPTION 'DO number must be at least 3 characters'
      USING ERRCODE = 'P0001', DETAIL = 'do_required';
  END IF;

  -- 0731: the file must be this thread's upload (sign-upload names it
  -- <thread_id>/…) and must really be in the bucket. left() not LIKE, so no
  -- character in the id acts as a wildcard.
  IF left(btrim(p_pod_path), length(v_prefix)) <> v_prefix
     OR NOT EXISTS (SELECT 1 FROM storage.objects
                     WHERE bucket_id = 'proof-of-delivery' AND name = btrim(p_pod_path)) THEN
    RAISE EXCEPTION 'POD file not found for this delivery'
      USING ERRCODE = '22023', DETAIL = 'pod_file_not_found';
  END IF;
  IF v_sig IS NOT NULL
     AND (left(v_sig, length(v_prefix)) <> v_prefix
          OR NOT EXISTS (SELECT 1 FROM storage.objects
                          WHERE bucket_id = 'proof-of-delivery' AND name = v_sig)) THEN
    RAISE EXCEPTION 'signature file not found for this delivery'
      USING ERRCODE = '22023', DETAIL = 'signature_file_not_found';
  END IF;

  SELECT * INTO v_thread FROM order_supplier_threads WHERE id = p_thread_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'thread not found' USING ERRCODE = '42P01', DETAIL = 'thread_not_found';
  END IF;

  IF v_thread.delivery_partner_id IS DISTINCT FROM v_partner_id THEN
    RAISE EXCEPTION 'forbidden: not this partner''s thread'
      USING ERRCODE = '42501', DETAIL = 'cross_tenant';
  END IF;

  IF v_thread.operation_stage IS DISTINCT FROM 'dispatched' THEN
    RAISE EXCEPTION 'thread is not in dispatched state (got %)', v_thread.operation_stage
      USING ERRCODE = '22023', DETAIL = 'wrong_stage';
  END IF;

  UPDATE order_supplier_threads
     SET pod_url           = btrim(p_pod_path),
         pod_do_number     = btrim(p_do_number),
         pod_note          = nullif(btrim(coalesce(p_do_note, '')), ''),
         pod_uploaded_at   = now(),
         pod_uploaded_by   = v_user_id,
         pod_signature_url = v_sig,
         pod_signed_by     = nullif(btrim(coalesce(p_signed_by, '')), ''),
         pod_signed_at     = now(),
         operation_stage   = 'delivered',
         delivered_at      = now(),
         updated_at        = now()
   WHERE id = p_thread_id;

  INSERT INTO order_history (order_id, text, by_role, by_user_id)
  VALUES (
    v_thread.order_id,
    format('POD attached for thread %s · DO %s · signed by %s · stage → delivered',
           p_thread_id, btrim(p_do_number),
           coalesce(nullif(btrim(coalesce(p_signed_by, '')), ''), 'customer')),
    'partner',
    v_user_id
  );

  RETURN jsonb_build_object(
    'thread_id',         p_thread_id,
    'operation_stage',   'delivered',
    'pod_url',           btrim(p_pod_path),
    'pod_do_number',     btrim(p_do_number),
    'pod_signature_url', v_sig,
    'pod_signed_by',     nullif(btrim(coalesce(p_signed_by, '')), '')
  );
END;
$function$;

-- ── 2b · supplier_mark_delivered: the DO file is this PO's file ─────────────

CREATE OR REPLACE FUNCTION public.supplier_mark_delivered(p_po_id text, p_do_number text, p_do_file_path text, p_do_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_po          purchase_orders;
  v_role        app_role;
  v_supplier_id uuid;
  v_uid         uuid;
  v_actor       text;
BEGIN
  v_role        := public.app_role();
  v_supplier_id := public.app_supplier_id();
  v_uid         := (select auth.uid());

  IF (v_role is null or v_role <> 'supplier') THEN
    RAISE EXCEPTION 'forbidden: supplier role only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  IF p_do_number IS NULL OR coalesce(p_do_number, '') !~ '[^[:space:]]' THEN
    RAISE EXCEPTION 'DO number is required'
      USING ERRCODE = '22023', DETAIL = 'missing_do_number';
  END IF;

  IF p_do_file_path IS NULL OR coalesce(p_do_file_path, '') !~ '[^[:space:]]' THEN
    RAISE EXCEPTION 'DO file is required'
      USING ERRCODE = '22023', DETAIL = 'do_file_path_required';
  END IF;

  -- 0731: storage/dos sign-upload names the file <po_id>/…; it must be there.
  IF left(btrim(p_do_file_path), length(p_po_id) + 1) <> p_po_id || '/'
     OR NOT EXISTS (SELECT 1 FROM storage.objects
                     WHERE bucket_id = 'delivery-orders' AND name = btrim(p_do_file_path)) THEN
    RAISE EXCEPTION 'DO file not found for this PO'
      USING ERRCODE = '22023', DETAIL = 'do_file_not_found';
  END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO not found'
      USING ERRCODE = '42P01', DETAIL = 'po_not_found';
  END IF;

  IF v_supplier_id IS NULL OR v_po.supplier_id IS DISTINCT FROM v_supplier_id THEN
    RAISE EXCEPTION 'forbidden: cross-supplier mark-delivered'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  IF v_po.sup_status NOT IN ('pickup_accepted', 'shipped', 'partner_confirmed') THEN
    RAISE EXCEPTION 'PO not in pickup_accepted/shipped/partner_confirmed state (got %)', v_po.sup_status
      USING ERRCODE = '22023', DETAIL = 'wrong_sup_status';
  END IF;

  v_actor := coalesce((SELECT name FROM app_users WHERE id = v_uid), 'Supplier');

  UPDATE purchase_orders
     SET sup_status     = 'delivered',
         do_number      = btrim(p_do_number),
         do_file_path   = btrim(p_do_file_path),
         do_uploaded_at = now(),
         do_uploaded_by = v_uid,
         updated_at     = now()
   WHERE id = p_po_id;

  INSERT INTO po_history (po_id, text, by_role, by_user_id)
  VALUES (
    p_po_id,
    format('DO uploaded · %s%s · file %s',
           btrim(p_do_number),
           CASE WHEN p_do_note IS NOT NULL AND btrim(p_do_note) <> ''
                THEN ' · ' || btrim(p_do_note)
                ELSE '' END,
           btrim(p_do_file_path)),
    'supplier',
    v_uid
  );

  INSERT INTO audit_log (role, actor_text, action, ref)
  VALUES (
    'supplier',
    v_actor,
    format('Marked PO %s delivered (DO %s)', p_po_id, btrim(p_do_number)),
    p_po_id
  );

  RETURN jsonb_build_object(
    'po_id',        p_po_id,
    'sup_status',   'delivered',
    'do_number',    btrim(p_do_number),
    'do_file_path', btrim(p_do_file_path)
  );
END;
$function$;

-- ── 3a · bucket limits ──────────────────────────────────────────────────────
-- Each list is the union of what the app's own sign-upload doors accept today
-- (apps/api/src/routes/storage/dos.ts, partner/pod.ts, operation/*; web
-- lib/storage.ts), so no current upload is refused. proof-of-delivery takes
-- 25 MiB because delivery videos are capped there (DELIVERY_VIDEO_MAX_BYTES).

update storage.buckets
   set file_size_limit    = 10485760,
       allowed_mime_types = array['application/pdf','image/jpeg','image/png','image/webp',
                                  'video/mp4','video/quicktime','video/webm']
 where id = 'delivery-orders';

update storage.buckets
   set file_size_limit    = 26214400,
       allowed_mime_types = array['application/pdf','image/jpeg','image/png','image/webp',
                                  'video/mp4','video/quicktime','video/webm']
 where id = 'proof-of-delivery';

update storage.buckets
   set file_size_limit    = 20971520, -- 20 MiB: receipt pickers upload raw phone photos unchecked
       allowed_mime_types = array['application/pdf','image/jpeg','image/png','image/heic','image/heif']
 where id = 'orders-attachments';

-- ── 3b · a dealer overwrites only the files that login uploaded ─────────────
-- The slip uploader's upsert re-uploads the same key from the same login, so
-- owner_id (set by Storage to the uploader's auth.uid()) keeps that working
-- while a second login of the same store can no longer replace it.

drop policy if exists "orders_attachments_dealer_update" on storage.objects;
create policy "orders_attachments_dealer_update"
on storage.objects for update to authenticated
using (
  bucket_id = 'orders-attachments'
  and (storage.foldername(name))[1] = (select public.app_dealer_id())::text
  and owner_id = (select auth.uid())::text
)
with check (
  bucket_id = 'orders-attachments'
  and (storage.foldername(name))[1] = (select public.app_dealer_id())::text
  and owner_id = (select auth.uid())::text
);
