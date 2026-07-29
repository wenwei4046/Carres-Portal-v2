import { useState } from "react";
import { ArrowDown, ArrowUp, Edit3, History, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { CatalogOptionPoolDto, CatalogOptionPoolName } from "@carres/shared";
import { ApiError } from "@/lib/api";
import { useBatchSaveOptionPool, useCatalogConfigHistory } from "@/lib/queries";
import { INPUT_CLS, Modal } from "@/pages/operation/components/Modal";

/**
 * PoolPanel (0201) — one global option pool as a 2990s-style maintenance panel:
 *
 *   • VIEW — numbered rows (`K · 6FT · 183X190CM`; priced pools right-align the
 *     RM surcharge, "—" when null) + an "Effective from <date>" line fed by the
 *     newest catalog_config_history snapshot.
 *   • EDIT (principal-only) — the whole pool becomes a draft (inline inputs,
 *     ↑/↓ reorder, remove, add row). Save = ONE batch PUT that atomically
 *     replaces the pool + appends a history snapshot (catalog_pool_batch_save).
 *   • HISTORY — a dialog listing every snapshot, newest first.
 *
 * Variants: "plain" (value only — gaps / sofa sizes / supplier categories),
 * "size" (value + label + dimensions — bed/mattress sizes), "priced" (value +
 * RM surcharge — divan / total / leg heights).
 */

export type PoolPanelVariant = "plain" | "size" | "priced";

interface DraftRow {
  value: string;
  label: string;
  dimensions: string;
  surcharge: string; // input text; "" = no surcharge (null)
  active: boolean;
}

function fmtRm(n: number): string {
  return n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function toDraft(entries: CatalogOptionPoolDto[]): DraftRow[] {
  return entries.map((e) => ({
    value: e.value,
    label: e.label ?? "",
    dimensions: e.dimensions ?? "",
    surcharge: e.surcharge == null ? "" : String(e.surcharge),
    active: e.active,
  }));
}

export default function PoolPanel({
  pool,
  title,
  description,
  entries,
  isPrincipal,
  variant,
}: {
  pool: CatalogOptionPoolName;
  title: string;
  description: string;
  entries: CatalogOptionPoolDto[];
  isPrincipal: boolean;
  variant: PoolPanelVariant;
}) {
  const save = useBatchSaveOptionPool();
  // Also feeds the header's "Effective from" line, so fetch while the panel is
  // mounted (one active panel at a time; rides the ["catalog"] invalidation).
  const historyQ = useCatalogConfigHistory(pool, true);
  const history = historyQ.data?.history ?? [];

  const [draft, setDraft] = useState<DraftRow[] | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const editing = draft !== null;

  const rows = entries.slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const effectiveFrom = history[0]?.effectiveFrom ?? null;

  // --- draft helpers -------------------------------------------------------
  const patchRow = (i: number, up: Partial<DraftRow>) =>
    setDraft((d) => (d ? d.map((r, idx) => (idx === i ? { ...r, ...up } : r)) : d));
  const removeRow = (i: number) => setDraft((d) => (d ? d.filter((_, idx) => idx !== i) : d));
  const addRow = () =>
    setDraft((d) =>
      d ? [...d, { value: "", label: "", dimensions: "", surcharge: "", active: true }] : d,
    );
  const moveRow = (i: number, dir: -1 | 1) =>
    setDraft((d) => {
      if (!d) return d;
      const j = i + dir;
      if (j < 0 || j >= d.length) return d;
      const next = d.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const draftValues = (draft ?? []).map((r) => r.value.trim()).filter((v) => v.length > 0);
  const hasDuplicates = new Set(draftValues).size !== draftValues.length;
  const surchargesValid = (draft ?? []).every(
    (r) => r.surcharge.trim() === "" || Number.isFinite(Number(r.surcharge)),
  );
  const canSave = draftValues.length > 0 && !hasDuplicates && surchargesValid;

  function submit() {
    if (!draft || !canSave) return;
    const input = {
      entries: draft
        .filter((r) => r.value.trim().length > 0)
        .map((r) => ({
          value: r.value.trim(),
          label: variant === "size" ? r.label.trim() || null : null,
          dimensions: variant === "size" ? r.dimensions.trim() || null : null,
          surcharge:
            variant === "priced" && r.surcharge.trim() !== "" ? Number(r.surcharge) : null,
          active: r.active,
        })),
    };
    save.mutate(
      { pool, input },
      {
        onSuccess: () => {
          setDraft(null);
          toast.success(`${title} saved`);
        },
        onError: (e: unknown) =>
          toast.error(e instanceof ApiError ? e.message : "Save failed"),
      },
    );
  }

  // --- grid template per variant (edit mode) -------------------------------
  const editCols =
    variant === "size"
      ? "24px minmax(90px,1fr) minmax(110px,1.1fr) minmax(110px,1.1fr) 60px 92px"
      : variant === "priced"
        ? "24px minmax(120px,1fr) 130px 60px 92px"
        : "24px minmax(140px,1fr) 60px 92px";

  return (
    <section data-testid={`pool-panel-${pool}`}>
      {/* header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="text-strong font-display text-base-900">{title}</div>
          <p className="text-meta text-base-500 mt-0.5 max-w-[520px]">
            {description}
            {!isPrincipal && " Principal only — read-only for your role."}
          </p>
          {effectiveFrom && (
            <p className="text-meta text-base-400 mt-1" data-testid={`pool-effective-${pool}`}>
              Effective from {effectiveFrom}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {editing ? (
            <>
              <button type="button" onClick={() => setDraft(null)} className="btn-ghost text-meta">
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!canSave || save.isPending}
                className="btn-primary text-meta disabled:opacity-40"
                data-testid={`pool-save-${pool}`}
              >
                {save.isPending ? "Saving…" : "Save"}
              </button>
            </>
          ) : (
            isPrincipal && (
              <button
                type="button"
                onClick={() => setDraft(toDraft(rows))}
                className="btn-ghost text-meta inline-flex items-center gap-1.5"
                data-testid={`pool-edit-${pool}`}
              >
                <Edit3 size={13} strokeWidth={2} /> Edit
              </button>
            )
          )}
          <button
            type="button"
            onClick={() => setShowHistory(true)}
            className="btn-ghost text-meta inline-flex items-center gap-1.5"
            data-testid={`pool-history-${pool}`}
          >
            <History size={13} strokeWidth={2} /> History
          </button>
        </div>
      </div>

      {/* body */}
      {!editing ? (
        <div className="flex flex-col gap-2.5">
          {rows.length === 0 && (
            <div className="text-body text-base-500 bg-white border border-base-200 rounded-[4px] px-4 py-5">
              No entries configured{isPrincipal ? " — press Edit to add some." : "."}
            </div>
          )}
          {rows.map((e, i) => (
            <div
              key={e.id}
              className={`flex items-center gap-3 bg-white border border-base-200 rounded-[4px] px-4 py-3 ${
                e.active ? "" : "opacity-60"
              }`}
              data-testid={`pool-row-${pool}-${e.value}`}
            >
              <span className="text-meta text-base-400 w-6 text-center tabular-nums shrink-0">
                {i + 1}
              </span>
              <span className="text-strong font-semibold text-base-900 min-w-0 truncate">
                {e.value}
                {variant === "size" && e.label ? ` · ${e.label}` : ""}
                {variant === "size" && e.dimensions ? ` · ${e.dimensions}` : ""}
              </span>
              {!e.active && <span className="pill pill-neutral shrink-0">OFF</span>}
              {variant === "priced" && (
                <span className="ml-auto t-num text-body text-base-900 shrink-0">
                  {e.surcharge != null ? (
                    <>
                      <span className="text-meta text-base-400 mr-1.5">RM</span>
                      {fmtRm(e.surcharge)}
                    </>
                  ) : (
                    <span className="text-base-300">—</span>
                  )}
                </span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {/* edit header row */}
          <div
            className="grid items-center gap-2 px-3 py-1.5"
            style={{ gridTemplateColumns: editCols }}
          >
            <span />
            <span className="label">Value</span>
            {variant === "size" && <span className="label">Label</span>}
            {variant === "size" && <span className="label">Dimensions</span>}
            {variant === "priced" && <span className="label text-right">Surcharge (RM)</span>}
            <span className="label text-center">Active</span>
            <span />
          </div>
          {(draft ?? []).map((r, i) => (
            <div
              key={i}
              className="grid items-center gap-2 bg-white border border-base-200 rounded-[4px] px-3 py-2"
              style={{ gridTemplateColumns: editCols }}
            >
              <span className="text-meta text-base-400 text-center tabular-nums">{i + 1}</span>
              <input
                value={r.value}
                onChange={(e) => patchRow(i, { value: e.target.value })}
                placeholder={variant === "size" ? "K" : 'e.g. 10"'}
                className={INPUT_CLS}
                aria-label={`row ${i + 1} value`}
              />
              {variant === "size" && (
                <input
                  value={r.label}
                  onChange={(e) => patchRow(i, { label: e.target.value })}
                  placeholder="6FT"
                  className={INPUT_CLS}
                  aria-label={`row ${i + 1} label`}
                />
              )}
              {variant === "size" && (
                <input
                  value={r.dimensions}
                  onChange={(e) => patchRow(i, { dimensions: e.target.value })}
                  placeholder="183X190CM"
                  className={`${INPUT_CLS} font-mono text-meta`}
                  aria-label={`row ${i + 1} dimensions`}
                />
              )}
              {variant === "priced" && (
                <input
                  type="number"
                  step="0.01"
                  value={r.surcharge}
                  onChange={(e) => patchRow(i, { surcharge: e.target.value })}
                  placeholder="—"
                  className={`${INPUT_CLS} text-right t-num text-meta`}
                  aria-label={`row ${i + 1} surcharge`}
                />
              )}
              <div className="text-center">
                <input
                  type="checkbox"
                  checked={r.active}
                  onChange={(e) => patchRow(i, { active: e.target.checked })}
                  className="accent-primary"
                  aria-label={`row ${i + 1} active`}
                />
              </div>
              <div className="flex items-center justify-end gap-1">
                <button
                  type="button"
                  onClick={() => moveRow(i, -1)}
                  disabled={i === 0}
                  className="btn-ghost px-1.5 py-1 disabled:opacity-30"
                  aria-label={`move row ${i + 1} up`}
                >
                  <ArrowUp size={13} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  onClick={() => moveRow(i, 1)}
                  disabled={i === (draft?.length ?? 0) - 1}
                  className="btn-ghost px-1.5 py-1 disabled:opacity-30"
                  aria-label={`move row ${i + 1} down`}
                >
                  <ArrowDown size={13} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  className="btn-danger px-1.5 py-1"
                  aria-label={`remove row ${i + 1}`}
                >
                  <Trash2 size={13} strokeWidth={2} />
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={addRow}
            className="btn-ghost text-meta self-start inline-flex items-center gap-1.5"
            data-testid={`pool-add-row-${pool}`}
          >
            <Plus size={13} strokeWidth={2} /> Add row
          </button>
          {hasDuplicates && (
            <p className="text-meta text-danger">Duplicate values — each value must be unique.</p>
          )}
          {!surchargesValid && (
            <p className="text-meta text-danger">Surcharge must be a number (or left empty).</p>
          )}
        </div>
      )}

      {/* history dialog */}
      {showHistory && (
        <Modal title={`History — ${title}`} onClose={() => setShowHistory(false)}>
          <div className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto pr-1">
            {historyQ.isLoading && <p className="text-body text-base-500">Loading history…</p>}
            {!historyQ.isLoading && history.length === 0 && (
              <p className="text-body text-base-500">No history yet — the first Edit save writes one.</p>
            )}
            {history.map((h) => (
              <div key={h.id} className="border border-base-200 rounded-[4px] p-3 bg-base-50">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-body font-medium text-base-900">
                    Effective from {h.effectiveFrom}
                  </div>
                  <div className="text-meta text-base-400">
                    saved {new Date(h.createdAt).toLocaleString("en-MY")}
                  </div>
                </div>
                {h.notes && <p className="text-meta text-base-500 mt-1">{h.notes}</p>}
                <div className="mt-2 flex flex-col gap-1">
                  {h.entries.map((e, i) => (
                    <div key={i} className="flex items-center gap-2 text-meta text-base-700">
                      <span className="text-base-400 w-5 text-center tabular-nums">{i + 1}</span>
                      <span className={e.active ? "" : "line-through text-base-400"}>
                        {e.value}
                        {e.label ? ` · ${e.label}` : ""}
                        {e.dimensions ? ` · ${e.dimensions}` : ""}
                      </span>
                      {e.surcharge != null && (
                        <span className="ml-auto t-num">RM {fmtRm(e.surcharge)}</span>
                      )}
                    </div>
                  ))}
                  {h.entries.length === 0 && (
                    <p className="text-meta text-base-400 italic">empty</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </section>
  );
}
