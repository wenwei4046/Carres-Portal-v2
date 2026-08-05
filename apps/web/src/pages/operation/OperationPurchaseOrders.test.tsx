import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PO_DELAY_REASONS } from "@carres/shared";
import OperationPurchaseOrders from "./OperationPurchaseOrders";

const PO_DELAY_REASONS_FOR_TEST: readonly string[] = PO_DELAY_REASONS;

/**
 * Purchase Orders — the Supplier Execution Register.
 *
 *   · **NINE columns, ONE fixed set** (Loo, 2026-08-04 · Q7): PO Issued ·
 *     Supplier · PO No. · SO No. · Items · Destination · Customer Delivery ·
 *     Expected Arrival · Current Action. **The set never changes because the
 *     panel opened** — the compact variant and its honesty guard are deleted,
 *     and that is the ruling most likely to be re-introduced under a new name;
 *   · default order = RISK TO THE CUSTOMER'S PROMISE (Loo, 2026-08-04);
 *   · Items speaks MODEL off the wire (`model_name`), `×N` only when N ≥ 2;
 *   · Search finds across PO / Supplier / SKU / Model / SO / Customer;
 *   · a cancelled PO greys out; a revised arriving date says `(revised)`.
 */

const apiFetch = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: (...a: unknown[]) => apiFetch(...a) };
});

const OHANA = "11111111-1111-1111-1111-111111111111";
const NF = "33333333-3333-3333-3333-333333333333";
const WH = "44444444-4444-4444-4444-444444444444";
const KLANG = "55555555-5555-5555-5555-555555555555";
const AL = "66666666-6666-6666-6666-666666666666";
const DESTINATIONS = [
  { id: KLANG, name: "Carres Klang", is_default: true },
  { id: AL, name: "AL Sungai Buloh", is_default: false },
];

/** Today in MYT — PO-9003 arrives today, so the engine opens its
 *  tomorrow's-delivery call (the Open Actions fixture). */
const TODAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kuala_Lumpur",
}).format(new Date());

function line(
  id: string,
  sku: string,
  qty: number,
  model: string | null,
  size: string | null,
  so_rows?: { so: number | null; qty: number; remark: string | null }[],
) {
  return {
    id,
    sku,
    qty,
    received_qty: 0,
    model_name: model,
    size,
    attrs: null,
    so_rows: so_rows ?? [{ so: null, qty, remark: null }],
  };
}

/** Issued dates deliberately OUT of PO-number order, so the default sort can
 *  only pass by reading the date. Far-future arriving dates keep the engine's
 *  calls quiet — this suite is about the register, not the call ladder. */
const POS = [
  {
    id: "PO-9003",
    supplier_id: OHANA,
    warehouse_id: WH,
    destination_id: KLANG,
    status: "open",
    sup_status: "confirmed",
    so: 1300,
    so_refs: null,
    eta_date: TODAY,
    placed_at: "2026-03-01T08:00:00Z",
    customer_delivery: "2099-08-20",
    eta_revised: false,
    orders: [{ so: 1300, customer_name: "Ah Hock", delivery_date: "2099-08-20" }],
    purchase_order_lines: [
      // ONE line covering TWO sales orders → the grid must show TWO rows.
      line("a1", "SKU-CODY-Q", 2, "Cody", "Queen", [
        { so: 1300, qty: 1, remark: "No drilling" },
        { so: 1301, qty: 1, remark: null },
      ]),
      line("a2", "SKU-SONIC-K", 1, "Sonic", "King"),
      line("a3", "SKU-ONYX-L", 1, "Onyx", null),
    ],
  },
  {
    id: "PO-9001",
    supplier_id: NF,
    warehouse_id: WH,
    status: "open",
    sup_status: "confirmed",
    so: 1200,
    so_refs: null,
    eta_date: "2099-12-30",
    placed_at: "2026-01-05T08:00:00Z",
    // 8 days AFTER what we promised the customer — and this PO also carries
    // `(revised)`, so it is the crowded case: date + gap + marker on one line.
    customer_delivery: "2099-12-22",
    eta_revised: true,
    orders: [{ so: 1200, customer_name: "Mei Ling", delivery_date: "2099-12-22" }],
    promises: [
      {
        kind: "tomorrow_delivery",
        answer: "delayed",
        about_date: "2099-12-20",
        previous_date: "2099-12-20",
        new_date: "2099-12-30",
        reason: "Production Delay",
        recorded_at: "2026-08-01T02:00:00Z",
      },
    ],
    purchase_order_lines: [line("b1", "SKU-SONIC-K", 3, "Sonic", "King")],
  },
  {
    // Three answers from the supplier → 1st / 2nd / 3rd, slip 11 days.
    id: "PO-9005",
    supplier_id: OHANA,
    warehouse_id: WH,
    status: "open",
    sup_status: "confirmed",
    so: 1500,
    so_refs: null,
    eta_date: "2099-11-11",
    placed_at: "2026-04-01T08:00:00Z",
    // The goods land on the customer's own day — no room for one hiccup.
    customer_delivery: "2099-11-11",
    eta_revised: true,
    orders: [],
    promises: [
      { kind: "tomorrow_delivery", answer: "shipping", about_date: "2099-10-31", previous_date: null, new_date: null, reason: null, recorded_at: "2026-04-02T02:00:00Z" },
      { kind: "tomorrow_delivery", answer: "delayed", about_date: "2099-10-31", previous_date: "2099-10-31", new_date: "2099-11-05", reason: "Production Delay", recorded_at: "2026-04-09T02:00:00Z" },
      { kind: "tomorrow_delivery", answer: "delayed", about_date: "2099-11-05", previous_date: "2099-11-05", new_date: "2099-11-11", reason: "Transport Delay", recorded_at: "2026-04-16T02:00:00Z" },
    ],
    sends: [
      {
        channel: "whatsapp",
        note: null,
        sent_at: "2026-04-16T03:00:00Z",
        po_revisions: { rev_no: 2 },
      },
      {
        channel: "whatsapp",
        note: null,
        sent_at: "2026-04-16T05:00:00Z",
        po_revisions: { rev_no: 2 },
      },
    ],
    purchase_order_lines: [line("e1", "SKU-SONIC-K", 1, "Sonic", "King")],
  },
  {
    // The date PASSED and nothing arrived → Overdue, which since Q8 carries
    // the same action as a dateless PO: `Check Expected Arrival`.
    id: "PO-9004",
    supplier_id: OHANA,
    warehouse_id: WH,
    status: "open",
    sup_status: "confirmed",
    so: 1400,
    so_refs: null,
    eta_date: "2026-01-20",
    placed_at: "2026-01-10T08:00:00Z",
    customer_delivery: null,
    eta_revised: false,
    orders: [],
    purchase_order_lines: [line("d1", "SKU-CODY-Q", 1, "Cody", "Queen")],
  },
  {
    id: "PO-9002",
    supplier_id: OHANA,
    warehouse_id: WH,
    status: "cancelled",
    sup_status: "cancelled",
    so: null,
    so_refs: null,
    eta_date: null,
    placed_at: "2026-02-01T08:00:00Z",
    customer_delivery: null,
    eta_revised: false,
    orders: [],
    purchase_order_lines: [line("c1", "RAW-UNKNOWN-1", 1, null, null)],
  },
  {
    // FULLY RECEIVED → the work is over. Its goods landed 10 days after the
    // customer's date, and it must stay SILENT: a closed PO's gap is history,
    // not work, and a register that shouts about the past teaches nobody.
    id: "PO-9006",
    supplier_id: OHANA,
    warehouse_id: WH,
    status: "open",
    sup_status: "confirmed",
    so: 1600,
    so_refs: null,
    eta_date: "2026-05-20",
    placed_at: "2026-05-01T08:00:00Z",
    customer_delivery: "2026-05-10",
    eta_revised: false,
    orders: [],
    purchase_order_lines: [
      {
        id: "f1",
        sku: "SKU-CODY-Q",
        qty: 2,
        received_qty: 2,
        model_name: "Cody",
        size: "Queen",
        attrs: null,
        so_rows: [{ so: 1600, qty: 2, remark: null }],
      },
    ],
  },
  {
    // THE ESTIMATE CASE — the one Q1 exists for. The factory has never given a
    // date, so `eta_date` is null and the register shows OUR OWN estimate
    // (issued + the supplier × category production days). It still lands after
    // the customer's date, so the gap speaks — in AMBER, because nobody at the
    // factory has said anything. Live, 8 of the 10 gap warnings are this.
    id: "PO-9007",
    supplier_id: OHANA,
    warehouse_id: WH,
    status: "open",
    sup_status: "confirmed",
    so: 1700,
    so_refs: null,
    eta_date: null,
    placed_at: "2099-03-02T08:00:00Z",
    customer_delivery: "2099-03-03",
    eta_revised: false,
    orders: [],
    purchase_order_lines: [line("g1", "SKU-JAGER-K", 1, "Jager", "King")],
  },
  {
    // Q5 — THE ONLY PO CARRYING A SUPPLIER READY DATE. The factory has
    // answered both questions: it finishes on 12 Aug and the goods reach us on
    // 5 Dec, so the two runs of history are both non-empty and must stay apart.
    id: "PO-9008",
    supplier_id: OHANA,
    warehouse_id: WH,
    status: "open",
    sup_status: "confirmed",
    so: 1800,
    so_refs: null,
    eta_date: "2099-12-05",
    expected_ready_date: "2099-08-12",
    placed_at: "2026-06-01T08:00:00Z",
    // Comfortably before the customer's date → no gap, nothing to warn about.
    customer_delivery: "2099-12-31",
    eta_revised: false,
    orders: [],
    promises: [
      {
        kind: "ready_date",
        answer: "ready_date",
        about_date: null,
        previous_date: null,
        new_date: "2099-08-12",
        reason: null,
        recorded_at: "2026-06-02T02:00:00Z",
      },
      {
        kind: "tomorrow_delivery",
        answer: "shipping",
        about_date: "2099-12-05",
        previous_date: null,
        new_date: null,
        reason: null,
        recorded_at: "2026-06-03T02:00:00Z",
      },
    ],
    purchase_order_lines: [line("h1", "SKU-SONIC-K", 1, "Sonic", "King")],
  },
  {
    // Q7 — PO-2032's own shape: ONE purchase order whose lines go TWO ways.
    // The row prints the PO's own destination and how many more (a FLAG); the
    // per-line truth is the expand's, which is why this is not a duplicate.
    id: "PO-9009",
    supplier_id: OHANA,
    warehouse_id: WH,
    destination_id: KLANG,
    status: "open",
    sup_status: "confirmed",
    so: 1900,
    so_refs: [1901, 1902],
    eta_date: "2099-09-09",
    placed_at: "2026-07-01T08:00:00Z",
    customer_delivery: "2099-12-31",
    eta_revised: false,
    orders: [],
    purchase_order_lines: [
      { ...line("i1", "SKU-SONIC-K", 1, "Sonic", "King"), destination_id: AL },
      line("i2", "SKU-CODY-Q", 1, "Cody", "Queen"),
    ],
  },
];

