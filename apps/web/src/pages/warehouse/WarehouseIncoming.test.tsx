import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import WarehouseIncoming from "./WarehouseIncoming";
import WarehouseMyReceipts from "./WarehouseMyReceipts";
import WarehouseCountModal from "./WarehouseCountModal";

/**
 * R6 (warehouse half) — what a warehouse login sees, and the gate on the count
 * it files.
 *
 * The claims under test: a PO whose count is already waiting offers no second
 * form, the report requires explicit physical confirmation; unknown facts survive and
 * the returned engine result decides whether a GRN exists.
 */

const apiFetchMock = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetchMock(...args) };
});

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// The upload fields talk to the signed-upload door and Storage directly; the
// mocks hand back a path with one click so the SUBMIT contract can be tested.
vi.mock("@/components/DOFileUploadField", () => ({
  default: ({ onUploaded }: { onUploaded: (path: string) => void }) => (
    <button
      type="button"
      data-testid="mock-do-upload"
      onClick={() => onUploaded("PO-3001/do.jpg")}
    >
      mock DO upload
    </button>
  ),
}));
vi.mock("@/components/ClaimPhotoUploadField", () => ({
  default: ({
    onChange,
    testId,
  }: {
    onChange: (paths: string[]) => void;
    testId?: string;
  }) => (
    <button
      type="button"
      data-testid={testId}
      onClick={() => onChange(["PO-3001/claim.jpg"])}
    >
      mock claim upload
    </button>
  ),
}));
vi.mock("@/components/ArrivalEvidenceUploadField", () => ({
  default: ({
    onChange,
    entries,
    testId,
  }: {
    onChange: (e: Array<{ path: string; kind: string }>) => void;
    entries: Array<{ path: string; kind: string }>;
    testId?: string;
  }) => (
    <button
      type="button"
      data-testid={testId}
      onClick={() =>
        onChange([...(entries ?? []), { path: "PO-3001/arrival.mp4", kind: "video" }])
      }
    >
      mock arrival upload
    </button>
  ),
}));

const PO = {
  po_id: "PO-2001",
  supplier_name: "Ohana",
  eta_date: "2026-07-30",
  sup_status: "in_production",
  open_receipt_id: null,
  lines: [
    {
      id: "11111111-1111-1111-1111-111111111111",
      sku: "MS01-K",
      qty: 5,
      received_qty: 1,
      damaged_qty: 0,
      wrong_item_qty: 0,
      category: "mattress" as const,
    },
  ],
};

/** The same PO with governed expected Units — the per-Unit scanning path. */
const UNIT_PO = {
  ...PO,
  po_id: "PO-3001",
  expected_units: [
    { id: "u-1", unit_code: "U-260904-0001", sku: "MS01-K", status: "incoming", po_line_id: PO.lines[0]!.id },
    { id: "u-2", unit_code: "U-260904-0002", sku: "MS01-K", status: "incoming", po_line_id: PO.lines[0]!.id },
  ],
};

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

function mockIncoming(pos: unknown[]) {
  apiFetchMock.mockImplementation((path: string) => {
    if (typeof path === "string" && path.includes("/api/warehouse/incoming"))
      return Promise.resolve({
        warehouse: { id: "wh-klang", name: "Carres Klang" },
        pos,
      });
    return Promise.resolve({});
  });
}

beforeEach(() => {
  apiFetchMock.mockReset();
});

describe("WarehouseIncoming", () => {
  it("names the warehouse and what is on its way", async () => {
    mockIncoming([PO]);
    wrap(<WarehouseIncoming />);
    await screen.findByTestId("warehouse-incoming");
    expect(screen.getByText("Carres Klang")).toBeInTheDocument();
    expect(screen.getByText("PO-2001")).toBeInTheDocument();
    expect(screen.getByText("Ohana")).toBeInTheDocument();
    // R1's own words, from R1's own module.
    expect(screen.getByText("4 units pending delivery")).toBeInTheDocument();
  });

  it("says so and offers no second form when a count is already waiting", async () => {
    mockIncoming([{ ...PO, open_receipt_id: "r1" }]);
    wrap(<WarehouseIncoming />);
    await screen.findByTestId("warehouse-waiting-PO-2001");
    expect(screen.getByTestId("warehouse-waiting-PO-2001")).toHaveTextContent(
      "Waiting Carres check",
    );
    expect(screen.queryByTestId("warehouse-count-PO-2001")).not.toBeInTheDocument();
  });

  it("says nothing is on the way rather than showing an empty grid", async () => {
    mockIncoming([]);
    wrap(<WarehouseIncoming />);
    expect(
      await screen.findByText("Nothing is on its way here right now."),
    ).toBeInTheDocument();
  });
});

