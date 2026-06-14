import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  ListChecks,
  MoreVertical,
  Pin,
  Archive,
  ArchiveRestore,
  Trash2,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import type { OpsNote } from "@carres/shared";

/**
 * KeepPanel — Google-Keep-style per-staff notes (Jess "follow gmail design").
 * "+ Take a note…" composer + cards with a hover ⋮ menu (Pin / Archive /
 * Delete) + colour dots, and an Archived view. Per-staff (RLS); principal can
 * read all.
 */
const COLOR_BG: Record<string, string> = {
  default: "bg-white",
  yellow: "bg-[#FFF8C5]",
  green: "bg-[#E2F6D3]",
  blue: "bg-[#D3E3FD]",
  pink: "bg-[#FDE7EF]",
  purple: "bg-[#F1E4FF]",
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
  const [view, setView] = useState<"active" | "archived">("active");

  const { data, isLoading } = useQuery<{ notes: OpsNote[] }>({
    queryKey: ["ops", "notes", view],
    queryFn: () =>
      apiFetch(`/api/ops/notes${view === "archived" ? "?archived=true" : ""}`),
  });
  const notes = data?.notes ?? [];
  const invalidate = () => qc.invalidateQueries({ queryKey: ["ops", "notes"] });

  const createMut = useMutation({
    mutationFn: (body: { content: string }) =>
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
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex flex-col h-full">
      {/* Composer — Google Keep "Take a note…" */}
      {view === "active" && (
        <div className="rounded-lg border border-base-200 shadow-sm mb-3 bg-white">
          {!expanded ? (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
            >
              <Plus size={16} className="text-primary" />
              <span className="text-[13px] text-base-500">Take a note…</span>
              <ListChecks size={15} className="ml-auto text-base-400" />
            </button>
          ) : (
            <div className="p-2.5">
              <textarea
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Take a note…"
                rows={3}
                className="w-full text-[13px] resize-none focus:outline-none bg-transparent"
              />
              <div className="flex justify-end gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => {
                    setExpanded(false);
                    setDraft("");
                  }}
                  className="text-[12px] text-base-500 px-2 py-1 rounded hover:bg-base-100"
                >
                  Close
                </button>
                <button
                  type="button"
                  disabled={!draft.trim() || createMut.isPending}
                  onClick={() =>
                    createMut.mutate(
                      { content: draft.trim() },
                      { onSuccess: () => { setDraft(""); setExpanded(false); } },
                    )
                  }
                  className="text-[12px] font-semibold text-primary px-2 py-1 rounded hover:bg-primary/5 disabled:opacity-40"
                >
                  Add
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Notes */}
      <div className="flex-1 overflow-auto space-y-2">
        {isLoading ? (
          <div className="text-[12px] text-base-400 text-center py-6">Loading…</div>
        ) : notes.length === 0 ? (
          <div className="text-[12px] text-base-400 text-center py-6">
            {view === "archived" ? "No archived notes." : "Notes you add appear here."}
          </div>
        ) : (
          notes.map((n) => (
            <NoteCard
              key={n.id}
              note={n}
              view={view}
              onPatch={(b) => patchMut.mutate({ id: n.id, ...b })}
              onDelete={() => deleteMut.mutate(n.id)}
            />
          ))
        )}
      </div>

      {/* Active / Archived toggle */}
      <button
        type="button"
        onClick={() => setView((v) => (v === "active" ? "archived" : "active"))}
        className="mt-2 pt-2 border-t border-base-100 text-[11px] text-base-500 hover:text-base-900 flex items-center gap-1.5"
      >
        <Archive size={12} /> {view === "active" ? "View archived" : "← Back to notes"}
      </button>
    </div>
  );
}

function NoteCard({
  note,
  view,
  onPatch,
  onDelete,
}: {
  note: OpsNote;
  view: "active" | "archived";
  onPatch: (b: Partial<OpsNote>) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.content);
  const [menu, setMenu] = useState(false);
  const bg = COLOR_BG[note.color ?? "default"] ?? "bg-white";

  return (
    <div className={`relative rounded-lg border border-base-200 ${bg} p-2.5 group`}>
      {note.pinned && (
        <Pin size={12} className="absolute top-2 right-2 text-primary" fill="currentColor" />
      )}
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
          className="w-full text-[13px] bg-transparent resize-none focus:outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="w-full text-left text-[13px] text-base-800 whitespace-pre-wrap break-words pr-4"
        >
          {note.content || <span className="text-base-400">Empty note — click to edit</span>}
        </button>
      )}
      <div className="flex items-center justify-between mt-1.5">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {COLOR_DOTS.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => onPatch({ color: c.key })}
              className={`w-3.5 h-3.5 rounded-full ${c.cls} ${
                note.color === c.key || (!note.color && c.key === "default")
                  ? "ring-1 ring-base-900 ring-offset-1"
                  : ""
              }`}
              aria-label={`Colour ${c.key}`}
            />
          ))}
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenu((m) => !m)}
            className="p-1 rounded text-base-400 hover:bg-black/5 opacity-60 group-hover:opacity-100"
            aria-label="Note actions"
          >
            <MoreVertical size={14} />
          </button>
          {menu && (
            <div className="absolute right-0 top-full mt-1 z-20 w-36 bg-white rounded-md shadow-lg border border-base-200 py-1 text-[12px]">
              <button
                type="button"
                onClick={() => { onPatch({ pinned: !note.pinned }); setMenu(false); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-base-100"
              >
                <Pin size={13} /> {note.pinned ? "Unpin" : "Pin"}
              </button>
              {view === "active" ? (
                <button
                  type="button"
                  onClick={() => { onPatch({ archived: true }); setMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-base-100"
                >
                  <Archive size={13} /> Archive
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => { onPatch({ archived: false }); setMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-base-100"
                >
                  <ArchiveRestore size={13} /> Unarchive
                </button>
              )}
              <button
                type="button"
                onClick={() => { onDelete(); setMenu(false); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-base-100 text-danger"
              >
                <Trash2 size={13} /> Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
