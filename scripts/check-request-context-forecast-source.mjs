// Project only the current shared FORECAST DISPLAY constants; NOT a business-law inventory/cap.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { FORECAST_PURCHASE_RATE_DAYS, FORECAST_PURCHASE_LEVEL_DAYS, FORECAST_PURCHASE_WEEK_DAYS, FORECAST_PURCHASE_OUTRIGHT_SCOPE } from '../packages/shared/src/forecast-purchase.ts';
const target = process.argv.find(a => a.startsWith('--file='))?.slice(7) ?? 'output/forecast-mpr-delivery/purchase-request-writers.draft.sql';
const data = { authority: 'existing_forecast_display_proposal_not_purchase_authority', rate_days: FORECAST_PURCHASE_RATE_DAYS, level_days: FORECAST_PURCHASE_LEVEL_DAYS, week_days: FORECAST_PURCHASE_WEEK_DAYS, scope: FORECAST_PURCHASE_OUTRIGHT_SCOPE };
const encoded = JSON.stringify(data);
const hash = createHash('sha256').update(encoded).digest('hex');
const start = '-- BEGIN GENERATED EXISTING FORECAST DISPLAY SOURCE';
const end = '-- END GENERATED EXISTING FORECAST DISPLAY SOURCE';
const block = `${start}\n-- Source: packages/shared/src/forecast-purchase.ts, SHA256 ${hash}\n-- Display baseline only. Changed quantities require reason + actual approval, no automatic cap/permission.\ncreate or replace function public._purchasing_context_forecast_display_source()\nreturns jsonb language sql immutable set search_path=public,pg_temp as $forecast_display$\n select '${encoded.replaceAll("'", "''")}'::jsonb;\n$forecast_display$;\nrevoke all on function public._purchasing_context_forecast_display_source() from public,anon,authenticated;\n${end}`;
const text = readFileSync(target,'utf8'); const a=text.indexOf(start), b=text.indexOf(end);
if(a<0||b<a) throw new Error('Missing forecast display projection markers');
const expected=text.slice(0,a)+block+text.slice(b+end.length);
if(process.argv.includes('--write')) writeFileSync(target,expected);
else if(text!==expected) throw new Error('Forecast display-source projection differs; regenerate and review');
console.log(`Forecast source projection matches existing display (${hash}); no purchase authority inferred`);
