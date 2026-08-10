# SALES ORDER CUTOVER — a strangler migration, not a coexistence

> **Owner ruling, 2026-08-10.** The old Orders page is being dismantled.
> Its end state is DELETED. "Side by side" was the architect's wrong framing
> and is superseded by this file.

---

## TARGET — where every part of the old page ends up

```
OLD ORDERS  (now "Old Orders (temporary)", /operation/old-orders)
├─ Sales Order facts ─────→ Sales Order       ✅ Stage 1/2/3, built + CUT OVER
├─ Delivery work ─────────→ Delivery          ☐
├─ Payment work ──────────→ Payments          ☐
├─ Purchasing signals ────→ Purchasing        ☐
└─ AutoCount / archive ───→ owner to rule     ☐
                          ↓ 全部搬完
OLD ORDERS  →  HIDE  →  DELETE
```

**The cutover moved the FIRST box only.** Sales Order work now lives on the
new register at `/operation/orders`; the old page kept everything else and
moved to its own temporary door. The four remaining boxes have not started.

**The AutoCount / archive box is the only one with no owner yet.** It also
blocks the final DELETE: the old page is currently the ONLY import surface, so
it cannot be removed while that is still true. Recorded, not solved.

## WHAT LIVES ON THE OLD PAGE TODAY — measured from production, 2026-08-10

```
Sales Order   doc no · customer · items · amount            → replaced ✅
Delivery      No logistics picked 31 · Confirm delivery ·
              Call NETS — confirm delivery date · Deadline ·
              NETS 8 / AL 6 · Overdue 3                      → not moved ❌
Payment       Owing RM 101,070.00 · 45 not priced            → not moved ❌
Purchasing    Supplier late 3 · Nice Future 27 · Ohana 18    → not moved ❌
Import        + AutoCount · + Master · 37 archive orders      → not moved ❌
Team/PIC      E2E Test 45 · Shasha · Yu Jun · Khor Yee        → not moved ❌
```

---

## ⛔ FREEZE — effective today, no expiry

```
THE OLD ORDERS PAGE RECEIVES NO NEW FEATURES AND NO UI CHANGES.
Blocker and data-defect fixes ONLY.
```

**Why it is absolute:** you cannot demolish a house while someone keeps
renovating it. Every improvement made to the old page is work that must be
migrated later, and it makes the old page harder to leave. A frozen page is a
page people want to escape. A maintained page is a page that lives forever.

If a request would add to the old page, the answer is "that belongs in the
module that will own it" — even if that module is not built yet.

---

## ⛔ THE MIGRATION IS NOT A PORT — the owner's ruling, and the trap it avoids

```
DO NOT do "Delivery card → Payment card → Purchasing card" as three
moving jobs. Do not copy a widget across.
```

For each signal on the old page, go back to **that module's own operator
journey** and ask what the signal SHOULD BECOME there:

```
No logistics picked 31   NOT a KPI tile pasted into Delivery.
                         → it belongs in Delivery's real Current Action / queue.

Supplier late 3          NOT a copied widget.
                         → Purchasing's own overdue / action model should
                           PRODUCE it. If that model does not exist, that is
                           the work — not the copying.

Owing RM 101,070         NOT a number moved to a new page.
                         → what does Payments' operator actually do about it?
                           The answer decides the shape.
```

**Copying the widget copies the old architecture's shape into the new module.**
That is the failure mode this ruling exists to prevent — the old page would be
gone, and its thinking would survive inside four new places.

---

## ☑ CARD · SALES ORDER PRODUCTION CUTOVER — DONE. Now STOP.

**Scope — exactly this, nothing else:**
```
1. The NEW Sales Order register becomes the OFFICIAL Sales Orders entry
   in the left nav.
2. The OLD Orders page keeps its own SEPARATE legacy route, carrying only
   the Delivery / Payment / Purchasing work that has not been migrated yet.
3. Name and label it so it reads as TEMPORARY. A legacy surface that looks
   permanent becomes permanent.
```

**MUST NOT — every one of these is a card failure:**
```
✗ delete or hide the old page
✗ copy any old-page feature into the new register
✗ start ANY downstream migration (Delivery / Payments / Purchasing)
✗ modify Stage 1–3 business design in any way
✗ "improve" the old page while you are in there
```

### WHAT IS WIRED — the whole cutover, in code

```
/operation/orders[/:stage]      SalesOrdersRegister      "Sales Orders"
/operation/old-orders[/:stage]  OperationOrdersControl   "Old Orders (temporary)"
```

`OperationApp.tsx` declares both, and the Stage-1 swap-one-identifier alias
(`const OrdersPage: typeof OperationOrdersControl = …`) is retired with it —
two pages on two routes need no alias, and rollback is now the deployment
rollback below, not an identifier edit.

`portal-nav.ts` carries TWO Operations doors. The old one is labelled
**`Old Orders (temporary)`** and wears `History`, deliberately not the
register's `ClipboardList`: two doors in one icon read as one page. The old
page's own nameplate says the identical words — **the only line this card
changed inside the frozen file, and it is a LABEL, not a feature.**

**The temporary door is `/operation/old-orders`, never `/operation/orders/old`.**
`PortalSidebar` lights an item with `pathname.startsWith(item.path)`, so a
sub-path of the register would light BOTH doors at once.

**One live break was repaired on the way through.** `CaseOrderLink` sends
Service Cases to `?order=<id>`; that param is read by the OLD table (it opens
the order drawer) and by nothing else, so from Stage 1 until now the link
landed on a register that silently ignored it. It now points at the temporary
door and moves again when Service's own journey is migrated.

### ROLLBACK — the exact path, and it was EXERCISED on production

**There is no `wrangler pages rollback` command** (`wrangler pages deployment`
offers `list · create · tail · delete` only, wrangler 4.120.0). So the path is
the card's first option, and it is the one that was run:

```
1  git revert the cutover commit  (or check out the previous main tip)
2  pnpm --filter @carres/web build
3  wrangler pages deploy dist --project-name carres-portal --branch main
   wrangler pages deploy dist --project-name carres-pos   --branch main
4  poll all four canonical URLs until the bundle hash is the OLD one again
```

Roll forward = the same four steps from the cutover tip. Evidence for the real
run is in §EVIDENCE below.

**SMOKE TEST — on PRODUCTION, and the point is the OLD page**
```
The new page is not the risk. The risk is that the cutover breaks the page
83 live orders are being worked on today. So test both:

NEW  register loads · open an order · edit + save mints a revision ·
     PDF renders · 1440 and 1130 · console clean
OLD  legacy route still loads · queues still count (Overdue · Owing ·
     Confirm ready date 41 · No logistics picked 31) · Actions still fire ·
     AutoCount import still reachable · PIC filters still work
```

**DONE WHEN:** both above pass on production, the rollback has been run once
for real, and you have posted the evidence. **Then STOP.** Do not proceed to
any module migration.

Obey `DONE MEANS I RAN IT` and `THE STOP RULE` (BUILD-QUEUE, `8fb41bc4` /
`cf4cc4cd`).

---

## AFTER THIS CARD PASSES

Only then does module-by-module dismantling begin, and each one starts from
that module's operator journey — never from the old page's widget.
