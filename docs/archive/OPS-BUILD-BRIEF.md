# ⭐⭐ OPS BUILD BRIEF — read this FIRST, every Carres ops/panel task

> This lives in the **repo** (not a `~/.claude` memory) on purpose: it can never be
> skipped. `CLAUDE.md` points here. Read it, then read the three files below, then act.
> The **Operation Orders page is the finished GOLDEN reference** — every new panel
> (Payments next) is an EXPANSION that copies its shape. Do NOT reinvent.

## Read, in order, before building
1. **[`docs/UI-KIT.md`](UI-KIT.md)** — the ONE UI law: the §1.1 gate, the §1.3 height budget, the §1.4 Information Hierarchy, the §3.6 action-tone table, the date law. This file WINS over any older doc or memory. Gate: `pnpm --filter @carres/web lint`.
2. **[`CLAUDE.md` §15](../CLAUDE.md)** — Jess's working rules: think the solution through first · a screenshot means list every problem top to toe · she agrees before any code · check memory first · count the data before proposing UI · small commits, each one proved in a preview.
3. **`apps/web/src/pages/operation/OperationOrdersControl.tsx`** — THE reference implementation. Copy its `ListPageShell` header, facet rail, column + pill + date anatomy for any new list/panel.

## The business, in one model (三轨)
Carres = furniture retailer. Dealers/showrooms SELL; the **customer pays HQ direct** (no dealer credit). The **Operation portal** is COO Jess's daily driver (single operator, ~1000 orders/mo, all outsourced). **Every order runs 3 parallel tracks:**

- **货 STOCK** (supplier): no PO → `Issue PO` · PO'd, waiting → `Confirm ready date` · goods in ✓. *(`Send PO` was retired 2026-07-29 and `Prepare PO` on 2026-07-30 — raising a PO is ONE act.)* **The words come from docs/COPY-STANDARD.md, never from here.** The call goes through each supplier's WhatsApp GROUP, REF-led (CR/TCF doc-no, NEVER the SO). Consolidated PO, the monthly PO-duty rotation and every purchasing number → **`docs/purchasing/MASTER.md`**, which is the only home for them.
- **送 DELIVERY** (logistics company): unassigned → `Assign logistics` · assigned/not confirmed → `Call {logistics} — confirm delivery date` · customer confirmed ✓. **The words come from docs/COPY-STANDARD.md, never from here.** `assign` = WE pick the carrier; `booked` = the PARTNER fixed a slot with the customer. NETS is the main partner.
- **钱 MONEY** (customer): balance / storage owing → `Collect RM {amount}`, and the money hold rides that same action (C3 retired the bare `Confirm`). **The words come from docs/COPY-STANDARD.md, never from here.** Storage: MS/BF RM150 per commenced 30-day month · Sofa free 14 days then a one-time RM200 (`computeStorageFee`).

## State vocabulary — use THESE words only (never leak DB stage words)
The customer/Jess-facing pipeline has exactly **5** words. The DB `operation_stage`
enum (`placed / confirmed / in_production / ready_to_dispatch / dispatched / delivered`)
is INTERNAL plumbing — **never show it to Jess or a user**; map to the 5 words.

| Word (STATUS column) | Plain meaning | Means "done"? |
|---|---|---|
| **Placed** | native POS order, not yet proceeded | no |
| **Proceed** | order accepted / in the pipeline (= DB `confirmed`) | no |
| **Pending** | still waiting on stock OR a delivery slot | no |
| **Scheduled** | stock IN (Ready) **AND** a delivery slot booked | no — about to deliver |
| **Delivered** | delivered to the customer | **YES = done** |

- **ETA** (STOCK column) = the supplier's promised date the goods land at the warehouse (货 side). Feeds "stock Ready".
- **Confirm** (green Manage pill) = the closing ACTION (both tracks done → click to close). NOT the DB `confirmed` stage. If this word ever confuses, it may be renamed `Close`/`Complete` (Jess's call).
- **Delivered = closed** (guardrail #2): no red alarm, no chase; the **Manage cell is BLANK** on a delivered order (a "Done" pill was redundant).
- **Scheduled is near-empty in prod because delivery slots aren't recorded** (1 of 55 open orders has a booked `logistic_eta`), NOT a UI bug — it fills as slots get booked.

## Manage column = tone-coloured pills (one language)
danger→`pill-overdue` (red) · warning/info→`pill-warning` (amber) · success→`pill-confirmed` (green) · neutral→`pill-neutral` (grey) · money→`pill-collected` (indigo `Collect $`). **Blue is SELECTION only — never an action pill.**

## Deploy (one owner, both chats agreed)
Branch `feat/orders-drawer` ONLY, never `main` (main lacks in-flight work → clobbers). ONE owner deploys. Deploy = api Worker `wrangler deploy` (apps/api) + web `pnpm --filter @carres/web build` → `wrangler pages deploy dist` to BOTH `carres-portal` (erp) AND `carres-pos` (pos), `--branch=main`, one dist two projects; scan dist for `SERVICE_ROLE` (must be 0). `wrangler` lives in apps/api. After: `curl erp/pos | grep index-*.js` to confirm YOUR bundle is the top Production entry; **pos edge lag ~15s** (first curl shows the old bundle — wait + re-curl + `wrangler pages deployment list`). **`git add` ONLY your own paths** — the branch is shared. erp link to paste to Jess (she hates window-switching): https://erp.carresofficial.com/operation/orders

## Every approved change
`tsc -p tsconfig.app.json` + `check:v4` + `lint` + tests (the ~16 pre-existing web fails are the BASELINE — don't chase them) → commit + push → deploy → verify → update `docs/UI-KIT.md` + this doc. Prefer many small commits.
