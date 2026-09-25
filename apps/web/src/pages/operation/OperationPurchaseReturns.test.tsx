/**
 * The owner-confirmed Purchase Returns register — `docs/purchasing/MASTER.md`
 * §9.6 (Jess, 2026-09-18).
 *
 * Every test here asserts something the OWNER confirmed, not something the
 * implementation happens to do. §9.6 was written after a preview walk and
 * names its rulings one by one; the point of this file is that the next chat
 * cannot quietly re-invent a field or a layout — the sentence it would break
 * fails a test with the ruling's own words in the failure message.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  PURCHASE_RETURN_SUPERSEDED_LABELS,
  type PurchaseReturnListRow,
  type PurchaseReturnUnitRow,
} from "@carres/shared";
import OperationPurchaseReturns, {
  PurchaseReturnsRegister,
} from "./OperationPurchaseReturns";

vi.mock("./PurchasingTabs", () => ({ default: () => <header>Purchase Returns</header> }));

const returnsQuery = vi.fn();
vi.mock("@/lib/queries", () => ({
  useOperationPurchaseReturns: (...args: unknown[]) => returnsQuery(...args),
}));

const unit = (over: Partial<PurchaseReturnUnitRow> = {}): PurchaseReturnUnitRow => ({
  unit_id: "U-20260904-0142",
  po_id: "PO-20260901-0251",
  category: "Sofa",
  item: "Sofa Lyra",
  item_spec: "Left arm · Grey",
  pickup_location: "AL Sungai Buloh",
  return_to: "Hookka Factory, Muar",
  collected_by: null,
  actual_pickup_date: null,
  supplier_received_date: null,
  evidence: [{ purpose: "problem", photos: 3, videos: 1 }],
  ...over,
});

const doc = (over: Partial<PurchaseReturnListRow> = {}): PurchaseReturnListRow => ({
  id: "return-1042",
  pr_no: "20260915-1042",
  pr_doc_date: "2026-09-15T02:00:00Z",
  supplier_id: "supplier-hookka",
  supplier_name: "Hookka",
  claim_no: "SC-1038",
  grn_no: "GRN-20260904-1064",
  document_sent_at: null,
  confirmed_pickup_date: null,
  units: [unit()],
  ...over,
});

function show(returns: PurchaseReturnListRow[]) {
  return render(
    <MemoryRouter initialEntries={["/operation?tab=purchase-returns"]}>
      <PurchaseReturnsRegister returns={returns} />
    </MemoryRouter>,
  );
}

/** The register's visible column headings, in the order they are drawn. */
function headings(): string[] {
  return screen
    .getAllByRole("columnheader")
    .map((th) => (th.textContent ?? "").trim())
    .filter(Boolean);
}

describe("the confirmed column order", () => {
  it("leads with PR Doc Date then PR No", () => {
    show([doc()]);
    const visible = headings();
    expect(visible.indexOf("PR Doc Date")).toBeLessThan(visible.indexOf("PR No"));
    expect(visible.indexOf("PR No")).toBeLessThan(visible.indexOf("Supplier"));
  });

  it("puts Category immediately before the combined PO No / Unit ID cell", () => {
    show([doc()]);
    const visible = headings();
    const category = visible.indexOf("Category");
    const po = visible.indexOf("PO No");
    expect(category).toBeGreaterThan(-1);
    expect(po).toBe(category + 1);
  });

  it("carries one PO No column, never a separate Unit ID column", () => {
    show([doc()]);
    expect(headings().filter((h) => h === "Unit ID")).toHaveLength(0);
  });

  it("shows the three pickup and receipt dates as separate columns", () => {
    show([doc()]);
    const visible = headings();
    expect(visible).toContain("Confirmed Pickup Date");
    expect(visible).toContain("Actual Pickup Date");
    expect(visible).toContain("Supplier Received Date");
  });

  it("excludes Finance — no Credit Consequence, no Work column", () => {
    show([doc()]);
    const visible = headings().join(" ");
    expect(visible).not.toMatch(/Finance|Credit|Work/);
  });

  it("does not revive the superseded labels on this register", () => {
    const { container } = show([doc()]);
    const text = container.textContent ?? "";
    for (const label of PURCHASE_RETURN_SUPERSEDED_LABELS) {
      expect(text).not.toContain(label);
    }
  });
});

describe("the visible reference wears PR-", () => {
  it("prints PR-, never PRTN-", () => {
    show([doc({ pr_no: "PRTN-20260915-1042" })]);
    expect(screen.getByText("PR-20260915-1042")).toBeTruthy();
    expect(screen.queryByText(/PRTN-/)).toBeNull();
  });
});

