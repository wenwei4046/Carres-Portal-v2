import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import CaseFollowUps from "./CaseFollowUps";
import { fmtDateShort } from "@/lib/fmt-date";

/**
 * S3 in the case view: the chain the case is running, what has been recorded
 * against it, and the one rule that matters — nothing closes until every step
 * has a date on it.
 */

const apiFetchMock = vi.fn();
vi.mock("@/lib/api", () => ({ apiFetch: (...a: unknown[]) => apiFetchMock(...a) }));

const REPAIR = {
  customerWants: ["repair"] as const,
  customerName: "Ryan Chong",
  supplierName: "Ohana",
};

const recorded = (step: string, note?: string) => ({
  step,
  on: "2026-07-20",
  at: "2026-07-27T02:00:00Z",
  by: "u-1",
  byRole: "operation",
  note: note ?? null,
});

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

beforeEach(() => {
  apiFetchMock.mockReset();
  apiFetchMock.mockResolvedValue({ id: "c1", step: "collect" });
});

describe("CaseFollowUps", () => {
  it("lists the whole chain the customer's answer set off, with the factory named", () => {
    render(wrap(<CaseFollowUps caseId="c1" answers={REPAIR} progress={[]} />));

    expect(screen.getByText("Call Ohana — confirm the repair date")).toBeInTheDocument();
    expect(screen.getByText("Collect the item from Ryan Chong")).toBeInTheDocument();
    expect(screen.getByText("Send the item to Ohana")).toBeInTheDocument();
    expect(screen.getByText("Check in the item from Ohana")).toBeInTheDocument();
    expect(screen.getByText("Deliver the item back to Ryan Chong")).toBeInTheDocument();
    expect(
      screen.getByText("Call Ryan Chong — confirm the problem is solved"),
    ).toBeInTheDocument();
    expect(screen.getByText("0 of 6 done")).toBeInTheDocument();
  });

  it("reads a recorded step as a fact, with its date and who recorded it", () => {
    render(
      wrap(<CaseFollowUps caseId="c1" answers={REPAIR} progress={[recorded("collect")]} />),
    );

    expect(screen.getByText("Collected")).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`${fmtDateShort("2026-07-20")}.*recorded by operation`)),
    ).toBeInTheDocument();
    expect(screen.queryByText("Collect the item from Ryan Chong")).not.toBeInTheDocument();
    expect(screen.getByText("1 of 6 done")).toBeInTheDocument();
  });

  it("says the case cannot be closed while anything is still open", () => {
    render(
      wrap(<CaseFollowUps caseId="c1" answers={REPAIR} progress={[recorded("collect")]} />),
    );
    expect(
      screen.getByText(/can only be closed once every step above has a date/),
    ).toBeInTheDocument();
  });

  it("says so plainly once the chain is complete", () => {
    const all = [
      "supplier_date",
      "collect",
      "at_supplier",
      "back_from_supplier",
      "redeliver",
      "customer_confirmed",
    ].map((s) => recorded(s));
    render(wrap(<CaseFollowUps caseId="c1" answers={REPAIR} progress={all} />));

    expect(screen.getByText(/Set the status to Resolved to close this case/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Record" })).not.toBeInTheDocument();
  });

  it("records an outcome as a DATE, not a tick", async () => {
    render(
      wrap(<CaseFollowUps caseId="c1" answers={REPAIR} progress={[recorded("supplier_date")]} />),
    );

    // The first open step is the collection.
    fireEvent.click(screen.getAllByRole("button", { name: "Record" })[0]);
    expect(screen.getByText("Date it was collected")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());

    const [path, init] = apiFetchMock.mock.calls[0] as [string, { body: string }];
    expect(path).toBe("/api/ops/service-cases/c1/progress");
    const body = JSON.parse(init.body) as { step: string; on: string };
    expect(body.step).toBe("collect");
    expect(body.on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("will not record an inspection until the finding is written down", () => {
    render(
      wrap(
        <CaseFollowUps
          caseId="c1"
          answers={{ ...REPAIR, customerWants: ["inspection"] }}
          progress={[]}
        />,
      ),
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Record" })[0]);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(/Left corner seam open/), {
      target: { value: "Seam open, 4 inches" },
    });
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("shows a case with no answers the one step every case ends on", () => {
    // A case filed before the wizard has no wants at all. It still cannot be
    // closed without the customer saying it is solved.
    render(
      wrap(
        <CaseFollowUps
          caseId="c1"
          answers={{ customerWants: [], customerName: "Walk-in" }}
          progress={[]}
        />,
      ),
    );

    expect(screen.getByText("Call Walk-in — confirm the problem is solved")).toBeInTheDocument();
    expect(screen.getByText("0 of 1 done")).toBeInTheDocument();
  });
});
