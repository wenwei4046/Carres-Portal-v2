import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { SkuImportRow, SkuImportResult } from "@carres/shared";
import { csvRecordToImportRow, hasPricingIntent } from "@carres/shared";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useImportSkus } from "@/lib/queries";
import { Modal } from "@/pages/operation/components/Modal";
import { downloadCsv, readFileToRecords } from "@/lib/sku-csv";
import { CATEGORY_LABEL } from "../components/atoms";

/**
 * Import SKUs — faithful port of the 2990s staged import: pick a CSV/XLSX file,
 * see a preview (valid rows + per-row skip reasons) and only WRITE on an explicit
 * Confirm (no naked writes). The mapping + validation is the shared
 * csvRecordToImportRow; the server re-validates + upserts (blank = preserve).
 *
 * Columns (case-insensitive): model, [model_key], category, variant,
 * [variant_kind], [price], [cost], [description], [pos_active], [supplier].
 */

type Stage = "pick" | "preview" | "result";

interface Skipped {
  line: number;
  reason: string;
}

const TEMPLATE =
  "model,model_key,category,variant,variant_kind,price,cost,description,pos_active,supplier\n" +
  "Booqit,booqit,sofa,1-SEATER,size,1899,,Compact 1 seater,yes,\n" +
  "2990 AKKA-FIRM MATT,,mattress,K,size,2990,,King mattress,yes,nice-future\n";

