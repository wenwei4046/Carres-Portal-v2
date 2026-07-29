# Subscription mattress module — MUST-SHIP proposal (LOCKED 2026-07-22 · Sept 2026 launch)

> Spec for the Subscription mattress module. **Deadline: September 2026.** Loo/Jess commitment to new mattress supplier / investor: hit 1000 orders/month. This module = replacement for Nice Future (mattress). Locked with Jess (COO) 2026-07-22.
>
> **This is P1 must-ship**, promoted from the earlier "P6 future" bucket the moment Jess named the Sept 2026 deadline.

---

## How to resume (any machine, any new chat)

Paste this into a fresh chat:

> Continue Subscription mattress module build. Read in order:
> 1. `docs/carres-portal-system-architecture.md` — master doc (business locks §3, especially §3.1 Nice Future stopping and §3.9 PayHold gate)
> 2. `docs/subscription-mattress-proposal.md` — this file, the SPEC
> 3. `docs/COPY-STANDARD.md` — microcopy rules
> 4. `docs/UI-KIT.md` §8.3 — Module-tab law
> 5. `docs/PURCHASING-WORKING-FLOW.md` — Purchasing reference *(corrected 2026-07-29: `purchase-cockpit-handoff.md` deleted 2026-07-27)*
> 6. `docs/orders-panel-concept-proposal.md` — Orders integration (subscription SO type lives there)
> 7. `docs/payment-module-proposal.md` — billing + collections cross-module
> 8. `docs/delivery-module-proposal.md` — first-mattress delivery cross-module
> 9. `docs/right-rail-widgets-proposal.md` — Calendar widget shows subscription schedule
>
> Live-poke `https://erp.carresofficial.com/operation?tab=purchase` for visual language.
>
> Start with **Phase 0 · confirm supplier contract signed + Credit Bureau resumed + cleaning partner appointed**. Do NOT start Phase 1 code until all 3 external partners are locked.

---

## Contract

- **NEW module** — no existing "Subscriptions" today. Build in parallel with current business.
- **Feature flag** `env.SUBSCRIPTIONS_ENABLED` — default OFF, flip ON at Sept 1 launch. Zero disruption to current sofa/bedframe/mattress-one-off flows.
- **Additive migrations only** — new tables (0256-0261), zero touch to existing `orders` / `stock_balances` schema (except one nullable `subscription_id` FK column).
- Zero danger-zone breakage.
- One PR per phase.
- Deploy only from `main`.

---

## LOCKED business decisions (Loo/Jess · owner locks, not negotiable)

| # | Decision | Locked by / when |
|---|---|---|
| 1 | **5 mattress models** for subscription (M1-M5, tier pricing) | Jess 2026-07-22 |
| 2 | **2 term options: 5-year OR 7-year**. No other terms. | Jess 2026-07-22 |
| 3 | **Monthly fee starts from RM 49 for lowest model (M1)** (not final; per-model pricing TBD, but M1 = RM 49/mo) | Jess 2026-07-22 |
| 4 | **NO DEPOSIT** — customers pay only monthly. Higher risk to Carres = why automated dunning + Credit Bureau critical. | Jess 2026-07-22 |
| 5 | **NO MATTRESS CHANGE** during term — customer keeps ONE mattress for full 5 or 7 years | Jess 2026-07-22 |
| 6 | **NO TRIAL PERIOD** — no free-return-in-N-days. | Jess 2026-07-22 |
| 7 | **3 cleanings PER YEAR** included in monthly fee. 5-yr = 15 cleanings · 7-yr = 21 cleanings. Third-party cleaning partner (TBD company). | Jess 2026-07-22 |
| 8 | **Automated dunning** with escalation to **Credit Bureau Malaysia Sdn. Bhd.** (package resumable, Carres paid before, stopped 1 year, resuming for launch) | Jess 2026-07-22 |
| 9 | **Post-purchase management independent from supplier** — once mattress bought from new supplier, Carres owns full customer relationship (support, cleaning, collections, service) | Jess 2026-07-22 |
| 10 | **New investor / mattress supplier TBD** — details not yet formalized. Design flexibly so we don't lock into specific partner terms until contract signed. | Jess 2026-07-22 |
| 11 | **1000 orders/month scale target** — commitment to new investor. Design for scale from Day 1. | Jess 2026-07-22 |
| 12 | **Sept 2026 launch** — hard deadline. If any component slips, Sept 1 launches WITHOUT that component; add later. Never delay launch. | Jess 2026-07-22 |
| 13 | **Runs in parallel with current business** — sofa/bedframe/one-off mattress flows unchanged. Subscription is additive. | Jess 2026-07-22 |

