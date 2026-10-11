// Carres measurement check. Run in the user's view (eval_js_user_view) after the page loads:
//   fetch('carres-check.js').then(r=>r.text()).then(eval)  — or paste the body. Returns a list of findings; empty = pass.
// Measures the live DOM against Carres Layout Standard §0 / §3 / §4. Add a rule here whenever the Standard changes.
(function () {
  const F = [], q = s => document.querySelector(s), qa = s => [...document.querySelectorAll(s)];
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
  rows.forEach(([n, e]) => { const b = e.getBoundingClientRect(); if (px(b.height) !== 36) say(n, 'row height', px(b.height), 36); if (tb && px(b.top) !== px(tb.getBoundingClientRect().top)) say(n, 'top', px(b.top), px(tb.getBoundingClientRect().top)); });
  const table = main?.querySelector('section'), tkCard = tk?.querySelector('button[aria-expanded]')?.parentElement, sumCard = sum?.children[1]?.children[0];
  [['Tasks first card', tkCard], ['Summary first card', sumCard]].forEach(([n, e]) => { if (e && table && !q('main button[aria-label="Back to the list"]') && px(e.getBoundingClientRect().top) !== px(table.getBoundingClientRect().top)) say(n, 'top vs table', px(e.getBoundingClientRect().top), px(table.getBoundingClientRect().top)); });
  // 3 type ladder
  const txt = (root, pred) => root ? qa('span,button,a').filter(e => root.contains(e) && e.children.length === 0 && e.textContent.trim() && (!pred || pred(e))) : [];
  const chk = (n, e, size, weight) => { if (!e) return; const c = cs(e); if (c.fontSize !== size + 'px') say(n, 'size', c.fontSize, size); if (weight && c.fontWeight !== String(weight)) say(n, 'weight', c.fontWeight, weight); };
  chk('Summary title', txt(sum).find(e => e.textContent.trim() === 'Summary'), 15, 500);
  chk('Tasks title', txt(tk).find(e => e.textContent.trim() === 'Tasks'), 15, 500);
  qa('nav[aria-label=Modules] button').forEach(b => { const c = cs(b); if (b.innerText.trim().split('\n').length > 1 && c.fontSize !== '13px') say('menu item ' + b.innerText.split('\n')[1], 'size', c.fontSize, 13); if (b.getAttribute('aria-current') === 'true' && c.fontWeight !== '500') say('menu selected', 'weight', c.fontWeight, 500); if (b.getAttribute('aria-current') === 'false' && c.fontWeight !== '400') say('menu item ' + b.innerText.split('\n')[1], 'weight', c.fontWeight, 400); });
  qa('[role=tab]').forEach(b => { const c = cs(b); const on = b.getAttribute('aria-selected') === 'true'; if (c.fontWeight !== (on ? '500' : '400')) say('tab ' + b.innerText, 'weight', c.fontWeight, on ? 500 : 400); });
  txt(sum, e => /^[A-Z0-9 ·,]{5,}$/.test(e.textContent.trim())).forEach(e => { if (cs(e).fontSize !== '11px') say('Summary caps ' + e.textContent.trim(), 'size', cs(e).fontSize, 11); });
  qa('aside[aria-label=Summary] button[aria-pressed]').forEach(b => { const h = px(b.getBoundingClientRect().height); if (h < 30 || h > 32) say('Summary row ' + b.innerText.split('\n')[0], 'height', h, '30–32'); });
  // 4 colours from the Standard
  if (T) { const root = nav?.parentElement; if (root && cs(root).backgroundColor !== rgb(T.page)) say('ground', 'colour', cs(root).backgroundColor, T.page); qa('[aria-current="true"]').forEach(b => { if (cs(b).backgroundColor !== rgb(T.selBg)) say('selected ' + b.innerText.trim().slice(0, 12), 'bg', cs(b).backgroundColor, T.selBg); }); const th0 = qa('[role=row]')[0]; if (th0 && cs(th0).backgroundColor !== rgb('#F8F9FA')) say('table header', 'bg', cs(th0).backgroundColor, '#F8F9FA'); }
  // 5 table
  qa('[role=row]').slice(1, 4).forEach((r, i) => { const h = px(r.getBoundingClientRect().height); if (h < 44 || h > 56) say('table row ' + (i + 1), 'height', h, '44–56'); });
  qa('[role=row]')[0] && qa('[role=row]')[0].querySelectorAll('button').forEach(b => { const t = b.innerText.replace(/\n.*/, '').trim(); if (/^[a-z_]+$/.test(t)) return; if (t && t !== t[0].toUpperCase() + t.slice(1) && /[a-z]/.test(t[0])) say('header ' + t, 'case', t, 'Sentence case'); if (/\b[A-Z][a-z]+ [A-Z][a-z]+/.test(t) && !/^(SO|PO|RM|ETA)\b/.test(t)) say('header ' + t, 'case', t, 'Sentence case'); });
  // 6 no black rings / stray colours
  qa('*').forEach(e => { const s = e.getAttribute('style') || ''; if (/0 0 0 2px #1F2937|0 0 0 2px rgb\(31, 41, 55\)/i.test(s)) say('ring', e.tagName, 'black 2px ring', 'none'); });
  // 7 type scale (Standard §3.3 type hierarchy): only these size/weight pairs; icons and avatar initials excluded
  const OKT = new Set(['20/600', '15/500', '14/400', '13/400', '13/500', '13/600', '12/400', '12/500', '11/500', '11/700']);
  const badT = new Set(); qa('main *').forEach(e => { if (!e.offsetParent || e.classList.contains('material-symbols-rounded')) return; if (![...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return; const st = cs(e), k = parseFloat(st.fontSize) + '/' + st.fontWeight; if (!OKT.has(k) && !/^[a-z_0-9]+$/.test(e.textContent.trim()) && !(st.borderRadius === '50%' && e.textContent.trim().length <= 3)) badT.add(k + ' "' + e.textContent.trim().slice(0, 24) + '"'); });
  badT.forEach(x => say('type', x, 'not in scale', '20/600 · 15/500 · 13 · 12 · 11'));
  // 8 item text: model and spec never on one line
  qa('main span').forEach(s => { if (s.children.length) return; const t = s.textContent; if (/\S · (King|Queen|Single|Super single|Fab\d)/.test(t) && !/^(Fab\d|King|Queen|Single|Super single)/.test(t)) say('item text', '"' + t.slice(0, 40) + '"', 'model · spec on one line', 'two lines'); });
  // 9 nothing cut off
  qa('main span, main button').forEach(s => { if (!s.offsetParent || s.querySelector('span,i')) return; const t = s.textContent.trim(); if (!t) return; let b = s; while (b && cs(b).overflowX === 'visible' && cs(b).overflow !== 'hidden') b = b.parentElement; if (b && !b.hasAttribute('data-list-scroll') && b.scrollWidth > b.clientWidth + 1 && /auto|scroll/.test(cs(b).overflowX)) { say('scroll', '"' + t.slice(0, 30) + '"', 'hidden in a side-scroll box', 'fits without scrolling'); return; } if (!b) return; const r = document.createRange(); r.selectNodeContents(s); if (r.getBoundingClientRect().right > b.getBoundingClientRect().right + 1) say('cut', '"' + t.slice(0, 30) + '"', 'cut off', 'shown in full'); });
  // 10 row heights: table header 40, item rows 44, card field rows 36
  qa('main div').forEach(d => { const g = cs(d).gridTemplateColumns; if (!d.offsetParent) return; const h = px(d.getBoundingClientRect().height); if (g.startsWith('150px ') && h < 36) say('field row', '"' + d.innerText.split('\n')[0].slice(0, 20) + '"', h, '36'); if (d.style.minHeight === '44px' && h < 44) say('item row', '"' + d.innerText.split('\n')[0].slice(0, 20) + '"', h, '44'); });
  // 11 icon-only buttons: round, no border
  qa('main button').forEach(b => { if (!b.offsetParent) return; const t = b.innerText.trim(); if (!/^[a-z_0-9]+$/.test(t)) return; if (px(cs(b).borderTopWidth) > 0) say('icon button', t, 'has a border', 'round, no border'); });
  // 12 open menus must be visible (not clipped by a parent)
  qa('[role=menu]').forEach(m => { const r = m.getBoundingClientRect(), pt = document.elementFromPoint(r.left + 10, r.top + Math.min(40, r.height / 2)); if (!m.contains(pt)) say('menu', m.getAttribute('aria-label') || 'menu', 'hidden / clipped', 'visible'); });
  return F.length ? F : ['PASS — all measured items match the Standard'];
})();
