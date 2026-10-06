import { afterEach, describe, expect, it, vi } from "vitest";
import { buildInfo, checkForUpdate, shortCommit } from "./build-info";

/* 0430 — the Help menu's version check. A long-open tab runs an old bundle;
   this module is how the operator can SEE that and choose to reload. */
describe("the running version and the served deploy proof", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("without a vite define the bundle honestly calls itself local", () => {
    expect(buildInfo.commit).toBe("local");
    expect(shortCommit("caebd3e3078740604fbd3ca20b8abb6bcc68e68d")).toBe("caebd3e3");
    expect(shortCommit("local")).toBe("local");
  });

  it("the same served commit is `latest`; a different one offers the update", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ commit: "local" }), { status: 200 }),
    ));
    expect(await checkForUpdate()).toEqual({ state: "latest" });

    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ commit: "deadbeef" }), { status: 200 }),
    ));
    expect(await checkForUpdate()).toEqual({ state: "available", commit: "deadbeef" });
  });

  it("an unreachable or malformed proof is named, never guessed past", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    expect(await checkForUpdate()).toEqual({ state: "unreachable" });

    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await checkForUpdate()).toEqual({ state: "unreachable" });

    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({}), { status: 200 }),
    ));
    expect(await checkForUpdate()).toEqual({ state: "unreachable" });
  });

  it("asks the server, never a cache — a cached proof is the stale page again", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ commit: "local" }), { status: 200 }));
    vi.stubGlobal("fetch", f);
    await checkForUpdate();
    expect(f).toHaveBeenCalledWith("/__carres_deploy.json", { cache: "no-store" });
  });
});
