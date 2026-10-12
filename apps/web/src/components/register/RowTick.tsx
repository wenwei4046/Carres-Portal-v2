/**
 * RowTick — the listing's own tick box, for a row the engine does not draw
 * (an item line inside an opened row). It IS the engine's tick: the same label
 * and input classes from `DataGrid.module.css` (16 × 16, the selection
 * colour), so a group row and its item lines cannot differ (owner 13 Oct 2026).
 *
 * A tick is disabled only when the row cannot be chosen, and then it says why
 * on hover and to a screen reader.
 */
import styles from "./DataGrid.module.css";

export default function RowTick({ checked, disabled = false, onChange, label, why, testId }: {
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  /** What the tick chooses, for a screen reader. */
  label: string;
  /** Why it cannot be chosen. Shown only when disabled. */
  why?: string | null;
  testId?: string;
}) {
  const reason = disabled ? why ?? undefined : undefined;
  return (
    <label className={styles.checkHit} title={reason}>
      <input type="checkbox" aria-label={reason ? `${label}. ${reason}` : label} data-testid={testId}
        checked={checked} disabled={disabled} onChange={onChange} />
    </label>
  );
}
