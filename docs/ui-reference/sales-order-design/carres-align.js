// carres-align.js — fingerprint of the shared parts on the page in view. Run it on every module and compare with SO Batch Purchase (the newest agreed page).
// Code, 14 Oct: the Portal draws an icon from data-icon, never as text (no icon name in search, copy or export), so ⋮ is also found by [data-icon="more_vert"].
(() => {
  const q = s => document.querySelector(s), cs = e => getComputedStyle(e), H = e => Math.round(e.getBoundingClientRect().height);
  const main = q('main'); if (!main) return { error: 'no main' };
  const top = main.getBoundingClientRect().top + 60;
  const bar = [...main.querySelectorAll('button')].filter(b => b.offsetParent && b.getBoundingClientRect().top < top);
  const tl = main.querySelector('[role=tablist]'), tb = q('[data-carres-table]'), rows = tb ? [...tb.querySelectorAll('[role=row]')] : [], hd = rows[0];
  const txt = e => [...e.childNodes].map(n => n.nodeType === 3 ? n.textContent : n.tagName === 'I' ? '' : txt(n)).join('').trim();
  const hcell = hd ? [...hd.children].find(c => txt(c)) : null, hs = hcell ? (hcell.querySelector('span') || hcell) : null;
  const tk = q('aside[aria-label="Tasks"]'), more = bar.find(b => /more_vert/.test(b.textContent) || b.querySelector('[data-icon="more_vert"]')), view = bar.find(b => b.getAttribute('aria-label') && /^View|Columns|Group/.test(b.getAttribute('aria-label')));
  const foot = tb ? tb.lastElementChild : null;
  return {
    toolbar: { height: bar.length ? Math.max(...bar.map(H)) : 0, tabs: tl ? H(tl) + ' ' + cs(tl).backgroundColor : 'none', viewBtn: view ? H(view) + ' · ' + (txt(view) || 'icon only') : 'none', more: more ? H(more) : 'none' },
    table: hd ? { headH: H(hd), headBg: cs(hd).backgroundColor, headFont: hs ? cs(hs).fontSize + '/' + cs(hs).fontWeight : '', headWords: hd ? [...hd.children].map(txt).filter(Boolean).join(' · ') : '', rowH: rows.slice(1, 3).map(H).join('/'), sticky: cs(hd).position, footer: foot ? (/Rows 20/.test(foot.innerText) ? 'pager' : 'no pager') : '' } : 'no table',
    tasks: tk ? (tk.querySelector('[role=tablist][aria-label="Days"]') || /Waiting \d/.test(tk.innerText) ? 'list (week strip · To do / Waiting / Done)' : 'old panel') : 'closed',
    dates: (() => { const t = main.innerText; return /\b\d{1,2} [A-Z][a-z]{2} \d{2}\b/.test(t) ? 'has 2-digit year' : 'no year'; })()
  };
})()
