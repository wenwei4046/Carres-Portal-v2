import { test, expect } from "@playwright/test";

// Race-condition regression: dispatch-customer-leg uses
// logistics_dispatch_customer_leg RPC (Task 15) which guards on PO state.
// If two clients fire the same dispatch concurrently, the first should win
// (200) and the second should hit the state guard (SQLSTATE 22023, mapped to
// 422 by mapPgError or possibly 409 conflict).
//
// Pre-condition: PO-FIXTURE-RACE exists, has thread at ready_to_dispatch.
// Logistics user JWT obtained from env (LOGISTICS_TEST_JWT).
// Un-fixme once preconditions are met.
test.fixme("Concurrent dispatch-customer-leg on same PO: exactly one succeeds", async ({ request }) => {
  const API_URL = process.env.API_URL ?? "";
  const jwt = process.env.LOGISTICS_TEST_JWT ?? "";
  const headers = { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" };
  const body = JSON.stringify({
    partner_id: "00000000-0000-0000-0000-0000000001f1",
    confirm_delivery_date: "2026-05-25",
    force_dispatch: true,
  });

  const [r1, r2] = await Promise.all([
    request.post(`${API_URL}/api/logistics/pos/PO-FIXTURE-RACE/dispatch-customer-leg`, { headers, data: body }),
    request.post(`${API_URL}/api/logistics/pos/PO-FIXTURE-RACE/dispatch-customer-leg`, { headers, data: body }),
  ]);

  const statuses = [r1.status(), r2.status()].sort();
  // First wins (200), second sees state guard 22023 → 422 (from mapPgError)
  expect(statuses[0]).toBe(200);
  expect([422, 409]).toContain(statuses[1]);  // mapPgError 22023→422; might also be 409 conflict
});
