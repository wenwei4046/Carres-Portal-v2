// Malaysian Ringgit currency formatters used across Finance + dealer pages.
// Hoisted from per-page duplicates after the 4th copy landed (FinanceAR /
// FinanceDashboard / FinancePayments / ARDrawer all carried identical bodies).

export function rm(n: number): string {
  return "RM " + (n || 0).toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function rmCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `RM ${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000)     return `RM ${(n / 1_000).toFixed(1)}k`;
  return rm(n);
}
