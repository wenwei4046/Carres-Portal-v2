/** Presentation only: never pass the result to an identity/allocator/write door.
 * Call only for Carres-owned document numbers, never supplier references or Unit IDs.
 * A six-digit date is left alone unless the caller knows it is a YYYYMM family.
 */
export function documentDisplayNumber(
  identity: string,
  granularity: "day" | "month" = "day",
): string {
  const pattern = granularity === "day"
    ? /^([A-Z]{2,8}-?)(20\d{2})(\d{2})(\d{2})(-\d{4,5}(?:-V\d+| V\d+|\(\d+\)|-[A-Z])?)$/
    : /^([A-Z]{2,8}-?)(20\d{2})(\d{2})(-\d{4,5}(?:-V\d+| V\d+|\(\d+\)|-[A-Z])?)$/;
  const match = pattern.exec(identity);
  if (!match) return identity;
  const year = Number(match[2]);
  const month = Number(match[3]);
  if (month < 1 || month > 12) return identity;
  if (granularity === "day") {
    const day = Number(match[4]);
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (day < 1 || day > lastDay) return identity;
    return `${match[1]}${match[2].slice(2)}${match[3]}${match[4]}${match[5]}`;
  }
  return `${match[1]}${match[2].slice(2)}${match[3]}${match[4]}`;
}
