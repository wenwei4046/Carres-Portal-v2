// Generated SQL projection of the EXISTING supplier holiday data, never a new calendar.
// node scripts/check-request-context-calendar.mjs [--write] [--file=<draft-or-migration>]
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { myHolidaySet } from '../packages/shared/src/my-holidays.ts';
const target = process.argv.find(a => a.startsWith('--file='))?.slice(7) ?? 'output/forecast-mpr-delivery/purchase-request-writers.draft.sql';
const dates = [...myHolidaySet()].sort();
const fingerprint = createHash('sha256').update(JSON.stringify(dates)).digest('hex');
const start = '-- BEGIN GENERATED EXISTING SUPPLIER HOLIDAY PROJECTION';
const end = '-- END GENERATED EXISTING SUPPLIER HOLIDAY PROJECTION';
const block = `${start}\n-- Source: packages/shared/src/my-holidays.ts myHolidaySet(), SHA256 ${fingerprint}\n-- Inherits that source's provisional/limited-year data; no Office calendar substitution.\ncreate or replace function public._purchasing_context_holiday_dates()\nreturns date[] language sql immutable set search_path=public,pg_temp as $holidays$\n  select array[${dates.map(d => `'${d}'::date`).join(',')}];\n$holidays$;\nrevoke all on function public._purchasing_context_holiday_dates() from public,anon,authenticated;\n${end}`;
const text = readFileSync(target, 'utf8');
const a = text.indexOf(start), b = text.indexOf(end);
if (a < 0 || b < a) throw new Error('Missing supplier-calendar projection markers');
const expected = text.slice(0, a) + block + text.slice(b + end.length);
if (process.argv.includes('--write')) writeFileSync(target, expected);
else if (text !== expected) throw new Error('Supplier calendar projection differs from the existing shared source; regenerate, review and validate the exact SQL');
console.log(`Supplier holiday projection matches myHolidaySet: ${dates.length} dates, ${fingerprint}`);