---

## LOCKED design decisions

**HARD:**

| # | Decision | Why |
|---|---|---|
| 14 | Module name = **Subscriptions** (plural, plain English) | International standard (Netflix, Grover, Rent the Runway) |
| 15 | 4 tabs = **① Active plans · ② Deliveries · ③ Services · ④ Collections** | Each = one distinct workflow · matches ops daily rhythm |
| 16 | Signup at POS = same Orders panel, new SO type "subscription" | Salesperson uses ONE flow, doesn't switch tools |
| 17 | Feature flag `env.SUBSCRIPTIONS_ENABLED` gates everything | Ship-and-hide until Sept 1 · zero risk to current business |
| 18 | Subscription SO carries `subscription_id` FK to `subscriptions` table | Loose coupling · easy to hide when flag off |
| 19 | Cross-module integration via events not direct FK explosion | Scale to 1000/mo without join hell |
| 20 | 3-pane inline split (facet 200 · list 420 · detail fills) | Consistency with other modules |
| 21 | Row action-line + inline What-to-do per stage | Zero-experience friendly |
| 22 | Collections dunning ladder (Day 0/3/7/14/30/60) — LOCKED cadence | International standard, tuned for RM 49-200/mo tier |

**NEGOTIABLE:**

| # | Decision | Alternative |
|---|---|---|
| 23 | Cleaning schedule = evenly spread (every 4 months) | Could be seasonal-clustered |
| 24 | Delivery day = weekday only | Could allow Saturday for 3PL premium |
| 25 | Facet by model / by term / by status | Could add by region, by salesperson |
| 26 | Monthly billing runs at 00:00 MYT (cron) | Could be per-subscriber anchor day |

---

## Executive rating trajectory + timeline

**Deadline-driven · not comfort-driven.**

| Week | Deliverable | Rating after |
|---|---|---|
| Now (Jul 22-23) | Proposal doc + Loo/Jess sign-off | 0/10 (not built) |
| **Week 1 (Jul 24-31)** | Confirm 3 external partners (new supplier · Credit Bureau resumed · cleaning company). External blockers = biggest risk to Sept launch. | 0/10 |
| **Week 2 (Aug 1-7)** | Migrations 0256-0261 · types in `packages/shared` · basic RPCs | 3/10 |
| **Week 3 (Aug 8-14)** | Subscriptions module UI skeleton (4 tabs) · signup flow at Orders POS · feature flag wired | 5/10 |
| **Week 4 (Aug 15-21)** | Billing engine (cron) · delivery sub-SO auto-gen · services scheduling (partner API TBD, fallback = manual WhatsApp) | 7/10 |
| **Week 5 (Aug 22-28)** | Collections dunning (SMS/WA auto, task auto-assign) · Credit Bureau escalation (basic — log + manual push initially) | 8/10 |
| **Week 6 (Aug 29 - Sep 1)** | E2E test with fake subscriber · fix critical bugs · pre-launch review | 8.5/10 |
| **Sept 1** | Flip feature flag ON · onboard first 5-10 real subscribers · monitor daily | Live |
| Sept-Oct | Live-tune based on real subscriber feedback | 9/10 |
| Dec 2026 | 300 active subs · 900 cleanings/yr load · dunning at scale | 10/10 |

**If external partner slips (supplier / Credit Bureau / cleaning):** Sept 1 still launches but that component starts manual. Automated part goes live within 30 days after partner ready.

---

## Full ASCII layouts

