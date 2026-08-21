# DELIVERY — CARD 01 · FIX SIDE MENU BAR

**Module:** Delivery · **Sequence:** 01
**Owner ruling:** Jess, 2026-08-21
**Status:** EXECUTED — PR #882, merged, deployed, production-verified

---

## 1 · The decision, in one line

**The Delivery module contains exactly two children, and both of them open.**

```
Delivery
├── Delivery Work        →  /operation?tab=delivery
└── Delivery Orders      →  /operation/delivery-orders
```

Retired completely: `Schedule` · `Delivery History` · `Exceptions` · `Partners` ·
`Report`, the hairline above `Report`, and every Delivery `Coming soon` label.
**Nothing replaces them.**

## 2 · Why — the defect this removes

The 2026-08-19 rail drew SEVEN Delivery rows and **five of them refused the
click**. An operator can read a row, count it and want it; a row that answers
nothing when pressed does not teach *"not yet"* — it teaches *"this rail is
unreliable"*, and it taught that five times in a module with two working pages.
`docs/03-page-patterns.md:149` already bans the dead control; the module's own
rail was the largest concentration of them in the portal.

**The capabilities are NOT retired.** `docs/delivery/MASTER.md` §7 still holds
Delivery History, Exceptions and Partners as approved targets, and Report stays
central under the Reports consolidation. They stop being NAVIGATION until they
are pages. **A row returns to this rail in the PR that makes it answer** — that
is the rule this card leaves behind, and it applies to every module.

## 3 · Preserved, unchanged

- Module parent row: icon (`Route`) + `Delivery` + chevron.
- One module open at a time; the module holding the current page opens on load.
- Children hang from rounded elbows; **the trunk now ends at `Delivery Orders`.**
- Selected child keeps the 3px blue bar + blue wash (`bg-kit-blue-3`).
- Both routes unchanged. Each route lights **only** its own child.
- 232px expanded / 60px collapsed. The collapsed icon still opens the module's
  named first live page (`Delivery Work`), never a dead row.
- Role visibility, collapse memory, `Jump to` — untouched. `JumpTo` already
  skipped `soon` items (`JumpTo.tsx:91`), so removing them changes nothing there.
- Settings stays in the global header. Reports stay central.

## 4 · Files changed

| File | Change |
|---|---|
| `apps/web/src/pages/portal/portal-nav.ts` | five `soon` Delivery items deleted; `CalendarDays` import dropped (its only user); comment overwritten with this ruling |
| `apps/web/src/pages/portal/PortalSidebar.test.tsx` | Delivery describe rewritten to two children; elbow-geometry tests re-pointed from `delivery-schedule` to `delivery-orders`; new test proves no retired child and no `Coming soon` in the DOM |
| `apps/web/src/pages/portal/PortalSidebar.tsx` | stale "six delivery pages" comment corrected |
| `docs/delivery/MASTER.md` §8 | navigation list overwritten (Law 3 — the obsolete seven deleted, not appended beside) |

No page content, no Register, no Object page, no other module's navigation, no
route, no token and no shell dimension was touched.

## 5 · Acceptance — met

- [x] Expanding Delivery shows only `Delivery Work` and `Delivery Orders`.
- [x] No retired Delivery child in the DOM (asserted, not eyeballed).
- [x] No Delivery `Coming soon` wording remains.
- [x] Both children retain the governed elbow connector.
- [x] The elbow trunk ends at `Delivery Orders`.
- [x] Each route highlights only its correct child.
- [x] `PortalSidebar` tests pass — 113/113 in the portal suite, 3203/3203 web-wide.
- [x] Web typecheck and production build pass.
- [x] PR created, CI green, merged, deployed, production reports the merged SHA.
- [x] Production screenshot at 1440px attached to the PR thread.
