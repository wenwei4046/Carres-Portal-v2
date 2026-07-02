import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  masterRecordToStockRow,
  type StockEtaImportRow,
  type StockEtaImportResult,
} from "@carres/shared";
import { ApiError } from "@/lib/api";
import { useImportStockEta } from "@/lib/queries";
import { Modal } from "./Modal";

/**
 * Import stock ETA — fill each order line's Stock ETA from Jess's Master "Ops"
 * sheet (col AA Stock ETA + col Z Stock Status). AutoCount orders never carried
 * these, so the order detail's Stock ETA box was blank. Pick the .xlsx → the
 * dialog reads the "Ops" sheet, keeps date cells as raw serials (so no locale
 * guessing), then dry-runs the server match so you SEE how many rows join to a
 * portal order before writing. Confirm → the ETAs merge into each order.
 *
 * Join key = PO (order_lines.source_po) + product name (fuzzy). Received / blank
 * rows are skipped here (no ETA to write).
 */

type Stage = "pick" | "preview" | "result";

async function readMasterOpsRows(file: File): Promise<StockEtaImportRow[]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const name = wb.SheetNames.find((n) => /ops/i.test(n)) ?? wb.SheetNames[0];
  const sheet = name ? wb.Sheets[name] : undefined;
  if (!sheet) return [];
  // raw:true keeps a date cell as its Excel serial number (parseEtaCell converts
  // it) instead of a locale-formatted string we'd have to re-parse.
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: "",
  });
  const header = (Array.isArray(aoa[0]) ? aoa[0] : []).map((h) => String(h ?? "").trim());
  const rows: StockEtaImportRow[] = [];
  for (let r = 1; r < aoa.length; r++) {
    const cells = aoa[r];
    if (!Array.isArray(cells)) continue;
    const rec: Record<string, string | number> = {};
    for (let c = 0; c < header.length; c++) {
      const key = header[c];
      if (!key) continue;
      const v = cells[c];
      rec[key] = typeof v === "number" ? v : String(v ?? "");
    }
    const mapped = masterRecordToStockRow(rec);
    if (mapped.ok) rows.push(mapped.row);
  }
  return rows;
}