describe("the combined PO No / Unit ID cell", () => {
  it("prints the PO on line one and the Unit ID beneath it", () => {
    show([doc()]);
    expect(screen.getByText("PO-20260901-0251")).toBeTruthy();
    expect(screen.getByText("U-20260904-0142")).toBeTruthy();
  });

  it("exposes the count as the expansion entry when a return carries several", () => {
    show([doc({ units: [unit(), unit({ unit_id: "U-20260904-0143" })] })]);
    expect(screen.getByText("2 Units")).toBeTruthy();
  });
});

describe("the expansion is one row per Unit, Qty 1", () => {
  it("opens a per-Unit table where every row's quantity is 1", () => {
    show([doc({ units: [unit(), unit({ unit_id: "U-20260904-0143" })] })]);
    fireEvent.click(screen.getAllByRole("button", { name: /expand|show/i })[0]);

    const table = screen.getByTestId("purchase-return-units-table");
    const bodyRows = within(table).getAllByRole("row").slice(1);
    expect(bodyRows).toHaveLength(2);
    for (const row of bodyRows) {
      expect(within(row).getByText("1")).toBeTruthy();
    }
  });

  it("re-leads the expansion on Category, still ahead of PO No", () => {
    show([doc()]);
    fireEvent.click(screen.getAllByRole("button", { name: /expand|show/i })[0]);

    const table = screen.getByTestId("purchase-return-units-table");
    const childHeadings = within(table)
      .getAllByRole("columnheader")
      .map((th) => (th.textContent ?? "").trim());
    expect(childHeadings[0]).toBe("Category");
    expect(childHeadings[1]).toBe("PO No");
    expect(childHeadings.at(-1)).toBe("Evidence");
  });
});

describe("dates are never invented", () => {
  it("withholds the parent pickup date while one Unit is still outstanding", () => {
    const { container } = show([
      doc({
        confirmed_pickup_date: "2026-09-17T00:00:00Z",
        units: [
          unit({ actual_pickup_date: "2026-09-17T03:00:00Z", collected_by: "Faizal" }),
          unit({ unit_id: "U-20260904-0143" }),
        ],
      }),
    ]);
    // Collected 1 of 2 — the document has no single pickup date to print.
    expect(screen.getByText("Faizal")).toBeTruthy();
    expect((container.textContent ?? "").includes("Not recorded")).toBe(true);
  });

  it("does not let a fully collected return claim supplier receipt", () => {
    show([
      doc({
        document_sent_at: "2026-09-14T06:00:00Z",
        confirmed_pickup_date: "2026-09-17T00:00:00Z",
        units: [
          unit({
            actual_pickup_date: "2026-09-17T03:00:00Z",
            collected_by: "Faizal",
            evidence: [{ purpose: "pickup", photos: 2, videos: 0 }],
          }),
        ],
      }),
    ]);
    expect(screen.getByTestId("purchase-returns-rail-condition-Fully picked up")).toBeTruthy();
    expect(
      screen.queryByTestId("purchase-returns-rail-condition-Supplier received"),
    ).toBeNull();
  });
});

