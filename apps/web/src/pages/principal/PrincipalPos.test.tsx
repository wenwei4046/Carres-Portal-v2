import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/lib/queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    usePrincipalDealers: () => ({
      data: {
        dealers: [
          { id: "d-1", name: "Mattress King", status: "active" },
          { id: "d-2", name: "Pending Co", status: "pending" },
        ],
      },
      isLoading: false,
    }),
  };
});

import PrincipalPos from "./PrincipalPos";

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("PrincipalPos", () => {
  it("shows the dealer picker with only ACTIVE dealers; Start disabled until a dealer is chosen", () => {
    render(wrap(<PrincipalPos />));
    expect(screen.getByTestId("principal-pos-dealer")).toBeInTheDocument();
    expect(screen.getByText("Mattress King")).toBeInTheDocument();
    // Non-active dealers are filtered out of the picker.
    expect(screen.queryByText("Pending Co")).not.toBeInTheDocument();
    expect(screen.getByTestId("principal-pos-start")).toBeDisabled();
  });
});
