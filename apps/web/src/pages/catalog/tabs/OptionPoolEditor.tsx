import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { CatalogOptionPoolDto, CatalogOptionPoolName } from "@carres/shared";
import { ApiError } from "@/lib/api";
import {
  useCreateOptionPoolEntry,
  usePatchOptionPoolEntry,
  useDeleteOptionPoolEntry,
} from "@/lib/queries";
import { INPUT_CLS } from "@/pages/operation/components/Modal";

/**
 * OptionPoolEditor (0182) — renders ONE global option pool as an editable table.
 *
 * These are curated READ-ONLY reference lists (not a source of truth for any
 * order-side consumer):
 *   • supplier_category — just a `value` column.
 *   • bedframe_size / mattress_size — `value` + `label` + `dimensions` columns;
 *     fed as SUGGESTIONS into the per-model size picker (allowed_options.sizes
 *     stays the authoritative per-model source).
 *
 * Principal-only writes (RLS is the boundary; this UI gate is a friendly veneer):
 * when `!isPrincipal` every editing affordance is hidden / disabled.
 */
export default function OptionPoolEditor({
  pool,
  title,
  description,
  entries,
  isPrincipal,
}: {
  pool: CatalogOptionPoolName;
  title: string;
  description: string;
  entries: CatalogOptionPoolDto[];
  isPrincipal: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const withSize = pool !== "supplier_category";

  // active first (by sortOrder), inactive after — both sorted so the list is stable.
  const rows = entries
    .slice()
    .sort(
      (a, b) =>
        Number(b.active) - Number(a.active) ||
        a.sortOrder - b.sortOrder ||
        a.value.localeCompare(b.value, undefined, { numeric: true }),
    );

  // Grid template: value (+ label + dimensions for size pools) + active + actions.
  const cols = withSize
    ? "minmax(120px,1fr) minmax(140px,1.4fr) minmax(120px,1fr) 70px 70px"
    : "minmax(160px,1fr) 70px 70px";

  return (
    <section data-testid={`option-pool-${pool}`}>
      <div className="flex items-center justify-between mb-1">
        <div className="t-h4 font-display">{title}</div>
        {isPrincipal && (
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="btn-ghost text-[12px]"
            data-testid={`option-pool-add-toggle-${pool}`}
          >
            {adding ? "Close" : "+ Add entry"}
          </button>
        )}
      </div>
      <p className="t-tiny text-base-500 mb-3">
        {description}
        {!isPrincipal && " Principal only — read-only for your role."}
      </p>

      {adding && isPrincipal && (
        <OptionPoolAddForm pool={pool} withSize={withSize} onDone={() => setAdding(false)} />
      )}

      <div className="bg-white border border-base-200 rounded-[4px] overflow-hidden">
        <div
          className="grid items-center gap-3 px-3 py-2 bg-base-50 border-b border-base-200"
          style={{ gridTemplateColumns: cols }}
        >
          <div className="label">Value</div>
          {withSize && <div className="label">Label</div>}
          {withSize && <div className="label">Dimensions</div>}
          <div className="label text-center">Active</div>
          <div className="label text-right">Actions</div>
        </div>
        {rows.length === 0 && (
          <div className="t-small text-base-500 px-3 py-4">No entries configured.</div>
        )}
        {rows.map((e) => (
          <OptionPoolRow
            key={e.id}
            entry={e}
            withSize={withSize}
            cols={cols}
            isPrincipal={isPrincipal}
          />
        ))}
      </div>
    </section>
  );
}

function OptionPoolRow({
  entry,
  withSize,
  cols,
  isPrincipal,
}: {
  entry: CatalogOptionPoolDto;
  withSize: boolean;
  cols: string;
  isPrincipal: boolean;
}) {
  const patch = usePatchOptionPoolEntry();
  const del = useDeleteOptionPoolEntry();

  function commitValue(raw: string) {
    const next = raw.trim();
    if (next.length < 1 || next === entry.value) return;
    patch.mutate(
      { id: entry.id, patch: { value: next } },
      { onError: (err: unknown) => toast.error(err instanceof ApiError ? err.message : "Update failed") },
    );
  }
  function commitLabel(raw: string) {
    const next = raw.trim();
    if (next === (entry.label ?? "")) return;
    patch.mutate(
      { id: entry.id, patch: { label: next || null } },
      { onError: (err: unknown) => toast.error(err instanceof ApiError ? err.message : "Update failed") },
    );
  }
  function commitDimensions(raw: string) {
    const next = raw.trim();
    if (next === (entry.dimensions ?? "")) return;
    patch.mutate(
      { id: entry.id, patch: { dimensions: next || null } },
      { onError: (err: unknown) => toast.error(err instanceof ApiError ? err.message : "Update failed") },
    );
  }
  function toggleActive(active: boolean) {
    patch.mutate(
      { id: entry.id, patch: { active } },
      { onError: (err: unknown) => toast.error(err instanceof ApiError ? err.message : "Update failed") },
    );
  }
  function remove() {
    if (!confirm(`Delete "${entry.value}" from this pool? This removes the entry entirely.`)) return;
    del.mutate(entry.id, {
      onSuccess: () => toast.success(`${entry.value} removed`),
      onError: (err: unknown) => toast.error(err instanceof ApiError ? err.message : "Delete failed"),
    });
  }

  const cellCls =
    "w-full px-2 py-1 border border-transparent hover:border-base-200 focus:border-base-400 rounded-[3px] text-[13px] outline-none bg-transparent disabled:opacity-60";

  return (
    <div
      className={`grid items-center gap-3 px-3 py-2 border-b border-base-100 last:border-b-0 ${
        entry.active ? "" : "opacity-60"
      }`}
      style={{ gridTemplateColumns: cols }}
      data-testid={`option-pool-row-${entry.value}`}
    >
      <input
        defaultValue={entry.value}
        disabled={!isPrincipal}
        onBlur={(e) => commitValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        aria-label={`${entry.value} value`}
        className={cellCls}
      />
      {withSize && (
        <input
          defaultValue={entry.label ?? ""}
          disabled={!isPrincipal}
          onBlur={(e) => commitLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          aria-label={`${entry.value} label`}
          className={cellCls}
        />
      )}
      {withSize && (
        <input
          defaultValue={entry.dimensions ?? ""}
          disabled={!isPrincipal}
          onBlur={(e) => commitDimensions(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          aria-label={`${entry.value} dimensions`}
          className={`${cellCls} font-mono text-[12px]`}
        />
      )}
      <div className="text-center">
        <input
          type="checkbox"
          checked={entry.active}
          disabled={!isPrincipal || patch.isPending}
          onChange={(e) => toggleActive(e.target.checked)}
          className="accent-primary"
          aria-label={`${entry.value} active`}
          data-testid={`option-pool-active-${entry.value}`}
        />
      </div>
      <div className="text-right">
        {isPrincipal && (
          <button
            type="button"
            onClick={remove}
            disabled={del.isPending}
            className="btn-danger text-[11px] inline-flex items-center gap-1"
            aria-label={`Delete ${entry.value}`}
            data-testid={`option-pool-delete-${entry.value}`}
          >
            <Trash2 size={13} strokeWidth={2} />
          </button>
        )}
      </div>
    </div>
  );
}

function OptionPoolAddForm({
  pool,
  withSize,
  onDone,
}: {
  pool: CatalogOptionPoolName;
  withSize: boolean;
  onDone: () => void;
}) {
  const create = useCreateOptionPoolEntry();
  const [value, setValue] = useState("");
  const [label, setLabel] = useState("");
  const [dimensions, setDimensions] = useState("");
  const busy = create.isPending;

  const valid = value.trim().length >= 1;

  async function submit() {
    if (!valid) return;
    try {
      await create.mutateAsync({
        pool,
        value: value.trim(),
        label: withSize ? label.trim() || null : null,
        dimensions: withSize ? dimensions.trim() || null : null,
      });
      toast.success(`Added ${value.trim()}`);
      setValue("");
      setLabel("");
      setDimensions("");
      onDone();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Add failed");
    }
  }

  return (
    <div className="bg-base-50 border border-base-200 rounded-[4px] p-4 mb-3 flex flex-wrap gap-3 items-end">
      <label className="block">
        <span className="label block mb-1">Value</span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !withSize) submit();
          }}
          placeholder={withSize ? "Queen" : "mattress"}
          className={`${INPUT_CLS} w-40`}
          data-testid={`option-pool-form-value-${pool}`}
        />
      </label>
      {withSize && (
        <label className="block">
          <span className="label block mb-1">Label (optional)</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Queen"
            className={`${INPUT_CLS} w-44`}
            data-testid={`option-pool-form-label-${pool}`}
          />
        </label>
      )}
      {withSize && (
        <label className="block">
          <span className="label block mb-1">Dimensions (optional)</span>
          <input
            value={dimensions}
            onChange={(e) => setDimensions(e.target.value)}
            placeholder='60" × 75"'
            className={`${INPUT_CLS} w-44 font-mono`}
            data-testid={`option-pool-form-dimensions-${pool}`}
          />
        </label>
      )}
      <button
        type="button"
        onClick={submit}
        disabled={!valid || busy}
        className="btn-primary text-[12px] disabled:opacity-40"
        data-testid={`option-pool-form-submit-${pool}`}
      >
        {busy ? "Saving…" : "Add"}
      </button>
    </div>
  );
}
