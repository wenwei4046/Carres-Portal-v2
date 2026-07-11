import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  warehouseSheetRecordToImportRow,
  type OpsStockImportRow,
  type OpsStockItem,
} from "@carres/shared";
import { ApiError } from "@/lib/api";
import { useImportStock } from "@/lib/queries";
import { Modal } from "./Modal";

/**
 * Import from the "Klg Warehouse" ready-stock sheet — On Hand C+ P3.
 * Add-only: parse the sheet client-side, bucket each unit into New vs
 * Possible-duplicate (matched on OLD REF against the current pool), then book
 * in the New units at Carres Klang. Snapshot-replace is intentionally NOT here
 * (it would wipe reserved links) — that's a future guarded step.
 */

type Stage = "pick" | "preview" | "result";

async function readSheet(file: File): Promise<OpsStockImportRow[]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const name =
    wb.SheetNames.find((n) => /import|stock|warehouse/i.test(n)) ??
    wb.SheetNames[0];
  const sheet = name ? wb.Sheets[name] : undefined;
  if (!sheet) return [];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: "",
  });
  const header = (Array.isArray(aoa[0]) ? aoa[0] : []).map((h) =>
    String(h ?? "").trim(),
  );
  const out: OpsStockImportRow[] = [];
  for (let r = 1; r < aoa.length; r++) {
    const cells = aoa[r];
    if (!Array.isArray(cells)) continue;
    const rec: Record<string, unknown> = {};
    for (let c = 0; c < header.length; c++) {
      if (header[c]) rec[header[c]] = cells[c];
    }
    const p = warehouseSheetRecordToImportRow(rec);
    if (p.ok) out.push(p.row);
  }
  return out;
}

const unitsOf = (rows: OpsStockImportRow[]) =>
  rows.reduce((n, r) => n + r.qty, 0);

export default function ImportStockDialog({
  existing,
  onClose,
}: {
  existing: OpsStockItem[];
  onClose: () => void;
}) {
  const importStock = useImportStock();
  const fileInput = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<Stage>("pick");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<OpsStockImportRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [created, setCreated] = useState(0);

  // Units already in the pool that carry an OLD REF — the dedup key.
  const knownRefs = useMemo(
    () =>
      new Set(
        existing
          .map((e) => e.sourceRef?.trim())
          .filter((r): r is string => !!r),
      ),
    [existing],
  );

  const fresh = useMemo(
    () => rows.filter((r) => !r.sourceRef || !knownRefs.has(r.sourceRef)),
    [rows, knownRefs],
  );
  const dupes = useMemo(
    () => rows.filter((r) => r.sourceRef && knownRefs.has(r.sourceRef)),
    [rows, knownRefs],
  );

  async function onFile(file: File) {
    setParseError(null);
    try {
      const parsed = await readSheet(file);
      if (parsed.length === 0) {
        setParseError(
          "No usable rows found. The sheet needs a SKU column per unit.",
        );
        return;
      }
      setRows(parsed);
      setFileName(file.name);
      setStage("preview");
    } catch (e) {
      setParseError(
        e instanceof Error
          ? `Could not read the file: ${e.message}`
          : "Could not read the file.",
      );
    }
  }

  async function confirm() {
    if (fresh.length === 0) return;
    try {
      const res = await importStock.mutateAsync({ rows: fresh });
      setCreated(res.created);
      setStage("result");
      toast.success(`${res.created} unit(s) booked into Carres Klang`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Import failed");
    }
  }

  const busy = importStock.isPending;

  return (
    <Modal title="Import warehouse sheet" onClose={onClose}>
      {stage === "pick" && (
        <div className="flex flex-col gap-3">
          <p className="t-small text-base-600">
            Upload your <span className="font-semibold">Klg Warehouse</span>{" "}
            sheet (.xlsx). Each row is one physical unit; we book them in at{" "}
            <span className="font-semibold">Carres Klang</span>. You&rsquo;ll see
            the counts — new vs already-in — before anything saves.
          </p>
          <p className="t-tiny text-base-500">
            Add-only: units already in the pool (matched by OLD REF) are skipped,
            so re-importing the same sheet won&rsquo;t double up.
          </p>
          <div>
            <button
              type="button"
              className="btn-primary text-[12px]"
              onClick={() => fileInput.current?.click()}
              data-testid="stock-import-pick"
            >
              Choose sheet…
            </button>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            data-testid="stock-import-file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
              e.target.value = "";
            }}
          />
          {parseError && (
            <p className="t-small text-red-600" data-testid="stock-import-error">
              {parseError}
            </p>
          )}
        </div>
      )}

      {stage === "preview" && (
        <div className="flex flex-col gap-3">
          <div className="t-small text-base-700">
            <span className="font-mono t-tiny">{fileName}</span> ·{" "}
            <span className="font-semibold text-base-900">
              {unitsOf(rows)}
            </span>{" "}
            units in sheet
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-[6px] bg-base-50 px-3 py-2">
              <div className="t-h4 text-green-700">{unitsOf(fresh)}</div>
              <div className="t-micro text-base-500">new — will add</div>
            </div>
            <div className="rounded-[6px] bg-base-50 px-3 py-2">
              <div className="t-h4 text-base-900">{unitsOf(dupes)}</div>
              <div className="t-micro text-base-500">already in — skipped</div>
            </div>
          </div>

          <div className="rounded-[4px] border border-base-200 bg-base-50 px-3 py-2 t-tiny text-base-600">
            Booking in <span className="font-semibold">{unitsOf(fresh)}</span>{" "}
            new unit(s) at Carres Klang. Condition, PO, supplier, reserved-ref +
            date-in come straight from the sheet.
          </div>

          <div className="flex justify-end gap-2 mt-1">
            <button
              type="button"
              onClick={() => setStage("pick")}
              className="btn-ghost text-[12px]"
              disabled={busy}
            >
              Back
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={busy || fresh.length === 0}
              className="btn-primary text-[12px] disabled:opacity-40"
              data-testid="stock-import-confirm"
            >
              {busy ? "Booking in…" : `Add ${unitsOf(fresh)} unit(s)`}
            </button>
          </div>
        </div>
      )}

      {stage === "result" && (
        <div className="flex flex-col gap-3" data-testid="stock-import-result">
          <div className="rounded-[4px] border border-base-200 bg-base-50 px-3 py-2.5">
            <div className="t-h4 text-green-700">{created} unit(s) booked in</div>
            <div className="t-small text-base-600 mt-0.5">
              at Carres Klang · the On Hand list has refreshed.
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              className="btn-primary text-[12px]"
              onClick={onClose}
              data-testid="stock-import-done"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