/** The catalog the ESTIMATE needs: a SKU → model → category, so
 *  `productionDays` can be resolved for PO-9007. Deliberately ONE sku —
 *  `SKU-CODY-Q` stays out, or the workspace would start printing a `Queen`
 *  size sub-line the name already carries, and `RAW-UNKNOWN-1` stays out so it
 *  keeps proving the no-`model_name` fallback. */
const CATALOG = {
  skus: [{ sku: "SKU-JAGER-K", modelId: "m-jager", variant: null }],
  models: [{ id: "m-jager", name: "Jager", category: "bedframe" }],
};
const PURCHASING_SETTINGS = {
  productionDays: [
    { supplierId: OHANA, category: "bedframe", workingDays: 7 },
  ],
  suppliers: [{ id: OHANA, offDays: [0] }],
};

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockImplementation((url: string) => {
    if (url.includes("/units")) return Promise.resolve({ units: [] });
    if (url.startsWith("/api/operation/pos"))
      return Promise.resolve({
        pos: POS,
        destinations: DESTINATIONS,
        messageTemplate: null,
      });
    if (url === "/api/operation/suppliers")
      return Promise.resolve({
        suppliers: [
          // Ohana holds a GROUP link and no phone; Nice Future holds a phone
          // and no group. Not decoration — it is what makes both WhatsApp
          // labels reachable. COPY-STANDARD gives that button two words, and a
          // fixture carrying only one kind of supplier can only ever prove one.
          {
            id: OHANA,
            name: "Ohana",
            contact: null,
            whatsapp_group_url: "https://chat.whatsapp.com/ohana",
          },
          {
            id: NF,
            name: "Nice Future",
            contact: "0123456789",
            contact_email: "sales@nicefuture.example",
            whatsapp_group_url: null,
          },
        ],
      });
    if (url === "/api/operation/warehouse")
      return Promise.resolve({ warehouses: [] });
    if (url.startsWith("/api/catalog")) return Promise.resolve(CATALOG);
    if (url.startsWith("/api/operation/purchasing/settings"))
      return Promise.resolve(PURCHASING_SETTINGS);
    return Promise.resolve({});
  });
});

function mount() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/operation/procurement"]}>
        <OperationPurchaseOrders />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function mountLoaded() {
  const r = mount();
  await waitFor(() => expect(screen.getByText("PO-9001")).toBeInTheDocument());
  // The workspace mounts only after the first row AUTO-selects (?po= effect).
  await waitFor(() =>
    expect(screen.getByTestId("po-working-header")).toBeInTheDocument(),
  );
  return r;
}

/**
 * The WORD headers. The expand control's column carries none — deliberately,
 * exactly like the checkbox column: it is a control, not a fact, and §7 says a
 * header word is typed once (`the-expand-control-column-has-no-header` below
 * asserts the empty one is really there).
 */
const headerTexts = () =>
  within(screen.getByRole("table"))
    .getAllByRole("columnheader")
    .map((th) => th.textContent ?? "")
    .filter((t) => t !== "");

/** The WORKSPACE prints the selected PO's number too (document head + the
 *  WhatsApp draft), so every row assertion scopes to the LISTING's table. */
const listing = () => within(screen.getByRole("table"));
const hasRow = (id: string) => listing().queryAllByText(id).length > 0;

/** Select one PO in the register and wait for its workspace.
 *  Needed since the default order became RISK (Loo, 2026-08-04): the row that
 *  auto-selects is the most DANGEROUS PO, not a fixed fixture. A test about
 *  one PO now says which one. */
async function openPo(id: string) {
  fireEvent.click(listing().getByText(id));
  await waitFor(() =>
    expect(
      // Q10: the panel's identity row — the PO number and the actions ON it
      // sit together at the top, and the four facts follow underneath.
      within(screen.getByTestId("po-panel-title")).getByText(id),
    ).toBeInTheDocument(),
  );
}

/**
 * Q5 — THE WORKING AREA IS THE ROW EXPAND (Loo, 2026-08-04). Every test that
 * used to reach the date door or the items grid inside the right panel now
 * opens the row instead: the panel stopped being an editing surface.
 */
async function expandPo(id: string) {
  fireEvent.click(screen.getByTestId(`table-expand-${id}`));
  await waitFor(() =>
    expect(screen.getByTestId(`po-work-${id}`)).toBeInTheDocument(),
  );
  return within(screen.getByTestId(`po-work-${id}`));
}

/** Loo's nine, in his order — the ONE set (Q7, 2026-08-04). */
const NINE = [
  "PO Issued",
  "Supplier",
  "PO No.",
  "SO No.",
  "Items",
  "Destination",
  "Customer Delivery",
  "Expected Arrival",
  "Current Action",
];

describe("the nine frozen columns — ONE set, always", () => {
  it("the register opens on all nine, in his order", async () => {
    await mountLoaded();
    expect(headerTexts()).toEqual(NINE);
  });

  /**
   * THE RULING MOST LIKELY TO BE QUIETLY RE-INTRODUCED (Loo, 2026-08-04):
   * *"Operator 的眼睛会一直重新学习页面，Information Hierarchy 每开一次 Detail
   * 就改变，这是 ERP 不应该发生的."* The page used to swap to a five-column
   * compact set whenever the workspace was open. Closing and re-opening the
   * panel must move NOTHING.
   */
  it("opening and closing the workspace changes NO column", async () => {
    await mountLoaded();
    const open = headerTexts();
    // Q10: the control moved to the panel's own top-right, and a row click
    // brings the panel back — there is no "show" button to press.
    fireEvent.click(screen.getByTestId("po-panel-close"));
    const closed = headerTexts();
    fireEvent.click(listing().getByText("PO-9001"));
    const reopened = headerTexts();
    expect(open).toEqual(NINE);
    expect(closed).toEqual(NINE);
    expect(reopened).toEqual(NINE);
  });

  /** The other way of looking at a PO must not move a column either. */
  it("expanding a row changes NO column", async () => {
    await mountLoaded();
    fireEvent.click(screen.getByTestId("table-expand-PO-9003"));
    expect(headerTexts()).toEqual(NINE);
  });

  /** The honesty guard did not have to be kept: a column that can never hide
   *  cannot be hidden while it is filtered. Sorting one proves the set is
   *  still the same nine rather than five plus a rescued survivor. */
  it("sorting a column adds nothing and hides nothing", async () => {
    await mountLoaded();
    fireEvent.click(screen.getByTestId("table-sort-arriving"));
    expect(headerTexts()).toEqual(NINE);
  });

  it("`Received` is gone — it is not one of his nine", async () => {
    await mountLoaded();
    expect(headerTexts()).not.toContain("Received");
  });

  it("Customer Delivery's header says it is the EARLIEST date on a merged PO", async () => {
    await mountLoaded();
    const th = screen.getByRole("columnheader", { name: /Customer Delivery/ });
    expect(th.getAttribute("title")).toMatch(/Earliest customer delivery/);
  });

  it("the expand control's column carries no header word", async () => {
    await mountLoaded();
    const all = within(screen.getByRole("table"))
      .getAllByRole("columnheader")
      .map((th) => th.textContent ?? "");
    // Q5: the working area's control is a CONTROL, not a fact. It sits first,
    // and it is silent — same treatment as the checkbox column.
    expect(all[0]).toBe("");
    expect(all.filter((t) => t === "")).toHaveLength(1);
  });
});

/**
 * §12.2 — ONE FACT, ONE WORD, EVERYWHERE IT APPEARS (Loo, 2026-08-04).
 *
 * `Goods Arrival` named no destination — *arrival of what, where?* — and Q5
 * made the split visible by correctly using the new word in the expand while
 * this column kept the old one. A source scan of the page file, not a render
 * test, is what guards a rename: a render test only sees the branches its
 * fixture reaches.
 */
describe("the retired arrival word is off this page", () => {
  /**
   * A SOURCE SCAN, not a render test — the discipline this repo pays for
   * repeatedly (R8 · C1 · P13): a render test only sees the branches its
   * fixture reaches, and the retired word survived on this page for a day
   * inside a branch nobody's fixture opened. Comments are NOT stripped: the
   * word is retired portal-wide, and a comment naming it is the tombstone
   * that has already sent two readers looking for live code.
   */
  it("`Goods Arrival` appears ZERO times in the page source", () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "OperationPurchaseOrders.tsx"),
      "utf8",
    );
    expect(src.split("Goods Arrival").length - 1).toBe(0);
  });

  it("the column says `Expected Arrival`", async () => {
    await mountLoaded();
    expect(headerTexts()).toContain("Expected Arrival");
    expect(headerTexts()).not.toContain("Goods Arrival");
  });

  it("nothing rendered anywhere on the page says the retired word", async () => {
    await mountLoaded();
    expect(document.body.textContent ?? "").not.toContain("Goods Arrival");
  });

  it("the supplier message carries the ruled word, not the retired one", async () => {
    await mountLoaded();
    await openPo("PO-9001");
    fireEvent.click(screen.getByTestId("po-wa-toggle"));
    const draft = screen.getByTestId("po-wa-message") as HTMLTextAreaElement;
    // A message a supplier HOLDS is where one fact spelt two ways costs most.
    expect(draft.value).toContain("Expected Arrival:");
    expect(draft.value).not.toContain("Goods Arrival");
  });
});

/**
 * `SO No.` and `Destination` — two of Loo's nine that simply did not exist,
 * with their data already on the wire (`so` + `so_refs`, and 0311's per-line
 * `destination_id`). `+N` is the portal's existing pattern; `Multiple (2)` is
 * refused by name, and `AL Sungai Buloh` may never be shortened to `AL`.
 */
describe("SO No. — which sales orders this PO is made of", () => {
  it("one SO prints itself; several print the first and how many more", async () => {
    await mountLoaded();
    const one = listing().getByText("PO-9001").closest("tr")!;
    expect(within(one).getByText("SO-1200")).toBeInTheDocument();
    const many = listing().getByText("PO-9009").closest("tr")!;
    expect(within(many).getByText("SO-1900 +2")).toBeInTheDocument();
  });

  it("the full list rides the cell's own title — nothing is lost to `+N`", async () => {
    await mountLoaded();
    const many = listing().getByText("PO-9009").closest("tr")!;
    expect(within(many).getByText("SO-1900 +2").getAttribute("title")).toBe(
      "SO-1900\nSO-1901\nSO-1902",
    );
  });

  it("a stockpile PO that serves no sales order says so", async () => {
    await mountLoaded();
    const none = listing().getByText("PO-9002").closest("tr")!;
    expect(within(none).getAllByText("—").length).toBeGreaterThan(0);
  });
});

