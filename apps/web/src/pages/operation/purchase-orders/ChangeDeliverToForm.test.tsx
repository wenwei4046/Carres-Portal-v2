import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const mutate = vi.fn();
vi.mock("@/lib/queries", () => ({
  useChangePoDeliverTo: () => ({ mutate, isPending: false }),
}));

import ChangeDeliverToForm, { changeDeliverToPreview, lastUnitsOf } from "./ChangeDeliverToForm";
import type { operationPoListRow } from "@/lib/queries";

const KLANG = "dest-klang";
const AL = "dest-al";
const OHANA = "dest-ohana";

type Line = operationPoListRow["purchase_order_lines"][number];
const line = (over: Partial<Line>): Line => ({
  id: "line-1", sku: "FENRIR-Q", qty: 6, received_qty: 0, identity_mode: "exact_unit",
  model_name: "Fenrir", size: "Queen", destination_id: null, ...over,
} as Line);

describe("changeDeliverToPreview · one arithmetic with 0610", () => {
  it("part of a line: the line lowers and a new line goes to the new Deliver To; total unchanged", () => {
    const r = changeDeliverToPreview([line({})], KLANG, "line-1", 2, AL);
    expect(r.rows.map((x) => [x.destinationId, x.qty])).toEqual([[KLANG, 4], [AL, 2]]);
    expect(r.total).toBe(6);
    expect(r.blocked).toBe(false);
  });

  it("joins the line of the same item already going there instead of a second one", () => {
    const r = changeDeliverToPreview(
      [line({}), line({ id: "line-2", qty: 1, destination_id: AL })], KLANG, "line-1", 2, AL);
    expect(r.rows.map((x) => [x.key, x.destinationId, x.qty])).toEqual([["line-1", KLANG, 4], ["line-2", AL, 3]]);
    expect(r.total).toBe(7);
  });

  it("the whole line only changes its Deliver To", () => {
    const r = changeDeliverToPreview([line({})], KLANG, "line-1", 6, AL);
    expect(r.rows).toEqual([{ key: "line-1", item: "Fenrir · Queen", destinationId: AL, qty: 6 }]);
  });

  it("refuses to fold a whole line into a sibling, like the door", () => {
    const r = changeDeliverToPreview(
      [line({ qty: 1 }), line({ id: "line-2", qty: 1, destination_id: AL })], KLANG, "line-1", 1, AL);
    expect(r.blocked).toBe(true);
  });

  it("leaves other items alone", () => {
    const r = changeDeliverToPreview([line({}), line({ id: "line-9", sku: "TRION-K" })], KLANG, "line-1", 2, AL);
    expect(r.rows.every((x) => x.item.startsWith("Fenrir"))).toBe(true);
  });
});

describe("lastUnitsOf · the pre-selection is the line's last n IDs", () => {
  it("takes the highest codes", () => {
    expect(lastUnitsOf(["U1-000-025", "U1-000-027", "U1-000-026"], 2)).toEqual(["U1-000-026", "U1-000-027"]);
  });
});

function po(lines: Line[]): operationPoListRow {
  return {
    id: "PO260903-4316", supplier_id: "s1", warehouse_id: "w1", destination_id: KLANG,
    status: "open", sup_status: "pending", so: null, so_refs: null, eta_date: null,
    version: 1, placed_at: "2026-09-03T00:00:00Z", purchase_order_lines: lines,
  } as operationPoListRow;
}
const destinations = [{ id: KLANG, name: "Carres Klang" }, { id: AL, name: "AL Sungai Buloh" }, { id: OHANA, name: "Ohana" }];
const units = ["U1-000-025", "U1-000-026", "U1-000-027"].map((unit_code) => ({ unit_code, status: "incoming", po_line_id: "line-1" }));

function renderForm(lines: Line[] = [line({ qty: 3 })]) {
  const onSaved = vi.fn();
  render(
    <ChangeDeliverToForm
      po={po(lines)}
      supplierName="Ohana"
      destinations={destinations}
      activeDestinations={destinations}
      units={units}
      onSaved={onSaved}
      onCancel={vi.fn()}
    />,
  );
  return { onSaved };
}

async function chooseDeliverTo(name: string) {
  fireEvent.keyDown(screen.getByRole("combobox", { name: "New Deliver To" }), { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name }));
}

/* A block body: a function returned from beforeEach is run as teardown. */
beforeEach(() => { mutate.mockReset(); });