### Tab 1 · Active plans

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Subscriptions │ [① Active 300] [② Deliveries 42] [③ Services 75] [④ Collect 8]│
├────────────────────────────────────────────────────────────────────────────┤
│ FACET       │ MIDDLE LIST                    │ DETAIL                       │
│ (200)       │ (420)                           │ (fills)                      │
│             │                                 │                              │
│ BY MODEL    │ 📋 SUB-1042 · ella · 5-yr M1   │ SUB-1042 · ella              │
│  M1  85     │ Started 15 May 26 · month 3/60 │ 5-year Model M1 · RM 49/mo  │
│  M2  62     │ RM 49 · next billed 15 Aug     │ ─────────────────            │
│  M3  55     │ Next cleaning · Sep (year 1 #1)│ TIMELINE                     │
│  M4  48     │                                 │  · 57 more monthly bills     │
│  M5  50     │ 📋 SUB-1018 · dato · 7-yr M3    │  · 15 cleanings remaining    │
│             │ Started 20 Jun 26 · month 2/84 │  · 0 mattress changes        │
│ BY TERM     │ 🔴 14d payment overdue          │  · Term ends: 15 May 2031    │
│  5-yr 190   │ In dunning · Day 14 task Ching │                              │
│  7-yr 110   │                                 │ CUSTOMER                     │
│             │                                 │ ella · KL Ampang             │
│ BY STATUS   │                                 │ Phone: 012-3456              │
│  Active 285 │                                 │ Bank: Maybank 5-14567-...    │
│  Paused 5   │                                 │                              │
│  Late 8     │                                 │ WHAT TO DO (③ Services next) │
│  Ended 2    │                                 │ 1. Schedule cleaning #1 Sep  │
│             │                                 │ 2. Confirm date with ella    │
│             │                                 │ 3. Notify ABC Cleaning       │
│             │                                 │ 4. Verify done + photo       │
│             │                                 │                              │
│             │                                 │ [ Pause ] [ Cancel ] [Notes] │
└─────────────┴─────────────────────────────────┴──────────────────────────────┘
```

### Tab 2 · Deliveries (initial mattress delivery only · no changes)

```
[ ① Pending 5 ] [ ② In transit 3 ] [ ③ Delivered 292 ]
─────────────────────────────────────────────────────
🚚 SUB-1055 · new customer · M2 · scheduled 25 Jul → Klg
   Assign NETS for Mon 27 Jul delivery.
   [ Link to Delivery module → assign ]

🚚 SUB-1042 · ella · M1 · delivered 18 May
   ✓ POD uploaded 18 May 15:30
```

Since **no mattress changes** during term (LOCKED #5), this tab is small — only initial deliveries + occasional replacements for defect claims (via Service Cases).

### Tab 3 · Services (yearly cleanings · partner coordination)

```
[ Due this week 3 ] [ Due next month 8 ] [ Overdue 1 ] [ Completed year-to-date 42 ]
─────────────────────────────────────────────────────
🧹 SUB-1042 · ella · Cleaning year 1 · #1 of 3
   Scheduled Wed 30 Jul · Partner: ABC Cleaning
   Assign partner + book slot.
   [ WhatsApp partner ] [ Confirm booked ]

🧹 SUB-1018 · dato · Cleaning year 1 · #2 of 3
   Overdue 5 days ⚠  Need to reschedule.
   [ Book with partner ▼ ]

WHAT TO DO (③ Services)
1. WhatsApp partner (ABC Cleaning · 012-3456)
2. Confirm customer available
3. Track completion (partner uploads photo)
4. Mark done here
```

**Cleaning schedule algorithm:** for a 5-year plan starting `start_date`, generate 15 events (3/year × 5 years) evenly spread every ~4 months. For 7-year, 21 events every ~4 months.

### Tab 4 · Collections (automated dunning · Credit Bureau integration)

```
⚠ 8 subscribers overdue
─────────────────────────────────────────────────────
💰 SUB-1042 · ella · RM 49 · due 15 Jul · 7 days late
   Day 3: SMS reminder sent (auto) · No reply
   Day 7: WhatsApp + SMS sent (auto) · No reply
   → Next auto-action: Day 14 → phone call task → Ching
   [ Add note ] [ Mark paid ]

💰 SUB-1018 · dato · RM 128 · due 8 Jul · 14 days late
   Day 14: Phone task NOT completed by Ching
   → Next auto-action: Day 30 → ESCALATE to Credit Bureau Malaysia
   [ Assign Ching now ] [ Escalate NOW manual ]

💰 SUB-0995 · Ali · RM 175 · 32 days late · 🚨 ESCALATED
   Escalated to Credit Bureau Malaysia 20 Jul · Ref CB-2026-047
   Awaiting Bureau response · check-back 3 Aug
   [ View CB case ] [ Legal (Jess only) ]

WHAT TO DO (④ Collections)
1. Review overdue list morning
2. Follow up phone tasks assigned to you
3. If Day 30 reached → auto-escalates (no manual)
4. Verify Credit Bureau case status weekly
```

**Dunning ladder (LOCKED cadence):**

| Day | Action | Auto? | Actor |
|---|---|---|---|
| 0 | Bill due · debit attempted (if bank on file) | Auto | system |
| 3 | SMS reminder | Auto | system |
| 7 | WhatsApp + SMS (2nd) | Auto | system |
| 14 | Phone call task assigned to ops (Ching-tier) | Auto assign · Manual do | staff |
| 21 | Warning WhatsApp: "Will escalate to Credit Bureau" | Auto | system |
| 30 | **Automatic escalation to Credit Bureau Malaysia** | Auto | system |
| 60 | Legal proceedings option | Manual · Jess override only | Jess |

---

## Signup flow at Orders POS (extends existing OrdersControl)

```
Salesperson at POS:
   [ New order ]
      ↓
   Order type:
     ○ One-off (sofa · bedframe · one-off mattress)
     ● SUBSCRIPTION 🔁
      ↓
   Model:  [ M1 (RM 49/mo) ▼ ] · [ M2 (RM X) ] · [ M3 (RM X) ] · [ M4 (RM X) ] · [ M5 (RM X) ]
   Term:   ● 5 years  ○ 7 years
   Customer info: name · phone · address · bank account (for auto-debit)
      ↓
   Preview:
     RM 49/month × 60 months = RM 2,940 total revenue
     15 cleanings included
     Initial mattress delivery: within 14 days
      ↓
   [ Create subscription ]
      ↓
   BEHIND THE SCENES (single transaction):
     1. Insert row into `subscriptions`
     2. Insert 1 row into `orders` (parent SO · type='subscription' · subscription_id=X)
     3. Insert 1 row into `orders` (delivery sub-SO · type='sub_delivery' · parent_id=X)
     4. Insert 60 or 84 rows into `subscription_billings`
     5. Insert 15 or 21 rows into `subscription_services`
     6. Draw 1 unit from `subscription_supply_plan` (framework contract with new supplier)
      ↓
   Screen shows: SUB-1055 created. First delivery scheduled Mon 27 Jul.
```

---

## Data model (LOCKED · additive migrations)

**Migration 0256 · subscriptions**

```sql
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id),
  plan_years int not null check (plan_years in (5, 7)),
  model_sku text not null references product_skus(sku),      -- one of M1..M5
  monthly_fee numeric(10,2) not null,                          -- RM 49 for M1, higher for M2-M5 TBD
  start_date date not null,
  end_date date not null generated always as (start_date + (plan_years || ' years')::interval) stored,
  status text not null default 'active' check (status in ('active', 'paused', 'cancelled', 'ended')),
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz default now(),
  created_by uuid references salespersons(id)
);

