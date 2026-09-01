// design-standard: not-a-list-page — a fixed watch-list band inside the Stock
// On hand page, not a paginated list surface.
import { useState } from "react";
import { PackageSearch, Pencil, Check, X } from "lucide-react";
import { useReorderStock, useSetReorderPoint } from "@/lib/queries";
import type { OpsReorderRow } from "@carres/shared";

/**
 * Reorder — Ready Stock card K1 (`docs/ready-stock-execution-queue.md`).
 *
 * Pillow and mattress protector come from China on a ~2-month lead. By the time
 * the shelf reads zero it is already two months too late, so this band shows
 * `now · coming · reorder at` for every watched SKU and says `Reorder stock` out
 * loud while there is still stock on the floor.
 *
 * Live proof the card exists (prod, 2026-07-27): the King protector sits at 15
 * units against a 200 reorder point, and nothing on any screen said so.
 *
 * Editing is COO-only (`stock_planner` duty, migration 0286). `canEdit` comes
 * from the server and decides whether the pencil renders; the write is re-gated
 * in SQL, so hiding the pencil is a courtesy, never the protection.
 *
 * A SKU with no number reads "Set a number", NOT a green tick — a quiet screen
 * has to mean "watched and fine", never "nobody has looked".
 */

export default function ReorderStockCard({ settingsOnly = false }: { settingsOnly?: boolean }) {
  const { data, isLoading, isError } = useReorderStock();
  const [editing, setEditing] = useState<string | null>(null);

  // Nothing to watch yet (no imported accessory in stock, no point set) — say
  // nothing rather than showing an empty box.
  //
  // `Array.isArray` rather than a truthiness check on purpose: a browser
  // carrying this build can reach a Worker that predates the /reorder route
  // (the deploy is never atomic), and that answer must DEGRADE to "nothing to
  // watch", never crash the Stock page around it — the 0265 lesson.
  if (isLoading || isError || !data || !Array.isArray(data.rows) || data.rows.length === 0)
    return null;

  const rows = data.rows;
  const alertCount = data.alertCount ?? 0;
  const unsetCount = data.unsetCount ?? 0;
  const canEdit = data.canEdit === true;

  if (settingsOnly) {
    return (
      <div className="rounded border border-base-200 bg-white" data-testid="reorder-stock-card">
        <header className="border-b border-base-100 px-4 py-3">
          <div className="flex items-center gap-1.5">
            <PackageSearch size={16} strokeWidth={2} className="text-base-400" />
            <h2 className="text-strong text-base-900">Reorder points and lead days</h2>
          </div>
          <p className="mt-0.5 text-meta text-base-600">
            Purchasing uses these values when it prepares replenishment work.
          </p>
        </header>
        <div className="px-4 py-1">
          <div
            className="grid items-center gap-3 py-1.5 text-label font-semibold uppercase tracking-[0.03em] text-base-400"
            style={{ gridTemplateColumns: "minmax(240px, 1fr) 120px 120px 28px" }}
          >
            <span>Item</span>
            <span className="text-right">Reorder point</span>
            <span className="text-right">Lead days</span>
            <span />
          </div>
          {rows.map((row) => (
            <StockSettingRow
              key={row.sku}
              row={row}
              canEdit={canEdit}
              editing={editing === row.sku}
              onEdit={() => setEditing(row.sku)}
              onDone={() => setEditing(null)}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded border border-base-200 bg-white mb-4"
      data-testid="reorder-stock-card"
    >
      <header className="px-4 py-3 flex items-start justify-between gap-3 border-b border-base-100">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <PackageSearch size={16} strokeWidth={2} className="text-base-400" />
            <span className="text-strong text-base-900">Reorder</span>
          </div>
          <div className="text-meta text-base-600 mt-0.5">
            Pillow and protector come from China — about 2 months. Order before
            the shelf runs down.
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {alertCount > 0 ? (
            <span className="pill pill-overdue" data-testid="reorder-alert-count">
              {alertCount} to reorder
            </span>
          ) : (
            <span className="pill pill-confirmed" data-testid="reorder-all-ok">
              All above the point
            </span>
          )}
          {unsetCount > 0 ? (
            <span className="pill pill-neutral" data-testid="reorder-unset-count">
              {unsetCount} without a number
            </span>
          ) : null}
        </div>
      </header>

      <div className="px-4 py-1">
        <div
          className="grid items-center gap-3 py-1.5 text-label font-semibold uppercase tracking-[0.03em] text-base-400"
          style={{ gridTemplateColumns: "1fr 64px 64px 84px 132px 28px" }}
        >
          <span>Item</span>
          <span className="text-right">Now</span>
          <span className="text-right">Coming</span>
          <span className="text-right">Reorder at</span>
          <span />
          <span />
        </div>
        {rows.map((row) => (
          <ReorderRow
            key={row.sku}
            row={row}
            canEdit={canEdit}
            editing={editing === row.sku}
            onEdit={() => setEditing(row.sku)}
            onDone={() => setEditing(null)}
          />
        ))}
      </div>
    </div>
  );
}

function StockSettingRow({
  row,
  canEdit,
  editing,
  onEdit,
  onDone,
}: {
  row: OpsReorderRow;
  canEdit: boolean;
  editing: boolean;
  onEdit: () => void;
  onDone: () => void;
}) {
  return (
    <div
      className="grid min-h-11 items-center gap-3 border-t border-base-100 py-2"
      style={{ gridTemplateColumns: "minmax(240px, 1fr) 120px 120px 28px" }}
      data-testid={`reorder-row-${row.sku}`}
    >
      <div className="min-w-0">
        <div className="truncate text-body text-base-900" title={row.sku}>{row.sku}</div>
        {row.kind ? <div className="text-label text-base-500">{row.kind}</div> : null}
      </div>
      {editing ? (
        <StockSettingEditor row={row} onDone={onDone} />
      ) : (
        <>
          <span className="text-right font-mono text-body text-base-800">
            {row.reorderPoint == null ? "Not set" : row.reorderPoint}
          </span>
          <span className="text-right font-mono text-body text-base-800">
            {row.leadDays == null ? "Not set" : row.leadDays}
          </span>
          <div className="text-right">
            {canEdit ? (
              <button
                type="button"
                onClick={onEdit}
                className="text-base-400 hover:text-primary"
                aria-label={`Edit stock settings for ${row.sku}`}
                data-testid={`reorder-edit-${row.sku}`}
              >
                <Pencil size={14} strokeWidth={2} />
              </button>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

function StockSettingEditor({ row, onDone }: { row: OpsReorderRow; onDone: () => void }) {
  const [point, setPoint] = useState(String(row.reorderPoint ?? ""));
  const [leadDays, setLeadDays] = useState(String(row.leadDays ?? ""));
  const save = useSetReorderPoint();
  const pointValue = Number(point);
  const leadValue = Number(leadDays);
  const valid =
    point.trim() !== "" &&
    leadDays.trim() !== "" &&
    Number.isInteger(pointValue) &&
    Number.isInteger(leadValue) &&
    pointValue >= 0 &&
    pointValue <= 100000 &&
    leadValue >= 0 &&
    leadValue <= 3650;

  function submit() {
    if (!valid || save.isPending) return;
    save.mutate(
      { sku: row.sku, reorderPoint: pointValue, leadDays: leadValue },
      { onSuccess: onDone },
    );
  }

  return (
    <>
      <input
        autoFocus
        value={point}
        inputMode="numeric"
        onChange={(event) => setPoint(event.target.value.replace(/[^0-9]/g, ""))}
        className="w-full rounded border border-base-300 px-2 py-1 text-right text-body font-mono focus:border-primary focus:outline-none"
        aria-label={`Reorder point for ${row.sku}`}
        data-testid={`reorder-input-${row.sku}`}
      />
      <input
        value={leadDays}
        inputMode="numeric"
        onChange={(event) => setLeadDays(event.target.value.replace(/[^0-9]/g, ""))}
        onKeyDown={(event) => {
          if (event.key === "Enter") submit();
          if (event.key === "Escape") onDone();
        }}
        className="w-full rounded border border-base-300 px-2 py-1 text-right text-body font-mono focus:border-primary focus:outline-none"
        aria-label={`Lead days for ${row.sku}`}
        data-testid={`lead-days-input-${row.sku}`}
      />
      <div className="flex justify-end gap-1">
        <button
          type="button"
          onClick={submit}
          disabled={!valid || save.isPending}
          className="text-success-700 disabled:text-base-300"
          aria-label="Save stock settings"
          data-testid={`reorder-save-${row.sku}`}
        >
          <Check size={16} strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={onDone}
          className="text-base-400 hover:text-base-700"
          aria-label="Cancel"
        >
          <X size={16} strokeWidth={2} />
        </button>
      </div>
    </>
  );
}

function ReorderRow({
  row,
  canEdit,
  editing,
  onEdit,
  onDone,
}: {
  row: OpsReorderRow;
  canEdit: boolean;
  editing: boolean;
  onEdit: () => void;
  onDone: () => void;
}) {
  return (
    <div
      className="grid items-center gap-3 py-2 border-t border-base-100"
      style={{ gridTemplateColumns: "1fr 64px 64px 84px 132px 28px" }}
      data-testid={`reorder-row-${row.sku}`}
    >
      <div className="min-w-0">
        <div className="text-body text-base-900 truncate" title={row.sku}>
          {row.sku}
        </div>
        {row.kind ? (
          <div className="text-label text-base-500">
            {/* `kind` IS the governed word now (`accShort`), so the old
                M.P → "Protector" translation table is gone — one word, one
                place. */}
            {row.kind}
            {row.leadDays != null ? ` · ${row.leadDays} days to arrive` : ""}
          </div>
        ) : null}
      </div>

      <span className="text-right font-mono text-body text-base-900">
        {row.onHand}
      </span>
      <span
        className={`text-right font-mono text-body ${
          row.incoming > 0 ? "text-base-900" : "text-base-400"
        }`}
      >
        {row.incoming}
      </span>
      <span className="text-right font-mono text-body text-base-700">
        {row.reorderPoint == null ? "—" : row.reorderPoint}
      </span>

      <div className="min-w-0">
        {editing ? (
          <PointEditor row={row} onDone={onDone} />
        ) : (
          <StatePill row={row} />
        )}
      </div>

      <div className="text-right">
        {canEdit && !editing ? (
          <button
            type="button"
            onClick={onEdit}
            className="text-base-400 hover:text-primary"
            aria-label={`Set reorder point for ${row.sku}`}
            data-testid={`reorder-edit-${row.sku}`}
          >
            <Pencil size={14} strokeWidth={2} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function StatePill({ row }: { row: OpsReorderRow }) {
  if (row.state === "reorder") {
    return (
      <span className="pill pill-overdue" data-testid={`reorder-state-${row.sku}`}>
        Reorder stock
        {row.shortfall > 0 ? ` · ${row.shortfall} short` : ""}
      </span>
    );
  }
  if (row.state === "unset") {
    return (
      <span className="pill pill-neutral" data-testid={`reorder-state-${row.sku}`}>
        Set a number
      </span>
    );
  }
  return (
    <span
      className="text-meta text-base-500"
      data-testid={`reorder-state-${row.sku}`}
    >
      {row.reorderPoint === 0 ? "No alert" : "Enough"}
    </span>
  );
}

function PointEditor({ row, onDone }: { row: OpsReorderRow; onDone: () => void }) {
  const [value, setValue] = useState(String(row.reorderPoint ?? 200));
  const save = useSetReorderPoint();
  const n = Number(value);
  const valid = value.trim() !== "" && Number.isInteger(n) && n >= 0 && n <= 100000;

  function submit() {
    if (!valid || save.isPending) return;
    save.mutate(
      { sku: row.sku, reorderPoint: n, leadDays: row.leadDays ?? 60 },
      { onSuccess: onDone },
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        autoFocus
        value={value}
        inputMode="numeric"
        onChange={(e) => setValue(e.target.value.replace(/[^0-9]/g, ""))}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") onDone();
        }}
        className="w-[62px] rounded border border-base-300 px-2 py-1 text-body font-mono focus:border-primary focus:outline-none"
        aria-label={`Reorder point for ${row.sku}`}
        data-testid={`reorder-input-${row.sku}`}
      />
      <button
        type="button"
        onClick={submit}
        disabled={!valid || save.isPending}
        className="text-success-700 disabled:text-base-300"
        aria-label="Save reorder point"
        data-testid={`reorder-save-${row.sku}`}
      >
        <Check size={16} strokeWidth={2} />
      </button>
      <button
        type="button"
        onClick={onDone}
        className="text-base-400 hover:text-base-700"
        aria-label="Cancel"
        data-testid={`reorder-cancel-${row.sku}`}
      >
        <X size={16} strokeWidth={2} />
      </button>
      {save.isError ? (
        <span
          className="text-label text-danger"
          data-testid={`reorder-error-${row.sku}`}
        >
          Not saved
        </span>
      ) : (
        <span className="text-label text-base-400">0 = off</span>
      )}
    </div>
  );
}
