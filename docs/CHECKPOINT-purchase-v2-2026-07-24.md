# Checkpoint · Purchase Cockpit v2 · 2026-07-24 (Jess)

Handover snapshot for continuing at office desktop tomorrow. Paste this file
into the first message of the next chat if starting from cold.

## Where the code is

**Branch:** `feat/purchase-cockpit-v2` (off `feat/purchase-cockpit-2026-07-23`
at commit `6d1bbcca` = original Jul-23 handoff).

**Commits on the branch (bottom = latest):**

| Commit | What it did |
|---|---|
| `0c5876b4` | v2 master-detail scaffolding — `PurchaseListRow` (40px 3-col) + `PoDocumentPreview` (PDF-style, later stripped) + inline Place-stage master-detail. Deleted legacy `PlaceListRow` (108 lines) + `PlaceDetail` (289 lines) + 5 unused helpers. |
| `67fac4fd` | PROJECTS facet section (customer-name grouping, ≥2 SO/≥2 units) + `SectionCard`/`SectionBand` chrome (lint RULE G). |
| `1d6d8a11` | Chase/Receive rows migrated to `PurchaseListRow` — same 40px 3-col shape across all 3 stages. |
| `17610fe7` | `PurchaseSettingsSheet` — right-side 4-section slide-in (Lead times · Arrival buffer · PO days · Duty rotation). Replaces the 420px LeadTimesButton modal. |
| `8a25fead` | **Rev 2** — chip-left facet (SH/SH/YJ) via `personInitials`+`avatarColor`; `⚠ 1 late` inline on Send POs; NEEDS ATTENTION deleted; PROJECTS deleted (Jess: noise); BY FACTORY → SUPPLIER; 1/2/3 numbers gone; PDF letterhead deleted; new `SalesOrdersCovered` component (SO + customer + deadline). |
| `a299fe42` | **Rev 3** — `+ New PO` button (Gmail compose style) + per-line `⋮` menu (Send separately / Push to next / Skip) + `Snooze` PO button + duty rotation TABLE in Settings sheet + `Carres Klg` warehouse fix. `ListPageShell` gains a `facetWidthPx` prop; Purchase v2 uses 320. |
| `a3616141` | **Rev 4** — middle-panel LIST folded into facet as a category-grouped tree under Send POs. Body column now renders ONLY the preview. Chase / Receive still on 2-column split (follow-up). |
| **NEXT** | UI-KIT selection-blue change (corner-blue bar removed) + this checkpoint — commit locally, not pushed yet. |

**On origin:** `https://github.com/wenwei4046/Carres-Portal-v2/tree/feat/purchase-cockpit-v2` (last push through `a3616141`).

**Jess's original tree preserved:** `feat/purchase-cockpit-2026-07-23` untouched.

## What runs at office (3 commands)

```bash
git fetch origin
git checkout feat/purchase-cockpit-v2
pnpm --filter @carres/web dev --port 5188
```

Login `operation@carres.com` / `111` → `/operation?tab=purchase`.

