import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  GRN_EXCEPTION_WORD,
  type GrnExceptionFact,
  type GrnExceptionType,
  type GrnMediaKind,
} from "@carres/shared";
import { ApiError } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
import { useReceivingLineEvidence, type GrnEvidenceCount } from "@/lib/queries";
import KitModal from "@/components/kit/Modal";

/**
 * EXCEPTION EVIDENCE — the six doors on a GRN and the ONE viewer behind them
 * (owner instruction 2026-09-13 §6).
 *
 *   Damaged · Wrong Item · Extra   ×   Photos · Videos
 *
 * ⭐ SCOPED, NEVER MIXED. A door names its GRN, its exception, its media kind
 * and the exact line key(s) it stands for; the viewer asks the server for
 * exactly that and lists the lines it covers in words. A summary that spans
 * two lines opens a viewer that names both — it never blends one line's
 * files with another's.
 *
 * ⭐ A COUNT IS A VERIFIED NUMBER OR NOTHING. The door prints the server's
 * count of recorded files when the evidence store answered; when it did not
 * (`line_evidence_counts` absent) the door reads `Not verified` rather than a
 * reassuring `0`. A zero EXCEPTION quantity draws no door at all.
 *
 * ⭐ FIVE STATES, EACH IN WORDS. Loading · verified no files · records not
 * verified · permission denied · load failure with Try again. A recorded path
 * whose file the bucket does not hold is NAMED as missing, never hidden.
 */

export const EVIDENCE_COPY = {
  photos: "Photos",
  videos: "Videos",
  notVerified: "Not verified",
  loading: "Opening the evidence…",
  noPhotos: "No photos on file for this exception.",
  noVideos: "No videos on file for this exception.",
  recordsNotVerified:
    "The evidence records could not be verified — the evidence store did not answer.",
  permissionDenied: "You do not have permission to open this evidence.",
  loadFailed: "The evidence could not be opened",
  tryAgain: "Try again",
  fileMissing: "Recorded file is not in storage",
  fileUnsigned: "File could not be opened — not verified",
  forLines: "For",
  previous: "Previous",
  next: "Next",
  back: "Back to all files",
  enlarge: "Open larger",
} as const;

export interface EvidenceLineRef {
  lineKey: string;
  /** The goods' words — the same name the row prints. */
  name: string;
  qty: number;
}

export interface EvidenceScope {
  receiptId: string;
  grnNo: string;
  type: GrnExceptionType;
  kind: GrnMediaKind;
  lines: EvidenceLineRef[];
}

function countOf(
  counts: readonly GrnEvidenceCount[] | undefined,
  type: GrnExceptionType,
  kind: GrnMediaKind,
  lineKeys: readonly string[],
): number | null {
  if (!counts) return null;
  return counts
    .filter((c) => c.exception_type === type && c.media_kind === kind && lineKeys.includes(c.line_key))
    .reduce((n, c) => n + c.count, 0);
}

/**
 * THE TWO DOORS for one exception on one or more lines: `Photos {n}` and
 * `Videos {n}`. Rendered only when the caller's facts carry a positive
 * quantity — the caller filters, this component refuses to draw for none.
 */
export function ExceptionEvidenceDoors({
  receiptId,
  grnNo,
  type,
  facts,
  nameOf,
  counts,
  onOpen,
  compact = false,
  testId,
}: {
  receiptId: string;
  grnNo: string;
  type: GrnExceptionType;
  facts: readonly GrnExceptionFact[];
  nameOf: (lineKey: string, sku: string) => string;
  /** The server's verified counts; undefined = not verified. */
  counts: readonly GrnEvidenceCount[] | undefined;
  onOpen: (scope: EvidenceScope) => void;
  /** The 38px parent row: icon-height pills, no wrapping. */
  compact?: boolean;
  testId?: string;
}) {
  const mine = facts.filter((f) => f.type === type && f.qty > 0 && f.lineKey !== "");
  if (mine.length === 0) return null;
  const lines: EvidenceLineRef[] = mine.map((f) => ({
    lineKey: f.lineKey,
    name: nameOf(f.lineKey, f.sku),
    qty: f.qty,
  }));
  const keys = lines.map((l) => l.lineKey);
  const door = (kind: GrnMediaKind) => {
    const n = countOf(counts, type, kind, keys);
    const word = kind === "photo" ? EVIDENCE_COPY.photos : EVIDENCE_COPY.videos;
    const label = n === null ? `${word} · ${EVIDENCE_COPY.notVerified}` : `${word} ${n}`;
    return (
      <button
        type="button"
        data-testid={testId ? `${testId}-${type}-${kind}` : undefined}
        title={`${GRN_EXCEPTION_WORD[type]} ${word} — ${grnNo}`}
        aria-label={`${GRN_EXCEPTION_WORD[type]} ${word} for ${grnNo}${n === null ? ", not verified" : `, ${n} on file`}`}
        className={[
          "inline-flex items-center rounded-control border border-kit-slate-6 bg-white font-medium text-kit-slate-12 hover:bg-kit-slate-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kit-blue-9",
          compact ? "h-6 px-1.5 text-label" : "h-7 px-2 text-label",
        ].join(" ")}
        onClick={(e) => {
          e.stopPropagation();
          onOpen({ receiptId, grnNo, type, kind, lines });
        }}
      >
        {label}
      </button>
    );
  };
  return (
    <span className="inline-flex items-center gap-1" data-testid={testId ? `${testId}-${type}` : undefined}>
      {door("photo")}
      {door("video")}
    </span>
  );
}

