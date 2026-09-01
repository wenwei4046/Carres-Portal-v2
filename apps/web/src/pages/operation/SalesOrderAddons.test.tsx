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
  removed: [] as unknown[],
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
  useRemoveOrderAddon: () => ({
    isPending: false,
    mutate: (input: unknown) => h.removed.push(input),
  }),
}));

import SalesOrderAddons, { ServiceRowActions } from "./SalesOrderAddons";

/**
 * ⭐ RE-PINNED, NOT DELETED (YH, 2026-09-01).
 *
 * The per-row doors moved out of this panel and into the Goods table row they
 * act on, because a service was being printed twice — once as a table row, and
 * again here in a list that repeated its name, size, quantity and price purely
 * so it could carry two buttons.
 *
 * Every assertion below survives with its meaning intact. Only the RENDER
 * changes: a test about a row now draws `ServiceRowActions` with that row,
 * where before it drew the whole panel and hunted for the row inside it. The
 * gates — the place lane, the four server-computed keys, `downsell_blocked` —
 * are the same gates asserted the same way.
 */
type RowFacts = Parameters<typeof ServiceRowActions>[0]["row"];

const CATALOG: AddonDto[] = [
  { key: "dispose-mattress", name: "Dispose old mattress", price: 80, active: true,
    sizeOptions: ["King", "Queen", "Single"] },
  { key: "assembly", name: "Assembly", price: 50, active: true, sizeOptions: null },
  { key: "retired", name: "Retired service", price: 10, active: false, sizeOptions: null },
];

function row(over: Partial<RowFacts> = {}): RowFacts {
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
      catalogAddons={CATALOG}
      status="place"
      {...over}
    />,
  );
}

/** One service row's own doors, as the Goods table now mounts them. */
function drawRow(
  r: RowFacts = row(),
  over: Partial<Parameters<typeof ServiceRowActions>[0]> = {},
) {
  return render(
    <ServiceRowActions
      orderId="00000000-0000-0000-0000-0000000000ff"
      row={r}
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

describe("SalesOrderAddons — the office may add a service, and take back a misclick", () => {
  it("offers the door while the order is in the place lane", () => {
    draw();
    expect(screen.getByTestId("so-addon-open")).toBeInTheDocument();
    expect(screen.queryByTestId("so-addons-locked")).toBeNull();
  });

  it("outside the place lane it offers NO control and names where the act moved", () => {
    draw({ status: "proceed_order" });
    // The API would refuse a write here, so the screen must not invite one.
    expect(screen.queryByTestId("so-addon-open")).toBeNull();
    // …and the operator is told where it went, or they ring the shop anyway.
    expect(screen.getByTestId("so-addons-locked")).toHaveTextContent("shop");
    // The ROW's own doors are shut by the same lane, in their new home.
    drawRow(row(), { status: "proceed_order" });
    expect(screen.queryByTestId("so-addon-more-dispose-mattress")).toBeNull();
    expect(screen.queryByTestId("so-addon-remove-dispose-mattress")).toBeNull();
  });

  /* ⭐ RE-PINNED (2026-09-01). The NAME and the SIZE are printed by the Goods
     table now, not by this panel — that is the whole point of the move, since
     the table was already printing both and this list repeated them. The
     assertion moved to `SalesOrderWorkspace.ui-contract.test.ts`, which pins
     that the table's Item cell renders the catalog name and the size. What is
     asserted HERE is what this file still owns: the row's doors. */
  it("gives a sold service its own doors, in its own row", () => {
    drawRow(row());
    const r = screen.getByTestId("so-addon-row-dispose-mattress");
    expect(r.querySelectorAll("button")).toHaveLength(2);
  });

  /* ⭐ THE RULING NARROWED, 2026-08-28 (YH). "A service is never removed, only
     increased" was written to stop a DOWNSELL, and that half is untouched:
     `downsell_blocked` is still real, so the screen still offers no way to
     REDUCE a qty. What it did not anticipate was the opposite error — a service
     picked by mistake, billed to a customer who never agreed to it, with no
     path back from any surface. 0395 opens that door and this test now pins
     both halves: no decrease, but a removal. */
  it("offers no way to DECREASE a service, and a way to take a misclick back", () => {
    drawRow(row({ qty: 2 }));
    const r = screen.getByTestId("so-addon-row-dispose-mattress");
    const labels = [...r.querySelectorAll("button")].map((b) => b.textContent ?? "");
    expect(labels).toContain("Add one more");
    expect(labels).toContain("Remove");
    // The decrease is what the database refuses, and the screen still must not
    // offer the act it refuses.
    expect(labels.join(" ")).not.toMatch(/less|fewer|−|-1|reduce/i);
  });

  it("takes the row back through the 0395 door, and asks for no reason to undo a slip", () => {
    drawRow(row({ qty: 2 }));
    fireEvent.click(screen.getByTestId("so-addon-remove-dispose-mattress"));
    /* The addon id alone — a misclick needs no explanation, and the full
       before-image is recorded server-side either way. */
    expect(h.removed).toEqual([{ addonId: "00000000-0000-0000-0000-0000000000a1" }]);
  });

  /* ⛔ THE DOUBLING BUG (2026-08-31). `Add one more` was gated on the lane
     alone while Remove checked the key, so a Stair carry row shipped with a
     live +1 and one click doubled a fee nobody quoted. Both controls are now
     on the same condition, and 0406 refuses the key in the database so a
     hidden button is not the only thing standing between the customer and a
     double charge. */
  it("offers NEITHER control on a server-computed fee, so the fee cannot be doubled", () => {
    const { container } = drawRow(row({ addon_key: "STAIR_CARRY", qty: 1, unit_price: 250 }));
    expect(screen.queryByTestId("so-addon-row-STAIR_CARRY")).toBeNull();
    expect(container.querySelectorAll("button")).toHaveLength(0);
    /* ⭐ AND THE ROW ITSELF STILL SHOWS. The customer is being charged this
       fee, so it is read on the order — the Goods table prints it like any
       other line and only the DOORS are withheld. That half is pinned in
       `SalesOrderWorkspace.ui-contract.test.ts`, where the row now lives. */
  });

  it("still offers both controls on a service a human actually picked", () => {
    drawRow(row({ qty: 1 }));
    const r = screen.getByTestId("so-addon-row-dispose-mattress");
    const labels = [...r.querySelectorAll("button")].map((b) => b.textContent ?? "");
    expect(labels).toContain("Add one more");
    expect(labels).toContain("Remove");
  });

  it("offers no Remove on a SERVER-COMPUTED fee — nobody picked it, so nobody misclicked it", () => {
    drawRow(row({ addon_key: "STAIR_CARRY", qty: 1 }));
    expect(screen.queryByTestId("so-addon-remove-STAIR_CARRY")).toBeNull();
  });

  it("`Add one more` grows the qty and repeats the size already sold", () => {
    drawRow(row({ qty: 2, attrs: { sizes: ["Queen", "King"], size: "Queen · King" } }));
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
