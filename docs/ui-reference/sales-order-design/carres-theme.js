// Shared runtime theme for every Carres page (Shell, Table, modules). Per-person choice, saved in localStorage 'carres.theme'.
// A theme changes the selection pair only (selBg / selFg + its dot). Page ground, borders, greys and status colours are fixed (Layout Standard §4.0).
(function () {
  const T = {
    carres: { name: 'Carres', grp: 'Brand', dot: '#D64F20', page: '#FAFAF9', selBg: '#FBE6DB', selFg: '#A33A14' },
    slate: { name: 'Cool Slate', grp: 'Cool', dot: '#64748B', page: '#FAFAF9', selBg: '#E6E9EE', selFg: '#1F2937' },
    blue: { name: 'Blue', grp: 'Cool', dot: '#3965FA', page: '#F6F7F9', selBg: '#FFFFFF', selFg: '#2F55E0', hov0: '#E2E4E8', selSoft: '#EEF4FF', rowHov: '#F2F3F5', selLine: '#E5E7EB', selBar: '#FFFFFF' },
    teal: { name: 'Teal', grp: 'Cool', dot: '#14857C', page: '#FAFAF9', selBg: '#DDF0EE', selFg: '#0F5F59' },
    violet: { name: 'Violet', grp: 'Cool', dot: '#6E58C4', page: '#FAFAF9', selBg: '#ECE8F7', selFg: '#4C3A8F' },
    honey: { name: 'Warm Honey', grp: 'Warm', dot: '#D9A21B', page: '#FAFAF9', selBg: '#FBEFC9', selFg: '#7A5300' },
    olive: { name: 'Olive', grp: 'Warm', dot: '#6E8A3E', page: '#FAFAF9', selBg: '#E6ECD9', selFg: '#3F5A2A' },
    rose: { name: 'Rose', grp: 'Warm', dot: '#C2546A', page: '#FAFAF9', selBg: '#F7E1E4', selFg: '#8A2E40' },
    latte: { name: 'Latte', grp: 'Warm', dot: '#8B6B4A', page: '#FAFAF9', selBg: '#ECE3D8', selFg: '#5A4632' },
  };
  const tint = hex => { const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; const mix = (c, w) => Math.round(w + (c - w) * 0.025); return '#' + [mix(r, 252), mix(g, 252), mix(b, 251)].map(x => x.toString(16).padStart(2, '0')).join(''); };
  const mixHex = (a, b, w) => { const p = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; const A = p(a), B = p(b); return '#' + A.map((x, i) => Math.round(x + (B[i] - x) * w).toString(16).padStart(2, '0')).join(''); };
  Object.values(T).forEach(v => { v.page = '#F6F7F9'; v.hov = v.hov0 || mixHex('#FFFFFF', v.selBg, 0.45); });
  const key = () => { try { const k = localStorage.getItem('carres.theme'); return T[k] ? k : 'blue'; } catch (e) { return 'blue'; } };
  window.CarresTheme = {
    THEMES: T,
    key,
    get: () => ({ key: key(), ...T[key()] }),
    set: k => { try { localStorage.setItem('carres.theme', k); } catch (e) {} window.dispatchEvent(new Event('carres-theme')); },
    tone: { ok: ['#E7F6EC', '#1E7A40'], warn: ['#FBF0D6', '#7A5A00'], neutral: ['#E5E7EB', '#374151'], hold: ['#1F2937', '#FFFFFF'], none: ['#F1F2F4', '#6B7280'] },
  };
})();
