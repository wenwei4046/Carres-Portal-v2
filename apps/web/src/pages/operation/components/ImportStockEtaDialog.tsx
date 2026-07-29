import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  masterRecordToStockRow,
  masterRecordToOrderRow,
  masterRecordToStorageFee,
  aggregateStorageFeesByRef,
  masterRecordToBalance,
  aggregateBalancesByRef,
  type StockEtaImportRow,
  type StorageFeeImportRow,
  type BalanceImportRow,
  type StockEtaImportResult,
  type AutocountImportRow,
  type AutocountImportResponse,
  type MasterAppendRow,
  type MissingLineCandidate,
} from "@carres/shared";
import { ApiError } from "@/lib/api";
import {
  useImportStockEta,
  useImportOrders,
  useAppendMissingLines,
} from "@/lib/queries";
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
  storageFees: StorageFeeImportRow[];
  balances: BalanceImportRow[];
}

async function readMaster(file: File): Promise<Parsed> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const name = wb.SheetNames.find((n) => /ops/i.test(n)) ?? wb.SheetNames[0];
  const sheet = name ? wb.Sheets[name] : undefined;
  if (!sheet) return { orderRows: [], stockRows: [], storageFees: [], balances: [] };
  // raw:true keeps date cells as Excel serials (the shared parsers convert them).
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: "",
  });
  const header = (Array.isArray(aoa[0]) ? aoa[0] : []).map((h) => String(h ?? "").trim());
  const orderRows: AutocountImportRow[] = [];
  const stockRows: StockEtaImportRow[] = [];
  const feeRows: StorageFeeImportRow[] = [];
  const balRows: BalanceImportRow[] = [];
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
    const fee = masterRecordToStorageFee(rec);
    if (fee.ok) feeRows.push(fee.row);
    const bal = masterRecordToBalance(rec);
    if (bal.ok) balRows.push(bal.row);
  }
  // The Master lists one row per line → an order's storage fee + balance repeat;
  // collapse each to one per Ref.
  return {
    orderRows,
    stockRows,
    storageFees: aggregateStorageFeesByRef(feeRows),
    balances: aggregateBalancesByRef(balRows),
  };
}

/** The candidate key the tick-list is stored under (a row is unique enough by
 *  order + PO + name). */
const candKey = (c: MissingLineCandidate) => `${c.orderId}|${c.po}|${c.detail}`;

/** Map the parsed order rows to the append-scan shape (the detector ignores
 *  PO-less rows, so no client-side filtering beyond the parse). */
function toAppendRows(rows: AutocountImportRow[]): MasterAppendRow[] {
  return rows.slice(0, 2000).map((r) => ({
    ref: r.ref,
    itemGroup: r.itemGroup,
    qty: r.qty,
    detail: r.detailDescription,
    po: r.poDocNo ?? "",
  }));
}