export default function ImportSkusDialog({ onClose }: { onClose: () => void }) {
  const isPrincipal = useAuth((s) => s.role) === "principal";
  const importSkus = useImportSkus();
  const fileInput = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<Stage>("pick");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<SkuImportRow[]>([]);
  const [skipped, setSkipped] = useState<Skipped[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<SkuImportResult | null>(null);

  const pricingIntent = useMemo(() => hasPricingIntent(rows), [rows]);
  const pricingBlocked = pricingIntent && !isPrincipal;

  async function onFile(file: File) {
    setParseError(null);
    try {
      const records = await readFileToRecords(file);
      if (records.length === 0) {
        setParseError("That file has no data rows. Need a header row + at least one SKU row.");
        return;
      }
      const valid: SkuImportRow[] = [];
      const skips: Skipped[] = [];
      records.forEach((rec, i) => {
        const mapped = csvRecordToImportRow(rec);
        if (mapped.ok) valid.push(mapped.row);
        else skips.push({ line: i + 2, reason: mapped.reason }); // +2: header is line 1
      });
      setRows(valid);
      setSkipped(skips);
      setFileName(file.name);
      setStage("preview");
    } catch (e) {
      setParseError(e instanceof Error ? `Could not read the file: ${e.message}` : "Could not read the file.");
    }
  }

  async function confirm() {
    if (rows.length === 0 || pricingBlocked) return;
    try {
      const res = await importSkus.mutateAsync(rows);
      setResult(res);
      setStage("result");
      if (res.failed === 0) toast.success(`Imported ${res.upserted} SKU${res.upserted === 1 ? "" : "s"}`);
      else toast.warning(`${res.upserted} imported · ${res.failed} failed`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Import failed");
    }
  }

  return (
    <Modal title="Import SKUs" onClose={onClose}>
      {stage === "pick" && (
        <div className="flex flex-col gap-3">
          <p className="t-small text-base-600">
            Upload a <span className="font-semibold">CSV</span> or{" "}
            <span className="font-semibold">Excel (.xlsx)</span> file. Required columns:{" "}
            <span className="font-mono t-tiny">model</span>,{" "}
            <span className="font-mono t-tiny">category</span>,{" "}
            <span className="font-mono t-tiny">variant</span>. Optional:{" "}
            <span className="font-mono t-tiny">model_key, variant_kind, price, cost, description, pos_active, supplier</span>.
          </p>
          <p className="t-tiny text-base-500">
            Rows sharing a model become one product; each row is one SKU under it. A blank cell never
            overwrites existing data, so you can export → edit → re-import safely.
            {!isPrincipal && " Price / cost columns are Master-Admin only."}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-primary text-[12px]"
              onClick={() => fileInput.current?.click()}
              data-testid="import-pick-file"
            >
              Choose file…
            </button>
            <button
              type="button"
              className="btn-ghost text-[12px]"
              onClick={() => downloadCsv("carres-sku-import-template.csv", TEMPLATE)}
              data-testid="import-template"
            >
              Download template
            </button>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            data-testid="import-file-input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
              e.target.value = ""; // allow re-pick of the same file
            }}
          />
          {parseError && <p className="t-small text-red-600" data-testid="import-parse-error">{parseError}</p>}
        </div>
      )}

      {stage === "preview" && (
        <div className="flex flex-col gap-3">
          <div className="t-small text-base-700">
            <span className="font-mono t-tiny">{fileName}</span> ·{" "}
            <span className="font-semibold text-base-900" data-testid="import-ready-count">{rows.length}</span> ready
            {skipped.length > 0 && (
              <>
                {" "}·{" "}
                <span className="font-semibold text-amber-600" data-testid="import-skipped-count">{skipped.length}</span> skipped
              </>
            )}
          </div>

          {pricingBlocked && (
            <div className="rounded-[4px] border border-amber-300 bg-amber-50 px-3 py-2" data-testid="import-pricing-blocked">
              <div className="t-small font-semibold text-amber-800">This file sets prices</div>
              <div className="t-tiny text-amber-700 mt-0.5">
                Only the principal (Master Admin) can import price / cost. Remove those columns, or ask
                the principal to run this import.
              </div>
            </div>
          )}

          {rows.length > 0 && (
            <div className="border border-base-200 rounded-[4px] overflow-hidden">
              <div className="grid grid-cols-[1.4fr_90px_80px_90px] bg-base-50 t-micro text-base-500 px-2 py-1.5">
                <span>MODEL</span>
                <span>CATEGORY</span>
                <span>VARIANT</span>
                <span className="text-right">PRICE</span>
              </div>
              <div className="max-h-56 overflow-y-auto">
                {rows.slice(0, 50).map((r, i) => (
                  <div
                    key={`${r.modelKey}-${r.variant}-${i}`}
                    className="grid grid-cols-[1.4fr_90px_80px_90px] px-2 py-1 t-tiny border-t border-base-100 items-center"
                  >
                    <span className="truncate" title={r.model}>{r.model}</span>
                    <span className="text-base-500">{CATEGORY_LABEL[r.category]}</span>
                    <span className="font-mono">{r.variant}</span>
                    <span className="text-right tabular-nums">{r.price !== undefined ? r.price.toLocaleString("en-MY") : "—"}</span>
                  </div>
                ))}
              </div>
              {rows.length > 50 && (
                <div className="t-tiny text-base-400 px-2 py-1 border-t border-base-100">
                  + {rows.length - 50} more…
                </div>
              )}
            </div>
          )}

          {skipped.length > 0 && (
            <details className="t-tiny text-base-600">
              <summary className="cursor-pointer text-amber-700">{skipped.length} skipped row(s) — why</summary>
              <ul className="mt-1 space-y-0.5 max-h-32 overflow-y-auto">
                {skipped.slice(0, 50).map((s) => (
                  <li key={s.line}>
                    <span className="font-mono">line {s.line}</span>: {s.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div className="flex justify-end gap-2 mt-1">
            <button type="button" onClick={() => setStage("pick")} className="btn-ghost text-[12px]">
              Back
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={rows.length === 0 || pricingBlocked || importSkus.isPending}
              className="btn-primary text-[12px] disabled:opacity-40"
              data-testid="import-confirm"
            >
              {importSkus.isPending ? "Working…" : `Import ${rows.length} SKU${rows.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      )}

      {stage === "result" && result && (
        <div className="flex flex-col gap-3" data-testid="import-result">
          <div className="rounded-[4px] border border-base-200 bg-base-50 px-3 py-2.5">
            <div className="t-h4 text-base-900">{result.upserted} SKU(s) imported</div>
            <div className="t-small text-base-600 mt-0.5">
              {result.createdModels} new product{result.createdModels === 1 ? "" : "s"} created
              {result.failed > 0 && <> · <span className="text-red-600 font-semibold">{result.failed} failed</span></>}
            </div>
          </div>
          {result.failures.length > 0 && (
            <details className="t-tiny text-base-600" open>
              <summary className="cursor-pointer text-red-600">{result.failed} failed row(s)</summary>
              <ul className="mt-1 space-y-0.5 max-h-40 overflow-y-auto">
                {result.failures.map((f) => (
                  <li key={`${f.row}-${f.key}`}>
                    <span className="font-mono">row {f.row}</span>{" "}
                    <span className="font-mono text-base-500">{f.key}</span>: {f.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className="flex justify-end">
            <button type="button" className="btn-primary text-[12px]" onClick={onClose} data-testid="import-done">
              Done
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
