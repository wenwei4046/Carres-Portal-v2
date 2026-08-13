import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";

const dir = "supabase/migrations";
const files = (await readdir(dir)).filter((file) => file.endsWith(".sql")).sort();
const invalid = files.filter((file) => !/^\d{4}[a-z]?_[a-z0-9_]+\.sql$/.test(file));
if (invalid.length) throw new Error(`Invalid migration filenames: ${invalid.join(", ")}`);

const base = process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : "HEAD^";
let changed = [];
try {
  changed = execFileSync("git", ["diff", "--name-status", `${base}...HEAD`, "--", dir], { encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean);
} catch {
  console.log("No merge base available; filename validation only.");
}
const altered = changed.filter((line) => !line.startsWith("A\t"));
if (altered.length) throw new Error(`Committed migrations are immutable; only new files are allowed:\n${altered.join("\n")}`);
for (const line of changed.filter((entry) => entry.startsWith("A\t"))) {
  const file = line.slice(2);
  const sql = await readFile(file, "utf8");
  if (/\b(drop\s+(table|schema|column)|truncate|delete\s+from)\b/i.test(sql)) {
    throw new Error(`${file} contains destructive SQL and requires the governed manual review/apply path.`);
  }
}
console.log(`Validated ${files.length} migration filenames and ${changed.length} migration change(s). No migration was applied.`);
