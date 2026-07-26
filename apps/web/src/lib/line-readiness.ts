/**
 * lineReadiness — MOVED to packages/shared (D1, 2026-07-26) together with
 * line-category: the API booking gate and the drawer badge must read ONE rule.
 * This shim keeps every existing `@/lib/line-readiness` import working; the one
 * copy lives in packages/shared/src/line-readiness.ts.
 */
export {
  lineReadiness,
  readinessCounts,
  type LineReadiness,
  type LineReadinessInput,
} from "@carres/shared";
