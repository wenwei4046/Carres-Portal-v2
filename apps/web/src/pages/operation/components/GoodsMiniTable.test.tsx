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
