# CHECKPOINT — Purchasing · To Order

> **Handover, updated 2026-08-01 (seventh session — the FINAL freeze deployed;
> the mission of the NEXT chat is to COMPLETE this page).** Overwritten in
> place; there is never a second version of this file.
>
> **⭐ WHO YOU ARE TALKING TO IN THE NEXT CHAT: JESS — the boss.** Her rules,
> verbatim from the handover order:
> 1. **Follow what she wants FIRST.** You may REMIND her of UI-KIT or any
>    older rule (one short line, with the cost), but her word overrides —
>    never cite a doc as a reason not to do what she asked.
> 2. **Always be an international-grade critic WITH solutions** — analyse,
>    name the flaws, bring the fix. Never a yes-man, never a menu of options
>    without a recommendation.
> 3. **Only answer her.** No side quests, no unrequested scope.
> 4. **Amendments continue in the new chat** — the page is live but NOT
>    finished; expect further redesign rounds in the same rhythm:
>    **ASCII first → her yes → build → localhost:5221 → her yes → deploy.**
>    (Launch entry `web-planning`; a fresh worktree needs
>    `apps/web/.env.local` copied from the main checkout or login fails.)
> 5. Paste PR links bare; after every deploy paste the erp link.
> Deploy state is §15. Five designs were discarded in ONE day at zero cost
> because none was deployed before her yes — keep it that way.

---

## 0A · THE FROZEN RULINGS (Loo/Jess, 2026-07-31 → 08-01 — each layer OVERWRITES the older ones)

**Division of responsibility:** To Order DECIDES which customer orders become
purchase orders today. Purchase Orders MANAGES the documents once they exist
(preview · communication · audit · PDF · WhatsApp · revision · ready date —
ALL of it, there). The word `Proposal` left the UI.

**THE GOLDEN RULE:** *the planning engine owns the schedule; operators own
the Purchase Order; operators never choose the next purchasing run — they
change the business requirement and the engine recalculates.* Hold · Skip ·
Next Run · Delay · Postpone · Move-to-Monday are banned forever. The two
real exceptions (`Change Required Date` — never touches
`orders.delivery_date` — and `Cancel Purchase`) need stored state: future
card.

**The page (deployed, the final freeze):**

```
LEFT  = ACTION LAUNCHER (Linear density, 200px, ~30px rows, no heading):
        Today · Mattress · Bedframe · Sofa — live counts that FALL as POs
        are created; clicking filters the grid
        + Create Purchase — a REAL dialog from day one (below)
        the Issue pill — exists ONLY while something is selected:
        `3 SO selected · → 2 Purchase Orders · [+ Issue Purchase Orders]`
RIGHT = the GitHub-Projects grid (kit DataTable, 40px rows), SIX columns
        FROZEN: ☑ · Preferred Delivery · SO No. · Model · Qty · PO No.
        No Customer (noise), no Category (the launcher said it), and
        **ORDER BY NEVER REACHES THE SCREEN** — the operator sees the
        CUSTOMER's date only (`ToOrderRow.delivery`, new on the wire),
        red when past, overdue-first then soonest. PO No. rightmost =
        "did today's order happen": `—`, then the number, in place.
TOP   = the Orders page's own strip (breadcrumb `Purchasing › To Order` +
        the SHARED TopBarIcons) · tabs · NO H1 anywhere (test-pinned) ·
        pill-shaped search (kit SearchInput `pill` shape) above the grid.
```

**Issue — zero popups, zero toasts (his own flow, verbatim built):** pill →
`Creating…` → one POST per supplier×category (ARRANGEMENT only — no sku/qty/
price; destination = the engine's DEFAULT, per-PO confirmation lives on the
generated documents) → **rows update IN PLACE** (☑ gone, PO No. a clickable
link) → launcher counts drop → bottom bar (exists only while it has
something to say): `3 Purchase Orders Created · Continue in Purchase Orders
→`. A partial failure STAYS in the bar with `Retry` (retries only the
failed group) until it succeeds. Toast is banned for this action — the
grid, the launcher and the bar are the notification.

**`+ Create Purchase` (the manual entrance — may NEVER be missing):** opens
a dialog — Reason ▾ (Ready Stock · Display · Warranty · Spare Parts ·
Office · Other…) · Supplier ▾ · Item 🔍 · Qty · Remark. **Category is never
asked** (it comes from the Item Master). Reason is part of the FORM, never
navigation — the launcher never grows a row per source. v1: `Create` is
disabled and reads `Available in next update.`

**The v2 data ruling (Loo, named it himself): `purchase_demands`** — ONE
unified demand table. Customer Orders flow in, Create Purchase flows in,
ONE engine eats it, no second pipeline ever. Manual demand with no
`Required By` goes straight into Today; with one, the engine plans it.

**Portal Grid Workspace standard (for Purchase Orders · Receiving · Claims ·
Payments):** Orders' own top strip · tabs carry no action/KPI/H1 · the grid
is the only scroll area · page actions appear only once BUILT (no dead
controls; `Create` in the dialog is the deliberate exception — it is
disabled AND says why) · no Refresh (the plan updates itself) · style DNA =
left Linear, right GitHub Projects (70/30).

## 0 · On screen now (deployed, PR #546)

`OperationToOrder.tsx`, one file, assembly only — exactly §0A. Blocked
demand (no production days) is currently NOT listed (the engine cannot
issue it); whether it needs a voice on this page again is a question for
Jess. Search lives above the grid (pill shape). The `Move ⋮⋮` column from an
earlier sketch is NOT in the frozen six — returns only if she asks.

