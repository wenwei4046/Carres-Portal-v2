/**
 * 0245 — HR commission engine (2026-07-25, Loo).
 *
 * PURE month calculator for Carres' OWN sales executives (showroom-channel
 * stores only — the hr_commission_source RPC pre-filters, this module never
 * sees dealer-channel data). No base payroll, no statutory deductions.
 *
 * Two methods, resolved per outlet (commission_scheme_config; a store-level
 * default row has outletId null):
 *
 *   'percentage' — pct of PURE ITEM REVENUE. The source already excludes
 *     order_addons (delivery / dispose-* service fees) and service-category
 *     lines, so basis = Σ qty × unitPrice of what reaches this engine.
 *     Rates are effective-dated per staff (picked as-of each order's date).
 *     Manager override: a manager-tier staff earns (own pct − seller pct) on
 *     every salesperson-tier sale in their outlet; own sales pay own pct.
 *     Multiple managers in one outlet split the override equally.
 *
 *   'per_model' — per-unit RM amount per product model + per-model volume tier
 *     bonus (HIGHEST reached threshold pays, not cumulative) + overall
 *     quantity milestones (optional category filter; within one category
 *     group the highest reached threshold pays).
 *
 * Unconfigured anything resolves to RM0 — the whole feature is dormant until
 * HR authors config rows.
 */

export type CommissionMethod = "percentage" | "per_model";

export interface CommissionStaff {
  id: string;
  name: string;
  staffRole: "principal" | "manager" | "salesperson";
  active: boolean;
  dealerId: string;
  outletId: string | null;
  storeName?: string | null;
  outletName?: string | null;
}

/** One product order-line of the month, already attributed + pre-filtered. */
export interface CommissionLine {
  orderId: string;
  so: number;
  placedAt: string; // ISO timestamp
  salespersonId: string | null;
  dealerId: string;
  outletId: string | null;
  modelId: string | null;
  modelName: string | null;
  category: string | null;
  qty: number;
  unitPrice: number;
}

export interface CommissionSchemeRow {
  dealerId: string;
  outletId: string | null;
  method: CommissionMethod;
}

export interface StaffRateRow {
  salespersonId: string;
  pct: number;
  effectiveFrom: string; // ISO date
}

/** 0251 — per-model config rows carry a program: 'staff' (showroom) | 'bd'.
 *  Absent = 'staff' (pre-0251 shape). */
export type CommissionProgram = "staff" | "bd";

export interface ModelRateRow {
  modelId: string;
  perUnitAmount: number;
  program?: CommissionProgram;
}

export interface ModelTierRow {
  modelId: string;
  thresholdQty: number;
  bonusAmount: number;
  program?: CommissionProgram;
}

export interface MilestoneRow {
  id?: string;
  category: string | null; // null = all item categories count
  thresholdQty: number;
  bonusAmount: number;
  program?: CommissionProgram;
}

export const rowProgram = (r: { program?: CommissionProgram }): CommissionProgram =>
  r.program ?? "staff";

export interface CommissionConfig {
  schemes: CommissionSchemeRow[];
  rates: StaffRateRow[];
  modelRates: ModelRateRow[];
  modelTiers: ModelTierRow[];
  milestones: MilestoneRow[];
}

export interface OverrideDetail {
  fromStaffId: string;
  fromStaffName: string;
  amount: number;
}

export interface PerModelDetail {
  modelId: string;
  modelName: string;
  units: number;
  perUnitAmount: number;
  unitCommission: number;
  tierBonus: number;
  tierThreshold: number | null;
}

export interface MilestoneHit {
  category: string | null;
  units: number;
  thresholdQty: number;
  bonusAmount: number;
}

export interface StaffCommissionResult {
  staff: CommissionStaff;
  orderCount: number;
  /** percentage-method item revenue this staff personally sold */
  basis: number;
  /** rate applied to the LAST sale of the month (informational) */
  pctUsed: number | null;
  directCommission: number;
  overrideCommission: number;
  overrideDetail: OverrideDetail[];
  perModel: PerModelDetail[];
  perModelCommission: number;
  milestones: MilestoneHit[];
  milestoneCommission: number;
  total: number;
}

