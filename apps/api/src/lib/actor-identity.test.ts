import { describe, expect, it, vi } from "vitest";
import { actorKindOf, actorRoleWord, resolveActorIdentities } from "./actor-names";

const P = "00000000-0000-0000-0000-0000000000a1";
const S = "00000000-0000-0000-0000-0000000000a2";
const D = "00000000-0000-0000-0000-0000000000a3";

function sb(opts: {
  identities?: unknown[] | { error: true };
  names?: unknown[];
  sellers?: unknown[];
}) {
  const rpc = vi.fn((fn: string) => {
    if (fn === "actor_identities") {
      return Promise.resolve(
        opts.identities && "error" in (opts.identities as object)
          ? { data: null, error: { code: "PGRST202", message: "function not found" } }
          : { data: opts.identities ?? [], error: null },
      );
    }
    return Promise.resolve({ data: opts.names ?? [], error: null });
  });
  const from = vi.fn(() => ({ select: () => ({ in: () => Promise.resolve({ data: opts.sellers ?? [], error: null }) }) }));
  return { rpc, from };
}

describe("who acted is decided once, and a shared login is not a person (owner ruling 2026-09-26)", () => {
  it("a person prints as a person; a shared login is a missing identity that keeps its role", async () => {
    const who = await resolveActorIdentities(
      sb({
        identities: [
          { id: P, name: "Jess", role: "principal", is_person: true },
          { id: S, name: "principal", role: "principal", is_person: false },
        ],
      }),
      [P, S, P],
    );
    expect(who.get(P)).toEqual({ name: "Jess", role: "principal", isPerson: true });
    expect(who.get(S)).toEqual({ name: "principal", role: "principal", isPerson: false });
    expect(actorKindOf(P, who.get(P))).toBe("human");
    expect(actorKindOf(S, who.get(S))).toBe("missing");
    expect(actorRoleWord(who.get(S))).toBe("Principal");
  });

  it("a salesperson named by the sales side is a person: the staff door does not know them", async () => {
    const who = await resolveActorIdentities(
      sb({ identities: [], sellers: [{ user_id: D, name: "Ah Meng" }] }),
      [D],
    );
    expect(who.get(D)).toEqual({ name: "Ah Meng", role: null, isPerson: null });
    expect(actorKindOf(D, who.get(D))).toBe("human");
  });

  it("an id nobody can name is a missing identity, never a guess", async () => {
    const who = await resolveActorIdentities(sb({ identities: [] }), [P]);
    expect(who.get(P)).toBeUndefined();
    expect(actorKindOf(P, undefined)).toBe("missing");
  });

  it("System only from the writer's own marker — never from a missing id", () => {
    expect(actorKindOf(null, undefined, { actor: "system" })).toBe("system");
    expect(actorKindOf(null, undefined, {})).toBe("missing");
    expect(actorKindOf(null, undefined)).toBe("missing");
  });

  it("before 0592 is applied the old door still names people, and nothing is called a shared login on a guess", async () => {
    const who = await resolveActorIdentities(
      sb({ identities: { error: true }, names: [{ id: P, name: "Jess" }] }),
      [P],
    );
    expect(who.get(P)).toEqual({ name: "Jess", role: null, isPerson: null });
    expect(actorKindOf(P, who.get(P))).toBe("human");
  });

  it("the role words are the governed ones", () => {
    expect(actorRoleWord({ name: "x", role: "bd", isPerson: false })).toBe("BD");
    expect(actorRoleWord({ name: "x", role: "hr", isPerson: false })).toBe("HR");
    expect(actorRoleWord({ name: "x", role: "operation", isPerson: false })).toBe("Operation");
    expect(actorRoleWord(undefined)).toBeNull();
  });
});
