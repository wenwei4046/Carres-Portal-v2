import { useState } from "react";
import { PieChart, ShieldAlert, Pencil, Check, X } from "lucide-react";
import { RESERVE_LEVEL_MAX, type OpsReserveLevelRow } from "@carres/shared";
import { useStockUsage, useSetReserveLevel } from "@/lib/queries";
import { fmtDate } from "@/lib/fmt-date";

/**
 * Where the ready stock went — Ready Stock card K4 (migration 0292).
 *
 * "Usage split (Sales 60% / supplier-delay 25% / …) readable per month" and
 * "each SKU carries a COO-set reserve level". Two questions, one screen,
 * because they are the same conversation: what drained the pool, and how low
 * it is allowed to get.
 *
 * WHY THE SPLIT SHOWS DRAWS BESIDE UNITS
 * A bulk accessory record is ONE row of N units (0218), so a single pillow
 * draw is 555 units. Printing only units would make one act look like a
 * month of demand; printing only acts would hide the pillows entirely.
 *
 * WHY AN EMPTY MONTH SAYS SO OUT LOUD
 * K1's law: a quiet screen must mean "watched and fine", never "nobody has
 * looked". Nothing was seeded, so until somebody takes a unit through the
 * reserve door this reads as an honest blank, and each SKU's reserve level
 * reads "Set a number" rather than a reassuring tick.
 *
 * The percentages, the low/ok/unset states and the sort order are all decided
 * SERVER-side by the shared engine; this file renders the answer.
 */

const BAR = ["w-full"] as const; // guard: widths are inline, never Tailwind-dynamic

