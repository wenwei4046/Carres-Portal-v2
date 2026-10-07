import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PurchaseDemandRow, SoBatchOrderRow, SoBatchPurchaseResponse } from "@carres/shared";

const api = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async () => ({ ...await vi.importActual<typeof import("@/lib/api")>("@/lib/api"), apiFetch: api }));
vi.mock("@/lib/pdf/render", () => ({ renderPoPdf: async () => {
  const pdf = new Blob(["%PDF-1.4"], { type: "application/pdf" });
  Object.defineProperty(pdf, "arrayBuffer", { value: async () => new TextEncoder().encode("%PDF-1.4").buffer });
  return pdf;
} }));
vi.mock("@/components/kit/PdfPreview", () => ({ default: ({ title }: { title: string }) => <div>PDF preview {title}</div> }));
vi.mock("./SoBatchIssueWorkspace", () => ({ default: () => <div>50/50 review</div> }));
vi.mock("../components/EmbeddedSalesOrders", () => ({ default: ({ orderIds }: { orderIds: string[] }) => <div data-testid="embedded">{orderIds.join(",")}</div> }));

import { ApiError } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
import type { ReactElement, ReactNode } from "react";
import { BatchPanel, batchTasksOf } from "./BatchPanel";
import type { WorkPanelHost } from "../tasks/tasks-host";

const KEY = "2026-09-01T11:00";
const NF = "nf-id";
const KLANG = "11111111-1111-4111-8111-111111111111";

type Fake = { pos: Array<{ id: string; orderId: string; version: number; sends: Array<Record<string, unknown>> }>; lines: PurchaseDemandRow[];
  email: "ok" | "missing" | "unknown" | "failed"; emailPosts: number; confirmPosts: string[];
  attempts: Array<{ id: string; status: string; actorName: string; at: string; recipient: string; documents: Array<{ id: string; version: number }> }> };
let fake: Fake;

const leaf = (orderId: string, so: number, over: Partial<PurchaseDemandRow> = {}): PurchaseDemandRow => ({
  id: `build::${orderId}::l`, state: "safety_days_low", lineIds: [`${orderId}-l`], orderId, so, customer: `Customer ${so}`, customerDelivery: "2026-10-31",
  item: "B1201S", variant: "King", category: "mattress", skus: ["B1201S-K"], supplierId: NF, supplier: "Nice Future", qtyNeeded: 1, readyStock: 0,
  takenFromStock: 0, onPo: 0, fullyOnPo: false, poNumbers: [], toBuy: 1, goodsMustArrive: null, issueRef: { proposalKey: "nf::mattress", buildKey: orderId },
  action: null, parts: [{ sku: "B1201S-K", qty: 1, unitCost: null }], supplierKind: "own_logistics", ownerName: null, ownerDuty: null, poWindow: KEY, ...over,
} as PurchaseDemandRow);

function read(): SoBatchPurchaseResponse {
  const sent = (p: Fake["pos"][number]) => p.sends.some((s) => s.kind === "confirmed_sent" && s.po_version === p.version);
  const orders: SoBatchOrderRow[] = [...new Set([...fake.pos.map((p) => p.orderId), ...fake.lines.map((l) => l.orderId)])].map((orderId, i) => ({
    orderId, so: 1200 + i, customer: `Customer ${i}`, status: "blank", proceededAt: "2026-08-28T21:59:00+08:00", requestedDeliveryDate: null,
    deliveryCity: null, deliveryState: null, outstandingSuppliers: [], lines: [],
    pos: fake.pos.filter((p) => p.orderId === orderId).map((p) => ({ poId: p.id, status: "open" as const, supplierId: NF, supplierName: "Nice Future",
      destinationId: KLANG, officialDeliveryDate: null, sentCurrentVersion: sent(p), version: p.version, poWindow: KEY })),
  }));
  return { today: "2026-10-05", rows: fake.lines, registerRows: orders, destinations: [{ id: KLANG, name: "Carres Klang", isDefault: true, active: true }],
    defaultDestinationId: KLANG, currentPoDuty: null, actingPoDuty: null, poDutyNameUnavailable: false, poDutyUnavailable: false, mayIssue: true,
    procurementPartners: [], safetyDays: 14 };
}

