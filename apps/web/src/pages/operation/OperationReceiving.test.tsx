import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import OperationReceiving from "./OperationReceiving";

/**
 * OperationReceiving — the Receiving Workspace (Slice B, Jess 2026-08-03).
 *
 * The page it replaced was a facet-rail list whose row opened a modal; this
 * suite covers the shape that replaced it and, more importantly, the four
 * laws the slice exists to make structural:
 *
 *   · the Supplier DO number starts EMPTY (the retired modal seeded it with
 *     `"DO-" + random(5200..5999)` — a supplier reference we invented),
 *   · Save says what is MISSING rather than sitting grey and silent,
 *   · the payload carries the DELTA counted on this delivery, never the
 *     running total,
 *   · the empty Activity says the RECORD is empty, not that the goods have
 *     not come.
 */

const apiFetchMock = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetchMock(...args) };
});

// The signed-DO upload goes browser → Storage. Stubbed so the whole Save path
// (which needs a real file path) is reachable in a test.
vi.mock("@/lib/supabase", () => ({
  supabaseConfigured: true,
  supabase: {
    storage: {
      from: () => ({ uploadToSignedUrl: async () => ({ error: null }) }),
    },
  },
}));

const SUPPLIERS = [
  { id: "sup-nf", name: "Nice Future", kind: "factory_pickup" },
  { id: "sup-oh", name: "Ohana", kind: "factory_pickup" },
];
const WAREHOUSES = [
  { id: "wh-klang", name: "Carres Klang", address: "Klang", owning_partner_id: null },
];

function po(p: {
  id: string;
  supplier_id: string;
  status: "open" | "received" | "cancelled";
  lines: {
    id: string;
    sku: string;
    qty: number;
    received_qty: number;
    damaged_qty?: number;
    wrong_item_qty?: number;
  }[];
}) {
  return {
    id: p.id,
    supplier_id: p.supplier_id,
    warehouse_id: "wh-klang",
    status: p.status,
    sup_status: "in_production",
    so: 1001,
    so_refs: null,
    eta_date: "2026-08-20",
    placed_at: "2026-08-01T00:00:00Z",
    purchase_order_lines: p.lines,
  };
}

const POS = [
  // In transit — nothing counted in yet. Two lines, so a short receipt is
  // expressible.
  po({
    id: "PO-2001",
    supplier_id: "sup-nf",
    status: "open",
    lines: [
      { id: "11111111-1111-1111-1111-111111111111", sku: "MS01", qty: 3, received_qty: 0 },
      { id: "22222222-2222-2222-2222-222222222222", sku: "BF01", qty: 2, received_qty: 0 },
    ],
  }),
  // Partially received.
  po({
    id: "PO-2002",
    supplier_id: "sup-oh",
    status: "open",
    lines: [
      { id: "33333333-3333-3333-3333-333333333333", sku: "SF02", qty: 4, received_qty: 1 },
    ],
  }),
  // Fully received.
  po({
    id: "PO-2003",
    supplier_id: "sup-nf",
    status: "received",
    lines: [
      { id: "44444444-4444-4444-4444-444444444444", sku: "BF02", qty: 3, received_qty: 3 },
    ],
  }),
  // Cancelled — never belongs in a receiving queue.
  po({
    id: "PO-2004",
    supplier_id: "sup-oh",
    status: "cancelled",
    lines: [
      { id: "55555555-5555-5555-5555-555555555555", sku: "SF03", qty: 1, received_qty: 0 },
    ],
  }),
];

let receivingResponse: { sessions: unknown[]; events: unknown[] } = {
  sessions: [],
  events: [],
};

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={["/operation?tab=receiving"]}>
      <QueryClientProvider client={qc}>
        <OperationReceiving />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

/** Wait for the first row to have auto-selected into the workspace. */
async function ready() {
  await waitFor(() =>
    expect(screen.getByTestId("receiving-workspace")).toBeInTheDocument(),
  );
}

/** A PO number appears twice on this page — once as a listing row, once as the
 *  open document's hero. Every listing assertion is scoped, or it is measuring
 *  the workspace by accident. */
const listing = () => within(screen.getByTestId("receiving-listing"));

/** Open a PO in the workspace the way an operator does — by its row. */
async function openRow(poId: string) {
  fireEvent.click(listing().getByText(poId));
  await waitFor(() =>
    expect(
      within(screen.getByTestId("receiving-workspace-pane")).getByText(poId),
    ).toBeInTheDocument(),
  );
}

