# Carres Operations Portal — System Masterplan

> The single top-level document. Every chat, every page, every prompt to Claude Code
> starts by reading this. It defines the whole system so no page is designed in
> isolation and nothing gets redrawn twice.
> Stack: Vite + React 19 + TypeScript + Supabase, Cloudflare Pages. Branch discipline per task. **Never deploy unless Jess says so.**

---

## 0. Why this exists (the problem we're solving)

Carres is fundamentally a **customer-service business** whose real work is
**coordination** — chasing suppliers, arranging logistics, collecting payment,
keeping customers informed. Today that coordination lives in people's heads and
scattered WhatsApp chats, so it is **out of control**: things get missed,
double-chased, and when one person is on MC or resigns, their knowledge leaves
with them. Jess is the single point of failure.

The portal's job is not to be pretty. Its job is to **make coordination
controllable, shareable, and lead staff through the work** — so that a rotating,
English-limited team can run 1000 orders/month without anyone holding it all in
their head.

**Design philosophy (applies to every page):**
1. The system leads staff; it does not rely on staff knowing what to do.
2. Colour = problem only. Healthy is calm/grey. One or two coloured points per view.
3. The system does the thinking (priority, next step); staff execute.
4. Every record follows the ORDER, never the person — so anyone can take over any order.
5. Reuse tokens/components from the design system; never invent parallel styles.

---

## 1. The architecture (five layers)

```
ROLES        Staff (Shasha/Joy/Chin)   PO Controller (monthly)   Owner (Jess)
                     │                          │                      │
ORDER CORE   ┌───────┴──────────────────────────┴──────────────────────┴───────┐
  (single    │  Every order carries: Status (stock·money·logistic)             │
   source    │                        Chase log (who·when·reply)               │
   of truth) │                        Next action (auto-computed)              │
             │  Records follow the ORDER, not the person.                      │
             └───────────────────────────────┬─────────────────────────────────┘
MODULES        Orders list · Order detail · Purchase order · Receiving/GRN ·
   (read/      Warehouse/stock · Payments · Delivery · Service cases
    write core)
ENGINES        WhatsApp chase (templates + one shared log) ·
   (cross-     Assignment + cover (auto-split · reassign) ·
    cutting)   Alerts + deadlines (two lines · public holidays · gap-watch)
FOUNDATION     Design system: tokens · components · colour discipline
               (every page is built from this)
```

**The load-bearing idea:** everything reads and writes ONE order core. Adding a
feature = adding a module that reads the core. Changing owner = reassigning the
order in the core (the record stays). Growing = adding people/teams; the core
doesn't change. This is why the system can grow without being rebuilt — expansion
is "add around the core," never "tear down and redo."

---

## 2. Roles and how work is divided

**Staff (Shasha / Joy / Chin) — order followers.**
- Each staff **owns a batch of orders** and follows them end to end (chase stock,
  book logistic, collect payment, keep customer informed). One order = one owner,
  so the customer always has one person who can answer.
- Assignment is **automatic** (system splits new orders across staff). Default view
  = "my orders" (focused). But this is a filter, not a wall.
- **Cover is free**: any staff can switch to "all orders" or "someone's orders" and
  **act on them directly** (chase, reply, edit). The system logs who did what.
  No approval needed — approval would just recreate a bottleneck (Jess). Free cover
  + audit trail.

**PO Controller — central purchasing, rotates monthly.**
- Raising PO is a **central, single-person job** (needs to see all demand, consolidate,
  avoid double/missed orders). It cannot be split across people.
- All orders needing a PO flow into one **"Raise PO" desk**, regardless of who follows
  the order. The current-month controller raises them.
- The controller **rotates automatically** (1st of month: Shasha → Joy → Chin → repeat).
  After a PO is raised, the order returns to its follower for chasing.

**Owner (Jess) — overview and safety net.**
- Sees all orders and who owns each.
- **Batch reassign** (someone resigns → move their whole batch in one action).
- **Gap-watch**: alerts for orders nobody has touched for X days (e.g. owner on MC)
  or nobody claimed — so nothing is forgotten.
- Sets/sees who is this month's PO Controller.

**Growth path:** now = 3 people, one shared Klang-Valley pool + rare outstation
(tagged, mixed in). Later = outstation grows into its own pool/team; each region
becomes a small team. The two-layer structure (owner over staff) does not change —
you add people and pools, not rebuild.

---

## 3. Order core — the single source of truth

Every order carries these, and they **follow the order, not the person**:

- **Status** — three lines: stock (per category), money, logistic. Each line
  healthy/warning/danger, auto-computed.
- **Chase log** — one shared log per order: every chase (to customer / supplier /
  partner), who did it, when, and the reply. Any chase button anywhere writes here;
  `last_chased_at` reads from here. No parallel logs.
- **Next action** — `nextActionOf()`, one pure function, the system's brain.
  Priority order: Done → No PO → Supplier overdue → Waiting stock → Assign logistic →
  Logistic no ETA → Call customer → Schedule delivery. The list page groups by this;
  the detail page's tiles reflect it. Both call the SAME function so they never disagree.
- **Two deadlines** (separate, both computed): supplier line = customer deadline −
  lead time (mattress/bedframe 7d, sofa 5d for the lamp threshold; purchasing lead
  mattress/bedframe 7d, sofa 10d low-season/14d peak); delivery line = customer
  deadline itself. Supplier line goes red first to force early chasing.
