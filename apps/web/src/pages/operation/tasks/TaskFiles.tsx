/**
 * THE FILES TAB of the one task view (owner's round 3 brief of 13 Oct 2026,
 * point 2): the task's documents, staged in the order of the route they
 * belong to. Each file can be looked at or kept.
 *
 * Nothing is read until the person asks: `View` and `Download` render the
 * document through its owning module's existing door (`load`). Looking at a
 * file or keeping it records nothing.
 */
import { useEffect, useState } from "react";
import MIcon from "@/components/carres/MIcon";
import Modal from "@/components/kit/Modal";
import PdfPreview from "@/components/kit/PdfPreview";
import Button from "@/components/kit/Button";
import { TASK_VIEW_WORDS as W, fileCount, type TaskFile, type TaskFileStage } from "./task-view";

const ICON_BUTTON = "grid h-11 w-11 min-[768px]:h-8 min-[768px]:w-8 shrink-0 place-items-center rounded-full text-c-secondary outline-none enabled:hover:bg-c-hover focus-visible:[outline:var(--c-focus)] disabled:opacity-[0.45]";

function Viewer({ file, onClose }: { file: TaskFile | null; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!file) return;
    let cancelled = false; let made: string | undefined;
    setUrl(null); setFailed(false);
    file.load().then((blob) => { if (cancelled) return; made = URL.createObjectURL(blob); setUrl(made); }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; if (made) URL.revokeObjectURL(made); };
  }, [file, attempt]);
  return (
    <Modal open={!!file} onOpenChange={(open) => { if (!open) onClose(); }} title={file?.name ?? W.tab.files} width="viewer">
      {url ? <PdfPreview src={url} title={file?.name ?? W.tab.files} />
        : <div className="flex flex-col items-start gap-2">
          <p className="text-body" role={failed ? "alert" : "status"}>{failed ? W.fileFailed : W.fileLoading}</p>
          {failed && <Button onClick={() => setAttempt((n) => n + 1)}>Try again</Button>}
        </div>}
    </Modal>
  );
}

export default function TaskFiles({ stages }: { stages: readonly TaskFileStage[] }) {
  const [viewing, setViewing] = useState<TaskFile | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  async function download(file: TaskFile) {
    setBusy(file.key); setFailed(null);
    let url: string | undefined;
    try {
      url = URL.createObjectURL(await file.load());
      const link = document.createElement("a");
      link.href = url; link.download = file.name;
      document.body.appendChild(link); link.click(); link.remove();
    } catch {
      setFailed(file.key);
    } finally { if (url) URL.revokeObjectURL(url); setBusy(null); }
  }

  if (fileCount(stages) === 0 && stages.length === 0) return <p className="text-body text-c-secondary" data-testid="task-files-none">{W.noFiles}</p>;
  return (
    <div className="flex flex-col" data-testid="task-files">
      {stages.map((stage, index) => (
        <section key={stage.key} className="flex items-stretch gap-2.5" data-testid={`task-files-stage-${stage.key}`}>
          <span className="flex w-2.5 shrink-0 flex-col items-center" aria-hidden="true">
            <span className={`mt-[5px] h-2.5 w-2.5 shrink-0 rounded-full border ${stage.files.length ? "border-c-ink bg-c-ink" : "border-c-chip-border bg-white"}`} />
            {index < stages.length - 1 ? <span className="w-px flex-1 bg-c-chip-border" /> : null}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1 pb-3">
            <h4 className={`text-body ${stage.files.length ? "font-medium text-c-ink" : "text-c-secondary"}`}>{stage.title}</h4>
            {stage.sub ? <span className="break-words text-meta text-c-secondary">{stage.sub}</span> : null}
            {stage.files.length === 0 ? <span className="text-meta text-c-muted">{W.noFile}</span> : stage.files.map((file) => (
              <div key={file.key} className="flex min-w-0 items-center gap-1.5" data-testid={`task-file-${file.key}`}>
                <MIcon name="description" size={16} className="shrink-0 text-c-secondary" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="break-words text-body text-c-ink">{file.name}</span>
                  <span className={`text-meta ${failed === file.key ? "text-c-err-fg" : "text-c-secondary"}`} role={failed === file.key ? "alert" : undefined}>
                    {failed === file.key ? W.fileFailed : file.detail}
                  </span>
                </span>
                <button type="button" className={ICON_BUTTON} aria-label={W.view(file.name)} title={W.view(file.name)} onClick={() => setViewing(file)} data-testid={`task-file-view-${file.key}`}>
                  <MIcon name="visibility" size={18} />
                </button>
                <button type="button" className={ICON_BUTTON} aria-label={W.download(file.name)} title={W.download(file.name)} disabled={busy === file.key}
                  onClick={() => void download(file)} data-testid={`task-file-download-${file.key}`}>
                  <MIcon name="download" size={18} />
                </button>
              </div>
            ))}
          </div>
        </section>
      ))}
      <Viewer file={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}