describe("the count form", () => {
  async function openForm() {
    mockIncoming([PO]);
    wrap(<WarehouseIncoming />);
    fireEvent.click(await screen.findByTestId("warehouse-count-PO-2001"));
    return screen.findByTestId("warehouse-count-lines");
  }

  it("explains that prefilled results require physical confirmation", async () => {
    await openForm();
    expect(screen.getByTestId("warehouse-count-note")).toHaveTextContent(
      "Prefilled results are not confirmed",
    );
  });

  it("never offers 'Receive' as a verb — the portal's word is Check in", async () => {
    await openForm();
    // The DO number field is the only place a stray verb could hide.
    expect(screen.queryByText(/^Receive/)).not.toBeInTheDocument();
  });

  it("refuses to save until the count is complete, and says what is missing", async () => {
    await openForm();
    // A final confirmation must belong to the actual displayed physical report.
    const save = screen.getByRole("button", { name: /^Save/ });
    expect(save).toBeDisabled();
    expect(screen.getByTestId("warehouse-count-problems")).toHaveTextContent(
      "Type the DO number",
    );
    expect(screen.getByTestId("warehouse-count-problems")).toHaveTextContent(
      "Take a photo of the signed DO",
    );
    expect(screen.getByTestId("warehouse-count-problems")).toHaveTextContent(
      "Count at least one unit",
    );
  });

  it("asks for a photo the moment damage is reported (R2's evidence law)", async () => {
    await openForm();
    fireEvent.change(screen.getByTestId("warehouse-damaged-MS01-K"), {
      target: { value: "2" },
    });
    await waitFor(() =>
      expect(screen.getByTestId("warehouse-claim-panel-MS01-K")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("warehouse-count-problems")).toHaveTextContent(
      "Add a photo of the damage",
    );
  });

  it("keeps the three numbers inside one budget — the line owes 4", async () => {
    await openForm();
    const good = screen.getByTestId("warehouse-good-MS01-K") as HTMLInputElement;
    fireEvent.change(good, { target: { value: "99" } });
    await waitFor(() => expect(good.value).toBe("4"));

    // With 4 good already counted, the damaged box has no room left.
    fireEvent.change(screen.getByTestId("warehouse-damaged-MS01-K"), {
      target: { value: "3" },
    });
    await waitFor(() =>
      expect(
        (screen.getByTestId("warehouse-damaged-MS01-K") as HTMLInputElement).value,
      ).toBe("0"),
    );
  });

  it("shows the wrong-item kinds this product family can have", async () => {
    await openForm();
    fireEvent.change(screen.getByTestId("warehouse-wrong-MS01-K"), {
      target: { value: "1" },
    });
    const picker = (await screen.findByTestId(
      "warehouse-wrong-kind-MS01-K",
    )) as HTMLSelectElement;
    const options = Array.from(picker.options).map((o) => o.value);
    // A mattress has no parts to be missing, and `damaged` has its own box.
    expect(options).toContain("wrong_sku");
    expect(options).not.toContain("missing_parts");
    expect(options).not.toContain("damaged");
  });

  it("keeps the number inputs on a PO without governed expected units", async () => {
    await openForm();
    expect(screen.getByTestId("warehouse-good-MS01-K")).toBeInTheDocument();
    expect(
      screen.queryByTestId("warehouse-unit-outcome-U-260904-0001"),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("warehouse-derived-MS01-K")).not.toBeInTheDocument();
  });
});

describe("the count form — per-unit scanning (0426)", () => {
  async function openUnitForm(po: unknown = UNIT_PO) {
    mockIncoming([po]);
    wrap(<WarehouseIncoming />);
    fireEvent.click(await screen.findByTestId("warehouse-count-PO-3001"));
    return screen.findByTestId("warehouse-count-lines");
  }

  it("renders one row per expected unit and derives the counts instead of number inputs", async () => {
    await openUnitForm();
    // One outcome select per governed Unit, prefilled `received` — a complete
    // delivery is zero typing.
    expect(
      (screen.getByTestId(
        "warehouse-unit-outcome-U-260904-0001",
      ) as HTMLSelectElement).value,
    ).toBe("received");
    expect(
      (screen.getByTestId(
        "warehouse-unit-outcome-U-260904-0002",
      ) as HTMLSelectElement).value,
    ).toBe("received");
    // The three number inputs are gone; the line shows the DERIVED numbers.
    expect(screen.queryByTestId("warehouse-good-MS01-K")).not.toBeInTheDocument();
    expect(screen.queryByTestId("warehouse-damaged-MS01-K")).not.toBeInTheDocument();
    expect(screen.getByTestId("warehouse-derived-MS01-K")).toHaveTextContent(
      "2 good",
    );
    expect(screen.getByTestId("warehouse-count-totals")).toHaveTextContent(
      "Σ 2 good",
    );
  });

  it("prefills not_received beyond what the line still owes", async () => {
    await openUnitForm({
      ...UNIT_PO,
      lines: [{ ...UNIT_PO.lines[0], received_qty: 4 }], // pending = 1
    });
    expect(
      (screen.getByTestId(
        "warehouse-unit-outcome-U-260904-0001",
      ) as HTMLSelectElement).value,
    ).toBe("received");
    expect(
      (screen.getByTestId(
        "warehouse-unit-outcome-U-260904-0002",
      ) as HTMLSelectElement).value,
    ).toBe("not_received");
    expect(screen.getByTestId("warehouse-derived-MS01-K")).toHaveTextContent(
      "1 good",
    );
  });

  it("flipping a unit updates the derived counts", async () => {
    await openUnitForm();
    fireEvent.change(screen.getByTestId("warehouse-unit-outcome-U-260904-0002"), {
      target: { value: "not_received" },
    });
    await waitFor(() =>
      expect(screen.getByTestId("warehouse-derived-MS01-K")).toHaveTextContent(
        "1 good",
      ),
    );
    expect(screen.getByTestId("warehouse-count-totals")).toHaveTextContent(
      "Σ 1 good",
    );
  });

  it("a unit received with issue · Damaged demands the damage photo before submit", async () => {
    await openUnitForm();
    fireEvent.change(screen.getByTestId("warehouse-unit-outcome-U-260904-0001"), {
      target: { value: "received_with_issue" },
    });
    // The issue-kind select appears, defaulting to Damaged.
    const kind = (await screen.findByTestId(
      "warehouse-unit-issue-U-260904-0001",
    )) as HTMLSelectElement;
    expect(kind.value).toBe("damaged");
    // The derived counts read the outcome, and R2's evidence law fires.
    expect(screen.getByTestId("warehouse-derived-MS01-K")).toHaveTextContent(
      "1 good · 1 damaged",
    );
    await waitFor(() =>
      expect(
        screen.getByTestId("warehouse-claim-panel-MS01-K"),
      ).toBeInTheDocument(),
    );
    expect(screen.getByTestId("warehouse-count-problems")).toHaveTextContent(
      "Add a photo of the damage",
    );
    expect(
      screen.getByRole("button", { name: /^Save/ }),
    ).toBeDisabled();
  });

  it("the submit payload carries the unit outcomes and the arrival evidence", async () => {
    await openUnitForm();
    fireEvent.change(screen.getByLabelText("DO number *"), {
      target: { value: "DO-9001" },
    });
    fireEvent.click(screen.getByTestId("mock-do-upload"));
    fireEvent.click(screen.getByTestId("warehouse-arrival-evidence"));

    const save = screen.getByRole("button", { name: /^Save/ });
    fireEvent.click(screen.getByRole("checkbox", { name: "I checked the goods and confirm these receiving results." }));
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);

    await waitFor(() =>
      expect(
        apiFetchMock.mock.calls.some(
          (c) => c[0] === "/api/warehouse/receipts/confirm",
        ),
      ).toBe(true),
    );
    const call = apiFetchMock.mock.calls.find(
      (c) => c[0] === "/api/warehouse/receipts/confirm",
    )!;
    const body = JSON.parse((call[1] as { body: string }).body).report;
    expect(body.arrivalEvidence).toEqual([
      { path: "PO-3001/arrival.mp4", kind: "video" },
    ]);
    expect(body.lines).toHaveLength(1);
    expect(body.lines[0].receivedNow).toBe(2);
    expect(body.lines[0].units).toEqual([
      { unitCode: "U-260904-0001", outcome: "received" },
      { unitCode: "U-260904-0002", outcome: "received" },
    ]);
  });

  it("the count carries when the goods arrived — an explicit KL date and time, never invented from now", async () => {
    await openUnitForm();
    const when = screen.getByLabelText("Goods Received Date *");
    expect(when).toHaveAttribute("type", "datetime-local");
    expect((when as HTMLInputElement).value).toBe("");
    fireEvent.change(when, { target: { value: "2026-09-04T08:40" } });
    fireEvent.change(screen.getByLabelText("DO number *"), { target: { value: "DO-9001" } });
    fireEvent.click(screen.getByTestId("mock-do-upload"));
    const save = screen.getByRole("button", { name: /^Save/ });
    fireEvent.click(screen.getByRole("checkbox", { name: "I checked the goods and confirm these receiving results." }));
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    await waitFor(() =>
      expect(apiFetchMock.mock.calls.some((c) => c[0] === "/api/warehouse/receipts/confirm")).toBe(true),
    );
    const call = apiFetchMock.mock.calls.find((c) => c[0] === "/api/warehouse/receipts/confirm")!;
    const body = JSON.parse((call[1] as { body: string }).body).report;
    expect(body.goodsReceivedTime).toBe("2026-09-04T08:40:00+08:00");
  });
});

