import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";

/**
 * Ops · Order Import (AutoCount Listing.xlsx) — Jess 2026-05-14.
 *
 * Workflow:
 *   1. Pick Excel file.
 *   2. Parse client-side via xlsx library. Show preview (unique orders).
 *   3. Click Import → POST /api/ops/orders/import.
 *   4. Re-import is safe — server UPSERTS on ref. Preserves ops_assigned_logistic.
 *
 * Expected column mapping (AutoCount Listing format):
 *   Ref. → ref
 *   Delivery Location → deliveryLocation
 *   New- Delivery Date → deliveryDateRequested
 *   Item Group → itemGroup
 *   Qty → qty
 *   Detail Description → description
 *   PO Doc No. → poDocNo
 *   Debtor Name → customerName
 *   Phone → customerPhone
 *   Delivery Address 1-4 → deliveryAddress1-4
 *   Balance → balanceRaw
 *   Date → orderDate
 *
 * If AutoCount export adds a logistic column later, map it to importSourceLogistic.
 */

type ParsedRow = {
  ref: string;
  itemGroup: string | null;
  qty: number;
  description: string | null;
  poDocNo: string | null;
  customerName: string | null;
  customerPhone: string | null;
  deliveryAddress1: string | null;
  deliveryAddress2: string | null;
  deliveryAddress3: string | null;
  deliveryAddress4: string | null;
  deliveryLocation: string | null;
  deliveryDateRequested: string | null;
  balanceRaw: string | null;
  orderDate: string | null;
  importSourceLogistic: string | null;
};

type PreviewGroup = {
  ref: string;
  customerName: string;
  itemCount: number;
  totalQty: number;
  deliveryDate: string | null;
  balanceRaw: string | null;
};

function normalizeKey(k: string): string {
  return k.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function toIso(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "number") {
    // Excel date serial → JS date. Excel epoch is 1899-12-30.
    const ms = (v - 25569) * 86400 * 1000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (!s) return null;
  // Try to parse common formats — fallback to passing through.
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return s;
}

function parseRows(workbook: XLSX.WorkBook): ParsedRow[] {
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
  return rawRows
    .map((raw) => {
      // Normalize key lookups so column-name whitespace/punctuation drift doesn't break import.
      const lookup: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(raw)) lookup[normalizeKey(k)] = v;
      const ref = String(lookup["ref"] ?? "").trim();
      if (!ref) return null;
      const qty = Number(lookup["qty"] ?? 0);
      return {
        ref,
        itemGroup: (lookup["itemgroup"] as string | null) ?? null,
        qty: Number.isFinite(qty) ? qty : 0,
        description: (lookup["detaildescription"] as string | null) ?? null,
        poDocNo: (lookup["podocno"] as string | null) ?? null,
        customerName: (lookup["debtorname"] as string | null) ?? null,
        customerPhone: lookup["phone"] != null ? String(lookup["phone"]) : null,
        deliveryAddress1: (lookup["deliveryaddress1"] as string | null) ?? null,
        deliveryAddress2: (lookup["deliveryaddress2"] as string | null) ?? null,
        deliveryAddress3: (lookup["deliveryaddress3"] as string | null) ?? null,
        deliveryAddress4: (lookup["deliveryaddress4"] as string | null) ?? null,
        deliveryLocation: (lookup["deliverylocation"] as string | null) ?? null,
        deliveryDateRequested: toIso(lookup["newdeliverydate"] ?? lookup["deliverydate"]),
        balanceRaw: lookup["balance"] != null ? String(lookup["balance"]) : null,
        orderDate: toIso(lookup["date"]),
        importSourceLogistic: (lookup["logistic"] as string | null) ?? null,
      };
    })
    .filter((r): r is ParsedRow => r !== null);
}

function groupForPreview(rows: ParsedRow[]): PreviewGroup[] {
  const map = new Map<string, PreviewGroup>();
  for (const r of rows) {
    const ex = map.get(r.ref);
    if (ex) {
      ex.itemCount += 1;
      ex.totalQty += r.qty;
      if (!ex.deliveryDate && r.deliveryDateRequested) ex.deliveryDate = r.deliveryDateRequested;
      if (!ex.balanceRaw && r.balanceRaw) ex.balanceRaw = r.balanceRaw;
    } else {
      map.set(r.ref, {
        ref: r.ref,
        customerName: r.customerName ?? "(unknown)",
        itemCount: 1,
        totalQty: r.qty,
        deliveryDate: r.deliveryDateRequested,
        balanceRaw: r.balanceRaw,
      });
    }
  }
  return [...map.values()].sort((a, b) => a.ref.localeCompare(b.ref));
}