create index on subscriptions (status, start_date);
create index on subscriptions (customer_id);
```

**Migration 0257 · subscription_billings (monthly bills)**

```sql
create table subscription_billings (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid references subscriptions(id) on delete cascade,
  billing_month date not null,       -- first of month
  amount_due numeric(10,2) not null,
  paid_at timestamptz,
  paid_amount numeric(10,2),
  payment_method text check (payment_method in ('bank_transfer', 'auto_debit', 'cash', 'other')),
  reference_no text,
  status text not null default 'due' check (status in ('due', 'paid', 'overdue', 'escalated_bureau', 'legal', 'written_off')),
  dunning_current_day int default 0,
  created_at timestamptz default now(),
  unique(subscription_id, billing_month)
);

create index on subscription_billings (status, billing_month);
```

**Migration 0258 · subscription_services (yearly cleanings)**

```sql
create table subscription_services (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid references subscriptions(id) on delete cascade,
  service_type text not null default 'cleaning' check (service_type in ('cleaning', 'repair', 'other')),
  service_year int not null,             -- which year of term (1..5 or 1..7)
  service_number int not null,           -- which of the 3 in that year (1, 2, 3)
  scheduled_date date,
  partner_id uuid references service_partners(id),
  completed_at timestamptz,
  photo_url text,
  notes text,
  status text not null default 'pending' check (status in ('pending', 'scheduled', 'in_progress', 'completed', 'skipped'))
);