/** Muted, never a dash — the portal's absence rank (COPY-STANDARD). */
function Absent({ children }: { children: string }) {
  return (
    <span className="text-kit-slate-9" data-absence="true">
      {children}
    </span>
  );
}

/**
 * THE ONE VIEWER. Photos enlarge in place with ‹ › navigation (buttons and
 * the arrow keys); videos play in a real player. Every recorded file is
 * accounted for in words.
 */
export function ExceptionEvidenceViewer({
  scope,
  onClose,
}: {
  scope: EvidenceScope;
  onClose: () => void;
}) {
  const query = useReceivingLineEvidence(scope.receiptId, {
    type: scope.type,
    kind: scope.kind,
    lineKeys: scope.lines.map((l) => l.lineKey),
  });
  const kindWord = scope.kind === "photo" ? EVIDENCE_COPY.photos : EVIDENCE_COPY.videos;
  const title = `${GRN_EXCEPTION_WORD[scope.type]} ${kindWord} · ${scope.grnNo}`;
  const files = useMemo(() => query.data?.files ?? [], [query.data]);
  const [enlarged, setEnlarged] = useState<number | null>(null);
  const openable = useMemo(() => files.map((f, i) => (f.status === "ok" && f.url ? i : -1)).filter((i) => i >= 0), [files]);

  useEffect(() => {
    if (enlarged === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enlarged, openable]);

  function step(dir: 1 | -1) {
    if (enlarged === null || openable.length === 0) return;
    const at = openable.indexOf(enlarged);
    const next = openable[(at + dir + openable.length) % openable.length]!;
    setEnlarged(next);
  }

  const nameByKey = new Map(scope.lines.map((l) => [l.lineKey, l]));
  /**
   * ⭐ OWNER CORRECTION 2026-09-14 — A NAME THE VIEWER HAS ALREADY SAID IS NOT
   * SAID AGAIN ON EVERY TILE. The viewer opens for ONE exception on the lines
   * named in its own `For:` line. While that is a single line, every tile
   * beneath it belonged to the same goods, so printing the goods' name on each
   * one repeated the same words as many times as there were photos and told
   * the reader nothing new; the tile keeps what actually differs — the day and
   * the person. The name returns the moment the viewer spans TWO lines, where
   * it is the only thing saying which goods a photo belongs to.
   */
  const namesTiles = scope.lines.length > 1;
  const permissionDenied = query.isError && query.error instanceof ApiError && query.error.status === 403;

  return (
    <KitModal
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={title}
      width="viewer"
    >
      <div className="grid gap-3" data-testid="exception-evidence-viewer">
        {/* WHICH LINES this viewer covers — named, so a summary spanning two
            lines never reads as one. */}
        <p className="text-label text-kit-slate-11" data-testid="exception-evidence-lines">
          {EVIDENCE_COPY.forLines}:{" "}
          {scope.lines.map((l, i) => (
            <span key={l.lineKey}>
              {i > 0 ? " · " : ""}
              <span className="text-kit-slate-12">{l.name}</span> ({l.qty} {GRN_EXCEPTION_WORD[scope.type].toLowerCase()})
            </span>
          ))}
        </p>
        {query.isLoading ? (
          <p className="text-body text-kit-slate-11" data-testid="exception-evidence-loading">
            {EVIDENCE_COPY.loading}
          </p>
        ) : permissionDenied ? (
          <p className="text-body text-danger" data-testid="exception-evidence-denied">
            {EVIDENCE_COPY.permissionDenied}
          </p>
        ) : query.isError ? (
          <div className="flex items-center justify-between gap-3 text-meta text-danger">
            <span data-testid="exception-evidence-failed">{EVIDENCE_COPY.loadFailed}</span>
            <button
              type="button"
              className="rounded-control border border-base-300 bg-white px-2 py-1 font-medium text-base-700 hover:bg-hovertint"
              onClick={() => void query.refetch()}
            >
              {EVIDENCE_COPY.tryAgain}
            </button>
          </div>
        ) : query.data && !query.data.verified ? (
          <p className="text-body text-kit-amber-11" data-testid="exception-evidence-not-verified">
            {EVIDENCE_COPY.recordsNotVerified}
          </p>
        ) : files.length === 0 ? (
          <p className="text-body" data-testid="exception-evidence-empty">
            <Absent>{scope.kind === "photo" ? EVIDENCE_COPY.noPhotos : EVIDENCE_COPY.noVideos}</Absent>
          </p>
        ) : enlarged !== null && files[enlarged]?.url ? (
          /* ── the enlarged picture, with ‹ › ─────────────────────────── */
          <div className="grid gap-2" data-testid="exception-evidence-enlarged">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                aria-label={EVIDENCE_COPY.previous}
                title={EVIDENCE_COPY.previous}
                disabled={openable.length < 2}
                onClick={() => step(-1)}
                className="grid h-7 w-7 place-items-center rounded-control border border-kit-slate-6 bg-white text-kit-slate-11 hover:bg-kit-slate-3 disabled:opacity-40"
              >
                <ChevronLeft size={16} aria-hidden />
              </button>
              <span className="text-label text-kit-slate-11">
                {openable.indexOf(enlarged) + 1} of {openable.length}
                {namesTiles ? ` · ${nameByKey.get(files[enlarged]!.line_key)?.name ?? files[enlarged]!.line_key}` : ""}
                {" · "}
                {fmtDate(files[enlarged]!.added_at.slice(0, 10))}
              </span>
              <button
                type="button"
                aria-label={EVIDENCE_COPY.next}
                title={EVIDENCE_COPY.next}
                disabled={openable.length < 2}
                onClick={() => step(1)}
                className="grid h-7 w-7 place-items-center rounded-control border border-kit-slate-6 bg-white text-kit-slate-11 hover:bg-kit-slate-3 disabled:opacity-40"
              >
                <ChevronRight size={16} aria-hidden />
              </button>
            </div>
            <img
              src={files[enlarged]!.url!}
              alt={`${GRN_EXCEPTION_WORD[scope.type]} photo ${openable.indexOf(enlarged) + 1}`}
              className="max-h-[60vh] w-full rounded-md border border-base-200 object-contain"
            />
            <button
              type="button"
              onClick={() => setEnlarged(null)}
              className="justify-self-start text-body text-kit-blue-11 hover:underline"
            >
              {EVIDENCE_COPY.back}
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            {files.map((file, index) => {
              const line = nameByKey.get(file.line_key);
              const caption = [
                namesTiles ? (line?.name ?? file.line_key) : null,
                fmtDate(file.added_at.slice(0, 10)),
                file.added_by_name,
              ]
                .filter(Boolean)
                .join(" · ");
              if (file.status !== "ok" || !file.url) {
                /* A recorded fact whose file cannot be shown is NAMED. */
                return (
                  <span
                    key={file.id}
                    className="block max-w-[220px] text-label text-base-600"
                    data-testid={`exception-evidence-${file.status}`}
                  >
                    {kindWord.slice(0, -1)} {index + 1} · {caption}
                    <span className="block text-danger">
                      {file.status === "missing" ? EVIDENCE_COPY.fileMissing : EVIDENCE_COPY.fileUnsigned}
                    </span>
                  </span>
                );
              }
              return scope.kind === "photo" ? (
                <button
                  key={file.id}
                  type="button"
                  className="block text-left"
                  title={EVIDENCE_COPY.enlarge}
                  onClick={() => setEnlarged(index)}
                  data-testid="exception-evidence-photo"
                >
                  <img
                    src={file.url}
                    alt={`${GRN_EXCEPTION_WORD[scope.type]} photo ${index + 1}`}
                    className="h-36 w-36 rounded-md border border-base-200 object-cover"
                  />
                  <span className="mt-1 block max-w-[144px] text-label text-base-600">{caption}</span>
                </button>
              ) : (
                <span key={file.id} className="block" data-testid="exception-evidence-video">
                  <video src={file.url} controls preload="metadata" className="h-44 w-72 rounded-md border border-base-200 bg-black" />
                  <span className="mt-1 block max-w-[288px] text-label text-base-600">{caption}</span>
                </span>
              );
            })}
          </div>
        )}
      </div>
    </KitModal>
  );
}
