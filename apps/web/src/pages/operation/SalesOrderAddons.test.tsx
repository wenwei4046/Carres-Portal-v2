import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { AddonDto } from "@carres/shared";

/**
 * THE OFFICE'S SERVICE DOOR (Jess, 2026-08-28).
 *
 * The office could see a disposal service on the Sales Order and had no way to
 * add one, so it rang the shop. These pin the three rules that make the door
 * safe rather than the shape of the control:
 *
 *  1. THE GATE IS THE API'S GATE. `add_order_lines` refuses unless the order is
 *     in the place lane (`wrong_status`); the panel offers nothing outside it
 *     and says where the act moved instead. A UI that offered a control the
 *     server always 422s would be a second policy, which is the defect this
 *     repo keeps finding between two surfaces.
 *  2. A SERVICE IS NEVER REMOVED, only increased. `edit_order_addon` enforces
 *     `downsell_blocked`, so there is no minus and no delete to press.
 *  3. A SIZED SERVICE CANNOT BE SOLD WITHOUT ITS SIZE (0242, one per unit).
 */

const h = vi.hoisted(() => ({
  added: [] as unknown[],
  edited: [] as unknown[],
  addPending: false,
}));

vi.mock("@/lib/queries", () => ({
  useAddOrderLines: (_id: string, opts?: { onSuccess?: () => void }) => ({
    isPending: h.addPending,
    mutate: (input: unknown) => {
      h.added.push(input);
      opts?.onSuccess?.();
    },
  }),
  useEditOrderAddon: () => ({
    isPending: false,
    mutate: (input: unknown) => h.edited.push(input),
  }),
}));

import SalesOrderAddons from "./SalesOrderAddons";

const CATALOG: AddonDto[] = [
  { key: "dispose-mattress", name: "Dispose old mattress", price: 80, active: true,
    sizeOptions: ["King", "Queen", "Single"] },
  { key: "assembly", name: "Assembly", price: 50, active: true, sizeOptions: null },
  { key: "retired", name: "Retired service", price: 10, active: false, sizeOptions: null },
];

function row(over: Partial<Parameters<typeof SalesOrderAddons>[0]["addons"][number]> = {}) {
  return {
    id: "00000000-0000-0000-0000-0000000000a1",
    addon_key: "dispose-mattress",
    qty: 1,
    unit_price: 80,
    attrs: { sizes: ["Queen"], size: "Queen" },
    ...over,
  };
}

function draw(over: Partial<Parameters<typeof SalesOrderAddons>[0]> = {}) {
  return render(
    <SalesOrderAddons
      orderId="00000000-0000-0000-0000-0000000000ff"
      addons={[]}
      catalogAddons={CATALOG}
      status="place"
      {...over}
    />,
  );
}

beforeEach(() => {
  h.added = [];
  h.edited = [];
  h.addPending = false;
});

