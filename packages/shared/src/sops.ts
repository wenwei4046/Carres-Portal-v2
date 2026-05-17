/**
 * SOP (Standard Operating Procedure) state machines for the v3 operation pipeline.
 *
 * Per spec §4.3, two state machines govern post-`awaiting_operation_action` flow:
 *
 *   SOP_STANDARD     — Nice Future Mattress + HoOKkA Bedframe
 *                      awaiting_operation_action → ready_to_dispatch → dispatched → delivered
 *
 *   SOP_SOFA_SPECIAL — HoOKkA Sofa (partner-driven happy path)
 *                      awaiting_operation_action → dispatched → delivered
 *                                              ↘ waiting → delivered
 *
 * SOPs are TS-hardcoded (Loo Q4=B, no DB config layer). Supplier-slug ↔ supplier_id
 * lives in seed.sql; we key by slug here for cross-env stability.
 *
 * Spec source: docs/superpowers/specs/2026-05-04-phase-4-v3-spec.md §4.1-§4.3
 */

export type OperationStageV3 =
  | 'placed'
  | 'proceed_request'
  | 'awaiting_operation_action'
  | 'ready_to_dispatch'
  | 'dispatched'
  | 'waiting'
  | 'delivered';

export type SopName = 'STANDARD' | 'SOFA_SPECIAL';

export interface SopDef {
  name: SopName;
  /** Stages visible in this SOP's kanban, in display order. */
  stages: OperationStageV3[];
  /** Allowed forward transitions (no-op if not present → block). */
  transitions: Array<{ from: OperationStageV3; to: OperationStageV3; rpc: string }>;
}

export const SOP_STANDARD: SopDef = {
  name: 'STANDARD',
  stages: ['awaiting_operation_action', 'ready_to_dispatch', 'dispatched', 'delivered'],
  transitions: [
    { from: 'awaiting_operation_action', to: 'ready_to_dispatch', rpc: 'operation_receive_po_with_do' },
    { from: 'ready_to_dispatch',         to: 'dispatched',        rpc: 'operation_assign_partner_and_dispatch' },
    { from: 'dispatched',                to: 'delivered',         rpc: 'operation_attach_pod_do' },
  ],
};

export const SOP_SOFA_SPECIAL: SopDef = {
  name: 'SOFA_SPECIAL',
  stages: ['awaiting_operation_action', 'ready_to_dispatch', 'waiting', 'dispatched', 'delivered'],
  // Transitions are advisory: (from, to, rpc) tuples document allowed paths.
  // Two transitions sharing (from, rpc) with different `to` is intentional —
  // the receive RPC branches on previous PO sup_status (relocated → waiting,
  // else → ready_to_dispatch). Keeps RPC dispatch consistent with one UI button.
  transitions: [
    // LP Accept happy path: previous sup_status was ready_confirm_sent or partner_confirmed
    { from: 'awaiting_operation_action', to: 'ready_to_dispatch', rpc: 'operation_receive_po_with_do' },
    // LP Reject + Relocate path: previous sup_status was 'relocated'
    { from: 'awaiting_operation_action', to: 'waiting',           rpc: 'operation_receive_po_with_do' },
    // Resume after customer reschedules (Phase 4.5 Chunk 2: thread-scoped, was order-scoped operation_resume_from_waiting in 0045 / Chunk 1)
    { from: 'waiting',                   to: 'ready_to_dispatch', rpc: 'operation_resume_dispatch_from_waiting' },
    // Customer-delivery dispatch (RFD or Force)
    { from: 'ready_to_dispatch',         to: 'dispatched',        rpc: 'operation_dispatch_customer_leg' },
    // Final delivery
    { from: 'dispatched',                to: 'delivered',         rpc: 'operation_attach_pod_do' },
  ],
};

/** SUPPLIER × CATEGORY → SOP. */
export const SUPPLIER_SOP: Record<string, SopDef | { byCategory: Record<string, SopDef> }> = {
  // Use slugs for stability across env (the slug ↔ supplier_id is in seed.sql).
  'nice-future': SOP_STANDARD,
  'hookka':      {
    byCategory: {
      'sofa':     SOP_SOFA_SPECIAL,
      'bedframe': SOP_STANDARD,
    },
  },
};

/** Resolve SOP for a (supplier_slug, sku_category) pair. */
export function sopFor(supplierSlug: string, category: string): SopDef {
  const cfg = SUPPLIER_SOP[supplierSlug];
  if (!cfg) throw new Error(`No SOP for supplier ${supplierSlug}`);
  if ('byCategory' in cfg) {
    const sop = cfg.byCategory[category];
    if (!sop) throw new Error(`No SOP for ${supplierSlug}/${category}`);
    return sop;
  }
  return cfg;
}

/**
 * Procurement tab slugs for the per-supplier kanban shell (Phase 4.5 Chunk 2 Sprint F).
 * Each slug maps to one tab on `/operation/procurement/{slug}`.
 */
export const PROCUREMENT_TAB_SLUGS = ['nice-future', 'hookka-sofa', 'hookka-bedframe'] as const;
export type ProcurementTabSlug = (typeof PROCUREMENT_TAB_SLUGS)[number];

/**
 * Derive the procurement tab slug from a (supplierSlug, category) pair.
 * Returns null if the combination doesn't map to any procurement tab
 * (e.g., legacy supplier or category outside the 3 known channels).
 */
export function deriveProcurementSlug(
  supplierSlug: string,
  category: string,
): ProcurementTabSlug | null {
  if (supplierSlug === 'nice-future') return 'nice-future';
  if (supplierSlug === 'hookka' && category === 'sofa') return 'hookka-sofa';
  if (supplierSlug === 'hookka' && category === 'bedframe') return 'hookka-bedframe';
  return null;
}
