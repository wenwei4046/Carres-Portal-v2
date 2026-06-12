import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pin, Trash2, Plus } from "lucide-react";
import { apiFetch } from "@/lib/api";
import type { OpsNote } from "@carres/shared";

/**
 * KeepPanel — right-rail Keep notes (Jess COO ask: every operation staff keeps
 * their own notes). Google-Keep-style: a composer + pinned-first cards with
 * colour, pin, inline edit, delete. Per-staff (RLS); principal can read all.
 */
const NOTE_KEY = ["ops", "notes"] as const;

const COLOR_BG: Record<string, string> = {
  default: "bg-white",
  yellow: "bg-[#FEF9C3]",
  green: "bg-[#DCFCE7]",
  blue: "bg-[#DBEAFE]",
  pink: "bg-[#FCE7F3]",
  purple: "bg-[#F3E8FF]",
};
const COLOR_DOTS: { key: string; cls: string }[] = [
  { key: "default", cls: "bg-white border border-base-300" },
  { key: "yellow", cls: "bg-[#FDE047]" },
  { key: "green", cls: "bg-[#86EFAC]" },
  { key: "blue", cls: "bg-[#93C5FD]" },
  { key: "pink", cls: "bg-[#F9A8D4]" },
  { key: "purple", cls: "bg-[#D8B4FE]" },
];

export default function KeepPanel() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ notes: OpsNote[] }>({
    queryKey: NOTE_KEY,
    queryFn: () => apiFetch("/api/ops/notes"),
  });
  const notes = data?.notes ?? [];

  const invalidate = () => qc.invalidateQueries({ queryKey: NOTE_KEY });

  const createMut = useMutation({
    mutationFn: (body: { title?: string | null; content: string }) =>
      apiFetch("/api/ops/notes", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: invalidate,
  });
  const patchMut = useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<OpsNote>) =>
      apiFetch(`/api/ops/notes/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: invalidate,
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/ops/notes/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  const [draft, setDraft] = useState("");

  return (
    <div className="flex flex-col h-full">
      {/* Composer */}
      <div className="flex items-start gap-1.5 mb-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Take a note…"
          rows={2}
          className="flex-1 text-[12px] px-2.5 py-2 border border-base-200 rounded resize-none focus:outline-none focus:border-base-500"
        />
        <button
          type="button"
          disabled={!draft.trim() || createMut.isPending}
          onClick={() =>
            createMut.mutate(
              { content: draft.trim() },
              { onSuccess: () => setDraft("") },
            )
          }
          className="bg-base-900 text-white rounded p-2 disabled:opacity-40 hover:bg-base-800"
          aria-label="Add note"
        >
          <Plus size={15} />
        </button>
      </div>

      {/* Notes */}
      <div className="flex-1 overflow-auto space-y-2">
        {isLoading ? (
          <div className="text-[12px] text-base-400 text-center py-6">Loading…</div>
        ) : notes.length === 0 ? (
          <div className="text-[12px] text-base-400 text-center py-6">No notes yet.</div>
        ) : (
          notes.map((n) => (
            <NoteCard
              key={n.id}
              note={n}
              onPatch={(b) => patchMut.mutate({ id: n.id, ...b })}
              onDelete={() => deleteMut.mutate(n.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function NoteCard({
  note,
  onPatch,
  onDelete,
}: {
  note: OpsNote;
  onPatch: (b: Partial<OpsNote>) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.content);
  const bg = COLOR_BG[note.color ?? "default"] ?? "bg-white";

  return (
    <div className={`rounded border border-base-200 ${bg} p-2.5 group`}>
      {editing ? (
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            setEditing(false);
            if (text !== note.content) onPatch({ content: text });
          }}
          rows={3}
          className="w-full text-[12px] bg-transparent resize-none focus:outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="w-full text-left text-[12px] text-base-800 whitespace-pre-wrap break-words"
        >
          {note.content || <span className="text-base-400">Empty note — click to edit</span>}
        </button>
      )}
      <div className="flex items-center justify-between mt-1.5">
        <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
          {COLOR_DOTS.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => onPatch({ color: c.key })}
              className={`w-3.5 h-3.5 rounded-full ${c.cls} ${note.color === c.key || (!note.color && c.key === "default") ? "ring-1 ring-base-900 ring-offset-1" : ""}`}
              aria-label={`Colour ${c.key}`}
            />
          ))}
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => onPatch({ pinned: !note.pinned })}
            className={`p-1 rounded hover:bg-black/5 ${note.pinned ? "text-primary" : "text-base-400"}`}
            aria-label={note.pinned ? "Unpin" : "Pin"}
          >
            <Pin size={13} fill={note.pinned ? "currentColor" : "none"} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="p-1 rounded text-base-400 hover:text-danger hover:bg-black/5"
            aria-label="Delete note"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
