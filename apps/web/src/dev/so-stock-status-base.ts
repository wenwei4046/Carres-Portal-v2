/**
 * The quiet base under the standalone Stock Status walk — DEV ONLY. Imported
 * FIRST by `so-stock-status-preview.tsx`, so it owns `window.fetch` before the
 * scenario wraps it. It answers the shell's ordinary reads with empty, honest
 * fixtures (no order of its own) and refuses every write. Inside the Tasks
 * walk this file is NOT used: `tasks-fixtures.ts` is the base there.
 */
(window as unknown as { __carresSimulated: boolean }).__carresSimulated = true;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const path = new URL(url, window.location.href).pathname;
  if (!path.startsWith("/api/") && !path.startsWith("/rest/") && !path.startsWith("/auth/")) return realFetch(input, init);
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (method !== "GET") return json({ code: "simulated_refused", message: "This local walk does not save that." }, 405);
  if (path === "/api/operation/orders") return json({ orders: [], salesOrderTotal: 0 });
  if (path === "/api/operation/orders/register-facts") return json({ facts: {}, failed: { obligations: false, cases: false } });
  if (path === "/api/catalog") {
    return json({
      models: [{ id: "m1", modelKey: "B1201S", name: "B1201S", category: "mattress", blurb: null, colors: null, gaps: null, sofaMode: null }],
      skus: [{ id: "s1", modelId: "m1", sku: "B1201S-K", variant: "King", variantKind: "size", price: 2499, cost: null }],
      sofaFabrics: [], addons: [], floorConfig: {},
    });
  }
  if (/\/timeline$/.test(path)) return json([]);
  if (path === "/api/operation/delivery-arrangements") return json({ arrangements: [], events: [], contacts: [] });
  if (path === "/api/operation/delivery-orders") return json({ deliveryOrders: [], attempts: [], handoverEvents: [], proofReviews: [], attemptEvidence: [] });
  if (path === "/api/operation/delivery-settings") return json({ templates: [], settings: null });
  if (path === "/api/operation/partners") return json({ partners: [] });
  if (path === "/api/operation/work") return json({ items: [], modules: [] });
  if (path === "/api/operation/staff") return json({ staff: [], myDuties: [], salespersons: [] });
  if (path === "/api/operation/workspace-duties") return json({ can_assign: false, duties: [] });
  if (path === "/api/operation/register-layouts") return json({ layouts: [], limit: 10 });
  return json({ message: "not seeded in the local walk" }, 404);
};