describe("Change Deliver To form (Purchasing §5.4)", () => {
  it("shows the three facts as grey automatic boxes in the governed order", () => {
    renderForm();
    const labels = [...document.querySelectorAll("[data-kit='automatic-field']")].map((el) => el.closest("[id], div")?.textContent);
    expect(labels.join(" ")).toContain("Carres Klang");
    expect(screen.getByText("Current Deliver To")).toBeInTheDocument();
    expect(screen.getByText("Qty on this PO")).toBeInTheDocument();
    expect(screen.getByText("Qty you can move")).toBeInTheDocument();
  });

  it("pre-selects the last n Units, reviews the version, then saves the chosen Units", async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText("Qty to move"), { target: { value: "2" } });
    await chooseDeliverTo("AL Sungai Buloh");
    expect(screen.getByRole("checkbox", { name: "U1-000-027" })).toHaveAttribute("data-state", "checked");
    expect(screen.getByRole("checkbox", { name: "U1-000-026" })).toHaveAttribute("data-state", "checked");
    expect(screen.getByRole("checkbox", { name: "U1-000-025" })).toHaveAttribute("data-state", "unchecked");
    /* The operator may change the choice. */
    fireEvent.click(screen.getByRole("checkbox", { name: "U1-000-026" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "U1-000-025" }));
    expect(screen.getByTestId("cdt-gap")).toHaveTextContent("Reason is empty.");
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Customer in Sungai Buloh" } });
    expect(screen.queryByTestId("cdt-save")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("cdt-review-button"));
    const review = screen.getByTestId("cdt-review");
    expect(review).toHaveTextContent("PO260903-4316(2) · Ohana");
    expect(review).toHaveTextContent("Carres Klang");
    expect(review).toHaveTextContent("AL Sungai Buloh");
    expect(screen.getByTestId("cdt-total")).toHaveTextContent("3");
    expect(review).toHaveTextContent("Total unchanged");
    expect(review).toHaveTextContent("Version (2) must be sent to Ohana again");
    expect(review.textContent).not.toMatch(/[—–]/);
    fireEvent.click(screen.getByTestId("cdt-save"));
    expect(mutate).toHaveBeenCalledWith(
      { lineId: "line-1", qty: 2, destinationId: AL, reason: "Customer in Sungai Buloh", unitCodes: ["U1-000-025", "U1-000-027"] },
      expect.any(Object),
    );
  });

  it("any change after Review throws the review away", async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText("Qty to move"), { target: { value: "1" } });
    await chooseDeliverTo("Ohana");
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Nearer" } });
    fireEvent.click(screen.getByTestId("cdt-review-button"));
    expect(screen.getByTestId("cdt-review")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Qty to move"), { target: { value: "2" } });
    expect(screen.queryByTestId("cdt-review")).not.toBeInTheDocument();
    expect(screen.queryByTestId("cdt-save")).not.toBeInTheDocument();
  });

  it("only undelivered qty can move", () => {
    renderForm([line({ qty: 3, received_qty: 2 })]);
    expect(screen.getByText("Qty you can move").parentElement?.parentElement).toHaveTextContent("1");
    fireEvent.change(screen.getByLabelText("Qty to move"), { target: { value: "2" } });
    expect(screen.getByTestId("cdt-gap")).toHaveTextContent("Qty to move is more than the qty you can move.");
    expect(screen.getByTestId("cdt-gap")).toHaveTextContent("Enter a whole number from 1 to 1.");
    expect(screen.getByTestId("cdt-review-button")).toBeDisabled();
  });

  it("a fully received PO says to use a transfer instead", () => {
    renderForm([line({ qty: 3, received_qty: 3 })]);
    expect(screen.getByTestId("cdt-gap")).toHaveTextContent("Use a transfer instead.");
    expect(screen.queryByLabelText("Qty to move")).not.toBeInTheDocument();
  });

  it("does not offer the Deliver To the goods already go to", async () => {
    renderForm();
    fireEvent.keyDown(screen.getByRole("combobox", { name: "New Deliver To" }), { key: "ArrowDown" });
    await screen.findByRole("option", { name: "Ohana" });
    expect(screen.queryByRole("option", { name: "Carres Klang" })).not.toBeInTheDocument();
  });

  it("prints the door's refusal in two lines", async () => {
    mutate.mockImplementation((_input: unknown, handlers: { onError: (e: unknown) => void }) => handlers.onError({ body: { code: "unit_not_on_line" } }));
    renderForm();
    fireEvent.change(screen.getByLabelText("Qty to move"), { target: { value: "1" } });
    await chooseDeliverTo("Ohana");
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Nearer" } });
    fireEvent.click(screen.getByTestId("cdt-review-button"));
    fireEvent.click(screen.getByTestId("cdt-save"));
    expect(screen.getByTestId("cdt-refusal")).toHaveTextContent("A chosen Unit ID is no longer on this line.");
    expect(screen.getByTestId("cdt-refusal")).toHaveTextContent("Reload the purchase order and choose the Unit IDs again.");
  });
});
