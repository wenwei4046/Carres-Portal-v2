// Review-integrity check only: no connection, SQL application, migration or activation.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const base = new URL('../output/forecast-mpr-delivery/', import.meta.url);
const draft = readFileSync(new URL('purchase-request-writers.draft.sql', base));
const review = JSON.parse(readFileSync(new URL('purchase-request-writers.review.json', base), 'utf8'));
const probe = readFileSync(new URL('purchase-request-writers.rollback-probe.sql', base), 'utf8');
const sha = createHash('sha256').update(draft).digest('hex');
const md5 = createHash('md5').update(draft).digest('hex');
if (sha !== review.draft_sha256 || md5 !== review.draft_file_md5) throw new Error('Writer review does not match the current exact draft');
const tag = '$carres_exact_context_writer_ddl$';
const a = probe.indexOf(`execute ${tag}`) + `execute ${tag}`.length;
const b = probe.indexOf(`${tag};`, a);
if (a < tag.length || b < a || probe.slice(a, b) !== draft.toString('utf8')) throw new Error('Rollback probe does not embed the exact reviewed draft');
const expected = probe.match(/for item in select \* from jsonb_array_elements\('(.+)'::jsonb\) loop/);
if (!expected || JSON.stringify(JSON.parse(expected[1].replaceAll("''", "'"))) !== JSON.stringify(review.functions)) throw new Error('Probe function/grant assertions differ from the review inventory');
if (!probe.includes('PROBE_ROLLBACK') || !probe.includes('no-account issue negative control')) throw new Error('Missing rollback or negative-control boundary');
for (const name of Object.keys(review.companion_files ?? {})) {
  const expected = review.companion_files?.[name]?.sha256;
  const actual = createHash('sha256').update(readFileSync(new URL(name, base))).digest('hex');
  if (expected !== actual) throw new Error(`Review companion does not match exact file: ${name}`);
}
for (const [name, evidence] of Object.entries(review.validation_files ?? {})) {
  const file = readFileSync(new URL(`../${name}`, import.meta.url));
  if (createHash('sha256').update(file).digest('hex') !== evidence.sha256) throw new Error(`Review validation file differs: ${name}`);
}
console.log(`Writer inspection package matches exact draft ${sha}; ${review.functions.length} function/grant assertions. No application or approval performed.`);

// The single approval manifest binds actual activation bytes, not a promise to
// replace the closed admission later. Transaction wrappers alone are omitted
// inside the atomic DO probe; every reviewed statement remains byte-exact.
const release = review.consolidated_sql_approval_manifest;
if (release?.activation?.exact_file) {
  const combined = readFileSync(new URL(release.combined_probe.file, base), 'utf8');
  const stripTransaction = source => source.replace(/^begin;\n/m, '').replace(/commit;\s*$/, '');
  const tags = ['exact_settings', 'exact_writers', 'exact_activation'];
  if (release.exact_existing_candidates.length !== tags.length) throw new Error('Incomplete combined release manifest');
  release.exact_existing_candidates.forEach((candidate, index) => {
    const bytes = readFileSync(new URL(candidate.file, base));
    if (createHash('sha256').update(bytes).digest('hex') !== candidate.sha256) throw new Error(`Release candidate hash differs: ${candidate.file}`);
    const tag = `$${tags[index]}$`;
    const start = combined.indexOf(`execute ${tag}`) + `execute ${tag}`.length;
    const end = combined.indexOf(`${tag};`, start);
    if (start < tag.length || end < start || combined.slice(start,end) !== stripTransaction(bytes.toString('utf8'))) throw new Error(`Combined probe differs: ${candidate.file}`);
  });
  if (release.activation.sha256 !== release.exact_existing_candidates[2].sha256) throw new Error('Activation manifest hash differs');
  const inventory = JSON.parse(readFileSync(new URL(release.combined_probe.inventory_file,base),'utf8'));
  const encoded = [...combined.matchAll(/for item in select \* from jsonb_array_elements\('(.+)'::jsonb\) loop/g)].find(match => JSON.parse(match[1].replaceAll("''", "'")).length === 82);
  if (!encoded || JSON.stringify(JSON.parse(encoded[1].replaceAll("''", "'"))) !== JSON.stringify(inventory) || inventory.length !== 82) throw new Error('Combined release inventory differs');
  if (!combined.includes('PROBE_ROLLBACK82')) throw new Error('Missing combined deliberate rollback');
  console.log(`Combined release binds three exact SQL files and ${inventory.length} assertions. Activation remains unapproved.`);
}