export default function ImportStockEtaDialog({ onClose }: { onClose: () => void }) {
  const importEta = useImportStockEta();
  const fileInput = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<Stage>("pick");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<StockEtaImportRow[]>([]);
  const [preview, setPreview] = useState<StockEtaImportResult | null>(null);
  const [result, setResult] = useState<StockEtaImportResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  async function onFile(file: File) {
    setParseError(null);
    try {
      const parsed = await readMasterOpsRows(file);
      if (parsed.length === 0) {
        setParseError(
          "No rows with a Stock ETA found. The sheet needs a PO, Item Detail, and Stock ETA per row.",
        );
        return;
      }
      setRows(parsed);
      setFileName(file.name);
      // Dry-run so the operator sees the match rate before committing.
      const dry = await importEta.mutateAsync({ rows: parsed, dryRun: true });
      setPreview(dry);
      setStage("preview");
    } catch (e) {
      setParseError(
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? `Could not read the file: ${e.message}`
            : "Could not read the file.",
      );
    }
  }

  async function confirm() {
    if (rows.length === 0) return;
    try {
      const res = await importEta.mutateAsync({ rows });
      setResult(res);
      setStage("result");
      toast.success(
        `Set Stock ETA on ${res.written} line${res.written === 1 ? "" : "s"} across ${res.orders} order${res.orders === 1 ? "" : "s"}`,
      );
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Import failed");
    }
  }

  return (
    <Modal title="Import stock ETA" onClose={onClose}>
      {stage === "pick" && (
        <div className="flex flex-col gap-3">
          <p className="t-small text-base-600">
            Upload your <span className="font-semibold">Master</span> file (.xlsx). We read the{" "}
            <span className="font-mono t-tiny">Ops</span> sheet and fill each order line's{" "}
            <span className="font-semibold">Stock ETA</span> from the{" "}
            <span className="font-mono t-tiny">Stock ETA</span> column, matched to the order by{" "}
            <span className="font-mono t-tiny">PO</span> + item name.
          </p>
          <p className="t-tiny text-base-500">
            Received / blank rows are skipped (nothing to schedule). You'll see how many rows match
            before anything is written.
          </p>
          <div>
            <button
              type="button"
              className="btn-primary text-[12px]"
              onClick={() => fileInput.current?.click()}
              data-testid="eta-import-pick"
            >
              Choose Master file…
            </button>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            data-testid="eta-import-file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
              e.target.value = "";
            }}
          />
          {importEta.isPending && <p className="t-tiny text-base-500">Reading + matching…</p>}
          {parseError && (
            <p className="t-small text-red-600" data-testid="eta-import-error">
              {parseError}
            </p>
          )}
        </div>
      )}

      {stage === "preview" && preview && (
        <div className="flex flex-col gap-3">
          <div className="t-small text-base-700">
            <span className="font-mono t-tiny">{fileName}</span> ·{" "}
            <span className="font-semibold text-base-900">{rows.length}</span> rows with an ETA
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-[6px] bg-base-50 px-3 py-2">
              <div className="t-h4 text-green-700" data-testid="eta-preview-matched">
                {preview.matched}
              </div>
              <div className="t-micro text-base-500">will match</div>
            </div>
            <div className="rounded-[6px] bg-base-50 px-3 py-2">
              <div className="t-h4 text-base-900">{preview.orders}</div>
              <div className="t-micro text-base-500">orders</div>
            </div>
            <div className="rounded-[6px] bg-base-50 px-3 py-2">
              <div
                className={`t-h4 ${preview.unmatched > 0 ? "text-amber-600" : "text-base-400"}`}
                data-testid="eta-preview-unmatched"
              >
                {preview.unmatched}
              </div>
              <div className="t-micro text-base-500">unmatched</div>
            </div>
          </div>

          {preview.sampleUnmatched.length > 0 && (
            <details className="t-tiny text-base-600">
              <summary className="cursor-pointer text-amber-700">
                {preview.unmatched} unmatched — why (first {preview.sampleUnmatched.length})
              </summary>
              <ul className="mt-1 space-y-0.5 max-h-40 overflow-y-auto">
                {preview.sampleUnmatched.map((u, i) => (
                  <li key={`${u.po}-${i}`}>
                    <span className="font-mono">{u.po}</span>{" "}
                    <span className="text-base-500">{u.sku}</span> — {u.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {preview.matched === 0 && (
            <div className="rounded-[4px] border border-amber-300 bg-amber-50 px-3 py-2 t-tiny text-amber-800">
              No rows matched an order. Check the PO column matches the orders' PO
              (order_lines.source_po).
            </div>
          )}

          <div className="flex justify-end gap-2 mt-1">
            <button type="button" onClick={() => setStage("pick")} className="btn-ghost text-[12px]">
              Back
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={preview.matched === 0 || importEta.isPending}
              className="btn-primary text-[12px] disabled:opacity-40"
              data-testid="eta-import-confirm"
            >
              {importEta.isPending ? "Working…" : `Set ETA on ${preview.matched} line${preview.matched === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      )}

      {stage === "result" && result && (
        <div className="flex flex-col gap-3" data-testid="eta-import-result">
          <div className="rounded-[4px] border border-base-200 bg-base-50 px-3 py-2.5">
            <div className="t-h4 text-base-900">{result.written} line(s) updated</div>
            <div className="t-small text-base-600 mt-0.5">
              across {result.orders} order{result.orders === 1 ? "" : "s"}
              {result.unmatched > 0 && (
                <>
                  {" "}· <span className="text-amber-600">{result.unmatched} unmatched</span>
                </>
              )}
            </div>
          </div>
          <div className="flex justify-end">
            <button type="button" className="btn-primary text-[12px]" onClick={onClose} data-testid="eta-import-done">
              Done
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
