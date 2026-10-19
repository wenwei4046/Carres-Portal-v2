/** Purchasing owns the cancellation fact. Finance owns every financial result.
 * This read contract is ready for a consumer; it records no delivery or receipt. */
export function cancellationFinanceHandoff(poId: string, facts: unknown) {
  const source = facts as { events?: Array<{ id: string; kind: string }>; financeHandoffs?: Array<{ id: string; poId: string; poVersion: number; evidence?: string[] }> };
  if (!Array.isArray(source?.events) || !Array.isArray(source.financeHandoffs)) {
    throw new Error("Cancellation handoff could not be read");
  }
  const effective = new Set(source.events.filter(event => event.kind === "effective").map(event => event.id));
  const base = `/api/operation/pos/${encodeURIComponent(poId)}/cancellations`;
  return {
    contractVersion: 1,
    connection: { state: "not_connected", message: "Finance connection pending" },
    sourceUrl: base,
    items: source.financeHandoffs.map(item => {
      if (item.poId !== poId || !effective.has(item.id) || !Number.isInteger(item.poVersion) || item.poVersion < 1) {
        throw new Error("Cancellation handoff does not match its effective source");
      }
      return {
        ...item,
        idempotencyKey: `po_cancellation:${item.id}:${item.poVersion}`,
        sourceUrl: base,
        evidence: (item.evidence ?? []).map(path => ({
          path,
          url: `${base}/${encodeURIComponent(item.id)}/evidence?path=${encodeURIComponent(path)}`,
        })),
      };
    }),
  };
}