describe("the left rail — the confirmed four sections", () => {
  const rows = [
    doc({ id: "a", supplier_name: "Hookka" }),
    doc({ id: "b", supplier_name: "Hookka", pr_no: "1041" }),
    doc({ id: "c", supplier_name: "Ohana", pr_no: "1039" }),
  ];

  it("lists supplier names with their document counts, not a dropdown", () => {
    show(rows);
    const rail = screen.getByTestId("purchase-returns-rail");
    expect(within(rail).queryByRole("combobox")).toBeNull();

    const hookka = screen.getByTestId("purchase-returns-rail-supplier-Hookka");
    expect(hookka.textContent).toContain("Hookka");
    expect(hookka.textContent).toContain("2");
    expect(
      screen.getByTestId("purchase-returns-rail-supplier-Ohana").textContent,
    ).toContain("1");
  });

  it("filters on click and deselects on a second click", () => {
    show(rows);
    const ohana = screen.getByTestId("purchase-returns-rail-supplier-Ohana");

    fireEvent.click(ohana);
    expect(ohana.getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByText("PR-a")).toBeNull();
    expect(screen.getByText("PR-1039")).toBeTruthy();

    fireEvent.click(ohana);
    expect(ohana.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("PR-20260915-1042")).toBeTruthy();
  });

  it("draws the four confirmed sections and no date-range or location section", () => {
    /* The Evidence section is drawn only when a condition inside it is true of
       some document — an empty heading promises rows that do not exist. So the
       fixture carries one collected Unit with no pickup proof. */
    show([
      ...rows,
      doc({
        id: "d",
        pr_no: "1036",
        units: [
          unit({
            unit_id: "U-20260830-0091",
            actual_pickup_date: "2026-09-12T04:00:00Z",
            evidence: [{ purpose: "problem", photos: 4, videos: 0 }],
          }),
        ],
      }),
    ]);
    const rail = screen.getByTestId("purchase-returns-rail");
    const text = rail.textContent ?? "";
    expect(text).toContain("Supplier");
    expect(text).toContain("Return document");
    expect(text).toContain("Pickup");
    expect(text).toContain("Evidence");
    expect(text).not.toContain("Date range");
    expect(text).not.toContain("Pickup Location");
  });

  it("counts documents rather than Units", () => {
    show([doc({ units: [unit(), unit({ unit_id: "U-2" }), unit({ unit_id: "U-3" })] })]);
    const hookka = screen.getByTestId("purchase-returns-rail-supplier-Hookka");
    // Three Units, ONE document of work.
    expect(hookka.textContent).toContain("1");
    expect(hookka.textContent).not.toContain("3");
  });

  it("lets the conditions overlap — one return counted under three", () => {
    show([doc()]);
    expect(
      screen.getByTestId("purchase-returns-rail-condition-Return document not sent"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("purchase-returns-rail-condition-Pickup date not confirmed"),
    ).toBeTruthy();
    expect(screen.getByTestId("purchase-returns-rail-condition-Not picked up")).toBeTruthy();
  });

  it("supplier and condition combine", () => {
    show([
      doc({ id: "a", supplier_name: "Hookka", document_sent_at: "2026-09-15T06:00:00Z" }),
      doc({ id: "b", supplier_name: "Ohana", pr_no: "1039" }),
    ]);
    fireEvent.click(
      screen.getByTestId("purchase-returns-rail-condition-Return document not sent"),
    );
    expect(screen.getByText("PR-1039")).toBeTruthy();
    expect(screen.queryByText("PR-20260915-1042")).toBeNull();
  });
});

describe("evidence is per Unit and per purpose", () => {
  const collected = doc({
    units: [
      unit({
        actual_pickup_date: "2026-09-17T03:00:00Z",
        collected_by: "Faizal",
        evidence: [
          { purpose: "problem", photos: 3, videos: 1 },
          { purpose: "pickup", photos: 2, videos: 0 },
        ],
      }),
    ],
  });

  it("stays compact until the operator asks", () => {
    show([collected]);
    fireEvent.click(screen.getAllByRole("button", { name: /expand|show/i })[0]);

    expect(screen.queryByText("Problem evidence")).toBeNull();
    fireEvent.click(screen.getByTestId("purchase-return-evidence-toggle-U-20260904-0142"));
    expect(screen.getByText("Problem evidence")).toBeTruthy();
    expect(screen.getByText("Pickup proof")).toBeTruthy();
    expect(screen.getByText("Supplier receipt proof")).toBeTruthy();
  });

  it("never labels a damage photo as pickup or receipt proof", () => {
    show([
      doc({
        units: [
          unit({
            actual_pickup_date: "2026-09-17T03:00:00Z",
            evidence: [{ purpose: "problem", photos: 4, videos: 1 }],
          }),
        ],
      }),
    ]);
    fireEvent.click(screen.getAllByRole("button", { name: /expand|show/i })[0]);
    fireEvent.click(screen.getByTestId("purchase-return-evidence-toggle-U-20260904-0142"));

    const block = screen.getByTestId("purchase-return-evidence-U-20260904-0142");
    const rows = Array.from(block.children).map((c) => c.textContent ?? "");
    expect(rows.find((r) => r.startsWith("Problem evidence"))).toContain("Photos 4");
    expect(rows.find((r) => r.startsWith("Pickup proof"))).toContain("None");
    expect(rows.find((r) => r.startsWith("Supplier receipt proof"))).toContain("None");
  });

  it("puts a collected Unit with no pickup proof into the evidence queue", () => {
    show([
      doc({
        units: [
          unit({
            actual_pickup_date: "2026-09-17T03:00:00Z",
            evidence: [{ purpose: "problem", photos: 4, videos: 0 }],
          }),
        ],
      }),
    ]);
    expect(
      screen.getByTestId("purchase-returns-rail-condition-Pickup proof missing"),
    ).toBeTruthy();
  });

  it("does not accuse a Unit nobody has collected", () => {
    show([doc()]);
    expect(
      screen.queryByTestId("purchase-returns-rail-condition-Pickup proof missing"),
    ).toBeNull();
  });
});

describe("the confirmed rail does not disappear", () => {
  it("still draws all four §9.6 sections on an empty register", () => {
    /* An earlier change in this file hid the whole rail when the register was
       empty. §9.6 confirms these four sections; tidying a blank column is not
       a licence to delete approved UI. The HEADINGS draw always — only their
       rows depend on the data. */
    show([]);
    const rail = screen.getByTestId("purchase-returns-rail");
    for (const title of ["Supplier", "Return document", "Pickup", "Evidence"]) {
      expect(rail.textContent, title).toContain(title);
    }
  });

  it("offers no filter rows when no document makes one true", () => {
    show([]);
    expect(
      screen.queryByTestId("purchase-returns-rail-condition-Not picked up"),
    ).toBeNull();
    expect(screen.getByText("No purchase returns.")).toBeTruthy();
  });

  it("fills the same sections once a document exists", () => {
    show([doc()]);
    expect(screen.getByTestId("purchase-returns-rail-supplier-Hookka")).toBeTruthy();
    expect(screen.getByTestId("purchase-returns-rail-condition-Not picked up")).toBeTruthy();
  });
});

describe("the register acts on nothing", () => {
  it("offers no blank + New and no batch actions", () => {
    show([doc()]);
    expect(screen.queryByRole("button", { name: /^\+ ?New/i })).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});

/**
 * The container — the half that talks to the server.
 *
 * §6.7 rule 7: *"Loading, failure, genuinely empty and filtered-empty states
 * are distinct."* They are asserted here rather than in the layout tests above,
 * because that is where they can actually differ: the presentational half is
 * handed a state, the container is what DECIDES one.
 */
describe("the page binds the register to its own read", () => {
  const idle = {
    data: { returns: [doc()] },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  };

  function page(over: Record<string, unknown> = {}, path = "/operation?tab=purchase-returns") {
    returnsQuery.mockReturnValue({ ...idle, ...over });
    return render(
      <MemoryRouter initialEntries={[path]}>
        <OperationPurchaseReturns />
      </MemoryRouter>,
    );
  }

  it("shows the rows the read returned", () => {
    page();
    expect(screen.getByText("PR-20260915-1042")).toBeTruthy();
  });

  it("narrows to one Supplier Claim when the address names it", () => {
    page({}, "/operation?tab=purchase-returns&claim=SC-1038");
    expect(returnsQuery).toHaveBeenCalledWith("SC-1038");
  });

  it("asks for every return when no claim is named", () => {
    page();
    expect(returnsQuery).toHaveBeenCalledWith(null);
  });

  it("says a read FAILED rather than showing an empty register", () => {
    page({ data: undefined, isError: true, error: { message: "boom" } });
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Purchase Returns could not be loaded.")).toBeTruthy();
    // A failure is not "no purchase returns" — that would read as finished work.
    expect(screen.queryByText("No purchase returns.")).toBeNull();
  });

  it("names a refusal as a refusal, not as a breakage", () => {
    page({ data: undefined, isError: true, error: { status: 403, message: "nope" } });
    expect(screen.getByText("You do not have access to Purchase Returns.")).toBeTruthy();
  });

  it("reads an ABSENT feature as absent, never as an empty register", () => {
    /* The window between this code deploying and migration 0548 being applied
       through the governed owner path. PostgREST answers `42P01` for a table
       that is not there and `mapPgError` turns that into a 404, so the page
       says the register could not be loaded.

       §9.2 ruled this exact posture for Manual Purchase's Ready Stock cell in
       its own unapplied window: *"the feature is absent, not empty, and no
       line is told it has `0 available` when nobody looked."* Printing
       `No purchase returns.` here would tell an operator that Carres has sent
       nothing back to any supplier — a confident, false statement about the
       business, made by a screen that never reached the data. */
    page({ data: undefined, isError: true, error: { status: 404, message: "not found" } });
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Purchase Returns could not be loaded.")).toBeTruthy();
    expect(screen.queryByText("No purchase returns.")).toBeNull();
  });

  it("distinguishes genuinely empty from loading", () => {
    page({ data: { returns: [] }, isLoading: false });
    expect(screen.getByText("No purchase returns.")).toBeTruthy();
  });
});
