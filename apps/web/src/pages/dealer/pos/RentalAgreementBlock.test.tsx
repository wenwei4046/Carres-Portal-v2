import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import RentalAgreementBlock from "./RentalAgreementBlock";

/**
 * RentalAgreementBlock (0279) — the paper, on the confirm step, before the pad.
 *
 * The behaviour worth pinning is the UNPUBLISHED case. `rental_agreement_
 * templates` holds ZERO rows on live prod, so this is not a theoretical branch:
 * it is what every store would hit today. Without it the operator gets a
 * Complete button that fails with a database sentence about a doc_key. With it
 * they get the name of the screen that fixes it.
 */

interface HookState {
  data: unknown;
  isLoading: boolean;
}

let templateState: HookState = { data: undefined, isLoading: false };

vi.mock("@/lib/queries", () => ({
  useRentalAgreementTemplate: () => templateState,
}));

const TEMPLATE = {
  id: "t-1",
  docKey: "rent_to_own",
  name: "Rental Agreement — Terms and Conditions (v5)",
  bindsTo: ["mattress"],
  version: 3,
  body: [
    { kind: "title", text: "RENTAL AGREEMENT" },
    { kind: "h2", text: "1. The Product" },
    { kind: "p", text: "The Product shall remain the property of the Company." },
  ],
  fields: ["customer.name"],
  effectiveFrom: "2026-07-06",
  active: true,
  createdAt: "2026-07-26T00:00:00Z",
  updatedAt: "2026-07-26T00:00:00Z",
  updatedBy: null,
};

beforeEach(() => {
  templateState = { data: undefined, isLoading: false };
});

describe("RentalAgreementBlock", () => {
  it("names the screen that fixes it when NO wording is published", () => {
    // live truth today: zero templates exist
    templateState = { data: { template: null }, isLoading: false };
    render(<RentalAgreementBlock />);
    expect(screen.getByTestId("rental-agreement-missing")).toBeInTheDocument();
    expect(screen.getByText(/Admin → Rental → Agreements/)).toBeInTheDocument();
    // and it must not pretend a contract is on screen
    expect(screen.queryByTestId("rental-agreement-block")).not.toBeInTheDocument();
  });

  it("shows the wording AND the version that will be stamped on the contract", () => {
    templateState = { data: { template: TEMPLATE }, isLoading: false };
    render(<RentalAgreementBlock />);
    expect(screen.getByTestId("rental-agreement-block")).toBeInTheDocument();
    expect(screen.getByText(TEMPLATE.name)).toBeInTheDocument();
    // the version is the difference between evidence and a picture of a squiggle
    expect(screen.getByText("v3")).toBeInTheDocument();
    // the actual clauses render — through the SAME component the principal
    // previews with, so the two can never drift into different papers
    expect(screen.getByText(/shall remain the property of the Company/)).toBeInTheDocument();
    expect(screen.queryByTestId("rental-agreement-missing")).not.toBeInTheDocument();
  });

  it("says it is loading rather than rendering an empty contract", () => {
    templateState = { data: undefined, isLoading: true };
    render(<RentalAgreementBlock />);
    expect(screen.getByTestId("rental-agreement-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("rental-agreement-block")).not.toBeInTheDocument();
    expect(screen.queryByTestId("rental-agreement-missing")).not.toBeInTheDocument();
  });
});
