import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const stub = vi.hoisted(() => () => ({ default: () => null }));
vi.mock("@/pages/portal/PortalSidebar", stub);
vi.mock("./PrincipalDashboard", stub);
vi.mock("./PrincipalApprovals", stub);
vi.mock("./PrincipalDealers", stub);
vi.mock("./PrincipalPartners", stub);
vi.mock("./PrincipalAccounts", stub);
vi.mock("./PrincipalAudit", stub);
vi.mock("./PrincipalNewOrder", stub);
vi.mock("./PrincipalSalesAnalysis", stub);
vi.mock("@/pages/dealer/DealerPos", stub);
vi.mock("@/pages/catalog/ProductMaintenancePage", stub);
vi.mock("@/pages/rental/RentalSettingPage", stub);

import PrincipalApp from "./PrincipalApp";

describe("PrincipalApp browser tab title", () => {
  it("names the Admin tab and restores the default on leave", () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={["/principal?tab=accounts"]}>
        <PrincipalApp />
      </MemoryRouter>,
    );
    expect(document.title).toBe("Accounts · Admin · Carres");
    unmount();
    expect(document.title).toBe("Carres Portal");
  });
});
