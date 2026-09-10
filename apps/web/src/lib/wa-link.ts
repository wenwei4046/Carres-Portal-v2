/**
 * Phone → wa.me base link (MY-aware) — the ONE implementation.
 *
 * It lived as two identical page-local copies (OrderDetailDrawer + the
 * OperationPayments desk, the second annotated "local copy of the first");
 * the Payment message composition would have been the third, which is
 * exactly the drift Law D exists to stop. Takes the FIRST number when the
 * field lists several ("014-… | 012-…"), strips non-digits, and normalises
 * a local `0…` to `60…`.
 */
export function waLink(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const first = phone.split(/[|,/]/)[0] ?? "";
  let d = first.replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("60")) {
    /* already international */
  } else if (d.startsWith("0")) {
    d = `60${d.slice(1)}`;
  } else {
    d = `60${d}`;
  }
  return `https://wa.me/${d}`;
}
