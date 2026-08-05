// Malaysian Ringgit currency formatters used across Finance + dealer pages.
// Hoisted from per-page duplicates after the 4th copy landed (FinanceAR /
// FinanceDashboard / FinancePayments / ARDrawer all carried identical bodies).
//
// C11 (2026-08-05) — `rm` is now the SHARED `fmtMoney`, re-exported rather than
// re-implemented. The body here and the one in `packages/shared` were already
// character-identical in output; keeping two was the arrangement that let a
// third spelling (a rounding one) grow beside them and reach five live screens.
// One concern, one file: `packages/shared/src/money-format.ts`. A test asserts
// this export IS that function, so the two cannot drift apart again.

import { fmtMoney } from "@carres/shared";

export { fmtMoney as rm };

export function rmCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `RM ${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000)     return `RM ${(n / 1_000).toFixed(1)}k`;
  return fmtMoney(n);
}
