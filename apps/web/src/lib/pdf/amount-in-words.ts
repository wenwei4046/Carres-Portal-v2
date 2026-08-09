/**
 * Golden SO (STAGE 2) — "Amount in words: RINGGIT MALAYSIA EIGHT THOUSAND
 * NINE HUNDRED TWENTY ONLY". Malaysian cheque convention: whole ringgit in
 * English words, "AND SEN …" when cents exist, terminated with ONLY,
 * uppercase throughout.
 */
const ONES = [
  "", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE",
  "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN",
  "SEVENTEEN", "EIGHTEEN", "NINETEEN",
];
const TENS = [
  "", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY",
  "NINETY",
];

function belowThousand(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h > 0) parts.push(`${ONES[h]} HUNDRED`);
  if (rest >= 20) {
    const t = TENS[Math.floor(rest / 10)];
    const o = ONES[rest % 10];
    parts.push(o ? `${t}-${o}` : t!);
  } else if (rest > 0) {
    parts.push(ONES[rest]!);
  }
  return parts.join(" ");
}

function wholeNumberWords(n: number): string {
  if (n === 0) return "ZERO";
  const parts: string[] = [];
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1_000);
  const rest = n % 1_000;
  if (millions > 0) parts.push(`${belowThousand(millions)} MILLION`);
  if (thousands > 0) parts.push(`${belowThousand(thousands)} THOUSAND`);
  if (rest > 0) parts.push(belowThousand(rest));
  return parts.join(" ");
}

/** RM 8,920.00 → "RINGGIT MALAYSIA EIGHT THOUSAND NINE HUNDRED TWENTY ONLY" */
export function amountInWords(amount: number): string {
  const cents = Math.round((Math.abs(amount) % 1) * 100);
  const whole = Math.floor(Math.abs(amount));
  const parts = [`RINGGIT MALAYSIA ${wholeNumberWords(whole)}`];
  if (cents > 0) parts.push(`AND SEN ${wholeNumberWords(cents)}`);
  return `${parts.join(" ")} ONLY`;
}
