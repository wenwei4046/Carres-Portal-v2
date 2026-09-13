# DELIVERY — CARD 09 · Monitor status dictionary and two-line Work sentences

> Module **DELIVERY** · Card **09** · authored 2026-09-13 under the BUILD/DELIVERY takeover of the
> owner-approved Delivery Blueprint (PR #1255, #1256). Steps use checkbox syntax for tracking.

**Goal:** Replace the seven-word Monitor status ladder with the actor-first dictionary of Delivery MASTER §8.4 in the one arithmetic, and give every Delivery Work sentence its two structured lines (act with recipient, required result) with no em dash.

**Authority:** `docs/delivery/MASTER.md` §8.4, §10 · `docs/COPY-STANDARD.md` Delivery status words, the Monitor register, status and Payment words, the ORDERS + DELIVERY dictionary rows · `docs/ui/MASTER.md` §5. The approved MASTER decides the design; this Card adds no design of its own.

**Dependencies:** Card 08 (owner avatar on Delivery Work).

**Runtime readers and writers affected:** Readers/writers: `packages/shared/src/delivery-work-status.ts` (rewrite) · `order-action-words.ts` (`orderActionLines`) · `work-engine.ts` · `apps/api/src/routes/operation/work.ts` · `apps/web/src/pages/operation/OperationDelivery.tsx`, `delivery-work.ts`, `delivery-monitor.ts`, `OperationWork.tsx`, `OperationOrdersControl.tsx`, `DeliveryOrderPage.tsx`, partner pages that print delivery action lines.

**Migrations required:** none.

**Production acceptance surface:** Production Monitor `Delivery Status` column, the `DELIVERY STATUS` dropdown and the calendar card print only §8.4 words; `Work` rows for Delivery print two lines; no `—` in any Delivery Work line; the Delivery Orders register still prints the document ladder.

## Global constraints

- Reuse existing Carres components, arithmetics and write doors; no duplicate quantity, owner, duty, date, payment or stock truth.
- Every visible word comes from `docs/COPY-STANDARD.md`; dates through `fmtDate`; no em dash joins a Delivery Work sentence.
- No `New DO`, `Issue`, `Release` or `Approve` control; no new payment exception or COD door; no Delivery-local roster; no Operations Superuser fallback.
- Loading, error, empty and no-results states, keyboard and focus, responsive behaviour, permissions and proxy-recording boundaries are tested.
- A Card is complete only after PR merge, exact-SHA deployment and authenticated production verification with the resulting records re-read.

## Tasks

- [x] Rewrite `deliveryWorkStatusOf` inputs and words; retire the seven words with a test that names them
- [x] Add `orderActionLines` and rewrite every Delivery key's line; keep `orderActionLine` for non-Delivery keys
- [x] Render two lines on Work rows, the Orders list Actions cell and the DO page for Delivery keys
- [x] Wire the `DELIVERY STATUS` dropdown and the calendar card to the new words
- [x] Tests: status arithmetic per state, word bans, two-line rendering; typecheck; design guard
- [x] PR → merge → deploy → authenticated production verification on real rows

**Evidence (2026-09-13):** PR #1262 squash-merged as `11952e86`; Pages `/__carres_deploy.json` and Worker `/health` both report `11952e86`. Authenticated as operation@carres.com: Monitor `Work to do` lists 89 rows and prints none of the retired words (`Waiting for customer date` · `Delivery confirmed` · `Waiting for warehouse` · `Ready for handover` · `Out for delivery`); `Work → Team Work` prints 99 Delivery rows as two lines (`Call NETS` ×46 over `Confirm the delivery date`, `Assign logistics` over `Choose the company that carries this delivery`) with a result line on every row and no `Call … —` Delivery line; the only remaining `Call … —` sentences on the page are Purchasing's `Call Ohana — confirm tomorrow's delivery`, outside this ruling. The `Delivery Status` column becomes a default column in Card 10.
