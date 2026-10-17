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
for (const name of ['purchase-request-writers.rollback-probe.sql', 'purchase-request-context.local-check.sql', 'purchase-request-service-source-evidence.json', 'purchase-request-settings-writer.draft.sql', 'local-test-documents/LOCAL-TEST-GP-lifecycle.json', 'local-test-documents/LOCAL-TEST-RS-lifecycle.json']) {
  const expected = review.companion_files?.[name]?.sha256;
  const actual = createHash('sha256').update(readFileSync(new URL(name, base))).digest('hex');
  if (expected !== actual) throw new Error(`Review companion does not match exact file: ${name}`);
}
const integrationPath = 'apps/api/src/test/purchase-request-browser.integration.test.ts';
const integration = readFileSync(new URL(`../${integrationPath}`, import.meta.url));
if (createHash('sha256').update(integration).digest('hex') !== review.validation_files?.[integrationPath]?.sha256) throw new Error('Review refers to a different integration fixture');
console.log(`Writer inspection package matches exact draft ${sha}; ${review.functions.length} function/grant assertions. No application or approval performed.`);
