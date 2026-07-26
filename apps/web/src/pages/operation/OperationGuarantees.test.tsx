import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { GuaranteeEntitlementDto } from "@carres/shared";

import OperationGuarantees from "./OperationGuarantees";

/**
 * The guarantee claim desk.
 *
 * The behaviour under test is the one Loo caught on 2026-07-26: he created an
 * order with a guarantee, opened this tab, and saw nothing. It had shipped as a
 * search-ONLY desk that fetched nothing until you typed — so a guarantee that
 * plainly existed looked missing, and there was no way to browse at all. The
 * page must LIST on arrival.
 */

const apiFetchMock = vi.fn();
vi.mock("@/lib/api", () => ({ apiFetch: (...a: unknown[]) => apiFetchMock(...a) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/queries", () => ({
  qk: { guarantees: { search: (q: string, s: string) => ["guarantees", "search", q, s] } },
}));

const ROW: GuaranteeEntitlementDto = {
  id: "e1",
  guaranteeId: "KQYZ939913",
  claimedGuaranteeId: null,
  orderId: "o1",
  so: 1258,
  orderLineId: "l1",
  guaranteeSku: "GRT-MATTRESS-15Y",
  guaranteeLabel: "Mattress Guarantee 15 Years",
  unitNo: 1,
  coversLineId: "l0",
  coversSku: "B1201S-K",
  coversModelId: "m1",
  coversLabel: "B1201S King",
  customerId: null,
  customerName: "May Tan",
  customerPhone: "010-9497268",
  phoneKey: "109497268",
  coverageYears: 15,
  remedy: "replace",
  startsOn: null,
  expiresOn: null,
  status: "pending",
  effectiveStatus: "pending",
  claimedAt: null,
  claimCaseId: null,
  claimCaseNo: null,
  claimNotes: null,
  replacementSku: null,
  voidReason: null,
};

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

beforeEach(() => apiFetchMock.mockReset());

describe("OperationGuarantees", () => {
  it("LISTS on arrival — no typing required", async () => {
    apiFetchMock.mockResolvedValue({ items: [ROW], truncated: false });
    wrap(<OperationGuarantees />);
    // The row, and the ID leading it.
    expect(await screen.findByText("KQYZ939913")).toBeInTheDocument();
    expect(screen.getByText("May Tan")).toBeInTheDocument();
    expect(screen.getByText("SO-1258")).toBeInTheDocument();
    // …and it really did call the endpoint with no q / no status.
    expect(apiFetchMock).toHaveBeenCalledWith("/api/guarantees?");
  });

  it("says 'none sold yet' when the register is genuinely empty", async () => {
    apiFetchMock.mockResolvedValue({ items: [], truncated: false });
    wrap(<OperationGuarantees />);
    expect(await screen.findByText("No guarantees sold yet.")).toBeInTheDocument();
  });

  it("shows the covered model and the derived status word", async () => {
    apiFetchMock.mockResolvedValue({ items: [ROW], truncated: false });
    wrap(<OperationGuarantees />);
    expect(await screen.findByText("B1201S King")).toBeInTheDocument();
    // pending folds into Active, and the DB word never leaks
    expect(screen.getAllByText("Active").length).toBeGreaterThan(0);
    expect(screen.queryByText("pending")).not.toBeInTheDocument();
  });

  it("offers no Claim button on a guarantee that is not yet delivered", async () => {
    apiFetchMock.mockResolvedValue({ items: [ROW], truncated: false });
    wrap(<OperationGuarantees />);
    await screen.findByText("KQYZ939913");
    expect(screen.queryByRole("button", { name: "Claim" })).not.toBeInTheDocument();
  });

  it("offers Claim once the guarantee is live", async () => {
    apiFetchMock.mockResolvedValue({
      items: [{ ...ROW, status: "active", effectiveStatus: "active", expiresOn: "2041-08-01" }],
      truncated: false,
    });
    wrap(<OperationGuarantees />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Claim" })).toBeInTheDocument(),
    );
  });
});

describe("OperationGuarantees — STATUS is the guarantee's own state, in three words", () => {
  it("reads Active for a guarantee that has not been claimed — including before delivery", async () => {
    // Loo 2026-07-26: "如果还没 claim，就是 active". ROW is 'pending'.
    apiFetchMock.mockResolvedValue({ items: [ROW], truncated: false });
    wrap(<OperationGuarantees />);
    await screen.findByText("KQYZ939913");
    const table = within(screen.getByRole("table"));
    expect(table.getByText("Active")).toBeInTheDocument();
    // the old five-word vocabulary is gone
    expect(screen.queryByText("Starts on delivery")).not.toBeInTheDocument();
    expect(screen.queryByText("Covered")).not.toBeInTheDocument();
  });

  it("reads Claimed once it has been spent", async () => {
    apiFetchMock.mockResolvedValue({
      items: [
        {
          ...ROW,
          guaranteeId: null,
          claimedGuaranteeId: "ZZZZ000111",
          status: "claimed",
          effectiveStatus: "claimed",
          claimedAt: "2026-08-02T09:00:00Z",
        },
      ],
      truncated: false,
    });
    wrap(<OperationGuarantees />);
    await screen.findByText("ZZZZ000111");
    expect(within(screen.getByRole("table")).getByText("Claimed")).toBeInTheDocument();
  });

  it("reads Expired from the DATE, not from a stored word", async () => {
    apiFetchMock.mockResolvedValue({
      items: [{ ...ROW, status: "active", effectiveStatus: "expired", expiresOn: "2020-01-01" }],
      truncated: false,
    });
    wrap(<OperationGuarantees />);
    await screen.findByText("KQYZ939913");
    expect(within(screen.getByRole("table")).getByText("Expired")).toBeInTheDocument();
  });

  it("keeps Void its own word — a cancelled order's guarantee is not Active", async () => {
    // Deliberately NOT one of Loo's three: showing this as Active would invite
    // an operator to honour a guarantee whose order was cancelled.
    apiFetchMock.mockResolvedValue({
      items: [{ ...ROW, status: "void", effectiveStatus: "void" }],
      truncated: false,
    });
    wrap(<OperationGuarantees />);
    await screen.findByText("KQYZ939913");
    const table = within(screen.getByRole("table"));
    expect(table.getByText("Void")).toBeInTheDocument();
    expect(table.queryByText("Active")).not.toBeInTheDocument();
  });

  it("offers exactly three filters plus All", () => {
    apiFetchMock.mockResolvedValue({ items: [], truncated: false });
    wrap(<OperationGuarantees />);
    for (const w of ["All", "Active", "Claimed", "Expired"]) {
      expect(screen.getByRole("button", { name: w })).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: "Not delivered" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Used" })).not.toBeInTheDocument();
  });
});
