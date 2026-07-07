// 2990's POS — Order Status page
// PIN-gated (6-digit) screen with three lanes:
//   1. Place Order   — placed, but delivery date / address still TBD
//   2. Proceed Order — fully confirmed (info complete, ≥50% paid, address + date set)
//   3. Delivered     — handled by the backend portal (read-only callout)
//
// The PIN gate exists because this view exposes customer details and pricing,
// which can be visible to walk-in customers if a salesperson leaves the
// tablet on the showroom counter.

const { useState: useStateOS, useEffect: useEffectOS, useMemo: useMemoOS } = React;

const ORDER_STATUS_PIN = '299000'; // demo

// Locale-proof RM grouping. The original used toLocaleString('en-MY'), which
// groups with commas in a full browser but falls back to PERIOD grouping in
// some runtimes — making RM32,890 misread as "RM32.890". Group manually so the
// total-sales summary always reads with comma thousands, no decimals.
function rmGroup(n) {
  return (Math.round(Number(n) || 0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// ---------- Revenue + period helpers ----------
// A sale splits into three revenue streams (mirrors 2990's sales view):
//   products — the furniture line items (order.subtotal)
//   service  — delivery / assembly / disposal add-ons
//   kpi      — KPI-item sales (accessories counted toward the staff KPI)
function orderRevenue(o) {
  const products = Number(o.subtotal) || 0;
  const service  = Number(o.service)  || 0;
  const kpi      = Number(o.kpi)      || 0;
  return { products, service, kpi, total: products + service + kpi };
}
function sumRevenue(list) {
  return list.reduce((a, o) => {
    const r = orderRevenue(o);
    a.products += r.products; a.service += r.service; a.kpi += r.kpi; a.total += r.total;
    return a;
  }, { products: 0, service: 0, kpi: 0, total: 0 });
}
function sameMonth(ms, anchor) {
  const x = new Date(ms);
  return x.getMonth() === anchor.getMonth() && x.getFullYear() === anchor.getFullYear();
}
function monthLabel(anchor) {
  return anchor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

// ---------- Sample order seed ----------
// (2990s demo data — Carres reads real orders instead; kept for the contract.)
function seedSampleOrders() {
  const names = ['Wong Li Way','Poh Chee Meng','Tan Wei Han','Priya Naidu','Lim Wei Ling','Daniel Chong','Nurul Aina','Kavita Rao','Faizal Rahman','Chong Mei Yee','Arjun Pillai','Siti Aminah','Lee Chong Hua','Ramesh Kumar','Goh Su Lin','Hafiz Omar','Tan Mei Qi','Vivian Teoh','Azman Ismail','Rachel Ng','Dinesh Raj','Yap Kar Mun','Suria Devi','Khairul Anuar','Joanne Lim','Brandon Soo','Farah Liyana','Marcus Tan','Intan Sari','Wei Jie Ong','Aisha Karim','Pavithra M','Caleb Yong','Nadia Hassan','Bryan Cheah','Zoe Lau','Iskandar Z','Melissa Koh','Ravi Chandran','Eunice Toh','Haziq Faris','Sofia Aziz','Daniel Lim'];
  const staffNames = ['Aisyah Wong','Jia Ming Tan','Rafiq Lim','Sarah Nurul'];
  const cities = ['Kuala Lumpur','Petaling Jaya','Shah Alam','Subang Jaya','Cheras','Ampang','Puchong','Klang','Mont Kiara','Bangsar'];
  const pool = ['s-noor','s-tanah','m-cloud','m-oak','b-kayu','b-tenun','a-rug','a-coffee','m-linen','b-oasis','a-cushion','s-rumah','a-throw','a-lamp'];
  const amounts = [615,990,1490,1990,2090,2490,2990,3365,3980,4290,4485,5470,5980,7470,8970];
  const now = Date.now();
  const day = 86400000;
  const orders = [];
  const total = 43;          // 19 placed + 24 proceeding
  for (let i = 0; i < total; i++) {
    const lane = i < 19 ? 'place' : 'proceed';
    const seq = String(total - i).padStart(3, '0');
    const subtotal = amounts[(i * 7) % amounts.length];
    const staff = staffNames[i % staffNames.length];
    const name = names[i % names.length];
    const city = cities[i % cities.length];
    const placedAt = now - (((i % 24) + 1) * day);
    const p1 = pool[(i * 3) % pool.length];
    const p2 = pool[((i * 5) + 2) % pool.length];
    const qty = 1 + (i % 3);
    const cart = (i % 2 === 0) ? [{ id: p1, qty: 1 }, { id: p2, qty }] : [{ id: p1, qty }];
    const service = (i % 3 === 0) ? 250 : (i % 3 === 1 ? 150 : 0);
    const kpi = (i % 4 === 0) ? 125 : (i % 5 === 0 ? 75 : 0);
    const blankAddr = lane === 'place' && i % 2 === 0;
    let paid, delivery, flags = [];
    if (lane === 'place') {
      paid = Math.round(subtotal * [0.25, 0.5, 0.75][i % 3]);
      const tbd = i % 2 === 0;
      delivery = tbd
        ? { date: null, slot: null, tbd: true, addressLater: i % 4 === 0 }
        : { date: new Date(now + (((i % 10) + 3) * day)), slot: '12:00 – 15:00' };
      if (tbd) flags.push('Further notice for delivery date');
      if (i % 4 === 0) flags.push('Further notice for delivery address');
    } else {
      paid = (i % 3 === 0) ? subtotal : Math.round(subtotal * 0.75);
      delivery = { date: new Date(now + (((i % 12) + 2) * day)), slot: '09:00 – 12:00' };
    }
    orders.push({
      id: 'SO-2606-' + seq,
      placedAt, staff, lane,
      customer: {
        name,
        phone: '+60 1' + (i % 9) + ' ' + (100 + i) + ' ' + (1000 + ((i * 7) % 9000)),
        email: blankAddr ? '' : name.toLowerCase().replace(/[^a-z]/g, '') + '@example.com',
        address: blankAddr ? '' : (10 + i) + ', Jalan ' + ((i % 20) + 1) + '/' + ((i % 9) + 1) + ', ' + city,
        postcode: blankAddr ? '' : String(40000 + ((i * 137) % 9000)),
        city, state: 'Selangor',
      },
      cart, subtotal, paid, service, kpi, flags, delivery,
    });
  }
  return orders;
}

// ---------- PIN Gate ----------
function PinGate({ onUnlock, onCancel }) {
  const [pin, setPin] = useStateOS('');
  const [err, setErr] = useStateOS(false);
  window.useLucide([pin, err]);

  function press(k) {
    setErr(false);
    if (k === 'del') return setPin(p => p.slice(0, -1));
    if (k === 'clr') return setPin('');
    if (pin.length >= 6) return;
    setPin(p => p + k);
  }

  useEffectOS(() => {
    if (pin.length === 6) {
      if (pin === ORDER_STATUS_PIN) {
        setTimeout(() => onUnlock(), 200);
      } else {
        setErr(true);
        setTimeout(() => { setPin(''); setErr(false); }, 700);
      }
    }
  }, [pin]);

  return (
    <div className="pin-gate">
      <div className="pin-gate__card">
        <button className="icon-btn pin-gate__close" onClick={onCancel} aria-label="Close">
          <i data-lucide="x"></i>
        </button>
        <div className="pin-gate__icon">
          <i data-lucide="lock"></i>
        </div>
        <div className="pin-gate__eyebrow">Restricted view</div>
        <h2 className="pin-gate__title">Enter passcode</h2>
        <p className="pin-gate__sub">
          Order Status contains customer details and pricing. Enter the 6-digit
          showroom passcode to continue.
        </p>

        <div className={`pin-gate__dots ${err ? 'is-err' : ''}`}>
          {[0,1,2,3,4,5].map(i => (
            <span key={i} className={`pin-gate__dot ${err ? 'is-err' : pin.length > i ? 'is-on' : ''}`}></span>
          ))}
        </div>

        <div className="pin-gate__pad">
          {['1','2','3','4','5','6','7','8','9'].map(k => (
            <button key={k} className="pin-gate__key" onClick={() => press(k)}>{k}</button>
          ))}
          <button className="pin-gate__key pin-gate__key--util" onClick={() => press('clr')}>Clear</button>
          <button className="pin-gate__key" onClick={() => press('0')}>0</button>
          <button className="pin-gate__key pin-gate__key--util" onClick={() => press('del')}>
            <i data-lucide="delete"></i>
          </button>
        </div>

        <div className="pin-gate__hint">Hint · 299000</div>
      </div>
    </div>
  );
}

// ---------- Helpers ----------
function fmtDate(d) {
  if (!d) return '—';
  const x = d instanceof Date ? d : new Date(d);
  return x.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
}
function daysAgo(ms) {
  const diff = Math.floor((Date.now() - ms) / 86400000);
  if (diff <= 0) return 'today';
  return `${diff}d ago`;
}
function pieceCount(cart) { return cart.reduce((s, i) => s + i.qty, 0); }
function paidPct(o) { return Math.min(100, Math.round((o.paid / o.subtotal) * 100)); }

// Conditions to be eligible for Proceed lane
function checkConditions(o) {
  const c = o.customer || {};
  const customerInfoOk = !!(c.name && c.phone && c.email);
  const addressOk = !!(c.address && c.postcode);
  const paidOk = o.paid / o.subtotal >= 0.5;
  const dateOk = !!(o.delivery && o.delivery.date);
  return {
    customerInfoOk, addressOk, paidOk, dateOk,
    allOk: customerInfoOk && addressOk && paidOk && dateOk,
  };
}

// ---------- Order Card ----------
function OrderCard({ order, onOpen }) {
  const cond = checkConditions(order);
  const pct = paidPct(order);
  const pieces = pieceCount(order.cart);
  const firstItem = order.cart[0];
  const product = firstItem ? window.PRODUCTS.find(p => p.id === firstItem.id) : null;

  return (
    <button className={`os-card os-card--${order.lane}`} onClick={() => onOpen(order)}>
      <div className="os-card__head">
        <div>
          <div className="os-card__id">{order.id}</div>
          <div className="os-card__name">{order.customer?.name || 'Walk-in'}</div>
        </div>
        <div className="os-card__photo" style={product?.img ? { backgroundImage: `url(${product.img})` } : null}>
          {pieces > 1 && <span className="os-card__count">×{pieces}</span>}
        </div>
      </div>

      <div className="os-card__total">
        <span className="os-card__total-num"><sup>RM</sup>{rmGroup(order.subtotal)}</span>
        <span className="os-card__total-paid">{pct}% paid</span>
      </div>
      <div className="os-card__bar">
        <span className="os-card__bar-fill" style={{ width: pct + '%', background: pct >= 50 ? 'var(--c-orange)' : '#C5806B' }}></span>
      </div>

      <div className="os-card__rows">
        <div className="os-card__row">
          <i data-lucide="calendar"></i>
          <span>{order.delivery?.date ? fmtDate(order.delivery.date) : 'Date TBD'}</span>
        </div>
        <div className="os-card__row">
          <i data-lucide="map-pin"></i>
          <span>{order.customer?.address ? (order.customer.city || order.customer.address.slice(0, 28)) : 'Address TBD'}</span>
        </div>
      </div>

      {order.flags && order.flags.length > 0 && (
        <div className="os-card__flags">
          {order.flags.map((f, i) => (
            <span key={i} className="os-card__flag">
              <i data-lucide="alert-circle"></i>{f}
            </span>
          ))}
        </div>
      )}

      {order.lane === 'place' && (
        <div className={`os-card__readiness ${cond.allOk ? 'is-ready' : ''}`}>
          {cond.allOk ? (
            <><i data-lucide="check-circle-2"></i>Ready to proceed</>
          ) : (
            <><i data-lucide="circle-dashed"></i>Awaiting info</>
          )}
        </div>
      )}

      <div className="os-card__foot">
        <span>{order.staff}</span>
        <span>{daysAgo(order.placedAt)}</span>
      </div>
    </button>
  );
}

// ---------- Order Detail Drawer ----------
function OrderDetail({ order, onClose, onProceed, onUpdate }) {
  const [edited, setEdited] = useStateOS(order);
  useEffectOS(() => setEdited(order), [order?.id]);
  window.useLucide([edited, order?.id]);
  if (!order) return null;
  const cond = checkConditions(edited);
  const pct = paidPct(edited);

  function set(path, value) {
    setEdited(prev => {
      const next = { ...prev };
      const keys = path.split('.');
      let cur = next;
      for (let i = 0; i < keys.length - 1; i++) {
        cur[keys[i]] = { ...cur[keys[i]] };
        cur = cur[keys[i]];
      }
      cur[keys[keys.length - 1]] = value;
      return next;
    });
  }

  function save() {
    onUpdate(edited);
  }

  function tryProceed() {
    if (!cond.allOk) return;
    onUpdate({ ...edited, lane: 'proceed', flags: [] });
    onProceed && onProceed(edited.id);
  }

  return (
    <div className="os-detail-overlay" onClick={onClose}>
      <aside className="os-detail" onClick={e => e.stopPropagation()}>
        <div className="os-detail__head">
          <div>
            <div className="os-detail__eyebrow">Order · {edited.lane === 'place' ? 'Place' : edited.lane === 'proceed' ? 'Proceed' : 'Delivered'}</div>
            <div className="os-detail__title">{edited.id}</div>
            <div className="os-detail__sub">{edited.customer?.name} · placed {daysAgo(edited.placedAt)} by {edited.staff}</div>
          </div>
          <button className="icon-btn" onClick={onClose}><i data-lucide="x"></i></button>
        </div>

        <div className="os-detail__body">
          {/* Items */}
          <section className="os-section">
            <h4 className="os-section__title">Items <span>{pieceCount(edited.cart)} pieces</span></h4>
            <div className="os-items">
              {edited.cart.map((it, i) => {
                const p = window.PRODUCTS.find(x => x.id === it.id);
                if (!p) return null;
                return (
                  <div key={i} className="os-item">
                    <div className="os-item__photo" style={{ backgroundImage: `url(${p.img})` }}></div>
                    <div className="os-item__body">
                      <div className="os-item__name">{p.name}</div>
                      <div className="os-item__detail">{p.size} · {p.sku}</div>
                    </div>
                    <div className="os-item__qty">×{it.qty}</div>
                    <div className="os-item__price"><sup>RM</sup>{rmGroup(it.qty * window.PRICE)}</div>
                  </div>
                );
              })}
            </div>
            <div className="os-items__total">
              <span>Subtotal</span>
              <span><sup>RM</sup>{rmGroup(edited.subtotal)}</span>
            </div>
          </section>

          {/* Customer */}
          <section className="os-section">
            <h4 className="os-section__title">
              Customer
              {cond.customerInfoOk
                ? <span className="os-tick"><i data-lucide="check"></i>Complete</span>
                : <span className="os-tick is-bad"><i data-lucide="alert-triangle"></i>Incomplete</span>}
            </h4>
            <div className="os-grid">
              <label className="os-field"><span>Full name</span>
                <input value={edited.customer?.name || ''} onChange={e => set('customer.name', e.target.value)} disabled={edited.lane !== 'place'} />
              </label>
              <label className="os-field"><span>Phone</span>
                <input value={edited.customer?.phone || ''} onChange={e => set('customer.phone', e.target.value)} disabled={edited.lane !== 'place'} />
              </label>
              <label className="os-field os-field--span"><span>Email</span>
                <input value={edited.customer?.email || ''} onChange={e => set('customer.email', e.target.value)} placeholder="customer@example.com" disabled={edited.lane !== 'place'} />
              </label>
            </div>
          </section>

          {/* Delivery */}
          <section className="os-section">
            <h4 className="os-section__title">
              Delivery
              {cond.addressOk && cond.dateOk
                ? <span className="os-tick"><i data-lucide="check"></i>Set</span>
                : <span className="os-tick is-bad"><i data-lucide="alert-triangle"></i>Missing</span>}
            </h4>
            <div className="os-grid">
              <label className="os-field os-field--span"><span>Delivery address</span>
                <textarea value={edited.customer?.address || ''} onChange={e => set('customer.address', e.target.value)} placeholder="Unit, street, area" disabled={edited.lane !== 'place'} />
              </label>
              <label className="os-field"><span>Postcode</span>
                <input value={edited.customer?.postcode || ''} onChange={e => set('customer.postcode', e.target.value)} disabled={edited.lane !== 'place'} />
              </label>
              <label className="os-field"><span>City</span>
                <input value={edited.customer?.city || ''} onChange={e => set('customer.city', e.target.value)} disabled={edited.lane !== 'place'} />
              </label>
              <label className="os-field os-field--span"><span>Delivery date</span>
                <input
                  type="date"
                  value={edited.delivery?.date ? new Date(edited.delivery.date).toISOString().slice(0,10) : ''}
                  onChange={e => set('delivery', { ...edited.delivery, date: e.target.value ? new Date(e.target.value) : null, tbd: !e.target.value })}
                  disabled={edited.lane !== 'place'}
                />
              </label>
            </div>
          </section>

          {/* Payment */}
          <section className="os-section">
            <h4 className="os-section__title">
              Payment
              {cond.paidOk
                ? <span className="os-tick"><i data-lucide="check"></i>≥ 50% paid</span>
                : <span className="os-tick is-bad"><i data-lucide="alert-triangle"></i>Below 50%</span>}
            </h4>
            <div className="os-pay">
              <div className="os-pay__row">
                <span>Paid so far</span>
                <span><sup>RM</sup>{rmGroup(edited.paid)} <em>/ {rmGroup(edited.subtotal)}</em></span>
              </div>
              <div className="os-pay__bar">
                <span className="os-pay__bar-fill" style={{ width: pct + '%' }}></span>
                <span className="os-pay__bar-mark" title="50% threshold"></span>
              </div>
              <div className="os-pay__legend">
                <span>{pct}% collected</span>
                <span>Threshold · 50%</span>
              </div>
              {edited.lane === 'place' && (
                <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <label className="os-field">
                    <span>Record additional payment (RM)</span>
                    <input
                      type="number"
                      placeholder="0"
                      onChange={e => {
                        const v = parseFloat(e.target.value) || 0;
                        set('paid', Math.min(edited.subtotal, edited.paid + v));
                      }}
                    />
                  </label>
                  <label className="os-field">
                    <span>Approval code</span>
                    <input
                      type="text"
                      placeholder="e.g. AC-7821934"
                      value={edited.approvalCode || ''}
                      onChange={e => set('approvalCode', e.target.value)}
                    />
                  </label>
                  <div className="os-field">
                    <span>Payment slip</span>
                    {edited.slipPhoto ? (
                      <div className="os-slip">
                        <img src={edited.slipPhoto} alt="Payment slip" />
                        <button className="os-slip__remove" onClick={() => set('slipPhoto', null)} aria-label="Remove">
                          <i data-lucide="x"></i>
                        </button>
                        <span className="os-slip__badge">
                          <i data-lucide="check-circle-2"></i>Attached
                        </span>
                      </div>
                    ) : (
                      <div className="os-slip__actions">
                        <label className="os-slip__btn">
                          <i data-lucide="paperclip"></i>
                          <span>Attach file</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={e => {
                              const f = e.target.files?.[0];
                              if (!f) return;
                              const r = new FileReader();
                              r.onload = ev => set('slipPhoto', ev.target.result);
                              r.readAsDataURL(f);
                            }}
                          />
                        </label>
                        <label className="os-slip__btn os-slip__btn--cam">
                          <i data-lucide="camera"></i>
                          <span>Open camera</span>
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={e => {
                              const f = e.target.files?.[0];
                              if (!f) return;
                              const r = new FileReader();
                              r.onload = ev => set('slipPhoto', ev.target.result);
                              r.readAsDataURL(f);
                            }}
                          />
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Footer — Proceed action with condition checklist */}
        {edited.lane === 'place' && (
          <div className="os-detail__foot">
            <div className="os-checklist">
              <span className={`os-check ${cond.customerInfoOk ? 'is-ok' : ''}`}>
                <i data-lucide={cond.customerInfoOk ? 'check' : 'circle'}></i>Customer info
              </span>
              <span className={`os-check ${cond.addressOk ? 'is-ok' : ''}`}>
                <i data-lucide={cond.addressOk ? 'check' : 'circle'}></i>Delivery address
              </span>
              <span className={`os-check ${cond.dateOk ? 'is-ok' : ''}`}>
                <i data-lucide={cond.dateOk ? 'check' : 'circle'}></i>Delivery date
              </span>
              <span className={`os-check ${cond.paidOk ? 'is-ok' : ''}`}>
                <i data-lucide={cond.paidOk ? 'check' : 'circle'}></i>≥ 50% paid
              </span>
            </div>
            <div className="os-detail__cta">
              <button className="btn btn--ghost" onClick={save}>
                <i data-lucide="save"></i>Save changes
              </button>
              <button className="btn btn--primary" disabled={!cond.allOk} onClick={tryProceed}>
                Move to Proceed<i data-lucide="arrow-right"></i>
              </button>
            </div>
          </div>
        )}

        {edited.lane === 'proceed' && (
          <div className="os-detail__foot os-detail__foot--info">
            <i data-lucide="info"></i>
            Order is locked. Delivery is being scheduled — backend portal will pick this up on dispatch day.
          </div>
        )}

        {edited.lane === 'delivered' && (
          <div className="os-detail__foot os-detail__foot--info">
            <i data-lucide="package-check"></i>
            Delivered {fmtDate(edited.deliveredAt)}. Managed in backend portal.
          </div>
        )}
      </aside>
    </div>
  );
}

// ---------- Revenue summary card ----------
function SummaryCard({ icon, eyebrow, rev, count, muted }) {
  return (
    <div className={`os-sumcard ${muted ? 'os-sumcard--muted' : ''}`}>
      <div className="os-sumcard__eyebrow"><i data-lucide={icon}></i>{eyebrow}</div>
      <div className="os-sumcard__total"><sup>RM</sup>{rmGroup(rev.total)}</div>
      <div className="os-sumcard__orders"><i data-lucide="receipt"></i>{count} {count === 1 ? 'order' : 'orders'}</div>
      <div className="os-sumcard__rows">
        <div className="os-sumrow os-sumrow--lead">
          <span>Products sales revenue</span>
          <span className="os-sumrow__val"><sup>RM</sup>{rmGroup(rev.products)}</span>
        </div>
        <div className="os-sumrow">
          <span>Service sales revenue</span>
          <span className="os-sumrow__val"><sup>RM</sup>{rmGroup(rev.service)}</span>
        </div>
        <div className="os-sumrow">
          <span>KPI item sales revenue</span>
          <span className="os-sumrow__val"><sup>RM</sup>{rmGroup(rev.kpi)}</span>
        </div>
      </div>
    </div>
  );
}

// ---------- Order Status Screen — "My orders" sales view ----------
function OrderStatusScreen({ orders, onUpdate, onBack, onLock, staff }) {
  const [active, setActive] = useStateOS(null);
  const [query, setQuery] = useStateOS('');
  const [salesFilter, setSalesFilter] = useStateOS('all');
  const [period, setPeriod] = useStateOS('month');
  const [monthAnchor, setMonthAnchor] = useStateOS(() => new Date());
  const [peopleOpen, setPeopleOpen] = useStateOS(false);
  window.useLucide([orders.length, active?.id, query, salesFilter, period, monthAnchor, peopleOpen]);

  const inPeriod = (o) => period === 'range' ? true : sameMonth(o.placedAt, monthAnchor);

  // Orders inside the selected period — drives the showroom + personal summary.
  const periodOrders = useMemoOS(() => orders.filter(inPeriod), [orders, period, monthAnchor]);
  const myName = staff?.name || '';
  const showroom = sumRevenue(periodOrders);
  const mineOrders = periodOrders.filter(o => o.staff === myName);
  const mine = sumRevenue(mineOrders);

  // Board respects the salesperson + search filters on top of the period.
  const scoped = useMemoOS(() => {
    const q = query.toLowerCase();
    return periodOrders.filter(o => {
      if (salesFilter !== 'all' && o.staff !== salesFilter) return false;
      if (!q) return true;
      return o.id.toLowerCase().includes(q)
        || (o.customer?.name || '').toLowerCase().includes(q)
        || (o.customer?.phone || '').includes(q);
    });
  }, [periodOrders, query, salesFilter]);

  const lanes = useMemoOS(() => ({
    place:     scoped.filter(o => o.lane === 'place'),
    proceed:   scoped.filter(o => o.lane === 'proceed'),
    delivered: scoped.filter(o => o.lane === 'delivered'),
  }), [scoped]);

  useEffectOS(() => {
    if (!active) return;
    const fresh = orders.find(o => o.id === active.id);
    if (fresh && fresh !== active) setActive(fresh);
  }, [orders]);

  const monthName = monthLabel(monthAnchor);
  const stepMonth = (delta) => setMonthAnchor(a => { const x = new Date(a); x.setMonth(x.getMonth() + delta); return x; });

  return (
    <div className="os-page">
      {/* Header */}
      <div className="os-head">
        <div className="os-head__left">
          <button className="icon-btn" onClick={onBack} aria-label="Back">
            <i data-lucide="arrow-left"></i>
          </button>
          <div>
            <div className="os-head__eyebrow">Sales view · {myName || 'Staff'}</div>
            <h1 className="os-head__title">My orders</h1>
          </div>
        </div>
        <button className="os-lockbtn" onClick={onLock || onBack}>
          <i data-lucide="shield-check"></i>Lock again
        </button>
      </div>

      {/* Revenue summary */}
      <div className="os-summary">
        <SummaryCard icon="store" eyebrow={`Showroom · ${period === 'range' ? 'All time' : monthName}`} rev={showroom} count={periodOrders.length} />
        <SummaryCard icon="shield" eyebrow={`${myName || 'You'} · ${period === 'range' ? 'All time' : monthName}`} rev={mine} count={mineOrders.length} muted />
      </div>

      {/* Controls */}
      <div className="os-controls">
        <div className="os-search">
          <i data-lucide="search"></i>
          <input placeholder="Search SO no., customer or phone" value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        <div className="os-people">
          <button className="os-people__btn" onClick={() => setPeopleOpen(o => !o)}>
            <i data-lucide="users"></i>
            <span>{salesFilter === 'all' ? 'All salespeople' : salesFilter}</span>
            <i data-lucide="chevron-down"></i>
          </button>
          {peopleOpen && (
            <div className="os-people__menu">
              <button className={salesFilter === 'all' ? 'is-on' : ''} onClick={() => { setSalesFilter('all'); setPeopleOpen(false); }}>All salespeople</button>
              {window.STAFF.map(s => (
                <button key={s.id} className={salesFilter === s.name ? 'is-on' : ''} onClick={() => { setSalesFilter(s.name); setPeopleOpen(false); }}>{s.name}</button>
              ))}
            </div>
          )}
        </div>
        <div className="os-seg">
          <button className={period === 'month' ? 'is-on' : ''} onClick={() => setPeriod('month')}>Month</button>
          <button className={period === 'range' ? 'is-on' : ''} onClick={() => setPeriod('range')}>Range</button>
        </div>
        <div className="os-monthnav">
          <button onClick={() => stepMonth(-1)} aria-label="Previous month" disabled={period === 'range'}><i data-lucide="chevron-left"></i></button>
          <span>{period === 'range' ? 'All time' : monthName}</span>
          <button onClick={() => stepMonth(1)} aria-label="Next month" disabled={period === 'range'}><i data-lucide="chevron-right"></i></button>
        </div>
      </div>

      {/* Board */}
      <div className="os-board">
        {/* 01 · Order placed */}
        <div className="os-lane os-lane--place">
          <div className="os-lane__head">
            <div className="os-lane__num">01</div>
            <div>
              <div className="os-lane__title">Order placed</div>
              <div className="os-lane__sub">Just placed · may need detail tweaks</div>
            </div>
            <span className="os-lane__count">{lanes.place.length}</span>
          </div>
          <div className="os-lane__body">
            {lanes.place.length === 0 ? (
              <div className="os-empty"><i data-lucide="inbox"></i><p>Nothing here yet</p></div>
            ) : lanes.place.map(o => <OrderCard key={o.id} order={o} onOpen={setActive} />)}
          </div>
        </div>

        {/* 02 · Proceed */}
        <div className="os-lane os-lane--proceed">
          <div className="os-lane__head">
            <div className="os-lane__num">02</div>
            <div>
              <div className="os-lane__title">Proceed</div>
              <div className="os-lane__sub">Locked · coordinator handling</div>
            </div>
            <span className="os-lane__count">{lanes.proceed.length}</span>
          </div>
          <div className="os-lane__body">
            {lanes.proceed.length === 0 ? (
              <div className="os-empty"><i data-lucide="package-2"></i><p>Nothing here yet</p></div>
            ) : lanes.proceed.map(o => <OrderCard key={o.id} order={o} onOpen={setActive} />)}
          </div>
        </div>

        {/* 03 · Delivered */}
        <div className="os-lane os-lane--delivered">
          <div className="os-lane__head">
            <div className="os-lane__num">03</div>
            <div>
              <div className="os-lane__title">Delivered</div>
              <div className="os-lane__sub">Closed · signed off</div>
            </div>
            <span className="os-lane__count">{lanes.delivered.length}</span>
          </div>
          <div className="os-lane__body">
            {lanes.delivered.length === 0 ? (
              <div className="os-empty os-empty--plain"><p>Nothing here yet</p></div>
            ) : lanes.delivered.map(o => <OrderCard key={o.id} order={o} onOpen={setActive} />)}
          </div>
        </div>
      </div>

      {active && (
        <OrderDetail
          order={active}
          onClose={() => setActive(null)}
          onUpdate={(o) => onUpdate(o)}
          onProceed={() => setActive(null)}
        />
      )}
    </div>
  );
}

Object.assign(window, { OrderStatusScreen, PinGate, seedSampleOrders });