export default function ImportStockEtaDialog({ onClose }: { onClose: () => void }) {
  const importOrders = useImportOrders();
  const importEta = useImportStockEta();
  const appendLines = useAppendMissingLines();
  const fileInput = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<Stage>("pick");
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<Parsed>({
    orderRows: [],
    stockRows: [],
    storageFees: [],
    balances: [],
  });
  const [preview, setPreview] = useState<StockEtaImportResult | null>(null);
  const [ordersResult, setOrdersResult] = useState<AutocountImportResponse | null>(null);
  const [stockResult, setStockResult] = useState<StockEtaImportResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  // Master reconcile append (Option A): candidates the scan found, the tick
  // state (defaults follow candidate.clean), and how many lines were appended.
  const [candidates, setCandidates] = useState<MissingLineCandidate[]>([]);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [appendedCount, setAppendedCount] = useState<number | null>(null);

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
      const dry = await importEta.mutateAsync({
        rows: p.stockRows,
        storageFees: p.storageFees,
        balances: p.balances,
        dryRun: true,
      });
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
      // 2) Now set stock ETA + status + storage fees + balances — matches climb
      //    after the create.
      const stk = await importEta.mutateAsync({
        rows: parsed.stockRows,
        storageFees: parsed.storageFees,
        balances: parsed.balances,
      });
      setStockResult(stk);
      setStage("result");
      // 3) Reconcile scan (dry): sheet rows whose PO is on NO line of their
      //    existing order = lines the portal is missing (0214 keeps re-import
      //    create-only, so this tick-list is the only add path). Fails soft —
      //    an old Worker without the route just hides the section.
      if (parsed.orderRows.length > 0) {
        try {
          const scan = await appendLines.mutateAsync({
            rows: toAppendRows(parsed.orderRows),
            dryRun: true,
          });
          setCandidates(scan.candidates);
          setTicked(new Set(scan.candidates.filter((x) => x.clean).map(candKey)));
        } catch {
          setCandidates([]);
        }
      }
      toast.success(
        `${ord ? `${ord.created} order(s) created · ` : ""}${stk.written} stock line(s) set${
          stk.storageWritten > 0 ? ` · ${stk.storageWritten} storage fee(s)` : ""
        }${stk.balanceWritten > 0 ? ` · ${stk.balanceWritten} balance(s)` : ""}`,
      );
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Import failed");
    }
  }

  // Commit the ticked candidates. Sends ONLY the ticked rows; the server
  // re-detects before appending (a line that appeared meanwhile won't dup).
  async function doAppend() {
    const rows = candidates
      .filter((x) => ticked.has(candKey(x)))
      .map((x) => ({
        ref: x.ref,
        itemGroup: x.itemGroup,
        qty: x.qty,
        detail: x.detail,
        po: x.po,
      }));
    if (rows.length === 0) return;
    try {
      const res = await appendLines.mutateAsync({ rows });
      setAppendedCount(res.appended);
      toast.success(
        `${res.appended} line(s) appended across ${res.orders} order(s)`,
      );
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Append failed");
    }
  }

  return (
    <Modal title="Import from Master sheet" onClose={onClose}>
      {stage === "pick" && (
        <div className="flex flex-col gap-3">
          <p className="text-body text-base-600">
            Upload your <span className="font-semibold">Master</span> file (.xlsx). One click:{" "}
            <span className="font-semibold">creates any missing orders</span> from the sheet, then
            sets each line's <span className="font-semibold">Stock ETA + status</span> (Received →
            Ready · Pending → Waiting · No Stock → No PO).
          </p>
          <p className="text-meta text-base-500">
            Orders are matched by Ref (idempotent — existing orders are updated, not duplicated).
            Discount / service-charge lines are skipped. You'll see the counts before anything is
            written.
          </p>
          <div>
            <button
              type="button"
              className="btn-primary text-meta"
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
          {importEta.isPending && <p className="text-meta text-base-500">Reading + matching…</p>}
          {parseError && (
            <p className="text-body text-red-600" data-testid="eta-import-error">
              {parseError}
            </p>
          )}
        </div>
      )}

      {stage === "preview" && preview && (
        <div className="flex flex-col gap-3">
          <div className="text-body text-base-700">
            <span className="font-mono text-meta">{fileName}</span> ·{" "}
            <span className="font-semibold text-base-900">{parsed.orderRows.length}</span> order lines ·{" "}
            <span className="font-semibold text-base-900">{parsed.stockRows.length}</span> stock rows
            {parsed.storageFees.length > 0 && (
              <>
                {" "}·{" "}
                <span className="font-semibold text-base-900">{parsed.storageFees.length}</span>{" "}
                storage fees
              </>
            )}
            {parsed.balances.length > 0 && (
              <>
                {" "}·{" "}
                <span className="font-semibold text-base-900">{parsed.balances.length}</span>{" "}
                balances
              </>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-[6px] bg-base-50 px-3 py-2">
              <div className="text-strong text-green-700">{preview.matched}</div>
              <div className="text-label uppercase tracking-[0.05em] text-base-500">stock match now</div>
            </div>
            <div className="rounded-[6px] bg-base-50 px-3 py-2">
              <div className="text-strong text-base-900">{preview.orders}</div>
              <div className="text-label uppercase tracking-[0.05em] text-base-500">orders</div>
            </div>
            <div className="rounded-[6px] bg-base-50 px-3 py-2">
              <div className="text-strong text-primary">{parsed.orderRows.length}</div>
              <div className="text-label uppercase tracking-[0.05em] text-base-500">order lines in</div>
            </div>
          </div>

          <div className="rounded-[4px] border border-base-200 bg-base-50 px-3 py-2 text-meta text-base-600">
            On import: any order the sheet has but the portal is missing gets{" "}
            <span className="font-semibold">created first</span>, then the stock match climbs above
            the {preview.matched} shown (which only counts orders already in the portal).
            {parsed.storageFees.length > 0 && (
              <>
                {" "}
                Storage fees (MS/BF · Sofa) match{" "}
                <span className="font-semibold text-base-900">{preview.storageOrders}</span> order
                {preview.storageOrders === 1 ? "" : "s"} now
                {preview.storageUnmatched > 0 && (
                  <> · {preview.storageUnmatched} by Ref not found (climbs after create)</>
                )}
                .
              </>
            )}
            {parsed.balances.length > 0 && (
              <>
                {" "}
                Balance + payment status match{" "}
                <span className="font-semibold text-base-900">{preview.balanceOrders}</span>{" "}
                order{preview.balanceOrders === 1 ? "" : "s"} now
                {preview.balanceUnmatched > 0 && (
                  <> · {preview.balanceUnmatched} by Ref not found (climbs after create)</>
                )}
                .
              </>
            )}
          </div>

          <div className="flex justify-end gap-2 mt-1">
            <button type="button" onClick={() => setStage("pick")} className="btn-ghost text-meta" disabled={busy}>
              Back
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={busy}
              className="btn-primary text-meta disabled:opacity-40"
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
              <div className="text-body text-base-700 mb-1">
                Orders — <span className="font-semibold text-green-700">{ordersResult.created} created</span>{" "}
                · {ordersResult.updated} updated
              </div>
            )}
            <div className="text-strong text-base-900">{stockResult.written} stock line(s) set</div>
            <div className="text-body text-base-600 mt-0.5">
              across {stockResult.orders} order{stockResult.orders === 1 ? "" : "s"}
              {stockResult.unmatched > 0 && (
                <>
                  {" "}· <span className="text-amber-600">{stockResult.unmatched} still unmatched</span>
                </>
              )}
            </div>
            {stockResult.storageWritten > 0 && (
              <div className="text-body text-base-700 mt-1 pt-1 border-t border-base-200">
                <span className="font-semibold text-green-700">
                  {stockResult.storageWritten}
                </span>{" "}
                storage fee(s) set from the Master
                {stockResult.storageUnmatched > 0 && (
                  <>
                    {" "}· <span className="text-amber-600">{stockResult.storageUnmatched} Ref
                    unmatched</span>
                  </>
                )}
              </div>
            )}
            {stockResult.balanceWritten > 0 && (
              <div className="text-body text-base-700 mt-1 pt-1 border-t border-base-200">
                <span className="font-semibold text-green-700">
                  {stockResult.balanceWritten}
                </span>{" "}
                balance + payment status set from the Master
                {stockResult.balanceUnmatched > 0 && (
                  <>
                    {" "}· <span className="text-amber-600">{stockResult.balanceUnmatched} Ref
                    unmatched</span>
                  </>
                )}
              </div>
            )}
          </div>
          {stockResult.unmatched > 0 && stockResult.sampleUnmatched.length > 0 && (
            <details className="text-meta text-base-600">
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
          {candidates.length > 0 && (
            <div
              className="rounded-[4px] border border-base-200 px-3 py-2.5"
              data-testid="append-missing-section"
            >
              <div className="text-body font-semibold text-base-900 mb-1">
                Sheet has it — portal doesn't ({candidates.length})
              </div>
              {appendedCount === null ? (
                <>
                  <p className="text-meta text-base-500 mb-2">
                    These sheet lines carry a PO that exists on no line of their order.
                    Ticked = safe to append. Unticked rows: the order also holds a line
                    the sheet doesn't have (model changed / PO re-raised?) — check before
                    ticking.
                  </p>
                  <ul className="space-y-1.5 max-h-48 overflow-y-auto">
                    {candidates.map((cand) => {
                      const key = candKey(cand);
                      return (
                        <li key={key} className="text-meta text-base-700">
                          <label className="flex items-start gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              className="mt-0.5"
                              checked={ticked.has(key)}
                              data-testid={`append-tick-${cand.so}`}
                              onChange={(e) => {
                                setTicked((prev) => {
                                  const next = new Set(prev);
                                  if (e.target.checked) next.add(key);
                                  else next.delete(key);
                                  return next;
                                });
                              }}
                            />
                            <span className="min-w-0">
                              <span className="font-mono font-semibold">SO-{cand.so}</span>{" "}
                              <span className="text-base-900">{cand.detail}</span>{" "}
                              <span className="text-base-500">
                                · {cand.qty}× · <span className="font-mono">{cand.po}</span>
                              </span>
                              {!cand.clean && cand.portalUnaccounted.length > 0 && (
                                <span className="block text-amber-700">
                                  order already has:{" "}
                                  {cand.portalUnaccounted
                                    .map((l) => `${l.sku}${l.sourcePo ? ` · ${l.sourcePo}` : " · no PO"}`)
                                    .join(" / ")}
                                </span>
                              )}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="flex justify-end mt-2">
                    <button
                      type="button"
                      className="btn-primary text-meta disabled:opacity-40"
                      disabled={appendLines.isPending || ticked.size === 0}
                      onClick={() => void doAppend()}
                      data-testid="append-missing-confirm"
                    >
                      {appendLines.isPending
                        ? "Appending…"
                        : `Append ${ticked.size} line(s)`}
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-body text-green-700" data-testid="append-missing-done">
                  {appendedCount} line(s) appended — the orders now match the Master.
                </p>
              )}
            </div>
          )}
          <div className="flex justify-end">
            <button type="button" className="btn-primary text-meta" onClick={onClose} data-testid="eta-import-done">
              Done
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
