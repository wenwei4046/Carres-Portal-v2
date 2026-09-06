import { useState } from "react";
import { apiFetch } from "../lib/api";
import { supabase } from "../lib/supabase";
import type { ReceivingArrivalEvidence } from "@carres/shared";

/**
 * ArrivalEvidenceUploadField — the Receiving Session's arrival evidence
 * (owner instruction 2026-09-04 §5C: "Arrival evidence supports both photo
 * and video").
 *
 * Same signed-upload door as the DO photo and claim photos
 * (`POST /api/storage/dos/sign-upload`, USER JWT, Storage RLS is the
 * boundary), with `kind: "arrival"` so the object key says what it is. The
 * bucket's 10 MiB limit still governs, so a video is a short clip of the
 * truck/pallet, not a film. `capture` invites the phone camera directly on
 * mobile without blocking a gallery pick on desktop.
 */
const ALLOWED_MIMES = [
  "image/jpeg",
  "image/png",
  "video/mp4",
  "video/quicktime",
  "video/webm",
];
const MAX_SIZE = 10 * 1024 * 1024;

type Props = {
  poId: string;
  doNumber: string;
  entries: ReceivingArrivalEvidence[];
  onChange: (entries: ReceivingArrivalEvidence[]) => void;
  testId?: string;
};

export default function ArrivalEvidenceUploadField({
  poId,
  doNumber,
  entries,
  onChange,
  testId,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setBusy(true);
    const uploaded: ReceivingArrivalEvidence[] = [];
    try {
      for (const file of files) {
        if (!ALLOWED_MIMES.includes(file.type)) {
          setError(`${file.name}: use a JPG/PNG photo or an MP4/MOV/WebM video.`);
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
              do_number: doNumber,
              mime_type: file.type,
              size_bytes: file.size,
              kind: "arrival",
            }),
          },
        );
        const { error: uploadErr } = await supabase.storage
          .from("delivery-orders")
          .uploadToSignedUrl(sign.path, sign.token, file);
        if (uploadErr) throw uploadErr;
        uploaded.push({
          path: sign.path,
          kind: file.type.startsWith("video/") ? "video" : "photo",
        });
      }
      if (uploaded.length > 0) onChange([...entries, ...uploaded]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  const photos = entries.filter((e) => e.kind === "photo").length;
  const videos = entries.filter((e) => e.kind === "video").length;

  return (
    <div data-testid={testId}>
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="file"
          accept="image/jpeg,image/png,video/mp4,video/quicktime,video/webm"
          multiple
          onChange={handleChange}
          disabled={busy || doNumber.trim().length < 3}
          aria-label="Arrival evidence"
          className="text-label"
        />
        {entries.length > 0 && (
          <span
            className="text-label text-success font-body"
            data-testid={testId ? `${testId}-count` : undefined}
          >
            {[
              photos > 0 ? `${photos} photo${photos === 1 ? "" : "s"}` : null,
              videos > 0 ? `${videos} video${videos === 1 ? "" : "s"}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}{" "}
            attached
          </span>
        )}
      </div>
      {doNumber.trim().length < 3 && (
        <p className="text-label text-base-500 mt-1 font-body">
          Enter the supplier DO number first — the files are named after it.
        </p>
      )}
      {entries.length > 0 && (
        <ul className="mt-1 grid gap-0.5">
          {entries.map((en) => (
            <li key={en.path} className="flex items-center gap-2">
              <span className="font-mono text-label text-base-500 truncate max-w-[240px]">
                {en.path.split("/").pop()}
              </span>
              <span className="text-label text-base-400">{en.kind}</span>
              <button
                type="button"
                onClick={() => onChange(entries.filter((x) => x.path !== en.path))}
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
