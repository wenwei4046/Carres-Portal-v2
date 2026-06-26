import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { CatalogOptionPoolDto } from "@carres/shared";
import OptionPoolEditor from "./OptionPoolEditor";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const createAsync = vi.fn();
const patchMutate = vi.fn();
const delMutate = vi.fn();
vi.mock("@/lib/queries", () => ({
  useCreateOptionPoolEntry: () => ({ mutate: vi.fn(), mutateAsync: createAsync, isPending: false }),
  usePatchOptionPoolEntry: () => ({ mutate: patchMutate, mutateAsync: vi.fn(), isPending: false }),
  useDeleteOptionPoolEntry: () => ({ mutate: delMutate, mutateAsync: vi.fn(), isPending: false }),
}));

function entry(over: Partial<CatalogOptionPoolDto> = {}): CatalogOptionPoolDto {
  return {
    id: "e1",
    pool: "mattress_size",
    value: "Queen",
    label: "Queen",
    dimensions: '60" × 75"',
    active: true,
    sortOrder: 0,
    ...over,
  };
}

beforeEach(() => {
  createAsync.mockReset().mockResolvedValue({ optionPool: entry() });
  patchMutate.mockReset();
  delMutate.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("OptionPoolEditor", () => {
  it("renders rows for a size pool with label + dimensions", () => {
    render(
      <OptionPoolEditor
        pool="mattress_size"
        title="Mattress Sizes"
        description="Suggested sizes."
        entries={[entry(), entry({ id: "e2", value: "King", label: "King", dimensions: '72" × 75"' })]}
        isPrincipal
      />,
    );
    expect(screen.getByTestId("option-pool-row-Queen")).toBeInTheDocument();
    expect(screen.getByTestId("option-pool-row-King")).toBeInTheDocument();
    // label + dimensions columns present for size pools
    expect(screen.getByText("Dimensions")).toBeInTheDocument();
    expect((screen.getByLabelText("Queen dimensions") as HTMLInputElement).value).toBe('60" × 75"');
  });

  it("supplier_category pool shows no label/dimensions columns", () => {
    render(
      <OptionPoolEditor
        pool="supplier_category"
        title="Supplier Categories"
        description="Reference only."
        entries={[entry({ pool: "supplier_category", value: "mattress", label: null, dimensions: null })]}
        isPrincipal
      />,
    );
    expect(screen.queryByText("Dimensions")).not.toBeInTheDocument();
    expect(screen.getByTestId("option-pool-row-mattress")).toBeInTheDocument();
  });

  it("principal can add a new value", async () => {
    render(
      <OptionPoolEditor
        pool="mattress_size"
        title="Mattress Sizes"
        description="Suggested sizes."
        entries={[]}
        isPrincipal
      />,
    );
    fireEvent.click(screen.getByTestId("option-pool-add-toggle-mattress_size"));
    fireEvent.change(screen.getByTestId("option-pool-form-value-mattress_size"), {
      target: { value: "  Super King  " },
    });
    fireEvent.change(screen.getByTestId("option-pool-form-label-mattress_size"), {
      target: { value: "Super King" },
    });
    fireEvent.click(screen.getByTestId("option-pool-form-submit-mattress_size"));
    await waitFor(() => expect(createAsync).toHaveBeenCalledOnce());
    expect(createAsync.mock.calls[0][0]).toMatchObject({
      pool: "mattress_size",
      value: "Super King",
      label: "Super King",
    });
  });

  it("toggling the active checkbox patches the entry", () => {
    render(
      <OptionPoolEditor
        pool="mattress_size"
        title="Mattress Sizes"
        description="Suggested sizes."
        entries={[entry()]}
        isPrincipal
      />,
    );
    fireEvent.click(screen.getByTestId("option-pool-active-Queen"));
    expect(patchMutate).toHaveBeenCalledOnce();
    expect(patchMutate.mock.calls[0][0]).toMatchObject({ id: "e1", patch: { active: false } });
  });

  it("delete asks to confirm then calls the delete mutation", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <OptionPoolEditor
        pool="mattress_size"
        title="Mattress Sizes"
        description="Suggested sizes."
        entries={[entry()]}
        isPrincipal
      />,
    );
    fireEvent.click(screen.getByTestId("option-pool-delete-Queen"));
    expect(window.confirm).toHaveBeenCalledOnce();
    expect(delMutate).toHaveBeenCalledOnce();
    expect(delMutate.mock.calls[0][0]).toBe("e1");
  });

  it("non-principal is read-only: no add toggle, no delete, inputs disabled", () => {
    render(
      <OptionPoolEditor
        pool="mattress_size"
        title="Mattress Sizes"
        description="Suggested sizes."
        entries={[entry()]}
        isPrincipal={false}
      />,
    );
    expect(screen.queryByTestId("option-pool-add-toggle-mattress_size")).not.toBeInTheDocument();
    expect(screen.queryByTestId("option-pool-delete-Queen")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Queen value")).toBeDisabled();
    expect(screen.getByTestId("option-pool-active-Queen")).toBeDisabled();
  });
});
