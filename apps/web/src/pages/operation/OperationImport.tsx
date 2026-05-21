import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { parseCsv, listingRowToImportRow } from "@/lib/csv";
import { apiFetch } from "@/lib/api";
import { qk } from "@/lib/queries";
import type {
  AutocountImportInput,
  AutocountImportResponse,
} from "@carres/shared";

/**
 * Operation · AutoCount Import — Phase A step 4.
 *
 * Replaces the Google Sheet paste step. Ops exports the AutoCount listing
 * as CSV → drops it here → portal:
 *   1. parses the CSV in the browser (no xlsx lib — Loo Q5 = CSV)
 *   2. maps rows to the AutocountImportRow contract
 *   3. previews row count + a few sample rows
 *   4. on Submit, POSTs to /api/orders/import
 *   5. shows the per-order report (created / updated / skipped_locked /
 *      updated_items_locked / error) + unmatched-SKU list per order
 *
 * dealer_id is required by the schema; we auto-pick the first dealer in the
 * list (the Carres house entity) silently — no user-facing picker needed.
 */

export default function OperationImport() {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [csvText, setCsvText] = useState<string>("");
  const [parsedRows, setParsedRows] = useState<
    ReturnType<typeof listingRowToImportRow>[]
  >([]);
  const [parseErrors, setParseErrors] = useState<
    { row: number; col: number; message: string }[]
  >([]);
  const [fileName, setFileName] = useState<string>("");


  const usableRows = parsedRows.filter((r): r is NonNullable<typeof r> => r !== null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setCsvText(text);
      const parsed = parseCsv(text);
      const mapped = parsed.rows.map(listingRowToImportRow);
      setParsedRows(mapped);
      setParseErrors(parsed.errors);
    };
    reader.readAsText(f);
  }

  function clearFile() {
    setCsvText("");
    setParsedRows([]);
    setParseErrors([]);
    setFileName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const submitMut = useMutation<
    AutocountImportResponse,
    Error,
    AutocountImportInput
  >({
    mutationFn: (input) =>
      apiFetch<AutocountImportResponse>("/api/orders/import", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      // New orders → land in /operation/inbox; refresh that cache.
      qc.invalidateQueries({ queryKey: qk.operation.inbox() });
    },
  });

  function submit() {
    if (usableRows.length === 0) return;
    submitMut.mutate({
      sourceSystem: "autocount",
      rows: usableRows,
    });
  }

  const previewRows = usableRows.slice(0, 5);
  const skippedRowCount = parsedRows.length - usableRows.length;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wider text-base-500 mb-1">
          Operation · AutoCount
        </p>
        <h1 className="text-3xl font-semibold text-base-900">
          Import listing
        </h1>
        <p className="text-sm text-base-600 mt-2">
          Drop the AutoCount listing CSV here. The portal will create / update
          the orders, preserving anything you&apos;ve edited inside the portal
          since the last import.
        </p>
      </div>

      {/* Step 1: file pick */}
      <section className="rounded border border-base-200 bg-white p-6 mb-4">
        <h2 className="text-sm font-semibold text-base-900 mb-3">
          1. Pick the CSV file
        </h2>
        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={onFile}
            className="block text-sm text-base-700"
          />
          {fileName ? (
            <button
              type="button"
              className="rounded border border-base-300 px-3 py-1 text-xs text-base-600 hover:bg-base-100"
              onClick={clearFile}
            >
              Clear
            </button>
          ) : null}
        </div>
        {fileName ? (
          <p className="mt-2 text-xs text-base-500">Loaded: {fileName}</p>
        ) : null}
      </section>

      {/* Step 3: preview */}
      {csvText ? (
        <section className="rounded border border-base-200 bg-white p-6 mb-4">
          <h2 className="text-sm font-semibold text-base-900 mb-3">
            2. Preview
          </h2>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <Stat label="Rows in file" value={parsedRows.length} />
            <Stat
              label="Will be imported"
              value={usableRows.length}
              accent={usableRows.length > 0 ? "ok" : undefined}
            />
            <Stat
              label="Skipped (no Ref.)"
              value={skippedRowCount}
              accent={skippedRowCount > 0 ? "warn" : undefined}
            />
          </div>
          {parseErrors.length > 0 ? (
            <div className="mb-4 rounded border border-warning-200 bg-warning-50 p-3 text-xs text-warning-800">
              <div className="font-semibold mb-1">
                CSV parse warnings ({parseErrors.length})
              </div>
              <ul className="space-y-0.5">
                {parseErrors.slice(0, 5).map((e, i) => (
                  <li key={i}>
                    row {e.row}, col {e.col}: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {previewRows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-base-50 text-base-500">
                  <tr>
                    <th className="text-left px-2 py-1 font-medium">Ref.</th>
                    <th className="text-left px-2 py-1 font-medium">Item Group</th>
                    <th className="text-left px-2 py-1 font-medium">Qty</th>
                    <th className="text-left px-2 py-1 font-medium">Description</th>
                    <th className="text-left px-2 py-1 font-medium">PO #</th>
                    <th className="text-left px-2 py-1 font-medium">Customer</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((r, i) => (
                    <tr key={i} className="border-t border-base-200">
                      <td className="px-2 py-1 font-mono">{r.ref}</td>
                      <td className="px-2 py-1">{r.itemGroup}</td>
                      <td className="px-2 py-1">{r.qty}</td>
                      <td className="px-2 py-1 truncate max-w-xs">{r.detailDescription}</td>
                      <td className="px-2 py-1 font-mono text-base-600">{r.poDocNo ?? "—"}</td>
                      <td className="px-2 py-1">{r.debtorName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {usableRows.length > previewRows.length ? (
                <p className="mt-2 text-xs text-base-500">
                  …and {usableRows.length - previewRows.length} more rows.
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Step 4: submit */}
      {csvText ? (
        <section className="rounded border border-base-200 bg-white p-6 mb-4">
          <h2 className="text-sm font-semibold text-base-900 mb-3">
            3. Submit
          </h2>
          <button
            type="button"
            className="rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={usableRows.length === 0 || submitMut.isPending}
            onClick={submit}
          >
            {submitMut.isPending ? "Importing…" : `Import ${usableRows.length} rows`}
          </button>
        </section>
      ) : null}

      {/* Result */}
      {submitMut.isSuccess && submitMut.data ? (
        <section className="rounded border border-success-200 bg-success-50 p-6">
          <h2 className="text-sm font-semibold text-success-800 mb-3">
            Import complete
          </h2>
          <div className="grid grid-cols-4 gap-4 mb-4">
            <Stat label="Orders touched" value={submitMut.data.ordersTotal} />
            <Stat label="Created" value={submitMut.data.created} accent="ok" />
            <Stat label="Updated" value={submitMut.data.updated} />
            <Stat label="Skipped locked" value={submitMut.data.skippedLocked} />
          </div>
          {submitMut.data.errored > 0 ? (
            <div className="rounded border border-error-300 bg-error-50 p-3 text-xs text-error-800 mb-3">
              <div className="font-semibold mb-1">
                {submitMut.data.errored} order(s) failed
              </div>
              <ul className="space-y-0.5">
                {submitMut.data.results
                  .filter((r) => r.result === "error")
                  .slice(0, 10)
                  .map((r, i) => (
                    <li key={i} className="font-mono">
                      {r.sourceRef.join(" + ")}: {r.error}
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}
          {submitMut.data.results.some(
            (r) => r.unmatchedDescriptions.length > 0,
          ) ? (
            <div className="rounded border border-warning-300 bg-warning-50 p-3 text-xs text-warning-800">
              <div className="font-semibold mb-1">Unmatched SKUs</div>
              <p className="mb-2">
                These core items (mattress / bedframe / sofa) didn&apos;t match a
                SKU in product_skus — they were imported with the raw
                description. Fix the description in AutoCount or add the SKU
                in the catalog, then re-import.
              </p>
              <ul className="space-y-0.5 max-h-40 overflow-auto">
                {submitMut.data.results.flatMap((r) =>
                  r.unmatchedDescriptions.map((d, i) => (
                    <li key={`${r.sourceRef.join(",")}-${i}`} className="font-mono">
                      {r.sourceRef.join(" + ")}: {d}
                    </li>
                  )),
                )}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {submitMut.isError ? (
        <section className="rounded border border-error-300 bg-error-50 p-6">
          <p className="text-sm font-semibold text-error-800">Import failed</p>
          <p className="text-xs text-error-700 mt-1">
            {(submitMut.error as { message?: string })?.message ?? "unknown error"}
          </p>
        </section>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "ok" | "warn" | "error";
}) {
  const color =
    accent === "ok"
      ? "text-success-700"
      : accent === "warn"
        ? "text-warning-700"
        : accent === "error"
          ? "text-error-700"
          : "text-base-900";
  return (
    <div className="rounded border border-base-200 bg-base-50 p-3">
      <div className="text-[10px] uppercase tracking-wider text-base-500">
        {label}
      </div>
      <div className={`text-2xl font-semibold mt-1 ${color}`}>{value}</div>
    </div>
  );
}
