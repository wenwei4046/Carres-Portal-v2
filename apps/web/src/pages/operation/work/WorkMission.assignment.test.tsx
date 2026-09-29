import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { WorkRow } from "../use-open-work";
import type { WorkAct } from "./work-stops";
import WorkMission from "./WorkMission";

vi.mock("./use-work-data", () => ({
  useWorkOrderRoute: () => ({ route: {}, detail: { order: { so: 1357, customer_name: "Customer" } }, loading: false, failed: false }),
}));
vi.mock("./work-stops", () => ({
  workStopsOf: ({ acts }: { acts: WorkAct[] }) => [{ key: "delivery_date", label: "DELIVERY DATE", tone: "due", quiet: false,
    cards: acts.map((act) => ({ key: act.key, title: act.title, why: null, act, checklist: [] })),
  }],
}));
vi.mock("./WorkActForms", () => ({
  useRefreshWork: () => vi.fn(), WorkDocumentSheet: () => null,
  DeliveryDateForm: () => <div data-testid="owning-delivery-form">Record reply</div>,
  AssignLogisticsForm: () => null, SendPoForm: () => null, SupplierAnswerForm: () => null,
}));

const act: WorkAct = { key: "date", occurrenceId: "delivery:order:date", kind: "delivery_date", title: "Get delivery date from NETS", button: "Record reply", stop: "delivery-date", party: "logistics", why: null, missed: false };

describe("Workspace assignment is accountability, not an execution gate", () => {
  it.each([
    [{ userId: "ali", name: "Ali" }, "Assigned to Ali"],
    [null, "Not assigned"],
  ])("keeps the owning form available while showing only current assignment", (acting, label) => {
    const item = { id: act.occurrenceId, source: { owner: { normal: { userId: "jess", name: "Jess" }, acting } } } as WorkRow;
    const { container } = render(<MemoryRouter><WorkMission orderId="order" acts={[act]} items={[item]} pos={[]} logistics={null} stacked={false} onPickAct={vi.fn()} /></MemoryRouter>);
    expect(screen.getByTestId("work-assigned-date")).toHaveTextContent(label);
    expect(container).not.toHaveTextContent(/Normal owner|Buddy cover|Acting owner|Assigned to Jess|Completed by/);
    fireEvent.click(screen.getByRole("button", { name: "Record reply" }));
    expect(screen.getByTestId("owning-delivery-form")).toBeVisible();
  });
});
