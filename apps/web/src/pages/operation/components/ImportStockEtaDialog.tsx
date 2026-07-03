import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  masterRecordToStockRow,
  masterRecordToOrderRow,
  type StockEtaImportRow,
  type StockEtaImportResult,
  type AutocountImportRow,
  type AutocountImportResponse,
} from "@carres/shared";
import { ApiError } from "@/lib/api";
import { useImportStockEta, useImportOrders } from "@/lib/queries";
import { Modal } from "./Modal";

/**
 * Import from Master sheet — ONE click that fully settles an order from Jess's
 * Master "Ops" sheet (Jess 2026-07-02, "I want 100%"):
 *   1. create / update the ORDERS (reuses the proven AutoCount import RPC,
 *      idempotent by ref) — so orders the AutoCount export missed still land;
 *   2. set each line's Stock ETA + status.
 * The Master is a superset of the AutoCount listing, so both come from the one
 * file. Non-stock charge / discount lines are skipped (they carry no stock).
 */

type Stage = "pick" | "preview" | "result";

interface Parsed {
  orderRows: AutocountImportRow[];
  stockRows: StockEtaImportRow[];
}

async function readMaster(file: File): Promise<Parsed> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const name = wb.SheetNames.find((n) => /ops/i.test(n)) ?? wb.SheetNames[0];
  const sheet = name ? wb.Sheets[name] : undefined;
  if (!sheet) return { orderRows: [], stockRows: [] };
  // raw:true keeps date cells as Excel serials (the shared parsers convert them).
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: "",
  });
  const header = (Array.isArray(aoa[0]) ? aoa[0] : []).map((h) => String(h ?? "").trim());
  const orderRows: AutocountImportRow[] = [];
  const stockRows: StockEtaImportRow[] = [];
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
    const ord = masterRecordToOrderRow(rec);
    if (ord.ok) orderRows.push(ord.row);
    const stk = masterRecordToStockRow(rec);
    if (stk.ok) stockRows.push(stk.row);
  }
  return { orderRows, stockRows };
}

export default function ImportStockEtaDialog({ onClose }: { onClose: () => void }) {
  const importOrders = useImportOrders();
  const importEta = useImportStockEta();
  const fileInput = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<Stage>("pick");
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<Parsed>({ orderRows: [], stockRows: [] });
  const [preview, setPreview] = useState<StockEtaImportResult | null>(null);
  const [ordersResult, setOrdersResult] = useState<AutocountImportResponse | null>(null);
  const [stockResult, setStockResult] = useState<StockEtaImportResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const busy = importOrders.isPending || importEta.isPending;

  async function onFile(file: File) {
    setParseError(null);
    try {
      const p = await readMaster(file);
      if (p.orderRows.length === 0 && p.stockRows.length === 0) {
        setParseError("No usable rows found. The sheet needs Ref + Item Detail per row.");
        return;
      }
      setParsed(p);
      setFileName(file.name);
      // Dry-run the stock match on the CURRENT orders so the operator sees roughly
      // how many already match (it climbs once the orders are created on commit).
      const dry = await importEta.mutateAsync({ rows: p.stockRows, dryRun: true });
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
    if (parsed.orderRows.length === 0 && parsed.stockRows.length === 0) return;
    try {
      // 1) Create / update the orders first, so rows whose order was missing
      //    now exist and can take a stock ETA. Idempotent by ref.
      const ord = parsed.orderRows.length
        ? await importOrders.mutateAsync({ sourceSystem: "autocount", rows: parsed.orderRows })
        : null;
      setOrdersResult(ord);
      // 2) Now set stock ETA + status — matches climb after the create.
      const stk = await importEta.mutateAsync({ rows: parsed.stockRows });
      setStockResult(stk);
      setStage("result");
      toast.success(
        `${ord ? `${ord.created} order(s) created · ` : ""}${stk.written} stock line(s) set`,
      );
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Import failed");
    }
  }

  return (
    <Modal title="Import from Master sheet" onClose={onClose}>
      {stage === "pick" && (
        <div className="flex flex-col gap-3">
          <p className="t-small text-base-600">
            Upload your <span className="font-semibold">Master</span> file (.xlsx). One click:{" "}
            <span className="font-semibold">creates any missing orders</span> from the sheet, then
            sets each line's <span className="font-semibold">Stock ETA + status</span> (Received →
            Ready · Pending → Waiting · No Stock → No PO).
          </p>
          <p className="t-tiny text-base-500">
            Orders are matched by Ref (idempotent — existing orders are updated, not duplicated).
            Discount / service-charge lines are skipped. You'll see the counts before anything is
            written.
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
            <span className="font-semibold text-base-900">{parsed.orderRows.length}</span> order lines ·{" "}
            <span className="font-semibold text-base-900">{parsed.stockRows.length}</span> stock rows
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-[6px] bg-base-50 px-3 py-2">
              <div className="t-h4 text-green-700">{preview.matched}</div>
              <div className="t-micro text-base-500">stock match now</div>
            </div>
            <div className="rounded-[6px] bg-base-50 px-3 py-2">
              <div className="t-h4 text-base-900">{preview.orders}</div>
              <div className="t-micro text-base-500">orders</div>
            </div>
            <div className="rounded-[6px] bg-base-50 px-3 py-2">
              <div className="t-h4 text-primary">{parsed.orderRows.length}</div>
              <div className="t-micro text-base-500">order lines in</div>
            </div>
          </div>

          <div className="rounded-[4px] border border-base-200 bg-base-50 px-3 py-2 t-tiny text-base-600">
            On import: any order the sheet has but the portal is missing gets{" "}
            <span className="font-semibold">created first</span>, then the stock match climbs above
            the {preview.matched} shown (which only counts orders already in the portal).
          </div>

          <div className="flex justify-end gap-2 mt-1">
            <button type="button" onClick={() => setStage("pick")} className="btn-ghost text-[12px]" disabled={busy}>
              Back
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={busy}
              className="btn-primary text-[12px] disabled:opacity-40"
              data-testid="eta-import-confirm"
            >
              {busy ? "Working…" : "Create orders + set stock"}
            </button>
          </div>
        </div>
      )}

      {stage === "result" && stockResult && (
        <div className="flex flex-col gap-3" data-testid="eta-import-result">
          <div className="rounded-[4px] border border-base-200 bg-base-50 px-3 py-2.5">
            {ordersResult && (
              <div className="t-small text-base-700 mb-1">
                Orders — <span className="font-semibold text-green-700">{ordersResult.created} created</span>{" "}
                · {ordersResult.updated} updated
              </div>
            )}
            <div className="t-h4 text-base-900">{stockResult.written} stock line(s) set</div>
            <div className="t-small text-base-600 mt-0.5">
              across {stockResult.orders} order{stockResult.orders === 1 ? "" : "s"}
              {stockResult.unmatched > 0 && (
                <>
                  {" "}· <span className="text-amber-600">{stockResult.unmatched} still unmatched</span>
                </>
              )}
            </div>
          </div>
          {stockResult.unmatched > 0 && stockResult.sampleUnmatched.length > 0 && (
            <details className="t-tiny text-base-600">
              <summary className="cursor-pointer text-amber-700">
                {stockResult.unmatched} unmatched — why (first {stockResult.sampleUnmatched.length})
              </summary>
              <ul className="mt-1 space-y-0.5 max-h-40 overflow-y-auto">
                {stockResult.sampleUnmatched.map((u, i) => (
                  <li key={`${u.po}-${i}`}>
                    <span className="font-mono">{u.po}</span>{" "}
                    <span className="text-base-500">{u.sku}</span> — {u.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
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