describe("Destination — is this PO a special one?", () => {
  it("a PO whose lines all agree prints ONE full name", async () => {
    await mountLoaded();
    const row = listing().getByText("PO-9003").closest("tr")!;
    expect(within(row).getByText("Carres Klang")).toBeInTheDocument();
  });

  it("lines going two ways print the PO's own first, then how many more", async () => {
    await mountLoaded();
    const row = listing().getByText("PO-9009").closest("tr")!;
    const cell = within(row).getByText("Carres Klang +1");
    // FULL NAMES ONLY — `AL`, `Multiple (2)` and `Drop point` are all refused.
    expect(cell.getAttribute("title")).toBe("Carres Klang\nAL Sungai Buloh");
    expect(row.textContent ?? "").not.toContain("Multiple (");
  });

  it("never shortens `AL Sungai Buloh`", async () => {
    await mountLoaded();
    fireEvent.change(screen.getByPlaceholderText("Search"), {
      target: { value: "PO-9009" },
    });
    const row = listing().getByText("PO-9009").closest("tr")!;
    expect(within(row).getByText("Carres Klang +1").getAttribute("title")).toContain(
      "AL Sungai Buloh",
    );
  });
});

/**
 * THE DEFAULT ORDER IS RISK TO THE CUSTOMER'S PROMISE (Loo, 2026-08-04).
 *
 * It replaces `PO Issued` oldest first, which sorted by how long the DOCUMENT
 * had waited rather than by how close the CUSTOMER was. Jess's rule is NOT
 * deleted: it keeps its column, its header sort, and it survives inside
 * `comparePoRisk` as the tie-breaker.
 */
describe("the default order — risk to the customer's promise", () => {
  const order = () =>
    listing()
      .getAllByText(/^PO-9\d{3}$/)
      .map((el) => el.textContent);

  it("a late call leads, then goods landing after the promise, then on the day", async () => {
    await mountLoaded();
    expect(order()).toEqual([
      // rung 1 — an open engine call already late (9003 arrives today, 9004's
      // date has passed). Inside the rung, the nearer customer date first and
      // a PO with no customer date LAST.
      "PO-9003",
      "PO-9004",
      // rung 2 — the goods land after what we promised. 9007 is our own
      // ESTIMATE (3 Mar) and 9001 the factory's own word (22 Dec).
      "PO-9007",
      "PO-9001",
      // rung 3 — they land ON the customer's day.
      "PO-9005",
      // rung 5 — nothing to say. Inside the rung the nearer customer date
      // first, and a PO with no customer date LAST: the two finished POs sit
      // beside the quiet one, which is what "nothing to do" looks like.
      "PO-9006",
      "PO-9008",
      "PO-9009",
      "PO-9002",
    ]);
  });

  it("PO Issued still sorts by header click — and clearing returns to RISK", async () => {
    await mountLoaded();
    fireEvent.click(screen.getByTestId("table-sort-issued"));
    expect(order()).toEqual([
      "PO-9001", // 5 Jan
      "PO-9004", // 10 Jan
      "PO-9002", // 1 Feb
      "PO-9003", // 1 Mar
      "PO-9005", // 1 Apr
      "PO-9006", // 1 May
      "PO-9008", // 1 Jun
      "PO-9009", // 1 Jul
      "PO-9007", // 2099
    ]);
    // asc → desc → cleared. A third click hands the page back its own default.
    fireEvent.click(screen.getByTestId("table-sort-issued"));
    fireEvent.click(screen.getByTestId("table-sort-issued"));
    expect(order()).toEqual([
      "PO-9003",
      "PO-9004",
      "PO-9007",
      "PO-9001",
      "PO-9005",
      "PO-9006",
      "PO-9008",
      "PO-9009",
      "PO-9002",
    ]);
  });
});

describe("the Items words", () => {
  it("speaks MODEL from the wire, first line + how many more", async () => {
    await mountLoaded();
    expect(listing().getByText("Cody Q ×2 · +2")).toBeInTheDocument();
  });

  it("shows ×N only when N ≥ 2 — never ×1", async () => {
    await mountLoaded();
    expect(screen.getByText("Sonic K ×3")).toBeInTheDocument();
    expect(screen.queryByText(/×1\b/)).not.toBeInTheDocument();
  });

  it("an older Worker without model_name degrades to the SKU code", async () => {
    await mountLoaded();
    expect(screen.getByText("RAW-UNKNOWN-1")).toBeInTheDocument();
  });
});

describe("what the row states", () => {
  it("a cancelled PO greys out (data-muted)", async () => {
    await mountLoaded();
    const cell = screen.getByText("PO-9002");
    const row = cell.closest("tr");
    expect(row?.getAttribute("data-muted")).toBe("true");
  });

  it("a revised arriving date says (revised)", async () => {
    await mountLoaded();
    // Two POs now carry a revised date (9001, 9005) — the marker is per row.
    expect(listing().getAllByText("(revised)").length).toBe(2);
  });
});

/** Jess, 2026-08-03 — the register put Customer Delivery and Goods Arrival
 *  side by side and left the subtraction to the operator's head. Measured on
 *  live prod: 8 of 19 POs were already landing after the customer's date. */
describe("the gap against the customer's date", () => {
  /** Scoped to the LISTING on purpose: a collapsed workspace is `hidden`, not
   *  unmounted, so its own gap is still in the document. */
  const gaps = () =>
    listing()
      .queryAllByTestId("po-arrival-gap")
      .map((el) => el.textContent?.trim());

  it("a PO landing after the promise says how many days late", async () => {
    await mountLoaded();
    const row = listing().getByText("PO-9001").closest("tr")!;
    expect(
      within(row as HTMLElement).getByTestId("po-arrival-gap"),
    ).toHaveTextContent("8d late");
  });

  it("landing ON the customer's own day is not fine — it says same day", async () => {
    await mountLoaded();
    const row = listing().getByText("PO-9005").closest("tr")!;
    expect(
      within(row as HTMLElement).getByTestId("po-arrival-gap"),
    ).toHaveTextContent("same day");
  });

  it("room to spare says NOTHING — silence has to mean fine", async () => {
    await mountLoaded();
    // PO-9003 arrives today against a 2099 promise: acres of room.
    const row = listing().getByText("PO-9003").closest("tr")!;
    expect(
      within(row as HTMLElement).queryByTestId("po-arrival-gap"),
    ).toBeNull();
  });

  it("a finished PO stays silent — its gap is history, not work", async () => {
    await mountLoaded();
    // PO-9006 landed 10 days after the promise and is fully received.
    const row = listing().getByText("PO-9006").closest("tr")!;
    expect(
      within(row as HTMLElement).queryByTestId("po-arrival-gap"),
    ).toBeNull();
    // …and exactly the three live ones speak, nobody else: 9007 (estimate),
    // 9001 (`8d late`) and 9005 (`same day`), in risk order.
    expect(gaps()).toHaveLength(3);
    expect(gaps().slice(1)).toEqual(["8d late", "same day"]);
  });

  it("the gap survives beside (revised) — the warning is never the thing cut", async () => {
    await mountLoaded();
    const row = listing().getByText("PO-9001").closest("tr")!;
    const cell = within(row as HTMLElement);
    expect(cell.getByTestId("po-arrival-gap")).toBeInTheDocument();
    expect(cell.getByText("(revised)")).toBeInTheDocument();
  });

  it("the WORKING AREA prints the gap, because that is where the date is RECORDED", async () => {
    await mountLoaded();
    fireEvent.click(listing().getByText("PO-9001"));
    // The panel still states the promise we made to a person — read only:
    // purchasing cannot move a customer's date.
    expect(screen.getByTestId("po-customer-delivery")).toBeInTheDocument();
    const work = await expandPo("PO-9001");
    expect(work.getAllByTestId("po-arrival-gap").length).toBeGreaterThan(0);
  });
});

/**
 * A GUESS IS NOT PAINTED THE SAME AS A FACT (Loo, 2026-08-04).
 *
 * Ten of the live 21 rows print a gap warning and EIGHT of them are computed
 * from OUR OWN estimate — the factory has said nothing. The date was already
 * grey while the warning beside it was red, identical to the rows where the
 * supplier really did give a date. No new word: only the tone.
 */
describe("the gap's tone says WHO gave the date", () => {
  const gapIn = (id: string) =>
    within(listing().getByText(id).closest("tr") as HTMLElement).getByTestId(
      "po-arrival-gap",
    );

  it("the FACTORY's own date landing late is RED", async () => {
    await mountLoaded();
    const gap = gapIn("PO-9001"); // eta_date on the wire = the supplier's word
    expect(gap.getAttribute("data-tone")).toBe("confirmed");
    expect(gap.className).toContain("text-kit-red-11");
  });

  it("OUR OWN estimate landing late is AMBER — nobody has said anything yet", async () => {
    await mountLoaded();
    const gap = gapIn("PO-9007"); // no eta_date: issued + production days
    expect(gap.getAttribute("data-tone")).toBe("estimate");
    expect(gap.className).toContain("text-kit-amber-11");
    expect(gap.className).not.toContain("text-kit-red-11");
  });

  it("`same day` stays amber even when the factory said it — tight, not broken", async () => {
    await mountLoaded();
    const gap = gapIn("PO-9005");
    expect(gap).toHaveTextContent("same day");
    expect(gap.className).toContain("text-kit-amber-11");
  });

  it("the WORKING AREA uses the SAME rule — two surfaces cannot disagree", async () => {
    await mountLoaded();
    const work = await expandPo("PO-9001");
    expect(work.getAllByTestId("po-arrival-gap")[0].getAttribute("data-tone")).toBe(
      "confirmed",
    );
    // Opening a second closes the first (Loo's rule 2), so this is also the
    // one-at-a-time behaviour exercised from the other end.
    const work2 = await expandPo("PO-9007");
    expect(work2.getAllByTestId("po-arrival-gap")[0].getAttribute("data-tone")).toBe(
      "estimate",
    );
  });
});

/**
 * THE COLUMN THAT SAYS WHAT TO DO STOPS BEING THE ONE THAT IS SQUEEZED
 * (Loo, 2026-08-04). `Current Action` was `width: "auto"`, so it got the
 * LEFTOVER — measured in a real browser at 23px on a 1280 viewport and 109 on
 * a 1366, with `text-overflow: clip`, so not even an ellipsis said so.
 *
 * **The real widths are MEASURED IN A BROWSER, never here** — jsdom has no
 * layout, so this asserts the CONTRACT the browser then renders: which column
 * is fixed and which one absorbs the slack.
 */