export interface CommissionReport {
  perStaff: StaffCommissionResult[];
  totalCommission: number;
  totalBasis: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** outlet-specific scheme row wins; store default (outletId null) is the fallback. */
export function resolveMethod(
  schemes: CommissionSchemeRow[],
  dealerId: string,
  outletId: string | null,
): CommissionMethod {
  if (outletId) {
    const outletRow = schemes.find(
      (s) => s.dealerId === dealerId && s.outletId === outletId,
    );
    if (outletRow) return outletRow.method;
  }
  const storeRow = schemes.find(
    (s) => s.dealerId === dealerId && s.outletId === null,
  );
  return storeRow?.method ?? "percentage";
}

/** Latest rate whose effectiveFrom <= asOf; no row -> 0 (dormant). */
export function resolveRate(
  rates: StaffRateRow[],
  salespersonId: string,
  asOf: string,
): number {
  const asOfDay = asOf.slice(0, 10);
  let best: StaffRateRow | null = null;
  for (const r of rates) {
    if (r.salespersonId !== salespersonId) continue;
    if (r.effectiveFrom.slice(0, 10) > asOfDay) continue;
    if (!best || r.effectiveFrom > best.effectiveFrom) best = r;
  }
  return best?.pct ?? 0;
}

export function computeCommission(
  staff: CommissionStaff[],
  lines: CommissionLine[],
  rawConfig: CommissionConfig,
): CommissionReport {
  // 0251 — the config tables now serve both programs; staff math only ever
  // sees the 'staff' rows (absent program = pre-0251 row = staff).
  const config: CommissionConfig = {
    ...rawConfig,
    modelRates: rawConfig.modelRates.filter((r) => rowProgram(r) === "staff"),
    modelTiers: rawConfig.modelTiers.filter((r) => rowProgram(r) === "staff"),
    milestones: rawConfig.milestones.filter((r) => rowProgram(r) === "staff"),
  };
  const staffById = new Map(staff.map((s) => [s.id, s]));

  interface Acc {
    staff: CommissionStaff;
    orders: Set<string>;
    basis: number;
    pctUsed: number | null;
    lastSaleAt: string | null;
    direct: number;
    override: number;
    overrideDetail: Map<string, OverrideDetail>;
    modelUnits: Map<string, { modelName: string; units: number }>;
    milestoneUnitsAll: number;
    milestoneUnitsByCategory: Map<string, number>;
  }
  const acc = new Map<string, Acc>();
  const accFor = (s: CommissionStaff): Acc => {
    let a = acc.get(s.id);
    if (!a) {
      a = {
        staff: s,
        orders: new Set(),
        basis: 0,
        pctUsed: null,
        lastSaleAt: null,
        direct: 0,
        override: 0,
        overrideDetail: new Map(),
        modelUnits: new Map(),
        milestoneUnitsAll: 0,
        milestoneUnitsByCategory: new Map(),
      };
      acc.set(s.id, a);
    }
    return a;
  };
  // every showroom staff shows in the report, even at RM0
  for (const s of staff) accFor(s);

  for (const line of lines) {
    if (!line.salespersonId) continue; // unattributed — surfaced separately
    const seller = staffById.get(line.salespersonId);
    if (!seller) continue; // attributed to a non-showroom / unknown staff
    const a = accFor(seller);
    a.orders.add(line.orderId);

    const method = resolveMethod(
      config.schemes,
      line.dealerId,
      line.outletId ?? seller.outletId,
    );
    const amount = line.qty * line.unitPrice;

    if (method === "percentage") {
      const pct = resolveRate(config.rates, seller.id, line.placedAt);
      a.basis += amount;
      a.direct += (amount * pct) / 100;
      if (!a.lastSaleAt || line.placedAt >= a.lastSaleAt) {
        a.lastSaleAt = line.placedAt;
        a.pctUsed = pct;
      }

      // manager override — only over salesperson-tier sales, same outlet
      if (seller.staffRole === "salesperson") {
        const managers = staff.filter(
          (m) =>
            m.staffRole === "manager" &&
            m.active &&
            m.dealerId === seller.dealerId &&
            (m.outletId ?? null) === (line.outletId ?? seller.outletId ?? null),
        );
        if (managers.length > 0) {
          for (const mgr of managers) {
            const mgrPct = resolveRate(config.rates, mgr.id, line.placedAt);
            const diff = mgrPct - pct;
            if (diff <= 0) continue;
            const share = (amount * diff) / 100 / managers.length;
            const ma = accFor(mgr);
            ma.override += share;
            const d = ma.overrideDetail.get(seller.id);
            if (d) d.amount += share;
            else
              ma.overrideDetail.set(seller.id, {
                fromStaffId: seller.id,
                fromStaffName: seller.name,
                amount: share,
              });
          }
        }
      }
    } else {
      // per_model — needs a resolvable model
      if (line.modelId) {
        const mu = a.modelUnits.get(line.modelId);
        if (mu) mu.units += line.qty;
        else
          a.modelUnits.set(line.modelId, {
            modelName: line.modelName ?? line.modelId,
            units: line.qty,
          });
      }
      a.milestoneUnitsAll += line.qty;
      if (line.category) {
        a.milestoneUnitsByCategory.set(
          line.category,
          (a.milestoneUnitsByCategory.get(line.category) ?? 0) + line.qty,
        );
      }
    }
  }

  const modelRateById = new Map(
    config.modelRates.map((r) => [r.modelId, r.perUnitAmount]),
  );

  const perStaff: StaffCommissionResult[] = [];
  for (const a of acc.values()) {
    const perModel: PerModelDetail[] = [];
    let perModelCommission = 0;
    for (const [modelId, mu] of a.modelUnits) {
      const perUnit = modelRateById.get(modelId) ?? 0;
      const unitCommission = mu.units * perUnit;
      // highest reached tier pays
      let tierBonus = 0;
      let tierThreshold: number | null = null;
      for (const t of config.modelTiers) {
        if (t.modelId !== modelId || t.thresholdQty > mu.units) continue;
        if (tierThreshold === null || t.thresholdQty > tierThreshold) {
          tierThreshold = t.thresholdQty;
          tierBonus = t.bonusAmount;
        }
      }
      perModel.push({
        modelId,
        modelName: mu.modelName,
        units: mu.units,
        perUnitAmount: perUnit,
        unitCommission: round2(unitCommission),
        tierBonus: round2(tierBonus),
        tierThreshold,
      });
      perModelCommission += unitCommission + tierBonus;
    }
    perModel.sort((x, y) => y.unitCommission - x.unitCommission);

    // milestones: group by category key; highest reached per group pays
    const milestones: MilestoneHit[] = [];
    let milestoneCommission = 0;
    const groups = new Map<string, MilestoneRow[]>();
    for (const m of config.milestones) {
      const key = m.category ?? "";
      const g = groups.get(key);
      if (g) g.push(m);
      else groups.set(key, [m]);
    }
    for (const [key, rows] of groups) {
      const units =
        key === ""
          ? a.milestoneUnitsAll
          : (a.milestoneUnitsByCategory.get(key) ?? 0);
      let best: MilestoneRow | null = null;
      for (const m of rows) {
        if (m.thresholdQty > units) continue;
        if (!best || m.thresholdQty > best.thresholdQty) best = m;
      }
      if (best) {
        milestones.push({
          category: best.category,
          units,
          thresholdQty: best.thresholdQty,
          bonusAmount: round2(best.bonusAmount),
        });
        milestoneCommission += best.bonusAmount;
      }
    }

    const direct = round2(a.direct);
    const override = round2(a.override);
    const perModelTotal = round2(perModelCommission);
    const milestoneTotal = round2(milestoneCommission);
    perStaff.push({
      staff: a.staff,
      orderCount: a.orders.size,
      basis: round2(a.basis),
      pctUsed: a.pctUsed,
      directCommission: direct,
      overrideCommission: override,
      overrideDetail: [...a.overrideDetail.values()].map((d) => ({
        ...d,
        amount: round2(d.amount),
      })),
      perModel,
      perModelCommission: perModelTotal,
      milestones,
      milestoneCommission: milestoneTotal,
      total: round2(direct + override + perModelTotal + milestoneTotal),
    });
  }

  perStaff.sort((x, y) => y.total - x.total || x.staff.name.localeCompare(y.staff.name));

  return {
    perStaff,
    totalCommission: round2(perStaff.reduce((s, r) => s + r.total, 0)),
    totalBasis: round2(perStaff.reduce((s, r) => s + r.basis, 0)),
  };
}

// ── 0250 — BD commission: paid by what their dealers sell ────────────────────
// A BD (app_users role='bd') owns dealer-channel stores via
// dealers.bd_owner_user_id and earns an effective-dated pct of each owned
// store's monthly pure item revenue. The dealer is the earning unit — no
// per-salesperson attribution involved. Unassigned dealers earn nobody
// anything (surfaced by the report so HR can see the gap).

/** 0251 — two BD positions: the CBO earns the rate difference as override on
 *  BD Executives' dealer sales (mirror of the Sales Manager rule). */
export type BdPosition = "executive" | "cbo";

export interface BdUser {
  id: string;
  name: string;
  email: string;
  position?: BdPosition; // absent = executive
}

/** One dealer-channel order LINE of the month (BD item-KPI method). */
export interface BdDealerLine {
  orderId: string;
  so: number;
  placedAt: string;
  dealerId: string;
  modelId: string | null;
  modelName: string | null;
  category: string | null;
  qty: number;
  unitPrice: number;
}

export interface BdDealer {
  id: string;
  name: string;
  status?: string;
  bdOwnerUserId: string | null;
}

/** One dealer-channel order of the month, pre-aggregated to pure item revenue. */
export interface DealerOrderAgg {
  orderId: string;
  so: number;
  placedAt: string;
  dealerId: string;
  amount: number;
}

export interface BdRateRow {
  userId: string;
  pct: number;
  effectiveFrom: string;
}

export interface BdPortfolioRow {
  dealerId: string;
  dealerName: string;
  orderCount: number;
  amount: number;
  commission: number;
}

export interface BdCommissionResult {
  user: BdUser;
  position: BdPosition;
  dealerCount: number;
  orderCount: number;
  basis: number;
  /** rate applied to the latest sale of the month (informational) */
  pctUsed: number | null;
  /** percentage method: pct of own dealers' sales */
  directCommission: number;
  /** percentage method: CBO's rate-difference share of executives' dealer sales */
  overrideCommission: number;
  overrideDetail: OverrideDetail[];
  /** per_model (item KPI) method */
  perModel: PerModelDetail[];
  perModelCommission: number;
  milestones: MilestoneHit[];
  milestoneCommission: number;
  /** grand total across whichever method applies */
  commission: number;
  portfolio: BdPortfolioRow[];
}

export interface BdCommissionReport {
  method: CommissionMethod;
  perBd: BdCommissionResult[];
  unassignedDealers: BdDealer[];
  totalCommission: number;
  totalBasis: number;
}

export interface BdCommissionInput {
  users: BdUser[];
  dealers: BdDealer[];
  /** order-level aggregates (percentage method basis) */
  orders: DealerOrderAgg[];
  rates: BdRateRow[];
  /** 0251 — the global BD method switch (absent = percentage) */
  method?: CommissionMethod;
  /** per-line rows (per_model method); required only when method = per_model */
  dealerLines?: BdDealerLine[];
  /** per-model config — pass the FULL rows; only program='bd' rows are used */
  modelRates?: ModelRateRow[];
  modelTiers?: ModelTierRow[];
  milestones?: MilestoneRow[];
}

function pickBdRate(rates: BdRateRow[], userId: string, asOf: string): number {
  const asOfDay = asOf.slice(0, 10);
  let best: BdRateRow | null = null;
  for (const r of rates) {
    if (r.userId !== userId) continue;
    if (r.effectiveFrom.slice(0, 10) > asOfDay) continue;
    if (!best || r.effectiveFrom > best.effectiveFrom) best = r;
  }
  return best?.pct ?? 0;
}

export function computeBdCommission(input: BdCommissionInput): BdCommissionReport {
  const { users, dealers, orders, rates } = input;
  const method: CommissionMethod = input.method ?? "percentage";
  const r2 = (n: number): number => Math.round(n * 100) / 100;
  const dealerById = new Map(dealers.map((d) => [d.id, d]));
  const posOf = (u: BdUser): BdPosition => u.position ?? "executive";
  const cbos = users.filter((u) => posOf(u) === "cbo");

  const bdModelRates = (input.modelRates ?? []).filter((r) => rowProgram(r) === "bd");
  const bdModelTiers = (input.modelTiers ?? []).filter((r) => rowProgram(r) === "bd");
  const bdMilestones = (input.milestones ?? []).filter((r) => rowProgram(r) === "bd");
  const perUnitByModel = new Map(bdModelRates.map((r) => [r.modelId, r.perUnitAmount]));

  interface Acc {
    user: BdUser;
    orders: Set<string>;
    basis: number;
    direct: number;
    override: number;
    overrideDetail: Map<string, OverrideDetail>;
    pctUsed: number | null;
    lastSaleAt: string | null;
    portfolio: Map<string, BdPortfolioRow>;
    modelUnits: Map<string, { modelName: string; units: number }>;
    unitsAll: number;
    unitsByCategory: Map<string, number>;
  }
  const acc = new Map<string, Acc>();
  for (const u of users) {
    acc.set(u.id, {
      user: u,
      orders: new Set(),
      basis: 0,
      direct: 0,
      override: 0,
      overrideDetail: new Map(),
      pctUsed: null,
      lastSaleAt: null,
      portfolio: new Map(),
      modelUnits: new Map(),
      unitsAll: 0,
      unitsByCategory: new Map(),
    });
  }

  const touchPortfolio = (
    a: Acc,
    dealer: BdDealer,
    orderId: string,
    amount: number,
    commission: number,
  ) => {
    a.orders.add(orderId);
    a.basis += amount;
    const row = a.portfolio.get(dealer.id);
    if (row) {
      row.orderCount += 1;
      row.amount += amount;
      row.commission += commission;
    } else {
      a.portfolio.set(dealer.id, {
        dealerId: dealer.id,
        dealerName: dealer.name,
        orderCount: 1,
        amount,
        commission,
      });
    }
  };

  if (method === "percentage") {
    for (const o of orders) {
      const dealer = dealerById.get(o.dealerId);
      const owner = dealer?.bdOwnerUserId ? acc.get(dealer.bdOwnerUserId) : null;
      if (!dealer || !owner) continue;
      const pct = pickBdRate(rates, owner.user.id, o.placedAt);
      const commission = (o.amount * pct) / 100;
      owner.direct += commission;
      if (!owner.lastSaleAt || o.placedAt >= owner.lastSaleAt) {
        owner.lastSaleAt = o.placedAt;
        owner.pctUsed = pct;
      }
      touchPortfolio(owner, dealer, o.orderId, o.amount, commission);

      // CBO override — the rate DIFFERENCE on an EXECUTIVE's dealer sales,
      // split equally among CBOs (mirror of the Sales Manager rule).
      if (posOf(owner.user) === "executive" && cbos.length > 0) {
        for (const cbo of cbos) {
          const cboPct = pickBdRate(rates, cbo.id, o.placedAt);
          const diff = cboPct - pct;
          if (diff <= 0) continue;
          const share = (o.amount * diff) / 100 / cbos.length;
          const ca = acc.get(cbo.id);
          if (!ca) continue;
          ca.override += share;
          const d = ca.overrideDetail.get(owner.user.id);
          if (d) d.amount += share;
          else
            ca.overrideDetail.set(owner.user.id, {
              fromStaffId: owner.user.id,
              fromStaffName: owner.user.name,
              amount: share,
            });
        }
      }
    }
  } else {
    for (const line of input.dealerLines ?? []) {
      const dealer = dealerById.get(line.dealerId);
      const owner = dealer?.bdOwnerUserId ? acc.get(dealer.bdOwnerUserId) : null;
      if (!dealer || !owner) continue;
      const amount = line.qty * line.unitPrice;
      touchPortfolio(owner, dealer, line.orderId, amount, 0);
      if (line.modelId) {
        const mu = owner.modelUnits.get(line.modelId);
        if (mu) mu.units += line.qty;
        else
          owner.modelUnits.set(line.modelId, {
            modelName: line.modelName ?? line.modelId,
            units: line.qty,
          });
      }
      owner.unitsAll += line.qty;
      if (line.category) {
        owner.unitsByCategory.set(
          line.category,
          (owner.unitsByCategory.get(line.category) ?? 0) + line.qty,
        );
      }
    }
  }

  const perBd: BdCommissionResult[] = [...acc.values()].map((a) => {
    const perModel: PerModelDetail[] = [];
    let perModelCommission = 0;
    for (const [modelId, mu] of a.modelUnits) {
      const perUnit = perUnitByModel.get(modelId) ?? 0;
      const unitCommission = mu.units * perUnit;
      let tierBonus = 0;
      let tierThreshold: number | null = null;
      for (const t of bdModelTiers) {
        if (t.modelId !== modelId || t.thresholdQty > mu.units) continue;
        if (tierThreshold === null || t.thresholdQty > tierThreshold) {
          tierThreshold = t.thresholdQty;
          tierBonus = t.bonusAmount;
        }
      }
      perModel.push({
        modelId,
        modelName: mu.modelName,
        units: mu.units,
        perUnitAmount: perUnit,
        unitCommission: r2(unitCommission),
        tierBonus: r2(tierBonus),
        tierThreshold,
      });
      perModelCommission += unitCommission + tierBonus;
    }
    perModel.sort((x, y) => y.unitCommission - x.unitCommission);

    const milestones: MilestoneHit[] = [];
    let milestoneCommission = 0;
    const groups = new Map<string, MilestoneRow[]>();
    for (const m of bdMilestones) {
      const key = m.category ?? "";
      const g = groups.get(key);
      if (g) g.push(m);
      else groups.set(key, [m]);
    }
    for (const [key, rows] of groups) {
      const units = key === "" ? a.unitsAll : (a.unitsByCategory.get(key) ?? 0);
      let best: MilestoneRow | null = null;
      for (const m of rows) {
        if (m.thresholdQty > units) continue;
        if (!best || m.thresholdQty > best.thresholdQty) best = m;
      }
      if (best) {
        milestones.push({
          category: best.category,
          units,
          thresholdQty: best.thresholdQty,
          bonusAmount: r2(best.bonusAmount),
        });
        milestoneCommission += best.bonusAmount;
      }
    }

    const direct = r2(a.direct);
    const override = r2(a.override);
    const perModelTotal = r2(perModelCommission);
    const milestoneTotal = r2(milestoneCommission);
    return {
      user: a.user,
      position: posOf(a.user),
      dealerCount: dealers.filter((d) => d.bdOwnerUserId === a.user.id).length,
      orderCount: a.orders.size,
      basis: r2(a.basis),
      pctUsed: a.pctUsed,
      directCommission: direct,
      overrideCommission: override,
      overrideDetail: [...a.overrideDetail.values()].map((d) => ({
        ...d,
        amount: r2(d.amount),
      })),
      perModel,
      perModelCommission: perModelTotal,
      milestones,
      milestoneCommission: milestoneTotal,
      commission: r2(direct + override + perModelTotal + milestoneTotal),
      portfolio: [...a.portfolio.values()]
        .map((p) => ({ ...p, amount: r2(p.amount), commission: r2(p.commission) }))
        .sort((x, y) => y.amount - x.amount),
    };
  });
  perBd.sort(
    (x, y) => y.commission - x.commission || x.user.name.localeCompare(y.user.name),
  );

  return {
    method,
    perBd,
    unassignedDealers: dealers.filter((d) => !d.bdOwnerUserId),
    totalCommission: r2(perBd.reduce((s, b) => s + b.commission, 0)),
    totalBasis: r2(perBd.reduce((s, b) => s + b.basis, 0)),
  };
}
