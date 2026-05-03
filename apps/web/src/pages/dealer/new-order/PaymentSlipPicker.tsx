import { useId } from "react";
import type { DraftAttachment } from "./draft";

interface Props {
  label: string;
  hint: string;
  slip: DraftAttachment | null;
  onChange: (next: DraftAttachment | null) => void;
}

const ACCEPT = "image/png,image/jpeg,image/heic,image/heif,application/pdf";
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Mobile / tablet → "Take photo" + "Choose from gallery" (camera input + file).
 * Desktop → single "Attach file". Selected file is base64-encoded into the
 * draft so a refresh / step-nav doesn't lose the slip preview; the actual
 * upload to Supabase Storage runs at Submit time (see Step3SignaturePayment).
 *
 * Trigger pattern: uses `<label htmlFor>` instead of `ref.click()` so the
 * picker opens reliably across browsers (Chrome's user-activation rules can
 * silently swallow programmatic .click() on hidden inputs in some setups).
 */
export default function PaymentSlipPicker({ label, hint, slip, onChange }: Props) {
  const cameraId = useId();
  const fileId = useId();

  const isTouch =
    typeof window !== "undefined" &&
    ("ontouchstart" in window || navigator.maxTouchPoints > 0);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_BYTES) {
      // Trade UX nicety for code simplicity — we just bail. The dealer can
      // re-pick a smaller file. The 5 MB cap is signposted in the hint.
      alert(`File is ${(f.size / 1024 / 1024).toFixed(1)} MB — max is 5 MB.`);
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = String(ev.target?.result ?? "");
      onChange({ name: f.name, size: f.size, mime: f.type || "application/octet-stream", dataUrl });
    };
    reader.readAsDataURL(f);
    e.target.value = ""; // allow re-picking the same file
  }

  if (slip) {
    const isImage = slip.mime.startsWith("image/");
    return (
      <div>
        <div className="label mb-1.5">{label}</div>
        <div className="rounded border border-success bg-success-soft p-2.5 flex items-center gap-3">
          {isImage && (
            <img
              src={slip.dataUrl}
              alt=""
              className="w-14 h-14 object-cover rounded border border-base-200 shrink-0"
            />
          )}
          {!isImage && (
            <div className="w-14 h-14 grid place-items-center rounded border border-base-200 bg-card shrink-0 text-[10px] font-mono text-base-500">
              PDF
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-success">✓ Attached</div>
            <div className="font-mono text-[11px] text-base-600 truncate">
              {slip.name} · {(slip.size / 1024).toFixed(0)} KB
            </div>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="btn-ghost text-[11px] px-2.5 py-1"
          >
            ↻ Replace
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="label mb-1.5">{label}</div>
      <div className="border border-dashed border-base-300 rounded bg-card px-4 py-5 text-center">
        <p className="text-[11px] text-base-500 mb-3">
          {hint} · max 5&nbsp;MB
        </p>

        <input
          id={cameraId}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFile}
          className="sr-only"
          aria-label="Take photo"
        />
        <input
          id={fileId}
          type="file"
          accept={ACCEPT}
          onChange={handleFile}
          className="sr-only"
          aria-label="Attach file"
        />

        <div className="flex gap-2 justify-center flex-wrap">
          {isTouch && (
            <label
              htmlFor={cameraId}
              role="button"
              className="px-[18px] py-2.5 rounded bg-primary text-primary-foreground text-[13px] font-semibold cursor-pointer"
            >
              📷 Take photo
            </label>
          )}
          <label
            htmlFor={fileId}
            role="button"
            className={`px-[18px] py-2.5 rounded text-[13px] font-semibold cursor-pointer ${
              isTouch
                ? "bg-white text-base-800 border border-base-300"
                : "bg-primary text-primary-foreground"
            }`}
          >
            📎 {isTouch ? "Choose from gallery" : "Attach file"}
          </label>
        </div>
      </div>
    </div>
  );
}
