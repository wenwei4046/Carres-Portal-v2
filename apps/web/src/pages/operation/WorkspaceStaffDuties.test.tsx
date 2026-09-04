import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WorkspaceStaffDuties from "./WorkspaceStaffDuties";

const mutate = vi.fn();
const useWorkspaceDuties = vi.fn();
vi.mock("@/lib/queries", () => ({
  useWorkspaceDuties: (...args: unknown[]) => useWorkspaceDuties(...args),
  useSetWorkspaceDutyAssignment: () => ({ mutate, isPending: false }),
}));

const SHASHA = "11111111-1111-4111-8111-111111111111";
const YU_JUN = "22222222-2222-4222-8222-222222222222";

function response(canEdit = true) {
  return {
    data: {
      onDate: "2026-09-04",
      canEdit,
      staff: [
        { userId: SHASHA, name: "Shasha" },
        { userId: YU_JUN, name: "Yu Jun" },
      ],
      duties: [
        {
          key: "purchasing.po",
          name: "PO Duty",
          description: "Issue purchase orders.",
          assignment: {
            id: "33333333-3333-4333-8333-333333333333",
            dutyKey: "purchasing.po",
            primaryUserId: SHASHA,
            buddyUserId: YU_JUN,
            startsOn: "2026-09-01",
            endsOn: null,
          },
          resolution: {
            dutyKey: "purchasing.po",
            onDate: "2026-09-04",
            normalOwner: { userId: SHASHA, name: "Shasha" },
            buddy: { userId: YU_JUN, name: "Yu Jun" },
            activeCover: { userId: YU_JUN, name: "Yu Jun" },
            actingPerson: { userId: YU_JUN, name: "Yu Jun" },
            state: "covered",
            assignmentId: "33333333-3333-4333-8333-333333333333",
          },
        },
        {
          key: "approval.payment",
          name: "Payment Approver",
          description: "Decide payment exceptions.",
          assignment: null,
          resolution: {
            dutyKey: "approval.payment",
            onDate: "2026-09-04",
            normalOwner: null,
            buddy: null,
            activeCover: null,
            actingPerson: null,
            state: "not_assigned",
            assignmentId: null,
          },
        },
      ],
    },
    isLoading: false,
    isError: false,
  };
}

beforeEach(() => {
  mutate.mockReset();
  useWorkspaceDuties.mockReturnValue(response());
});

function renderPage() {
  return render(<MemoryRouter><WorkspaceStaffDuties /></MemoryRouter>);
}

describe("Workspace → Staff & Duties", () => {
  it("renders one row per Duty with Primary and Buddy as separate facts", () => {
    renderPage();
    expect(screen.getAllByTestId("duty-row")).toHaveLength(2);
    expect(screen.getByText("Primary")).toBeInTheDocument();
    expect(screen.getByText("Buddy")).toBeInTheDocument();
    expect(screen.getAllByText("Shasha").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Yu Jun").length).toBeGreaterThan(0);
  });

  it("keeps normal owner and today's cover visible together", () => {
    renderPage();
    expect(screen.getByText("Covered today")).toBeInTheDocument();
    expect(screen.getByText(/Normal owner: Shasha/)).toBeInTheDocument();
    expect(screen.getByText(/Today's cover: Yu Jun/)).toBeInTheDocument();
  });

  it("shows Not assigned as a configuration gap on this edit door", () => {
    renderPage();
    expect(screen.getByText("Not assigned")).toBeInTheDocument();
    expect(screen.getByText("Set Primary and optional Buddy here.")).toBeInTheDocument();
  });

  it("saves one assignment change from structured fields", () => {
    renderPage();
    fireEvent.click(screen.getAllByRole("button", { name: "Save assignment" })[0]!);
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({
      dutyKey: "purchasing.po",
      primaryUserId: SHASHA,
      buddyUserId: YU_JUN,
    }));
  });

  it("is read-only for non-managers", () => {
    useWorkspaceDuties.mockReturnValue(response(false));
    renderPage();
    expect(screen.queryByRole("button", { name: "Save assignment" })).not.toBeInTheDocument();
    expect(screen.getByText("Only authorised management can change assignments.")).toBeInTheDocument();
  });

  it("does not create module-local rota or permission wording", () => {
    renderPage();
    expect(screen.queryByText(/Permissions matrix/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/monthly rota/i)).not.toBeInTheDocument();
  });
});
