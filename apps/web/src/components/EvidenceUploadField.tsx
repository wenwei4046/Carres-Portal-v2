import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

/**
 * EvidenceUploadField — the ONE multi-file evidence picker (unified
 * Warehouse Inbound/Outbound card §9, 2026-09-07).
 *
 * The operator's reality is several photos and sometimes a video per act,
 * picked in one go or added across picks. So this field:
 *
 *   - accepts photos and videos MIXED, multiple at once, appending across
 *     picks — a new pick never replaces an earlier file;
 *   - shows every file with its own preview (a photo renders, a video
 *     plays), its own progress, its own failure and its own Retry;
 *   - lets a mis-pick be removed BEFORE the act is saved — after saving,
 *     the server's append-only ledger owns the files and nothing here can
 *     touch them;
 *   - states the allowed formats and sizes BEFORE a file is chosen.
 *
 * The caller supplies the signing door and the bucket; the field never
 * invents a path — the server names every object key.
 */

export interface EvidenceEntry {
  path: string;
  kind: "photo" | "video";
}

interface FileState {
  id: string;
  name: string;
  kind: "photo" | "video";
  previewUrl: string;
  status: "uploading" | "failed" | "done";
  error?: string;
  path?: string;
  file: File;
}

type Props = {
  /** Successful uploads, owned by the caller's form state. */
  entries: EvidenceEntry[];
  onChange: (entries: EvidenceEntry[]) => void;
  /** The caller's own signing door — returns a signed upload slot. */
  sign: (file: File) => Promise<{ token: string; path: string }>;
  /** The private storage bucket the signed slot belongs to. */
  bucket: string;
  imageMimes: readonly string[];
  videoMimes: readonly string[];
  imageMaxBytes: number;
  videoMaxBytes: number;
  maxFiles: number;
  ariaLabel: string;
  disabled?: boolean;
  testId?: string;
};

const mb = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;

export default function EvidenceUploadField({
  entries,
  onChange,
  sign,
  bucket,
  imageMimes,
  videoMimes,
  imageMaxBytes,
  videoMaxBytes,
  maxFiles,
  ariaLabel,
  disabled,
  testId,
}: Props) {
  const [files, setFiles] = useState<FileState[]>([]);
  const [pickError, setPickError] = useState<string | null>(null);
  /* onChange must see the freshest entries even when two uploads finish in
     the same tick — read through a ref, never a stale closure. */
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  useEffect(
    () => () => files.forEach((f) => URL.revokeObjectURL(f.previewUrl)),
    // Revoke on unmount only — previews live for the field's whole life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  async function upload(state: FileState) {
    setFiles((prev) =>
      prev.map((f) =>
        f.id === state.id ? { ...f, status: "uploading", error: undefined } : f,
      ),
    );
    try {
      const slot = await sign(state.file);
      const { error } = await supabase.storage
        .from(bucket)
        .uploadToSignedUrl(slot.path, slot.token, state.file);
      if (error) throw error;
      setFiles((prev) =>
        prev.map((f) =>
          f.id === state.id ? { ...f, status: "done", path: slot.path } : f,
        ),
      );
      onChange([
        ...entriesRef.current,
        { path: slot.path, kind: state.kind },
      ]);
    } catch (err) {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === state.id
            ? {
                ...f,
                status: "failed",
                error: err instanceof Error ? err.message : "Upload failed",
              }
            : f,
        ),
      );
    }
  }

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    setPickError(null);
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (picked.length === 0) return;
    const room = maxFiles - files.filter((f) => f.status !== "failed").length;
    if (picked.length > room) {
      setPickError(`At most ${maxFiles} files per record.`);
      return;
    }
    for (const file of picked) {
      const isVideo = videoMimes.includes(file.type);
      const isImage = imageMimes.includes(file.type);
      if (!isVideo && !isImage) {
        setPickError(`${file.name}: this file type is not accepted.`);
        continue;
      }
      const cap = isVideo ? videoMaxBytes : imageMaxBytes;
      if (file.size > cap) {
        setPickError(`${file.name} is too large (max ${mb(cap)}).`);
        continue;
      }
      const state: FileState = {
        id: crypto.randomUUID(),
        name: file.name,
        kind: isVideo ? "video" : "photo",
        previewUrl: URL.createObjectURL(file),
        status: "uploading",
        file,
      };
      setFiles((prev) => [...prev, state]);
      void upload(state);
    }
  }

  function remove(state: FileState) {
    URL.revokeObjectURL(state.previewUrl);
    setFiles((prev) => prev.filter((f) => f.id !== state.id));
    if (state.path)
      onChange(entriesRef.current.filter((x) => x.path !== state.path));
  }

  const photos = entries.filter((x) => x.kind === "photo").length;
  const videos = entries.filter((x) => x.kind === "video").length;

  return (
    <div data-testid={testId}>
      <input
        type="file"
        accept={[...imageMimes, ...videoMimes].join(",")}
        multiple
        onChange={handlePick}
        disabled={disabled}
        aria-label={ariaLabel}
        className="text-label"
        data-testid={testId ? `${testId}-input` : undefined}
      />
      {/* The limits are stated BEFORE a file is chosen (§9). */}
      <p className="mt-0.5 text-label text-base-500">
        Photos (JPG, PNG, WEBP) up to {mb(imageMaxBytes)} · videos (MP4, MOV,
        WEBM) up to {mb(videoMaxBytes)} · up to {maxFiles} files. Pick several
        at once, or add more later.
      </p>
      {files.length > 0 && (
        <ul className="mt-1 grid gap-1">
          {files.map((f) => (
            <li
              key={f.id}
              className="flex items-center gap-2"
              data-testid={testId ? `${testId}-file` : undefined}
            >
              {f.kind === "photo" ? (
                <img
                  src={f.previewUrl}
                  alt={f.name}
                  className="h-10 w-10 rounded border border-kit-slate-5 object-cover"
                />
              ) : (
                <video
                  src={f.previewUrl}
                  controls
                  preload="metadata"
                  className="h-10 w-16 rounded border border-kit-slate-5"
                />
              )}
              <span className="max-w-[200px] truncate text-label text-base-600">
                {f.name}
              </span>
              <span className="text-label text-base-400">{f.kind}</span>
              {f.status === "uploading" && (
                <span className="text-label text-base-500">Uploading…</span>
              )}
              {f.status === "done" && (
                <span className="text-label text-success">Uploaded</span>
              )}
              {f.status === "failed" && (
                <>
                  <span className="text-label text-danger">
                    {f.error ?? "Upload failed"}
                  </span>
                  <button
                    type="button"
                    className="btn-ghost px-1.5 py-0 text-label"
                    onClick={() => void upload(f)}
                  >
                    Retry
                  </button>
                </>
              )}
              <button
                type="button"
                className="btn-ghost px-1.5 py-0 text-label"
                onClick={() => remove(f)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {(photos > 0 || videos > 0) && (
        <p
          className="mt-0.5 text-label text-success"
          data-testid={testId ? `${testId}-count` : undefined}
        >
          {[
            photos > 0 ? `${photos} photo${photos === 1 ? "" : "s"}` : null,
            videos > 0 ? `${videos} video${videos === 1 ? "" : "s"}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}{" "}
          attached
        </p>
      )}
      {pickError && (
        <p className="mt-0.5 text-label text-danger font-body">{pickError}</p>
      )}
    </div>
  );
}
