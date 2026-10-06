# Carres Operation — design brief

| Field | Value |
|---|---|
| Date | 2026-10-06 |
| Git commit (main this brief was written from) | 8d2a72414 |
| What changed since last version | First version |
| Audience | A designer (another Claude). Business rules only; old page layouts are not design rules |

## Business direction (owner, Jess chat 2026-10-06)
| Fact | Source |
|---|---|
| Carres sells outright today; a young company | Jess chat 2026-10-06 |
| Many dealers NOT owned by Carres; a few own showrooms (PJ now, Puchong coming) | Jess chat 2026-10-06 |
| Subscription starts November 2026 under a NEW brand, separate from outright | Jess chat 2026-10-06 |

## Files
| File | What it holds | Rows / objects |
|---|---|---|
| roles.md | Role · duty · daily jobs · cover | 31 |
| actions.json | Every Work action with steps, done-when, owner, deadline, status | 52 |
| pages.md | Operator destinations · purpose · status | 64 |
| records.md | SO · PO · GRN · DO · Payment · Service Case fields and exact statuses | see file |
| approvals.md | What needs approval · who · limit | 22 |
| words.md | Exact UI words and banned / retired words | see file |
| sample-data.json | Anonymised production test data | 20 orders · 10 POs · 6 staff |
| dont-copy.md | Old patterns the owner rejected | 22 |
| unknowns.md | Gaps with the question for Jess | 33 |

## Labels
BUILT = in code on main · APPROVED = written in a MASTER, may not be built · PROPOSAL = not approved. Every fact cites path:line; "UNKNOWN — ask Jess" marks a gap listed in unknowns.md.

