/**
 * Export Excel · Export PDF for a Finance statement: the table on screen, as
 * rows for a sheet (`build`). Off until the table has figures to write
 * (`build` is null). By month has no PDF.
 *
 * Moved out of FinanceReports so the Profit and Loss, the Balance Sheet and
 * Cash Flow (0638) press the same buttons; the behaviour is unchanged.
 */
import { useState } from "react";
import Button from "@/components/kit/Button";
import { FieldError } from "@/components/kit/FieldFrame";
import { writeStatementExcel, writeStatementPdf, type PackSheet } from "../month-end-pack";

export default function ExportStatement({ testId, word, build, pdf = true }: {
  testId: string;
  word: string;
  build: (() => { sheet: PackSheet; stem: string }) | null;
  pdf?: boolean;
}) {
  const [busy, setBusy] = useState<"excel" | "pdf" | null>(null);
  const [failed, setFailed] = useState(false);
  const ready = build !== null;
  const run = async (as: "excel" | "pdf") => {
    if (!build) return;
    setBusy(as);
    setFailed(false);
    try {
      const out = build();
      await (as === "excel" ? writeStatementExcel(out) : writeStatementPdf(out));
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  };
  return <div className="ml-auto flex flex-wrap items-end gap-3" data-testid={testId}>
    {failed && <FieldError>The {word} could not be exported. Try again.</FieldError>}
    <Button icon="download" loading={busy === "excel"} disabled={!ready || busy !== null} onClick={() => void run("excel")}>
      Export Excel
    </Button>
    {pdf && <Button icon="download" loading={busy === "pdf"} disabled={!ready || busy !== null} onClick={() => void run("pdf")}>
      Export PDF
    </Button>}
  </div>;
}
