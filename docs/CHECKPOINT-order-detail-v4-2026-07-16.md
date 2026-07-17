# CHECKPOINT — Order Detail v4 rebuild · 2026-07-16

> **New-session handoff.** Read this + `docs/CARRES_SYSTEM_MASTERPLAN.md` +
> `docs/CARRES_UI_KIT_V4.md` before touching anything. Branch:
> **`feat/orders-drawer`** (pushed, head `09707e5`+). Do NOT deploy without
> Jess's explicit 上线.

## ⭐ START HERE (evening update — the consistency-pass-v2 queue)

Everything below in "Where we are" happened, PLUS the 7/16 afternoon/evening
run: kit consolidated (§2 action ladder · §8d focus-dimming/pick-circles ·
§9 type-2 tabs · §10 radius ladder + breathing + segmented + scrollbars ·
§3 Money recipe) and the recipe components now in `apps/web/src/components/`:
**Btn** (hero/box/ghost pills + iconOnly circles, md32/sm24) · **Field** ·
**Segmented** · **Money** (tiny muted RM + bold digits) · panel SPLIT (one
white SectionCard per panel, 12px gaps) · type-2 tabs on Orders · closed
row typography (.t4-row/-strong) + v4-guard in the build.

**Jess's OPEN GRIPES (2026-07-16 night — this is the next work, in order):**
1. **Icons: ONE size, bolder.** ✅ DONE — but the final lock (Jess 2026-07-17,
   supersedes the 16/14/17 draft here) is **14 / 16 / 18** (pill·inline /
   default UI / top bar), stroke 2 — docs/UI-KIT.md §A4 + lint RULE C enforce.
2. **KPI box → SPLIT into 3 separate white cards** (one per tile: Customer ·
   Money / Stock / Logistic), same as the per-panel split. (The §4-spec
   "one panel with hairline dividers" is superseded by Jess's ask.)
3. **Row height: one value per surface.** Table rows 44 FIXED (done); panel
   field/money rows currently drift (~36 via py) — lock panel rows to a fixed
   36px (h-9) everywhere so no panel has its own rhythm.
4. **Font sizes converge:** every panel body content = 13 (t4-row family);
   no per-panel 11/12/14 soup. Pills already one spec (11/600) — audit strays.
5. **Hero sizes questioned:** Jess doesn't buy the 20px Outstanding ("why
   here big there small"). DISCUSS FIRST: either keep 2 display sizes only
   (20 hero + 13 rest, nothing between — drop the 16 KPI tier), or flatten
   money to one size. Don't code before he picks.
6. **Flame check:** the page's ONE flame = "+ Add payment" (band shortcut OR
   expanded body CTA — never both). If Jess still sees two, hunt it.

Working rules reminder: preview per step · commit per change · no push
without "push" · never deploy.

## Where we are

**UI-KIT v4 is the single visual baseline** (in-repo at `docs/CARRES_UI_KIT_V4.md`,
incl. §8b 44px row density + §8c read-by-shape, both LOCKED). Its machine mirror
is `apps/web/src/lib/design-standard.ts`. Old `docs/DESIGN-STANDARD.md` = superseded.

**Pushed to `main`** (commit `c4146a5`, NOT deployed): the v4 foundation layer —
tokens (`--background` #F0EFE9 canvas / `--foreground` #1a1a1a / v4 pills /
`.t4-*` type ramp), fonts (Inter + JetBrains Mono slashed-zero via
`font-feature-settings "zero"`), 44px fixed rows in OperationOrdersControl
(three sources aligned: code `[&_td]:h-[44px]` + `[&_td]:whitespace-nowrap`,
design-standard `ROW.heightPx`, render).

**Pushed to `feat/orders-drawer`** (11 commits `78a60da..cbb760c`), all verified
in preview, tsc 0, no live console errors:

1. Order-detail page shell: two columns **32% / 68%**, 12px gap (spec §1 locked).
2. Identity strip (44px) — customer folded in: name + phone (mono) + region on the
   collapsed line, `ordered <date>` right-side meta; ▾ expands the full-width
   customer block: WHITE pills on grey (phone mono dark / region / address,
   click = copy), round white WhatsApp button (grey outline glyph, opens wa.me
   direct), ⋮ = Edit details (place-status gate; form includes salutation).
