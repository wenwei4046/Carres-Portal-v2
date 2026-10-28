// Shared task inbox (owner 11 Oct): every module page publishes its open tasks; the Tasks panel on any page shows all modules.
// Stored per person in localStorage ('carres.tasks.<Module>' + '.href'). Prototype only: the real build reads one task service.
window.CarresTasks = {
  // Owners (owner 11 Oct, Ops Rules §6). TEST until auto share is connected: "You" = Staff A; a task made by your own action is yours;
  // other tasks are shared over the working TEST team; Take over writes 'carres.owner'.
  get ME() { try { return localStorage.getItem('carres.me') || 'Staff A'; } catch (e) { return 'Staff A'; } },
  setMe(n) { try { localStorage.setItem('carres.me', n); } catch (e) {} },
  ROLES: ['Jess (COO)', 'Payments'],
  label(n) { return /^Staff /.test(n) ? 'TEST · ' + n : n; },
  PO_DUTY: 'Staff A', // TEST: today's PO Duty (Ops Rules: supplier late is chased by PO Duty). Real value comes from Settings → Team → Duty.
  PEOPLE: [['Staff A', 'on', ''], ['Staff C', 'away', 'Away · 34m idle'], ['Staff D', 'on', ''], ['Staff B', 'off', 'MC today · jobs moved to Staff D']],
  owners() { try { return JSON.parse(localStorage.getItem('carres.owner') || '{}'); } catch (e) { return {}; } },
  ownerOf(r, map) { if (r.owner) return r.owner; const k = r.mod + '|' + r.key, m = map || this.owners(); if (m[k]) return m[k]; if (r.isNew) return this.ME; if (r.mod === 'Purchasing' && /^(chase|eta|sdo|clm|am|pm|placeToday|send|keep):/.test(String(r.key) + ':')) return this.PO_DUTY; const W = this.PEOPLE.filter(p => p[1] !== 'off').map(p => p[0]); const h = String(k).split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7); return W[h % W.length]; },
  take(r) { const m = { ...this.owners(), [r.mod + '|' + r.key]: this.ME }; try { localStorage.setItem('carres.owner', JSON.stringify(m)); } catch (e) {} },
  publish(mod, href, rows) {
    const k = 'carres.tasks.' + mod;
    const v = JSON.stringify((rows || []).map(r => ({ key: r.key, mod: r.mod || mod, t: r.t, sub: r.sub || '', next: r.next || '', owner: r.owner || '', ref: r.ref || '', late: !!r.late, due: r.due || '', dueDay: r.dueDay || '', isNew: !!r.isNew, later: !!r.later, fol: !!r.fol, prog: !!r.prog, plan: !!r.plan, who: r.who || '' })));
    try { if (localStorage.getItem(k) !== v) localStorage.setItem(k, v); if (href) localStorage.setItem(k + '.href', href); } catch (e) {}
  },
  publishDone(mod, href, rows) {
    const k = 'carres.done.' + mod, old = (() => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch (e) { return []; } })(), seen = new Set(old.map(r => r.t + '|' + r.day));
    const day = new Date().toDateString(), add = (rows || []).filter(r => r && r.t && !seen.has(r.t + '|' + day)).map(r => ({ t: r.t, mod, href, at: new Date().toISOString(), day, by: this.ME || '' }));
    if (add.length) try { localStorage.setItem(k, JSON.stringify([...add, ...old].slice(0, 200))); } catch (e) {}
  },
  all(prefix) {
    const out = [];
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (!/^carres\.(tasks|done)\.[^.]+$/.test(k) || !k.startsWith('carres.' + prefix + '.')) continue; const mod = k.split('.')[2], href = localStorage.getItem('carres.tasks.' + mod + '.href') || ''; JSON.parse(localStorage.getItem(k) || '[]').forEach(r => out.push({ ...r, mod: r.mod || mod, href: r.href || href })); } } catch (e) {}
    return out;
  },
  others(mod) {
    const out = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!/^carres\.tasks\.[^.]+$/.test(k) || k === 'carres.tasks.' + mod) continue;
        const href = localStorage.getItem(k + '.href') || '';
        JSON.parse(localStorage.getItem(k) || '[]').forEach(r => out.push({ ...r, href, remote: true }));
      }
    } catch (e) {}
    return out;
  },
};