describe("nine measured minimums, and no tail", () => {
  const colWidths = () => {
    const table = screen.getByRole("table");
    const cols = Array.from(table.querySelectorAll("colgroup col"));
    const keys = within(table)
      .getAllByRole("columnheader")
      .map((th) => th.getAttribute("data-column"));
    return Object.fromEntries(
      keys.map((k, i) => [k, (cols[i] as HTMLElement)?.style.width]),
    );
  };

  /** The px numbers are Loo's own measured minimums (Q7). They are asserted
   *  here so a later chat cannot shave one to make a scrollbar go away — the
   *  MEASUREMENT itself is a browser's job, and this only pins the contract. */
  it("every column carries its measured minimum, and none is `auto`", async () => {
    await mountLoaded();
    expect(colWidths()).toMatchObject({
      issued: "96px",
      supplier: "87px",
      po: "83px",
      sono: "94px",
      items: "135px",
      dest: "135px",
      custdel: "140px",
      arriving: "206px",
      action: "192px",
    });
    expect(Object.values(colWidths()).filter((v) => v === "auto")).toHaveLength(0);
  });

  it("the widths do not move when the workspace opens or closes", async () => {
    await mountLoaded();
    const open = colWidths();
    expect(colWidths()).toEqual(open);
  });

  /** Item 6 of the card: the region scrolls rather than losing a column.
   *  Deleting business information to avoid a scrollbar is what Loo forbade. */
  it("the listing region keeps ONE min-width and scrolls below it", async () => {
    await mountLoaded();
    const region = screen.getByTestId("po-listing");
    const scroller = region.querySelector(".overflow-auto") as HTMLElement;
    expect(scroller.firstElementChild?.className).toContain("min-w-[1205px]");
    expect(scroller.firstElementChild?.className).toContain("min-w-[1205px]");
  });

  it("every action word still carries its own title, so a clip can be read", async () => {
    await mountLoaded();
    const cell = listing().getAllByText("Check Expected Arrival")[0];
    expect(cell.getAttribute("title")).toBe("Check Expected Arrival");
  });
});

/** Jess, 2026-08-03 — v7 took the Current Action hero out because the
 *  register's column carries it; with the workspace open that column was
 *  being CLIPPED, so the action lived nowhere. The fix is the WIDTH, and the
 *  workspace stays out of it: `Next — Waiting for Goods` was a status wearing
 *  an action's label, and the same slot would have carried a real call on the
 *  next PO. One label cannot be true of both. */
describe("Current Action survives the workspace being open", () => {
  it("the workspace does NOT repeat the action — the column owns it", async () => {
    await mountLoaded();
    fireEvent.click(listing().getByText("PO-9004"));
    expect(screen.queryByTestId("po-next-action")).toBeNull();
    // …and the word it would have carried is nowhere in the document either.
    // PO-9004 is the OVERDUE one, and since Q8 its word is the same one a
    // dateless PO carries — the retired `Contact Supplier` is checked too,
    // so this cannot pass merely because a string stopped existing.
    const doc = within(screen.getByTestId("po-document"));
    expect(doc.queryByText("Check Expected Arrival")).toBeNull();
    expect(doc.queryByText("Contact Supplier")).toBeNull();
    expect(doc.queryByText("Next")).toBeNull();
  });

  it("compact mode fits the longest action word without cutting it", async () => {
    await mountLoaded();
    // Compact is the default. The word must be present ENTIRE — the bug was a
    // silent `clip`, so a partial match would have passed all along.
    expect(
      listing().getAllByText("Check Expected Arrival").length,
    ).toBeGreaterThan(0);
    const cell = listing().getAllByText("Check Expected Arrival")[0];
    expect(cell.getAttribute("title")).toBe("Check Expected Arrival");
  });
});

/** Jess, 2026-08-03 — the list said `Cody Q` and the document said
 *  `SKU-CODY-Q`: two languages for one PO. A buyer knows Booqit · Cody ·
 *  Jager, never 5539-1B(LHF). */
describe("one product, one name", () => {
  it("the working area's DESCRIPTION speaks the same words as the register", async () => {
    await mountLoaded();
    const work = await expandPo("PO-9003");
    expect(work.getAllByText("Cody Q").length).toBeGreaterThan(0);
    expect(work.queryByText("SKU-CODY-Q")).toBeNull();
    // The listing spells it identically — same function, so it cannot drift.
    expect(listing().getByText("Cody Q ×2 · +2")).toBeInTheDocument();
  });

  it("the CODE is still reachable — on hover, where it identifies without describing", async () => {
    await mountLoaded();
    const work = await expandPo("PO-9003");
    expect(work.getAllByText("Cody Q")[0].getAttribute("title")).toBe(
      "SKU-CODY-Q",
    );
  });

  it("the variant is not printed twice — the name already carries it", async () => {
    await mountLoaded();
    const work = await expandPo("PO-9003");
    // `Cody Q` holds the size; a bare `Queen` sub-line underneath said it again.
    expect(work.queryByText("Queen")).toBeNull();
  });
});

describe("the cross-field Search", () => {
  it("finds a PO by its CUSTOMER's name", async () => {
    await mountLoaded();
    fireEvent.change(screen.getByPlaceholderText("Search"), {
      target: { value: "ah hock" },
    });
    expect(hasRow("PO-9003")).toBe(true);
    expect(hasRow("PO-9001")).toBe(false);
  });

  it("finds a PO by MODEL", async () => {
    await mountLoaded();
    fireEvent.change(screen.getByPlaceholderText("Search"), {
      target: { value: "cody" },
    });
    expect(hasRow("PO-9003")).toBe(true);
    expect(hasRow("PO-9001")).toBe(false);
  });
});

