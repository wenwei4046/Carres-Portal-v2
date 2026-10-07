/**
 * Finance Settings → Chart of accounts → Import from AutoCount (0655).
 *
 * Chew prints the chart of accounts in AutoCount as a PDF and chooses it here.
 * The PDF is read in the browser (pdf.js, already in the app for previews):
 * its text goes through `readAutocountChart`, which finds each account, its
 * name, its section and the account it is printed under. The file never
 * leaves the browser; only the rows go to `gl_chart_import`.
 *
 * TWO CALLS, ONE ANSWER. The first asks the database what the import WOULD do
 * (apply false), and the screen prints that answer as it came back: new,
 * already in the chart, or not imported and why. Only the second call (apply
 * true) writes, and it sends the same rows, so what is made is what was shown.
 * The screen never decides a row itself: the database is the one place that
 * says where an account goes.
 *
 * An account already in the chart is never renamed, moved or retired here;
 * the chart screen does that, one account at a time.
 */
import { useRef, useState } from "react";
import { toast } from "sonner";
import { readAutocountChart, type ChartImportRow, type ChartPdfItem } from "@carres/shared/finance-chart-import";
import type { LedgerChartImportResult, LedgerChartImportRow } from "@carres/shared";
import Button from "@/components/kit/Button";
import Modal from "@/components/kit/Modal";
import DataTable, { type Column } from "@/components/kit/DataTable";
import { FieldError } from "@/components/kit/FieldFrame";
import { useImportChart } from "./api";

/** Every piece of text on every page, with where it sits. */
async function pdfItems(file: File): Promise<ChartPdfItem[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const items: ChartPdfItem[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const text = await page.getTextContent();
    for (const it of text.items) {
      if ("str" in it && typeof it.str === "string") {
        items.push({ page: p, x: it.transform[4] as number, y: it.transform[5] as number, str: it.str });
      }
    }
  }
  return items;
}

/** Problems first, then the new accounts, then what is already there. */
const ORDER: Record<LedgerChartImportRow["status"], number> = { problem: 0, create: 1, exists: 2 };

// PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md, Finance (Chew), 0655).
const WHAT_HAPPENS: Record<LedgerChartImportRow["status"], string> = {
  create: "New",
  exists: "Already in the chart",
  problem: "Not imported",
};

type ShownRow = LedgerChartImportRow & { at: number };

const COLUMNS: readonly Column<ShownRow>[] = [
  { key: "account", label: "Account", width: "45%", cell: (r) => `${r.code} ${r.chartName ?? r.name}` },
  { key: "under", label: "Under", width: "15%", cell: (r) => r.parentCode ?? "" },
  { key: "what", label: "What happens", width: "40%", cell: (r) => (r.status === "problem" && r.reason ? r.reason : WHAT_HAPPENS[r.status]) },
];

export function chartImportSummary(a: Pick<LedgerChartImportResult, "created" | "existing" | "problems">): string {
  return `${a.created} new · ${a.existing} already in the chart · ${a.problems} not imported`;
}

export default function ChartImport({ onClose }: { onClose: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const importChart = useImportChart();
  const [reading, setReading] = useState(false);
  const [rows, setRows] = useState<ChartImportRow[] | null>(null);
  const [readProblems, setReadProblems] = useState<string[]>([]);
  const [preview, setPreview] = useState<LedgerChartImportResult | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  const pick = async (list: FileList | null) => {
    const file = list?.[0];
    if (input.current) input.current.value = "";
    if (!file) return;
    setRefusal(null);
    setPreview(null);
    setRows(null);
    setReading(true);
    try {
      let read: ReturnType<typeof readAutocountChart>;
      try {
        read = readAutocountChart(await pdfItems(file));
      } catch {
        setRefusal("This PDF could not be read. Choose AutoCount's chart of accounts.");
        return;
      }
      if (read.rows.length === 0) {
        setRefusal("No account was found in this PDF. Choose AutoCount's chart of accounts.");
        return;
      }
      setReadProblems(read.problems);
      setRows(read.rows);
      try {
        setPreview(await importChart.mutateAsync({ rows: read.rows, apply: false }));
      } catch (e) {
        setRefusal((e as Error).message);
      }
    } finally {
      setReading(false);
    }
  };

  const apply = () => {
    if (!rows) return;
    setRefusal(null);
    importChart.mutate(
      { rows, apply: true },
      {
        onSuccess: (done) => {
          toast.success(`${done.created} ${done.created === 1 ? "account" : "accounts"} added to the chart.`);
          onClose();
        },
        onError: (e) => setRefusal(e.message),
      },
    );
  };

  const toMake = preview?.created ?? 0;
  const shown: ShownRow[] = preview
    ? preview.rows.map((r, at) => ({ ...r, at })).sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.at - b.at)
    : [];

  return (
    <Modal
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title="Import from AutoCount"
      description="AutoCount's printed chart of accounts, as a PDF."
      width="wide"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            data-testid="chart-import-apply"
            loading={importChart.isPending && !reading}
            disabled={!preview || toMake === 0 || reading}
            onClick={apply}
          >
            {!preview ? "Import: choose the PDF" : toMake === 0 ? "Nothing new to import" : `Import ${toMake} ${toMake === 1 ? "account" : "accounts"}`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3" data-testid="chart-import">
        <div>
          <input
            ref={input}
            type="file"
            hidden
            accept="application/pdf,.pdf"
            aria-label="Choose the PDF"
            data-testid="chart-import-file"
            onChange={(e) => void pick(e.target.files)}
          />
          <Button icon="attach" loading={reading} onClick={() => input.current?.click()}>
            {reading ? "Reading…" : preview ? "Choose another PDF" : "Choose the PDF"}
          </Button>
        </div>
        {refusal && <FieldError>{refusal}</FieldError>}
        {readProblems.map((p) => (
          <FieldError key={p}>{p}</FieldError>
        ))}
        {preview && (
          <>
            <p className="text-body text-kit-slate-11" data-testid="chart-import-summary">
              {chartImportSummary(preview)}
            </p>
            <DataTable
              label="Accounts in the PDF"
              testId="chart-import-rows"
              rows={shown}
              columns={COLUMNS}
              rowId={(r) => String(r.at)}
              empty="No account was found in this PDF."
            />
          </>
        )}
      </div>
    </Modal>
  );
}