describe("final physical confirmation", () => {
  const confirmLabel = "I checked the goods and confirm these receiving results.";
  async function open(respond: (body: unknown) => Promise<unknown>) {
    mockIncoming([PO]);
    const read = apiFetchMock.getMockImplementation()!;
    apiFetchMock.mockImplementation((path: string, init?: { body: string }) =>
      path === "/api/warehouse/receipts/confirm" ? respond(JSON.parse(init!.body)) : read(path));
    wrap(<WarehouseIncoming />);
    fireEvent.click(await screen.findByTestId("warehouse-count-PO-2001"));
    await screen.findByTestId("warehouse-count-lines");
  }
  const calls = () => apiFetchMock.mock.calls.filter((call) => call[0] === "/api/warehouse/receipts/confirm")
    .map((call) => JSON.parse((call[1] as { body: string }).body));
  const blocked = { id: "11111111-1111-4111-8111-111111111199", revision: 0, status: "draft", grn_no: null,
    blockers: [{ code: "do_file_required", message: "Delivery note is missing" }] };

  it("preserves unknown counts/date, keeps a blocked form open and corrects the same saved session", async () => {
    await open(async () => blocked);
    fireEvent.click(screen.getByRole("checkbox", { name: confirmLabel }));
    fireEvent.click(screen.getByRole("button", { name: "Save Receiving" }));
    await screen.findByText("Receiving report saved. No GRN created.");
    expect(screen.getByText("Delivery note is missing")).toBeInTheDocument();
    expect(screen.getByTestId("warehouse-count-totals")).toHaveTextContent("Not recorded");
    expect(calls()[0].report.goodsReceivedTime).toBeNull();
    expect(calls()[0].report.lines[0]).toMatchObject({ receivedNow: null, damagedQty: null, wrongItemQty: null });
    fireEvent.change(screen.getByLabelText("DO number *"), { target: { value: "DO-CORRECTED" } });
    expect(screen.getByRole("checkbox", { name: confirmLabel })).not.toBeChecked();
    expect(screen.getByRole("button", { name: /^Save/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: confirmLabel }));
    fireEvent.click(screen.getByRole("button", { name: "Save Receiving" }));
    await waitFor(() => expect(calls()).toHaveLength(2));
    expect(calls()[1]).toMatchObject({ saveKey: calls()[0].saveKey, receiptId: blocked.id, revision: 0 });
  });

  it("reuses the save key after an uncertain network response", async () => {
    let attempts = 0;
    await open(async () => { if (++attempts === 1) throw new Error("Connection lost"); return blocked; });
    fireEvent.click(screen.getByRole("checkbox", { name: confirmLabel }));
    fireEvent.click(screen.getByRole("button", { name: "Save Receiving" }));
    await waitFor(() => expect(calls()).toHaveLength(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save Receiving" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Save Receiving" }));
    await screen.findByText("Receiving report saved. No GRN created.");
    expect(calls()).toHaveLength(2);
    expect(calls()[1]).toEqual(calls()[0]);
  });

  it("closes only for an actual posted GRN and refreshes Warehouse reads", async () => {
    await open(async () => ({ ...blocked, status: "posted", grn_no: "GRN-20261005-1234", blockers: [] }));
    fireEvent.click(screen.getByRole("checkbox", { name: confirmLabel }));
    fireEvent.click(screen.getByRole("button", { name: "Save Receiving" }));
    await waitFor(() => expect(screen.queryByTestId("warehouse-count-lines")).not.toBeInTheDocument());
    expect(apiFetchMock.mock.calls.filter((call) => call[0] === "/api/warehouse/incoming").length).toBeGreaterThan(1);
  });
});