- **Owner** — which staff follows this order (for my/all views and reassignment).

Because a taking-over person opens the order and sees the full history + current
status + next step, **cover and hand-off need no verbal briefing**. This is the
cure for single-point-of-failure.

---

## 4. Modules (each reads/writes the core)

- **Orders list** — my orders (default) / all / delivered tabs. Within a view,
  grouped by next-action (Raise PO / Chase supplier / Book delivery / Collect
  payment) so staff work top-to-bottom in batches. Facet counts are clickable
  filters. Bulk bar for batch chase/assign. Three-dot S·L·C health at row edge.
  (At 1000/month the "my orders" filter is what keeps a view small enough to act on.)
- **Order detail** — the two-column panel already specced (see ORDER_PANEL_BUILD_PROMPT.md):
  left = customer + balance + storage + delivery; right = KPI+alert panel + items
  hero + warehouse + loan. Money only on left, goods only on right, each deadline once.
- **Purchase order** — the central Raise-PO desk; consolidated ordering; monthly
  controller.
- **Receiving / GRN** — goods in; updatable inside the items table + a batch page.
- **Warehouse / stock** — ready-stock pool (Carres_KLG) + reserve-to-order; auto-match.
- **Payments** — balance (state-adaptive), add payment (amount+date+note, reversible
  not deletable), storage fee (mattress+bedframe RM150/mo, sofa free 14d then RM200),
  invoice PAY-{YYMM}-NN / receipt RCP-{YYMM}-NN.
- **Delivery** — logistic assign, slot, proof; delivery-line deadline lives here.
- **Service cases** — SC{YYMM}-NN; failed-delivery/repair flow (Stage 1 designed:
  same-day reassure with mandatory fee-warning fork; open SC; record goods location
  left-at-customer / back-to-store / back-to-supplier; Stage 2 = supplier confirm →
  liability → 14-working-day return → redeliver → close, built later).

---

## 5. Cross-cutting engines (used by every module)

- **WhatsApp chase engine** — templates per recipient (customer / supplier / partner),
  each with Reminder (soft) + Chase (firm) tone; plus special templates: stock-delay
  "notify customer" (apologise, no delivery date per rule), and failed-delivery
  same-day messages (chargeable vs not, auto-filled with REF/name/item). Every send
  writes the one shared chase log. Supplier/partner phone book stores numbers so
  buttons open wa.me directly.
- **Assignment + cover** — auto-split new orders across staff; free cover with audit;
  batch reassign on resignation; PO-controller monthly rotation.
- **Alerts + deadlines** — stacked alert rows sorted by severity (red gates on top —
  on-hold owing [auto, clears at RM0], service-case-open; amber below — rescheduled,
  stock-late-call-customer); collapse to "+N more" beyond 3; two-line deadline maths;
  Malaysian public-holiday–aware day counting (delivery, countdown, storage);
  gap-watch for untouched orders.

---

## 6. Foundation — the design system (governs look of every page)

This is the "guideline" that stops code redrawing and pages drifting. Code reads
values from `design-standard.ts` + the facet component; never hardcodes hex/px that
already exist as tokens; never builds bespoke cards.

- Layers: page cream #F5F1EA; white panels + 0.5px neutral border; cream section
  bands inside white panels; never cream-on-cream; no coloured/red borders except the
  alert accent stripe.
- Colour: flame #C44D2B = buttons/brand only; danger red = alerts only; amber =
  warning; green = ready/collected/on-time. Colour only when there's a problem.
- Components: reuse facet's Panel / SectionBand / Row. Missing primitive → add to the
  UI-KIT first, then use.
- Type: two weights (400/500), sentence case, small grey uppercase label + big value +
  one supporting line + generous gaps ("breathing room").
- Wizard pattern (for linear SOP flows only — failed delivery, service case,
  onboarding): stepped progress bar, one step at a time, system auto-fills, staff picks
  from dropdowns. NOT for daily operational pages like the order list/detail.

---

## 7. Build phases (each ships independently, none forces a later redo)

1. **Foundation + Order core** — design-system tokens/components confirmed;
   order core data (Status, Chase log, Next action, two deadlines, owner). Everything
   depends on this — build first.
2. **Order detail + Payments** — what's needed internally first (record payments, see
   an order). Spec ready in ORDER_PANEL_BUILD_PROMPT.md.
3. **Orders list (my/all + next-action grouping) + Assignment/cover** — get the
   3-person division of labour running.
4. **PO desk + monthly rotation.**
5. **Service cases (failed-delivery flow).**
6. **Delivery / warehouse / receiving polish + NETS hand-off.**

Rule for every phase: build on the same core + foundation, show Jess each step,
approve, continue. Never deploy unless Jess says so.

---

## 8. How to use this document

- Starting any new chat or page: paste/point to this masterplan first, then the
  page-specific spec (e.g. ORDER_PANEL_BUILD_PROMPT.md).
- Any decision that conflicts with this file: this file wins, unless Jess changes it.
- Keep the ONE-QUESTION-AT-A-TIME working rule; give 3 options on proposals; Chinese
  replies; no code/next step until Jess agrees; no deploy without explicit say-so.