create index on subscription_services (scheduled_date, status);
```

**Migration 0259 · subscription_supply_plan (framework contract with new supplier)**

```sql
create table subscription_supply_plan (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references suppliers(id),
  model_sku text references product_skus(sku),
  total_units int not null,                     -- e.g. 500 units committed
  drawn_units int not null default 0,
  start_date date not null,
  end_date date not null,
  unit_cost numeric(10,2),
  contract_ref text,
  created_at timestamptz default now()
);

create index on subscription_supply_plan (model_sku, start_date);
```

**Migration 0260 · service_partners + collections_events**

```sql
create table service_partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,                     -- e.g. 'ABC Cleaning Sdn Bhd' · 'Credit Bureau Malaysia Sdn Bhd'
  service_type text not null check (service_type in ('cleaning', 'collections', 'legal', 'other')),
  contact_person text,
  contact_phone text,
  contact_whatsapp text,
  contact_email text,
  active boolean default true,
  contract_start_date date,
  notes text
);

create table collections_events (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid references subscriptions(id),
  billing_id uuid references subscription_billings(id),
  event_type text not null check (event_type in (
    'sms_reminder', 'wa_reminder', 'phone_task_assigned', 'phone_task_completed',
    'warning_wa', 'bureau_escalate', 'bureau_response', 'legal_start', 'resolved'
  )),
  event_day int,                          -- which day in the ladder (0/3/7/14/21/30/60)
  actor_id uuid references salespersons(id),
  partner_ref text,                       -- e.g. Credit Bureau case ref 'CB-2026-047'
  notes text,
  occurred_at timestamptz default now()
);

create index on collections_events (subscription_id, occurred_at desc);
```

**Migration 0261 · extend orders with subscription_id (nullable, additive)**

```sql
alter table orders add column
  subscription_id uuid references subscriptions(id);

alter table orders add column
  subscription_role text check (subscription_role in ('parent', 'sub_delivery'));

