/**
 * 0430 — the running bundle's own identity.
 *
 * A browser that loaded the portal days ago is still running THAT deploy: the
 * served `index.html` is `max-age=0, must-revalidate`, so a reload always gets
 * the current bundle — but nothing ever reloads a long-open tab, and until
 * this module the app could not even say which version it was. Help shows
 * this stamp and compares it with the served `__carres_deploy.json` (the same
 * proof `scripts/verify-production.mjs` polls) to offer a reload.
 *
 * The `typeof` guard keeps vitest (no vite define) and any non-vite consumer
 * on an honest `local` instead of a ReferenceError.
 */
declare const __CARRES_BUILD__: { commit: string; builtAt: string } | undefined;

export const buildInfo: { commit: string; builtAt: string } =
  typeof __CARRES_BUILD__ !== "undefined"
    ? __CARRES_BUILD__
    : { commit: "local", builtAt: "" };

export function shortCommit(commit: string): string {
  return /^[0-9a-f]{40}$/i.test(commit) ? commit.slice(0, 8) : commit;
}

export type UpdateCheck =
  | { state: "latest" }
  | { state: "available"; commit: string }
  | { state: "unreachable" };

/** Compare the running bundle with the currently served deploy proof. */
export async function checkForUpdate(): Promise<UpdateCheck> {
  try {
    const res = await fetch("/__carres_deploy.json", { cache: "no-store" });
    if (!res.ok) return { state: "unreachable" };
    const body = (await res.json()) as { commit?: string };
    if (!body.commit) return { state: "unreachable" };
    return body.commit === buildInfo.commit
      ? { state: "latest" }
      : { state: "available", commit: body.commit };
  } catch {
    return { state: "unreachable" };
  }
}
