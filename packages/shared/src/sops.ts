/**
 * SOP (Standard Operating Procedure) state machines for the v3 logistics pipeline.
 *
 * Per spec §4.3, two state machines govern post-`awaiting_logistics_action` flow:
 *
 *   SOP_STANDARD     — Nice Future Mattress + HoOKkA Bedframe
 *                      awaiting_logistics_action → ready_to_dispatch → dispatched → delivered
 *
 *   SOP_SOFA_SPECIAL — HoOKkA Sofa (partner-driven happy path)
 *                      awaiting_logistics_action → dispatched → delivered
 *                                              ↘ waiting → delivered
 *
 * SOPs are TS-hardcoded (Loo Q4=B, no DB config layer). Supplier-slug ↔ supplier_id
 * lives in seed.sql; we key by slug here for cross-env stability.
 *
 * Spec source: docs/superpowers/specs/2026-05-04-phase-4-v3-spec.md §4.1-§4.3
 */

export type LogisticsStageV3 =
  | 'placed'
  | 'proceed_request'
  | 'awaiting_logistics_action'
  | 'ready_to_dispatch'
  | 'dispatched'
  | 'waiting'
  | 'delivered';

export type SopName = 'STANDARD' | 'SOFA_SPECIAL';

export interface SopDef {
  name: SopName;
  /** Stages visible in this SOP's kanban, in display order. */
  stages: LogisticsStageV3[];
  /** Allowed forward transitions (no-op if not present → block). */
  transitions: Array<{ from: LogisticsStageV3; to: LogisticsStageV3; rpc: string }>;
}

export const SOP_STANDARD: SopDef = {
  name: 'STANDARD',
  stages: ['awaiting_logistics_action', 'ready_to_dispatch', 'dispatched', 'delivered'],
  transitions: [
    { from: 'awaiting_logistics_action', to: 'ready_to_dispatch', rpc: 'logistics_receive_po_with_do' },
    { from: 'ready_to_dispatch',         to: 'dispatched',        rpc: 'logistics_assign_partner_and_dispatch' },
    { from: 'dispatched',                to: 'delivered',         rpc: 'logistics_attach_pod_do' },
  ],
};

export const SOP_SOFA_SPECIAL: SopDef = {
  name: 'SOFA_SPECIAL',
  stages: ['awaiting_logistics_action', 'ready_to_dispatch', 'waiting', 'dispatched', 'delivered'],
  // Transitions are advisory: (from, to, rpc) tuples document allowed paths.
  // Two transitions sharing (from, rpc) with different `to` is intentional —
  // the receive RPC branches on previous PO sup_status (relocated → waiting,
  // else → ready_to_dispatch). Keeps RPC dispatch consistent with one UI button.
  transitions: [
    // LP Accept happy path: previous sup_status was ready_confirm_sent or partner_confirmed
    { from: 'awaiting_logistics_action', to: 'ready_to_dispatch', rpc: 'logistics_receive_po_with_do' },
    // LP Reject + Relocate path: previous sup_status was 'relocated'
    { from: 'awaiting_logistics_action', to: 'waiting',           rpc: 'logistics_receive_po_with_do' },
    // Resume after customer reschedules (Phase 4.5 Chunk 2: thread-scoped, was order-scoped logistics_resume_from_waiting in 0045 / Chunk 1)
    { from: 'waiting',                   to: 'ready_to_dispatch', rpc: 'logistics_resume_dispatch_from_waiting' },
    // Customer-delivery dispatch (RFD or Force)
    { from: 'ready_to_dispatch',         to: 'dispatched',        rpc: 'logistics_dispatch_customer_leg' },
    // Final delivery
    { from: 'dispatched',                to: 'delivered',         rpc: 'logistics_attach_pod_do' },
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
