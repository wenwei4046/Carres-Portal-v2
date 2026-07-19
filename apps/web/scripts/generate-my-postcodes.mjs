/**
 * Regenerates `src/data/malaysia-postcodes-data.ts` from the full national
 * postcode dataset (AsyrafHussin/malaysia-postcodes, MIT).
 *
 *   node scripts/generate-my-postcodes.mjs [path/to/all.json]
 *
 * Without an argument it fetches the pinned commit below. Bump PINNED_COMMIT
 * to pull a newer revision of the source data.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PINNED_COMMIT = "842ca633a72571d8b1cc7e445eefd536cb773f19"; // 2026-03-06
const SOURCE_URL = `https://raw.githubusercontent.com/AsyrafHussin/malaysia-postcodes/${PINNED_COMMIT}/all.json`;

// Source state names → the app's canonical keys (region.ts KV/North/South
// buckets + existing composed addresses key on these exact spellings).
const STATE_RENAMES = {
  "Wp Kuala Lumpur": "Kuala Lumpur",
  "Pulau Pinang": "Penang",
  "Wp Labuan": "Labuan",
  "Wp Putrajaya": "Putrajaya",
};

const EXPECTED_STATES = [
  "Johor", "Kedah", "Kelantan", "Kuala Lumpur", "Labuan", "Melaka",
  "Negeri Sembilan", "Pahang", "Penang", "Perak", "Perlis", "Putrajaya",
  "Sabah", "Sarawak", "Selangor", "Terengganu",
];

async function loadSource() {
  const localPath = process.argv[2];
  if (localPath) return JSON.parse(readFileSync(localPath, "utf8"));
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`fetch ${SOURCE_URL} -> HTTP ${res.status}`);
  return res.json();
}

const source = await loadSource();

const map = {};
for (const state of source.state) {
  const stateName = STATE_RENAMES[state.name] ?? state.name;
  const cities = {};
  for (const city of [...state.city].sort((a, b) => a.name.localeCompare(b.name))) {
    const codes = [...new Set(city.postcode)].sort();
    if (codes.length === 0) throw new Error(`empty postcode list: ${stateName}/${city.name}`);
    cities[city.name] = codes;
  }
  map[stateName] = cities;
}

// ---- sanity gates: refuse to emit a dataset that fails known ground truth ----
const states = Object.keys(map).sort();
if (JSON.stringify(states) !== JSON.stringify(EXPECTED_STATES)) {
  throw new Error(`state set drifted: ${states.join(", ")}`);
}
const allCodes = Object.values(map).flatMap((c) => Object.values(c).flat());
if (!allCodes.every((p) => /^\d{5}$/.test(p))) throw new Error("non-5-digit postcode found");
const expect = (cond, msg) => { if (!cond) throw new Error(`sanity: ${msg}`); };
expect(map.Selangor["Petaling Jaya"].includes("46000"), "PJ misses 46000");
expect(map.Selangor["Petaling Jaya"].includes("47301"), "PJ misses 47301 (the 2026-07-19 regression)");
expect(map.Selangor["Petaling Jaya"].includes("47810"), "PJ misses 47810");
expect(!map.Selangor["Sungai Buloh"].includes("47300"), "Sungai Buloh again misfiles PJ codes");
expect(map.Selangor["Batu Caves"], "Batu Caves absent");
expect(map.Selangor["Seri Kembangan"].includes("43300"), "Seri Kembangan misses 43300");

const cityCount = Object.values(map).reduce((n, c) => n + Object.keys(c).length, 0);
const uniqueCodes = new Set(allCodes).size;

const lines = [];
lines.push("/**");
lines.push(" * GENERATED FILE — do not edit by hand.");
lines.push(" *");
lines.push(` * Full Malaysia postcode dataset (${states.length} states · ${cityCount} post towns · ${uniqueCodes}`);
lines.push(" * unique postcodes), state → official post town → postcode list.");
lines.push(" *");
lines.push(" * Source: https://github.com/AsyrafHussin/malaysia-postcodes (MIT),");
lines.push(` * pinned commit ${PINNED_COMMIT.slice(0, 7)}.`);
lines.push(" * Regenerate: node scripts/generate-my-postcodes.mjs [path/to/all.json]");
lines.push(" *");
lines.push(" * State names are normalised to the app's canonical keys (Wp Kuala Lumpur →");
lines.push(" * Kuala Lumpur, Pulau Pinang → Penang, Wp Labuan → Labuan, Wp Putrajaya →");
lines.push(" * Putrajaya) so region.ts KV/North/South buckets keep working unchanged.");
lines.push(" */");
lines.push("");
lines.push("export const MY_ADDRESS_DATA: Record<string, Record<string, string[]>> = {");
for (const state of EXPECTED_STATES) {
  lines.push(`  ${JSON.stringify(state)}: {`);
  for (const [city, codes] of Object.entries(map[state])) {
    lines.push(`    ${JSON.stringify(city)}: ${JSON.stringify(codes)},`);
  }
  lines.push("  },");
}
lines.push("};");
lines.push("");

const outPath = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data", "malaysia-postcodes-data.ts");
writeFileSync(outPath, lines.join("\n"), "utf8");
console.log(`wrote ${outPath}: ${states.length} states, ${cityCount} towns, ${uniqueCodes} unique codes`);
