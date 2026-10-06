import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PaymentRequestDocument, PaymentRequestRow } from "@carres/shared/payment-requests";
import { itSaysNoBannedWord } from "@/test/banned-words";
import PaymentRequests from "./PaymentRequests";
import RequestAccess from "../settings/RequestAccess";

/* Finance → Payment Requests (0645; Chew 2026-10-03). Every read and write
   goes through apiFetch; the mock answers by URL and records the writes.
   Names are invented. */
const api = vi.hoisted(() => ({
  routes: {} as Record<string, unknown>,
  calls: [] as Array<{ url: string; method: string; body: unknown }>,
  uploads: [] as string[],
}));
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method ?? "GET";
    api.calls.push({ url, method, body: init?.body ? JSON.parse(init.body) : undefined });
    if (url.endsWith("/files/sign")) return { bucket: "payment-request-files", token: "t", path: `${REQ}/f.pdf` };
    if (method !== "GET") return { id: REQ, ok: true };
    if (!(url in api.routes)) throw new Error(`unexpected read ${url}`);
    return api.routes[url];
  }),
  ApiError: class ApiError extends Error {},
}));
vi.mock("@/lib/supabase", () => ({
  supabase: { storage: { from: vi.fn(() => ({
    uploadToSignedUrl: vi.fn(async (path: string) => { api.uploads.push(path); return { error: null }; }),
  })) } },
}));
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => null }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const B = "/api/finance/payment-requests";
const REQ = "11111111-1111-4111-8111-111111111111";
const AINA = "22222222-2222-4222-8222-222222222222";

const row = (over: Partial<PaymentRequestRow>): PaymentRequestRow => ({
  id: REQ, request_no: "PRQ261003-4821", status: "submitted", requested_by: AINA, requested_by_name: "Aina",
  payee_name: "Bayview Properties", amount: "3500.00", pay_by: "2026-10-10", purpose: "October rent, PJ showroom",
  note: null, bank_name: "Maybank", bank_account_no: "514012345678", bank_account_holder: "Bayview Properties Sdn Bhd",
  bill_no: "BV-1007", bill_date: "2026-10-01", return_note: null, decided_at: null, decided_by_name: null,
  created_at: "2026-10-03T02:00:00Z", updated_at: "2026-10-03T02:00:00Z", file_count: 1, voucher: null, bill: null, ...over,
});
const docOf = (r: PaymentRequestRow, over: Partial<PaymentRequestDocument> = {}): PaymentRequestDocument => ({
  request: r,
  files: r.file_count ? [{ id: "f1", file_name: "bv-1007.pdf", mime_type: "application/pdf", size_bytes: 1024,
    storage_path: `${REQ}/f.pdf`, uploaded_at: "2026-10-03T02:01:00Z", uploaded_by_name: "Aina" }] : [],
  events: [{ action: "submitted", note: null, at: "2026-10-03T02:00:00Z", actor_name: "Aina" }],
  finance: false,
  can: { edit: false, withdraw: false, add_file: false, return: false, answer: false },
  ...over,
});

beforeEach(() => {
  api.calls.length = 0;
  api.uploads.length = 0;
  api.routes = {
    [`${B}/me`]: { may_request: true, finance: false, boss: false, may_grant: false },
    [B]: { rows: [row({})] },
  };
  localStorage.clear();
});