describe("reopening a preserved Warehouse report", () => {
  it("restores evidence and corrects the same receipt/revision after the previous form is gone", async () => {
    const id = "11111111-1111-4111-8111-111111111199";
    const key = "11111111-1111-4111-8111-111111111198";
    const report = { po_id: PO.po_id, do_number: "DO-SAVED", do_file_path: "PO-2001/saved.jpg",
      note: "Original warehouse observation", goods_received_time: null,
      arrival_evidence: [{ path: "PO-2001/arrival.mp4", kind: "video" }],
      extra_lines: [{ sku: "Unplanned item", qty: 1 }],
      lines: [{ id: PO.lines[0]!.id, received_now: 2, damaged_qty: null, wrong_item_qty: 0,
        damaged_photos: [{ path: "PO-2001/damage.jpg", unit_code: "U1-000-007" }],
      }],
    };
    const blocked = { id, revision: 2, status: "draft", grn_no: null,
      blockers: [{ code: "receipt_quantity_unknown", message: "The damaged quantity is not recorded" }] };
    apiFetchMock.mockImplementation((path: string) => {
      if (path === "/api/warehouse/incoming") return Promise.resolve({ warehouse: { id: "wh-klang", name: "Carres Klang" }, pos: [PO] });
      if (path === "/api/warehouse/receipts") return Promise.resolve({ receipts: [{
        ...blocked, save_key: key, raw_report: report, po_id: null, supplier_name: null,
        lines: [], note: null, do_number: null, submitted_at: "2026-10-05T01:00:00Z",
      }] });
      if (path === "/api/warehouse/receipts/confirm") return Promise.resolve(blocked);
      return Promise.resolve({});
    });
    wrap(<WarehouseMyReceipts />);
    const open = await screen.findByRole("button", { name: "Open Receiving" });
    await waitFor(() => expect(open).toBeEnabled());
    fireEvent.click(open);
    expect(screen.getByLabelText("DO number *")).toHaveValue("DO-SAVED");
    expect(screen.getByLabelText("Note for Carres (optional)")).toHaveValue("Original warehouse observation");
    expect(screen.getByTestId("warehouse-good-MS01-K")).toHaveValue(2);
    expect(screen.getByTestId("warehouse-damaged-MS01-K")).toHaveValue(null);
    expect(screen.getByRole("checkbox", { name: "I checked the goods and confirm these receiving results." })).not.toBeChecked();
    fireEvent.change(screen.getByTestId("warehouse-damaged-MS01-K"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "I checked the goods and confirm these receiving results." }));
    fireEvent.click(screen.getByRole("button", { name: "Save Receiving" }));
    await waitFor(() => expect(apiFetchMock.mock.calls.some((call) => call[0] === "/api/warehouse/receipts/confirm")).toBe(true));
    const call = apiFetchMock.mock.calls.find((call) => call[0] === "/api/warehouse/receipts/confirm")!;
    const sent = JSON.parse(call[1].body);
    expect(sent).toMatchObject({ saveKey: key, receiptId: id, revision: 2 });
    expect(sent.report.doFilePath).toBe(report.do_file_path);
    expect(sent.report.extraLines).toEqual(report.extra_lines);
    expect(sent.report.arrivalEvidence).toEqual(report.arrival_evidence);
    expect(sent.report.lines[0].damagedPhotos).toEqual([{ path: "PO-2001/damage.jpg", unitCode: "U1-000-007" }]);
  });
});


describe("reopened report source changes", () => {
  it("prevents confirmation when saved goods disappeared from the current source", () => {
    const id = "11111111-1111-4111-8111-111111111199";
    wrap(<WarehouseCountModal po={PO} onClose={vi.fn()} saved={{
      saveKey: "11111111-1111-4111-8111-111111111198",
      result: { id, receipt_id: id, revision: 2, status: "draft", grn_no: null, blockers: [], already_saved: true },
      report: { poId: PO.po_id, lines: [{ id: "no-longer-in-source", receivedNow: 1, damagedQty: 0, wrongItemQty: 0 }] },
    }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Not available. Go back and reload.");
    expect(screen.getByRole("checkbox", { name: "I checked the goods and confirm these receiving results." })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^Save/ })).toBeDisabled();
    expect(apiFetchMock.mock.calls.some((call) => call[0] === "/api/warehouse/receipts/confirm")).toBe(false);
  });
});