**Or push+deploy tomorrow via wrangler** (per memory `reference_web_deploy_procedure`):
```bash
pnpm --filter @carres/web build
wrangler pages deploy apps/web/dist --project-name=carres-portal --branch=main
```
(Do NOT auto-deploy — Loo's `NEVER deploy prod from a feature branch` rule; merge to main first if intended for prod.)

## All 12 checklist items — DONE

| # | Item | State |
|---|---|---|
| 1 | Facet 320 · middle panel folded into facet · Category tree under Send POs | ✅ |
| 2 | Category header: `N PO · N units · Send by <date> [Late]` | ✅ |
| 3 | `+ New PO` button (Gmail compose, top of facet, empty CreatePOModal prefill) | ✅ |
| 4 | Preview per-line `⋮` → Send separately / Push to next / Skip (stubs) | ✅ |
| 5 | Preview `Snooze` button with 3 date targets (stubs) | ✅ |
| 6 | PDF-style `CARRES SDN BHD` letterhead deleted | ✅ |
| 7 | `SalesOrdersCovered` — every SO + customer + deadline listed | ✅ |
| 8 | PROJECTS section deleted (customerName ≥2 grouping was noise) | ✅ |
| 9 | BY FACTORY → SUPPLIER rename | ✅ |
| 10 | NEEDS ATTENTION deleted · `⚠ N late` inline on Send POs | ✅ |
| 11 | Avatar chip per stage (SH · SH · YJ) via shared `personInitials` + `avatarColor` | ✅ |
| 12 | GRN rotation offset-1 (Jul: Shasha PO / Yu Jun GRN → Aug: Yu Jun PO / Khor Yee GRN → Sep: Khor Yee PO / Shasha GRN → loops) | ✅ |

Extras done in the same window:
- **Warehouse** fixed to `Carres Klg` throughout (memory reminder saved: NEVER say "no warehouse")
- **Team names** locked to LIVE roster (Shasha / Yu Jun / Khor Yee — not the older `Ching / Chow` in stale memory)
- **User identity** locked to `Jess` in memory (email is Loo's but Jess uses it)
- **UI-KIT selection blue** — 3px `#378ADD` corner-blue inset bar REMOVED from `.is-selected`, UI-KIT.md + index.css updated (this commit, not pushed yet)

## Top-to-toe review — problems + solutions

### 1. Preview · missing the 7-col SKU table (highest priority)

Jess's original `PurchaseDetail` had a rich SKU table:

| SKU | MODEL | SIZE | QTY | IN STOCK | DEADLINE | ORDER |
|---|---|---|---|---|---|---|
| 5539-2A(RHF) | Booqit | — | 6 | — | Tue 11 Aug | SO-1204 +4 |

My rev4 preview only shows `SKU × QTY`. Missing MODEL, SIZE (derived from SKU tail), IN STOCK (`l.ready`), DEADLINE (earliest customer deadline per line via `forOrders`), ORDER (SO numbers with `+N`).

**Solution:** Bring back the 7-col table from the pre-rev1 `PlaceDetail` (deleted in commit `0c5876b4` — recover from git history line 1499-1560 of the old file). Wire it as the primary `What's in this PO` renderer.

### 2. Preview · header + meta card too cluttered

Currently 3 stacked sections at top:
- Red late banner
- Meta card (Supplier / Category / Stock to / Prepared by)
- WHAT'S IN THIS PO card

Jess's original had ONE clean header:
```
🛋 Send PO to Ohana (sofa)                    SEND BY
12 units · for 5 SOs · deliver to Klg          22 Jul 26, Wed (1d late)
```

**Solution:** Merge the meta card + late banner into a single-row header. Right-side "SEND BY" mini-column in red when late.

### 3. Facet tree · category summary line wraps

Current tree has 2 lines per category:
```
SOFA                       1 PO · 12 UNITS
Send by 22 Jul 26, Wed [Late]
```

Could compress to one line (or two much tighter lines) — the second line is a full row of vertical space for one date + optional pill.

**Solution:** Move "Send by <date>" into the category header itself as a right-side secondary, e.g.:
```
SOFA · 1 PO · 12 UNITS         22 Jul 26, Wed [Late]
```

### 4. WhatsApp message uses SKU codes, not CR/TCF refs

Per memory `reference_supplier_chase`: **suppliers recognise their CR/TCF original reference**, not SO numbers, not SKU codes. My current template says "5539-2A(RHF) × 6" — Ohana doesn't know what that means. They know "CR-2025-0812".

**Solution:** In `buildPlaceWaTemplate`, iterate `forOrders[i]` and pull the CR/TCF ref (from `orders.ref` or similar shared field). Line format: `CR-2025-0812 · SF02 3-seat × 3`.

### 5. Chase / Receive stages · not folded into facet tree yet

Rev4 only migrated Send POs into the facet. Chase and Receive still render as 2-column list + detail.

**Solution:** Apply the same category-grouping + facet-tree pattern:
- Chase: group by supplier (or category), show "N days late" inline
- Receive: group by supplier, show "arriving today / this week" inline

Data is 0/0 today, so this can't be visually validated — do it when there's real chase/receive data.

### 6. Line `⋮` + PO Snooze + `+ New PO` · all UI stubs

The three action mechanisms show correctly and toast "coming soon" — the backend routes aren't wired yet.

**Solution (backend work, separate commits):**
- `Send separately`: split PO in place (new supabase RPC `p_split_po_line`?)
- `Push to next cycle`: mark line for exclusion in tomorrow's plan — needs an `order_lines.exclude_from_plan_until` timestamp column
- `Skip`: same shape as Push but with `null` expiry (permanent for this order)
- `Snooze PO`: mark PO for exclusion until a target date — `purchase_plans.snooze_until` column
- `+ New PO`: opens CreatePOModal — verify empty-prefill works end-to-end

Migration `0243` (already mentioned in checkpoint 07-23) can carry these columns.

### 7. `PurchaseListRow` component · orphaned

After rev4 folded POs into the facet tree, `PurchaseListRow` is only used by Chase/Receive. Once those also migrate to the tree, the component is dead.

**Solution:** Either keep it as a general-purpose row component for other pages, or delete when Chase/Receive migrate.

### 8. `MiddleListHeader` · orphaned for Place stage

Same story — only used by Chase/Receive now.

**Solution:** Delete once Chase/Receive migrate.

### 9. Facet width 320 · applied only to Purchase page

`ListPageShell` gained a `facetWidthPx` prop with default 240. Purchase v2 passes 320. Other pages using `ListPageShell` continue at 240.

**Solution:** No action — this is intentional. Any other page can opt in to a wider facet by passing the prop.

### 10. Corner-blue selection bar · REMOVED but not pushed

Just did in this session. `.is-selected` in `apps/web/src/index.css` line 357 now has `background-color: #C2E7FF` only; the `box-shadow: inset 3px 0 0 #378ADD` was removed. `docs/UI-KIT.md` line 242 updated to reflect. `apps/web/src/lib/design-standard.ts` line 42 still records `selectBlue: #378ADD` — this hex is still used elsewhere (checkbox `.is-select`) so keep it.

**Follow-up if needed:** grep the codebase for anywhere else `#378ADD` is used as an "inset bar" and remove those too. Current known uses: checkbox fill (keep).

## Team + org · what to remember

- **User = Jess** (COO, `limchaichiew@gmail.com` is Loo's account she uses to log in) — never call her Loo again
- **Team = Shasha · Yu Jun · Khor Yee** (LIVE Orders panel; older Ching/Chow memory is stale)
  - Shasha = SH · teal-mint chip
  - Yu Jun = YJ · lavender chip
  - Khor Yee = KY · pink chip
- **Warehouse = Carres Klg** (Klang; NETS runs it) — never say "no warehouse"
- **PO duty (Jul):** Shasha · **GRN duty (Jul):** Yu Jun (offset-1)

## Language + working laws

- Chinese chat / English deliverables (memory `language-split-chinese-chat-english-deliverables`)
- No option menus — decide, present, invite redirect (memory `no-menus-decide`)
- git fetch first before every session (memory `feedback_jess_working_laws`)
- Don't decide when Jess rests. She calls it.
- Migrations: draft first, check remote tail (memory `feedback_jess_working_laws` guardrail #8)

## Follow-ups (backlog for tomorrow / next sessions)

Priority order (higher = more visual impact for Shasha):

1. **Bring back the 7-col SKU table** in Place preview (§1 above) — recover from git history commit `0c5876b4`~1
2. **Compress the preview header** into one row (§2)
3. **Category header · one line** instead of two (§3)
4. **WhatsApp message · use CR/TCF refs** not SKU codes (§4) — reads `orders.ref`
5. **Wire the New PO / Snooze / line-⋮ actions** to real routes + migration `0243` (§6)
6. **Chase + Receive stages · fold into facet tree** (§5) — do when there's real data
7. **Delete `PurchaseListRow` + `MiddleListHeader`** after §6 (§7, §8)
8. **Handover banner** on duty change (Shasha → Ching on Aug 1) — per `feedback_system_guides_inexperienced`

## Verified state

- tsc clean
- lint clean (design-standard baseline 94 hovers, 0 hex above baseline)
- production build ~6.7s clean
- dev preview shows the folded tree + selected PO in `#C2E7FF` wash (no more corner bar) + preview column with all sections rendering
- 4 commits pushed to `origin/feat/purchase-cockpit-v2` through `a3616141`
- 1 uncommitted change on disk: `apps/web/src/index.css` + `docs/UI-KIT.md` (corner-blue removal) — commit + push tomorrow

## Files touched this session (not exhaustive — see git log)

- `apps/web/src/pages/operation/OperationPurchase.tsx` (main file, ~1500 lines)
- `apps/web/src/pages/operation/components/PurchaseListRow.tsx` (new, orphaned after rev4)
- `apps/web/src/pages/operation/components/PoDocumentPreview.tsx` (new, letterhead-less)
- `apps/web/src/pages/operation/components/PurchaseSettingsSheet.tsx` (new)
- `apps/web/src/components/ListPageShell.tsx` (added `facetWidthPx`)
- `apps/web/src/index.css` (removed corner-blue from `.is-selected`)
- `docs/UI-KIT.md` (corner-blue rule updated)
- Memory: `user_jess.md` (identity + team + warehouse notes)

---

**Bottom line:** 12/12 done + UI-KIT corner-blue fix. Corner-blue commit is on disk, un-pushed. Everything else on origin. Tomorrow at office: pull → dev → verify the corner-blue change didn't break anywhere else → tackle the top-to-toe review problems in priority order.
