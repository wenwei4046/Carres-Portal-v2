/**
 * TeamButton — the page header's Team door (Carres Layout Standard §1 and
 * §4.1: "team = white with green dot (info)"; owner ruling 2026-10-08: build
 * the real read now).
 *
 * The round button carries the ONLINE count. Its popover is `Team today`:
 * Online · Away · Off today · Not seen today, each person with their last
 * activity. Online = active in the last 15 minutes (`TEAM_ONLINE_MINUTES`);
 * the server decides the state, this file only prints it. Nothing is shown
 * while the read is loading or failed — never a guessed count.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { teamTodayResponseSchema, type TeamMemberState, type TeamTodayResponse } from "@carres/shared";
import Icon from "@/components/kit/Icon";
import Popover from "@/components/kit/Popover";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
import { useAuth } from "@/lib/auth";

export const TEAM_TODAY_KEY = ["operation", "work-activity", "team-today"] as const;

const GROUPS: { state: TeamMemberState; label: string }[] = [
  { state: "online", label: "Online" },
  { state: "away", label: "Away" },
  { state: "off", label: "Off today" },
  { state: "not_seen", label: "Not seen today" },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** `Now` · `12 min idle` · `2 h idle` · `Off` · `Not seen`. */
function whenWords(state: TeamMemberState, idle: number | null): string {
  if (state === "off") return "Off";
  if (state === "not_seen" || idle == null) return "Not seen";
  if (state === "online") return "Now";
  return idle < 60 ? `${idle} min idle` : `${Math.floor(idle / 60)} h idle`;
}

export default function TeamButton() {
  const role = useAuth((s) => s.role);
  const enabled = role === "operation" || role === "principal";
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const team = useQuery<TeamTodayResponse>({
    queryKey: TEAM_TODAY_KEY,
    queryFn: async () => teamTodayResponseSchema.parse(await apiFetch<unknown>("/api/operation/work-activity/team-today")),
    refetchInterval: 60_000,
    enabled,
  });
  const members = team.data?.members ?? [];
  const online = members.filter((m) => m.state === "online").length;
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? members.filter((m) => m.name.toLowerCase().includes(needle)) : members;
  }, [members, q]);

  if (!enabled || !team.data) return null;
  const name = `Team · ${online} online`;

  return (
    <Popover
      label="Team today"
      align="end"
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button
          type="button"
          aria-label={name}
          title={name}
          aria-expanded={open}
          data-testid="team-button"
          className="relative grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full border border-c-input-border bg-white text-c-ink hover:bg-c-info-bg"
        >
          <Icon name="people" size={18} />
          <span
            className="absolute -right-[3px] -top-[3px] flex items-center gap-[3px] rounded-full border border-c-line bg-white pl-1 pr-[5px] text-label font-semibold leading-[14px] tabular-nums text-c-ink"
            data-testid="team-online-count"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-c-ok-fg" aria-hidden />
            {online}
          </span>
        </button>
      }
    >
      <div className="flex w-[320px] max-w-[calc(100vw-32px)] flex-col gap-2.5" data-testid="team-popover">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-strong text-c-ink">Team today</span>
          <span className="text-meta text-c-muted">
            {online} online · {fmtDate(team.data.asOf)}
          </span>
        </div>
        <label className="flex h-8 items-center gap-2 rounded-full bg-c-info-bg px-3 text-c-muted">
          <Icon name="search" size={16} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find staff"
            aria-label="Find staff"
            className="min-w-0 flex-1 bg-transparent text-body text-c-ink outline-none"
          />
        </label>
        <div className="flex max-h-[60vh] flex-col gap-1 overflow-auto">
          {GROUPS.map((g) => {
            const people = filtered.filter((m) => m.state === g.state);
            if (people.length === 0) return null;
            return (
              <div key={g.state} className="flex flex-col" data-testid={`team-group-${g.state}`}>
                <span className="px-1 pb-1 pt-2 text-label font-semibold uppercase tracking-[0.12em] text-c-muted">
                  {g.label} · {people.length}
                </span>
                {people.map((p) => (
                  <div key={p.userId} className="flex items-center gap-2.5 rounded-control px-1 py-1.5">
                    <span className="relative grid h-7 w-7 shrink-0 place-items-center rounded-full bg-c-ink text-label font-semibold text-white">
                      {initials(p.name)}
                      {p.state === "online" && (
                        <span className="absolute -bottom-px -right-px h-2.5 w-2.5 rounded-full border-2 border-white bg-c-ok-fg" aria-hidden />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-body text-c-ink">{p.name}</span>
                    <span className="shrink-0 text-meta tabular-nums text-c-muted">{whenWords(p.state, p.idleMinutes)}</span>
                  </div>
                ))}
              </div>
            );
          })}
          {filtered.length === 0 && <div className="px-1 py-2 text-body text-c-muted">No staff match.</div>}
        </div>
      </div>
    </Popover>
  );
}
