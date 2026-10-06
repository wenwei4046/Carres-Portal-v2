# Supplier Confirmation Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ready-date, tomorrow-arrival, and balance-date actions close only when a structured supplier answer and response evidence are stored together.

**Architecture:** `po_supplier_promises` remains the append-only answer ledger. A private `purchasing-evidence` bucket stores response screenshots/documents. One signed-upload route and one response-evidence schema are reused by all three PO promise doors and later Purchase Returns. SQL write functions snapshot duty/cover/actor authority from Plan 1.

**Tech Stack:** PostgreSQL/Supabase Storage, TypeScript, Hono, React, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-29-purchasing-receiving-work-design.md` §§4–6, 9.

## Global Constraints

- A WhatsApp deep-link open is not evidence and writes no completion fact.
- Historic promise rows remain readable; do not invent missing historic evidence.
- New governed promise rows require a channel, recipient/contact, at least one evidence path, actual actor, and duty context.
- The Purchase Orders UI target is PR #977's `purchase-orders/PurchaseOrdersPage.tsx` after integration; do not build a second register in `OperationPurchaseOrders.tsx`.

---

## Task 1: Define one response-evidence schema

**Files:**
- Create: `packages/shared/src/purchasing-response-evidence.ts`
- Create: `packages/shared/src/purchasing-response-evidence.test.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/src/purchasing-supplier-calls.ts`

- [ ] Write failing tests for accepted channels (`whatsapp`, `email`, `phone`, `other`), non-empty recipient, one or more bucket paths, and answer/date requirements for each promise kind.
- [ ] Add:

```ts
export const purchasingResponseEvidenceInput = z.object({
  channel: z.enum(["whatsapp", "email", "phone", "other"]),
  recipient: z.string().trim().min(1).max(200),
  evidencePaths: z.array(z.string().trim().min(1)).min(1).max(8),
  note: z.string().trim().max(1000).optional(),
});
```

- [ ] Extend the three existing mutation inputs to compose this schema instead of defining local evidence shapes.
- [ ] Add a pure completion helper that returns false for legacy/no-evidence rows and true only for a current structured answer with evidence.
- [ ] Run `pnpm --filter @carres/shared test -- src/purchasing-response-evidence.test.ts src/purchasing-supplier-calls.test.ts`; expected result: pass.
- [ ] Commit: `git add packages/shared && git commit -m "test(purchasing): define supplier response evidence"`.

## Task 2: Create the private evidence bucket and upload door

**Files:**
- Create provisionally: `supabase/migrations/0405_purchasing_response_evidence.sql`
- Create: `apps/api/src/routes/operation/purchasing-evidence.ts`
- Create: `apps/api/src/routes/operation/purchasing-evidence.test.ts`
- Modify: `apps/api/src/index.ts`
- Create: `apps/web/src/lib/purchasing-evidence.ts`
- Create: `apps/web/src/lib/purchasing-evidence.test.ts`

- [ ] Write failing API tests proving only internal authenticated users can request upload URLs, paths are server-generated, and unsupported MIME types/oversized files fail.
- [ ] Create private bucket `purchasing-evidence`, limited to JPEG, PNG, HEIC, WEBP, and PDF, with a 12 MB object limit and internal read/write policies.
- [ ] Add `POST /api/operation/purchasing-evidence/sign-upload` accepting `{ context, sourceId, fileName, contentType }`, where `context` is `supplier-response | purchase-return-handover`.
- [ ] Generate paths as `<context>/<sourceId>/<uuid>.<ext>`; never accept a caller-supplied path.
- [ ] Add `GET /api/operation/purchasing-evidence/signed-url?path=...` with internal read authority and prefix validation.
- [ ] Implement the web upload helper against these endpoints; no direct bucket policy assumptions in page components.
- [ ] Run the API and web helper tests; expected result: pass.
- [ ] Commit: `git add supabase/migrations apps/api apps/web && git commit -m "feat(purchasing): add private response evidence storage"`.

## Task 3: Make all three promise writes evidence-complete and authoritative

**Files:**
- Create provisionally: `supabase/migrations/0406_every_supplier_answer_carries_response_evidence.sql`
- Modify through a new migration: `po_supplier_promises` and the SQL functions called by the three promise routes.
- Modify: `apps/api/src/routes/operation/pos.ts`
- Modify: `apps/api/src/routes/operation/pos.test.ts`

- [ ] Write failing tests for ready date, tomorrow delivery, and balance date proving missing evidence returns 422; ordinary non-duty/non-cover/non-superuser returns 403; Operations Superuser succeeds.
- [ ] Add ledger columns `channel`, `recipient`, `evidence_paths text[]`, `normal_duty_user_id`, `acting_cover_user_id`, `actual_actor_user_id`, `action_authority`, and `evidence_complete boolean`.
- [ ] Keep historic rows valid with `evidence_complete=false`; revoke direct client inserts and make every new write function set `evidence_complete=true` only after validating all evidence fields.
- [ ] Make each function call Plan 1's `operations_actor_may_act(actor, 'po_duty', current_myt_date())` and snapshot the returned context in the same transaction as the promise insert/current-date update.
- [ ] Parse all three route bodies with the shared schema and pass evidence fields to SQL. Do not write promise rows in application code.
- [ ] Add response payload evidence fields so the object history can show the answer, channel, recipient, actor, owner, cover, and evidence links.
- [ ] Run `pnpm --filter @carres/api test -- src/routes/operation/pos.test.ts` and `pnpm ci:migrations`; expected result: pass.
- [ ] Commit: `git add supabase/migrations apps/api && git commit -m "feat(purchasing): require evidence for supplier promises"`.

## Task 4: Add the evidence capture to the canonical Purchase Orders workspace

**Files:**
- Modify after PR #977 integration: `apps/web/src/pages/operation/purchase-orders/PurchaseOrdersPage.tsx`
- Modify: `apps/web/src/pages/operation/purchase-orders/PurchaseOrdersPage.test.tsx`
- Modify: `apps/web/src/lib/queries.ts`
- Create: `apps/web/src/pages/operation/purchase-orders/SupplierResponseEvidenceFields.tsx`
- Create: `apps/web/src/pages/operation/purchase-orders/SupplierResponseEvidenceFields.test.tsx`

- [ ] Write failing component tests proving the save button remains disabled until structured answer/date, channel, recipient, and one uploaded response file exist.
- [ ] Build one reusable evidence field group used by ready date, tomorrow arrival, and balance date forms.
- [ ] Keep WhatsApp launch separate from Save. Launching WhatsApp may prefill the recipient but must not mark evidence complete.
- [ ] Render history evidence links via short-lived signed URLs, with actor and normal duty/cover displayed as distinct facts.
- [ ] Invalidate Purchase Orders and Work queries only after the server confirms the promise transaction.
- [ ] Run `pnpm --filter @carres/web test -- src/pages/operation/purchase-orders/PurchaseOrdersPage.test.tsx src/pages/operation/purchase-orders/SupplierResponseEvidenceFields.test.tsx`; expected result: pass.
- [ ] Commit: `git add apps/web && git commit -m "feat(purchasing): capture supplier response evidence"`.

## Task 5: Supplier confirmation slice verification

- [ ] Run shared, API, and canonical Purchase Orders tests.
- [ ] Run `pnpm typecheck`, `pnpm lint`, and `pnpm ci:migrations`.
- [ ] Search `rg -n "po_supplier_promises" apps packages | sort`; verify every new write enters through one governed SQL function and every completion check requires `evidence_complete`.
- [ ] Verify no UI contains a manual `Complete` control for these actions.
- [ ] Commit verification corrections with `git commit -m "test(purchasing): verify evidenced supplier confirmations"`.
