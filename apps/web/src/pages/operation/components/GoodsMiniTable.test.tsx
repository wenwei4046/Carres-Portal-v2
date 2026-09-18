/**
 * The child mini-table's own laws (owner rulings 2026-08-15), held here so
 * that the SECOND page to adopt the box inherits them instead of re-deriving
 * them. The Sales Orders Register's own file holds the register-side proof;
 * this one holds what the box promises whoever mounts it.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import GoodsMiniTable, {
  categoryWord,
  goodsCategoryOf,
  type GoodsMiniLine,
} from "./GoodsMiniTable";

const goodsLine = (over: Partial<GoodsMiniLine> = {}): GoodsMiniLine => ({
  key: "line-1",
  category: "Mattress",
  unitIds: ["CRS-000121"],
  unitAbsence: "Not allocated",
  deliverTo: ["Carres Klang"],
  deliverToAbsence: "Not recorded",
  sku: "B1201S-K",
  qty: 2,
  item: "B1201S · King",
  selectable: true,
  ...over,
});

const serviceLine = (): GoodsMiniLine => ({
  key: "addon-0",
  category: "Service",
  unitIds: [],
  unitAbsence: "—",
  deliverTo: [],
  deliverToAbsence: "—",
  sku: "disposal_service",
  qty: 1,
  item: "disposal service",
  selectable: false,
});

describe("GoodsMiniTable", () => {
  it("prints the owner's re-ruled column order with Item always last", () => {
    render(<GoodsMiniTable label="Goods on SO-1303" lines={[goodsLine()]} />);
    const table = screen.getByRole("table", { name: "Goods on SO-1303" });
    expect(within(table).getAllByRole("columnheader").map((c) => c.textContent)).toEqual([
      "Category",
      "Unit ID",
      "Deliver To",
      "SKU",
      "Qty",
      "Item",
    ]);
  });

  /**
   * FIXED WIDTHS ARE WHAT MAKE TWO EXPANSIONS ONE LISTING. Read them off the
   * `<colgroup>`: five declared widths and a sixth column that declares none,
   * because `Item` is the flexible remainder.
   */
  it("fixes every column but Item, so two expanded orders align", () => {
    const { container } = render(
      <GoodsMiniTable label="Goods on SO-1303" lines={[goodsLine()]} />,
    );
    const cols = [...container.querySelectorAll("col")];
    expect(cols.map((c) => (c as HTMLTableColElement).style.width)).toEqual([
      "132px",
      "140px",
      "200px",
      "152px",
      "64px",
      "",
    ]);
  });

  /** A truth register passes no selection and gets no ☑ column at all. */
  it("renders no selection column when the page does not buy from these lines", () => {
    const { container } = render(
      <GoodsMiniTable label="Goods on SO-1303" lines={[goodsLine(), serviceLine()]} />,
    );
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(container.querySelectorAll("col")).toHaveLength(6);
  });

  describe("with the selection capability switched on", () => {
    const withSelection = (selectedKeys = new Set<string>()) => {
      const onToggle = vi.fn();
      render(
        <GoodsMiniTable
          label="Goods on SO-1303"
          lines={[goodsLine(), serviceLine()]}
          selection={{ selectedKeys, onToggle }}
        />,
      );
      return onToggle;
    };

    it("gives every purchasable line a checkbox and the header none", () => {
      withSelection();
      /* ONE checkbox: the goods line. The header row has no select-all —
         that switch is the PARENT row, one whole-order switch, not two. */
      expect(screen.getAllByRole("checkbox")).toHaveLength(1);
      expect(screen.getByRole("checkbox", { name: "Select B1201S · King" })).toBeInTheDocument();
      const header = screen.getAllByRole("row")[0];
      expect(within(header).queryByRole("checkbox")).not.toBeInTheDocument();
    });

    it("prints a dash for a line nothing can be bought for", () => {
      withSelection();
      const service = screen.getAllByRole("row")[2];
      expect(within(service).queryByRole("checkbox")).not.toBeInTheDocument();
      expect(within(service).getAllByText("—")[0]).toHaveAttribute("data-absence", "true");
    });

    it("reports a tick to the page that owns the selection", () => {
      const onToggle = withSelection();
      fireEvent.click(screen.getByRole("checkbox", { name: "Select B1201S · King" }));
      expect(onToggle).toHaveBeenCalledWith("line-1");
    });

    it("shows a line the page already holds as ticked", () => {
      withSelection(new Set(["line-1"]));
      expect(screen.getByRole("checkbox", { name: "Select B1201S · King" })).toBeChecked();
    });
  });
});