describe("SalesOrderAddons — the office may add a service, never take one away", () => {
  it("offers the door while the order is in the place lane", () => {
    draw();
    expect(screen.getByTestId("so-addon-open")).toBeInTheDocument();
    expect(screen.queryByTestId("so-addons-locked")).toBeNull();
  });

  it("outside the place lane it offers NO control and names where the act moved", () => {
    draw({ status: "proceed_order", addons: [row()] });
    // The API would refuse a write here, so the screen must not invite one.
    expect(screen.queryByTestId("so-addon-open")).toBeNull();
    expect(screen.queryByTestId("so-addon-more-dispose-mattress")).toBeNull();
    // …and the operator is told where it went, or they ring the shop anyway.
    expect(screen.getByTestId("so-addons-locked")).toHaveTextContent("shop");
  });

  it("shows a sold service with the size the customer picked", () => {
    draw({ addons: [row()] });
    const r = screen.getByTestId("so-addon-row-dispose-mattress");
    expect(r).toHaveTextContent("Dispose old mattress");
    expect(r).toHaveTextContent("Queen");
  });

  it("carries NO control that would take a service away", () => {
    draw({ addons: [row({ qty: 2 })] });
    const r = screen.getByTestId("so-addon-row-dispose-mattress");
    const labels = [...r.querySelectorAll("button")].map((b) => b.textContent ?? "");
    expect(labels).toContain("Add one more");
    // `downsell_blocked` lives in the database; the screen must not offer the
    // act that it refuses.
    expect(labels.join(" ")).not.toMatch(/remove|delete|less|−|-1/i);
  });

  it("`Add one more` grows the qty and repeats the size already sold", () => {
    draw({ addons: [row({ qty: 2, attrs: { sizes: ["Queen", "King"], size: "Queen · King" } })] });
    fireEvent.click(screen.getByTestId("so-addon-more-dispose-mattress"));
    expect(h.edited).toHaveLength(1);
    const sent = h.edited[0] as { input: { qty: number; attrs?: { sizes: string[] } } };
    expect(sent.input.qty).toBe(3);
    // One size per unit (0242) — a third unit needs a third size, and the
    // customer is not asked again for a service they already chose.
    expect(sent.input.attrs?.sizes).toEqual(["Queen", "King", "King"]);
  });

  it("a sized service cannot be added until its size is picked", () => {
    draw();
    fireEvent.click(screen.getByTestId("so-addon-open"));
    fireEvent.change(screen.getByTestId("so-addon-key"), {
      target: { value: "dispose-mattress" },
    });
    expect(screen.getByTestId("so-addon-save")).toBeDisabled();
    fireEvent.change(screen.getByTestId("so-addon-size"), { target: { value: "King" } });
    expect(screen.getByTestId("so-addon-save")).toBeEnabled();
  });

  it("a size-less service needs no size and asks for none", () => {
    draw();
    fireEvent.click(screen.getByTestId("so-addon-open"));
    fireEvent.change(screen.getByTestId("so-addon-key"), { target: { value: "assembly" } });
    expect(screen.queryByTestId("so-addon-size")).toBeNull();
    expect(screen.getByTestId("so-addon-save")).toBeEnabled();
  });

  it("sends the pick through the POS's own route, with no price of its own", () => {
    draw();
    fireEvent.click(screen.getByTestId("so-addon-open"));
    fireEvent.change(screen.getByTestId("so-addon-key"), {
      target: { value: "dispose-mattress" },
    });
    fireEvent.change(screen.getByTestId("so-addon-size"), { target: { value: "King" } });
    fireEvent.click(screen.getByTestId("so-addon-save"));

    expect(h.added).toHaveLength(1);
    const sent = h.added[0] as {
      addons: Array<{ addonKey: string; qty: number; unitPrice?: number; attrs?: unknown }>;
    };
    expect(sent.addons[0]!.addonKey).toBe("dispose-mattress");
    expect(sent.addons[0]!.qty).toBe(1);
    expect(sent.addons[0]!.attrs).toEqual({ sizes: ["King"], size: "King" });
    /* The SERVER is the price authority (`priceServiceAddons` re-prices every
       pick from the live config). A price sent from here would be a second
       arithmetic for one number. */
    expect(sent.addons[0]!.unitPrice).toBeUndefined();
  });

  it("never offers a SERVER-COMPUTED fee as a pickable service", () => {
    /* The delivery fees and stair carry are appended by the server, which also
       strips any client-sent copy — so offering one here is a control that
       silently does nothing. The set is imported from `@carres/shared`; this
       pins that the office door honours it, because the list used to be typed
       out per-file and `STAIR_CARRY` was missed in exactly this one. */
    draw({
      catalogAddons: [
        ...CATALOG,
        { key: "STAIR_CARRY", name: "Stair carry", price: 0, active: true, sizeOptions: null },
        { key: "DELIVERY", name: "Delivery fee", price: 0, active: true, sizeOptions: null },
      ],
    });
    fireEvent.click(screen.getByTestId("so-addon-open"));
    const opts = [...screen.getByTestId("so-addon-key").querySelectorAll("option")]
      .map((o) => o.getAttribute("value"));
    expect(opts).not.toContain("STAIR_CARRY");
    expect(opts).not.toContain("DELIVERY");
    expect(opts).toContain("assembly");
  });

  it("never offers a retired service", () => {
    draw();
    fireEvent.click(screen.getByTestId("so-addon-open"));
    const opts = [...screen.getByTestId("so-addon-key").querySelectorAll("option")]
      .map((o) => o.getAttribute("value"));
    expect(opts).toContain("assembly");
    expect(opts).not.toContain("retired");
  });
});
