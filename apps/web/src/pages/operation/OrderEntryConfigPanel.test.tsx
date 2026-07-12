import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { OrderEntryConfigDto, SetOrderEntryConfigInput } from "@carres/shared";

vi.mock("@/lib/queries", () => ({
  useOrderEntryConfig: vi.fn(),
  useUpdateOrderEntryConfig: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { useOrderEntryConfig, useUpdateOrderEntryConfig } from "@/lib/queries";
import OrderEntryConfigPanel from "./OrderEntryConfigPanel";

const EMPTY_CONFIG: OrderEntryConfigDto = { paymentMethods: [], formFields: {} };

let mutateSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mutateSpy = vi.fn();
  vi.mocked(useOrderEntryConfig).mockReturnValue({
    data: { entryConfig: EMPTY_CONFIG },
    isLoading: false,
    isError: false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  vi.mocked(useUpdateOrderEntryConfig).mockReturnValue({
    mutate: mutateSpy,
    isPending: false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
});

function savedPayload(): SetOrderEntryConfigInput {
  expect(mutateSpy).toHaveBeenCalledTimes(1);
  return mutateSpy.mock.calls[0][0] as SetOrderEntryConfigInput;
}

describe("OrderEntryConfigPanel", () => {
  it("prefills the 4 default methods (incl. cash) + the Bank follow-up on credit when config is empty", () => {
    render(<OrderEntryConfigPanel onClose={vi.fn()} />);

    expect(screen.getByDisplayValue("Online transfer")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Credit / Debit")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Installment")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Cash")).toBeInTheDocument();

    // Bank follow-up rides on the credit method, options seeded from MY_BANKS.
    expect(screen.getByLabelText("credit follow-up bank label")).toHaveValue("Bank");
    const options = screen.getByLabelText("credit follow-up bank options") as HTMLTextAreaElement;
    expect(options.value).toContain("Maybank");
    expect(options.value).toContain("CIMB Bank");

    // The 4 built-in methods can only be deactivated, never removed.
    expect(screen.queryByRole("button", { name: /^Remove Cash$/ })).not.toBeInTheDocument();
  });

  it("toggling a builtin (race → not required) saves formFields.customer.builtins.race.required === false", () => {
    render(<OrderEntryConfigPanel onClose={vi.fn()} />);

    const raceRequired = screen.getByLabelText("Race required") as HTMLInputElement;
    expect(raceRequired.checked).toBe(true); // defaultRequired
    fireEvent.click(raceRequired);
    expect(raceRequired.checked).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    const payload = savedPayload();
    expect(payload.formFields.customer?.builtins.race).toEqual({
      enabled: true,
      required: false,
    });
    // Locked fields never appear in the builtins overrides.
    expect(payload.formFields.customer?.builtins).not.toHaveProperty("name");
    expect(payload.formFields.target?.builtins).not.toHaveProperty("deliveryDate");
  });

  it("adding a method 'E-wallet' derives the key e-wallet and includes it in the saved paymentMethods", () => {
    render(<OrderEntryConfigPanel onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("New method name"), {
      target: { value: "E-wallet" },
    });
    // The derived kebab key is previewed as grey text.
    expect(screen.getByText("e-wallet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Add method/i }));

    // The new method appears in the editor with its permanent key.
    expect(screen.getByLabelText("e-wallet label")).toHaveValue("E-wallet");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    const payload = savedPayload();
    const added = payload.paymentMethods.find((m) => m.key === "e-wallet");
    expect(added).toBeDefined();
    expect(added).toMatchObject({
      key: "e-wallet",
      label: "E-wallet",
      active: true,
      approvalCodeRequired: false,
      followUps: [],
    });
    // The defaults were prefilled and ride along in the full-replace payload.
    expect(payload.paymentMethods.map((m) => m.key)).toEqual([
      "online",
      "credit",
      "installment",
      "cash",
      "e-wallet",
    ]);
  });
});
