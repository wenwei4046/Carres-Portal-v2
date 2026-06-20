import { useId } from "react";
import { Camera, Paperclip, Check, Image, RefreshCw } from "lucide-react";
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
 *
 * 2990s re-skin: dashed drop tile with Lucide camera icon; no emoji.
 * All 5 MB cap, ACCEPT types, and base64-into-draft behaviour unchanged.
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
        <div className="rounded-xl border-[1.5px] border-primary/30 bg-signature-50 p-2.5 flex items-center gap-3">
          {isImage && (
            <img
              src={slip.dataUrl}
              alt=""
              className="w-14 h-14 object-cover rounded-lg border border-base-200 shrink-0"
            />
          )}
          {!isImage && (
            <div className="w-14 h-14 grid place-items-center rounded-lg border border-base-200 bg-white shrink-0">
              <Image size={20} className="text-base-400" strokeWidth={1.75} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-primary">
              <Check size={14} strokeWidth={1.75} />
              Attached
            </div>
            <div className="font-mono text-[11px] text-base-600 truncate mt-0.5">
              {slip.name} · {(slip.size / 1024).toFixed(0)} KB
            </div>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="btn-ghost text-[11px] px-2.5 py-1 inline-flex items-center gap-1"
          >
            <RefreshCw size={12} strokeWidth={1.75} />
            Replace
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="label mb-1.5">{label}</div>
      <div className="border-[1.5px] border-dashed border-base-300 rounded-xl bg-card px-4 py-6 text-center flex flex-col items-center gap-3">
        {/* Camera icon tile */}
        <div className="w-10 h-10 rounded-xl bg-signature-50 flex items-center justify-center">
          <Camera size={20} className="text-primary" strokeWidth={1.75} />
        </div>

        <p className="text-[11px] text-base-500 max-w-[260px] mx-auto">
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
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-[13px] font-semibold cursor-pointer"
            >
              <Camera size={14} strokeWidth={1.75} />
              Take photo
            </label>
          )}
          <label
            htmlFor={fileId}
            role="button"
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold cursor-pointer ${
              isTouch
                ? "bg-white text-base-800 border-[1.5px] border-base-200"
                : "bg-primary text-primary-foreground"
            }`}
          >
            <Paperclip size={14} strokeWidth={1.75} />
            {isTouch ? "Choose from gallery" : "Attach file"}
          </label>
        </div>
      </div>
    </div>
  );
}
