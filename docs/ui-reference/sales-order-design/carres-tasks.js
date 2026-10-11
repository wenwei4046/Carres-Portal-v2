// Shared task inbox (owner 11 Oct): every module page publishes its open tasks; the Tasks panel on any page shows all modules.
// Stored per person in localStorage ('carres.tasks.<Module>' + '.href'). Prototype only: the real build reads one task service.
window.CarresTasks = {
  publish(mod, href, rows) {
    const k = 'carres.tasks.' + mod;
    const v = JSON.stringify((rows || []).map(r => ({ key: r.key, mod: r.mod || mod, t: r.t, sub: r.sub || '', ref: r.ref || '', late: !!r.late, due: r.due || '', dueDay: r.dueDay || '', isNew: !!r.isNew })));
    try { if (localStorage.getItem(k) !== v) localStorage.setItem(k, v); if (href) localStorage.setItem(k + '.href', href); } catch (e) {}
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