beforeEach(() => {
  sessionStorage.clear();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:batch") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  fake = { pos: [{ id: "PO-20260903-4585", orderId: "o1", version: 1, sends: [] }, { id: "PO-20260903-7907", orderId: "o2", version: 1, sends: [] }],
    lines: [], email: "ok", emailPosts: 0, confirmPosts: [], attempts: [] };
  api.mockReset().mockImplementation(async (path: string, init?: { method?: string; body?: string }) => {
    const body = init?.body ? JSON.parse(init.body) : {};
    if (path.startsWith("/api/operation/purchase/demands")) return read();
    if (path === "/api/operation/pos/email-capability") return { configured: true };
    if (path === "/api/operation/pos/supplier-email") {
      fake.emailPosts += 1;
      if (fake.email === "unknown" || fake.email === "failed") {
        /* The server keeps who sent and when for an unknown or failed outcome. */
        fake.attempts.push({ id: body.attemptId, status: fake.email, actorName: "Shasha", at: "2026-10-05T06:12:00Z", recipient: body.recipient,
          documents: body.documents.map((d: { id: string; version: number }) => ({ id: d.id, version: d.version })) });
        if (fake.email === "failed") throw new ApiError(502, "failed", { code: "email_failed" });
        throw new ApiError(504, "timeout", {});
      }
      return { status: "dispatched", providerId: "p1", documents: body.documents.map((d: { id: string; version: number }, i: number) => {
        const recorded = !(fake.email === "missing" && i === body.documents.length - 1);
        if (recorded) fake.pos.find((p) => p.id === d.id)!.sends.push({ kind: "confirmed_sent", channel: "email", po_version: d.version, sent_at: "2026-10-05T06:12:00Z", note: `po-email/${body.attemptId}` });
        return { id: d.id, version: d.version, recorded };
      }) };
    }
    const id = decodeURIComponent(path.split("/")[4] ?? "");
    const po = fake.pos.find((p) => p.id === id);
    if (path.endsWith("/confirm-sent")) {
      fake.confirmPosts.push(id);
      po!.sends.push({ kind: "confirmed_sent", channel: body.channel, po_version: body.poVersion, sent_at: "2026-10-05T06:10:00Z", note: body.note });
      return { ok: true };
    }
    if (path.endsWith("/issue-context")) return { id, supplierId: NF, supplierName: "Nice Future", destinationId: KLANG, destination: "Carres Klang",
      whatsappGroupUrl: "https://chat.whatsapp.com/test", contactEmail: "orders@nicefuture.test", poSendChannel: null, contact: null };
    if (path.endsWith("/print-data")) return { po_id: id, po_number: id, version: po!.version, issue_date: "2026-09-03", supplier: { name: "Nice Future", address: null, contact: null },
      destination: { name: "Carres Klang", address: "Klang" }, delivery_instructions: null, eta_date: null, lines: [{ sku: "A", description: "A", qty: id.endsWith("7907") ? 10 : 1, unit: "unit" }], terms: null };
    if (path.endsWith("/sends")) return { sends: po?.sends ?? [] };
    if (path.endsWith("/email-attempts")) return { attempts: fake.attempts.filter((a) => a.documents.some((d) => d.id === id))
      .map((a) => ({ ...a, documents: a.documents.filter((d) => d.id === id) })) };
    return {};
  });
});
afterEach(cleanup);

const TASK = { id: `purchasing:${KEY}:purchasing.po_window`, timingBucket: "overdue" as const };
type Host = WorkPanelHost & { back: ReturnType<typeof vi.fn>; result: ReturnType<typeof vi.fn>; openReview: ReturnType<typeof vi.fn> };
function mount(): Host {
  const full = { back: vi.fn(), close: vi.fn(), result: vi.fn(), openReview: vi.fn(), simulated: true } as unknown as Host;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // A page that is not SO Batch Purchase: the panel needs nothing from it.
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/workspace"]}>
    <BatchPanel item={TASK} windowKey={KEY} host={full} />
  </MemoryRouter></QueryClientProvider>);
  return full;
}
const panel = () => screen.getByTestId(`batch-panel-${TASK.id}`);
const loaded = () => waitFor(() => expect(within(panel()).getByTestId("batch-send")).toBeInTheDocument());

describe("batchTasksOf — one task per supplier and batch, never the word round", () => {
  it("names POs to send, the one PO left, and lines still to buy", () => {
    expect(batchTasksOf(read()).map((t) => [t.action, t.reference])).toEqual([["Send 2 POs to Nice Future", "11:00 AM"]]);
    fake.pos[0]!.sends.push({ kind: "confirmed_sent", po_version: 1 });
    expect(batchTasksOf(read()).map((t) => [t.action, t.reference])).toEqual([["Send PO to Nice Future", "PO-260903-7907-V1"]]);
    fake.pos = []; fake.lines = [leaf("o9", 1368)];
    const tasks = batchTasksOf(read());
    expect(tasks.map((t) => [t.action, t.reference])).toEqual([["Issue PO to Nice Future", "SO-1368 · 1 item to buy"]]);
    expect(JSON.stringify(tasks)).not.toMatch(/round|PO window/i);
  });
});

