import { Delete } from "lucide-react";

/**
 * Reusable 6-digit PIN keypad — the dots row + 0-9 grid + Clear/Delete utils,
 * extracted verbatim from OrderStatusPage's PinGate (2026-07-18, staff PIN
 * login) so the staff PinScreen and the legacy Order-Status gate share ONE
 * keypad. Styling stays on the `.pin-gate*` classes (pos-prototype.css); the
 * `testIdPrefix` keeps `os-pin-*` testids stable for OrderStatusPage's tests
 * and gives the staff screen its own `staff-pin-*` namespace.
 *
 * Controlled + presentational: the parent owns the entered value and the
 * bad-PIN shake, and maps each key press to its own verify / clear logic.
 */
export default function PinPad({
  pin,
  onKey,
  error = false,
  testIdPrefix = "os-pin",
  disabled = false,
}: {
  pin: string;
  /** k ∈ "0".."9" | "del" (backspace) | "clr" (wipe). */
  onKey: (k: string) => void;
  error?: boolean;
  testIdPrefix?: string;
  disabled?: boolean;
}) {
  return (
    <>
      <div className={`pin-gate__dots ${error ? "is-err" : ""}`}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className={`pin-gate__dot ${error ? "is-err" : pin.length > i ? "is-on" : ""}`}
          ></span>
        ))}
      </div>

      <div className="pin-gate__pad">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k) => (
          <button
            key={k}
            type="button"
            className="pin-gate__key"
            onClick={() => onKey(k)}
            disabled={disabled}
            data-testid={`${testIdPrefix}-${k}`}
          >
            {k}
          </button>
        ))}
        <button
          type="button"
          className="pin-gate__key pin-gate__key--util"
          onClick={() => onKey("clr")}
          disabled={disabled}
        >
          Clear
        </button>
        <button
          type="button"
          className="pin-gate__key"
          onClick={() => onKey("0")}
          disabled={disabled}
          data-testid={`${testIdPrefix}-0`}
        >
          0
        </button>
        <button
          type="button"
          className="pin-gate__key pin-gate__key--util"
          onClick={() => onKey("del")}
          disabled={disabled}
          aria-label="Delete"
        >
          <Delete size={16} strokeWidth={1.75} />
        </button>
      </div>
    </>
  );
}