describe("categoryWord", () => {
  it("writes a category the way a person writes it", () => {
    expect(categoryWord("MATTRESS")).toBe("Mattress");
    expect(categoryWord("mattress_protector")).toBe("Mattress protector");
    expect(categoryWord("Other goods")).toBe("Other goods");
  });

  it("returns nothing for nothing rather than inventing a word", () => {
    expect(categoryWord("")).toBe("");
    expect(categoryWord("  ")).toBe("");
  });
});

/**
 * ⭐ THE `Category` CELL HAS ONE ANSWER (DELIVERY CARD 02, 2026-08-21).
 *
 * Delivery Work shipped a second copy of this that stopped before `lineClass`,
 * so an AutoCount SKU printed `Other goods` on all 90 live rows while the Sales
 * Orders register, reading the identical line, printed `Mattress`. The box owns
 * the string now; these tests are why a third copy cannot quietly appear.
 */
describe("goodsCategoryOf — one answer, three sources in falling authority", () => {
  it("prefers what the line itself recorded", () => {
    expect(goodsCategoryOf({ sku: "H1401F-K", attrs: { category: "BEDFRAME" } })).toBe("Bedframe");
  });

  it("falls back to a canonical SKU's own head", () => {
    expect(goodsCategoryOf({ sku: "sofa:HK55-3S" })).toBe("Sofa");
  });

  it("reads an AutoCount SKU through the shared classifier — never `Other goods`", () => {
    // The exact regression: `H1401F-K` has no attrs and no `:` head.
    expect(goodsCategoryOf({ sku: "H1401F-K" })).toBe("Mattress");
    expect(goodsCategoryOf({ sku: "JAGER-SS" })).toBe("Bedframe");
  });

  it("says `Other goods` only when nothing recognises the line", () => {
    expect(goodsCategoryOf({ sku: "ZZZ-9999" })).toBe("Other goods");
  });

  it("names an accessory rather than borrowing a core category", () => {
    expect(goodsCategoryOf({ sku: "Mattress Protector King" })).toBe("Accessory");
  });
});

/**
 * ⭐ `On PO` IS A QUANTITY AND A DOOR — owner correction 2026-09-11.
 *
 * It used to stack every covering purchase order inside the cell, so a line
 * fourteen documents touch drew a fourteen-line-tall item row. A collection
 * must never decide how tall an item row is: the cell states the quantity the
 * arithmetic needs and points at the read-only details, where each document is
 * its own row. A truth register still asks for none of it.
 */
describe("the optional Ordered Qty column", () => {
  it("is absent unless the page asks for it", () => {
    render(<GoodsMiniTable label="Goods on SO-1303" lines={[goodsLine()]} />);
    expect(screen.queryByRole("columnheader", { name: "Ordered Qty" })).not.toBeInTheDocument();
  });

  it("states HOW MANY units documents have ORDERED — never the documents themselves", () => {
    render(
      <GoodsMiniTable
        label="Goods on SO-1303"
        showOrderedQty
        lines={[{ ...goodsLine(), orderedQty: 3, orderedQtyAbsence: "Not ordered yet" }]}
      />,
    );
    /* ⭐ `Ordered Qty`, not `On PO`: this figure is the HISTORICAL lineage,
       delivered documents included, while `On PO` is the dictionary's head for
       the engine's still-outstanding coverage. */
    expect(screen.getByRole("columnheader", { name: "Ordered Qty" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "On PO" })).toBeNull();
    expect(screen.getByText("3")).toBeInTheDocument();
    /* THE ROW'S HEIGHT IS ITS OWN. No PO number reaches this table at all. */
    expect(screen.queryByText(/PO-d/)).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "Covered by" })).toBeNull();
  });

  it("opens the details when the page gives it somewhere to send the reader", () => {
    const onOpenPoDetails = vi.fn();
    render(
      <GoodsMiniTable
        label="Goods on SO-1303"
        showOrderedQty
        onOpenPoDetails={onOpenPoDetails}
        lines={[{ ...goodsLine(), orderedQty: 14 }]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "14" }));
    expect(onOpenPoDetails).toHaveBeenCalledTimes(1);
  });

  it("prints the governed absence, quietly, when no document carries the line", () => {
    render(
      <GoodsMiniTable
        label="Goods on SO-1303"
        showOrderedQty
        lines={[{ ...goodsLine(), orderedQty: 0, orderedQtyAbsence: "Not ordered yet" }]}
      />,
    );
    const absence = screen.getByText("Not ordered yet");
    /* An absence keeps its word and loses its weight — the box's own rule. */
    expect(absence).toHaveAttribute("data-absence", "true");
  });

  it("keeps Item last for every sibling — the ruled order is untouched (law ①)", () => {
    render(
      <GoodsMiniTable
        label="Goods on SO-1303"
        showOrderedQty
        lines={[{ ...goodsLine(), orderedQty: 1 }]}
      />,
    );
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers[headers.length - 1]).toBe("Item");
    expect(headers).toEqual(["Category", "Unit ID", "Ordered Qty", "Deliver To", "SKU", "Qty", "Item"]);
  });
});