export default function PoolUsagePanel({ period }: { period: string }) {
  const { data, isLoading, isError, error } = useStockUsage(period);

  return (
    <section className="mt-8" data-testid="pool-usage">
      <header className="mb-3">
        <div className="flex items-center gap-2">
          <PieChart size={16} strokeWidth={2} className="text-primary" />
          <h2 className="t-h3 text-base-900">Where the ready stock went</h2>
          {data && data.lowCount > 0 ? (
            <span className="pill pill-warning" data-testid="pool-low-count">
              {data.lowCount} at the reserve level
            </span>
          ) : null}
        </div>
        <div className="text-[13px] text-base-600 mt-1">
          Every unit taken off the shelf says why. Set how low each item may go
          — the screen reminds whoever takes the next one, and never stops them.
        </div>
      </header>

      {isLoading ? (
        <p className="text-sm text-base-500">Loading…</p>
      ) : isError || !data ? (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-sm">
          <div className="text-destructive font-semibold mb-1">
            Couldn&rsquo;t load the usage split
          </div>
          <div className="text-[12px] text-base-700">
            {(error as Error | undefined)?.message ?? "Unknown error"}
          </div>
        </div>
      ) : (
        // Every list is defaulted: a browser on this build talking to an API
        // that predates K4 must show an empty month, never a white screen.
        <div className="grid gap-4 lg:grid-cols-2">
          <UsageSplit data={data} />
          <ReserveLevels rows={data.levels ?? []} canEdit={data.canEdit ?? false} />
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

function UsageSplit({
  data,
}: {
  data: NonNullable<ReturnType<typeof useStockUsage>["data"]>;
}) {
  const [showLog, setShowLog] = useState(false);
  const byReason = data.byReason ?? [];
  const bySku = data.bySku ?? [];
  const entries = data.entries ?? [];

  return (
    <div className="rounded border border-base-200 bg-white" data-testid="usage-split">
      <header className="px-4 py-3 border-b border-base-100 flex items-baseline justify-between gap-3">
        <div className="t-h4 text-base-900">This month</div>
        <div className="text-[12px] text-base-600">
          <span className="font-mono tabular-nums text-base-900">
            {data.totalUnits ?? 0}
          </span>{" "}
          {data.totalUnits === 1 ? "unit" : "units"} ·{" "}
          <span className="font-mono tabular-nums">{data.totalDraws ?? 0}</span>{" "}
          {data.totalDraws === 1 ? "time" : "times"}
        </div>
      </header>

      {byReason.length === 0 ? (
        <div
          className="px-4 py-8 text-center text-[13px] text-base-500"
          data-testid="usage-empty"
        >
          Nothing has been taken from ready stock this month.
        </div>
      ) : (
        <>
          <div className="px-4 py-3 flex flex-col gap-2.5">
            {byReason.map((s) => (
              <div key={s.reason} data-testid={`usage-reason-${s.reason}`}>
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="text-base-900 truncate">{s.label}</span>
                  <span className="shrink-0 text-base-600">
                    <span className="font-mono tabular-nums text-base-900 font-semibold">
                      {s.share}%
                    </span>{" "}
                    <span className="text-[12px]">
                      · <span className="font-mono tabular-nums">{s.units}</span>{" "}
                      {s.units === 1 ? "unit" : "units"} ·{" "}
                      <span className="font-mono tabular-nums">{s.draws}</span>×
                    </span>
                  </span>
                </div>
                {/* Greyscale on purpose — UI-KIT rule 2 keeps colour for
                    action / selection / status / alert, and a usage split is
                    none of those. */}
                <div className={`mt-1 h-[6px] rounded bg-base-100 ${BAR[0]}`}>
                  <div
                    className="h-full rounded bg-base-600"
                    style={{ width: `${s.share}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {bySku.length > 0 ? (
            <div className="px-4 pb-3">
              <div className="t-micro text-base-400 mb-1.5">Most drawn on</div>
              {bySku.slice(0, 5).map((s) => (
                <div
                  key={s.sku}
                  className="flex items-baseline justify-between gap-3 text-[12px] py-0.5"
                  data-testid={`usage-sku-${s.sku}`}
                >
                  <span className="text-base-700 truncate" title={s.sku}>
                    {s.sku}
                  </span>
                  <span className="shrink-0 text-base-500">
                    <span className="font-mono tabular-nums text-base-900">
                      {s.units}
                    </span>{" "}
                    · mostly {s.topReasonLabel}
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          <div className="px-4 py-2 border-t border-base-100">
            <button
              type="button"
              onClick={() => setShowLog((v) => !v)}
              className="btn-ghost text-[12px] py-1"
              data-testid="usage-log-toggle"
            >
              {showLog ? "Hide the list" : `Show all ${entries.length}`}
            </button>
            {showLog ? (
              <div className="mt-1" data-testid="usage-log">
                {entries.map((e) => (
                  <div
                    key={e.id}
                    className="text-[12px] text-base-600 py-1 border-t border-base-100 first:border-t-0"
                  >
                    <span className="text-base-900">{e.sku}</span>{" "}
                    <span className="font-mono tabular-nums">&times;{e.qty}</span>{" "}
                    · {e.label}
                    {e.ref ? ` · ${e.ref}` : ""}
                    {e.takenByName ? ` · ${e.takenByName}` : ""}
                    <span className="text-base-400"> · {fmtDate(e.takenAt)}</span>
                    {e.note ? <span className="text-base-500"> · {e.note}</span> : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function ReserveLevels({
  rows,
  canEdit,
}: {
  rows: OpsReserveLevelRow[];
  canEdit: boolean;
}) {
  // Only the ones that need a decision or are already low sit on top; the
  // healthy tail is one click away rather than 49 rows of noise.
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? rows : rows.slice(0, 8);

  return (
    <div
      className="rounded border border-base-200 bg-white"
      data-testid="reserve-levels"
    >
      <header className="px-4 py-3 border-b border-base-100 flex items-center gap-2">
        <ShieldAlert size={16} strokeWidth={2} className="text-base-400" />
        <div>
          <div className="t-h4 text-base-900">How low it may go</div>
          <div className="text-[12px] text-base-600 mt-0.5">
            {canEdit
              ? "Your number. Taking stock past it warns, never blocks."
              : "Set by the COO. Taking stock past it warns, never blocks."}
          </div>
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="px-4 py-8 text-center text-[13px] text-base-500">
          No stock on the floor to keep a level for.
        </div>
      ) : (
        <>
          {shown.map((r) => (
            <ReserveLevelRowView key={r.sku} row={r} canEdit={canEdit} />
          ))}
          {rows.length > shown.length ? (
            <div className="px-4 py-2 border-t border-base-100">
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="btn-ghost text-[12px] py-1"
                data-testid="reserve-levels-more"
              >
                Show the other {rows.length - shown.length}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function ReserveLevelRowView({
  row,
  canEdit,
}: {
  row: OpsReserveLevelRow;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(row.reserveLevel ?? ""));
  const save = useSetReserveLevel();

  const n = Number(value);
  const valid =
    value.trim() !== "" && Number.isInteger(n) && n >= 0 && n <= RESERVE_LEVEL_MAX;

  return (
    <div
      className="px-4 py-2 border-t border-base-100 first:border-t-0 flex items-center justify-between gap-3"
      data-testid={`reserve-level-${row.sku}`}
    >
      <div className="min-w-0">
        <div className="text-[13px] text-base-900 truncate" title={row.sku}>
          {row.sku}
        </div>
        <div className="text-[12px] text-base-500">
          <span className="font-mono tabular-nums text-base-900">{row.free}</span>{" "}
          free
          {row.reserved > 0 ? (
            <>
              {" "}
              · <span className="font-mono tabular-nums">{row.reserved}</span>{" "}
              spoken for
            </>
          ) : null}
          {row.state === "low" ? (
            <span className="text-warning-700">
              {" "}
              · <span className="font-mono tabular-nums">{row.shortfall}</span>{" "}
              below the level
            </span>
          ) : null}
        </div>
      </div>

      <div className="shrink-0 flex items-center gap-2">
        {editing ? (
          <>
            <input
              autoFocus
              value={value}
              inputMode="numeric"
              onChange={(e) => setValue(e.target.value.replace(/[^0-9]/g, ""))}
              className="w-[70px] rounded border border-base-300 px-2 py-1 text-[13px] font-mono text-right focus:border-primary focus:outline-none"
              aria-label={`Reserve level for ${row.sku}`}
              data-testid={`reserve-level-input-${row.sku}`}
            />
            <button
              type="button"
              onClick={() =>
                save.mutate(
                  { sku: row.sku, reserveLevel: n },
                  { onSuccess: () => setEditing(false) },
                )
              }
              disabled={!valid || save.isPending}
              className="btn-primary text-[12px] py-1 px-2 disabled:opacity-40"
              data-testid={`reserve-level-save-${row.sku}`}
            >
              <Check size={14} strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={() => {
                setValue(String(row.reserveLevel ?? ""));
                setEditing(false);
              }}
              className="btn-ghost text-[12px] py-1 px-1"
            >
              <X size={14} strokeWidth={2} />
            </button>
          </>
        ) : (
          <>
            <span
              className={`pill ${
                row.state === "low"
                  ? "pill-overdue"
                  : row.state === "unset"
                    ? "pill-neutral"
                    : "pill-confirmed"
              }`}
              data-testid={`reserve-level-state-${row.sku}`}
            >
              {row.state === "unset"
                ? "Set a number"
                : row.reserveLevel === 0
                  ? "No reminder"
                  : `Keep ${row.reserveLevel}`}
            </span>
            {canEdit ? (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="p-1 text-base-400 hover:text-base-900"
                aria-label={`Set the reserve level for ${row.sku}`}
                data-testid={`reserve-level-edit-${row.sku}`}
              >
                <Pencil size={14} strokeWidth={2} />
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
