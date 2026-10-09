import { describe, expect, it } from "vitest";
import { dutyResolution } from "./work";

const SHASHA = { userId: "0cab8bcf-6ebb-454e-ba21-b916e18cc419", name: "Shasha" };
const YUJUN = { userId: "aac9edf9-63ad-4d0a-ba91-e495a25f9896", name: "Yu Jun" };
const payload = (resolution: Record<string, unknown>) => ({ duties: [{ key: "po_duty", resolution }] });

describe("dutyResolution — the acting person is always named when the feed knows the name", () => {
  it("a system-assigned actor with no name takes the normal holder's name (same person)", () => {
    const r = dutyResolution(payload({
      source: "system_assignment", normal_user_id: SHASHA.userId, normal_user_name: SHASHA.name,
      actor_user_id: SHASHA.userId,
    }), "po_duty", "2026-10-09");
    expect(r?.actingPerson).toEqual(SHASHA);
    expect(r?.state).toBe("primary");
  });

  it("a covered duty names the cover, never borrows the holder's name for someone else", () => {
    const r = dutyResolution(payload({
      source: "system_assignment", normal_user_id: SHASHA.userId, normal_user_name: SHASHA.name,
      actor_user_id: YUJUN.userId, acting_user_id: YUJUN.userId, acting_user_name: YUJUN.name, is_cover: true,
    }), "po_duty", "2026-10-09");
    expect(r?.actingPerson).toEqual(YUJUN);
    expect(r?.state).toBe("covered");
  });

  it("an actor nobody named stays unnamed rather than guessed", () => {
    const r = dutyResolution(payload({
      source: "system_assignment", normal_user_id: SHASHA.userId, normal_user_name: SHASHA.name,
      actor_user_id: YUJUN.userId,
    }), "po_duty", "2026-10-09");
    expect(r?.actingPerson).toEqual({ userId: YUJUN.userId, name: null });
  });
});
