import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StockValueAnswer } from "@carres/shared/stock-value";
import StockValue from "./reports/StockValue";

/* Finance tables keep the person's own saved layouts on the server (0704;
   Chew 2026-10-21). One Finance grid stands for all of them: Stock value,
   listing finance_stock_value. Units and figures are invented. */
const api = vi.hoisted(() => ({
  layouts: [] as unknown[],
  reads: [] as string[],
  writes: [] as { url: string; body: unknown }[],
  refuseSave: null as null | string,
}));
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/operation/register-layouts")) {
      if (init?.method === "POST") {
        const body = init.body ? JSON.parse(String(init.body)) : null;
        api.writes.push({ url, body });
        if (api.refuseSave) throw Object.assign(new Error("refused"), { status: 422, body: { code: api.refuseSave } });
        return { layout: { id: "n1", name: body.name, layout: body.layout, is_default: false } };
      }
      api.reads.push(url);
      return { layouts: api.layouts, limit: 10 };
    }
    if (url.startsWith("/api/finance/ledger/stock-value?")) return ANSWER;
    throw new Error(`unexpected read ${url}`);
  }),
  ApiError: class ApiError extends Error {},
}));
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => null }));
vi.mock("@/lib/fmt-date", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/fmt-date")>()),
  appTodayIso: () => "2026-10-03",
}));

const ANSWER: StockValueAnswer = {
  month_end: "2026-09-30", cut_at: "2026-09-30T16:00:00Z", today: "2026-10-03", provisional: true,
  units: [{
    id: "u1", unit_code: "U1-000-001", sku: "SOFA-3S", qty: 1, scope: "unit", status: "free",
    bucket: "warehouse", site_name: "Carres Klang", holder_name: null, po_no: "PO260901-1111", unit_cost: "520.00", value: "520.00",
  }],
  left_out: { consignment_units: 0, consignment_qty: 0 },
};
const SAVED = { order: [], hidden: ["site"], widths: { sku: 240 }, sort: null };

beforeEach(() => {
  api.layouts = [];
  api.reads = [];
  api.writes = [];
  api.refuseSave = null;
  localStorage.clear();
});

function show() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/finance/reports/stock-value"]}>
        <Routes><Route path="/finance/reports/stock-value" element={<StockValue />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const heads = () => Array.from(document.querySelectorAll("th")).map((th) => th.title).filter(Boolean);
const openColumns = () => {
  fireEvent.click(screen.getByRole("button", { name: "Page tools" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Columns" }));
};

describe("Finance personal layouts (0704)", () => {
  it("a Finance grid reads the person's layouts for its own listing and offers the layout actions", async () => {
    show();
    await screen.findByTestId("stock-value-row-U1-000-001");
    expect(api.reads).toEqual(["/api/operation/register-layouts?listing=finance_stock_value"]);
    openColumns();
    expect(screen.getByTestId("personal-layout-actions")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save layout as…" })).toBeInTheDocument();
  });

  it("applies the person's saved Default when it arrives", async () => {
    api.layouts = [
      { id: "l1", name: "Other", layout: { order: [], hidden: [], widths: {}, sort: null }, is_default: false },
      { id: "l2", name: "Mine", layout: SAVED, is_default: true },
    ];
    show();
    await screen.findByTestId("stock-value-row-U1-000-001");
    await waitFor(() => expect(heads()).not.toContain("Site"));
    expect(heads()).toContain("SKU");
  });

  it("saves under a name to the Finance listing", async () => {
    show();
    await screen.findByTestId("stock-value-row-U1-000-001");
    openColumns();
    fireEvent.click(screen.getByRole("button", { name: "Save layout as…" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Layout name" }), { target: { value: "Month end" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.writes).toHaveLength(1));
    expect(api.writes[0]!.url).toBe("/api/operation/register-layouts");
    expect(api.writes[0]!.body).toMatchObject({ listing: "finance_stock_value", name: "Month end" });
  });

  it("the 11th save shows the limit sentence", async () => {
    api.refuseSave = "register_layout_limit";
    show();
    await screen.findByTestId("stock-value-row-U1-000-001");
    openColumns();
    fireEvent.click(screen.getByRole("button", { name: "Save layout as…" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Layout name" }), { target: { value: "Eleventh" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByTestId("personal-layout-problem"))
      .toHaveTextContent("You can keep 10 layouts. Save under an existing name to replace one.");
  });

  it("any other refused save says to try again", async () => {
    api.refuseSave = "server_error";
    show();
    await screen.findByTestId("stock-value-row-U1-000-001");
    openColumns();
    fireEvent.click(screen.getByRole("button", { name: "Save layout as…" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Layout name" }), { target: { value: "X" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByTestId("personal-layout-problem")).toHaveTextContent("The layout could not be saved. Try again.");
  });
});

/* Every Finance-look grid passes the person's layouts, each on its own listing. */
describe("every Finance grid keeps personal layouts (0704)", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const files = (readdirSync(here, { recursive: true }) as string[])
    .filter((p) => p.endsWith(".tsx") && !p.endsWith(".test.tsx"))
    .map((p) => [p, readFileSync(join(here, p), "utf8")] as const);

  it("each look=\"finance\" DataGrid is handed personalLayouts", () => {
    const grids = files.flatMap(([p, src]) => (src.match(/look="finance"[^\n]*/g) ?? []).map((line) => [p, line] as const));
    expect(grids.length).toBeGreaterThanOrEqual(32);
    for (const [p, line] of grids) expect(`${p}: ${line}`).toContain("personalLayouts={personalLayouts}");
  });

  it("no two grids share a listing, and every listing is finance_<name>", () => {
    const listings = files.flatMap(([, src]) => [...src.matchAll(/useFinancePersonalLayouts\(["`]([^"`]+)["`]\)/g)].map((m) => m[1]!));
    expect(new Set(listings).size).toBe(listings.length);
    for (const l of listings) expect(l).toMatch(/^finance_[a-z0-9_${}]+$/);
  });
});
