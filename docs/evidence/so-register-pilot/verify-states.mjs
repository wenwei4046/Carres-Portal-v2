import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const evidence=[]; const log=console.log;console.log=(...args)=>{evidence.push(args);log(...args)};
import { chromium, expect } from '@playwright/test';
const b=await chromium.launch();const p=await b.newPage({viewport:{width:825,height:1000}});const out=fileURLToPath(new URL('.',import.meta.url));
for (const view of ['table','cards']) for(const scenario of ['empty','failed','denied','loading']) {
 await p.goto(`http://127.0.0.1:5197/sales-orders-register-pilot.html?view=${view}&scenario=${scenario}`,{waitUntil:'commit'});await p.getByTestId('work-toolbar').waitFor({timeout:90000});
 if(scenario==='empty')await p.getByText('No sales orders yet',{exact:true}).waitFor();
 if(scenario==='failed'||scenario==='denied')await p.getByRole('alert').waitFor();
 console.log(view,scenario,(await p.locator('[data-testid="sales-orders-grid"]').innerText()).slice(-450));
 await p.screenshot({path:out+`${view}-${scenario}.png`});
}
await p.goto('http://127.0.0.1:5197/sales-orders-register-pilot.html?view=cards',{waitUntil:'commit'});await p.getByTestId('sales-orders-cards').waitFor();await p.getByRole('button',{name:'Page tools',exact:true}).click();await p.getByRole('menuitem',{name:'Columns',exact:true}).click();await p.getByRole('button',{name:'Filter Customer',exact:true}).click();await p.getByTestId('column-filter-menu').waitFor();await p.getByTestId('column-filter-menu').getByText('Kimmy',{exact:true}).click();await p.keyboard.press('Escape');await expect(p.locator('[data-testid^="sales-order-card-"]')).toHaveCount(7);console.log('commonHeaderFilter',7);await p.getByTestId('clear-filters').click();await expect(p.locator('[data-testid^="sales-order-card-"]')).toHaveCount(72);
await p.getByRole('searchbox').fill('nothing-like-this');await p.getByText('No sales orders match these filters',{exact:false}).first().waitFor();await p.getByRole('button',{name:'Clear filters',exact:true}).click();await expect(p.locator('[data-testid^="sales-order-card-"]')).toHaveCount(72);console.log('noMatchClear',72);
await p.evaluate(()=>document.body.style.zoom='200%');await p.screenshot({path:out+'zoom-200.png'});console.log('zoomOverflow',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth));await b.close();

writeFileSync(out+'states.json',JSON.stringify(evidence,null,2)+'\n');
