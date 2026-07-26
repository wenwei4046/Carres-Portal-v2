import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import RelatedCases, {
  deriveRelatedCases,
  countRelatedCases,
  countOpenCases,
  type RelatedGuaranteeInput,
  type RelatedServiceCaseInput,
} from "./RelatedCases";

/**
 * J2 — Related cases. The properties that matter are about what does NOT
 * render: a clean order must produce zero rows (prod is 56 orders with 0 linked
 * cases, so this is the normal case, not the edge one), a live guarantee must
 * not be mistaken for an incident, and a claim that opened a case must appear
 * once rather than twice.
 */

function sc(over: Partial<RelatedServiceCaseInput> = {}): RelatedServiceCaseInput {
  return {
    id: "c1",
    caseNo: "SC2607-01",
    caseTypeLabel: "Warranty Claim",
    statusLabel: "In Progress",
    statusIsClosed: false,
    openedLabel: "16 Jun 26",
    ...over,
  };
}

function gt(over: Partial<RelatedGuaranteeInput> = {}): RelatedGuaranteeInput {
  return {
    id: "g1",
    displayId: "ABCD123456",
    coversLabel: "B1201S King",
    guaranteeLabel: "Mattress Guarantee 15 Years",
    claimCaseId: null,
    claimedLabel: "20 Jul 26",
    effectiveStatus: "claimed",
    ...over,
  };
}

describe("deriveRelatedCases", () => {
  it("returns nothing for an order with no cases and no guarantees", () => {
    expect(deriveRelatedCases({ serviceCases: [], guarantees: [] })).toEqual([]);
  });

  it("renders a service case with its number, type and status", () => {
    const rows = deriveRelatedCases({ serviceCases: [sc()], guarantees: [] });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "service_case",
      ref: "SC2607-01",
      title: "Warranty Claim",
      status: "In Progress",
      settled: false,
      caseId: "c1",
    });
  });

  it("says the status is not set rather than inventing one", () => {
    const rows = deriveRelatedCases({
      serviceCases: [sc({ statusLabel: null, caseTypeLabel: null })],
      guarantees: [],
    });
    expect(rows[0].status).toBe("Not set");
    expect(rows[0].title).toBe("Service case");
  });

  it("IGNORES a guarantee that has not been claimed — cover is not an incident", () => {
    for (const status of ["active", "pending", "expired", "void"] as const) {
      const rows = deriveRelatedCases({
        serviceCases: [],
        guarantees: [gt({ effectiveStatus: status })],
      });
      expect(rows, `status=${status}`).toEqual([]);
    }
  });

  it("lists a claimed guarantee as its own case when it opened no service case", () => {
    const rows = deriveRelatedCases({ serviceCases: [], guarantees: [gt()] });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "guarantee_claim",
      ref: "ABCD123456",
      title: "Guarantee claim — B1201S King",
      status: "Claimed",
      settled: true,
      guaranteeSearch: "ABCD123456",
    });
    expect(rows[0].caseId).toBeUndefined();
  });

  it("folds a claim into the case it opened — ONE incident is ONE row", () => {
    const rows = deriveRelatedCases({
      serviceCases: [sc({ id: "c9" })],
      guarantees: [gt({ claimCaseId: "c9" })],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("service_case");
    expect(rows[0].guaranteeNote).toBe("Guarantee claimed on B1201S King");
  });

  it("keeps a claim separate when its case is not on THIS order", () => {
    const rows = deriveRelatedCases({
      serviceCases: [sc({ id: "c1" })],
      guarantees: [gt({ claimCaseId: "someone-elses-case" })],
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.kind)).toEqual(["service_case", "guarantee_claim"]);
  });

  it("still links a claimed guarantee whose handle was retired to nothing", () => {
    const rows = deriveRelatedCases({
      serviceCases: [],
      guarantees: [gt({ displayId: null, coversLabel: null })],
    });
    expect(rows[0].ref).toBe("Guarantee");
    expect(rows[0].title).toBe("Guarantee claim — Mattress Guarantee 15 Years");
    expect(rows[0].guaranteeSearch).toBeUndefined();
  });
});

describe("counts", () => {
  it("counts every case, and separately the ones still open", () => {
    const rows = deriveRelatedCases({
      serviceCases: [
        sc({ id: "a", caseNo: "SC-A", statusIsClosed: false }),
        sc({ id: "b", caseNo: "SC-B", statusIsClosed: true }),
      ],
      guarantees: [gt()],
    });
    expect(countRelatedCases(rows)).toBe(3);
    // The claimed guarantee is terminal, so only the one live case is open.
    expect(countOpenCases(rows)).toBe(1);
  });

  it("counts nothing when there is nothing", () => {
    expect(countRelatedCases([])).toBe(0);
    expect(countOpenCases([])).toBe(0);
  });
});

describe("<RelatedCases>", () => {
  it("renders no rows at all for an empty list", () => {
    render(<RelatedCases rows={[]} onOpen={() => {}} />);
    expect(screen.queryByTestId("related-case-row")).toBeNull();
  });

  it("hands the clicked row back so the drawer can route it", () => {
    const onOpen = vi.fn();
    const rows = deriveRelatedCases({ serviceCases: [sc()], guarantees: [] });
    render(<RelatedCases rows={rows} onOpen={onOpen} />);

    fireEvent.click(screen.getByRole("button", { name: /open/i }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ caseId: "c1" }));
  });

  it("shows the case number, status and date on the row", () => {
    const rows = deriveRelatedCases({ serviceCases: [sc()], guarantees: [] });
    render(<RelatedCases rows={rows} onOpen={() => {}} />);
    expect(screen.getByText("SC2607-01")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("16 Jun 26")).toBeInTheDocument();
  });
});