describe("BatchPanel — one count with the Tasks row and the Work completion (Law D)", () => {
  /* Production acceptance 2026-10-06: the row said `Send 11 POs`, the panel
     listed 13 to send. A sent PO whose PDF cannot be built (no Deliver To
     address) fell back to "to send" in the panel only. */
  it("a PO the read marks sent stays sent even when its PDF cannot be built", async () => {
    fake.pos[0]!.sends.push({ kind: "confirmed_sent", channel: "whatsapp", po_version: 1, sent_at: "2026-10-05T06:10:00Z", note: null });
    const base = api.getMockImplementation()!;
    api.mockImplementation(async (path: string, init?: { method?: string; body?: string }) => {
      if (path.includes("4585") && path.endsWith("/print-data")) throw new ApiError(422, "destination_address_missing", { code: "destination_address_missing" });
      return base(path, init);
    });
    mount();
    await loaded();
    expect(within(panel()).getByText("1 PO to send · Sending not confirmed")).toBeInTheDocument();
    expect(within(panel()).queryByText(/2 POs to send/)).toBeNull();
  });
});

describe("BatchPanel — a PO belongs to its earliest window only (§5.6.1)", () => {
  /* Production acceptance 2026-10-06: the window-scoped read could not see an
     earlier window's stamp, so a PO already counted on 27 Jul was counted again
     on 1 Sep (row 11, panel 13). */
  it("a PO that served an earlier window is counted there, never again here", async () => {
    const base = api.getMockImplementation()!;
    api.mockImplementation(async (path: string, init?: { method?: string; body?: string }) => {
      if (path.startsWith("/api/operation/purchase/demands")) {
        const r = read();
        if (!path.includes("window=")) {
          const first = r.registerRows[0]!;
          r.registerRows.push({ ...first, orderId: "o0", so: 1100, pos: first.pos.map((p) => ({ ...p, poWindow: "2026-07-27T11:00" })) });
        }
        return r;
      }
      return base(path, init);
    });
    mount();
    await loaded();
    expect(within(panel()).getByText("1 PO to send · Sending not confirmed")).toBeInTheDocument();
  });
});

