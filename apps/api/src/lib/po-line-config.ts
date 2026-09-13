/**
 * A PO line's CONFIGURATION facts, in words — the same three the PO paper
 * prints under the description (`po-template.tsx`): colour · `Gap {n}` ·
 * `Fabric {name}`. Pure. An absent or malformed `attrs` prints nothing.
 */
export function poLineConfigBits(attrs: unknown): string[] {
  if (!attrs || typeof attrs !== "object" || Array.isArray(attrs)) return [];
  const a = attrs as Record<string, unknown>;
  const bits: string[] = [];
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const color = str(a.color) ?? str(a.colour);
  if (color) bits.push(color);
  const gap = str(a.gap);
  if (gap) bits.push(`Gap ${gap}`);
  const fabric = str(a.fabric_name);
  if (fabric) bits.push(`Fabric ${fabric}`);
  const size = str(a.size);
  if (size) bits.push(`Size ${size}`);
  const firmness = str(a.firmness);
  if (firmness) bits.push(`Firmness ${firmness}`);
  const configuration = str(a.configuration) ?? str(a.sofa_configuration);
  if (configuration) bits.push(`Configuration ${configuration}`);
  return bits;
}
