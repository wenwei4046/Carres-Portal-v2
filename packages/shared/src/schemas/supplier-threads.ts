import { z } from 'zod';

/**
 * Supplier per-thread readiness — POST /api/supplier/threads/:id/ready.
 *
 * Maps to RPC `supplier_mark_thread_ready(p_thread_id uuid)` (migration 0107).
 * The thread uuid lives on the path; the body is empty. `.strict()` rejects
 * any payload so the action stays a clean trigger.
 *
 * Spec: docs/superpowers/plans/2026-05-15-supplier-thread-pickup-plan.md Task 2.
 */
export const markThreadReadyInput = z.object({}).strict();
export type MarkThreadReadyInput = z.infer<typeof markThreadReadyInput>;
