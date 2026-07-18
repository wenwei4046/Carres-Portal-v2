import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CatalogResponse, OutletDto, SalespersonDto, StaffTierDto } from "@carres/shared";
import { useStaffSession } from "@/lib/staff";
import { emptyDraft, type WizardDraft } from "../new-order/draft";
import CustomerStep from "./CustomerStep";

// Keep the real queries module (probes stay idle below 8 phone chars); only the
// name-search hook is stubbed, mirroring CustomerStep.test.tsx.
vi.mock("@/lib/queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/queries")>()),
  useCustomerSearch: () => ({ data: undefined }),
}));

function catalog(): CatalogResponse {
  return {
    models: [], skus: [], sofaFabrics: [], addons: [],
    floorConfig: { id: 1, freeUpToFloor: 1, perFloorPerItem: 50 },
  } as unknown as CatalogResponse;
}

const OUTLETS: OutletDto[] = [
  { id: "o1", dealerId: "d1", name: "Outlet 1", address: "1 Jln" },
  { id: "o2", dealerId: "d1", name: "Outlet 2", address: "2 Jln" },
];

function sp(over: Partial<SalespersonDto> & { id: string; name: string }): SalespersonDto {
  return { dealerId: "d1", outletId: "o1", phone: null, userId: null, staffRole: "salesperson", color: "flame", active: true, ...over } as SalespersonDto;
}
const SALES: SalespersonDto[] = [
  sp({ id: "me", name: "Me" }),
  sp({ id: "co", name: "Coworker O1" }),
  sp({ id: "mgr", name: "Manager", staffRole: "manager" }),
  sp({ id: "owner", name: "Owner", staffRole: "principal", outletId: null }),
  sp({ id: "o2guy", name: "Other Outlet", outletId: "o2" }),
];

function Harness({ salespersons = SALES }: { salespersons?: SalespersonDto[] }) {
  const [draft, setDraft] = useState<WizardDraft>(emptyDraft());
  return (
    <CustomerStep
      draft={draft}
      onChange={setDraft}
      outlets={OUTLETS}
      salespersons={salespersons}
      catalog={catalog()}
      minLeadDays={14}
    />
  );
}

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

function asStaff(tier: StaffTierDto, sid: string | null, outletId: string | null) {
  useStaffSession.getState().setSession("t", { sid, tier, name: "X", color: "flame", outletId }, "d1");
  useStaffSession.getState().setSessionOutlet("o1");
}

function outletSel() {
  return screen.getByTestId("pos-outlet-select") as HTMLSelectElement;
}
function salesSel() {
  return screen.getByTestId("pos-salesperson-select") as HTMLSelectElement;
}
function optionIds(sel: HTMLSelectElement) {
  return Array.from(sel.querySelectorAll("option")).map((o) => o.value).filter(Boolean);
}

beforeEach(() => useStaffSession.getState().reset());
afterEach(cleanup);

describe("CustomerStep — staff session locking", () => {
  it("no staff session (dormant): outlet + salesperson both editable, nothing forced", () => {
    wrap(<Harness />);
    expect(outletSel().disabled).toBe(false);
    expect(salesSel().disabled).toBe(false);
    expect(outletSel().value).toBe(""); // not forced
  });

  it("salesperson tier: outlet locked to session, salesperson locked to self (only self offered)", () => {
    asStaff("salesperson", "me", "o1");
    wrap(<Harness />);
    expect(outletSel().disabled).toBe(true);
    expect(outletSel().value).toBe("o1");
    expect(salesSel().disabled).toBe(true);
    expect(salesSel().value).toBe("me");
    expect(optionIds(salesSel())).toEqual(["me"]);
  });

  it("manager tier: outlet locked; salesperson pickable among the outlet's active staff (代记), default self", () => {
    asStaff("manager", "mgr", "o1");
    wrap(<Harness />);
    expect(outletSel().disabled).toBe(true);
    expect(salesSel().disabled).toBe(false);
    expect(salesSel().value).toBe("mgr"); // default self
    const ids = optionIds(salesSel());
    // outlet-o1 staff + the outlet-less owner; NOT the O2 salesperson.
    expect(ids).toContain("me");
    expect(ids).toContain("owner");
    expect(ids).not.toContain("o2guy");
  });

  it("principal tier: outlet is free (not disabled); every active salesperson offered", () => {
    asStaff("principal", "owner", null);
    wrap(<Harness />);
    expect(outletSel().disabled).toBe(false);
    expect(salesSel().disabled).toBe(false);
    expect(optionIds(salesSel())).toContain("o2guy");
  });
});
