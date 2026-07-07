/**
 * PoolPanel (0201) tests — the 2990s-style pool panel:
 *  - size variant composes "K · 6FT · 183X190CM" rows + shows Effective from.
 *  - priced variant right-aligns RM surcharge, "—" when null.
 *  - principal-only Edit; History visible to all internal users.
 *  - Edit-draft → Save fires ONE batch mutation with the full entries array.
 *  - duplicate values block Save.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { CatalogOptionPoolDto } from "@carres/shared";
import PoolPanel from "./PoolPanel";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const mockBatchSave = vi.fn();
const mockHistory = {
  data: {
    history: [
      {
        id: "h1",
        section: "bedframe_size",
        entries: [
          { value: "K", label: "6FT", dimensions: "183X190CM", surcharge: null, active: true, sortOrder: 1 },
        ],
        effectiveFrom: "2026-07-05",
        notes: "Baseline — ported from 2990s Portal (0201)",
        createdAt: "2026-07-05T08:00:00.000Z",
      },
    ],
  },
  isLoading: false,
};

vi.mock("@/lib/queries", () => ({
  useBatchSaveOptionPool: () => ({ mutate: mockBatchSave, isPending: false }),
  useCatalogConfigHistory: () => mockHistory,
}));

function poolEntry(over: Partial<CatalogOptionPoolDto>): CatalogOptionPoolDto {
  return {
    id: "e1",
    pool: "bedframe_size",
    value: "K",
    label: null,
    dimensions: null,
    surcharge: null,
    active: true,
    sortOrder: 1,
    ...over,
  };
}

const SIZE_ENTRIES: CatalogOptionPoolDto[] = [
  poolEntry({ id: "e1", value: "K", label: "6FT", dimensions: "183X190CM", sortOrder: 1 }),
  poolEntry({ id: "e2", value: "Q", label: "5FT", dimensions: "152X190CM", sortOrder: 2 }),
];

const DIVAN_ENTRIES: CatalogOptionPoolDto[] = [
  poolEntry({ id: "d1", pool: "divan_height", value: '4"', sortOrder: 1 }),
  poolEntry({ id: "d2", pool: "divan_height", value: '10"', surcharge: 125, sortOrder: 2 }),
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PoolPanel — view mode", () => {
  it("size variant composes value · label · dimensions + Effective from", () => {
    render(
      <PoolPanel
        pool="bedframe_size"
        variant="size"
        title="Bedframe Sizes"
        description="test"
        entries={SIZE_ENTRIES}
        isPrincipal
      />,
    );
    expect(screen.getByTestId("pool-row-bedframe_size-K")).toHaveTextContent("K · 6FT · 183X190CM");
    expect(screen.getByTestId("pool-row-bedframe_size-Q")).toHaveTextContent("Q · 5FT · 152X190CM");
    expect(screen.getByTestId("pool-effective-bedframe_size")).toHaveTextContent(
      "Effective from 2026-07-05",
    );
  });

  it("priced variant shows RM surcharge right-aligned and — when null", () => {
    render(
      <PoolPanel
        pool="divan_height"
        variant="priced"
        title="Divan Heights"
        description="test"
        entries={DIVAN_ENTRIES}
        isPrincipal
      />,
    );
    expect(screen.getByTestId('pool-row-divan_height-10"')).toHaveTextContent("RM125.00");
    expect(screen.getByTestId('pool-row-divan_height-4"')).toHaveTextContent("—");
  });

  it("non-principal: no Edit button, History still available", () => {
    render(
      <PoolPanel
        pool="bedframe_size"
        variant="size"
        title="Bedframe Sizes"
        description="test"
        entries={SIZE_ENTRIES}
        isPrincipal={false}
      />,
    );
    expect(screen.queryByTestId("pool-edit-bedframe_size")).not.toBeInTheDocument();
    expect(screen.getByTestId("pool-history-bedframe_size")).toBeInTheDocument();
  });

  it("History dialog lists the snapshot entries", () => {
    render(
      <PoolPanel
        pool="bedframe_size"
        variant="size"
        title="Bedframe Sizes"
        description="test"
        entries={SIZE_ENTRIES}
        isPrincipal
      />,
    );
    fireEvent.click(screen.getByTestId("pool-history-bedframe_size"));
    expect(screen.getByText("History — Bedframe Sizes")).toBeInTheDocument();
    expect(screen.getByText("Baseline — ported from 2990s Portal (0201)")).toBeInTheDocument();
  });
});

describe("PoolPanel — edit mode", () => {
  it("Edit → change a surcharge → Save fires one batch mutation with full entries", () => {
    render(
      <PoolPanel
        pool="divan_height"
        variant="priced"
        title="Divan Heights"
        description="test"
        entries={DIVAN_ENTRIES}
        isPrincipal
      />,
    );
    fireEvent.click(screen.getByTestId("pool-edit-divan_height"));
    fireEvent.change(screen.getByLabelText("row 1 surcharge"), { target: { value: "50" } });
    fireEvent.click(screen.getByTestId("pool-save-divan_height"));

    expect(mockBatchSave).toHaveBeenCalledTimes(1);
    const { pool, input } = mockBatchSave.mock.calls[0][0];
    expect(pool).toBe("divan_height");
    expect(input.entries).toEqual([
      { value: '4"', label: null, dimensions: null, surcharge: 50, active: true },
      { value: '10"', label: null, dimensions: null, surcharge: 125, active: true },
    ]);
  });

  it("duplicate values block Save with a warning", () => {
    render(
      <PoolPanel
        pool="divan_height"
        variant="priced"
        title="Divan Heights"
        description="test"
        entries={DIVAN_ENTRIES}
        isPrincipal
      />,
    );
    fireEvent.click(screen.getByTestId("pool-edit-divan_height"));
    fireEvent.change(screen.getByLabelText("row 1 value"), { target: { value: '10"' } });
    expect(screen.getByText(/Duplicate values/)).toBeInTheDocument();
    expect(screen.getByTestId("pool-save-divan_height")).toBeDisabled();
    fireEvent.click(screen.getByTestId("pool-save-divan_height"));
    expect(mockBatchSave).not.toHaveBeenCalled();
  });

  it("Add row appends an editable row that rides into the payload", () => {
    render(
      <PoolPanel
        pool="divan_height"
        variant="priced"
        title="Divan Heights"
        description="test"
        entries={DIVAN_ENTRIES}
        isPrincipal
      />,
    );
    fireEvent.click(screen.getByTestId("pool-edit-divan_height"));
    fireEvent.click(screen.getByTestId("pool-add-row-divan_height"));
    fireEvent.change(screen.getByLabelText("row 3 value"), { target: { value: '12"' } });
    fireEvent.change(screen.getByLabelText("row 3 surcharge"), { target: { value: "250" } });
    fireEvent.click(screen.getByTestId("pool-save-divan_height"));
    const { input } = mockBatchSave.mock.calls[0][0];
    expect(input.entries).toHaveLength(3);
    expect(input.entries[2]).toEqual({
      value: '12"',
      label: null,
      dimensions: null,
      surcharge: 250,
      active: true,
    });
  });
});