export default function OrderImport() {
  const qc = useQueryClient();
  const [filename, setFilename] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [preview, setPreview] = useState<PreviewGroup[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);

  const importMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch<{ batchId: string; rowsInFile: number; ordersCreated: number; ordersUpdated: number }>(
        "/api/ops/orders/import",
        {
          method: "POST",
          body: JSON.stringify({ sourceFilename: filename, rows }),
        },
      );
      return res;
    },
    onSuccess: (data) => {
      toast.success(
        `Imported ${data.rowsInFile} rows → ${data.ordersCreated} new, ${data.ordersUpdated} updated`,
      );
      setFilename(null);
      setRows([]);
      setPreview([]);
      qc.invalidateQueries({ queryKey: ["ops"] });
    },
    onError: (err) => {
      toast.error(`Import failed: ${err instanceof Error ? err.message : "unknown error"}`);
    },
  });

  async function handleFile(file: File) {
    setParseError(null);
    setFilename(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const parsed = parseRows(wb);
      if (parsed.length === 0) {
        setParseError("No valid order rows found. Check that the first sheet has a Ref. column.");
        setRows([]);
        setPreview([]);
        return;
      }
      setRows(parsed);
      setPreview(groupForPreview(parsed));
    } catch (e) {
      setParseError(`Could not parse Excel: ${e instanceof Error ? e.message : "unknown error"}`);
    }
  }

  return (
    <div className="px-9 py-7">
      <div className="text-[11px] uppercase tracking-[0.18em] text-primary font-semibold mb-1.5">
        Ops Panel
      </div>
      <h1 className="text-[28px] font-display font-bold text-base-900 mb-2">
        Order Import (AutoCount)
      </h1>
      <p className="text-[13px] text-base-600 mb-7 max-w-3xl">
        Upload your AutoCount <code>Listing.xlsx</code> export. The system groups rows
        by order ref and upserts into staging — re-importing is safe and updates
        customer / address / balance / items. Your <em>final logistic assignment</em>{" "}
        is preserved across re-imports, so re-imports never overwrite ops decisions.
      </p>

      <div className="card p-5 mb-5">
        <label
          htmlFor="ac-file"
          className="block border-2 border-dashed border-base-200 rounded-lg p-9 text-center cursor-pointer hover:border-primary/40 hover:bg-base-50 transition-colors"
        >
          <div className="text-[14px] font-semibold text-base-900 mb-1">
            {filename ?? "Click to choose an Excel file (.xlsx / .xls)"}
          </div>
          <div className="text-[11px] text-base-500">
            Expected columns: Ref. · Item Group · Qty · Detail Description · PO Doc No. ·
            Debtor Name · Phone · Delivery Address 1-4 · Delivery Location · New- Delivery Date · Balance · Date
          </div>
          <input
            id="ac-file"
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
        </label>
        {parseError && (
          <div className="mt-3 rounded-md bg-destructive/10 border border-destructive/30 p-3 text-[12px] text-destructive">
            {parseError}
          </div>
        )}
      </div>

      {preview.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[16px] font-semibold text-base-900">
                Preview · {preview.length} unique orders ({rows.length} rows)
              </div>
              <div className="text-[11px] text-base-500 mt-0.5">
                Review the list, then click Import to upsert into staging.
              </div>
            </div>
            <button
              type="button"
              className="btn-primary px-5 py-2 text-[13px]"
              disabled={importMutation.isPending}
              onClick={() => importMutation.mutate()}
            >
              {importMutation.isPending ? "Importing…" : `Import ${preview.length} orders`}
            </button>
          </div>

          <div className="card p-0 overflow-hidden">
            <div
              className="grid gap-3 px-4 py-2 bg-base-50 border-b border-base-200 text-[10px] uppercase tracking-wider text-base-500 font-semibold"
              style={{ gridTemplateColumns: "120px 1.6fr 80px 80px 130px 1fr" }}
            >
              <div>Ref</div>
              <div>Customer</div>
              <div className="text-right">Items</div>
              <div className="text-right">Total Qty</div>
              <div>Delivery date</div>
              <div>Balance</div>
            </div>
            <div className="max-h-[520px] overflow-auto">
              {preview.map((p) => (
                <div
                  key={p.ref}
                  className="grid gap-3 px-4 py-2 border-t border-base-100 text-[12.5px]"
                  style={{ gridTemplateColumns: "120px 1.6fr 80px 80px 130px 1fr" }}
                >
                  <div className="font-mono font-semibold text-base-900">{p.ref}</div>
                  <div className="truncate text-base-800">{p.customerName}</div>
                  <div className="text-right font-mono text-base-700">{p.itemCount}</div>
                  <div className="text-right font-mono text-base-700">{p.totalQty}</div>
                  <div className="text-base-600">{p.deliveryDate ?? "—"}</div>
                  <div className="text-base-600 truncate">{p.balanceRaw ?? "—"}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
