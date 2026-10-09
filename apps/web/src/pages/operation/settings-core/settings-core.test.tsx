import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { VERIFIED_COMPANY_PROFILE } from "@carres/shared";

/**
 * Settings → Company · Office · Settings editors (COM · OFF · TEAM-02, owner
 * confirmed 9 Oct 2026): plain rows, Edit only for a named editor, Review
 * changes names its gap, the save goes to the audited door, and the change
 * record shows who · when · old → new.
 */
const apiFetch = vi.fn();
vi.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  ApiError: class ApiError extends Error {},
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import CompanySettings from "./CompanySettings";
import OfficeSettings from "./OfficeSettings";
import SettingsEditors from "./SettingsEditors";

const OFFICE = {
  work_days: [1, 2, 3, 4, 5], start_time: "09:00", end_time: "18:00", flexi_minutes: 60,
  lunch_start: "13:00", lunch_end: "14:00", lunch_shift_minutes: 60, holiday_region: "Kuala Lumpur",
};
let responses: Record<string, unknown>;

function mount(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter>{node}</MemoryRouter></QueryClientProvider>);
}

beforeEach(() => {
  apiFetch.mockReset();
  responses = {
    "/api/operation/settings/company": {
      stored: true, values: VERIFIED_COMPANY_PROFILE, revision: 4, canEdit: true,
      changes: [{
        id: 1, what: "company_profile", oldValue: { support_phone: null }, newValue: { support_phone: "011-6133 8862" },
        reason: null, actorName: "Shasha", changedAt: "2026-10-09T03:00:00Z",
      }],
    },
    "/api/operation/settings/office": { stored: true, values: OFFICE, revision: 2, holidays: [], canEdit: true, changes: [] },
    "/api/operation/settings/editors": {
      stored: true, canManage: true, owners: ["Jess"],
      people: [{ id: "u-shasha", name: "Shasha" }],
      grants: [],
    },
  };
  apiFetch.mockImplementation((url: string, init?: { method?: string }) => {
    if (!init?.method || init.method === "GET") return Promise.resolve(responses[url]);
    return Promise.resolve({ ok: true });
  });
});

describe("Settings → Company", () => {
  it("shows the verified identity as plain text with its change record", async () => {
    mount(<CompanySettings />);
    expect(await screen.findByText("202401055306 (1601150-X)")).toBeInTheDocument();
    expect(screen.getAllByText("Not set").length).toBeGreaterThan(0);
    const changes = screen.getByTestId("company-changes");
    expect(within(changes).getByText(/Shasha/)).toBeInTheDocument();
    expect(within(changes).getByText(/Customer support telephone: Not set → 011-6133 8862/)).toBeInTheDocument();
  });

  it("a reader who is not named sees no Edit", async () => {
    responses["/api/operation/settings/company"] = { ...(responses["/api/operation/settings/company"] as object), canEdit: false };
    mount(<CompanySettings />);
    expect(await screen.findByTestId("company-read-only")).toBeInTheDocument();
    expect(screen.queryByTestId("company-edit")).toBeNull();
  });

  it("Edit → Review changes → Save changes sends only the stored revision and the values", async () => {
    mount(<CompanySettings />);
    fireEvent.click(await screen.findByTestId("company-edit"));
    expect(screen.getByTestId("company-review-button")).toHaveTextContent("Review changes: nothing changed");
    fireEvent.change(screen.getByLabelText("Company telephone"), { target: { value: "03-1234 5678" } });
    fireEvent.click(screen.getByTestId("company-review-button"));
    expect(screen.getByText("Company telephone: Not set → 03-1234 5678")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("company-save"));
    await waitFor(() => expect(apiFetch.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(true));
    const put = apiFetch.mock.calls.find(([, init]) => init?.method === "PUT")!;
    expect(put[0]).toBe("/api/operation/settings/company");
    const body = JSON.parse(put[1].body);
    expect(body.revision).toBe(4);
    expect(body.values.company_phone).toBe("03-1234 5678");
    expect(body.values.registration_no).toBe("202401055306 (1601150-X)");
  });

  it("an empty legal name names the gap and cannot be reviewed", async () => {
    mount(<CompanySettings />);
    fireEvent.click(await screen.findByTestId("company-edit"));
    fireEvent.change(screen.getByLabelText(/Legal company name/), { target: { value: "  " } });
    expect(screen.getByTestId("company-review-button")).toBeDisabled();
    expect(screen.getByTestId("company-review-button")).toHaveTextContent("Legal company name is required");
  });
});

describe("Settings → Office", () => {
  it("reads Monday to Friday, 9:00 AM to 6:00 PM and the built-in holiday list for a year nobody recorded", async () => {
    mount(<OfficeSettings />);
    expect(await screen.findByText("Monday to Friday")).toBeInTheDocument();
    expect(screen.getByText("9:00 AM to 6:00 PM")).toBeInTheDocument();
    expect(screen.getByText("1:00 PM to 2:00 PM")).toBeInTheDocument();
    expect(screen.getByText(/Built-in list\. Not yet checked for Kuala Lumpur/)).toBeInTheDocument();
  });

  it("ticking Saturday reviews as a weekday change and saves through the door", async () => {
    mount(<OfficeSettings />);
    fireEvent.click(await screen.findByTestId("office-edit"));
    fireEvent.click(screen.getByLabelText("Saturday"));
    fireEvent.click(screen.getByText("Review changes"));
    expect(within(screen.getByTestId("office-review")).getByText("Office working days: Monday to Friday → Monday to Saturday")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("office-save"));
    await waitFor(() => expect(apiFetch.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(true));
    const put = apiFetch.mock.calls.find(([, init]) => init?.method === "PUT")!;
    expect(put[0]).toBe("/api/operation/settings/office");
    expect(JSON.parse(put[1].body).values.work_days).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe("Settings editors", () => {
  it("the owner names a person for one section", async () => {
    mount(<SettingsEditors />);
    const row = await screen.findByTestId("settings-editors-purchasing");
    expect(within(row).getByText("Jess · owner")).toBeInTheDocument();
    fireEvent.click(within(row).getByText("Add person"));
    expect(within(row).getByText("Save changes")).toBeDisabled();
  });

  it("someone who is not the owner reads the list without Add person", async () => {
    responses["/api/operation/settings/editors"] = { ...(responses["/api/operation/settings/editors"] as object), canManage: false };
    mount(<SettingsEditors />);
    expect(await screen.findByTestId("settings-editors-read-only")).toBeInTheDocument();
    expect(screen.queryByText("Add person")).toBeNull();
  });
});
