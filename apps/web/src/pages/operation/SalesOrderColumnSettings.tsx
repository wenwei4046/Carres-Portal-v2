import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { soGridColumnDef, type SoGridConfig } from "@carres/shared";
import { Modal, INPUT_CLS } from "./components/Modal";

// ===========================================================================
// Column Settings — the "maintenance" surface for the Sales Order grid.
// Reorder columns, rename labels, toggle visibility, and curate the option
// lists for option-type columns (Status / Item Group / Location / Agent / …).
// Edits are applied live to the parent's draft config; the parent owns Save
// (which PUTs the shared config for all internal users).
// ===========================================================================

export default function SalesOrderColumnSettings({
  config,
  optionsByKey,
  onChange,
  onClose,
}: {
  config: SoGridConfig;
  /** Observed option values per option-column (quick-add suggestions). */
  optionsByKey: Record<string, string[]>;
  onChange: (next: SoGridConfig) => void;
  onClose: () => void;
}) {
  const [optionEditor, setOptionEditor] = useState<string | null>(null);
  const [draftOption, setDraftOption] = useState("");

  const sorted = [...config.columns].sort((a, b) => a.order - b.order);

  function move(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= sorted.length) return;
    const a = sorted[idx];
    const b = sorted[j];
    onChange({
      ...config,
      columns: config.columns.map((c) => {
        if (c.key === a.key) return { ...c, order: b.order };
        if (c.key === b.key) return { ...c, order: a.order };
        return c;
      }),
    });
  }

  function toggleVisible(key: string) {
    onChange({
      ...config,
      columns: config.columns.map((c) =>
        c.key === key ? { ...c, visible: !c.visible } : c,
      ),
    });
  }

  function setLabel(key: string, label: string) {
    const def = soGridColumnDef(key);
    const useDefault = !label.trim() || label.trim() === def?.label;
    onChange({
      ...config,
      columns: config.columns.map((c) => {
        if (c.key !== key) return c;
        if (useDefault) {
          const { label: _drop, ...rest } = c;
          void _drop;
          return rest;
        }
        return { ...c, label: label.trim() };
      }),
    });
  }

  function setOptions(key: string, values: string[]) {
    const next = { ...config.options };
    if (values.length) next[key] = values;
    else delete next[key];
    onChange({ ...config, options: next });
  }

  function addOption(key: string, value: string) {
    const v = value.trim();
    if (!v) return;
    const cur = config.options[key] ?? [];
    if (cur.includes(v)) return;
    setOptions(key, [...cur, v]);
  }

  return (
    <Modal title="Column Settings" onClose={onClose} size="lg">
      <p className="t-small text-base-600 mb-3">
        Reorder, rename, show/hide columns, and maintain the option lists. Saved
        config is shared for everyone.
      </p>

      <div className="border border-base-200 rounded-[4px] divide-y divide-base-100 max-h-[55vh] overflow-auto">
        {sorted.map((c, idx) => {
          const def = soGridColumnDef(c.key);
          if (!def) return null;
          const isOption = !!def.option;
          const curated = config.options[c.key] ?? [];
          const suggestions = (optionsByKey[c.key] ?? []).filter(
            (v) => !curated.includes(v),
          );
          return (
            <div key={c.key} className="px-3 py-2">
              <div className="flex items-center gap-2">
                <div className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => move(idx, -1)}
                    disabled={idx === 0}
                    className="text-base-400 hover:text-base-700 disabled:opacity-20"
                    aria-label="Move up"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(idx, 1)}
                    disabled={idx === sorted.length - 1}
                    className="text-base-400 hover:text-base-700 disabled:opacity-20"
                    aria-label="Move down"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                </div>
                <input
                  type="checkbox"
                  checked={c.visible}
                  onChange={() => toggleVisible(c.key)}
                  aria-label={`Show ${def.label}`}
                />
                <input
                  value={c.label ?? def.label}
                  onChange={(e) => setLabel(c.key, e.target.value)}
                  className={`${INPUT_CLS} max-w-[220px]`}
                />
                <span className="pill pill-neutral shrink-0">{def.group}</span>
                {isOption && (
                  <button
                    type="button"
                    onClick={() =>
                      setOptionEditor((k) => (k === c.key ? null : c.key))
                    }
                    className="btn-ghost text-[12px] ml-auto"
                  >
                    {optionEditor === c.key ? "Hide options" : `Options (${curated.length})`}
                  </button>
                )}
              </div>

              {isOption && optionEditor === c.key && (
                <div className="mt-2 ml-7 pl-3 border-l-2 border-base-100">
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {curated.length === 0 && (
                      <span className="t-tiny text-base-400">
                        No curated options — falls back to values seen in the data.
                      </span>
                    )}
                    {curated.map((v) => (
                      <span
                        key={v}
                        className="inline-flex items-center gap-1 pill pill-neutral"
                      >
                        {v}
                        <button
                          type="button"
                          onClick={() => setOptions(c.key, curated.filter((x) => x !== v))}
                          aria-label={`Remove ${v}`}
                          className="hover:text-danger"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      value={optionEditor === c.key ? draftOption : ""}
                      onChange={(e) => setDraftOption(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addOption(c.key, draftOption);
                          setDraftOption("");
                        }
                      }}
                      placeholder="Add an option value…"
                      className={`${INPUT_CLS} max-w-[260px]`}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        addOption(c.key, draftOption);
                        setDraftOption("");
                      }}
                      className="btn-secondary text-[12px] inline-flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add
                    </button>
                  </div>
                  {suggestions.length > 0 && (
                    <div className="mt-2">
                      <div className="t-micro text-base-400 mb-1">Seen in data</div>
                      <div className="flex flex-wrap gap-1.5">
                        {suggestions.slice(0, 24).map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => addOption(c.key, v)}
                            className="t-tiny px-2 py-0.5 rounded-full border border-base-300 text-base-600 hover:border-base-500 hover:text-base-800"
                          >
                            + {v}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex justify-end mt-4">
        <button type="button" onClick={onClose} className="btn-primary text-[12px]">
          Done
        </button>
      </div>
    </Modal>
  );
}