## Doubts (after re-checking every cited line)
- Caller-relayed ruling 2026-10-06 "ask_delivery_date stays in the Sales Portal, never Operation" is not written in any MASTER on main 8d2a72414; code still emits it to Operation Work (apps/api/src/routes/operation/work.ts:1797).
- PR #1966 (automatic PO/GRN leave cover) could not be verified from repository files; only the APPROVED / NOT BUILT text exists (docs/ERP-ARCHITECTURE.md:252).
- Workspace §6.1 still says claims / Repair Order / Purchase Return rules are "BUILT ON BRANCH 2026-09-29", but main emits them (apps/api/src/routes/operation/work.ts:1817-1819); the MASTER text is stale.
- delay_planning owner: code uses order_pic (packages/shared/src/work-engine.ts:153); Workspace says "Responsible Delivery Operation" (docs/workspace/MASTER.md:2357); probably the same person, not proven.
- assign_logistics has three deadlines: built code = PO issue day (work-engine.ts:841), registry text = 3 working days before promised (work-engine.ts:177), approved target = opens on PO day, late 3 Delivery working days before Scheduled/Requested (docs/delivery/MASTER.md:160).
- confirm_delivery_date registry text says 3 working days (work-engine.ts:189) but the due code uses the 2-working-day check (work-engine.ts:849); actions.json follows the code and Delivery MASTER:478.
- arrange_new_delivery_date: code and Orders need date AND slot (work-engine.ts:167; orders/MASTER.md:6168) but Workspace says time is optional (workspace/MASTER.md:2367).
- receiving.check_in owner: built = GRN Duty (work-engine.ts:461); approved target = authorised Warehouse individual for physical confirmation (workspace/MASTER.md:2365).
- collect_loan_item owner: COPY-STANDARD.md:3806 still names the delivery_duty rule; code uses responsible_operation (work-engine.ts:268).
- resolve_payment_exception: COPY says `Resolve the payment exception` and "the Finance owner" (COPY-STANDARD.md:3807); Payment MASTER says `Review payment evidence` and Finance Control Duty (payment/MASTER.md:715).
- manual_purchase.approve label: COPY says `Approve the purchase` (COPY-STANDARD.md:1306); code and Purchasing say `Approve purchase` (work-engine.ts:314; purchasing/MASTER.md:7752).
- deliver_today label: COPY says `Deliver on {weekday, date}` (COPY-STANDARD.md:972); code queue word is `Deliver today` (order-action-words.ts:279).
- confirm_tomorrows_delivery: older two answers `It arrives on {date}` / `It arrives later than {date}` (COPY-STANDARD.md:929) conflict with the newer per-line `Record supplier answer` options (COPY-STANDARD.md:221); actions.json uses the newer one.
- label_exact uses the Work action sentence where COPY gives one, but COPY-STANDARD.md:3798 says Work line 1 is the queue word; which one is "the label" needs a design decision.
- Steps were written from MASTER/COPY text, not from walking current screens; some steps describe APPROVED / NOT BUILT behaviour (e.g. actual delivery date required, delivery/MASTER.md:568).
- The allowed input_type list has no text or time type, so reasons, notes and agreed times are folded into choice/date steps.
- `options: []` on a choice step means the list is configuration (Logistics Partners, payment methods, Units) or was not found in the sources.
- service.customer_confirm step word `Record customer confirmed` comes from a PROPOSAL journey section (service/MASTER.md:646).
- service.decide_remedy remedy/movement words sit under the §7 PROPOSAL header (service/MASTER.md:396) although the approval scope itself is approved (service/MASTER.md:520).
- The APPROVED vs PROPOSAL split of service actions rests on my reading of which clocks service/MASTER.md:592 approves and :619 leaves as proposal.
- Issue Tracker `current_action` items are emitted (work.ts:1782) but the Issue Tracker MASTER was outside the source list, so they are in roles.md only, not actions.json.
- actions.json carries one extra field, `work_feed`, so BUILT-but-not-emitted rules are not mistaken for live Work items.
- receiving.check_in next_action_key points to purchasing.confirm_balance_delivery_date, which is registered but NOT EMITTED.
- payment.check_stored_furniture: projectStorageCheckWork is defined (work.ts:1570) but grep found no call; marked NOT EMITTED.
- Manual Purchase approver in the feed comes from `manual.approvers?.[0]` (work.ts:1747); not proven to equal the Shared Duty Resolver result.
- CLAUDE.md:17 says nine roles use the portal; code has eleven account roles (principal-accounts.ts:29).
- Payment Approver, Storage Waiver, Delivery Charge, Stock Adjustment and Service Case Approver are offered to operation accounts only by the catalogue default (workspace-duties-catalogue.ts:41); no MASTER confirms that role choice.
- | # | Doubt |
- |---|---|
- | 1 | CLAUDE.md:626 says "the seven verbs", but docs/COPY-STANDARD.md:1819 and :1905-1915 rule NINE (Assign · Call · Issue · Upload · Close · Return · Check · Approve · Decide); words.md lists nine. |
- | 2 | The IA tree docs/ERP-ARCHITECTURE.md:381-433 (2026-08-13) is older than the 2026-09-23 Sales navigation and the 2026-10-02 Showroom ruling; pages.md follows the built nav and newer rulings where they differ. |
- | 3 | Manual Purchase page name: portal-nav.ts:419 and docs/purchasing/MASTER.md:2098 say `Manual Purchase Request`; docs/ERP-ARCHITECTURE.md:398 and the comment at portal-nav.ts:393 say `Manual Purchase`; pages.md uses `Manual Purchase Request`. |
- | 4 | Repair Orders: CLAUDE.md:110 says the page is still `Coming soon`, but OperationApp.tsx:615 mounts a 327-line page and portal-nav.ts:446 has no `soon` flag; marked BUILT by the route rule only. |
- | 5 | Issue Tracker: CLAUDE.md:122 says final UI not approved and implementation not authorised, yet OperationApp.tsx:550 has a route; marked BUILT by the route rule only. |
- | 6 | Dashboard: a route exists (OperationApp.tsx:578), but docs/workspace/MASTER.md:2465 says the Dashboard is built after module projections are stable; whether today's page matches §8 was not checked. |
- | 7 | Customer money word is scoped by surface: `Outstanding` on the SO register (COPY:2615, :2641) but `Balance due` / `RM {amount} unpaid` on Payment and Work (COPY:2673), where `Outstanding` is a do-not-use (COPY:2687). |
- | 8 | docs/workspace/MASTER.md:1606 removed `1, 2, 3` badges from checklist items, but :1610 says each open act is "headed by its number badge"; unclear whether number badges survive in the record panel. |
- | 9 | sample-data.json keeps SO numbers as stored integers (`orders.so`); the approved display `SO2609-4827(1)` is NOT BUILT (docs/orders/MASTER.md:462,474); DO-130926-3223 is an older DO format. |
- | 10 | sample-data.json gives only stored PO status (`open` / `received`); the visible PO label (COPY:3127-3131) depends on sending and receipt evidence and was not computed. |
- | 11 | sample-data.json uses `Salesperson A`–`E` (not `Staff`) so salespeople stay distinct from the 6 operation staff. |
- | 12 | Only 2 of the 6 operation users are real persons (`is_person`); this month's duties are PO Duty and GRN Duty only; three approver duties are held by a principal user outside the staff list. |
- | 13 | Test-data oddities kept as real: SO 1363 paid 4654 above total 4404; SO 1312 is an `AutoCount Archive` row with no Proceed Date; PO-SMOKE-W and SKU TEST-RENTAL-K are test rows. |
- | 14 | Four Ohana POs in sample-data.json have `supplier_deliver_to` = `Ohana` (the supplier's own name); kept exactly as stored. |
- | 15 | records.md DO fields come from the DO register default columns (docs/delivery/MASTER.md:1570-1572); the brief does not adopt that column order. |
- | 16 | GRN, Purchase Order, Payment Record and Service Case object pages are `?param` views inside their register routes, not separate routes. |
- | 17 | `Out for delivery` is kept on the DO document ladder (docs/delivery/MASTER.md:1575) but retired on Monitor (:1398, :1425); two vocabularies on purpose, easy to mix up. |
- | 18 | Service MASTER §7 is PROPOSAL / NOT LAW (docs/service/MASTER.md:396) yet contains RULING lines (e.g. :473); records.md labels each line separately. |
- | 20 | Purchasing report, Delivery report and Receiving & Inbound report purposes are taken from COPY section headings, not from a module page definition. |