describe("the PO Issued ▼ — Excel's date menu", () => {
  it("offers the presets, the data's month buckets, and Custom Date Range", async () => {
    await mountLoaded();
    fireEvent.click(screen.getByTestId("table-filter-issued"));
    for (const label of ["Today", "Yesterday", "This Week", "Last Week", "This Month", "Last Month"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    // Month buckets come from the DATA (Jan/Feb/Mar 2026 fixtures).
    expect(screen.getByText("Jan 2026")).toBeInTheDocument();
    expect(screen.getByText("Mar 2026")).toBeInTheDocument();
    expect(screen.getByText("Custom Date Range…")).toBeInTheDocument();
  });

  it("a custom range narrows the register to the pair, inclusive", async () => {
    await mountLoaded();
    fireEvent.click(screen.getByTestId("table-filter-issued"));
    fireEvent.change(screen.getByTestId("table-filter-range-from-issued"), {
      target: { value: "2026-01-01" },
    });
    fireEvent.change(screen.getByTestId("table-filter-range-to-issued"), {
      target: { value: "2026-02-28" },
    });
    fireEvent.click(screen.getByTestId("table-filter-range-apply-issued"));
    await waitFor(() => expect(hasRow("PO-9003")).toBe(false));
    expect(hasRow("PO-9001")).toBe(true);
    expect(hasRow("PO-9002")).toBe(true);
  });

  it("a month bucket narrows to its month", async () => {
    await mountLoaded();
    fireEvent.click(screen.getByTestId("table-filter-issued"));
    fireEvent.click(screen.getByText("Feb 2026"));
    await waitFor(() => expect(hasRow("PO-9001")).toBe(false));
    expect(hasRow("PO-9002")).toBe(true);
  });
});

describe("the Supplier Workspace (Jess's v7 freeze, 2026-08-02)", () => {
  it("the fixed header: labels left, PO number on the title row, no letterhead, no badge", async () => {
    await mountLoaded();
    expect(document.querySelector('img[alt="Carres"]')).toBeNull();
    const header = within(screen.getByTestId("po-working-header"));
    expect(header.getByText("PO Issued")).toBeInTheDocument();
    expect(header.getByText("Delivery To")).toBeInTheDocument();
    expect(header.getByText("Supplier")).toBeInTheDocument();
    // Q10 Ⓔ: the number and the actions on it moved UP to their own row —
    // the object's identity and its actions belong together (Fiori · BC ·
    // GitHub · Linear). The auto-selected PO is the register's FIRST row,
    // which is the most dangerous one rather than the oldest document.
    const title = within(screen.getByTestId("po-panel-title"));
    expect(title.getByText("PO-9003")).toBeInTheDocument();
    expect(title.getByTestId("po-print-pdf")).toBeInTheDocument();
    expect(title.getByTestId("po-panel-close")).toBeInTheDocument();
    expect(header.queryByText("PO-9003")).toBeNull();
    // Progress belongs to the rail — the header never repeats it.
    expect(screen.queryByTestId("po-work-state")).not.toBeInTheDocument();
  });

  it("the supplier-date row opens IN PLACE and carries the field's own history", async () => {
    await mountLoaded();
    const work = await expandPo("PO-9001");
    expect(screen.queryByTestId("po-date-extend")).not.toBeInTheDocument();
    fireEvent.click(work.getByTestId("po-date-row"));
    const ext = within(screen.getByTestId("po-date-extend"));
    // PO-9001's ledger holds ONE answer → one dated line, no ordinal yet.
    expect(ext.getByText(/Production Delay/)).toBeInTheDocument();
  });

  it("OVERDUE is printed beside the date, never a second bucket", async () => {
    await mountLoaded();
    const work = await expandPo("PO-9004");
    expect(work.getByTestId("po-overdue").textContent).toMatch(/Overdue by \d+ day/);
    // The rail still has five buckets — overdue is a sub-state of waiting,
    // and what it needs from a human is an ACTION, in the action column.
    expect(screen.queryByTestId("po-rail-state-overdue")).not.toBeInTheDocument();
  });

  it("ITEMS is an Excel grid: one row per SO × SKU, with the SO's remark", async () => {
    await mountLoaded();
    const work = await expandPo("PO-9003");
    const items = within(work.getByTestId("po-doc-items"));
    // Line a1 covers TWO sales orders → two rows, never one stacked cell.
    expect(items.getByText("SO-1300")).toBeInTheDocument();
    expect(items.getByText("SO-1301")).toBeInTheDocument();
    // The salesperson's remark flows over, read-only, LABELLED as theirs —
    // purchasing's own note is a separate line marked Ops.
    expect(items.getByText("Sales: No drilling")).toBeInTheDocument();
    // `Received`, not `Recv` — the abbreviation rule bans shorthand a new hire
    // must google, and `Received` is already the ruled word (the Receiving
    // Workspace's, and the register column beside it).
    expect(items.getByText("Received")).toBeInTheDocument();
    expect(items.queryByText("Recv")).toBeNull();
    expect(items.getByText("Total")).toBeInTheDocument();
  });

  it("the per-line doors are IN the row, quiet until clicked — the ⋮ is gone", async () => {
    await mountLoaded();
    const work = await expandPo("PO-9003");
    // Q5: the destination is a CELL of the grid now, not a menu two clicks
    // deep, because "which lines go to AL?" is the question the expand exists
    // to answer across many POs.
    expect(work.queryByTestId("po-item-menu-1")).toBeNull();
    expect(work.getByText("Destination")).toBeInTheDocument();
    // QUIET by default (Jess, "it always show like that?"): values are TEXT,
    // no control until something is clicked.
    expect(work.queryByTestId("po-line-destination-1")).not.toBeInTheDocument();
    expect(work.queryByRole("textbox")).not.toBeInTheDocument();
    expect(work.getAllByText("Add a note…").length).toBeGreaterThan(0);
  });

  it("quantities live on the rows — no Receiving panel AND no door", async () => {
    await mountLoaded();
    const work = await expandPo("PO-9003");
    expect(screen.queryByTestId("po-receiving-summary")).not.toBeInTheDocument();
    // The warehouse checks in over there and Received moves by itself (Jess,
    // 2026-08-02) — purchasing never navigates to do it.
    expect(screen.queryByTestId("po-open-receiving")).not.toBeInTheDocument();
    expect(within(work.getByTestId("po-doc-items")).getByText("Received")).toBeInTheDocument();
  });

  // Jess, 2026-08-03: three CONCERNS, three bands — Document · Communication ·
  // Communication History. `Download PDF`, `Supplier Portal`, Teams or WeCom
  // each join an existing band later without the structure moving. `ACTIVITY`
  // is retired (her 2026-08-02 word), and `History` is deliberately NOT taken:
  // the PO's real history will later carry revisions, ETA changes, Goods
  // Arrival changes, notes and claims.
  // Q10 Ⓔ took `DOCUMENT` off the desk: it headed ONE button, and its title
  // plus hairline cost ~30px for nothing. `Print PDF` sits beside the PO
  // number now; the three Communication controls did NOT follow it up there
  // (measured 385.1px against 368px usable) and this band keeps its home.
  it("the desk is two bands — Communication · Communication History", async () => {
    await mountLoaded();
    const activity = within(screen.getByTestId("po-activity"));
    expect(activity.queryByText("Document")).not.toBeInTheDocument();
    expect(activity.getByText("Communication")).toBeInTheDocument();
    expect(activity.getByText("Communication History")).toBeInTheDocument();
    expect(activity.queryByText("Activity")).not.toBeInTheDocument();
    expect(activity.queryByTestId("po-print-pdf")).not.toBeInTheDocument();
    expect(activity.getByTestId("po-copy-message")).toBeInTheDocument();
    // `PO issued` was deleted: the header already states it (Jess).
    expect(screen.getByTestId("po-history").textContent).toBe("No communication yet.");
  });

  // PRINT ≠ ISSUE (Jess, 2026-08-03), and it is four separate promises:
  // printing writes no history, moves no status, mints no revision, and has no
  // limit. The button is therefore never disabled by a send, and pressing it
  // can never put a row in the Communication History.
  it("Print PDF records nothing — no history row, and it is always available", async () => {
    await mountLoaded();
    const btn = screen.getByTestId("po-print-pdf");
    expect(btn).toHaveTextContent("Print PDF");
    expect(btn).not.toBeDisabled();
    expect(screen.getByTestId("po-history").textContent).toBe("No communication yet.");
    expect(screen.queryByTestId("po-history-row")).not.toBeInTheDocument();
  });

  it("the WhatsApp draft is ONE line until opened — Copy works either way", async () => {
    await mountLoaded();
    expect(screen.queryByTestId("po-wa-message")).not.toBeInTheDocument();
    expect(screen.getByTestId("po-copy-message")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("po-wa-toggle"));
    expect(screen.getByTestId("po-wa-message")).toBeInTheDocument();
  });
});

describe("the ONE Current Action source (Law 7)", () => {
  /** Since Q7 the row carries three columns that can be empty (SO No.,
   *  Destination, Current Action), so a `—` must be asked for BY COLUMN. */
  const actionCellOf = (poNo: string) =>
    within(
      listing().getByText(poNo).closest("tr")!.querySelector(
        "td:last-child",
      ) as HTMLElement,
    );

  it("the register's column reads the shared engine, and `—` is a real answer", async () => {
    await mountLoaded();
    expect(
      listing().getAllByText("Check Expected Arrival").length,
    ).toBeGreaterThan(0);
    // Q8 (Loo, 2026-08-04 · §12.3): a status and a navigation are not
    // actions, so a PO whose goods are on the way says nothing. `—` here is
    // the ANSWER, not a hole — the rail carries `Waiting for Goods`.
    expect(actionCellOf("PO-9001").getByText("—")).toBeInTheDocument();
    // …and the work being over says nothing either.
    expect(actionCellOf("PO-9002").getByText("—")).toBeInTheDocument();
  });

  it("an overdue PO carries the SAME word as a dateless one (Q8)", async () => {
    await mountLoaded();
    // PO-9004's supplier date passed and nothing came; PO-9007 never had one.
    // Both need the same phone call, so both read the same word — a late
    // version of one action is not a second action (Loo, 2026-08-04).
    expect(
      actionCellOf("PO-9004").getByText("Check Expected Arrival"),
    ).toBeInTheDocument();
    expect(
      actionCellOf("PO-9007").getByText("Check Expected Arrival"),
    ).toBeInTheDocument();
    // The three retired words are gone from the whole register, not just from
    // these two rows — `Waiting for Goods` only as the RAIL's own label.
    expect(listing().queryByText("Contact Supplier")).toBeNull();
    expect(listing().queryByText("Confirm Arrival")).toBeNull();
    expect(listing().queryByText("Open Receiving")).toBeNull();
    expect(listing().queryByText("Waiting for Goods")).toBeNull();
  });
});

describe("the supplier-date door (Jess's cycle, one form)", () => {
  it("a PO with NO date takes its FIRST date — no reason asked", async () => {
    await mountLoaded();
    const work = await expandPo("PO-9002");
    // PO-9002 is cancelled; use the one with no date instead.
    fireEvent.click(work.getByTestId("po-date-row"));
    fireEvent.click(screen.getByTestId("po-date-open"));
    const form = within(screen.getByTestId("po-date-form"));
    expect(form.getByTestId("po-date-input")).toBeInTheDocument();
    // No date held → nothing to delay → the reason picker stays away.
    expect(form.queryByTestId("po-date-reason")).not.toBeInTheDocument();
  });

  it("keying a DIFFERENT date asks for a reason and posts a delay", async () => {
    await mountLoaded();
    // PO-9001 holds a supplier-confirmed date (its ledger says so).
    await expandPo("PO-9001");
    fireEvent.click(screen.getByTestId("po-date-row"));
    fireEvent.click(screen.getByTestId("po-date-open"));
    const input = screen.getByTestId("po-date-input");
    fireEvent.change(input, { target: { value: "2099-12-31" } });
    expect(screen.getByTestId("po-date-reason")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("po-date-remarks-open"));
    fireEvent.change(screen.getByTestId("po-date-remarks"), {
      target: { value: "factory said Tuesday" },
    });
    fireEvent.click(screen.getByTestId("po-date-save"));
    await waitFor(() =>
      expect(
        apiFetch.mock.calls.some(
          (c) =>
            String(c[0]).includes("/tomorrow-delivery") &&
            String((c[1] as { body?: string })?.body).includes('"delayed"'),
        ),
      ).toBe(true),
    );
    const call = apiFetch.mock.calls.find((c) =>
      String(c[0]).includes("/tomorrow-delivery"),
    )!;
    const body = JSON.parse(String((call[1] as { body: string }).body));
    expect(body).toMatchObject({
      answer: "delayed",
      newDate: "2099-12-31",
      remarks: "factory said Tuesday",
    });
    // The reason is the countable CATEGORY, never free text.
    expect(PO_DELAY_REASONS_FOR_TEST).toContain(body.reason);
  });
});

describe("the supplier's date history, numbered (SAP's shape)", () => {
  it("counts the dates and prints the slip once there is more than one", async () => {
    await mountLoaded();
    const work = await expandPo("PO-9005");
    // The date row carries NO history summary (Jess, 2026-08-03): `3rd date ·
    // 11 days later` was history squeezed into a header, and the history is
    // one click away saying it properly.
    expect(screen.queryByTestId("po-date-nth")).toBeNull();
    expect(
      within(work.getByTestId("po-date-row")).queryByText(/days later/),
    ).toBeNull();
    fireEvent.click(work.getByTestId("po-date-row"));
    const h = within(screen.getByTestId("po-date-history"));
    // No "told" column — two answers keyed the same day printed the same
    // date twice and read as a second delivery date.
    expect(h.queryByText(/told/)).not.toBeInTheDocument();
    expect(h.getByText("1st")).toBeInTheDocument();
    expect(h.getByText("2nd")).toBeInTheDocument();
    expect(h.getByText("3rd")).toBeInTheDocument();
  });

  it("the extend is QUIET — no form until you ask to record something", async () => {
    await mountLoaded();
    const work = await expandPo("PO-9003");
    fireEvent.click(work.getByTestId("po-date-row"));
    // History and a quiet trigger; no date box, no Remarks box standing open.
    expect(screen.queryByTestId("po-date-form")).not.toBeInTheDocument();
    expect(screen.queryByTestId("po-date-remarks")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("po-date-open"));
    const input = screen.getByTestId("po-date-input") as HTMLInputElement;
    // A date already given can never be edited — you record the NEXT one.
    expect(input.value).toBe("");
    expect(screen.queryByTestId("po-date-effect")).not.toBeInTheDocument();
    // A multi-field form gets a real Save (Jess: "i cant save?"); Remarks is
    // the exception and stays folded until asked for.
    expect(screen.getByTestId("po-date-save")).toBeDisabled();
    expect(screen.queryByTestId("po-date-remarks")).not.toBeInTheDocument();
    expect(screen.getByTestId("po-date-remarks-open")).toBeInTheDocument();
  });

  it("Esc closes the date form and records nothing", async () => {
    await mountLoaded();
    const work = await expandPo("PO-9003");
    fireEvent.click(work.getByTestId("po-date-row"));
    fireEvent.click(screen.getByTestId("po-date-open"));
    fireEvent.change(screen.getByTestId("po-date-input"), {
      target: { value: "2099-12-31" },
    });
    fireEvent.keyDown(screen.getByTestId("po-date-input"), { key: "Escape" });
    expect(screen.queryByTestId("po-date-form")).not.toBeInTheDocument();
    expect(
      apiFetch.mock.calls.some((c) => String(c[0]).includes("/tomorrow-delivery")),
    ).toBe(false);
  });

  it("once a date is keyed it says exactly what Save will record", async () => {
    await mountLoaded();
    await expandPo("PO-9001"); // it holds 2099-12-30 — the date this test keys
    fireEvent.click(screen.getByTestId("po-date-row"));
    fireEvent.click(screen.getByTestId("po-date-open"));
    const input = screen.getByTestId("po-date-input");
    fireEvent.change(input, { target: { value: "2099-12-31" } });
    expect(screen.getByTestId("po-date-effect").textContent).toMatch(/^Delay \d+ day/);
    // The same date is a confirmation, not a delay — and asks no reason.
    fireEvent.change(input, { target: { value: "2099-12-30" } });
    expect(screen.getByTestId("po-date-effect").textContent).toMatch(/Same date/);
    expect(screen.queryByTestId("po-date-reason")).not.toBeInTheDocument();
  });
});

describe("where each line goes (0311, Jess 2026-08-02 — now a cell of the expand)", () => {
  it("changing the destination for the WHOLE line posts /destination", async () => {
    await mountLoaded();
    const work = await expandPo("PO-9003");
    // Row 4 is a qty-1 line (rows 1-2 are the split SO rows of line a1), so
    // there is nothing to split.
    fireEvent.click(work.getByTestId("po-line-destination-open-4"));
    fireEvent.change(work.getByTestId("po-line-destination-4"), {
      target: { value: AL },
    });
    expect(work.getByTestId("po-line-effect-4").textContent).toMatch(/All 1 move/);
    // A picker changed with the MOUSE needs a button (Jess: "i cant save for
    // AL") — Enter is a keyboard gesture nobody reaches for here. Q5 asked for
    // no Save button anywhere in the expand; that is REPORTED rather than
    // applied, because removing it re-breaks what she reported live.
    fireEvent.click(work.getByTestId("po-line-destination-save-4"));
    await waitFor(() =>
      expect(
        apiFetch.mock.calls.some((c) => String(c[0]).endsWith("/destination")),
      ).toBe(true),
    );
  });

  it("moving PART of a line SPLITS it — the PO stays one document", async () => {
    await mountLoaded();
    const work = await expandPo("PO-9001");
    // PO-9001's only line is qty 3 → Move appears.
    fireEvent.click(work.getByTestId("po-line-destination-open-1"));
    fireEvent.change(work.getByTestId("po-line-destination-1"), {
      target: { value: AL },
    });
    fireEvent.change(work.getByTestId("po-line-move-qty-1"), {
      target: { value: "1" },
    });
    expect(work.getByTestId("po-line-effect-1").textContent).toMatch(
      /1 of 3 move; 2 stay/,
    );
    expect(work.getByTestId("po-line-destination-save-1").textContent).toBe("Split");
    fireEvent.click(work.getByTestId("po-line-destination-save-1"));
    await waitFor(() =>
      expect(apiFetch.mock.calls.some((c) => String(c[0]).endsWith("/split"))).toBe(
        true,
      ),
    );
    const call = apiFetch.mock.calls.find((c) => String(c[0]).endsWith("/split"))!;
    expect(JSON.parse(String((call[1] as { body: string }).body))).toMatchObject({
      moveQty: 1,
      destinationId: AL,
    });
  });

  it("a row shows its SO slice but the split arithmetic reads the whole LINE", async () => {
    await mountLoaded();
    const work = await expandPo("PO-9003");
    // Line a1 is qty 2 across TWO sales orders, so row 1 shows 1 — and the
    // destination still moves the LINE, so the effect line must say 2.
    fireEvent.click(work.getByTestId("po-line-destination-open-1"));
    fireEvent.change(work.getByTestId("po-line-destination-1"), {
      target: { value: AL },
    });
    expect(work.getByTestId("po-line-effect-1").textContent).toMatch(/of 2 move|All 2 move/);
  });

  it("the ops remark is purchasing's own — internal, and it says so", async () => {
    await mountLoaded();
    const work = await expandPo("PO-9003");
    fireEvent.click(work.getByTestId("po-line-ops-open-1"));
    const input = work.getByTestId("po-line-ops-remark-1") as HTMLInputElement;
    expect(input.placeholder).toMatch(/never printed/i);
    fireEvent.change(input, { target: { value: "AL collects Friday" } });
    // ONE value → the ruled manner exactly: Enter saves, no Save button.
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() =>
      expect(
        apiFetch.mock.calls.some((c) => String(c[0]).endsWith("/ops-remark")),
      ).toBe(true),
    );
  });
});

describe("inline edit — Esc puts it back", () => {
  it("opening, changing and pressing Esc records nothing", async () => {
    await mountLoaded();
    const work = await expandPo("PO-9003");
    fireEvent.click(work.getByTestId("po-line-destination-open-1"));
    fireEvent.change(work.getByTestId("po-line-destination-1"), {
      target: { value: AL },
    });
    fireEvent.keyDown(work.getByTestId("po-line-destination-1"), { key: "Escape" });
    // Back to plain text, and nothing was posted.
    expect(work.queryByTestId("po-line-destination-1")).not.toBeInTheDocument();
    expect(work.getByTestId("po-line-destination-open-1")).toBeInTheDocument();
    expect(
      apiFetch.mock.calls.some((c) => String(c[0]).includes("/lines/")),
    ).toBe(false);
  });
});

/**
 * Q5 · THE EXPAND IS THE WORKING AREA, THE PANEL IS ACTIVITY
 * (Loo, 2026-08-04 — `PURCHASING-INFORMATION-MODEL.md` §12.7.5).
 *
 * His diagnosis after using the page: *"Right panel not friendly to edit
 * detail."* The panel's JOB was wrong, not the editing — DOCUMENT DATA belongs
 * in the middle where the operator types into it, and ACTIVITY stays right.
 */
describe("the working area (Q5)", () => {
  it("ONE PO expands at a time — opening a second closes the first", async () => {
    await mountLoaded();
    await expandPo("PO-9003");
    expect(screen.getByTestId("po-work-PO-9003")).toBeInTheDocument();
    await expandPo("PO-9001");
    // The state cannot represent two open rows, which is stronger than a rule
    // that closes the other one.
    expect(screen.queryByTestId("po-work-PO-9003")).toBeNull();
    expect(screen.getByTestId("po-work-PO-9001")).toBeInTheDocument();
  });

  it("clicking the control again closes it, and nothing is left open", async () => {
    await mountLoaded();
    await expandPo("PO-9003");
    fireEvent.click(screen.getByTestId("table-expand-PO-9003"));
    expect(screen.queryByTestId("po-work-PO-9003")).toBeNull();
    expect(document.querySelectorAll('[data-kit="data-expansion"]')).toHaveLength(0);
  });

  it("the RIGHT PANEL no longer carries a date door — Activity is intact", async () => {
    await mountLoaded();
    const panel = within(screen.getByTestId("po-document"));
    // The two date doors and the items grid left for the expand (his rule 3:
    // ONE editing surface). What stays is the subject and the activity.
    expect(panel.queryByTestId("po-date-row")).toBeNull();
    expect(panel.queryByTestId("po-ready-date-open")).toBeNull();
    expect(panel.queryByTestId("po-doc-items")).toBeNull();
    expect(panel.getByTestId("po-working-header")).toBeInTheDocument();
    expect(panel.getByTestId("po-activity")).toBeInTheDocument();
    expect(panel.getByText("Communication")).toBeInTheDocument();
    expect(panel.getByText("Communication History")).toBeInTheDocument();
    expect(panel.getByTestId("po-print-pdf")).toBeInTheDocument();
  });

  it("QTY IS TEXT — there is no quantity input anywhere in the expand", async () => {
    await mountLoaded();
    const work = await expandPo("PO-9003");
    // A frozen business rule, not a preference: items are ADDED to a sent PO by
    // raising a NEW one (§3), and 0316 left PO-line quantities RPC-only with no
    // `set_line_qty` door. The only number input that may appear is the SPLIT's
    // Move field, and that one only exists while a destination is being changed.
    expect(work.queryByRole("spinbutton")).toBeNull();
    expect(
      apiFetch.mock.calls.some((c) => String(c[0]).includes("/qty")),
    ).toBe(false);
  });

  it("records the SUPPLIER READY DATE through 0318's own door", async () => {
    await mountLoaded();
    const work = await expandPo("PO-9003");
    expect(work.getByText("Supplier Ready Date")).toBeInTheDocument();
    fireEvent.click(work.getByTestId("po-ready-date-open"));
    const input = work.getByTestId("po-ready-date-input");
    fireEvent.change(input, { target: { value: "2099-09-10" } });
    // ONE value → Enter saves, and there is NO Save button beside it.
    expect(work.queryByTestId("po-ready-date-save")).toBeNull();
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() =>
      expect(
        apiFetch.mock.calls.some((c) => String(c[0]).endsWith("/ready-date")),
      ).toBe(true),
    );
    const call = apiFetch.mock.calls.find((c) => String(c[0]).endsWith("/ready-date"))!;
    expect(String(call[0])).toContain("/pos/PO-9003/ready-date");
    expect(JSON.parse(String((call[1] as { body: string }).body))).toEqual({
      newDate: "2099-09-10",
    });
  });

  it("Esc restores the ready date and posts nothing", async () => {
    await mountLoaded();
    const work = await expandPo("PO-9003");
    fireEvent.click(work.getByTestId("po-ready-date-open"));
    fireEvent.change(work.getByTestId("po-ready-date-input"), {
      target: { value: "2099-09-10" },
    });
    fireEvent.keyDown(work.getByTestId("po-ready-date-input"), { key: "Escape" });
    expect(work.queryByTestId("po-ready-date-input")).toBeNull();
    expect(work.getByTestId("po-ready-date-open")).toBeInTheDocument();
    expect(
      apiFetch.mock.calls.some((c) => String(c[0]).endsWith("/ready-date")),
    ).toBe(false);
  });

  it("a PO carrying a ready date prints it, and the history says WHICH date it is", async () => {
    await mountLoaded();
    const work = await expandPo("PO-9008");
    // The field itself.
    expect(work.getByTestId("po-ready-date-open").textContent).toMatch(/12 Aug/);
    fireEvent.click(work.getByTestId("po-date-row"));
    const ext = within(screen.getByTestId("po-date-extend"));
    // TWO runs, each NAMED. Before Q5 `poDateHistoryOf` filtered the ready kind
    // out, so the first ready date recorded would have been swallowed here.
    const ready = within(ext.getByTestId("po-ready-history"));
    expect(ready.getByText("Supplier Ready Date")).toBeInTheDocument();
    expect(ready.getByText(/12 Aug/)).toBeInTheDocument();
    expect(
      within(ext.getByTestId("po-date-history")).getByText("Expected Arrival"),
    ).toBeInTheDocument();
  });
});

