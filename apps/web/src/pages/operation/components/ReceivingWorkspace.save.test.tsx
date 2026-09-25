import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ReceivingWorkspace from "./ReceivingWorkspace";
import type { operationPoListRow } from "@/lib/queries";

/**
 * THE TWO THINGS SOURCE INSPECTION CANNOT SETTLE (2026-09-15).
 *
 * A previous round of this card reported save failure and repeated submission
 * as "verified by reading the code". That is not verification: reading
 * `disabled={… || save.isPending}` tells you the attribute is written, not
 * that a second click is refused, and reading `setErr` in `onError` tells you
 * nothing about whether the counts the operator typed survive the failure.
 *
 * These exercise both against the real component and the real write path's
 * hook contract — one mutation, one `saveKey`, one refusal.
 */

const h = vi.hoisted(() => ({
  /** Every payload the component hands the write path, in order. */
  calls: [] as Array<Record<string, unknown>>,
  /** Resolve/reject the in-flight save from the test. */
  settle: null as null | ((ok: boolean) => void),
  pending: false,
}));

vi.mock("@/lib/queries", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/lib/queries");
  return {
    ...actual,
    usePoReceiving: () => ({
      data: { sessions: [], events: [], expected_units: [] },
      isLoading: false,
    }),
    useOfficeReceiveMutation: (
      _poId: string,
      opts?: { onError?: (e: Error) => void; onSuccess?: (d: unknown) => void },
    ) => ({
      isPending: h.pending,
      mutate: (input: Record<string, unknown>) => {
        h.calls.push(input);
        h.pending = true;
        h.settle = (ok: boolean) => {
          h.pending = false;
          if (ok) opts?.onSuccess?.({ receipt_id: "r-1" });
          else opts?.onError?.(new Error("the supplier DO number is already used"));
        };
      },
    }),
  };
});

/** The upload fields talk to Storage; the save contract does not care HOW the
 *  path arrived, only that one exists. */
vi.mock("@/components/DOFileUploadField", () => ({
  default: ({ onUploaded }: { onUploaded: (p: string) => void }) => (
    <button type="button" data-testid="fake-do-upload" onClick={() => onUploaded("do/photo.jpg")}>
      upload
    </button>
  ),
}));
vi.mock("@/components/ClaimPhotoUploadField", () => ({ default: () => null }));
vi.mock("@/components/ArrivalEvidenceUploadField", () => ({ default: () => null }));

const po = {
  id: "PO-TEST-1",
  supplier_id: "s",
  warehouse_id: "w",
  status: "open",
  placed_at: "2026-08-01T00:00:00Z",
  official_delivery_date: "2026-09-01",
  purchase_order_lines: [
    {
      id: "line-1",
      sku: "MAT-Q",
      qty: 5,
      received_qty: 0,
      damaged_qty: 0,
      wrong_item_qty: 0,
      identity_mode: "quantity" as const,
    },
  ],
} as unknown as operationPoListRow;

function mount() {
  return render(
    <MemoryRouter>
      <ReceivingWorkspace
        po={po}
        supplier={{ id: "s", name: "Factory" } as never}
        warehouseName="Carres Klang Warehouse"
        warehouses={[{ id: "w", name: "Carres Klang Warehouse" }]}
        dutyAllowed
        dutyKnown
        receiving
        onReceiving={() => {}}
      />
    </MemoryRouter>,
  );
}

/** Fill the three facts the Save button demands, and count three good units. */
function fillAValidCount() {
  fireEvent.change(screen.getByTestId("do-number"), {
    target: { value: "DO-8821" },
  });
  fireEvent.click(screen.getByTestId("fake-do-upload"));
  fireEvent.change(screen.getByTestId("receive-now-line-1"), {
    target: { value: "3" },
  });
  fireEvent.click(screen.getByRole("checkbox", { name: "I checked the goods and confirm these receiving results." }));
}

beforeEach(() => {
  h.calls = [];
  h.settle = null;
  h.pending = false;
});

describe("Receiving · a failed save", () => {
  it("keeps every number the operator typed and says what broke", async () => {
    mount();
    fillAValidCount();
    expect(screen.getByTestId("receive-now-line-1")).toHaveValue(3);

    fireEvent.click(screen.getByTestId("receiving-save"));
    expect(h.calls).toHaveLength(1);
    h.settle!(false);

    await waitFor(() =>
      expect(screen.getByTestId("receiving-error")).toHaveTextContent(
        "the supplier DO number is already used",
      ),
    );
    /* THE COUNT SURVIVES. A warehouse operator holding a pallet does not get
       to count it twice because the server refused once. */
    expect(screen.getByTestId("receive-now-line-1")).toHaveValue(3);
    expect(screen.getByTestId("do-number")).toHaveValue("DO-8821");
    /* And the door is open again — a refusal is not a dead end. */
    expect(screen.getByTestId("receiving-save")).not.toBeDisabled();
  });

  it("a retry after a failure reuses the SAME saveKey, so the server can refuse a duplicate", async () => {
    mount();
    fillAValidCount();
    fireEvent.click(screen.getByTestId("receiving-save"));
    h.settle!(false);
    await screen.findByTestId("receiving-error");

    fireEvent.click(screen.getByTestId("receiving-save"));
    expect(h.calls).toHaveLength(2);
    /* ONE key per Session entry (0426). A retried uncertain response returns
       the FIRST posting instead of minting a second GRN. */
    expect(h.calls[1].saveKey).toBe(h.calls[0].saveKey);
    expect(String(h.calls[0].saveKey)).toMatch(/^[0-9a-f-]{36}$/i);
  });
});

