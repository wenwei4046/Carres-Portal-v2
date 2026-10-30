// Carres measurement check. Run in the user's view (eval_js_user_view) after the page loads:
//   fetch('carres-check.js').then(r=>r.text()).then(eval)  — or paste the body. Returns a list of findings; empty = pass.
// Measures the live DOM against Carres Layout Standard §0 / §3 / §4. Add a rule here whenever the Standard changes.
(function () {
  const F = [], q = s => document.querySelector(s), qa = s => [...document.querySelectorAll(s)].filter(e => !e.closest('[data-print-doc]'));
  // Print documents (PO / SO paper previews, marked data-print-doc) are paper, not screen: skipped by every rule (Layout Standard: "The SO PDF preview is a print page").
  const cs = e => getComputedStyle(e), px = v => Math.round(parseFloat(v));
  const rgb = h => { const n = parseInt(h.slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; };
  const say = (where, what, got, want) => F.push(`${where}: ${what} = ${got} (want ${want})`);
  const T = window.CarresTheme ? window.CarresTheme.get() : null;
  // 1 page frame
  const nav = q('nav[aria-label=Modules]'), hd = q('header'), main = q('main'), sum = q('aside[aria-label=Summary]'), tk = q('aside[aria-label=Tasks]');
  if (!nav) say('frame', 'menu', 'missing', 'nav[aria-label=Modules]');
  if (nav && cs(nav).borderRightWidth !== '1px') say('menu', 'right hairline', cs(nav).borderRightWidth, '1px');
  if (hd && cs(hd).borderBottomWidth !== '1px') say('top bar', 'bottom hairline', cs(hd).borderBottomWidth, '1px');
  if (hd && px(hd.getBoundingClientRect().height) !== 56) say('top bar', 'height', px(hd.getBoundingClientRect().height), 56);
  // 2 three title rows on one 36-px line; content starts together
  const tb = q('[role=tablist][aria-label=Views]')?.parentElement;
  const rows = [['toolbar', tb], ['Summary title', sum?.children[0]], ['Tasks title', tk?.children[0]]].filter(x => x[1]);
  rows.forEach(([n, e]) => { const b = e.getBoundingClientRect(), drawer = e.closest('[data-kit=drawer][data-variant$="-panel"]'); if (px(b.height) !== 36) say(n, 'row height', px(b.height), 36); if (drawer) { const d = drawer.getBoundingClientRect(), width = drawer.dataset.variant === 'summary-panel' ? 264 : 340; if (px(d.width) !== width) say(n, 'overlay width', px(d.width), width); if (px(b.top) !== px(d.top) + 1) say(n, 'top inside overlay', px(b.top), px(d.top) + 1); } else if (tb && px(b.top) !== px(tb.getBoundingClientRect().top)) say(n, 'top', px(b.top), px(tb.getBoundingClientRect().top)); });
  // The Tasks body (what follows the 36px title row) starts level with the table. Measured on the body box: the old hunt for a card with an inline
  // border-radius walked out of a class-styled panel (the Portal) and reported top 0 (14 Oct, Code). In the design files the body top is the first card top.
  const table = main?.querySelector('section'), tkCard = tk?.children[1] ?? null, sumCard = sum?.children[1]?.children[0];
  [['Tasks first card', tkCard], ['Summary first card', sumCard]].forEach(([n, e]) => { if (e && table && !e.closest('[data-kit=drawer][data-variant$="-panel"]') && !q('main button[aria-label="Back to the list"]') && px(e.getBoundingClientRect().top) !== px(table.getBoundingClientRect().top)) say(n, 'top vs table', px(e.getBoundingClientRect().top), px(table.getBoundingClientRect().top)); });
  // 3 type ladder
  const txt = (root, pred) => root ? qa('span,button,a').filter(e => root.contains(e) && e.children.length === 0 && e.textContent.trim() && (!pred || pred(e))) : [];
  const chk = (n, e, size, weight) => { if (!e) return; const c = cs(e); if (c.fontSize !== size + 'px') say(n, 'size', c.fontSize, size); if (weight && c.fontWeight !== String(weight)) say(n, 'weight', c.fontWeight, weight); };
  chk('Summary title', txt(sum).find(e => e.textContent.trim() === 'Summary'), 15, 500);
  chk('Tasks title', txt(tk).find(e => e.textContent.trim() === 'Tasks'), 15, 500);
  qa('nav[aria-label=Modules] button').forEach(b => { const c = cs(b); if (b.hasAttribute('aria-expanded') && !b.hasAttribute('aria-current')) return; if (b.getAttribute('aria-current') == null) return; const main = !!b.querySelector(':scope > i.material-symbols-rounded'), cur = b.getAttribute('aria-current') === 'true', nm = b.innerText.trim().split('\n').pop(); if (c.fontSize !== '13px') say('menu item ' + nm, 'size', c.fontSize, 13); const want = cur ? '600' : main ? '500' : '400'; if (c.fontWeight !== want) say('menu item ' + nm, 'weight', c.fontWeight, want); });
  qa('[role=tab]').forEach(b => { const c = cs(b); const on = b.getAttribute('aria-selected') === 'true'; if (c.fontWeight !== (on ? '500' : '400')) say('tab ' + b.innerText, 'weight', c.fontWeight, on ? 500 : 400); });
  // A caps LABEL has letters; a money value (RM 2,629) or a number is a row value at 13, not a label (14 Oct, Code: the live Summary prints RM values)
  txt(sum, e => { const t = e.textContent.trim(); return /^[A-Z0-9 ·,]{5,}$/.test(t) && /[A-Z]{2}/.test(t) && !/^RM [\d,.]+$/.test(t); }).forEach(e => { if (cs(e).fontSize !== '11px') say('Summary caps ' + e.textContent.trim(), 'size', cs(e).fontSize, 11); });
  qa('aside[aria-label=Summary] button[aria-pressed]').forEach(b => { const h = px(b.getBoundingClientRect().height), bar = !!b.querySelector('span[style*="height: 4px"]'); if (h < 30 || h > (bar ? 38 : 32)) say('Summary row ' + b.innerText.split('\n')[0], 'height', h, '30–32'); });
  qa('nav a, nav button, nav span, aside[aria-label=Menu] span').forEach(e => { if (e.children.length === 0 && e.textContent.trim().length > 3 && e.scrollWidth > e.clientWidth + 1) say('Menu label cut ' + e.textContent.trim(), 'width', e.clientWidth, e.scrollWidth); });
  // 4 colours from the Standard
  if (T) { const root = nav?.parentElement; if (root && cs(root).backgroundColor !== rgb(T.page)) say('ground', 'colour', cs(root).backgroundColor, T.page); qa('[aria-current="true"]').forEach(b => { if (cs(b).backgroundColor !== rgb(T.selBg)) say('selected ' + b.innerText.trim().slice(0, 12), 'bg', cs(b).backgroundColor, T.selBg); }); const th0 = qa('[role=row]')[0]; if (th0 && cs(th0).backgroundColor !== rgb('#F8F9FA')) say('table header', 'bg', cs(th0).backgroundColor, '#F8F9FA'); }
  // 5 table
  // List rows only: the item rows an open row shows (item-rows) have their own rule (10), and their 32-px sub-header is not a list row (14 Oct, Code).
  // At least 44. A list row's cells are one line (fix list 14 Oct): a long value widens its column and the list scrolls in its own box; nothing is cut
  qa('[role=row]').filter(r => !r.closest('[data-carres-table="item-rows"]')).slice(1, 4).forEach((r, i) => { const h = px(r.getBoundingClientRect().height); if (h < 44) say('table row ' + (i + 1), 'height', h, 'at least 44'); });
  qa('[role=row]')[0] && qa('[role=row]')[0].querySelectorAll('button').forEach(b => { const t = b.innerText.replace(/\n.*/, '').trim(); if (/^[a-z_]+$/.test(t)) return; if (t && t !== t[0].toUpperCase() + t.slice(1) && /[a-z]/.test(t[0])) say('header ' + t, 'case', t, 'Sentence case'); if (/\b[A-Z][a-z]+ [A-Z][a-z]+/.test(t) && !/^(SO|PO|RM|ETA)\b/.test(t)) say('header ' + t, 'case', t, 'Sentence case'); });
  // 6 no black rings / stray colours
  qa('*').forEach(e => { const s = e.getAttribute('style') || ''; if (/0 0 0 2px #1F2937|0 0 0 2px rgb\(31, 41, 55\)/i.test(s)) say('ring', e.tagName, 'black 2px ring', 'none'); });
  // 7 type scale (Standard §3.3 type hierarchy): only these size/weight pairs; icons and avatar initials excluded
  const OKT = new Set(['20/600', '15/500', '14/400', '13/400', '13/500', '13/600', '12/400', '12/500', '11/500', '11/600', '11/700', '10/600', '10/700']);
  const badT = new Set(); qa('main *').forEach(e => { if (!e.offsetParent || e.classList.contains('material-symbols-rounded') || e.closest('[aria-label="Sales Order PDF preview"]')) return; if (![...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return; const st = cs(e), k = parseFloat(st.fontSize) + '/' + st.fontWeight; if (!OKT.has(k) && !/^[a-z_0-9]+$/.test(e.textContent.trim()) && !(st.borderRadius === '50%' && e.textContent.trim().length <= 3)) badT.add(k + ' "' + e.textContent.trim().slice(0, 24) + '"'); });
  badT.forEach(x => say('type', x, 'not in scale', '20/600 · 15/500 · 13 · 12 · 11'));
  // 8 item text: model and spec never on one line
  qa('main span').forEach(s => { if (s.children.length || s.closest('[aria-label="Sales Order PDF preview"]')) return; const t = s.textContent; if (/\S · (King|Queen|Single|Super single|Fab\d)/.test(t) && !/^(Fab\d|King|Queen|Single|Super single)/.test(t)) say('item text', '"' + t.slice(0, 40) + '"', 'model · spec on one line', 'two lines'); });
  // 9 nothing cut off
  qa('main span, main button').forEach(s => { if (!s.offsetParent || s.querySelector('span,i') || s.closest('[aria-label="Sales Order PDF preview"]') || s.closest('[data-list-scroll]')) return; const t = s.textContent.trim(); if (!t) return; let b = s; while (b && cs(b).overflowX === 'visible' && cs(b).overflow !== 'hidden') b = b.parentElement; if (b && !b.hasAttribute('data-list-scroll') && b.scrollWidth > b.clientWidth + 1 && /auto|scroll/.test(cs(b).overflowX)) { say('scroll', '"' + t.slice(0, 30) + '"', 'hidden in a side-scroll box', 'fits without scrolling'); return; } if (!b) return; const r = document.createRange(); r.selectNodeContents(s); if (r.getBoundingClientRect().right > b.getBoundingClientRect().right + 1) say('cut', '"' + t.slice(0, 30) + '"', 'cut off', 'shown in full'); });
  // 10 row heights: table header 40, item rows 44, card field rows 36
  qa('main div').forEach(d => { const g = cs(d).gridTemplateColumns; if (!d.offsetParent || d.closest('[aria-label="Sales Order PDF preview"]')) return; const h = px(d.getBoundingClientRect().height); if (g.startsWith('150px ') && h < 36) say('field row', '"' + d.innerText.split('\n')[0].slice(0, 20) + '"', h, '36'); if (d.style.minHeight === '44px' && h < 44) say('item row', '"' + d.innerText.split('\n')[0].slice(0, 20) + '"', h, '44'); });
  // 11 icon-only buttons: round, no border
  qa('main button').forEach(b => { if (!b.offsetParent) return; const t = b.innerText.trim(); if (!/^[a-z_0-9]+$/.test(t)) return; if (px(cs(b).borderTopWidth) > 0) say('icon button', t, 'has a border', 'round, no border'); });
  // 12 open menus must be visible (not clipped by a parent)
  qa('[role=menu]').forEach(m => { const r = m.getBoundingClientRect(), pt = document.elementFromPoint(r.left + 10, r.top + Math.min(40, r.height / 2)); if (!m.contains(pt)) say('menu', m.getAttribute('aria-label') || 'menu', 'hidden / clipped', 'visible'); });
  // 14 controls inside their box (13 Oct, Code found: a toolbar button cut by a parent with overflow hidden passed): every visible button / input in main, header and the Tasks panel must sit fully inside the nearest parent that clips, and inside the window
  qa('main button, main input, header button, aside[aria-label="Tasks"] button').forEach(b => { if (!b.offsetParent || b.closest('[data-list-scroll]') || b.closest('[role=menu]')) return; const r = b.getBoundingClientRect(); if (r.width < 4) return; if (r.right > innerWidth + 1 || r.left < -1) { say('control ' + (b.getAttribute('aria-label') || b.innerText.trim().slice(0, 24)), 'outside the window by', Math.round(Math.max(r.right - innerWidth, -r.left)), 0); return; } let p = b.parentElement; while (p && p !== document.body) { const o = cs(p); if (/(hidden|clip|auto|scroll)/.test(o.overflowX + o.overflow)) { const q = p.getBoundingClientRect(); if (r.right > q.right + 1 || r.left < q.left - 1) say('control ' + (b.getAttribute('aria-label') || b.innerText.trim().slice(0, 24)), 'cut by its box by', Math.round(Math.max(r.right - q.right, q.left - r.left)), 0); break; } p = p.parentElement; } });
  // 13 shared parts only (owner 11 Oct): tabs = the Shell segmented control; tables = Carres Table
  qa('main [role=tablist]').forEach(tl => { if (!tl.offsetParent || tl.getAttribute('aria-label') === 'Days' || tl.closest('aside[aria-label="Tasks"]') && tl.getAttribute('aria-label') === 'Show') return; const bg = cs(tl).backgroundColor; if (bg !== 'rgb(226, 228, 232)') say('own tabs', '"' + (tl.getAttribute('aria-label') || tl.innerText.split('\n')[0]) + '"', 'not the shared segmented control', 'Shell tabs style'); });
  const seen = new Set(); qa('main div').forEach(d => { if (!d.offsetParent || d.closest('[data-carres-table]') || d.closest('[aria-label*="PDF"]') || seen.has(d.parentElement)) return; const g = cs(d).gridTemplateColumns; if (!g || g === 'none' || g.split(' ').length < 4) return; const sib = [...d.parentElement.children].filter(x => cs(x).gridTemplateColumns === g); if (sib.length >= 3) { seen.add(d.parentElement); say('own table', '"' + d.innerText.split('\n')[0].slice(0, 24) + '"', 'drawn by the page', 'Carres Table'); } });
  return F.length ? F : ['PASS — all measured items match the Standard'];
})();