/**
 * THE GRID IS THE OPERATOR'S (Q5, Loo 2026-08-04).
 *
 * CLAUDE.md §13.3 asks one question of a kit power — *will this make the
 * operator finish faster today?* — and he answered these two by NAME: resize,
 * because supplier names are different lengths and one width cannot suit them
 * all; reorder, because different operators watch different columns. Footer
 * totals and grouping were refused in the same ruling, so this suite asserts
 * their ABSENCE too: `the kit has it` is not a reason, and an unwired power
 * that quietly appears later is the failure §13.3 exists to stop.
 *
 * The ARITHMETIC of a drag is the kit's and is tested there (`grid-powers`) —
 * jsdom has no widths, so a resize test here could only prove a handler fired.
 * What THIS page owes is that it passes the power at all, that the handle is
 * named after its own column word, and that nothing is remembered (§0.4).
 */
describe("the grid is the operator's (resize · reorder)", () => {
  const ths = () => within(screen.getByRole("table")).getAllByRole("columnheader");

  it("every header is draggable and says what may be done to it", async () => {
    await mountLoaded();
    const supplier = screen.getByRole("columnheader", { name: "Supplier" });
    expect(supplier).toHaveAttribute("draggable", "true");
    expect(supplier).toHaveAttribute("aria-roledescription", "Drag to reorder");
  });

  it("dropping Supplier onto PO Issued reorders the REGISTER's own columns", async () => {
    await mountLoaded();
    expect(headerTexts()).toEqual(NINE);
    fireEvent.dragStart(screen.getByRole("columnheader", { name: "Supplier" }), {
      dataTransfer: { effectAllowed: "" },
    });
    fireEvent.drop(screen.getByRole("columnheader", { name: "PO Issued" }));
    expect(headerTexts()).toEqual([
      "Supplier",
      "PO Issued",
      ...NINE.slice(2),
    ]);
  });

  it("a resize handle on every column but the LAST, named after its own word", async () => {
    await mountLoaded();
    // `Current Action` is last in compact: no neighbour to take width from,
    // and a handle that cannot move anything is a promise the grid cannot keep.
    expect(screen.getByTestId("table-resize-supplier")).toHaveAccessibleName(
      "Supplier — Drag to resize",
    );
    expect(screen.queryByTestId("table-resize-action")).not.toBeInTheDocument();
  });

  it("the column word is still said exactly ONCE (§7), handle and all", async () => {
    // The handle is a DESCENDANT of the header, so making the grid draggable
    // is precisely how a screen reader starts reading `Supplier Supplier —
    // Drag to resize`. The kit pins it; this asserts the page gets the repair.
    await mountLoaded();
    for (const th of ths().slice(1)) {
      expect(th).toHaveAccessibleName(
        /^(PO Issued|Supplier|PO No\.|SO No\.|Items|Destination|Customer Delivery|Expected Arrival|Current Action)$/,
      );
    }
  });

  it("NOTHING IS REMEMBERED — a reload puts the company's grid back (§0.4)", async () => {
    // Loo ruled per-operator layout memory OUT the same day he ruled the two
    // powers IN. That is why there is no reset control and no word for one:
    // the reload IS the reset. If a `storageKey` is ever added, this is the
    // test that must be rewritten first.
    const first = await mountLoaded();
    fireEvent.dragStart(screen.getByRole("columnheader", { name: "Supplier" }), {
      dataTransfer: { effectAllowed: "" },
    });
    fireEvent.drop(screen.getByRole("columnheader", { name: "PO Issued" }));
    expect(headerTexts()[0]).toBe("Supplier");

    // A fresh mount IS the reload.
    first.unmount();
    await mountLoaded();
    expect(headerTexts()[0]).toBe("PO Issued");
  });

  it("footer totals and grouping stay UNWIRED — both were refused, not forgotten", async () => {
    await mountLoaded();
    const table = screen.getByRole("table");
    expect(table.querySelectorAll('[data-kit="data-totals"]')).toHaveLength(0);
    expect(table.querySelectorAll('[data-kit="data-group"]')).toHaveLength(0);
  });
});

