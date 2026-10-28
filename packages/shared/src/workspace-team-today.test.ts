import { describe, expect, it } from "vitest";
import { TEAM_ONLINE_MINUTES, teamMemberState } from "./workspace-activity";

/* The header's Team list (owner ruling 2026-10-08): online = portal activity
   in the last 15 minutes; staff settings "not available" wins; no activity
   today is "not seen", never assumed away or off. */
describe("teamMemberState", () => {
  const now = new Date("2026-10-08T06:00:00Z");
  const ago = (min: number) => new Date(now.getTime() - min * 60_000).toISOString();

  it("is online inside the window and away from the window on", () => {
    expect(TEAM_ONLINE_MINUTES).toBe(15);
    expect(teamMemberState(ago(0), true, now)).toEqual({ state: "online", idleMinutes: 0 });
    expect(teamMemberState(ago(14), true, now)).toEqual({ state: "online", idleMinutes: 14 });
    expect(teamMemberState(ago(15), true, now)).toEqual({ state: "away", idleMinutes: 15 });
    expect(teamMemberState(ago(130), true, now)).toEqual({ state: "away", idleMinutes: 130 });
  });

  it("not available wins over activity; no activity is not seen", () => {
    expect(teamMemberState(ago(1), false, now)).toEqual({ state: "off", idleMinutes: null });
    expect(teamMemberState(null, true, now)).toEqual({ state: "not_seen", idleMinutes: null });
  });
});