function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>;
}
function show(at: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[at]}>
        <Routes>
          <Route path="/finance/payment-requests/*" element={<><PaymentRequests /><Where /></>} />
          <Route path="/finance/payment-vouchers/new" element={<Where />} />
          <Route path="/finance/settings" element={<RequestAccess />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const writes = () => api.calls.filter((c) => c.method !== "GET");

describe("Payment Requests, as the person who asks", () => {
  it("lists their own requests with the stage, and offers New Payment Request", async () => {
    show("/finance/payment-requests");
    const r = await screen.findByTestId("payment-request-row-PRQ261003-4821");
    expect(r).toHaveTextContent("Bayview Properties");
    expect(r).toHaveTextContent("RM 3,500.00");
    expect(r).toHaveTextContent("With Finance");
    expect(api.calls.map((c) => c.url)).toContain(B); // their own, never ?all=1
    expect(screen.getByTestId("new-payment-request")).toHaveTextContent("New Payment Request");
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("someone no longer allowed still sees their requests, without the New button", async () => {
    api.routes[`${B}/me`] = { may_request: false, finance: false, boss: false, may_grant: false };
    show("/finance/payment-requests");
    await screen.findByTestId("payment-request-row-PRQ261003-4821");
    expect(screen.queryByTestId("new-payment-request")).not.toBeInTheDocument();
  });

  it("asks with the bill attached: the button names what is missing, then sends it and attaches the bill", async () => {
    show("/finance/payment-requests/new");
    const form = await screen.findByTestId("payment-request-form");
    const send = screen.getByTestId("send-payment-request");
    expect(send).toHaveTextContent("Say who is to be paid");
    fireEvent.change(within(form).getByLabelText("Pay to"), { target: { value: "Bayview Properties" } });
    fireEvent.change(within(form).getByLabelText("Amount (RM)"), { target: { value: "3500" } });
    fireEvent.change(within(form).getByLabelText("What it is for"), { target: { value: "October rent, PJ showroom" } });
    fireEvent.change(within(form).getByLabelText("Account No"), { target: { value: "514012345678" } });
    expect(send).toHaveTextContent("Attach the bill");
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByTestId("payment-request-form-input"),
      { target: { files: [new File(["%PDF"], "bv-1007.pdf", { type: "application/pdf" })] } });
    await waitFor(() => expect(send).toHaveTextContent("Send to Finance"));
    fireEvent.click(send);
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent(`/finance/payment-requests/${REQ}`));
    expect(writes()[0]).toMatchObject({ url: B, method: "POST", body: {
      payeeName: "Bayview Properties", amount: 3500, purpose: "October rent, PJ showroom", bankAccountNo: "514012345678", note: null,
    } });
    expect(writes().map((w) => w.url)).toEqual([B, `${B}/${REQ}/files/sign`, `${B}/${REQ}/files`]);
    expect(api.uploads).toEqual([`${REQ}/f.pdf`]);
  });

  it("a returned request shows why, and can be changed and withdrawn", async () => {
    api.routes[`${B}/${REQ}`] = docOf(row({ status: "returned", return_note: "Attach the official invoice", decided_by_name: "Chew" }),
      { can: { edit: true, withdraw: true, add_file: true, return: false, answer: false } });
    show(`/finance/payment-requests/${REQ}`);
    expect(await screen.findByTestId("payment-request-returned")).toHaveTextContent("Returned by Chew: Attach the official invoice");
    expect(screen.getByTestId("payment-request-stage")).toHaveTextContent("Returned");
    fireEvent.click(screen.getByRole("button", { name: "Withdraw request" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Withdraw request" }));
    await waitFor(() => expect(writes()).toEqual([{ url: `${B}/${REQ}/withdraw`, method: "POST", body: undefined }]));
  });

  it("an answered request reads its stage from the voucher, by number only", async () => {
    api.routes[`${B}/${REQ}`] = docOf(row({ status: "answered",
      voucher: { id: "v1", voucher_no: "PV261003-1111", status: "checked", voucher_date: "2026-10-03" } }));
    show(`/finance/payment-requests/${REQ}`);
    expect(await screen.findByTestId("payment-request-stage")).toHaveTextContent("Payment waiting for approval");
    expect(screen.getByText("PV261003-1111").tagName).not.toBe("A"); // the voucher page is Finance's
  });
});

describe("Payment Requests, as Finance", () => {
  beforeEach(() => {
    api.routes[`${B}/me`] = { may_request: true, finance: true, boss: false, may_grant: true };
    api.routes[`${B}?all=1`] = { rows: [
      row({}),
      row({ id: "x", request_no: "PRQ261001-0001", status: "answered", requested_by_name: "Boon",
        voucher: { id: "v9", voucher_no: "PV261001-9999", status: "approved", voucher_date: "2026-10-01" } }),
    ] };
  });

  it("opens on what waits for Finance; All requests shows every one", async () => {
    show("/finance/payment-requests");
    await screen.findByTestId("payment-request-row-PRQ261003-4821");
    expect(screen.queryByTestId("payment-request-row-PRQ261001-0001")).not.toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "All requests" }));
    fireEvent.click(screen.getByRole("tab", { name: "All requests" }));
    expect(await screen.findByTestId("payment-request-row-PRQ261001-0001")).toHaveTextContent("Paid");
  });

  it("answers with a payment voucher made from the request, or returns it with a note", async () => {
    api.routes[`${B}/${REQ}`] = docOf(row({}), { finance: true,
      can: { edit: false, withdraw: false, add_file: true, return: true, answer: true } });
    show(`/finance/payment-requests/${REQ}`);
    fireEvent.click(await screen.findByRole("button", { name: "Return request" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "Attach the official invoice" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Return request" }));
    await waitFor(() => expect(writes()).toEqual([
      { url: `${B}/${REQ}/return`, method: "POST", body: { note: "Attach the official invoice" } },
    ]));
    fireEvent.click(screen.getByRole("button", { name: "Make payment voucher" }));
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/finance/payment-vouchers/new"));
  });
});

describe("Who may ask, in Finance Settings", () => {
  const grants = { rows: [
    { user_id: AINA, name: "Aina", role: "operation", allowed: true, granted_at: "2026-10-03T02:00:00Z", granted_by_name: "Boss" },
    { user_id: "33333333-3333-4333-8333-333333333333", name: "Boon", role: "operation", allowed: false, granted_at: null, granted_by_name: null },
  ] };

  it("Finance ticks who may ask (0648), and so may the boss", async () => {
    for (const me of [
      { may_request: true, finance: true, boss: false, may_grant: true },
      { may_request: true, finance: true, boss: true, may_grant: true },
    ]) {
      api.routes[`${B}/me`] = me;
      api.routes[`${B}/grants`] = grants;
      api.calls = [];
      const { unmount } = show("/finance/settings");
      const boon = await screen.findByRole("checkbox", { name: "Boon may ask Finance to pay" });
      await waitFor(() => expect(boon).not.toBeDisabled());
      expect(screen.getByTestId("request-access")).not.toHaveTextContent("Only Finance and the boss change who may ask.");
      fireEvent.click(boon);
      await waitFor(() => expect(writes()).toEqual([
        { url: `${B}/grants/33333333-3333-4333-8333-333333333333`, method: "PUT", body: { allowed: true } },
      ]));
      unmount();
    }
  });

  it("a login that may not tick only reads", async () => {
    api.routes[`${B}/me`] = { may_request: true, finance: true, boss: false, may_grant: false };
    api.routes[`${B}/grants`] = grants;
    show("/finance/settings");
    expect(await screen.findByRole("checkbox", { name: "Aina may ask Finance to pay" })).toBeDisabled();
    expect(screen.getByTestId("request-access")).toHaveTextContent("Only Finance and the boss change who may ask.");
  });
});

itSaysNoBannedWord(join(dirname(fileURLToPath(import.meta.url)), "PaymentRequests.tsx"), { minStrings: 40, expectString: "Make payment voucher" });
