/**
 * WAREHOUSE SCHEDULE PREVIEW — DEV ONLY (walk aid for the Schedule board).
 *
 * The REAL page inside the REAL portal shell: `PortalSidebar` beside
 * `WarehouseWorkspace`, the real stylesheet, the real toolbar, and the real
 * operating-date projection. Only two things are seeded — the session, and the
 * Inbound register's RESPONSE. Everything else 404s, which is deliberate: the
 * Settings endpoint refusing is exactly what a warehouse-role user meets in
 * production, and the projection then falls back to the APPROVED standard
 * warehouse week. So the dates on screen are the governed ones, not a fixture
 * and not a hardcoded Monday–Saturday.
 *
 * It exists to make the measurements checkable at a real viewport: the 240px
 * column floor, the 64px date heading, the horizontal reach to the last day
 * and the fact that the CALENDAR scrolls while the portal does not.
 *
 * A separate vite entry (`warehouse-schedule-preview.html`), not a route:
 * `vite build` only emits `index.html`'s graph, so this cannot reach
 * production. None of these names, numbers or dates exist in the ERP.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
  InboundArrival,
  InboundProduct,
  WarehouseArrivalSourceFacts,
} from "@carres/shared";
import { useAuth } from "@/lib/auth";
import PortalSidebar from "@/pages/portal/PortalSidebar";
import WarehouseWorkspace from "@/pages/operation/WarehouseWorkspace";
import "@/index.css";

useAuth.setState({
  role: "operation",
  user: { email: "sha@carres.co" } as never,
});

/** Calendar days from today — the PROJECTION decides which of them operate. */
function inDays(n: number): string {
  const at = new Date();
  at.setDate(at.getDate() + n);
  const p = (v: number) => String(v).padStart(2, "0");
  return `${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())}`;
}

function product(over: Partial<InboundProduct> = {}): InboundProduct {
  return { category: "Sofa", sku: "OH-K-01", name: "Ohana King", qty: 2, received: 0, ...over };
}

let n = 0;
function arrival(over: Partial<InboundArrival> = {}): InboundArrival {
  n += 1;
  const products = over.products ?? [product()];
  const orderQty = products.reduce((t, p) => t + p.qty, 0);
  const receivedQty = products.reduce((t, p) => t + p.received, 0);
  return {
    id: `demo-${n}`,
    sourceId: `src-${n}`,
    sourceType: "supplier-delivery",
    documentWord: "PO No",
    documentNo: `PO-2609-${String(n).padStart(4, "0")}`,
    party: "Ohana Furniture Sdn Bhd",
    from: "Ohana Furniture Sdn Bhd",
    siteId: "site-1",
    site: "AL Sungai Buloh",
    siteMapped: true,
    destinationId: "dest-1",
    destinationName: "AL Sungai Buloh",
    date: inDays(0),
    poDate: null,
    poIssued: inDays(-20),
    poDeliveryDate: inDays(0),
    supplierDeliveryDate: null,
    so: null,
    expected: orderQty,
    received: receivedQty,
    remaining: orderQty - receivedQty,
    issues: 0,
    quantities: {
      orderQty,
      receivedQty,
      damagedQty: 0,
      wrongItemQty: 0,
      pendingDeliveryQty: orderQty - receivedQty,
      arrivedQty: receivedQty,
      known: true,
    },
    products,
    identitiesMissing: false,
    sessionId: null,
    sessions: [],
    units: [],
    ...over,
  };
}

/* Spread across the next ten CALENDAR days. Whichever of them the governed
   window actually operates is where these land — the harness never decides. */
const ARRIVALS: InboundArrival[] = [
  arrival({ date: inDays(0) }),
  arrival({
    date: inDays(0),
    party: "Ohana Furniture Manufacturing Sendirian Berhad (Klang Branch)",
    documentNo: "PO-2609-0007-REV-B",
    products: [product({ name: "Ohana King", qty: 2, received: 2 }), product({ sku: "AC-LEG-04", name: "Steel leg set", category: "Accessory", qty: 8, received: 0 })],
  }),
  arrival({ date: inDays(1), party: "Seng Heng Timber" }),
  arrival({ date: inDays(1), party: "Kinta Upholstery", products: [product({ sku: "KT-2S-09", name: "Kinta 2-seater", qty: 3, received: 1 })] }),
  arrival({ date: inDays(2), party: "Seng Heng Timber" }),
  arrival({ date: inDays(3), party: "Ohana Furniture Sdn Bhd" }),
  arrival({ date: inDays(4), party: "Kinta Upholstery" }),
  arrival({ date: inDays(5), party: "Seng Heng Timber" }),
  arrival({ date: inDays(6), party: "Ohana Furniture Sdn Bhd" }),
  arrival({ date: inDays(7), party: "Kinta Upholstery" }),
  arrival({ date: inDays(8), party: "Seng Heng Timber" }),
  /* A DEEP COLUMN — enough work on one date to overflow the frame, so the
     sticky heading and the vertical scroll are actually exercised rather than
     assumed. A real Thursday looks like this. */
  ...Array.from({ length: 7 }, (_, i) =>
    arrival({
      date: inDays(1),
      party: ["Seng Heng Timber", "Kinta Upholstery", "Ohana Furniture Sdn Bhd"][i % 3],
      products: [product({ qty: i + 1, received: i % 3 === 0 ? 1 : 0 })],
    }),
  ),
];

/* The ORDERED lines and the date standing — the two facts `InboundArrival`
   does not carry. Supplying them is what makes the card print real product
   identity, the category icon and the received-vs-ordered arithmetic instead
   of falling back to recorded Units. */
const SOURCE_FACTS: WarehouseArrivalSourceFacts[] = ARRIVALS.map((a, i) => ({
  sourceId: a.sourceId,
  dateStatus: i % 4 === 0 ? "scheduled" : "expected",
  lines: a.products.map((p, j) => ({
    id: `${a.sourceId}-L${j + 1}`,
    sku: p.sku,
    qty: p.qty,
  })),
}));

const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.includes("/api/operation/warehouse/inbound")) {
    return new Response(
      JSON.stringify({
        arrivals: ARRIVALS,
        sites: [{ id: "site-1", name: "AL Sungai Buloh" }],
        sourceFacts: SOURCE_FACTS,
        skuCategories: [
          { sku: "OH-K-01", category: "Sofa" },
          { sku: "KT-2S-09", category: "Sofa" },
          { sku: "AC-LEG-04", category: "Accessory" },
        ],
        page: { offset: 0, limit: 200, total: ARRIVALS.length },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }
  /* Everything else refuses, exactly as it does for a warehouse-role user. */
  if (url.startsWith("/api/")) return new Response(JSON.stringify({}), { status: 404 });
  return realFetch(input, init);
};

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/operation?tab=warehouse-arrival-schedule"]}>
        <div className="flex h-screen bg-base-100">
          <PortalSidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <WarehouseWorkspace direction="arrival" />
          </div>
        </div>
      </MemoryRouter>
    </QueryClientProvider>
  </StrictMode>,
);
