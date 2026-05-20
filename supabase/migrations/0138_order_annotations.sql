-- =============================================================================
-- 0138_order_annotations.sql — Phase B: 备注 + 活动记录
-- 2026-05-20 (Jess authorised in conversation per CLAUDE.md §7).
--
-- WHY: Ops team needs a structured communication layer on each order so that
-- handover context never lives only in WhatsApp. Two tables:
--
--   order_annotations  — human-written notes (append-only, never edit/delete).
--                        Optional tag: follow_up | escalate | resolved.
--                        'escalate' surfaces on Jess's dashboard exception inbox.
--
--   ops_activity_log   — system-written audit trail (auto-inserted by RPCs).
--                        Records: autocount_import, inbox_assign, stock_reserve,
--                        stock_release, stock_reassign, stock_takeout,
--                        stock_flag_repair, annotation_added, etc.
--
-- Both tables use order_id uuid (consistent with order_lines, order_addons,
-- order_history, payments — all FK to orders(id) not orders(dl)).
--
-- Two RPCs exposed:
--   operation_add_annotation(order_id, content, tag?)  → json row
--   operation_get_timeline(order_id)                   → json[] merged timeline
--
-- RLS: internal roles (principal / operation / finance / bd) read + write
-- annotations; read activity_log. No UPDATE / DELETE policies on either table.
-- =============================================================================

-- ─── 0. Clean slate — drop any partial tables from a previous failed run ──────
-- Safe: these tables are new (no legacy data). CASCADE removes any orphaned
-- indexes / policies / FK constraints that a partial prior run may have left.
DROP TABLE IF EXISTS order_annotations CASCADE;
DROP TABLE IF EXISTS ops_activity_log   CASCADE;
DROP FUNCTION IF EXISTS public.operation_add_annotation(uuid, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.operation_get_timeline(uuid) CASCADE;

-- ─── 1. order_annotations ─────────────────────────────────────────────────────
CREATE TABLE order_annotations (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   uuid        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  content    text        NOT NULL CHECK (length(trim(content)) BETWEEN 1 AND 2000),
  tag        text        CHECK (tag IN ('follow_up','escalate','resolved')),
  created_by uuid        NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_annotations_order_id
  ON order_annotations(order_id);
CREATE INDEX idx_order_annotations_tag
  ON order_annotations(tag) WHERE tag IS NOT NULL;
CREATE INDEX idx_order_annotations_escalate
  ON order_annotations(created_at DESC) WHERE tag = 'escalate';

-- ─── 2. ops_activity_log ──────────────────────────────────────────────────────
CREATE TABLE ops_activity_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid        REFERENCES orders(id) ON DELETE SET NULL,
  action      text        NOT NULL,          -- e.g. 'inbox_assign', 'stock_reserve'
  actor_id    uuid        REFERENCES auth.users(id),
  detail      jsonb,                          -- action-specific payload
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ops_activity_log_order_id
  ON ops_activity_log(order_id);
CREATE INDEX idx_ops_activity_log_occurred_at
  ON ops_activity_log(occurred_at DESC);

-- ─── 3. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE order_annotations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_activity_log   ENABLE ROW LEVEL SECURITY;

-- annotations: internal roles read + insert; NO update/delete (append-only)
CREATE POLICY annotations_select ON order_annotations FOR SELECT
  USING ((select public.app_role()) IN ('principal','operation','finance','bd'));

CREATE POLICY annotations_insert ON order_annotations FOR INSERT
  WITH CHECK ((select public.app_role()) IN ('principal','operation','finance','bd'));

-- activity_log: internal roles read; only SECURITY DEFINER RPCs insert
CREATE POLICY activity_log_select ON ops_activity_log FOR SELECT
  USING ((select public.app_role()) IN ('principal','operation','finance','bd'));

-- ─── 4. RPC: operation_add_annotation ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.operation_add_annotation(
  p_order_id uuid,
  p_content  text,
  p_tag      text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role    text;
  v_user_id uuid;
  v_row     order_annotations;
BEGIN
  v_role    := (SELECT role FROM public.app_users WHERE id = auth.uid());
  v_user_id := auth.uid();

  IF v_role NOT IN ('principal','operation','finance','bd') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_content IS NULL OR length(trim(p_content)) = 0 THEN
    RAISE EXCEPTION 'content required' USING ERRCODE = '22000';
  END IF;

  IF p_tag IS NOT NULL AND p_tag NOT IN ('follow_up','escalate','resolved') THEN
    RAISE EXCEPTION 'invalid tag: %. Must be follow_up, escalate or resolved', p_tag
      USING ERRCODE = '22000';
  END IF;

  INSERT INTO order_annotations (order_id, content, tag, created_by)
  VALUES (p_order_id, trim(p_content), p_tag, v_user_id)
  RETURNING * INTO v_row;

  -- auto-log so timeline stays unified
  INSERT INTO ops_activity_log (order_id, action, actor_id, detail)
  VALUES (
    p_order_id,
    'annotation_added',
    v_user_id,
    jsonb_build_object('tag', p_tag, 'preview', left(trim(p_content), 60))
  );

  RETURN row_to_json(v_row);
END;
$$;

-- ─── 5. RPC: operation_get_timeline ──────────────────────────────────────────
-- Returns merged timeline (human annotations + system activity) newest-first.
-- Each row shape:
--   { id, kind, content?, tag?, action?, detail?, actor_name, occurred_at }
CREATE OR REPLACE FUNCTION public.operation_get_timeline(
  p_order_id uuid
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  v_role := (SELECT role FROM public.app_users WHERE id = auth.uid());

  IF v_role NOT IN ('principal','operation','finance','bd') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN (
    SELECT COALESCE(json_agg(t ORDER BY t.occurred_at DESC), '[]'::json)
    FROM (
      SELECT
        a.id::text               AS id,
        'annotation'::text       AS kind,
        a.content                AS content,
        a.tag                    AS tag,
        NULL::text               AS action,
        NULL::jsonb              AS detail,
        u.name                   AS actor_name,
        a.created_at             AS occurred_at
      FROM order_annotations a
      LEFT JOIN public.app_users u ON u.id = a.created_by
      WHERE a.order_id = p_order_id

      UNION ALL

      SELECT
        l.id::text               AS id,
        'activity'::text         AS kind,
        NULL::text               AS content,
        NULL::text               AS tag,
        l.action                 AS action,
        l.detail                 AS detail,
        u.name                   AS actor_name,
        l.occurred_at            AS occurred_at
      FROM ops_activity_log l
      LEFT JOIN public.app_users u ON u.id = l.actor_id
      WHERE l.order_id = p_order_id
    ) t
  );
END;
$$;

-- ─── 6. Sanity check ─────────────────────────────────────────────────────────
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name IN ('order_annotations','ops_activity_log')) = 2,
    'order_annotations or ops_activity_log missing';

  ASSERT (SELECT COUNT(*) FROM pg_proc
          WHERE proname IN ('operation_add_annotation','operation_get_timeline')
            AND pronamespace = 'public'::regnamespace) = 2,
    'RPCs missing';

  RAISE NOTICE 'migration 0138 sanity OK';
END;
$$;