describe("BatchPanel — opened by window key from any page", () => {
  it("header is the supplier over the time and date; tabs open on SO Batch Purchase; every PO is ticked", async () => {
    mount();
    await loaded();
    const card = panel();
    expect(within(card).getByText("Nice Future")).toBeInTheDocument();
    /* The date through the one date home: the year only when it is not this year. */
    expect(within(card).getByText(`11:00 AM · ${fmtDate("2026-09-01")}`)).toBeInTheDocument();
    expect(within(card).getByText("Missed")).toBeInTheDocument();
    expect(card.textContent).not.toMatch(/round|PO window/i);
    expect(within(card).getByRole("button", { name: "SO Batch Purchase" })).toHaveAttribute("aria-current", "page");
    expect(within(card).getByRole("button", { name: "Info" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Sales Order" })).toBeInTheDocument();
    expect(within(card).getByText("Select all · 2 of 2 ticked")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Download PDFs (2)" })).toBeEnabled();
    expect(within(card).getByRole("button", { name: "Open WhatsApp group" })).toBeEnabled();
    expect(within(card).getByRole("button", { name: "PO sent to supplier (2)" })).toBeEnabled();
    expect(within(card).getByTestId("batch-send-hint")).toHaveTextContent(/^Send the PDF, then press PO sent to supplier\.$/);
    /* The four WhatsApp steps as plain numbered lines — no badge (Purchasing correction 2026-10-06). */
    const steps = within(card).getByTestId("batch-whatsapp-steps");
    expect(within(steps).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["1.Download PDFs (2)", "2.Copy message", "3.Open WhatsApp group"]);
    expect(within(card).getByTestId("batch-whatsapp-step-4")).toHaveTextContent(/^4\.PO sent to supplier \(2\)$/);
  });

  it("records only the ticked PO; the task stays open and the other stays to send", async () => {
    const host = mount();
    await loaded();
    fireEvent.click(within(panel()).getByLabelText("PO-260903-7907-V1"));
    expect(within(panel()).getByText("Select all · 1 of 2 ticked")).toBeInTheDocument();
    fireEvent.click(within(panel()).getByRole("button", { name: "PO sent to supplier (1)" }));
    const list = await screen.findByTestId("batch-record-list");
    expect(list).toHaveTextContent("PO-260903-4585-V1");
    expect(list).not.toHaveTextContent("7907");
    expect(list).toHaveTextContent("Not ticked: stays in this task.");
    fireEvent.click(screen.getByTestId("batch-record-confirm"));
    await waitFor(() => expect(within(panel()).getByTestId("batch-status")).toHaveTextContent("1 PO to send · Sending not confirmed"));
    expect(fake.confirmPosts).toEqual(["PO-20260903-4585"]);
    expect(within(panel()).getByTestId("batch-po-PO-20260903-4585")).toHaveTextContent("Sent · WhatsApp");
    // The module's own words; the task stays open while a PO is left.
    expect(host.result).toHaveBeenCalledWith("PO sent to supplier · Nice Future · 1 PO · WhatsApp · 1 still to send", { stay: true });
    expect(host.back).not.toHaveBeenCalled();
    expect(batchTasksOf(read())[0]).toMatchObject({ action: "Send PO to Nice Future", reference: "PO-260903-7907-V1" });
  });

  it("done: every PO recorded and nothing left to buy hands the result to the host, which returns to the list", async () => {
    const host = mount();
    await loaded();
    fireEvent.click(within(panel()).getByRole("button", { name: "PO sent to supplier (2)" }));
    fireEvent.click(await screen.findByTestId("batch-record-confirm"));
    await waitFor(() => expect(host.result).toHaveBeenCalledWith("PO sent to supplier · Nice Future · 2 POs · WhatsApp", { stay: false }));
    expect(fake.confirmPosts.sort()).toEqual(["PO-20260903-4585", "PO-20260903-7907"]);
  });

  it("the PDF preview keeps the ticks", async () => {
    mount();
    await loaded();
    fireEvent.click(within(panel()).getByLabelText("PO-260903-7907-V1"));
    fireEvent.click(within(panel()).getByRole("button", { name: "Open PDF PO-260903-4585" }));
    expect(await screen.findByText(/PDF preview/)).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByText(/PDF preview/)).not.toBeInTheDocument());
    expect(within(panel()).getByText("Select all · 1 of 2 ticked")).toBeInTheDocument();
  });

  it("Email: one record missing saves that record only — no second email", async () => {
    fake.email = "missing";
    mount();
    await loaded();
    fireEvent.mouseDown(within(panel()).getByRole("tab", { name: "Email" }));
    fireEvent.click(await within(panel()).findByTestId("batch-send-email"));
    const result = await within(panel()).findByTestId("batch-email-result");
    expect(result).toHaveTextContent("PO-260903-7907-V1 · Not confirmed · Try again");
    /* While a record is still missing, a second Email is impossible. */
    expect(within(panel()).getByTestId("batch-send-email")).toBeDisabled();
    fireEvent.click(within(result).getByRole("button", { name: "Save (1)" }));
    await waitFor(() => expect(fake.confirmPosts).toEqual(["PO-20260903-7907"]));
    expect(fake.emailPosts).toBe(1);
  });

  it("Email: an unknown outcome locks Send Email and offers the send record", async () => {
    fake.email = "unknown";
    mount();
    await loaded();
    fireEvent.mouseDown(within(panel()).getByRole("tab", { name: "Email" }));
    fireEvent.click(await within(panel()).findByTestId("batch-send-email"));
    const unknown = await within(panel()).findByTestId("batch-email-unknown");
    expect(unknown).toHaveTextContent("Sending not confirmed. We do not know if the email left.");
    expect(within(unknown).getByRole("button", { name: "Send Email" })).toBeDisabled();
    expect(within(unknown).getByRole("button", { name: "Open send record" })).toBeEnabled();
    /* Said once, in the box; no second error line repeats it. */
    await waitFor(() => expect(within(panel()).queryByText("Sending not confirmed")).toBeNull());
    expect(fake.emailPosts).toBe(1);
  });

  it("Email: an unknown or failed outcome keeps who sent it and when on the Timeline", async () => {
    for (const outcome of ["unknown", "failed"] as const) {
      cleanup(); sessionStorage.clear(); fake.attempts = []; fake.email = outcome;
      mount();
      await loaded();
      fireEvent.mouseDown(within(panel()).getByRole("tab", { name: "Email" }));
      fireEvent.click(await within(panel()).findByTestId("batch-send-email"));
      fireEvent.click(await within(panel()).findByRole("button", { name: "Show timeline" }));
      const event = await within(panel()).findByText("Email · Sending not confirmed");
      const item = event.closest("li")!;
      expect(within(item).getByLabelText("Recorded by Shasha")).toBeInTheDocument();
      expect(item.querySelector("time")?.getAttribute("datetime")).toBe("2026-10-05T06:12:00Z");
      expect(item).toHaveTextContent("5 Oct · 2:12 PMPO-260903-4585-V1 · PO-260903-7907-V1");
    }
  });

  it("nothing issued: buy first, Issue PO opens the 50/50 review, and the same task then sends the new PO", async () => {
    fake.pos = []; fake.lines = [leaf("o9", 1368)];
    const host = mount();
    await waitFor(() => expect(within(panel()).getByTestId("batch-status")).toHaveTextContent("Nothing issued yet · buy first"));
    expect(within(panel()).queryByRole("button", { name: /PO sent to supplier/ })).not.toBeInTheDocument();
    fireEvent.click(within(panel()).getByTestId("batch-issue-po"));
    expect(host.openReview).toHaveBeenCalledTimes(1);
    const close = vi.fn();
    const review = (host.openReview.mock.calls[0]![0] as (close: () => void) => ReactNode)(close) as ReactElement<{ documents: Array<{ supplierName: string }>; onIssued: (pos: unknown[]) => void }>;
    expect(review.props.documents).toHaveLength(1);
    expect(review.props.documents[0]!.supplierName).toBe("Nice Future");
    // SIMULATED issue: the PO now exists and the line is covered.
    fake.lines = []; fake.pos = [{ id: "PO-20261005-1104", orderId: "o9", version: 1, sends: [] }];
    review.props.onIssued([{ id: "PO-20261005-1104", supplierName: "Nice Future" }]);
    expect(close).toHaveBeenCalled();
    expect(host.result).toHaveBeenCalledWith("PO issued · Nice Future", { stay: true });
    await waitFor(() => expect(within(panel()).getByTestId("batch-status")).toHaveTextContent("1 PO to send · Sending not confirmed"));
    expect(within(panel()).getByLabelText("PO-261005-1104-V1")).toBeChecked();
    expect(host.back).not.toHaveBeenCalled();
  });

  it("Info states the task and the whole batch; Sales Order lists first", async () => {
    mount();
    await loaded();
    fireEvent.click(within(panel()).getByRole("button", { name: "Info" }));
    const info = within(panel()).getByTestId("batch-info");
    expect(info).toHaveTextContent("2 POs to Nice Future · 2 Sales Orders");
    expect(info).toHaveTextContent("2 POs · 1 supplier (Nice Future) · 0 SO still to buy");
    expect(info).toHaveTextContent("Both Nice Future POs are recorded as sent");
    expect(info).toHaveTextContent("Nothing is left to buy and every PO of every supplier is sent");
    fireEvent.click(within(panel()).getByRole("button", { name: "Sales Order" }));
    expect(within(panel()).getByTestId("batch-so-list")).toHaveTextContent("2 Sales Orders on these POs");
    fireEvent.click(within(panel()).getAllByRole("button", { name: /^Open SO-/ })[0]!);
    expect(within(panel()).getByTestId("embedded")).toHaveTextContent("o1");
  });

  it("a batch with two suppliers names both and sends one supplier at a time", async () => {
    fake.pos.push({ id: "PO-20260903-4316", orderId: "o3", version: 1, sends: [] });
    const base = api.getMockImplementation()!;
    api.mockImplementation(async (path: string, init?: { method?: string; body?: string }) => {
      const out = await base(path, init);
      if (path.startsWith("/api/operation/purchase/demands")) {
        for (const order of (out as SoBatchPurchaseResponse).registerRows) for (const po of order.pos) if (po.poId.endsWith("4316")) { po.supplierId = "oh-id"; po.supplierName = "Ohana"; }
      }
      if (path.includes("4316") && path.endsWith("/issue-context")) return { ...(out as object), supplierId: "oh-id", supplierName: "Ohana" };
      return out;
    });
    mount();
    await loaded();
    expect(within(panel()).getByText("Nice Future and Ohana")).toBeInTheDocument();
    expect(within(panel()).getByRole("combobox", { name: "Supplier" })).toHaveTextContent("Nice Future");
    expect(within(panel()).getByText("Select all · 2 of 2 ticked")).toBeInTheDocument();
    expect(within(panel()).queryByLabelText("PO-260903-4316-V1")).not.toBeInTheDocument();
  });
});
