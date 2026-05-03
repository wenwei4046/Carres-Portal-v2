import { expect } from "vitest";

/**
 * Assert that a mocked supabase rpc was called with EXACTLY the expected
 * argument keys (no missing, no extra). Catches mock-leak bugs like the
 * pre-`e7a0782` C1 (missing p_signed) — vi.fn() accepted any args, so
 * unit tests passed while production hit PGRST202.
 */
export function assertRpcCallShape(
  rpc: { mock: { calls: unknown[][] } },
  fnName: string,
  expectedArgKeys: string[],
) {
  const matchingCalls = rpc.mock.calls.filter((c) => c[0] === fnName);
  expect(matchingCalls.length).toBeGreaterThan(0);
  for (const call of matchingCalls) {
    // Default to {} for zero-arg RPCs (e.g. sb.rpc("logistics_dashboard_summary"))
    // where call[1] is undefined. Without this guard, Object.keys(undefined) throws
    // an opaque TypeError instead of producing a useful assertion failure.
    const args = (call[1] ?? {}) as Record<string, unknown>;
    const actualKeys = Object.keys(args).sort();
    expect(actualKeys).toEqual([...expectedArgKeys].sort());
  }
}
