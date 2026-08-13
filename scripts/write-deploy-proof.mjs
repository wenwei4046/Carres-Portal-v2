import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const commit = process.env.CF_PAGES_COMMIT_SHA ?? process.env.GITHUB_SHA ?? "local";
const fromWeb = /apps[\\/]web$/.test(process.cwd());
const output = resolve(process.cwd(), fromWeb ? "dist" : "apps/web/dist");
await mkdir(output, { recursive: true });
await writeFile(resolve(output, "__carres_deploy.json"), `${JSON.stringify({ commit, builtAt: new Date().toISOString() })}\n`);
console.log(`Stamped web deployment proof for ${commit}.`);