/**
 * ⭐ CARD 02-B — the exact-mapping columns, optional like everything else.
 * A sibling register that asks for nothing renders byte-identically; the
 * buying Register asks and gets `Supplier` and `PO Default Delivery Date` as fixed
 * columns BEFORE `Item`, which stays last (law ①).
 */
describe("Card 02-B · optional Supplier and PO Default Delivery Date", () => {
  it("absent by default — Sales Orders and Delivery keep their ruled layout", () => {
    render(<GoodsMiniTable label="Goods on SO-1303" lines={[goodsLine()]} />);
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Category", "Unit ID", "Deliver To", "SKU", "Qty", "Item"]);
  });

  it("present when asked, before Item, with values and quiet absences", () => {
    render(
      <GoodsMiniTable
        label="Goods on SO-1303"
        showOrderedQty
        showSupplier
        showPoDeliveryDate
        lines={[
          {
            ...goodsLine(),
            orderedQty: 1,
            orderedQtyAbsence: "Not ordered yet",
            supplier: "Nice Future",
            poDeliveryDate: "Fri, 18 Sep",
          },
          {
            ...goodsLine(),
            key: "second",
            sku: "B1201S-Q",
            orderedQty: 0,
            orderedQtyAbsence: "Not ordered yet",
            supplierAbsence: "—",
            poDeliveryDateAbsence: "—",
          },
        ]}
      />,
    );
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual([
      "Category", "Unit ID", "Ordered Qty", "Deliver To", "SKU", "Qty",
      "Supplier", "PO Default Delivery Date", "Item",
    ]);
    expect(screen.getByText("Nice Future")).toBeInTheDocument();
    expect(screen.getByText("Fri, 18 Sep")).toBeInTheDocument();
  });

  it("an editable Deliver To node renders instead of the printed strings", () => {
    render(
      <GoodsMiniTable
        label="Goods on SO-1303"
        lines={[
          {
            ...goodsLine(),
            deliverTo: ["never printed"],
            deliverToNode: <select data-testid="the-editor" />,
          },
        ]}
      />,
    );
    expect(screen.getByTestId("the-editor")).toBeInTheDocument();
    expect(screen.queryByText("never printed")).not.toBeInTheDocument();
  });
});

/* Purchasing MASTER §9.3 (Jess, 2026-09-17): the Purchase Orders expansion is
   exactly `SKU · Item / configuration · Qty · Deliver To`, read-only. */
describe("the Purchase Orders reading", () => {
  it("omits Category and Unit ID, names the item column, and offers no control", () => {
    render(
      <GoodsMiniTable
        label="Goods on PO-20260901-1001"
        lines={[goodsLine({ selectable: false, itemDetail: "Sand · CG-012" })]}
        identityFirst
        showUnitId={false}
        showCategory={false}
        itemHeading="Item / configuration"
      />,
    );
    const table = screen.getByRole("table", { name: "Goods on PO-20260901-1001" });
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "SKU", "Item / configuration", "Qty", "Deliver To",
    ]);
    expect(within(table).queryAllByRole("checkbox")).toHaveLength(0);
    expect(table).toHaveTextContent("Sand · CG-012");
  });

  it("every other caller keeps Category", () => {
    render(<GoodsMiniTable label="Goods on SO-1303" lines={[goodsLine()]} />);
    expect(within(screen.getByRole("table", { name: "Goods on SO-1303" })).getAllByRole("columnheader").map((h) => h.textContent)).toContain("Category");
  });
});

/**
 * ⭐ SO BATCH'S APPROVED ACTIONABLE EXPANSION — owner ruling 2026-09-18
 * (Purchasing §9.1 · UI §6.8–6.9). Opt-in: every other caller above renders
 * byte-identically, which is what the tests before this one hold.
 */
