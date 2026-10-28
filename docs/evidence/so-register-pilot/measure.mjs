import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const browser = await chromium.launch();
const page = await browser.newPage();
const samples=[];
for(const view of ['table','cards']) for(const width of [1440,825,390]) {
 await page.setViewportSize({width,height:1000});
 await page.goto(`http://127.0.0.1:5197/sales-orders-register-pilot.html?view=${view}`,{waitUntil:'commit'});
 await page.getByTestId(view==='cards'?'sales-orders-cards':'grid-parent-row').first().waitFor({timeout:90000});
 await page.evaluate(()=>document.fonts.ready);
 const metrics=await page.evaluate(()=>{
  const measure=(selector)=>{const e=document.querySelector(selector);if(!e)return null;const r=e.getBoundingClientRect(),c=getComputedStyle(e);return {width:r.width,height:r.height,font:c.fontFamily,size:c.fontSize,weight:c.fontWeight,lineHeight:c.lineHeight,padding:c.padding,gap:c.gap,border:c.borderWidth,radius:c.borderRadius}};
  return {heading:measure('[data-testid="sales-orders-destination-header"]'),toolbar:measure('[data-testid="work-toolbar"]'),search:measure('[data-testid="search-box"]'),searchText:measure('input[type="search"]'),pageTools:measure('[aria-label="Page tools"]'),header:measure('[data-testid="grid-header"] th'),row:measure('[data-testid="grid-parent-row"]'),cell:measure('[data-testid="grid-parent-row"] td'),rail:measure('[data-testid="sales-orders-rail"]'),card:measure('[data-testid^="sales-order-card-"] [data-block]'),cardTitle:measure('[data-testid^="sales-order-card-"] h2'),label:measure('[data-testid^="sales-order-card-"] dt'),value:measure('[data-testid^="sales-order-card-"] dd'),footer:measure('[data-testid="grid-footer"]'),overflow:document.documentElement.scrollWidth>innerWidth};
 });
 samples.push({view,width,metrics});
 if(view==='table')await page.screenshot({path:fileURLToPath(new URL(`table-${width}.png`,import.meta.url))});
}
await browser.close();
writeFileSync(fileURLToPath(new URL('measurements.json',import.meta.url)),JSON.stringify({sourceSha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),samples},null,2)+'\n');
