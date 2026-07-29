import { useState } from "react";
import { apiFetch } from "../lib/api";
import { supabase } from "../lib/supabase";

/**
 * ClaimPhotoUploadField — R2 of the receiving & claim queue (Jess 2026-07-27).
 *
 * S2's evidence law, applied to receiving: **no evidence, no claim.** A damaged
 * or wrong-item report cannot be submitted until at least one photo is attached,
 * so this field is the thing standing between a shrugged "2 broken" and a case
 * the supplier can actually be shown.
 *
 * Multi-file by design — one photo is the minimum, not the target. Uploads go
 * through the same signed-upload door the DO file already uses
 * (`POST /api/storage/dos/sign-upload`, USER JWT, Storage RLS is the boundary),
 * with `kind: "claim"` so the object key says what it is:
 * `<po_id>/<uuid>-claim-<DO>.jpg`.
 *
 * Images only. A supplier claim is a photograph of a physical thing; accepting
 * a PDF here would invite a scanned document nobody can look at on a phone.
 */
const ALLOWED_MIMES = ["image/jpeg", "image/png"];
const MAX_SIZE = 10 * 1024 * 1024;

type Props = {
  poId: string;
  doNumber: string;
  /** Storage keys captured so far — owned by the parent (the receive payload). */
  paths: string[];
  onChange: (paths: string[]) => void;
  label: string;
  testId?: string;
};

export default function ClaimPhotoUploadField({
  poId,
  doNumber,
  paths,
  onChange,
  label,
  testId,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    setBusy(true);
    const uploaded: string[] = [];
    try {
      for (const file of files) {
        if (!ALLOWED_MIMES.includes(file.type)) {
          setError(`${file.name}: use a JPG or PNG photo.`);
          continue;
        }
        if (file.size > MAX_SIZE) {
          setError(`${file.name} is too large (max 10 MB).`);
          continue;
        }
        const sign = await apiFetch<{ token: string; path: string }>(
          "/api/storage/dos/sign-upload",
          {
            method: "POST",
            body: JSON.stringify({
              po_id: poId,
              // The DO number is what ties the photo to the delivery it came
              // off; the server sanitises it into the object key.
              do_number: doNumber,
              mime_type: file.type,
              size_bytes: file.size,
              kind: "claim",
            }),
          },
        );
        const { error: uploadErr } = await supabase.storage
          .from("delivery-orders")
          .uploadToSignedUrl(sign.path, sign.token, file);
        if (uploadErr) throw uploadErr;
        uploaded.push(sign.path);
      }
      if (uploaded.length > 0) onChange([...paths, ...uploaded]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      // Let the same file be picked again after a failure.
      e.target.value = "";
    }
  }

  return (
    <div data-testid={testId}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-label text-base-600 font-body">{label}</span>
        <input
          type="file"
          accept="image/jpeg,image/png"
          multiple
          onChange={handleChange}
          disabled={busy || doNumber.trim().length < 3}
          aria-label={label}
          className="text-label"
        />
        {paths.length > 0 && (
          <span
            className="text-label text-success font-body"
            data-testid={testId ? `${testId}-count` : undefined}
          >
            {paths.length} photo{paths.length === 1 ? "" : "s"} attached
          </span>
        )}
      </div>
      {doNumber.trim().length < 3 && (
        <p className="text-label text-base-500 mt-1 font-body">
          Enter the supplier DO number first — the photo files are named after it.
        </p>
      )}
      {paths.length > 0 && (
        <ul className="mt-1 grid gap-0.5">
          {paths.map((p) => (
            <li key={p} className="flex items-center gap-2">
              <span className="font-mono text-label text-base-500 truncate max-w-[240px]">
                {p.split("/").pop()}
              </span>
              <button
                type="button"
                onClick={() => onChange(paths.filter((x) => x !== p))}
                className="btn-ghost text-label py-0 px-1.5"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-danger text-label mt-1 font-body">{error}</p>}
    </div>
  );
}
