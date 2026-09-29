import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { OrderEntryConfigDto, SetOrderEntryConfigInput } from "@carres/shared";

vi.mock("@/lib/queries", () => ({
  useOrderEntryConfig: vi.fn(),
  useUpdateOrderEntryConfig: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { useOrderEntryConfig, useUpdateOrderEntryConfig } from "@/lib/queries";
import OrderEntryPage from "./OrderEntryPage";

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

describe("OrderEntryPage", () => {
  it("prefills the 4 default methods (incl. cash) + the required Bank information on credit when config is empty", () => {
    render(<OrderEntryPage />);

    for (const method of ["Online transfer", "Credit / Debit", "Installment", "Cash"])
      expect(screen.getByText(method)).toBeInTheDocument();
    expect(screen.queryByLabelText("online label")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit Credit / Debit" }));

    // Required Bank information rides on the credit method, seeded from MY_BANKS.
    expect(screen.getByLabelText("credit required information bank label")).toHaveValue("Bank");
    const options = screen.getByLabelText("credit required information bank options") as HTMLTextAreaElement;
    expect(options.value).toContain("Maybank");
    expect(options.value).toContain("CIMB Bank");

    // The 4 built-in methods can only be deactivated, never removed.
    expect(screen.queryByRole("button", { name: /^Remove Cash$/ })).not.toBeInTheDocument();

    // 0230 — Stripe shows as a locked SYSTEM row (read-only, always offered
    // at checkout) so the page reflects the full method list the POS renders.
    expect(screen.getByTestId("entry-config-stripe-row")).toBeInTheDocument();
    expect(screen.getByText("Pay online")).toBeInTheDocument();
    expect(screen.getByText("Stripe QR / link")).toBeInTheDocument();
  });

  it("toggling a builtin (race → not required) saves formFields.customer.builtins.race.required === false", () => {
    render(<OrderEntryPage />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Order Entry fields" }));

    const raceRequired = screen.getByLabelText("Race required") as HTMLInputElement;
    expect(raceRequired.checked).toBe(true); // defaultRequired
    fireEvent.click(raceRequired);
    expect(raceRequired.checked).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

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
    render(<OrderEntryPage />);

    expect(screen.queryByLabelText("New method name")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add payment method" }));
    fireEvent.change(screen.getByLabelText("New method name"), {
      target: { value: "E-wallet" },
    });
    // The derived kebab key is previewed as grey text.
    expect(screen.getByText("e-wallet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Add method/i }));

    // The new method appears in the editor with its permanent key.
    expect(screen.getByLabelText("e-wallet label")).toHaveValue("E-wallet");

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

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

  it("uses focused payment-method editing and truthful required-information terminology", () => {
    render(<OrderEntryPage />);
    expect(screen.queryByText(/Add follow-up/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/follow-up/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit Online transfer" }));
    expect(screen.getByRole("dialog", { name: "Edit payment method" })).toBeInTheDocument();
    expect(screen.getByLabelText("online label")).toHaveValue("Online transfer");
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add required information" })).toBeInTheDocument();
  });

  it("renders 2990-style compact rows with status and a shortened long-option summary", () => {
    render(<OrderEntryPage />);
    expect(screen.getByTestId("payment-methods-panel")).toHaveAttribute("data-settings-pattern", "2990-maintenance-panel");
    expect(screen.getByTestId("payment-method-credit")).toHaveAttribute("data-status", "active");
    expect(screen.getByTestId("payment-method-credit")).toHaveTextContent("15 accepted banks");
    expect(screen.getByTestId("payment-method-credit")).not.toHaveTextContent("Standard Chartered");
    expect(screen.getByTestId("entry-config-stripe-row")).toHaveTextContent("System managed");
  });

  it("shows the approval code as FIXED for credit/installment even when the saved config says No", () => {
    // A stored config the runtime overrules: resolvePaymentMethods forces the
    // approval code (and credit's Bank question) on regardless. Before this
    // fix the screen read "No" while the POS and the create route demanded it.
    vi.mocked(useOrderEntryConfig).mockReturnValue({
      data: {
        entryConfig: {
          paymentMethods: [
            { key: "credit", label: "Credit / Debit", sublabel: "", active: true, approvalCodeRequired: false,
              followUps: [{ key: "bank", label: "Bank", options: ["Maybank"], required: false }] },
            { key: "installment", label: "Installment", sublabel: "", active: true, approvalCodeRequired: false, followUps: [] },
            { key: "cheque", label: "Cheque", sublabel: "", active: true, approvalCodeRequired: false, followUps: [] },
            { key: "cash", label: "Cash", sublabel: "", active: true, approvalCodeRequired: false, followUps: [] },
          ],
          formFields: {},
        } satisfies OrderEntryConfigDto,
      },
      isLoading: false,
      isError: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    render(<OrderEntryPage />);

    expect(screen.getByTestId("payment-method-credit")).toHaveTextContent("Approval code required: Always");
    expect(screen.getByTestId("payment-method-installment")).toHaveTextContent("Approval code required: Always");
    // Cheque is refused without its cheque number (0551), so it is fixed too.
    expect(screen.getByTestId("payment-method-cheque")).toHaveTextContent("Approval code required: Always");
    // Cash is genuinely optional and stays editable.
    expect(screen.getByTestId("payment-method-cash")).toHaveTextContent("Approval code required: No");

    fireEvent.click(screen.getByRole("button", { name: "Edit Credit / Debit" }));
    const approval = screen.getByLabelText("credit approval code required") as HTMLInputElement;
    expect(approval.checked).toBe(true);
    expect(approval.disabled).toBe(true);
    const bankRequired = screen.getByLabelText("credit required information bank required") as HTMLInputElement;
    expect(bankRequired.checked).toBe(true);
    expect(bankRequired.disabled).toBe(true);
    expect(screen.getByText("Credit / Debit always needs its approval code, so this cannot be turned off. It always asks which bank, too.")).toBeInTheDocument();

    // …and the save writes what the till enforces, not the overruled "No".
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    const payload = savedPayload();
    expect(payload.paymentMethods.find((m) => m.key === "credit")).toMatchObject({
      approvalCodeRequired: true,
      followUps: [{ key: "bank", required: true }],
    });
    expect(payload.paymentMethods.find((m) => m.key === "installment")?.approvalCodeRequired).toBe(true);
    expect(payload.paymentMethods.find((m) => m.key === "cash")?.approvalCodeRequired).toBe(false);
  });

  it("opens the add flow in the same focused drawer instead of exposing a raw page input", () => {
    render(<OrderEntryPage />);
    expect(screen.queryByLabelText("New method name")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add payment method" }));
    expect(screen.getByRole("dialog", { name: "Add payment method" })).toBeInTheDocument();
    expect(screen.getByLabelText("New method name")).toBeInTheDocument();
  });
});