## 1 · Business logic that must be kept

- `packages/shared/src/to-order.ts` — projection + **TO_ORDER_WORDS (the ONE
  word list)**; `ToOrderRow.delivery` = the customer's date (earliest
  deadline across the order's lines). Composers: `ordersHeadline` ·
  `soSelectedShort` · `posCreatedLine` · `purchaseOrderCount` ·
  `railItemLabel`/`sizeShort` · `countItems`.
- `to-order-preview.ts` — arrangement machine (+ `excluded`/`effectiveDocs`
  half, tested); the page currently uses `defaultDocuments` directly; the
  machine is v2 split's engine.
- The write contract, unchanged and not to be widened:
  `POST /api/operation/purchase/to-order/issue` `{supplierId, category,
  destinationId, purchaseOrders:[{key,include,buildKeys}]}` — the batch is N
  of these, sequential, negative-controlled to carry no sku/qty/cost/price.
- Kit: `SearchInput` `pill` shape (controlClass's third shape) · empty/
  loading states render through `Card`.

## 5 · Words owed to COPY-STANDARD (ruled by Loo 2026-08-01, on screen)

`Today` · `{n} Orders` · `Preferred Delivery` · `SO No.` · `Model` · `Qty` ·
`PO No.` · `Select` · `{n} SO selected` · `Issue Purchase Orders` ·
`Creating Purchase Orders…` · `{n} Purchase Orders Created` ·
`Continue in Purchase Orders` · `Retry` · `failed` · `Create Purchase` ·
`Reason` · `Ready Stock` · `Display` · `Warranty` · `Spare Parts` ·
`Office` · `Other…` · `Supplier` · `Item` · `Search item…` · `Remark` ·
`Cancel` · `Create` · `Available in next update.` · `Purchasing › To Order`.
Retired this day: the whole lens/views/group vocabulary · `Order today` ·
`Needs setup` · `cannot be planned` · `Ready to issue` · bucket words ·
`Planning & Audit` · `System generated from` · `Refresh` · `becomes N POs`.

## 9 · Rules that survive, and cost real money when broken

All prior entries stand (`.in()` SKU trap · surprising number = measurement
to check · negative control must fail · one fact one home · after a squash
cut fresh from main · date-fused fixtures die at month-end · fresh worktree
needs `.env.local`). New today:
- **`grep -c` returning 0 exits 1 and silently breaks a `&&` deploy chain** —
  the deploy commands after it never ran; caught because the deploy output
  was missing, not by luck.
- **The ratchet catches real drift**: a 12px icon, a page-drawn white box
  (→ kit `Card`), a duplicated ≥40-char class string — all forced back the
  same day.

## 12 · Columns and tables that do not exist

`purchase_demands` (v2 — THE unified demand store) · a purchasing
required-date override + cancel record (the two exceptions) · a destination
meaning "this PO's customer" (split/direct delivery) · `po_sends` ·
suppliers address/tel/attn/terms · an audit row from
`operation_create_pos_batch` (measured: none).

## 14 · Baselines (on the deployed tip `398f50d0`, 2026-08-01)

| | |
|---|---|
| shared | **2023/2023** |
| api | 3 pre-existing · `to-order.test.ts` 27/27 |
| web | 16 documented + 10 date-rollover (both pre-existing; fix chip spawned). Page suite **13/13** · preview 4/4 · kit 115. |
| tsc | web clean · api 4 pre-existing |
| design-standard | **8438** — the ratchet may never rise |

## 15 · Deployed

```
Main tip     398f50d0 (PR #546 — the final freeze; #544/#545 earlier today)
Web bundle   index-_7KYlTnP.js · 4,596,976 bytes · SERVICE_ROLE 0
             carres-portal 24137015 + carres-pos 569c9deb, --branch=main
             ALL 4 canonicals converged on the FIRST poll
             live bundle md5-identical to the local build (f7e2e768…)
API Worker   f203d77e — --env production (shared changed: delivery on the
             wire + the word overhaul); bindings echoed; /health 200
Migration    none
Bundle grep  vs live predecessor index-DrcPnNxZ.js (downloaded before the
             deploy replaced it). NEW: Preferred Delivery · Available in
             next update. · Issue Purchase Orders · to-order-issue-pill ·
             to-order-create-purchase · Continue in Purchase Orders ·
             SO No. · to-order-cat-today each 0→1 · PO No. 3→4.
             RETIRED: Order today · to-order-panel · to-order-batch-bar ·
             cannot be planned each 1→0.
```

**Next for the NEW chat (Jess), in her order — she will amend more:**
1. Whatever she asks first — the page is hers to finish.
2. v2 `purchase_demands` (the dialog's real Save + engine intake + a
   migration, drafted per guardrail #8: tracker tail before numbering).
3. `Move ⋮⋮` / own-PO split + per-PO destination + the customer-address
   destination column (direct delivery's door).
4. Ordered Today / This Week queries (probably the Purchase Orders page).
5. `Change Required Date` / `Cancel Purchase` (storage + reasons).
6. Blocked demand's voice (`Needs setup` died with the views — does it need
   a new home?); the Orders-page migration onto the Portal Grid Workspace
   standard (LAST); rewrite `03-page-patterns.md`'s stale To Order example;
   COPY-STANDARD intake of §5's words.