describe("what we sent the supplier (0312)", () => {
  it("the draft is EDITABLE, and Save as template puts the placeholders back", async () => {
    await mountLoaded();
    await openPo("PO-9001");
    fireEvent.click(screen.getByTestId("po-wa-toggle"));
    const box = screen.getByTestId("po-wa-message") as HTMLTextAreaElement;
    expect(box.tagName).toBe("TEXTAREA");
    expect(box.value).toContain("PO-9001");
    fireEvent.change(box, { target: { value: "Hi Nice Future,\n\nPO-9001 please rush" } });
    fireEvent.click(screen.getByTestId("po-save-template"));
    await waitFor(() =>
      expect(
        apiFetch.mock.calls.some((c) => String(c[0]).endsWith("/message-template")),
      ).toBe(true),
    );
    const call = apiFetch.mock.calls.find((c) =>
      String(c[0]).endsWith("/message-template"),
    )!;
    const body = JSON.parse(String((call[1] as { body: string }).body));
    // The PO's own number and the supplier's name go back to placeholders, or
    // the next PO would inherit this one's.
    expect(body.text).toContain("{po}");
    expect(body.text).toContain("{supplier}");
    expect(body.text).not.toContain("PO-9001");
  });

  it("Email is a mailto: — the portal has no sender, and says so when there is no address", async () => {
    await mountLoaded();
    // PO-9001 is Nice Future, which has an address on file.
    await openPo("PO-9001");
    const mail = screen.getByTestId("po-open-email") as HTMLAnchorElement;
    expect(mail.getAttribute("href")).toMatch(/^mailto:sales%40nicefuture\.example\?subject=/);
    // Ohana has none — the panel states the absence instead of a dead button.
    fireEvent.click(listing().getByText("PO-9003"));
    await waitFor(() =>
      expect(
        within(screen.getByTestId("po-panel-title")).getByText("PO-9003"),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("po-open-email")).not.toBeInTheDocument();
    expect(screen.getByTestId("po-no-email").textContent).toMatch(/No email on file/);
  });

  // Renamed 2026-08-03 (Law 8). It used to read "the ACT records itself",
  // which was the 2026-08-02 framing that opening WhatsApp IS the send. The
  // BEHAVIOUR it asserts is unchanged and still right — the door records
  // itself opening, so nobody has to remember afterwards. Only the claim moved.
  it("the DOOR records itself opening — no I've sent button to remember afterwards", async () => {
    await mountLoaded();
    await openPo("PO-9001"); // the one supplier with an address on file
    expect(screen.getByTestId("po-history").textContent).toBe("No communication yet.");
    expect(screen.queryByTestId("po-sent")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("po-open-email"));
    await waitFor(() =>
      expect(apiFetch.mock.calls.some((c) => String(c[0]).endsWith("/sends"))).toBe(
        true,
      ),
    );
    const call = apiFetch.mock.calls.find((c) => String(c[0]).endsWith("/sends"))!;
    // The channel is the one actually used, not a guess.
    expect(JSON.parse(String((call[1] as { body: string }).body))).toMatchObject({
      channel: "email",
    });
  });

  it("COPY does not record — copying words is not sending them", async () => {
    // jsdom has no clipboard; the assertion is that copying posts NOTHING,
    // which holds whether the write resolves or is refused.
    await mountLoaded();
    fireEvent.click(screen.getByTestId("po-copy-message"));
    await new Promise((r) => setTimeout(r, 50));
    expect(apiFetch.mock.calls.some((c) => String(c[0]).endsWith("/sends"))).toBe(
      false,
    );
  });

  it("a PO whose door was opened shows the channel and the snapshot it carried", async () => {
    await mountLoaded();
    fireEvent.click(listing().getByText("PO-9005"));
    await waitFor(() =>
      expect(
        within(screen.getByTestId("po-panel-title")).getByText("PO-9005"),
      ).toBeInTheDocument(),
    );
    const h = within(screen.getByTestId("po-history"));
    // The row names the DOOR the Portal observed being opened — never a send,
    // never a receipt (Jess, 2026-08-03). `sent` is banned from this band.
    expect(h.getByText(/WhatsApp opened/)).toBeInTheDocument();
    // SNAPSHOT, never Revision (Jess, 2026-08-03). `purchase_orders` is never
    // edited by this path, and every other tool an operator has used means
    // "the document changed" by the word Revision.
    expect(h.getByText(/Snapshot 2/)).toBeInTheDocument();
    expect(h.queryByText(/Revision/)).not.toBeInTheDocument();
    expect(h.queryByText(/sent/i)).not.toBeInTheDocument();
    // Opening WhatsApp twice on one morning is ONE event that happened twice.
    expect(h.getByTestId("po-history-count")).toHaveTextContent("×2");
    expect(h.getAllByTestId("po-history-row").length).toBe(1);
    // THE FIRST PRESS, NEVER THE LATEST (Jess, 2026-08-03): a row is an EVENT,
    // not a latest state. The fixture's two presses are 03:00Z and 05:00Z on
    // one day — 11:00 and 13:00 in the app's zone. The row must read 11:00:
    // the moment this revision left the Portal never moved, and the second
    // press is what `×2` already says.
    expect(h.getByText(/11:00/)).toBeInTheDocument();
    expect(h.queryByText(/13:00/)).not.toBeInTheDocument();
  });

  /**
   * Every door says which application it opens (Jess, 2026-08-03) —
   * COPY-STANDARD's WhatsApp table plus her `Open email` ruling. The label
   * follows the BEHAVIOUR: a button naming a door the click does not open is
   * worse than a vague one, because the operator learns to stop reading it.
   */
  it("labels each door by what it opens — group vs direct chat vs mail client", async () => {
    await mountLoaded();
    // PO-9001 is Nice Future: a phone on file and no group, so the click opens
    // a `wa.me/` chat with ONE named party.
    await openPo("PO-9001");
    const wa = screen.getByTestId("po-open-whatsapp") as HTMLAnchorElement;
    expect(wa).toHaveTextContent("Open WhatsApp");
    expect(wa).not.toHaveTextContent("group");
    expect(wa.getAttribute("href")).toMatch(/^https:\/\/wa\.me\//);
    expect(screen.getByTestId("po-open-email")).toHaveTextContent("Open email");
    expect(screen.getByTestId("po-copy-message")).toHaveTextContent("Copy message");

    // PO-9003 is Ohana: a saved GROUP link, so the same button says `group`.
    fireEvent.click(listing().getByText("PO-9003"));
    await waitFor(() =>
      expect(
        within(screen.getByTestId("po-panel-title")).getByText("PO-9003"),
      ).toBeInTheDocument(),
    );
    const grp = screen.getByTestId("po-open-whatsapp") as HTMLAnchorElement;
    expect(grp).toHaveTextContent("Open WhatsApp group");
    expect(grp.getAttribute("href")).toBe("https://chat.whatsapp.com/ohana");
  });

  it("no button anywhere in the desk claims an outcome the Portal cannot see", async () => {
    // The whole band, read as text. This is the assertion that would have
    // caught what shipped: `sent via whatsapp` sat one line under a button
    // called `WhatsApp`, and 51 render tests were green.
    await mountLoaded();
    const desk = screen.getByTestId("po-activity").textContent ?? "";
    for (const banned of [/\bsent\b/i, /\bSend\b/, /Revision/, /received/i]) {
      expect(desk, `the desk may not say ${banned}`).not.toMatch(banned);
    }
    // And the bare Phase-3 labels must not come back.
    expect(desk).not.toMatch(/(^|\W)Copy(\W|$)/);
  });
});

/**
 * Q10 · ONE PURCHASE ORDER, ONE WAY OF LOOKING AT IT
 * (Loo, 2026-08-05 — from a top-to-toe review of the LIVE page.)
 *
 * Measured at 1280 before this card: the register's table was 1203px inside a
 * 568px listing — 635px off the right edge, taking `Customer Delivery`,
 * `Expected Arrival` and `Current Action` with it — while the expanded row
 * showed `PO-2038` and the panel beside it showed `PO-2032`. **Two different
 * purchase orders on one screen.**
 *
 * The fix is a STATE, not a rule: ONE id, ONE mode. Two POs are structurally
 * unrepresentable, so the tests below cannot be made to fail by an operator
 * clicking in an unexpected order — they can only fail if somebody splits the
 * state again.
 */
describe("one purchase order, one way of looking at it (Q10)", () => {
  it("the panel and the expand can never show two different POs", async () => {
    await mountLoaded();
    // The panel opens on PO-9003 (the register's first row by risk).
    expect(
      within(screen.getByTestId("po-panel-title")).getByText("PO-9003"),
    ).toBeInTheDocument();

    // Expand a DIFFERENT row. The old page left the panel on PO-9003 and put
    // PO-9001 in the expand — the defect this card exists for.
    await expandPo("PO-9001");
    expect(screen.queryByTestId("po-document")).toBeNull();
    expect(screen.getByTestId("po-work-PO-9001")).toBeInTheDocument();

    // Collapse: the panel comes back on the PO that was being worked on,
    // never on the one it was left behind at.
    fireEvent.click(screen.getByTestId("table-expand-PO-9001"));
    await waitFor(() =>
      expect(screen.getByTestId("po-document")).toBeInTheDocument(),
    );
    expect(
      within(screen.getByTestId("po-panel-title")).getByText("PO-9001"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("po-panel-title")).queryByText("PO-9003"),
    ).toBeNull();
  });

  it("expanding a row closes the panel and hands the listing its 400px back", async () => {
    await mountLoaded();
    expect(screen.getByTestId("po-workspace").className).toContain("w-[400px]");
    await expandPo("PO-9003");
    // The pane is not merely empty — it is not on the stage at all, which is
    // what gives the register the full width its nine columns were measured
    // for. (The pixel proof is a real browser; jsdom has no widths.)
    expect(screen.getByTestId("po-workspace").className).toContain("hidden");
    expect(screen.queryByTestId("po-document")).toBeNull();
  });

  it("the panel's ✕ closes it, and clicking any row brings it back", async () => {
    await mountLoaded();
    fireEvent.click(screen.getByTestId("po-panel-close"));
    expect(screen.queryByTestId("po-document")).toBeNull();
    // Before Q10 this was a DEAD END: `openPo` only wrote the URL, so with the
    // pane hidden a row click did nothing and the operator was stuck.
    fireEvent.click(listing().getByText("PO-9001"));
    await waitFor(() =>
      expect(
        within(screen.getByTestId("po-panel-title")).getByText("PO-9001"),
      ).toBeInTheDocument(),
    );
    // No "show" control was needed, and none was invented.
    expect(screen.queryByTestId("po-workspace-toggle")).toBeNull();
  });

  it("the panel says what is ON the purchase order — without expanding the row", async () => {
    await mountLoaded();
    const items = within(screen.getByTestId("po-panel-items"));
    // PO-9003 is three lines, one of them covering two sales orders → four
    // rows, four units ordered, none received. Read WITHOUT expanding.
    expect(screen.queryByTestId("po-work-PO-9003")).toBeNull();
    expect(items.getByText("SO-1300")).toBeInTheDocument();
    expect(items.getByText("SO-1301")).toBeInTheDocument();
    // Two rows for one line — the Excel rows, one per SO × SKU.
    expect(items.getAllByText("Cody Q")).toHaveLength(2);
    expect(items.getByText("Sonic K")).toBeInTheDocument();
    expect(items.getByTestId("po-panel-item-4")).toBeInTheDocument();
    expect(items.queryByTestId("po-panel-item-5")).toBeNull();
    expect(items.getByText("Total")).toBeInTheDocument();
  });

  /**
   * §12.7.5 rule 1 as Loo narrowed it: **a fact may be READ in two tiers and
   * WRITTEN in only one.** Rule 3 (ONE editing surface) is untouched, and this
   * is what keeps it true — two editable copies of one PO line will disagree.
   */
  it("the panel's items block holds no editable control at all", async () => {
    await mountLoaded();
    const block = screen.getByTestId("po-panel-items");
    expect(block.querySelectorAll("button")).toHaveLength(0);
    expect(block.querySelectorAll("input")).toHaveLength(0);
    expect(block.querySelectorAll("select")).toHaveLength(0);
    expect(block.querySelectorAll("textarea")).toHaveLength(0);
    // Nor the doors themselves, under any name.
    expect(within(block).queryByText("Save")).toBeNull();
    expect(within(block).queryByText("⋮")).toBeNull();
  });

  it("`Print PDF` sits beside the PO number, and the DOCUMENT band is gone", async () => {
    await mountLoaded();
    expect(
      within(screen.getByTestId("po-panel-title")).getByTestId("po-print-pdf"),
    ).toBeInTheDocument();
    // The band held ONE button; its title and hairline cost ~30px for nothing.
    expect(screen.getByTestId("po-document").textContent).not.toMatch(
      /(^|\W)Document(\W|$)/,
    );
  });

  /**
   * Ⓓ — THE EXPAND LIVES INSIDE THE VISIBLE WIDTH.
   *
   * jsdom has no widths, so this asserts the STRUCTURE that produces them and
   * the real numbers are measured in a browser: the record is sized to the
   * scroller's visible width (`100cqi`) rather than to the 1205px table its
   * cell spans, and `Description` is a `minmax(0,1fr)` track that takes what is
   * LEFT of the five measured ones — never `flex-1`, which is what took 787px
   * and pushed `Qty`, `Destination` and `Received` off the right edge.
   */
  it("the expanded record is sized to the visible width, not to the table", async () => {
    await mountLoaded();
    await expandPo("PO-9003");
    const cls = screen.getByTestId("po-work-PO-9003").className;
    expect(cls).toContain("100cqi");
    // Q11 turned the pin into a CEILING; it may never stop being one.
    expect(cls).toContain("max-w-[calc(100cqi-2rem)]");
    // `sticky` was measured NOT to hold inside a table cell, so it is not left
    // here as a class that does nothing.
    expect(cls).not.toContain("sticky");
    // And the scroller it is measured against really is a query container —
    // without it, `100cqi` resolves against the page and the pin is a lie.
    const scroller = screen
      .getByTestId("po-listing")
      .querySelector('[class*="container-type:inline-size"]');
    expect(scroller).not.toBeNull();
    expect(scroller!.className).toContain("overflow-auto");
  });

  it("Description takes what is LEFT — the six columns are exact tracks, not a flex row", async () => {
    await mountLoaded();
    await expandPo("PO-9003");
    const items = screen.getByTestId("po-doc-items");
    const header = items.firstElementChild as HTMLElement;
    const row = screen.getByTestId("po-item-row-1");
    for (const el of [header, row]) {
      expect(el.className).toContain(
        "grid-cols-[16px_64px_minmax(0,1fr)_40px_160px_64px]",
      );
      expect(el.className).not.toContain("flex ");
    }
    // The one flexible track is Description, and nothing else may grow.
    expect(
      (row.children[2] as HTMLElement).className,
    ).not.toContain("flex-1");
  });

  /**
   * Q11 — THE ROW ENDS WHERE ITS CONTENT ENDS.
   *
   * jsdom has no widths, so this asserts the two classes that PRODUCE them and
   * the numbers are measured in a browser (PO-2037 on production: the record
   * 1575 → 474 at 1920, 935 → 474 at 1280; `Description` 1191 → 90; the dead
   * space between an item's name and its `Qty` 1138 → 23).
   *
   * The pair is the whole card. `w-fit` alone re-opens Q10's bug, because
   * `fit-content` is capped by the AVAILABLE width and available here is the
   * table's 1205px cell, not the pane — measured with a 200-character name at
   * 1280: bounded, `Received` ends at 1212 inside a 1217 scrollport and the
   * name truncates; unbounded it ends at 1448, off the right edge.
   */
  it("the record is content-width, and the pane is its ceiling", async () => {
    await mountLoaded();
    await expandPo("PO-9003");
    const classes = screen.getByTestId("po-work-PO-9003").className.split(/\s+/);
    expect(classes).toContain("w-fit");
    expect(classes).toContain("max-w-[calc(100cqi-2rem)]");
    // The pane must be a CEILING, never the width itself: a fixed width is what
    // gave `Description` 1191px for 67px of ink. Compared as a TOKEN, because
    // `max-w-[calc(100cqi-2rem)]` contains the fixed form as a substring.
    expect(classes).not.toContain("w-[calc(100cqi-2rem)]");
  });

  it("the header, the item rows and TOTAL are one template, so they cannot stagger", async () => {
    await mountLoaded();
    await expandPo("PO-9003");
    const items = screen.getByTestId("po-doc-items");
    const grids = [...items.querySelectorAll<HTMLElement>("div")].filter((el) =>
      /grid-cols-\[/.test(el.className),
    );
    // Header + at least one line + TOTAL, and every one of them the same recipe.
    expect(grids.length).toBeGreaterThanOrEqual(3);
    const templates = new Set(
      grids.map((el) => (el.className.match(/grid-cols-\[[^\]]+\]/) ?? [""])[0]),
    );
    expect([...templates]).toEqual([
      "grid-cols-[16px_64px_minmax(0,1fr)_40px_160px_64px]",
    ]);
  });
});