describe("Receiving · repeated submission", () => {
  it("a second click while the first save is in flight sends nothing", async () => {
    const view = mount();
    fillAValidCount();

    fireEvent.click(screen.getByTestId("receiving-save"));
    expect(h.calls).toHaveLength(1);

    /* The mutation is now pending. Re-render so the component sees it, then
       hammer the button the way an anxious operator does. */
    view.rerender(
      <MemoryRouter>
        <ReceivingWorkspace
          po={po}
          supplier={{ id: "s", name: "Factory" } as never}
          warehouseName="Carres Klang Warehouse"
          warehouses={[{ id: "w", name: "Carres Klang Warehouse" }]}
          dutyAllowed
          dutyKnown
          receiving
          onReceiving={() => {}}
        />
      </MemoryRouter>,
    );
    const save = screen.getByTestId("receiving-save");
    expect(save).toBeDisabled();
    expect(save).toHaveTextContent("Saving…");
    fireEvent.click(save);
    fireEvent.click(save);
    expect(h.calls).toHaveLength(1);
  });

  it("names the first missing fact and sends nothing until it is supplied", () => {
    mount();
    /* THE BUTTON NAMES WHAT IS MISSING, top to bottom — it never sits dead
       with an unexplained grey. */
    expect(screen.getByTestId("receiving-save")).toBeDisabled();
    expect(screen.getByTestId("receiving-save")).toHaveTextContent(
      "Save — add a DO number",
    );
    fireEvent.click(screen.getByTestId("receiving-save"));
    expect(h.calls).toHaveLength(0);

    fireEvent.change(screen.getByTestId("do-number"), {
      target: { value: "DO-8821" },
    });
    expect(screen.getByTestId("receiving-save")).toHaveTextContent(
      "Save — upload signed DO",
    );
    fireEvent.click(screen.getByTestId("receiving-save"));
    expect(h.calls).toHaveLength(0);

    fireEvent.click(screen.getByTestId("fake-do-upload"));
    /* Prefill is only proposed input; papers alone cannot confirm the goods. */
    expect(screen.getByTestId("receive-now-line-1")).toHaveValue(5);
    expect(screen.getByTestId("receiving-save")).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "I checked the goods and confirm these receiving results." }));
    expect(screen.getByTestId("receiving-save")).not.toBeDisabled();
    expect(screen.getByTestId("receiving-save")).toHaveTextContent(
      "Save Receiving",
    );

    /* Counting nothing closes it again — an empty receipt is not a receipt. */
    fireEvent.change(screen.getByTestId("receive-now-line-1"), {
      target: { value: "0" },
    });
    expect(screen.getByTestId("receiving-save")).toBeDisabled();
    expect(screen.getByTestId("receiving-save")).toHaveTextContent(
      "Save — count at least one unit",
    );
    fireEvent.click(screen.getByTestId("receiving-save"));
    expect(h.calls).toHaveLength(0);
  });
});


describe("Receiving · confirmation belongs to the actual draft", () => {
  it("cannot save prefilled results just by supplying the papers", () => {
    mount();
    fireEvent.change(screen.getByTestId("do-number"), { target: { value: "DO-8821" } });
    fireEvent.click(screen.getByTestId("fake-do-upload"));
    expect(screen.getByText("Proposed results · not saved")).toBeInTheDocument();
    expect(screen.getByTestId("receiving-save")).toBeDisabled();
    expect(screen.getByTestId("receiving-save")).toHaveTextContent("confirm receiving results");
    fireEvent.click(screen.getByTestId("receiving-save"));
    expect(h.calls).toHaveLength(0);
  });
  it("requires confirmation again after changing quantity or actual Site/date", () => {
    mount(); fillAValidCount();
    const confirm = screen.getByRole("checkbox", { name: "I checked the goods and confirm these receiving results." });
    expect(screen.getByTestId("receiving-save")).not.toBeDisabled();
    fireEvent.change(screen.getByTestId("receive-now-line-1"), { target: { value: "2" } });
    expect(confirm).not.toBeChecked();
    expect(screen.getByTestId("receiving-save")).toBeDisabled();
    fireEvent.click(confirm);
    expect(screen.getByTestId("receiving-save")).not.toBeDisabled();
    fireEvent.change(screen.getByTestId("goods-received-at"), { target: { value: "2026-09-10" } });
    expect(confirm).not.toBeChecked();
    expect(screen.getByTestId("receiving-save")).toBeDisabled();
  });
});
