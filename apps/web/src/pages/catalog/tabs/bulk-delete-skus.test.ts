import { describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { bulkDeleteSkus } from "./bulk-delete-skus";

describe("bulkDeleteSkus", () => {
  it("deletes the free SKUs and names the refused ones", async () => {
    const code: Record<string, string> = { a: "SKU-A", b: "SKU-B", c: "SKU-C" };
    const del = (id: string) =>
      id === "b"
        ? Promise.reject(new Error("SKU-B is on orders, purchase orders, stock or bills, so it was not deleted. Turn it off instead."))
        : Promise.resolve({ ok: true });
    const refused = await bulkDeleteSkus(["a", "b", "c"], (id) => code[id]!, del);
    expect(refused).toEqual(["SKU-B"]);
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("Deleted 2. Not deleted: SKU-B."));
    expect(toast.success).not.toHaveBeenCalled();
  });
});
