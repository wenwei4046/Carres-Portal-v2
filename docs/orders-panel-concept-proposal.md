# Orders panel — Purchase-cockpit concept port

> Proposal. Locked with Jess (COO) 2026-07-22 after Purchase cockpit shipped (PRs #242 · #243). To execute Sat 2026-07-26 onward. Cross-machine truth in the repo so a fresh chat on any laptop finds it.

## Context

Purchase cockpit (`/operation?tab=purchase`) shipped live 2026-07-22 (api Worker `bd961e7a`, web `1655fc68` on `erp.carresofficial.com` + `0d037ca5` on `pos.carresofficial.com`). Jess reviewed it live across 3 rounds and locked the design shape + microcopy standard.

She now wants the same design DNA applied to the **Orders panel** (`OperationOrdersControl.tsx`, the half-done `ORDERS_LIST_SPEC` redesign). Contract: **don't tear down existing Orders work — LAYER Purchase concepts on top**, one PR per concept so review + rollback stay granular.

## Reference

Read these BEFORE writing any code:

- `docs/COPY-STANDARD.md` — 10 rules · row action-line template · What-to-do template · canonical vocabulary (SO vs PO)
- `docs/UI-KIT.md` §8.3 Module-tab law · §2.4 Date law · §3.5 Hover law — and the Copy law is
  `docs/COPY-STANDARD.md`, the Action law `docs/ACTION-FLOW-STANDARD.md`
- `docs/PURCHASING-WORKING-FLOW.md` + `docs/PURCHASING-INFORMATION-MODEL.md` — Purchasing's live rules (mirror the discipline). *(Corrected 2026-07-29: `purchase-cockpit-handoff.md` was deleted 2026-07-27.)*
- `apps/web/src/pages/operation/OperationPurchase.tsx` — the shipped reference implementation
- `apps/web/src/pages/operation/OperationOrdersControl.tsx` — the Orders panel we're modifying
- `apps/web/src/pages/operation/components/OrderDetailDrawer.tsx` — the current drawer (to be replaced by inline detail in Phase 2)
- `ORDERS_LIST_SPEC.md` — existing Orders redesign spec (read for prior intent)
- Live Purchase cockpit: `https://erp.carresofficial.com/operation?tab=purchase` (visually study the pattern)

## Purchase concepts that PORT to Orders

| Purchase concept | Port to Orders as | Why |
|---|---|---|
| **3-pane inline split** (facet · list · detail always visible) | Kill the Order drawer overlay → detail lives beside the list, always visible | Biggest UX win — same as Purchase; new operator sees list + detail together, never navigates away |
| **Compact pill stage tabs** (~40px vs ~72px cards) | Same compact pill row for Orders status tabs (Placed · Proceed · Pending · Scheduled · Completed · All) | Half the vertical space; frees room for the detail pane |
| **Row action-line** (≤10 words, verb + object + when) | Every Orders row ends with a plain-English "next step" sentence: `Confirm delivery date with Ali Chen.` · `Chase Nice Future — 2d late.` · `Assign NETS for SO-1234.` | Zero-experience friendly; layers on top of existing action pills (doesn't replace them) |
| **Inline What-to-do (3-4 step, horizontal)** in detail pane | Per stage guide: **Placed** → "Wait for customer to confirm ETA → move to Proceed." · **Proceed** → "Prepare and issue POs · confirm delivery · schedule NETS." · **Scheduled** → "Confirm morning-of · dispatch · POD." · **Completed** → "Post-invoice · archive." | New employees know the flow at every stage |
| **COPY-STANDARD vocab alignment** | Audit every Orders string: SO for customer orders, PO for supplier orders, no mixing; canonical Send / Chase / Receive / Remind / Placed / Proceed | Same one-vocab-across-app discipline as Purchase |
| **Days-to-deliver strip** (14-day) | Same shape as Purchase's Days-to-order — but keyed on `delivery_date` instead of order-by. See today's + this week's delivery load at a glance. Cadence day markers = customer delivery peak days (Mon-Fri; Sat/Sun/PH greyed). L/R chevrons to shift window. | Fits Master-Sheet mentality perfectly; scales at 1000 orders/mo |
| **Missing-data guard bar** | `N SOs need delivery date` · `N SOs need address` · `N SOs need customer contact` — one guard per data gap | Prevents work stalling downstream (currently silent-fail) |
| **`Something wrong? (soon)` button** | Per-stage escape hatch stub | Placeholder for future write-path so we don't forget |

## Concepts that DON'T port to Orders

Orders is different from Purchase (**lifecycle** vs **process-linear**). Skip these:

- **Category icons on rows (Bed / Sofa / BedDouble)** — an SO has mixed items already, one-icon-per-row is wrong. Keep SO number as row identity.
- **Split by category** (Ohana sofa + bedframe → 2 rows) — customer SO is one document; splitting = wrong. Keep 1 row per SO.
- **Facet "By factory"** — for Orders, facet by Region (exists) + Salesperson + Overdue + Payment-status works better.
- **Send stage's 3-step What-to-do** — Orders' stages are lifecycle (placed → proceed → delivered), not process-linear (send → chase → receive). SHAPE ports; CONTENT differs.

## Phased execution (Sat + beyond, one PR per phase)

- **Phase 1** (~2h · SAFE, non-structural) — copy audit + row action-line + inline What-to-do (add without touching layout).
- **Phase 2** (~3h · BIG) — 3-pane inline split (kill drawer overlay) — needs full tests since drawer state moves inline.
- **Phase 3** (~2h) — compact status pills + Days-to-deliver strip + cadence markers + Sat/Sun/PH greyed.
- **Phase 4** (~1h) — missing-data guards + Something wrong (soon) stubs per stage.

Each phase = its own PR. Follows the same discipline as this Purchase cockpit — review + merge + deploy independently.

## Deploy notes

- Purchase cockpit deployed 2026-07-22 from main tip `0777e1d6` (PR #243 merged) — api Worker + web to both carres-portal + carres-pos Pages projects, `--branch=main`.
- Any Orders panel changes follow the SAME procedure (the deploy rules in `CLAUDE.md` §17.1 — deploy only from `main`, re-curl all canonicals and poll until they converge *(corrected 2026-07-29: `purchase-cockpit-handoff.md` deleted 2026-07-27)*).

## Resume prompt (any machine, any new chat)

Paste this into a fresh chat on Sat:

> Continue Orders panel redesign. Read:
> 1. `docs/COPY-STANDARD.md`
> 2. `docs/UI-KIT.md`
> 3. `docs/PURCHASING-WORKING-FLOW.md` *(was `purchase-cockpit-handoff.md` §5, deleted 2026-07-27)*
> 4. `docs/orders-panel-concept-proposal.md` (this file)
>
> Visually study `https://erp.carresofficial.com/operation?tab=purchase` for the design language. Then start Phase 1 (copy audit + row action-line + What-to-do — safe, non-structural, no layout change).

## Open Purchase-side follow-ups (not this Orders work)

- Sat / Sun / public holidays greyed on Purchase Days-to-order strip (`packages/shared/src/my-holidays.ts` already exists — just import + check each cell's ISO).
- L / R chevron nav on Purchase strip (shift the 14-day window ±7 days).
- Real `Prepare PO` / `Issue PO` / `Check in` write paths (now `docs/PURCHASING-WORKING-FLOW.md` §3 — `purchase-cockpit-handoff.md` was deleted 2026-07-27). *(Corrected 2026-07-29: this line said `Send PO` and `Chase WhatsApp`; `Send PO` is retired and `Chase` is a banned word.)*
- Lead-time settings screen (migration 0243).
