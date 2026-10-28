// Shared order records (owner 11 Oct). Prototype only: localStorage stands in for the order service.
// Timeline events per SO, and stock moves between SOs (who gave, who got, item, qty, replacement PO + ETA, by, time).
window.CarresLog = {
  _get(k) { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch (e) { return []; } },
  _set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  _seq: 0, hist: [],
  seqNow() { return this._seq; },
  add(so, ev) { const seq = ++this._seq; this.hist.push({ seq, so, t: ev.t }); const k = 'carres.timeline.' + so; this._set(k, [ev, ...this._get(k)].slice(0, 200)); },
  of(so) { return this._get('carres.timeline.' + so); },
  move(m) { const seq = ++this._seq; this.hist.push({ seq, move: m.id }); this._set('carres.moves', [m, ...this._get('carres.moves')]); },
  patchMove(id, p) { this._set('carres.moves', this._get('carres.moves').map(m => m.id === id ? { ...m, ...p } : m)); },
  moves() { return this._get('carres.moves'); },
};