create index on orders (subscription_id) where subscription_id is not null;
```

---

## Cross-module interactions

| Trigger | Cascades to | Effect |
|---|---|---|
| New subscription signup | Orders (parent SO) + Delivery (sub-SO) + Payments (60/84 billings) + Services (15/21 events) + Inventory (draw 1 unit) | Single-transaction atomicity |
| Monthly billing cron (00:00 MYT daily) | Payments Collect tab | Bills due today marked; auto-debit attempted |
| Payment received | subscription_billings.paid_at + collections_events (event_type='resolved') | Dunning ladder resets |
| Day 3 late | SMS + collections_events log | Automated |
| Day 14 late | Phone task in Tasks widget assigned to Ching-tier | Ops widget cascade |
| Day 30 late | Credit Bureau Malaysia API call + case ref stored | Automated |
| Cleaning scheduled | Right-rail Calendar dot on scheduled date | Widget interlink |
| Cleaning done | subscription_services.completed_at + photo_url + Activity log | Cross-widget cascade |
| Subscription cancelled | Orders (parent SO status='cancelled') + Payments (remaining billings status='written_off') + Services (skip pending) | Multi-table update |

---

## Scale considerations (1000 orders/mo)

**Load calculations:**

- **Year 1 subscribers**: if 30% of 1000 orders = subscriptions → 300 new subs/year
- **Monthly billing rows**: 300 subs × 60-84 months = **~20k billing rows over 5-7 years**
- **Services rows**: 300 × 15-21 = **~5k service rows over term**
- **Deliveries year 1**: 300 first-mattress deliveries (spread over 12 months = ~25/month · manageable)
- **Cleanings/month steady state**: 300 subs × 3 cleanings/year ÷ 12 = **75 cleanings/month** to coordinate with cleaning partner

**Scale-critical work:**

- **Billing cron** at 00:00 MYT must process 300+ billings/day without timing out → batch in 50s, retry logic
- **Dunning ladder cron** hourly checks — auto-progress subscribers to next ladder step
- **Cleaning partner coordination** = WhatsApp Business API OR bulk-schedule daily to reduce individual messaging cost
- **Credit Bureau API** — expect 5-15 escalations per month at 1000-order scale; contract for capacity accordingly

**Ready for scale from day 1** (build these into Phase 2, not later):

- Indexes on `subscriptions.status` · `subscription_billings(status, billing_month)` · `collections_events(subscription_id, occurred_at desc)`
- Pagination on all list views (server-side, keyset for stability)
- Background job queue for dunning + billing (not synchronous in requests)
- Rate limiting on external partner API calls (Credit Bureau, cleaning company)

---

## Executable phases (6 weeks · Sept 2026 hard deadline)

**Phase 0** (Week 1 · Jul 24-31) — EXTERNAL PARTNER LOCK
- Confirm new mattress supplier contract signed (Loo/Jess)
- Confirm Credit Bureau Malaysia package resumed (Jess)
- Confirm cleaning company partner appointed (Jess)
- If any of 3 not locked by Aug 1 → escalate immediately, decide fallback (manual instead of automated for that partner)

**Phase 1** (Week 2 · Aug 1-7) — Data foundation
- Migrations 0256-0261 (all 6 tables · all additive)
- Types in `packages/shared` (`Subscription`, `SubscriptionBilling`, etc.)
- Basic RPCs (`create_subscription`, `mark_billing_paid`, `cancel_subscription`)
- Feature flag `env.SUBSCRIPTIONS_ENABLED` wired in web + api

**Phase 2** (Week 3 · Aug 8-14) — Signup + UI skeleton
- Orders POS: subscription SO type option (only visible when flag ON)
- Signup flow (Model → Term → Customer → Preview → Confirm)
- Subscriptions module 4-tab shell (Active · Deliveries · Services · Collections)
- Read-only views (data flows through, no write actions yet)

**Phase 3** (Week 4 · Aug 15-21) — Automation engines
- Billing cron (00:00 MYT daily · marks due · attempts auto-debit)
- Delivery sub-SO auto-generation (first-mattress delivery within 14 days)
- Services scheduling algorithm (evenly spread within term)
- Cleaning partner assignment (Phase 3 = manual WhatsApp; auto in Phase 5+)

**Phase 4** (Week 5 · Aug 22-28) — Collections + Credit Bureau
- Dunning ladder cron (hourly · progresses subscribers by day count)
- SMS + WhatsApp auto (Day 3, 7, 21 messages)
- Phone task auto-assign (Day 14 → Tasks widget → Ching-tier)
- Credit Bureau Malaysia integration (Day 30 auto-escalate · basic API call · store case ref)
- Right-rail Calendar shows subscription schedule
- Payments module Collect tab includes subscription billings

**Phase 5** (Week 6 · Aug 29 - Sep 1) — E2E test + go-live prep
- Fake subscriber signup end-to-end
- Simulate Day 30 dunning to Credit Bureau (staging)
- Verify Calendar + Tasks + Duty Board + Activity all reflect subscription events
- Fix critical bugs
- Sept 1: flip `SUBSCRIPTIONS_ENABLED=true` on prod
- Onboard 5-10 real subscribers manually first day
- Monitor daily for first week

**Total: ~60h impl + 25h review = ~85h across 6 weeks · 6+ PRs · Subscription 0/10 → 8.5/10 by launch · 10/10 by end of year 1.**

---

## Critical self-audit · rating 6/10 (unbuilt · aggressive timeline)

### Real gaps

| # | Gap | Fix |
|---|---|---|
| 1 | **No deposit + no trial = HIGHER risk of default** than international norms | Dunning must be aggressive from Day 1 · Credit Bureau non-negotiable |
| 2 | **New supplier contract not signed** — biggest external blocker | Phase 0 · confirm by Aug 1 or fallback plan (manual buy for first 30 days) |
| 3 | **Credit Bureau resumption timeline** — package resumable but "resumed for launch" specific date needed | Jess call this week; get written confirmation |
| 4 | **Cleaning partner TBD** — no partner = no cleaning · retention risk | Jess appoints by Aug 15 or Phase 4 falls back to Carres-staff-does-cleaning (unsustainable at scale) |
| 5 | **1000 orders/mo scale** — mostly untested by current architecture at this volume | Phase 1 include load test with 1000 fake subs |
| 6 | **Model pricing tiers M2-M5 TBD** — only M1 (RM 49) locked | Jess signals full pricing table by Aug 8 or launch M1-only |
| 7 | **Auto-debit banking integration** — assumed but not spec'd (Malaysia bank APIs) | Phase 3 · if no bank API, fall back to manual bank transfer + auto-check |
| 8 | **No mattress change = customer stuck** with same product for 5-7 years · durability risk | Warranty replacement flow (via Service Cases) must be robust |
| 9 | **Cancellation policy** — customer cancels year 2, do we chase for remaining term? | Loo/Jess decision needed by Aug 8 |
| 10 | **Feature-flag rollback plan** — if launch goes wrong, how to disable gracefully | Phase 5 test flag-off with existing subs mid-flight |

### Solutions to lift 6 → 9/10

- **Solution A · External partners locked by Aug 15** (Fixes 2, 3, 4) — biggest risk retirement
- **Solution B · Load test at 1000-sub scale in staging** (Fix 5) — proves architecture
- **Solution C · Cancellation policy locked** (Fix 9) — legal clarity for customer contract
- **Solution D · Warranty/defect replacement flow** (Fix 8) — protects customer trust
- **Solution E · Feature flag graceful disable** (Fix 10) — safety net

Rated after these: 9/10.
Rated after 3-6 months of live subscribers + real dunning + real cleaning cycle: 10/10.

---

## International reference model

**Study these before/during Phase 1:**

1. **Grover (Germany · electronics rental)** — closest to Carres model (product + service bundle + monthly subscription + automated dunning). Scaled to 100k+ customers. Public blog has product/tech decisions.
2. **Sleep Number 360 (US)** — mattress-as-service at $150+/mo. Focus on tech integration (sleep tracking) as retention lever.
3. **Rent the Runway (US)** — cleaning included in monthly · partner network model for cleaning fulfillment.
4. **Simba Circle (UK · mattress)** — membership add-on to mattress purchase · retention 90%+.
5. **Nectar Sleep (US)** — 365-day trial + free returns · direct-to-consumer mattress · not exactly Carres but their referral engine + customer service is world-class.

**Key patterns Carres should adopt from these:**
- Automated dunning at day 3 (Grover)
- Cleaning via partner network not in-house (Rent the Runway)
- Retention hooks in monthly touchpoints (Simba Circle)
- Simple pricing table on signup (all 5 sources)

**Patterns Carres should AVOID:**
- Long trial periods (bad for mattress; can't resell used)
- Complex upgrade paths (Sleep Number's app is overwhelming)
- Loyalty perks (adds complexity for RM 49-200/mo tier)

---

## Anti-drift note

If a fresh chat / external reviewer reads this and thinks any decision is wrong:

1. **Business locks (§LOCKED business decisions)** are Loo/Jess owner decisions. **NEVER silently override.** Flag them clearly to Jess for owner-level review.
2. **HARD design decisions** → ASK Jess first
3. **NEGOTIABLE design decisions** → open a doc-amendment PR

**Special watch — Sept 2026 deadline is HARD.** Any suggestion to "delay for polish" = re-scope by DROPPING features from launch, NOT slipping the date. Launch Sept 1 with less if needed; add later.

**Fresh-chat traps:**
- "Add a trial period" — NO (LOCKED #6, Jess decision)
- "Add deposit for risk protection" — NO (LOCKED #4, Jess decision)
- "Allow mattress change every 2 years" — NO (LOCKED #5, Jess decision)
- "Skip Credit Bureau, do internal collections only" — NO (LOCKED #8, Jess decision, resumable partner ready)
- "Wait for supplier contract to build UI" — NO, parallel prep is the plan (LOCKED #13)
