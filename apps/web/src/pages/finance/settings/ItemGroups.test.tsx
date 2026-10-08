/**
 * Finance Settings → Item groups (0659).
 *
 * What the page must get right:
 *   · each group with its four accounts; an empty one reads `No account yet`;
 *   · a group opens its window, which offers each account only of its kind and
 *     sends the group as it showed it (`was`); a new group sends no id;
 *   · the disabled Save names its gap;
 *   · every product with its group, in group order; a product row moves it,
 *     sending the group it showed;
 *   · the sales that went to the goods account, only when there are some;
 *   · a refusal is the database's sentence; the changes read in words.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ItemGroups, { changeWords, productRows } from "./ItemGroups";

const net = vi.hoisted(() => ({
  calls: [] as Array<{ method: string; path: string; body: Record<string, unknown> }>,
  refuse: null as string | null,
  unbound: [] as unknown[],
}));

const G = {
  mattress: "aaaaaaaa-0000-4000-8000-000000000001",
  pillow: "aaaaaaaa-0000-4000-8000-000000000002",
  curtain: "aaaaaaaa-0000-4000-8000-000000000003",
};

const group = (id: string, name: string, accounts: [string | null, string | null, string | null, string | null], extra: Record<string, unknown> = {}) => ({
  id,
  name,
  active: true,
  purchaseAccount: accounts[0], purchaseName: accounts[0] ? `NAME ${accounts[0]}` : null,
  salesAccount: accounts[1], salesName: accounts[1] ? `NAME ${accounts[1]}` : null,
  salesReturnAccount: accounts[2], salesReturnName: accounts[2] ? `NAME ${accounts[2]}` : null,
  purchaseReturnAccount: accounts[3], purchaseReturnName: accounts[3] ? `NAME ${accounts[3]}` : null,
  categories: [],
  products: 0,
  ...extra,
});

const READ = () => ({
  groups: [
    group(G.curtain, "CURTAIN", [null, "500-0000", "510-0000", "612-0000"]),
    group(G.mattress, "MATTRESS", ["610-0020", "500-0000", "510-0000", "612-0000"], { categories: ["mattress"], products: 1 }),
    group(G.pillow, "PILLOW", ["610-0070", "500-0000", "510-0000", "612-0000"], { products: 1 }),
  ],
  products: [
    { modelId: "m-2", name: "Memory Foam Pillow", category: "accessory", skus: 1, groupId: G.pillow, placed: true, discontinued: false },
    { modelId: "m-1", name: "Ortho Mattress", category: "mattress", skus: 4, groupId: G.mattress, placed: false, discontinued: false },
    { modelId: "m-3", name: "Old Mattress", category: "mattress", skus: 1, groupId: G.mattress, placed: false, discontinued: true },
  ],
  unbound: net.unbound,
  changes: [
    { id: "2", what: "PRODUCT", groupId: G.pillow, groupName: "PILLOW", modelName: "Memory Foam Pillow", fromGroupName: "OTHERS", fromCode: null, fromName: null, toCode: null, toName: null, fromText: null, toText: null, changedAt: "2026-10-08T09:00:00Z", changedBy: "Chew" },
    { id: "1", what: "PURCHASE", groupId: G.mattress, groupName: "MATTRESS", modelName: null, fromGroupName: null, fromCode: "610-0000", fromName: "PURCHASES", toCode: "610-0020", toName: "PURCHASE - MATTRESS", fromText: null, toText: null, changedAt: "2026-10-07T09:00:00Z", changedBy: "Chew" },
  ],
});

const acc = (code: string, name: string, kind: string, extra: Record<string, unknown> = {}) => ({
  code, name, kind, parent_code: "5000", is_control: false, control_for: null, is_active: true, is_header: false, sort_order: 0, ...extra,
});
const CHART = [
  acc("500-0000", "SALES", "INCOME"),
  acc("510-0000", "RETURN INWARDS", "INCOME"),
  acc("610-0020", "PURCHASE - MATTRESS", "EXPENSE"),
  acc("610-0060", "PURCHASE - CURTAIN", "EXPENSE"),
  acc("612-0000", "PURCHASES RETURN", "EXPENSE"),
  acc("5000", "COST OF GOODS SOLD", "EXPENSE", { parent_code: null, is_header: true }),
];

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method === "GET") {
      if (path === "/api/finance/ledger/item-groups") return READ();
      if (path === "/api/finance/ledger/accounts") return { go_live_on: "2026-09-10", accounts: CHART, money_accounts: [] };
      throw new Error(`unexpected GET ${path}`);
    }
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    net.calls.push({ method, path, body });
    if (net.refuse) throw new Error(net.refuse);
    return { id: G.curtain, changed: true };
  }),
}));
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => null }));

beforeEach(() => {
  net.calls = [];
  net.refuse = null;
  net.unbound = [];
  localStorage.clear();
});

function show() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ItemGroups />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const row = (id: string) => document.querySelector<HTMLTableRowElement>(`tr[data-row-key="${id}"]`)!;

async function ready() {
  await waitFor(() => expect(row(G.mattress)).toBeTruthy());
}

describe("Item groups (0659)", () => {
  it("lists each group with its four accounts, and an empty one says so", async () => {
    show();
    await ready();
    expect(row(G.mattress)).toHaveTextContent("610-0020 NAME 610-0020");
    expect(row(G.mattress)).toHaveTextContent("612-0000 NAME 612-0000");
    expect(within(row(G.curtain)).getByText("No account yet")).toBeInTheDocument();
    expect(row(G.pillow)).toHaveTextContent("Active");
  });

  it("changes a group, offering only expense accounts for purchase and sending the group it showed", async () => {
    show();
    await ready();
    fireEvent.click(within(row(G.curtain)).getByText("CURTAIN"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.keyDown(within(dialog).getByRole("combobox", { name: /Purchase account/ }), { key: "Enter" });
    expect(screen.queryByRole("option", { name: "500-0000 SALES" })).toBeNull();
    expect(screen.queryByRole("option", { name: "5000 COST OF GOODS SOLD" })).toBeNull();
    fireEvent.click(screen.getByRole("option", { name: "610-0060 PURCHASE - CURTAIN" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(net.calls).toHaveLength(1));
    expect(net.calls[0]).toEqual({
      method: "PUT",
      path: `/api/finance/ledger/item-groups/${G.curtain}`,
      body: {
        name: "CURTAIN",
        purchaseAccount: "610-0060",
        salesAccount: "500-0000",
        salesReturnAccount: "510-0000",
        purchaseReturnAccount: "612-0000",
        active: true,
        was: { name: "CURTAIN", purchaseAccount: null, salesAccount: "500-0000", salesReturnAccount: "510-0000", purchaseReturnAccount: "612-0000", active: true },
      },
    });
  });

  it("adds a group with no id once it has a name", async () => {
    show();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Add item group" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Save: type the name" })).toBeDisabled();
    expect(within(dialog).queryByRole("checkbox", { name: "Active" })).toBeNull();
    fireEvent.change(within(dialog).getByLabelText(/Name/), { target: { value: " FOOTREST " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(net.calls).toHaveLength(1));
    expect(net.calls[0]).toEqual({
      method: "POST",
      path: "/api/finance/ledger/item-groups",
      body: { name: "FOOTREST", purchaseAccount: null, salesAccount: null, salesReturnAccount: null, purchaseReturnAccount: null, active: true, was: null },
    });
  });

  it("shows the database's sentence when it refuses", async () => {
    net.refuse = "Someone else changed this item group after you opened it. Open it again to see their change.";
    show();
    await ready();
    fireEvent.click(within(row(G.pillow)).getByText("PILLOW"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByText("Someone else changed this item group after you opened it. Open it again to see their change.")).toBeInTheDocument();
  });

  it("lists the products in use by group, and moves one, sending the group it showed", async () => {
    show();
    await ready();
    const table = screen.getByTestId("item-group-products-table");
    const rows = within(table).getAllByRole("row").map((r) => r.textContent ?? "");
    expect(rows[1]).toContain("Ortho Mattress");
    expect(rows[1]).toContain("Mattress");
    expect(rows[2]).toContain("Memory Foam Pillow");
    expect(rows.join(" ")).not.toContain("Old Mattress");
    fireEvent.click(within(table).getByText("Ortho Mattress"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Save: pick another item group" })).toBeDisabled();
    fireEvent.keyDown(within(dialog).getByRole("combobox", { name: /Item group/ }), { key: "Enter" });
    fireEvent.click(screen.getByRole("option", { name: "PILLOW" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(net.calls).toHaveLength(1));
    expect(net.calls[0]).toEqual({
      method: "POST",
      path: "/api/finance/ledger/item-groups/place",
      body: { modelId: "m-1", groupId: G.pillow, was: G.mattress },
    });
  });

  it("shows the sales posted to the goods account only when there are some", async () => {
    show();
    await ready();
    expect(screen.queryByTestId("item-group-unbound")).toBeNull();
  });

  it("names a sale whose SKU is not in the catalog", async () => {
    net.unbound = [
      { id: 7, invoiceNo: "INV-1", so: 1206, issuedAt: "2026-10-08", groupId: null, skus: ["OLD-SKU"], amount: "300.00", accountCode: "500-0000", accountName: "SALES" },
      { id: 8, invoiceNo: "INV-2", so: 1288, issuedAt: "2026-10-08", groupId: G.curtain, skus: ["CUR-1", "CUR-2"], amount: "150.00", accountCode: "500-0000", accountName: "SALES" },
    ];
    show();
    await ready();
    const rows = within(screen.getByTestId("item-group-unbound-table")).getAllByRole("row").map((r) => r.textContent ?? "");
    expect(rows[1]).toContain("Not in the catalog");
    expect(rows[1]).toContain("#1206");
    expect(rows[2]).toContain("CURTAIN");
    expect(rows[2]).toContain("CUR-1 · CUR-2");
  });

  it("lists the changes in words", async () => {
    show();
    await ready();
    const rows = within(screen.getByTestId("item-group-changes-table")).getAllByRole("row").map((r) => r.textContent ?? "");
    expect(rows[1]).toContain("Product Memory Foam Pillow");
    expect(rows[1]).toContain("OTHERS");
    expect(rows[2]).toContain("Purchase account");
    expect(rows[2]).toContain("610-0000 PURCHASES");
    expect(rows[2]).toContain("610-0020 PURCHASE - MATTRESS");
  });
});

describe("item group words", () => {
  const base = { id: "1", groupId: G.pillow, groupName: "PILLOW", modelName: null, fromGroupName: null, fromCode: null, fromName: null, toCode: null, toName: null, fromText: null, toText: null, changedAt: "2026-10-08T09:00:00Z", changedBy: null };
  it("says what changed, from what, to what", () => {
    expect(changeWords({ ...base, what: "ADDED", toText: "PILLOW" })).toEqual({ change: "Added", from: "", to: "PILLOW" });
    expect(changeWords({ ...base, what: "ACTIVE", fromText: "true", toText: "false" })).toEqual({ change: "Active", from: "Active", to: "Not active" });
    expect(changeWords({ ...base, what: "NAME", fromText: "PILOW", toText: "PILLOW" })).toEqual({ change: "Name", from: "PILOW", to: "PILLOW" });
    expect(changeWords({ ...base, what: "SALES", toCode: "500-0000", toName: "SALES" })).toEqual({ change: "Sales account", from: "", to: "500-0000 SALES" });
  });

  it("orders the products in use by group then name, and leaves the discontinued out", () => {
    const names = new Map([[G.mattress, "MATTRESS"], [G.pillow, "PILLOW"]]);
    const rows = productRows(READ().products as never, names);
    expect(rows.map((r) => r.name)).toEqual(["Ortho Mattress", "Memory Foam Pillow"]);
  });
});
