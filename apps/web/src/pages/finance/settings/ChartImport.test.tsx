import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ChartImport, { chartImportButton, chartImportDone, chartImportSummary } from "./ChartImport";

/** What the fake PDF reader returns: a made-up AutoCount printout. */
const pdf = vi.hoisted(() => ({
  items: [] as Array<{ str: string; transform: number[] }>,
  fail: false,
}));
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({
    promise: pdf.fail
      ? Promise.reject(new Error("Invalid PDF structure"))
      : Promise.resolve({
          numPages: 1,
          getPage: async () => ({ getTextContent: async () => ({ items: pdf.items }) }),
        }),
  }),
}));

const net = vi.hoisted(() => ({ calls: [] as Array<{ path: string; body: { rows: unknown[]; apply: boolean } }> }));
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (path: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    net.calls.push({ path, body });
    const rows = [
      { code: "300-0000", name: "TRADE DEBTORS", parentCode: "0000", status: "exists", reason: null, chartName: "TRADE DEBTORS" },
      { code: "900-A001", name: "ADVERTISING", parentCode: "6000", status: "create", reason: null, chartName: null },
      { code: "900-A002", name: "ADVERTISING - ONLINE", parentCode: "900-A001", status: "create", reason: null, chartName: null },
      { code: "310-9000", name: "NEW BANK", parentCode: "310-0000", status: "problem", reason: "310-9000 NEW BANK is a bank or cash account. Add it in Money accounts.", chartName: null },
    ];
    return { applied: body.apply, created: 2, existing: 1, problems: 1, rows };
  }),
}));

const at = (x: number, y: number, str: string) => ({ str, transform: [1, 0, 0, 1, x, y] });
const CHART = [
  at(161.9, 686, "Description"), at(482.6, 686, "Currency"),
  at(36, 662, "CURRENT"), at(86, 662, "ASSETS"),
  at(36, 644, "300-0000"), at(161.9, 644, "TRADE"), at(194.3, 644, "DEBTORS"), at(496, 644, "MYR"), at(555.3, 644, "SDC"),
  at(36, 620, "EXPENSES"),
  at(36, 600, "900-A001"), at(161.9, 600, "ADVERTISING"), at(496, 600, "MYR"),
  at(57.6, 588, "900-A002"), at(161.9, 588, "ADVERTISING"), at(220, 588, "-"), at(230, 588, "ONLINE"), at(496, 588, "MYR"),
];

function renderImport(onClose = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ChartImport onClose={onClose} />
    </QueryClientProvider>,
  );
  return onClose;
}

function choose() {
  const file = new File([new Uint8Array([37, 80, 68, 70])], "coa.pdf", { type: "application/pdf" });
  if (!file.arrayBuffer) Object.assign(file, { arrayBuffer: async () => new ArrayBuffer(4) });
  fireEvent.change(screen.getByTestId("chart-import-file"), { target: { files: [file] } });
}

describe("ChartImport (0655)", () => {
  beforeEach(() => {
    net.calls = [];
    pdf.items = CHART;
    pdf.fail = false;
  });

  it("names the gap until a PDF is chosen", () => {
    renderImport();
    const apply = screen.getByTestId("chart-import-apply");
    expect(apply).toBeDisabled();
    expect(apply).toHaveTextContent("Import: choose the PDF");
  });

  it("reads the PDF, asks the database first, and shows its answer with the problems on top", async () => {
    renderImport();
    choose();
    expect(await screen.findByTestId("chart-import-summary")).toHaveTextContent("2 new · 1 already in the chart · 1 not imported");
    expect(net.calls).toHaveLength(1);
    expect(net.calls[0]!.path).toBe("/api/finance/ledger/accounts/import");
    expect(net.calls[0]!.body.apply).toBe(false);
    expect(net.calls[0]!.body.rows).toEqual([
      { code: "300-0000", name: "TRADE DEBTORS", parentCode: null, section: "CURRENT ASSETS", special: "SDC" },
      { code: "900-A001", name: "ADVERTISING", parentCode: null, section: "EXPENSES", special: null },
      { code: "900-A002", name: "ADVERTISING - ONLINE", parentCode: "900-A001", section: "EXPENSES", special: null },
    ]);
    const table = screen.getByTestId("chart-import-rows");
    const text = within(table).getAllByRole("row").map((r) => r.textContent);
    expect(text[1]).toContain("Add it in Money accounts.");
    expect(text[2]).toContain("900-A001 ADVERTISING");
    expect(text[2]).toContain("New");
    expect(text[4]).toContain("Already in the chart");
  });

  it("makes the accounts with the same rows, then closes", async () => {
    const onClose = renderImport();
    choose();
    const apply = await screen.findByRole("button", { name: "Import 2 accounts" });
    fireEvent.click(apply);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(net.calls).toHaveLength(2);
    expect(net.calls[1]!.body.apply).toBe(true);
    expect(net.calls[1]!.body.rows).toEqual(net.calls[0]!.body.rows);
  });

  it("says when the PDF holds no account, and sends nothing", async () => {
    pdf.items = [at(36, 700, "Chart"), at(80, 700, "of"), at(100, 700, "Accounts")];
    renderImport();
    choose();
    expect(await screen.findByText("No account was found in this PDF. Choose AutoCount's chart of accounts.")).toBeInTheDocument();
    expect(net.calls).toHaveLength(0);
  });

  it("says when the file cannot be read as a PDF", async () => {
    pdf.fail = true;
    renderImport();
    choose();
    expect(await screen.findByText("This PDF could not be read. Choose AutoCount's chart of accounts.")).toBeInTheDocument();
    expect(net.calls).toHaveLength(0);
  });

  it("words the summary from the database's counts", () => {
    expect(chartImportSummary({ created: 214, existing: 37, problems: 0 })).toBe("214 new · 37 already in the chart · 0 not imported");
  });

  it("0656: the same PDF again fills the sections: the summary, the button and the toast say so", () => {
    expect(chartImportSummary({ created: 0, existing: 251, problems: 0, filled: 251 })).toBe(
      "0 new · 251 already in the chart · 0 not imported · 251 sections filled in",
    );
    expect(chartImportSummary({ created: 0, existing: 1, problems: 0, filled: 1 })).toBe(
      "0 new · 1 already in the chart · 0 not imported · 1 section filled in",
    );
    expect(chartImportButton(null)).toBe("Import: choose the PDF");
    expect(chartImportButton({ created: 2, filled: 5 })).toBe("Import 2 accounts");
    expect(chartImportButton({ created: 0, filled: 251 })).toBe("Fill in 251 sections");
    expect(chartImportButton({ created: 0, filled: 0 })).toBe("Nothing new to import");
    expect(chartImportDone({ created: 0, filled: 251 })).toBe("251 sections filled in.");
    expect(chartImportDone({ created: 1, filled: 3 })).toBe("1 account added to the chart, 3 sections filled in.");
    expect(chartImportDone({ created: 210, filled: 0 })).toBe("210 accounts added to the chart.");
  });
});