describe("the SO Batch buying reading", () => {
  const soBatchLine = (over: Partial<GoodsMiniLine> = {}): GoodsMiniLine =>
    goodsLine({
      status: "Need PO",
      itemDetail: "King · Fabric 3",
      supplier: "Nice Furniture Sdn Bhd",
      fromStockNode: <span data-testid="stock-cell">3 available</span>,
      ...over,
    });

  function drawSoBatch(over: Partial<GoodsMiniLine> = {}, detail?: React.ReactNode) {
    return render(
      <GoodsMiniTable
        label="Goods on SO-1318"
        lines={[soBatchLine(over)]}
        soBatchGoodsLayout
        showStatus
        showSku={false}
        showFromStock
        showSupplier
        showUnitId={false}
        detailRow={detail === undefined ? undefined : () => detail}
        selection={{ selectedKeys: new Set(), onToggle: vi.fn() }}
      />,
    );
  }

  it("draws the seven approved columns, in the owner's order", () => {
    drawSoBatch();
    const table = screen.getByRole("table", { name: "Goods on SO-1318" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((h) => (h.textContent ?? "").trim())
        .filter(Boolean),
    ).toEqual([
      "Status", "Category", "Qty", "Item", "Ready Stock", "Supplier", "Supplier Deliver To",
    ]);
  });

  it("removed the five columns and kept the customer's own quantity", () => {
    drawSoBatch();
    const table = screen.getByRole("table", { name: "Goods on SO-1318" });
    const heads = within(table).getAllByRole("columnheader").map((h) => h.textContent);
    for (const gone of ["SKU", "Ordered Qty", "To buy", "Order By", "Unit ID"]) {
      expect(heads, gone).not.toContain(gone);
    }
    expect(table).not.toHaveTextContent("B1201S-K");
    expect(table).toHaveTextContent("2");
    /* And the configuration, which is what tells two lines of one model apart. */
    expect(table).toHaveTextContent("King · Fabric 3");
  });

  it("lets the page draw the Ready Stock cell", () => {
    drawSoBatch();
    expect(screen.getByTestId("stock-cell")).toHaveTextContent("3 available");
  });

  it("takes its CONTENT width and does not stretch to fill a canvas", () => {
    drawSoBatch();
    const table = screen.getByRole("table", { name: "Goods on SO-1318" });
    /* 36 + 112 + 132 + 64 + 240 + 136 + 136 + 200 */
    expect(table).toHaveStyle({ width: "1056px" });
    expect(table.className).not.toContain("w-full");
  });

  it("marks the ACTIVE goods context with a blue boundary", () => {
    drawSoBatch();
    expect(screen.getByTestId("goods-mini-table").className).toContain("border-kit-blue-6");
  });

  it("every other caller keeps the neutral frame", () => {
    render(<GoodsMiniTable label="Goods on SO-1303" lines={[goodsLine()]} />);
    expect(screen.getByTestId("goods-mini-table").className).toContain("border-base-200");
  });

  /**
   * ⭐ §6.9 — the connector belongs to the table, because only the table knows
   * where the `Ready Stock` column is. It exists ONLY while a picker is open,
   * so it can never run on into the next item.
   */
  it("draws the connector in the Ready Stock cell, only while a picker is open", () => {
    const { unmount } = drawSoBatch();
    expect(screen.queryByTestId("goods-connector-line-1")).toBeNull();
    unmount();
    drawSoBatch({}, <div data-testid="picker">the stock picker</div>);
    const line = screen.getByTestId("goods-connector-line-1");
    /* In the `Ready Stock` cell, so horizontal scrolling moves it with the
       arrow rather than leaving it behind. */
    expect(line.closest("td")).toBe(screen.getByTestId("stock-cell").closest("td"));
    expect(line.closest("td")).toHaveStyle({ position: "relative" });
    /* And it reaches PAST this cell, across the row divider and the gap, onto
       the frame's top border. */
    expect(line).toHaveStyle({ top: "28px", right: "15px", bottom: "-13px" });
  });

  it("opens the picker in its own row, under the item it is about", () => {
    drawSoBatch({}, <div data-testid="picker">the stock picker</div>);
    const rows = [
      ...screen
        .getByRole("table", { name: "Goods on SO-1318" })
        .querySelectorAll<HTMLTableRowElement>("tbody tr"),
    ];
    expect(rows.map((r) => r.getAttribute("data-row"))).toEqual(["demand", "detail"]);
    expect(within(rows[1]!).getByTestId("picker")).toBeInTheDocument();
  });
});