beforeEach(() => {
  receivingResponse = { sessions: [], events: [] };
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation((path: string) => {
    if (typeof path !== "string") return Promise.resolve({});
    // Order matters: the receiving path also starts with /api/operation/pos.
    if (path.includes("/receiving")) return Promise.resolve(receivingResponse);
    if (path.includes("/office-receive")) return Promise.resolve({ status: "posted" });
    if (path.includes("/api/storage/dos/sign-upload"))
      return Promise.resolve({ token: "tok", path: "dos/PO-2001/do.pdf" });
    if (path.includes("/api/operation/suppliers"))
      return Promise.resolve({ suppliers: SUPPLIERS });
    if (path.includes("/api/operation/warehouse"))
      return Promise.resolve({ warehouses: WAREHOUSES });
    if (path.includes("/api/operation/pos")) return Promise.resolve({ pos: POS });
    return Promise.resolve({});
  });
});

describe("OperationReceiving — the Workspace shell", () => {
  it("renders the Purchasing Workspace's three panes", async () => {
    wrap();
    await ready();
    expect(screen.getByTestId("receiving-rail")).toBeInTheDocument();
    expect(screen.getByTestId("receiving-listing")).toBeInTheDocument();
    expect(screen.getByTestId("receiving-workspace-pane")).toBeInTheDocument();
  });

  it("keeps cancelled POs out of the queue entirely", async () => {
    wrap();
    await ready();
    expect(listing().queryByText("PO-2004")).not.toBeInTheDocument();
    expect(listing().getByText("PO-2001")).toBeInTheDocument();
    expect(listing().getByText("PO-2003")).toBeInTheDocument();
  });

  it("counts the rail by the progress state the page already computes", async () => {
    wrap();
    await ready();
    // 1 in transit (PO-2001) · 1 partially received (PO-2002) · 1 fully
    // received (PO-2003). The cancelled one is counted nowhere.
    expect(screen.getByTestId("receiving-rail-state-in_transit")).toHaveTextContent("1");
    expect(
      screen.getByTestId("receiving-rail-state-partially_received"),
    ).toHaveTextContent("1");
    expect(
      screen.getByTestId("receiving-rail-state-fully_received"),
    ).toHaveTextContent("1");
  });

  it("a rail pick narrows the listing, and picking it again clears", async () => {
    wrap();
    await ready();
    fireEvent.click(screen.getByTestId("receiving-rail-state-fully_received"));
    await waitFor(() =>
      expect(listing().queryByText("PO-2001")).not.toBeInTheDocument(),
    );
    expect(listing().getByText("PO-2003")).toBeInTheDocument();
    // The OPEN document survives a filter, exactly as it does on Purchase
    // Orders: `?po=` is the one source of selection, and a filter narrows what
    // you can pick — it does not close what you are reading.
    expect(
      within(screen.getByTestId("receiving-workspace-pane")).getByText("PO-2001"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("receiving-rail-state-fully_received"));
    await waitFor(() =>
      expect(listing().getByText("PO-2001")).toBeInTheDocument(),
    );
  });

  it("auto-selects the first row and answers 'what has this PO taken in?'", async () => {
    wrap();
    await ready();
    // Default order is PO Issued oldest first, then id — PO-2001.
    expect(screen.getByTestId("receiving-summary-received")).toHaveTextContent(
      "0 / 5",
    );
    // Outstanding is PRINTED, never left as 5 − 0 for the operator to do.
    expect(screen.getByTestId("receiving-summary-outstanding")).toHaveTextContent(
      "5",
    );
  });
});

describe("OperationReceiving — Read Mode", () => {
  it("says the RECORD is empty, never that the goods have not come", async () => {
    wrap();
    await ready();
    const empty = await screen.findByTestId("receiving-activity-empty");
    expect(empty).toHaveTextContent("No receiving activity yet.");
    // Jess, 2026-08-03: "Nothing received" reads as "the goods did not
    // arrive", which is a different fact and usually a false one.
    expect(empty).not.toHaveTextContent(/Nothing received/i);
  });

  it("reads the event ledger, and prints what the payload carries", async () => {
    receivingResponse = {
      sessions: [],
      events: [
        {
          id: "e1",
          receipt_id: "r1",
          event: "posted",
          event_at: "2026-08-03T02:00:00Z",
          actor_name: "Shasha",
          payload: {
            do_number: "DO-5512",
            units_counted: 3,
            goods_received_at: "2026-08-02",
            entry_source: "office",
            claims_linked: 0,
          },
        },
      ],
    };
    wrap();
    await ready();
    const log = await screen.findByTestId("receiving-activity");
    expect(log).toHaveTextContent("Posted by Shasha");
    expect(log).toHaveTextContent("DO DO-5512");
    expect(log).toHaveTextContent("3 units");
  });

  it("offers no Start Receiving on a PO that owes nothing", async () => {
    wrap();
    await ready();
    await openRow("PO-2003");
    expect(screen.getByTestId("receiving-summary-outstanding")).toHaveTextContent(
      "0",
    );
    // A button that could only refuse is not an action.
    expect(screen.queryByTestId("start-receiving")).not.toBeInTheDocument();
  });
});

describe("OperationReceiving — Receiving Mode", () => {
  async function startReceiving(poId?: string) {
    wrap();
    await ready();
    if (poId) await openRow(poId);
    fireEvent.click(screen.getByTestId("start-receiving"));
    await screen.findByTestId("receiving-mode");
  }

  it("takes the stage — the listing steps aside while a delivery is counted", async () => {
    await startReceiving();
    expect(screen.getByTestId("receiving-listing").className).toContain("hidden");
  });

  it("prefills every line at its remaining qty — a full delivery is zero typing", async () => {
    await startReceiving();
    expect(
      screen.getByTestId("receive-now-11111111-1111-1111-1111-111111111111"),
    ).toHaveValue(3);
    expect(
      screen.getByTestId("receive-now-22222222-2222-2222-2222-222222222222"),
    ).toHaveValue(2);
  });

  it("never invents the supplier's DO number", async () => {
    await startReceiving();
    // The retired ReceivePOModal opened with `DO-5xxx` already typed in.
    expect(screen.getByTestId("do-number")).toHaveValue("");
    expect(screen.getByTestId("receiving-save")).toBeDisabled();
  });

  it("Save names what is missing, and the name changes as it is supplied", async () => {
    await startReceiving();
    const save = screen.getByTestId("receiving-save");
    expect(save).toHaveTextContent("Save — add a DO number");

    fireEvent.change(screen.getByTestId("do-number"), {
      target: { value: "DO-5512" },
    });
    expect(save).toHaveTextContent("Save — upload signed DO");
    expect(save).toBeDisabled();
  });

  it("asks for a damage photo only once damage is reported", async () => {
    await startReceiving();
    const line = "11111111-1111-1111-1111-111111111111";
    expect(screen.queryByTestId(`damaged-photos-${line}`)).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId(`damaged-${line}`), {
      target: { value: "1" },
    });
    expect(await screen.findByTestId(`damaged-photos-${line}`)).toBeInTheDocument();
  });

  it("states a short receipt quietly, never as a popup", async () => {
    await startReceiving();
    const line = "11111111-1111-1111-1111-111111111111";
    fireEvent.change(screen.getByTestId(`receive-now-${line}`), {
      target: { value: "1" },
    });
    // Line 1: 3 remaining, 1 counted → 2 left. Line 2 is still prefilled at
    // its full 2, so it leaves nothing. The figure is about what this SAVE
    // will leave behind, not about what the PO has not received yet.
    expect(await screen.findByTestId("remaining-after-save")).toHaveTextContent(
      "Remaining after save: 2 (stays on this PO)",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("posts the DELTA counted on this delivery, never the running total", async () => {
    // PO-2002 on purpose: 4 ordered, 1 ALREADY received. On a PO with nothing
    // received yet the delta and the running total are the same number, so
    // this assertion would pass against either — measuring nothing. (Caught by
    // the negative control on 2026-08-03.)
    await startReceiving("PO-2002");

    fireEvent.change(screen.getByTestId("do-number"), {
      target: { value: "DO-5512" },
    });
    // The signed DO photo — required past Draft by the store itself.
    const file = new File(["x"], "do.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("DO file"), {
      target: { files: [file] },
    });
    await waitFor(() =>
      expect(screen.getByTestId("receiving-save")).toHaveTextContent(
        "Save Receiving",
      ),
    );

    fireEvent.change(screen.getByTestId("goods-received-at"), {
      target: { value: "2026-08-02" },
    });
    fireEvent.click(screen.getByTestId("receiving-save"));

    await waitFor(() =>
      expect(
        apiFetchMock.mock.calls.some(
          (c) => typeof c[0] === "string" && c[0].includes("/office-receive"),
        ),
      ).toBe(true),
    );
    const call = apiFetchMock.mock.calls.find(
      (c) => typeof c[0] === "string" && c[0].includes("/office-receive"),
    )!;
    expect(call[0]).toBe("/api/operation/pos/PO-2002/office-receive");
    const body = JSON.parse((call[1] as { body: string }).body);
    expect(body.doNumber).toBe("DO-5512");
    expect(body.goodsReceivedAt).toBe("2026-08-02");
    // 4 ordered − 1 already received = 3 counted THIS time. A running total
    // would read 4 here, and the engine would book a unit that never arrived.
    expect(body.lines).toEqual([
      { id: "33333333-3333-3333-3333-333333333333", receivedNow: 3 },
    ]);
  });

  it("Cancel leaves Receiving Mode and gives the listing back", async () => {
    await startReceiving();
    fireEvent.click(screen.getByTestId("receiving-cancel"));
    await waitFor(() =>
      expect(screen.queryByTestId("receiving-mode")).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId("receiving-listing").className).not.toContain(
      "hidden",
    );
  });
});