3. Balance panel (default COLLAPSED, v4 §4 header): band summary state-adaptive
   (`Collected RMx · set total` when money-in-no-total — never a "no total" chip
   beside collected money · `Outstanding RMx · RMy in` · `Paid ✓` pill) + a
   `+ Add payment` shortcut ONLY while collapsed (`Panel collapsedAction` prop —
   one flame per block). Expanded: Total / Collected / Outstanding (20 Bold hero,
   danger only on delivery-eve) + payment history. Total entry pins while typing
   (`editingTotal` focus lock); ⋮ has Edit total / invoice / receipt / copy.
4. AddPaymentModal (drawer-level, 2-col, size lg): Amount / Date (default today) /
   Method Transfer·Cash·Card / Bank HLB·RHB (→ ledger `reference`, transfer only) /
   Upload slip (SHELL — record API doesn't accept receipt_url yet) / Note; RIGHT =
   live "After this payment" (bill/collected/outstanding per keystroke, full pay
   reads Paid ✓). Payments void-able (principal, Undo2 icon), never deletable.
5. Full-page v4 style sweep (`cbb760c`, style ONLY): cream out of content
   (KPI tiles white+hairline; section band → #F9FAFB w/ 12px muted LABEL —
   note this re-themes the Orders LIST facet headers too, shared component);
   numbers never tinted (KPI values / Collected / ledger amounts / PO codes dark);
   selection = blue #e6f1fb (Items active row + StockPickerGrid, flame washes
   gone); Remind grey outline (Chase = the one flame); Reserve/Lend/+Add-stop
   grey secondaries; status = v4 pills everywhere (solid-red No-PO badge → soft);
   Items + warehouse rows 44px; warehouse checkbox 17px blue (`shrink-0` fix —
   flex cell was squashing it).

## Delivery-eve special

Owing + delivery today/tomorrow → red flag row in Balance, Outstanding reads
danger, Remind flips to `buildCustomerFinalReminder` (wa-templates.ts + doc +
tests 9/9 — the ONE customer template allowed to mention delivery timing).

## Not done / next candidates

- **Step 3 of the page spec**: KPI + Alert panel proper (1.5fr/1fr/1fr tiles,
  exception-based Stock rows w/ per-supplier Remind/Chase, stacked alert rows
  red-gates-first, `+N more` collapse). Spec = the 2026-07-15 page-rebuild brief.
- Step 4 Items hero polish · Step 5 Storage (RM150 / sofa-200 rates + fix
  `line_legs` route save) · Step 6 Warehouse/Loan collapsed shells.
- Remaining v4 debt (deliberate): residual 13px content sizes inside dense
  tables (between v4's 12 in-row and 14 secondary); Orders LIST page in-row
  12px font + 11px pills + column min-widths (its own alignment pass).
- OrderCustomerCard.test.tsx: 4 fails since 7/11 (inline Edit removed; component
  now unused by the drawer) — cleanup task filed, either fix via startEditRef
  or delete component+test.
- Upload slip real wiring = receipt workstream (order_payments.receipt_url ready).

## How to run (fresh machine)

```
git clone https://github.com/wenwei4046/Carres-Portal-v2.git && cd Carres-Portal-v2
git checkout feat/orders-drawer
corepack enable && corepack pnpm install
cp apps/web/.env.production apps/web/.env.local   # public values; dev needs .env.local
corepack pnpm --filter @carres/web exec vite      # :5173, login operation@carres.com
```

Verify: `corepack pnpm --filter @carres/web exec tsc --noEmit` = 0;
open an order (SO-1101 = the no-total+collected case, SO-1153 = outstanding case).

## Working rules (unchanged)

Chinese replies · one thing at a time · 3 options on proposals · show preview
per step · commit per finished change (explicit paths, inline git identity)
· wait for Jess's `push` / `上线` keywords · never deploy unasked.
