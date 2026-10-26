# FINANCE — MASTER

> **Status 2026-10-03: PR #1864 DEPLOYED** (merge `030ea3d8c`). Chew chose to test on production (no separate test database) and approved going live: the work below is on production, and its migrations 0635–0648 were applied through the governed path. Chew tests everything once, on production; that walk is owed. §4's menu (one row per report, the Forecast row, the area fold) is PR #1865, merged 2026-10-05 (`37405f70`).
>
> **Who approves Finance's production changes.** Chew approves Finance's own production database changes and their release; he holds that permission for the Finance module (Chew 2026-10-03). ENGINEERING.md names Jess for migration approval; that was raised with Chew, who confirmed his authority over Finance's own changes. A change outside Finance still goes to Jess.
>
> | Delivered in PR #1864 | Migration |
> |---|---|
> | One person may check and approve a voucher (§2) | 0635 |
> | Finance menu modules (§4; regrouped by PR #1865) | none |
> | Suppliers: Finance's own tax and bank details, and `Pay to` on a voucher (§3.2) | 0636 |
> | Daily Bank (§3.4) | 0637 |
> | Cash Flow (§3.6) | 0638 |
> | General Ledger (§3.6, §4) | 0639 |
> | AP Aging (§3.6) | 0640 |
> | Card money waiting (§3.4) | 0641 |
> | Supplier credit notes (§3.2) | 0642 |
> | Bill scanning: `Read the bill` and `Read the credit note` (§3.2); OFF until the AI key is given | none |
> | Stock value, provisional (§3.5) | 0643 |
> | Collection report (§3.6) | 0644 |
> | Payment requests, with the one shared-menu entry (§3.3) | 0645 |
> | Forecast (§3.6), built last | 0646 |
> | Fix: a credit note follows a renumbered account (§3.2) | 0647 |
> | Payment requests: Finance also ticks who may ask (§3.3) | 0648 |
>
> Their on-screen words are in COPY-STANDARD "Finance (Chew)"; those marked PROPOSAL wait for Chew.
>
> **Whose decisions these are.** Every decision here was made by **Chew** (Finance) in chat on 2026-10-03 and written down at Chew's request. They are **not** Jess's owner rulings.
>
> **Conflicts.** Where a line here meets a Jess ruling (CLAUDE.md or another module MASTER), **the Jess ruling wins** and the question goes back to Chew. Subscription and Dealer are the exception: they are Chew's since 2026-10-07 (§1, "Subscription and Dealer are Chew's too"), so inside them an earlier Jess ruling gives way to Chew's once the conflict has been shown to Chew.
>
> **Reference.** The Houzs Finance Specification V5 (2026-10-02) is **evidence, not specification**. Per the CLAUDE.md Decision Gate, external systems are evidence. The spec's own instruction to "follow its rules" does not apply here. Chew keeps the spec locally. It is **not** in this public repository, because it holds another company's internal figures.

## 0 · The business, as Finance records it (Chew 2026-10-06)

Carres buys and sells furniture through three channels (「我们的生意是买卖家私，只是渠道不一样」):

1. **Showroom:** Carres staff sell directly.
2. **Dealer:** a dealer sells; the customer pays HQ; the dealer earns commission, the renovation rebate and the KPI allowance.
3. **Subscription:** the customer pays monthly; part of each month goes to the supplier (Diglant) and part to commission.

Finance must show clearly where each sum of money comes in and goes out, channel by channel (「我finance 这里记录需要分的很清楚这笔钱是从哪里进哪里出」). Measured: since 0540 every income and expense line carries a department. A department is a showroom outlet, a dealer, Subscription, or Office; Office carries costs only. Sales invoices, customer payments and rental collections take their department from the order. The four hand-made documents (supplier bill, payment voucher, other debtor invoice, other receipt) are set line by line. The P&L and other reports filter by department. Chew's rulings, 2026-10-06:
1. Cash flow is split by channel (「现金留要能分起来」).
2. A supplier bill's channel comes from the order its goods were bought for, never typed by hand (「不应该经过人手，而是根据订单决定」).
3. Office costs stay in Office.
4. The channel follows the debtor account (「根据debtor account 来决定」); Chew provides the chart of accounts.
5. Transport is recorded as a cost of each order even though customers pay nothing for it and Carres bears it (「虽然是我们出，但是还是要记录运输费用啊，根据订单」). The logistics partner's bill is split by the delivery orders it lists; a bill with only a total is split equally (「如果一个总数就平除」).
6. Debtors follow the channel in two levels for dealers (「Dealer 一个overall 母账，然后每个dealer under 这个母账 … 就是两层了」): Dealer Debtors, then each dealer, then that dealer's customers or orders. Showroom and Subscription each have one control account with their customers under it.
7. Goods bought without an order must not leave money paid to suppliers outside every channel in Receipts & Payments (「这样我看receipt & payment 就不太对了」); Chew confirmed how such a purchase is placed on 2026-10-06 ("A purchase without an order" below).

Status (2026-10-12): ruling 3 holds (a line can be set to Office). Ruling 2 and "A purchase without an order" are BUILT for a bill's goods lines (0683, "Splitting the money by channel" step 1); ruling 1 is BUILT in Cash Flow (0684, step 2). Ruling 5 is BUILT for a logistics company's bill, line by delivery order (0689, step 4). Rulings 4 and 6 are BUILT and applied (0685, step 3; Chew told Jess and approved applying it on 2026-10-12, 「可以套用」). The plan for all of them, "Splitting the money by channel" at the end of this section, was approved by Chew on 2026-10-12.

**Chart of accounts (Chew's, AutoCount, dated 22 Sep 2026; kept by Chew, not in this repository).** It has one debtor control (Trade Debtors) and one Other Debtor control, so dealer and subscription customers are not separated (「本身里面没有分dealer customer 和 subscription customer」). Measured: the ledger already accepts its code shape (`ledgerAccountCodeShape`, for example 300-0000 and 900-A001). Customers sit under a control account as parties on each line (`gl_entry_lines.party_type` / `party_id`), not as accounts, so a control account holds any number of customers.

Chew's answers on the chart, 2026-10-06:
- **Debtor controls as proposed:** 300-1000 Showroom Debtors, 300-2000 Dealer Debtors with one control per dealer under it, 300-3000 Subscription Debtors, all under 300-0000 Trade Debtors.
- **500-2000** is subscription rental income.
- **560-0000 "Agents Subscription Fees"** is small fees Carres pays agents. It stays under Other Incomes: its normal side is credit, and a debit larger than the credits shows as a negative figure there, as AutoCount does (Chew 2026-10-06).
- **Diglant's subscription share** is a cost of goods sold account, not opened yet.
- **What Carres owes Diglant for subscription** stays out of 400-0000 Trade Creditors, which is for buying goods (「这个是我和supplier 买货的，不要参」).
- **Dealer commission** is accrued (see Dealer commission rules).
- **The renovation rebate is accrued the same way** (「装修回扣这样记可以」): at month end Dr a new Commission - Dealer Renovation Rebate expense (proposed 900-C008), Cr a new Accruals - Dealer Renovation Rebate (proposed 410-0064). The monthly payment voucher clears it. It never mixes with Carres's own renovation (200-4000, 340-0001). The KPI allowance follows the same pattern (900-C009 / 410-0065), confirmed below.

**Account mapping, Chew's answers 2026-10-06** (the mapping table is being confirmed line by line):
- Banks are Maybank, Hong Leong, RHB and Alliance Bank only. The test chart's "Bank — current account" and Public Bank go.
- Every way of receiving money that waits before reaching the bank gets its own clearing account (「card & online clearing是每个收钱途径都要」): the Public Bank, GHL, Hong Leong and Maybank card machines, AhaPay (rarely used now, but kept as a card merchant) and Stripe. DuitNow QR and FPX go straight into the bank, so they have none.
- A card instalment plan needs nothing of its own: the card company pays the full amount at once, less a higher fee.
- Service charges (disposal, no-lift), storage charges and the 15-year guarantee are each their own income account. After-sales and warranty cost is its own expense account.
- The 15-year guarantee is income in full when it is sold, not spread over the years (「15年保固费不需要慢慢转一部分进收入」).
- No supplier claims account. A claim is settled by a supplier credit note on that supplier's own account.
- No Deposit - suppliers account. A payment made before the bill stays on that supplier's own account, as in AutoCount (「照理也是扣在供应商的户口」). The Balance Sheet's separate asset line for suppliers paid ahead (0507, YH 2026-09-14) goes when the Balance Sheet is next changed.
- An opening-balance account is opened for go-live only. Once every balance is in, it is zero, so it should never appear (「可以，但我认为不应该会出现」).
- Chew, 2026-10-07: a bill that is not for goods goes to `405-0000` Others Creditors, and `460-0000` stays for the ESH injection only (「是」). Transport on purchases goes to `630-0000`; `615-0000` is not used (「630-0000」). `500-1000` Cash Sales is normally not used (「正常不会使用」). Subscription customers transfer into Hong Leong Bank, kept as a setting Chew can change (「HLBB 但要能maintain」).

**The account mapping — approved by Chew 2026-10-07 (「可以」); the chart is BUILT (PR #1977, 0654 and 0655 APPLIED 2026-10-07), the postings by item group are BUILT (0659, see Item groups below), by merchant BUILT (0660 APPLIED 2026-10-08, see How money is recorded below).** New accounts are marked new; the rest are in Chew's AutoCount chart.

| Kind | Accounts |
|---|---|
| Money | Cash `320-0000`. Banks `310-1000` Alliance, `310-2000` Hong Leong, `310-3000` RHB, `310-4000` Maybank. New `315-0000` Card & online clearing: `315-1000` Public Bank card machine, `315-2000` GHL, `315-3000` Hong Leong card machine, `315-4000` Maybank card machine, `315-5000` Stripe, `315-6000` AhaPay. |
| Customers | `300-0000` Trade debtors, with new `300-1000` Showroom, `300-2000` Dealer (one per dealer, `300-2001` and on, its customers under it) and `300-3000` Subscription (one per customer). Other debtors `305-0000`. Related companies `350-00xx`. Stock `330-0000`. |
| Owed | Suppliers `400-0000` (advances stay here). Non-goods bills `405-0000`. ESH injection only `460-0000`. New `401-0000` Subscription creditors (Diglant's share). Accruals `410-0063`. Commission accrued: dealer `410-0061`, agent `410-0060`; new renovation rebate `410-0064`, KPI `410-0065`. Deposits received `440-0000`. Sales tax `430-0000`. Directors `450-00xx`, `470-0000`. |
| Equity | Capital `100-0000`. Retained earnings `150-0000`. New `160-0000` Opening balance, used at go-live only and zero after. |
| Income | Sales `500-0000`, also a returned mattress sold again. New `500-2000` Subscription (monthly fees and the RM 1 sale), `500-3000` Service charges, `500-4000` Storage charges, `500-5000` 15-year guarantee. Interest `530-0000`. Additional income `580-0000`, including termination and loss compensation. Agents' small fees `560-0000` on the debit side. `500-1000` Cash sales normally unused. |
| Cost | Purchases `610-00xx` by item group. New `604-0000` Cost of service (service and guarantee items). Purchase returns and supplier credit notes `612-0000`. Purchase transport `630-0000` (`615-0000` unused). New `610-0090` Diglant's share. |
| Expense | Delivery transport `900-T002`. Commission: dealer `900-C007`, agent `900-C004`, showroom `900-C006`. New renovation rebate `900-C008`, KPI `900-C009`, warranty and after-sales `900-W005`, bad debts `900-B002`. Bank and card charges `902-0000`. Other expenses: the `900-xxxx` account chosen on the bill. |

**How the chart is loaded — BUILT (PR #1977, merged 2026-10-07 as `6f5f68b9`); 0654 and 0655 APPLIED 2026-10-07 with Chew's OK (「可以，套用吧」); Chew's PDF IMPORTED 2026-10-07.** Chew asked for his AutoCount PDF to be used (「pdf 不能用？」), then 「可以，直接做」.
- 0654 gives every account the system posts to its AutoCount number and name (for example `1100` becomes `310-0000` CASH AT BANK, `2110` becomes `400-0000` TRADE CREDITORS, `4100` becomes `500-0000` SALES). It adds the new accounts in the table above and the headings they sit under. A number change carries to every row that names the account, posted lines included.
- The top headings keep plain numbers: `0000` ASSETS, `2000` LIABILITIES, `3000` EQUITY, `4000` INCOME, `5000` COST OF GOODS SOLD, `6000` EXPENSES, `7000` TAX. Under them, accounts read in number order, as in AutoCount.
- Bank transfers, cheques, FPX and DuitNow post to `310-2000` Hong Leong Bank, and Stripe to `315-5000`. A card machine's payment posts to that machine's clearing account (0660, How money is recorded below); a card payment that names no machine (the old Credit card and Debit card, or Merchant with no machine) posts to the old card account, renamed `CARD - MACHINE NOT KNOWN`.
- A test account the new chart has no place for is retired. One that still carries test postings cannot be, so its name ends `(TEST ONLY)` until go-live starts clean (CLAUDE.md §6). On production today that is the old current account and rent and utilities.
- The rest of Chew's chart, about 250 accounts, names directors, staff and related companies, so it is never written into this public repository. Chew loads it himself: Chart of accounts → `Import from AutoCount`, choosing AutoCount's printed chart as a PDF. The PDF is read in the browser and never sent. The database first answers what each account would do: new, already in the chart, or not imported and why. Only `Import` makes the new accounts, under the account AutoCount prints them under, or under their section's top heading.
- The import never renames, moves or retires an account already in the chart, and never makes a bank, cash or control account: a bank or cash account is made with `Add a money account` on Chart of accounts, and a control account is the system's. It never marks an account already in the chart as a bank or cash account either (0692).
- Measured: Chew's PDF, read on this computer, gives 251 accounts with none unreadable. Before applying, both migrations ran on production inside a transaction that was then rolled back: every role, map and money check passed, and an import of a test listing made the expected accounts in the expected places, with no two accounts sharing a name.
- Applied 2026-10-07. The tracker holds each file exactly (md5 `68869fb5…` for 0654, `8b24d8d5…` for 0655). Production then had 71 active accounts and none of the old system numbers; `1120` and `6200` carry `(TEST ONLY)`; bank, cheque, DuitNow and Online post to `310-2000`, Stripe to `315-5000`, cash to `320-0000`, and card, credit card and debit card to `1130`. The import is open to signed-in callers only, and refuses any role but Finance and principal.
- Three old roles still name retired accounts, measured after applying. `SUPPLIER_ADVANCE` (`1230`) is now only the Balance Sheet's line for suppliers paid ahead: a supplier advance already posts to that supplier's own payables account, never to `1230`. `CUSTOMER_MONEY_HEADING` (`2200`) and `STOCK_HEADING` (`1300`) now only stop an account being added or moved under those retired headings; the money-in check reads the accounts themselves. Nothing posts to any of the three. They go when the Balance Sheet is next changed (§0, suppliers paid ahead).
- Imported 2026-10-07 on Chew's own Finance login, in his Chrome, after he saw the preview (「可以，按吧」): 210 new, 41 already in the chart, none refused. Production then held 297 accounts, 281 in use (asset 33, liability 74, equity 5, income 15, expense 154), with no two sharing a name, none under a retired heading or an account the ledger posts to, every account the kind of its heading, and no empty heading.
- Falsifier: after the import, an account Chew knows is in AutoCount is missing or sits under another heading, or a payment posts to an account Chew did not expect.

**The Chart of accounts screen reads like AutoCount's — approved by Chew 2026-10-07 (「可以」), after he showed the Houzs chart he wants (「我的chart of account 要这样」); BUILT (PR #1979, merged 2026-10-07 as `9c37e180`); 0656 APPLIED 2026-10-07 with Chew's OK (「可以，套用吧」), the tracker holding the file exactly (md5 `8e16561f…`).**
- Accounts are grouped by AutoCount's section, in AutoCount's order: CAPITAL, RETAINED EARNING, FIXED ASSETS, OTHER ASSETS, CURRENT ASSETS, CURRENT LIABILITIES, LONG TERM LIABILITIES, SALES, SALES ADJUSTMENTS, COST OF GOODS SOLD, OTHER INCOMES, EXPENSES, TAXATION. Each group shows its kind and how many accounts it holds, and folds.
- Three columns: `Code`, `Name`, `Type`. After the name, AutoCount's special type in small grey letters (SFA, SAD, SRE, SDC, SCC, SBS, SOS, SCS). A money account shows its kind under `Type` instead (next paragraph). A heading is marked as one and folds; the accounts under it are indented.
- Each account can be edited (name, number, section, and the heading it sits under) and retired. Only an account the ledger has never posted to can be retired; a used account stays, as in AutoCount. Retired accounts are hidden until asked for.
- Where those two actions sit: an edit and a retire icon at the end of each row, as in the Houzs chart; a row click also opens the edit window, which holds Retire too. Chew chose the icons knowing the shared listing rule keeps buttons out of rows (UI MASTER §6.0 rule 10, Jess's) (「2」), then ruled to build them now (「直接做，这个是我finance 的使用方式」, 2026-10-07). It is a Finance-only exception for this one page; no other page copies it, and Chew sends Jess the request so the UI MASTER can record it.
- Accounts read in number order, as in AutoCount. Dragging to reorder goes; the heading an account sits under is changed in edit.
- Not on this screen: a company column (Carres is one company, Chew: 「选公司不需要没关系」), the event tick (event and project costs are not kept, Chew 2026-10-03) and the performance statement row (it comes with the Performance P&L, not built).
- The top headings `0000` to `7000` no longer show on this screen; the reports keep them for now.
- Each account keeps its AutoCount section and special type. Importing the same PDF again fills them for the accounts already in the chart, and never renames or moves one. The system's own accounts that are not in Chew's PDF (the merchant clearing accounts, subscription, cost of service and the like) take theirs from the migration.
- The retire icon shows only where retiring can work: never on an account the system posts to (a role, an income or payment map row), a bank, cash or card account, a control account, or a heading with accounts in use. An account the ledger has posted to keeps it, and the database says why it stays.
- Done 2026-10-07: after 0656, Chew's PDF imported again on his Finance login with his OK (「可以，按吧」): 0 new, 251 already in the chart, 251 sections filled in. Production then held 297 accounts, 281 in use, 275 with a section and 19 with a special type, every top account in a section, and none in a section of another kind. In use by section: CAPITAL 2, RETAINED EARNING 2, FIXED ASSETS 7, OTHER ASSETS 1, CURRENT ASSETS 24, CURRENT LIABILITIES 73, SALES 6, SALES ADJUSTMENTS 2, COST OF GOODS SOLD 15, OTHER INCOMES 6, EXPENSES 135, TAXATION 1.

**One place for the money accounts — Chew 2026-10-13 (「对，做」), after asking why the special type does not control them on its own (「为什么不能用special account 去control就好？」); BUILT 2026-10-13 (0692), probed on production and rolled back; 0692 APPLIED 2026-10-13 on his word, the tracker holding the file exactly (md5 `a764b03cabe59f2910a55ed730e7f5b6`): the 14 money accounts are marked, 4 banks and 2 old test banks `SBK`, 7 holding accounts `HLD`, cash `SCH`, each with the switch it had. CI refuses a DROP unless reviewed: Chew confirmed the DROP of the old list table in the conversation (「确认，继续」), and the gate pins 0692 by its content (`scripts/check-migrations.mjs`, REVIEWED_DESTRUCTIVE). The old list kept who added or changed each account and when; those four test columns went with it. DEPLOYED 2026-10-13 (PR #2040, `634b2ec4`): ERP and the API report that version; checked on production as Finance, read only, in a rolled-back transaction: 14 accounts marked on the chart, the 12 in use listed with their kinds.** Chart of accounts is the one place that says an account holds money.
- The special type is the mark: `SBK` a bank account, `SCH` cash (AutoCount's), and `HLD` a card or online payment company's holding account. AutoCount has no type for the last, so `HLD` is Carres's own. Every picker that takes money in or pays it out reads the accounts so marked: a bank or cash account pays out and takes money in; a holding account only takes money in.
- A money account shows its kind under `Type` (`Bank account`, `Cash`, `Card and online holding`), which filters by it, and no special type beside its name.
- `Add a money account` sits on Chart of accounts: a name and a kind, bank or card and online holding. A bank goes under `310-0000` CASH AT BANK, a card and online holding account under `315-0000` CARD & ONLINE CLEARING, beside the merchants (Chew 2026-10-13, 「修刷卡账户编号的问题」, 「可以，做」; 0693). Each takes the next free number of its heading (`310-5000`, `315-7000` today) unless Finance types one; when every number is used, Finance types one.
- Both headings hold money accounts only: `Add account` never offers them and the database refuses adding or moving any other account into either (0693). Existing accounts were not moved.
- 0693 measured before applying (production, rolled back, 2026-10-13): two card accounts became `315-7000` and `315-8000` under `315-0000`, a third asked for a number and took `315-A000` when typed; a bank became `310-5000` under `310-0000`. Adding a plain account under either heading and moving `210-0000` GOODWILL under `315-0000` were refused, each naming its heading. 0693 APPLIED 2026-10-13 on his word, the tracker holding the file exactly (md5 `0e28da48da92dd64bda2755b5ee5e105`).
- A money account opens its own window: name, `Active`, number. `Active` is its own switch, because an account the ledger has posted to is never retired (0462): unticked, the account leaves every picker. It is refused while the account is not at RM 0.00 or a payment method still lands money in it. A money account has no retire icon. One that is not active reads `Not active` and, like a retired account, shows only with `Show not active`.
- A money account is always a plain asset account: never a heading or a control account. The import never marks one.
- The Money accounts tab is gone; an old link to it opens Chart of accounts. The list it showed (`gl_money_accounts`) is now read from the chart, so every report and door reads the same accounts as before.
- Measured before applying (production, rolled back, 2026-10-13):
  - The 14 money accounts read back the same kind and switch they had. Daily Bank, Cash Flow (July to October), Card money waiting and the money account list gave the same answer as before, to the character.
  - A bank added through the door was marked `SBK` and could pay out; a holding account `HLD`, taking money in and not paying out. Unticking `Active` took a bank out of every list; ticking it brought it back. A card payout route between the two saved.
  - Refused: retiring a money account (the sentence says to untick `Active`), adding an account under CASH AT BANK through `Add account`, and marking an expense account as a bank. Operation read no money account.
- Falsifier: in Chew's test, a picker offers an account Chart of accounts does not mark as a money account, or leaves out one it marks and shows as active.

**How money is recorded, Chew 2026-10-07; BUILT 2026-10-08 (「你直接做完先」, PR #1985); 0660 APPLIED 2026-10-08 with Chew's OK (「可以，套用」), the tracker holding the file exactly (md5 `559ff5f2274546190552bc505688c18e`).** 「每张so 记录收款，当开新的so 时就会填顾客下的货，然后填付款，填付款时就会选付款方式，online, cash, merchant, 选了merchant 就会跳卡机出现 / 然后尾款就是operation记录收的钱然后 会link回哪种sales order, 付款方式同理」:
- A new sales order records the goods, then the payment. The method is chosen in two steps (「付款方式应该是online, cash, cheque, merchant。 我选了merchant 才会跳merchant选项」): `Online transfer`, `Cash`, `Cheque` or `Merchant` first; Merchant then asks the `Card machine`: `PBB`, `GHL`, `HLBB`, `MBB` or `AhaPay`.
- A balance is recorded by Operation against its sales order, with the same two steps.
- Each machine is its own payment method and posts to its own clearing account (`315-1000` PBB, `315-2000` GHL, `315-3000` HLBB, `315-4000` MBB, `315-6000` AhaPay — 「ahapay 也要放去进去」). Its name is `Merchant · PBB` and so on: Chew wrote `Merchant - PBB`, and the portal shows no dash on a screen (owner ruling 2026-09-27). Online transfer goes straight into the bank (`310-2000`), Cash to `320-0000`, and cheques are still taken and go into the bank (「有收支票」). A Merchant payment that names no machine posts to `1130` CARD - MACHINE NOT KNOWN.
- A card machine is a card: every door asks its approval code and the database refuses one without it; its proof is the card terminal receipt; Card settlement offers its payments for matching like any card payment.
- Order entry and Operation's recording are Jess's. Chew authorised Finance to change their payment settings directly (「直接改」, 2026-10-07) and to add the machine picker to Operation's balance form (「要做，直接做」); nothing else on her screens changed. Both record the same facts as Chew's 2990 example: date, method, amount, approval code, slip and who collected; the account follows from the method.
- What 0660 sets, each Payment settings change kept in its Changes list with Chew's reason:
  - Settings → Payment → Payment methods: `Bank transfer` is named `Online transfer` (the word order entry already used); the five machines are added, each with its account; DuitNow QR, Credit card and Debit card are switched off. Their accounts stay, so payments already recorded with them read and post as before. Order: Online transfer, Cash, Cheque, then the machines.
  - Order entry's methods: Online transfer, Cash, `Cheque` (new) and `Merchant` (new, sublabel `Card machine`, asking `Card machine` with the five machines). Credit / Debit, with its bank question, and Installment are switched off: a card instalment is a Merchant payment (§0, the card company pays at once).
  - The database: a deposit taken with a new order records Merchant as the machine answered; one card predicate, `payment_is_card`, replaces the fixed card list in the approval-code checks and in Card settlement's matching.
- Where the two steps show: Operation's balance form and Finance's AR → Record receipt. Payment's Invoice → Record payment and Operation's storage collection are Jess's screens and were not changed: they list every method in one list, each machine by its name. While the list of methods loads, every form offers Chew's list.
- Measured after applying (2026-10-08): the eleven methods, their accounts and Active as above; order entry offers Online transfer, Cash, Cheque and Merchant, with Credit / Debit and Installment off; nine changes recorded with Chew's reason.
- Measured before applying (2026-10-08, production, rolled back): an Operation balance with `Merchant · PBB` debits `315-1000`; a new order's deposit with Merchant and GHL debits `315-2000`; Merchant with no machine, or a machine nobody set up, debits `1130`; Online transfer debits `310-2000`; a machine payment with no approval code is refused at each door; Card settlement's review lists the machine payments.
- Settings still to complete (Chew's, Finance Settings → `Card payout banks`): a machine's clearing account is paid out through Card settlement only once it has a card payout bank, and from then on only there. Today `315-2000` GHL has one (showroom → `310-2000`, dealer → `310-3000`). Add `315-1000` PBB and `315-4000` MBB when their statements are settled there. Leave HLBB and AhaPay without one: Card settlement reads PBB, GHL and Maybank statements only, so their money is paid out with Money moves → Card payout until it reads theirs.
- For Chew to tell Jess: Payment MASTER §16 still lists the old six methods; her Payment Settings Changes list shows a method change as `manual_method:{key}`; the Bank row on the balance form says `Ref no (optional)` though an Online transfer needs its reference number (Save stays off until it is typed). None of these was changed.
- Falsifier: a machine payment lands in an account other than its machine's; staff pick the wrong machine because the machine words are not the ones on the terminals; or a PBB or Maybank statement cannot be matched to the machine's payments.

Two Finance Settings pages keep the mapping in Chew's hands (「其他的收入，费用同理」, 「可以」):
- **Automatic posting accounts.** Every kind of posting the system makes, and the account it goes to. Chew can change the account; the new one must be of the same type (income for income, expense for expense, a liability for what a dealer is owed). A change applies to postings from then on; earlier ones stay, and a journal moves them if needed. Each change records who, when, and from which account to which.
  - Built 2026-10-07 as Finance Settings → `Posting accounts` (PR #1981; 0657 APPLIED 2026-10-07, tracker md5 `aead67a59b23a19bbe1747be0f65522d`). Groups: Sales (an invoice's goods, subscription fees, storage and every add-on, an add-on with no account flagged), Purchases and charges (goods on a supplier bill, bank and card charges, money the bank pays in), Dealers (next point), Customer money, and the accounts the system keeps (payables, customer deposits, stock, equity: renamed or renumbered in Chart of accounts, never swapped here). A row opens a window offering only accounts of the posting's kind that are in use, not headings, not control or money accounts. A change made by someone else in between is refused, not overwritten. The changes are listed under the postings and cannot be altered.
  - Each group's title says when its postings are made (Chew 2026-10-13, 「这个posting是怎样触发？」): Sales when Operation issues a sales invoice, each line by its kind; Purchases and charges when a bill, a card payout or a bank line is recorded; Dealers when a month's dealer commission is closed; Customer money when a customer payment is recorded, by how it was paid. A row is matched by its fixed code (an add-on's key such as `STAIR_CARRY`, a role), never by the words shown, so renaming an add-on changes nothing posted. Two columns, `Posting` and `Account`; a changed posting says when and by whom under its account.
  - The principal-only door to the income map (`gl_map_income_account`) now writes through the same path, so every change is recorded and Finance may use it.
  - **Dealers — BUILT 2026-10-09 (「可以，放上去」, Chew, PR #1995); 0675 APPLIED 2026-10-09 with Chew's OK (「可以，套用」), the tracker holding the file exactly (md5 `7c02c45cd3ec30a4048fb83ac042fc3b`).** The six accounts the dealer commission month close posts to (0666, §3.2 step 4b): the dealer commission, renovation rebate and KPI allowance, each an expense account, and what is owed for each until the dealer is paid, each a liability account (in use, not a heading, not a control or money account). Finance changes them here as it changes the purchase and charge accounts. A month already closed keeps its entry, and a draft voucher keeps the lines it was raised with.
  - Deployed 2026-10-09 (merge `dbf38694`, every surface on it) and checked in production with the Finance login: `Dealers` lists the six with their accounts; `Dealer commission owed` opens `Account (Liability)` offering the liability accounts in use and no control account; closed without a change.
  - Measured before applying (production, rolled back, 2026-10-09): the page's read was the same apart from the six new rows, each changeable; Finance moved what is owed for commission to another liability and the change was recorded; a liability refused an expense account and a control account, an expense refused a liability, money the bank pays in still refused an expense, the payables stayed kept by the system, and Operation was refused.
  - The add-on `Dispose old sofa (big size)` had no income account, so its invoices could not be issued (measured 2026-10-07). 0657 gives it `500-3000` SERVICE CHARGES, as every other disposal (the mapping above).
  - Customer money. **Chew 2026-10-07 (「1 可以」):** Finance changes the money account each way of being paid lands in, from this page. Only that one setting: a method's name, whether it is Active and every other Payment setting stay with the principal or the holder of the ops manager duty (`payment_settings_gate`, Payment MASTER §12). Built as `payment_method_account_set` (0658 APPLIED 2026-10-08 with Chew's OK 「做」, tracker md5 `74aa547eebcd2188214b4679e000f1f7`; no account was changed by it): the window offers the money accounts Payment settings offers and the door takes only those; a change someone made in between is refused; the change is kept in Payment settings' own change record, in the same shape its doors write, so both pages list it, and the row shows when it last changed. Payment MASTER §12 still says only the manager edits Payment settings; Chew tells Jess about this exception (§1).
- **Item groups**, as in the 2990 reference Chew showed (「就是这个item group 绑定什么account 也需要有」). Each group binds a Purchase, Sales, Sales Return and Purchase Return account; Chew can change the accounts, add groups and turn a group off, and a change applies to postings from then on. Confirmed by Chew 2026-10-07 (「1 可以 2 可以 3 开新的，cost of service」):
  - Each product starts in the group of its catalog category (mattress, bedframe, sofa, accessory, service, guarantee). Finance may add its own groups and move a product into one; the catalog is not changed.
  - A bill for an unbound group cannot be confirmed until the group is bound. A sale is never held back: it posts to `500-0000` and the page lists it for binding.
  - The starting groups: MATTRESS `610-0020`, SOFA `610-0030`, BEDFRAME `610-0040`, MATTRESS PROTECTOR `610-0050`, PILLOW `610-0070` and OTHERS `610-0000` for purchases, each selling to `500-0000`; SERVICE sells to `500-3000` and GUARANTEE to `500-5000`, and both cost to a new `604-0000` Cost of service. Every group returns to `510-0000` (sales) and `612-0000` (purchases). Curtain (`610-0060`), footrest (`610-0080`) and storage (`500-4000`) get a group when such a product exists. The existing accessories are placed for Chew to check: one protector, three pillows.
  - A guarantee claim's replacement cost stays `900-W005`.
  - **Built 2026-10-08 as Finance Settings → `Item groups` (PR #1982; 0659 APPLIED 2026-10-08 with Chew's OK 「可以，套用吧」, tracker md5 `6e7889a6e0337c8ad2a25b980e724ed1`; probed on production first, rolled back).** Chew: 「可以，直接做」.
    - The page: one row per group with its four accounts; an empty one reads `No account yet`. `Add item group`; a row opens the group: name, the four accounts (each only of its kind, in use, not a heading, control or money account), `Active`. An account once bound can be changed, not emptied. A group stays in use while a catalog category starts in it or it has products. Below: every product in the catalog with its group (a row moves it; moving it back to its category's group removes the move), the sales that went to the goods account, and the changes. A change made by someone else in between is refused, not overwritten.
    - Starting state (measured 2026-10-08): 57 products, every one in a group: MATTRESS 17, SOFA 23, BEDFRAME 11, MATTRESS PROTECTOR 1, PILLOW 3, SERVICE 1, GUARANTEE 1, OTHERS 0. The protector and the three pillows are placed; all other products are in their category's group.
    - Sales: a sales invoice used to credit all of an order's goods to `500-0000` in one sum, the 15-year guarantee too. Now each line's goods go to its group's sales account: the guarantee to `500-5000`, a service product to `500-3000`, everything else to `500-0000` as the starting groups say. A subscription order keeps `500-2000`. Goods whose group has no sales account, or whose SKU is not in the catalog, go to the goods account on Posting accounts (`500-0000`) and are listed under `Sales posted to the goods account`; a journal moves them if needed. Measured on the probe: SO 1288 posted `500-0000` 5,198.00, `500-5000` 150.00, `500-3000` 250.00 (add-ons).
    - Bills: a goods line takes its group's purchase account. A person can still choose another account on the line, as in AutoCount, and that choice is kept. At confirm, a line nobody chose an account for takes its group's purchase account as it stands then, so a group bound after the draft was saved counts. A goods line whose group has no purchase account stops the confirm (the ruling above), chosen account or not. Goods whose SKU is not in the catalog keep the `Goods bought that are not in the catalog` posting (`610-0000`).
    - Returns: each group keeps its Sales Return (`510-0000`) and Purchase Return (`612-0000`) account. Nothing posts them yet: customer credit notes are not built, and a supplier credit note line names no product, so the person still picks its account.
    - The chart: an item group's account is an account the system posts to, so Chart of accounts does not retire it.
    - Catalog (§1 exception, built 2026-10-08 in its own change): the catalog's New Model and New SKU forms carry an `Item group` field under Category. It starts on the category's own group and follows the category until someone picks another; only a different group is sent, and the database sets it (`gl_item_group_start`: a new product only, in its first hour, before it was ever placed; `gl_item_group_choices` lists the groups in use). A guarantee has no field: it starts in GUARANTEE. If the database does not set the group, the product is still made, in its category's group, and the form says why. After that, only Finance moves a product.

**A purchase without an order** takes its channel from the Manual Purchase Request's required purpose (Purchasing §5.2), so nothing extra is marked on the PO. Confirmed by Chew 2026-10-06 (「1 对，2 对，3 可以」):
- Showroom Display → that showroom; Ready Stock → stock not yet in a channel; Service Case → the case's order; Internal Staff Purchase and Other Purchase → Office; Subsidiary Purchase → the amount due from that related company (350-00xx). The approved Diglant advance PO, when built → Subscription; a dealer display request, when built → that dealer.
- When Purchasing allocates such stock or PO quantity to a Sales Order, the goods take that order's channel. Allocated before the supplier is paid: the bill and the payment carry the order's channel. Allocated after: that month's Receipts & Payments keeps it under stock and does not change, and the cost reaches the order's channel when the goods are sold. A PO split between orders is split unit by unit.
- How a bill does this is in "Splitting the money by channel" step 1 (built in 0683). The Showroom Display rule holds while Carres has one showroom.
- The KPI allowance is accrued like the renovation rebate (900-C009 / 410-0065).

**Splitting the money by channel — the plan; APPROVED by Chew 2026-10-12 (「分渠道做」, after it was explained to him). Steps 1 to 4 BUILT, applied and DEPLOYED (2026-10-12). He tests it all at once when it is done (「到时我要测试的全部一次过做」).** It builds Chew's rulings 1, 2, 4, 5 and 6 above and "A purchase without an order". Measured first (2026-10-10, read only):
- Customer money: a payment, a deposit and an invoice each post to the one trade debtors account (`300-0000`) through `gl_ar_control_account()`, which allows exactly one customer control account; a second one makes every customer payment fail to post. These postings run inside Payment's own recording (Jess's), with no fallback, so a fault there would stop staff recording payments. No customer posting stores a department: the reports work it out from the order when they read (0578).
- Supplier bills: a GRN line's department is filled in from its sales order (`fin_po_line_departments`), but it can be changed by hand; a PO line bought for orders in two channels gets none. A Manual Purchase Request keeps its purpose; a Showroom Display destination is not tied to a showroom outlet.
- Cash Flow has no channel filter. A supplier payment carries no department (only the bill lines it paid do); a card payout carries none.
- Transport: nothing ties a logistics partner's bill to the delivery orders it covers, and logistics partners are not suppliers in Payables.

Recommended, in this order:
1. **A bill line takes its order's channel** (ruling 2). **BUILT 2026-10-12 (0683); 0683 APPLIED 2026-10-12 on Chew's 「做」 for the build batch, the tracker holding the file exactly (md5 `f32b2b267e73928d4534471ede7d2b9d`). DEPLOYED 2026-10-12 (PR #2011, `68f089f6`); checked on production, read only: a draft bill's GRN goods line shows its channel as text, with no picker.**
   - A bill's goods line (one from a GRN) has its channel worked out when the bill is saved; the form shows it and nobody picks it. A line not from a GRN still names its department by hand.
   - How it is worked out, earliest order first: the orders the PO line was bought for (`po_line_sources`), else the orders its Units were put aside or sold for, less what earlier bills of that PO line already charged to each.
   - A line going to more than one channel is saved as one line per channel, the quantity split and the price kept. A PO line bought for orders that is charged beyond them keeps the earliest order's channel.
   - A purchase without an order follows its request's purpose:
     - Showroom Display goes to the showroom while Carres has exactly one; otherwise it is Not yet in a channel until Purchasing records which showroom (Jess's data).
     - Internal Staff, Other and Subsidiary Purchase go to Office. A Subsidiary Purchase's account (the related company's 350-00xx) is still picked by hand.
     - Service Case goes to the case's order.
     - Ready Stock, or a PO line with no request, is `Not yet in a channel` (STOCK, a department only a goods line gets). Units already put aside or sold for an order take that order's channel.
   - A showroom order with no outlet now belongs to the showroom while Carres has exactly one, for bills and for every report reading an order's channel (`fin_order_channels`; before, such an order had no department).
   - Not built: moving a Not yet in a channel line to its order's channel when the goods are allocated or sold after the bill is confirmed (Cash Flow, step 2, reads that at payment time).
   - Measured before applying (production, rolled back, 2026-10-12, test data made inside the test):
     - A PO line bought for a showroom order and a dealer order, one each, saved a bill of two as two lines, the showroom first (the earlier order), at the same price. The department the form sent was ignored, and saving the draft again from its own lines gave the same two.
     - Charging three split them one, one and the extra one to the showroom.
     - A PO line bought for no order posted `Not yet in a channel` on the purchases line, and its cancellation reversed it the same way.
     - Goods with two of three Units sold for showroom orders split two to the showroom and one to Not yet in a channel.
     - A line not from a GRN with no department, or with Not yet in a channel, was refused; Office was saved.
     - Operation could not read the bill form's preview, and an order's channel could not be read around Finance's doors.
2. **Cash Flow by channel** (ruling 1). **BUILT 2026-10-12 (0684); 0684 APPLIED 2026-10-12 on Chew's 「做」 for the build batch, the tracker holding the file exactly (md5 `53c91ea9fb4e9eed60729f8e6c100868`). DEPLOYED 2026-10-12 (PR #2011, `68f089f6`); checked on production, read only: Showroom for 1 to 12 October showed its one receipt, RM 1,315.00, with the note on what one channel leaves out and no balances.** Cash Flow has the reports' `Department` filter.
   - Every share of cash and bank money is shared as since 0638, then split again by channel, in whole sen:
     - a receipt goes to its order's channel;
     - a supplier payment goes to the channels of the bill and debit note lines it paid, in proportion; an advance follows the bills it was later knocked off;
     - a card payout made through Card settlement goes to the orders of the card payments in it;
     - anything else goes to its line's own department, or the one reports already work out from its order.
   - What goes to no channel shows only under All: a transfer between Carres's own accounts, an advance not knocked off yet, a card payout made by hand on Money moves, a bank charge.
   - With a channel, the page prints that channel's money in and out by account. It has no brought or carried forward and no card money still waiting, because balances are not split by channel. It says what it leaves out.
   - With no department the answer is the same as before, to the sen. Every channel plus what no channel takes adds back to the whole.
   - Not built:
     - A goods line that is `Not yet in a channel` stays there when it is paid, even if its goods were allocated to an order before the payment. The ruling's "allocated before the supplier is paid" needs the allocation's date.
     - Card money still waiting, by channel.
   - Measured before applying (production, rolled back, 2026-10-12):
     - Over July to October the unfiltered answer equalled the old one exactly.
     - The showroom, dealer and no-channel money added back to the whole: in RM 9,725.57, out RM 201.00.
     - A showroom view's rows equalled its accounts' money in, with no opening balance.
     - A settled card payout went to its dealer orders.
     - A bill of RM 80 Office and RM 20 showroom, paid by one voucher of RM 100, showed as RM 80 and RM 20.
     - An advance whose bill line had no department stayed in no channel.
     - Office with an id and an unknown department were refused, and Operation could not read Cash Flow.
3. **Debtors by channel** (rulings 4 and 6). **BUILT 2026-10-12 (0685), probed on production and rolled back. Chew approved the change to Payment's recording (2026-10-12, §1 Exceptions) and told Jess; 0685 APPLIED 2026-10-12 on his 「可以套用」, the tracker holding the file exactly (md5 `09b1a335b135bff269ad64d1fc87a8a5`). Right after applying: the three accounts and their roles are in the chart, no dealer account is open yet (one opens with a dealer's first posting), and the customer accounts still total RM −13,928.00. DEPLOYED 2026-10-12 (PR #2012, `98b6b047`); checked on production, read only: Posting accounts lists the three under "Kept by the system" in words, and AR Aging reads `300-0000 + 300-1000 + 300-3000 + 305-0000`, RM −13,928.00.**
   - The accounts: `300-1000` SHOWROOM DEBTORS, `300-2000` DEALER DEBTORS (a heading) and `300-3000` SUBSCRIPTION DEBTORS. Three posting roles name them, so a renumber carries through; Posting accounts lists them under "Kept by the system".
   - Each dealer gets its own account under `300-2000`: `300-2001` and on, named after the dealer, opened the first time one of its customers is invoiced or pays. `fin_dealer_debtor_accounts` records which account is whose.
   - The customer payment (every door into Payment's recording) and the sales or storage invoice take the account from the order's channel (`fin_order_channels`). An order that view leaves out is a showroom order whose outlet it cannot name, so it goes to Showroom Debtors. The customer stays the party on the line.
   - A reversal copies the lines it reverses, so a payment or invoice posted before 0685 goes back to `300-0000` when voided. The test balances on `300-0000` stay there.
   - The Ledger self-check's receivables reads every customer account together.
   - Ruling 6 puts the three under `300-0000`. They sit beside it under ASSETS for now, because `300-0000` holds test postings and an account with postings never becomes a heading (0580). Go-live starts with clean books; then `300-0000` takes them under it (Chart of accounts, `Under`).
   - Measured before applying (production, rolled back, 2026-10-12):
     - A showroom cash payment recorded by the principal posted Dr cash, Cr `300-1000` with its customer.
     - A dealer recording a top-up on its own order opened `300-2001`, named after the dealer, under `300-2000`, and posted to it. A second order of the same dealer used the same account; another dealer's order opened `300-2002`.
     - Invoices issued by Operation posted Dr `300-1000` (showroom) and Dr `300-2001` (dealer). A subscription order's account is `300-3000`.
     - Voiding the new payment reversed on `300-1000`; voiding a payment posted before 0685 reversed on `300-0000`.
     - The receivables check read all five customer accounts: the ledger and invoices less payments agreed, difference RM 0.00, as before. The Balance Sheet balanced.
     - The two new functions and the dealer account list cannot be reached by a signed-in user directly.
   - Measured again after 0686, 0688 and 0689 were applied (production, rolled back, 2026-10-12): the same results, and AR Aging read all six debtor accounts, its debtors adding up to them exactly.
   - Not built: an order whose channel changes after money was posted leaves its earlier entries on the earlier account; a journal moves them.
4. **Transport on each order** (ruling 5). **BUILT 2026-10-12 (0689); 0689 APPLIED 2026-10-12 on Chew's 「做」 for the build batch, the tracker holding the file exactly (md5 `5f7ed848c4a6e78cde8520dabe1d54ae`). DEPLOYED 2026-10-12 (PR #2019, `eddac2cb`); checked on production, read only: a new bill's `Add delivery orders` listed NETS's 3 delivery orders, each with its order's channel; nothing was saved.** A logistics company's bill names the delivery orders it is for, and each becomes a line in its order's channel.
   - The bill form has `Add delivery orders`. Finance picks the logistics company and ticks its delivery orders, then types each one's amount, or types the bill's total and presses `Split equally` (whole sen; the first lines take the odd sen, so the lines add up to the total).
   - Each line posts to Posting accounts' `Transport to customers, by delivery order` (`900-T002` today; Finance may change it there), unless Finance chooses another account on the line. Its channel is its order's, never picked. It says its DO No and SO No, and has one amount, no qty or unit price.
   - A delivery order is on one live bill at most. The picker leaves out the ones on another bill. A voided delivery order, one on another live bill, the same one twice, and a line naming a delivery order and a GRN are refused.
   - A delivery order belongs to the logistics company its delivery arrangement names, else the one its DO names. Delivery's records are read only.
   - The bill's creditor is still picked as a supplier or other creditor. Nothing ties it to Delivery's logistics company, so Finance picks both.
   - Measured before applying (production, rolled back, 2026-10-12):
     - The picker listed 2 logistics companies with 4 delivery orders between them, each with its order's channel.
     - A bill of RM 60 and RM 40 on two delivery orders saved two lines on `900-T002` in the showroom, RM 100 in all. Confirmed, it posted Dr `900-T002` RM 60 and RM 40 in the showroom, Cr `400-0000` RM 100.
     - The picker then left those two out for any other bill and kept them for this one. Saving the bill again kept its own delivery order.
     - Refused: a delivery order already on a draft bill, the same one twice, one with a GRN, and a control account chosen on the line. A chosen expense account was kept.
     - Operation could not read the picker. A voided delivery order was not measured: production has none.
- Falsifier: in Chew's test, a channel's money in or out differs from what its orders, bills and vouchers show, or a customer payment fails to post after step 3.

## 1 · Boundary: Finance, Subscription and Dealer

Chew, 2026-10-03: 「总之jess 的功能，ui 等等都别动到。我只专做我的finance 模块，我其他的资料也只是链接过来罢了」.

**What Finance builds.** Only Finance:
- its pages under `/finance` and its API routes;
- its tables and functions;
- its own menu group;
- this document.

**What Finance reads.** Data from other modules is read and linked only. Finance never edits these records, screens or rules:
- customer payments, receipts and invoices (Payment);
- Sales Orders (Orders);
- POs and GRNs (Purchasing);
- Units and month-end stock (Stock).

**Subscription and Dealer are Chew's too** (Chew 2026-10-07: 「subscription 现在归我负责」, 「dealer 也是归我做，只是下单和operation归她」).
- Subscription: Rental's agreements, plans, billing schedule, collections and agreement wording, from signing on. Signing a subscription at the POS is order placement, which stays Jess's.
- Dealer: dealer records, commission, renovation rebate, KPI and statements, including the dealer's own statement page.
- Order placement and Operation stay Jess's. HR and Catalog are treated as Jess's until Chew says otherwise.

**What Finance never touches:**
- Jess's modules and their UI;
- the shared UI kit;
- `CLAUDE.md` and `AGENTS.md`, except the authority map's rows for Chew's modules;
- every other module MASTER.

**Exceptions.** If a Finance feature needs even a small change on Jess's side, stop and take it back to Chew first. Chew has approved these, and tells Jess himself:
- the staff entry for Payment Requests (§3.3) and the folding menu area (§4.1);
- the payment method settings of order entry and Payment (「直接改」, 2026-10-07, §0);
- the item group field on the catalog's new model and SKU forms (「jess 那边我会通知他，你直接做」, 2026-10-07, §0);
- the machine picker after `Merchant` on Operation's balance form (「要做，直接做」, 2026-10-07, §0; built with 0660);
- Finance setting the money account each way of being paid lands in, from Finance Settings → Posting accounts, although Payment MASTER §12 leaves Payment settings to the manager (「1 可以」, 2026-10-07, §0 "Automatic posting accounts");
- the debtor account chosen by the order's channel when Payment records money (「分渠道做」, 2026-10-12, §0 "Splitting the money by channel" step 3);
- HR and BD staff asking Finance to pay through Payment Requests, which puts its row in their menus (「hr & BD 也到能申请」, 2026-10-12, §3.3).

Each changes only what Finance needs on that screen; nothing else on Jess's screens moves (Chew: 「别碰到其他的view哦」).

**Pointers.** Short `CLAUDE.md` pointers inside the Finance code folders point to this document, so a chat that opens Finance code reads it first.

## 2 · Who does what

| Person | Does |
|---|---|
| Finance user | Prepares payment vouchers. Keys supplier bills, other debtors and other receipts. Runs card and bank reconciliation and month-end. Reads the reports. |
| Purchasing (role `operation`) | Keys a supplier bill from goods received, on Operations → Purchase Invoices (`New bill`, `Bill from GRN`). ~~Finance confirms it (that posts it)~~ OVERTURNED 2026-10-26 by Chew (WhatsApp to YH, 12:34: 「once they save should be direct go to related account as set」; Houzs posts on save, Weisiang's ruling puts Houzs first): saving posts it, through the same `supplier_bill_confirm`. Q9 (YH, 2026-10-26, Houzs way): a GRN bill may carry freight/service lines with an account from Finance's list and a department, never a GRN's own goods; a bill with no GRN line stays Finance's. Finance pays it. Chew, WhatsApp 2026-10-23, via YH: 「Can be both to proceed the step first? Because the duties right now still at finance, coming maybe will be purchasing」 (0721). |
| Checker | Any Finance user except the one who prepared the voucher. |
| Finance Approver | The existing Workspace duty `finance_approver` (Workspace MASTER §4 Staff & Duties). It takes Finance users only, allows a cover, and the principal can always approve. Approves vouchers and money moves, and cancels confirmed Finance documents. Measured 2026-10-12: no person holds it yet, so a Finance user whose position carries the duty approves (the Finance test login does). Chew assigns it to a person when he creates the real users (「到时我创建了用户才指派」, 2026-10-12). |
| Staff with permission | Raise a payment request with the bill attached (§3.3). Finance or the boss gives the permission. |
| The boss | Sets permissions and assigns duties. |

- **Check and approve.** One person **may** both check and approve a voucher when they hold both rights (Chew).
  - This replaces the three-different-people rule now in Finance code.
  - Its on-screen wording changes with it: COPY-STANDARD "Money moves and the three-person voucher" (PROPOSAL).
- **Assignment.** Duties are assigned through Workspace Staff & Duties as it exists today. Finance keeps no second assignment list (CLAUDE.md §8, GLOBAL OWNER LAW).
- **Two different approvers.**
  - `Payment Approver` belongs to Payment: it voids customer payments and corrects allocations.
  - `Finance Approver` belongs to Finance: it covers money going out.

## 3 · Decisions (Chew, 2026-10-03)

### 3.1 Customer money: Payment owns it, Finance reads it

| Topic | Decision |
|---|---|
| Recording, receipts and corrections | **Payment's rules stand.** Each recorded payment reaches the Finance ledger automatically, and Finance does not re-enter it. Payment's rules are: one collection owner; the receipt is made at recording; void or correct allocation is done by the Payment Approver. |
| Refunds | **Jess's no-refund policy stands** (Payment MASTER §13). The exceptional refund (Service Case → Management → Finance pays) is paid with a Finance **Customer Refund** voucher, so that it is in the ledger. Where it shows: on Finance's own AR page, the refunded amount stands on its own beside the customer's outstanding; Payment's figures and pages do not change (Chew 2026-10-03). **Not built.** An order already invoiced is refunded through a credit note to `520-0000 DISCOUNT ALLOWED` (Chew 2026-10-10, 「已开的进 discount allowed(cn）」). An order not yet invoiced (the money was paid ahead of the invoice) is refunded Dr Trade Debtors with the customer as the party, Cr the bank, taking it back off that customer's account (Chew 2026-10-12, 「可以，就扣回相对应的顾客账目」). That credit note is Finance's own record: it posts only in Finance and is not sent to the customer, so Payment's pages and figures do not change and customer invoices stay Payment's (row below) (Chew 2026-10-10, 「A，Finance 自己记录就好」). |
| Moving a deposit to another order | **Not built.** It changes payment records, and Payment already has `Correct allocation`. |
| Old-slip approval window | **Not built.** |
| Customer credit and debit notes | **Not built.** Customer invoices belong to Payment (Payment MASTER §1). |
| Deposit invoices | **Not built** (measured 2026-10-12: no page, route, table or function for them was ever committed; this row said "built and switched OFF", which was wrong). Chew confirms them with Jess first (§5). See the rules below this table. |
| Customer credit pot | **Not built.** |
| Other debtors and other receipts | Keep. |

Deposit invoice rules:
- They are made from payment records, which Finance only reads. Payment's recording is not changed.
- Before they are built, check them against Payment's invoice model, the approved numbering (owner 2026-09-23) and e-invoice.

### 3.2 Money out

| Topic | Decision |
|---|---|
| Payment vouchers | Prepare → Check → Approve, as in §2. The voucher is the only way money leaves. |
| Supplier bills | Keep: from a GRN at PO price, and through other creditors for non-goods bills. ~~Only Finance enters a supplier bill (the rule in `supplier_bill_save_draft` since 0464: finance + principal).~~ OVERTURNED 2026-10-23 by Chew (Finance, WhatsApp via YH): Purchasing enters a supplier bill too, through the same door (0721). What Purchasing may send: a NEW draft whose every line is a GRN line (its quantity and the price on the supplier's bill), no account and no payables account, so the usual accounts apply. Changing a saved draft, confirming (posting), cancelling and every payment, advance, credit note and debit note stay finance + principal. A purchasing draft is the same row as a Finance draft, so it posts the same Dr each line, Cr payables when Finance confirms it (tested in `purchasing-supplier-bill-0721.integration.test.ts`). Non-goods bills (rent, transport, delivery orders) stay Finance's. |
| Supplier advances | Keep. |
| Supplier credit and debit notes | **Build.** This includes reading the supplier's paper and knocking the note off that supplier's invoices. A **debit note** (the supplier charges more) is its own document, with its own number and list, never mixed with bills; it is paid by a payment voucher and counts in AP and AP Aging (Chew 2026-10-03; **built in 0681**, "Supplier debit notes" below). A supplier never pays a credit back in money: the credit is knocked off the next bill, or a credit or debit note is raised, so no refund-from-supplier door is built. |
| Supplier finance data (tax numbers, bank account) | **Build** as Finance's own record, linked to Purchasing's supplier. Purchasing screens do not change. |
| Codes for creditors and other debtors | **Chew 2026-10-12 (「A 可以」): AutoCount's form (`400-A001`), made by the system, changeable by Finance. Built in 0691**, "Codes and the money accounts tidy-up" below. |
| Bill scanning | **Build.** It sends bill images to an external AI service and costs a little per bill. |
| Foreign currency | Needed, but rarely used. Record the foreign amount and the rate only; the books stay in RM, and no exchange gain or loss is worked out automatically (Chew 2026-10-03). **Built for a bill in 0682**, "Foreign currency on a bill" below. |
| Dealer commission | Calculated on money actually received; Finance maintains the rates. See the rules below this table. |

**Codes and the money accounts tidy-up — Chew 2026-10-12 (「A 可以，B 可以，做吧」); BUILT 2026-10-12 (0691), probed on production and rolled back; 0691 APPLIED 2026-10-12 on his word, the tracker holding the file exactly (md5 `44132d63e34921cfaa44cf82270ec32c`): the 11 suppliers have their codes and `1130` is `315-9000`. DEPLOYED 2026-10-12 (PR #2030, `e5fdd744`); checked on production, read only: Suppliers lists `400-A001` Armani to `400-T001` Todern in its first column, and the 12 money accounts in use include `315-9000`.**
- Every supplier, other creditor and other debtor has a code in AutoCount's form: the three digits of its control account, a dash, the name's first letter or digit, and a running number. `400-A001` is a supplier (Trade Creditors), `405-N001` an other creditor, `305-A001` an other debtor.
  - The system makes it, in name order, the first time Finance reads the list after the supplier or party is added. Finance may change it on Suppliers → Edit details or Other debtors → Edit party. It is unique and never a chart account's number; each change is in the audit log.
  - It is Finance's own record (`fin_party_codes`); Purchasing's supplier record does not change. Customers have no code.
  - It is shown first on Suppliers, Other debtors → Parties and AP Aging, before the name in every creditor picker, and in their Excel exports.
- Money accounts:
  - `1130 CARD - MACHINE NOT KNOWN` is renumbered `315-9000`, beside the merchants under `315-0000`. Every record that named it follows: money accounts, card payout banks, the payment methods' accounts and posted lines.
  - `1121 Public Bank` was already retired in the chart. `1120 (TEST ONLY)` holds test postings, so it stays, not active, until the clean start at go-live, and is retired then.
  - Finance Settings opens on Chart of accounts, which also keeps the money accounts ("One place for the money accounts", §0).
- Measured before applying (production, rolled back, 2026-10-12):
  - The 11 suppliers got codes in name order, `400-A001` to `400-T001` (two under N: `400-N001`, `400-N002`). No other debtor exists yet; a new one got `305-Z001` on the next read.
  - After the renumber, `315-9000` held the same 8 posted lines, 3 payment method accounts and 2 card payout routes, and nothing named `1130`.
  - A changed code was kept in capitals and written to the audit log. Refused: a code another supplier has, a chart account's number, a wrong shape, and a supplier and a party at once. Operation could neither read nor change a code.

Dealer commission rules:
- Each month a **draft** payment voucher is raised automatically.
- **Commission is accrued at month end** (Chew 2026-10-06, 「dealer 佣金对」): Dr 900-C007 Commission - Dealer, Cr 410-0061 Accruals - Commission Dealer. The payment voucher clears it: Dr 410-0061, Cr bank. This replaces the 2026-10-03 rule of no accrual. Chew reads CLAUDE.md §7's "no HQ→dealer credit or debt" as goods money, not commission Carres owes a dealer.
- **The renovation rebate and the KPI allowance accrue the same way, each to its own pair in the chart** (Chew 2026-10-09, 「可以」): the rebate Dr 900-C008 Renovation Rebate, Cr 410-0064 Accruals - Renovation Rebate; the KPI allowance Dr 900-C009 KPI Allowance, Cr 410-0065 Accruals - KPI Allowance. The dealer's payment voucher clears each accrual it pays.
- The calculation itself is checked with Chew step by step before anything about commission changes, including the automatic draft voucher (Chew 2026-10-03).

**Dealer commission rules — confirmed by Chew and management (2026-10-07); APPROVED / NOT BUILT.**
- **Which orders count.** Dealer-channel orders only, never Showroom's. A month's report reads the orders placed before that month ends, by the Malaysian day (Chew 2026-10-05).
- **The rules come from Carres memos.** The memos of 22 July 2026 ("Revised Pricing Structure", §12 promotion items; "KPI Allowance — Additional 15-Year Guarantee") are kept by Chew. They are not in this public repository, and neither are their rates or amounts. The rates live in Finance's settings, where Chew keeps them.
- **What Chew maintains himself (Chew 2026-10-05).** The rate for each dealer and for each product, with the rule (memo) each comes from and the date a new rate starts; the renovation rebate (its total and how it runs down); how a cancelled order and a refund take commission back.
- **Measured 2026-10-05.** Today there is one default rate plus optional rates per product: no rate per dealer, no start date, and no record of the memo. Changing a rate changes every past month. A cancelled order drops out of every month, including months already paid. A refund is taken off in the month it is paid out. Orders carry no discount field and no negative line, so a bundle price is only seen as the line prices typed. The renovation rebate exists: total, rate, start date, running down as money is collected. The 15-year guarantee is the catalog item `GRT-MATTRESS-15Y`; its catalog price differs from the memo's (Catalog's to correct, not Finance's).
- **Chew's answers, 2026-10-05** (his words, then the reading, since confirmed):
  1. 「新的% 要可以决定几时开始，然后是根据订单的日期决定」. Every rate has a start date; an order uses the rate in force on its order date.
  2. 「25% 变20%」. A promotion item's rate is the normal rate less 5 points.
  3. 「这个只是可能，暂时没有说每个dealer 不一样」. A rate per dealer can be kept; today no dealer differs.
  4. 「我是根据收到的钱给佣金，如果取消单没有退也要扣，但要做能toggle 决定」. Commission follows money received. A cancelled order's commission is taken back even when its money is not refunded, behind a switch Finance can turn.
  5. 「收到的钱的%」, then 「1是a」 (2026-10-05): confirmed. The renovation rebate is money Carres pays the dealer on top of commission: the rebate rate times the money collected since its start date, until the total is reached; the total left runs down by itself. The total can be filled in later; until then the rebate is still worked out, uncapped. Once the total is entered, what is left is the total less every rebate already worked out (Chew's example: August receipts RM 9,855 at 5% give RM 492.75; a total of RM 10,000 entered in September leaves RM 9,507.25). A total smaller than what was already given takes nothing back, and no more rebate is given (「对，总额少过已给的就不再给」, Chew 2026-10-05).
  6. 「每个月重新数，根据订单」 (2026-10-05). The 15-year guarantee KPI counts from orders, and the count restarts each month (management, 2026-10-07: 「by month 算」). The period stays a setting.
  7. 「这个确定，是根据订单的mattress 决定的」, then 「是a」 (2026-10-05): commission is worked on the price after the bundle discount, so Carres and the dealer share it. The bundle discount belongs to the whole bundle and is shared equally by the order's mattresses, piece by piece: 「3张就500 除3， 4张就500 除4」 (Chew 2026-10-05). Each mattress's commission is its rate on its price less its share. A line of quantity 2 counts as two mattresses, and only mattresses share the discount (「可以」, Chew 2026-10-05). When Carres ends a bundle promotion, orders placed after it carry no bundle discount and earn on full prices; orders placed during it keep their discount and commission. There is no switch, because the spread only acts on an order that records a bundle discount (「对，不用开关」, Chew 2026-10-05). A product moving between rates (20% back to 25%) is a new rate with a start date, decided by the order date. The order must say it carries a bundle discount; today no order field holds one, and order entry is Jess's.
- **Ready to build.** The whole calculation is confirmed: management checked the rules (「dealer 的确定了」, Chew 2026-10-07). Every dealer's statement follows the same rules and the format of Chew's workbook (「其他的dealer statement 同个规则和格式」).
- **Build order (Chew 2026-10-08, 「可以，从第1步开始做」).** 1 rates with start dates · 2 the month's calculation and report, order by order · 3 the dealer's statement and the dealer's own login view · 4 the month-end accrual, the draft payment voucher on the 15th, the renovation rebate and the KPI allowance. Each step ships on its own.
- **Step 1, rates with start dates — BUILT 2026-10-08 (PR #1986); 0661 APPLIED 2026-10-08 with Chew's OK (「可以，套用」), the tracker holding the file exactly (md5 `31e2a136351eb6574d7b1c71c5bf5107`).** Reports → Dealer commission → `Commission rates`:
  - One list in five groups: `Standard rate`, `Dealer rates`, `Product rates`, `Promotion items`, `Kinds of product`. Each row is a rate or a switch from its day, with the memo it comes from and who added it when, and reads `In use`, `Replaced` or `Starts later`.
  - `Add a rate` adds one from a day; a row added by mistake is removed from its own window. A row is never changed, and the first rows (from the start) stay.
  - An order takes the rates in force on its order day (Malaysia), so a new rate never changes an order placed before it. A product's own rate wins, else the dealer's, else the standard; a promotion item takes its points off (5 unless changed), never below 0.
  - Kinds of product: mattress, bedframe, sofa and accessory earn from the start (accessories earn: Chew 2026-10-05, management D1). Service and the guarantee never earn and are not offered as a switch. A line whose SKU left the catalog still earns, as before (0555 stays unapplied).
  - The report now takes each line's rate from the database. The one visible change today: accessory lines earn at the standard rate, where they earned nothing before.
  - The old default rate (25%) became the standard rate from the start; there were no product rates. The two old tables are kept, no longer read or written.
  - Measured before applying (production, rolled back, 2026-10-08): the rate a line earns followed the rules day by day (standard, then a dealer's from its day, then a product's, a promotion's 5 points and its end, a kind switched off); Operation was refused; a second rate on the same day, a switch for service, a promotion with no points and removing a rate from the start were refused.
- **Step 2, the month's commission order by order — BUILT 2026-10-08 (「可以，开始做第2步」, PR #1987); 0662 APPLIED 2026-10-08 with Chew's OK (「可以，套用」), the tracker holding the file exactly (md5 `d91cbbf09a654806db610a0d1f1427ce`).** Reports → Dealer commission:
  - `By order` joined the switch (the whole switch: step 3). A dealer's row opens its orders; the month, dealer and showroom stay the same on the report views. `Commission on collected` is now `Commission this month`, and both views have a totals row.
  - `By order`: one row per order in groups `New orders this month`, `Balances this month`, `Cancelled this month`, `Taken back this month` and `Still waiting for money`, with SO, dealer, customer, order day, order total, commission in full, paid by month end, commission this month, still to earn and a note. A row's window shows how its commission is made up.
  - The calculation, one place for the report and later the statement and payout (packages/shared/src/dealer-commission.ts): what earns nothing (service, the guarantee, transport, disposal, a kind switched off) is paid first; nothing is earned until the money kept reaches half the order total, service included, and the month it does pays on everything kept so far; once reached it stays reached; a refund takes its commission back in the month it is paid; card payments count in full; a bundle discount is shared equally by the mattress pieces once an order records one. A month's commission is what the order earned by the month's end less what it had earned by the end of the month before.
  - Cancelled orders are in the report now. The day comes from the order's cancel or abandon line in its history. From that day it has nothing still to earn; what it earned on money Carres kept stays. Its window offers `Take commission back` (and `Keep commission` to undo), Finance and principal only; taking it back counts in the month it is done. It shows under `Cancelled this month` in the month it was cancelled.
  - Not yet: an amended order is worked out again from today's order, so an earlier month can change until months are closed (step 4 makes the difference land in the month of the change). The bundle discount needs a field on the order, which is Jess's.
  - Measured before applying (production, rolled back, 2026-10-08): taking back was refused for an order not cancelled, a showroom order and an Operation login; a cancelled order's commission was taken back from today, a second press changed nothing, and `Keep commission` undid it with the row kept; the read gave each order its customer and cancelled day, each line its quantity, and the kinds of product in the catalog's order.
- **Step 3, the dealer's statement and the store's own view — BUILT 2026-10-09 (「可以，开始做第3步」, 「直接做完」, PR #1990); 0664 APPLIED 2026-10-09 with Chew's OK (「可以，套用」), the tracker holding the file exactly (md5 `891d6fb6a20ef07c4adee6e752409d96`).** Reports → Dealer commission and the POS:
  - The switch reads `By dealer` · `By order` · `Statement` · `Commission rates` · `Renovation quotas`.
  - `Statement`: pick a dealer. Each month's commission, and its renovation rebate, is a line on the month's last day, due on the 15th of the month after; the month in progress reads `so far`, on today. Each payment to the dealer is a line, and a running balance follows them. The footer says what Carres owes the dealer now, what falls due next and on which day (the oldest month the payments do not cover, as payments pay the oldest months first, never more than is owed), and the commission still to come on its orders. A month's line opens that month's orders. The figures are the report's own arithmetic, live.
  - A payment to a dealer is a paid (approved) direct payment voucher that Finance counts for it: `Add a payment` offers the paid direct vouchers not yet given to a dealer, and a payment's line takes it off again, leaving the voucher as it is. A voucher counts for one dealer only. Finance and principal only. Step 4 makes the voucher on the 15th and counts it by itself.
  - The store's own page: the POS top bar shows `Commission` to a dealer store login signed in with its store owner's PIN, and to no one else; the API and the database check the same. It opens a full-screen page, the shape of Staff & PINs and My orders: what Carres owes the store now and what falls due next, the commission still to come, the statement, and the orders of the month picked on it, read only. A dealer login reads its own dealer only, whatever it asks. The pill is the one change on Jess's POS screen; Chew tells Jess.
  - One read builds the orders for the report and the statement; `By order` lists them by dealer, then the day placed. The calculation leaves an order out of a month before it was placed (the statement reads every order to today).
  - Not yet: emailing the statement (「email 可以不用做先」). An amended order is still worked out again from today's order until step 4 closes months, so an earlier month's line can change.
  - Deployed 2026-10-09 (merge `fb782776`, every surface on it) and checked in production with the Finance login: a dealer's statement showed September's RM 1,259.75 due on 15 October and RM 7,053.75 still to come; its September line opened September's orders, whose commission adds up to the same RM 1,259.75; `Add a payment` opened and, with no paid direct voucher yet, said to pay with a voucher first. The store's own page was not opened in production (no dealer login); its tests and a preview cover it.
  - Measured before applying (production, rolled back, 2026-10-09): the report's read was the same before and after, this month and last (23 and 21 orders); Finance read a dealer's statement (12 orders, none of another dealer); a paid direct voucher was offered and counted once, a second press changed nothing, another dealer and a voucher not yet paid were refused, and taking it off kept the row and offered the voucher again; Operation was refused everywhere; a dealer login read its own statement only, was refused another dealer's, the doors and the report, and could neither read nor write the payments table itself.
- **Step 4 ships in two parts.** 4a: the renovation rebate's rules and the KPI allowance. 4b: closing a month, with the accrual, the draft payment voucher on the 15th and the voucher counted on the statement by itself.
- **Step 4a, the rebate's rules and the KPI allowance — BUILT 2026-10-09 (「可以，开始做第4步」, PR #1993); 0665 APPLIED 2026-10-09 with Chew's OK (「可以，套用」), the tracker holding the file exactly (md5 `bc58fef851da41d205afcd75109759c7`).** Reports → Dealer commission:
  - The switch adds `KPI allowance`: the 15-year guarantee KPI allowance, each rule from its day, with the guarantee it counts, the amount per guarantee, the tier bonuses (the highest tier reached pays; tiers do not add up) and whether the count starts again each month or each year (rules 8.1–8.3). A rule is never changed: a new one is added from its day, and one added by mistake is removed. Finance enters the amounts there; they are not in the code or this repository (rule 11).
  - Each guarantee sold counts on its order's day; a line of 2 counts two, as one guarantee covers one unit (Guarantee's rule, Loo 2026-07-26). A cancelled order's do not count (8.4). Orders before the first rule's day do not count, and a period is paid by the rule in force on its last day. A yearly count pays each guarantee as it comes and a tier's bonus in the month it is reached.
  - By dealer adds `Guarantees this month` and `KPI allowance this month` (`Not set up` with no rule). The statement and the store's own page show a `KPI allowance {month}` line, due on the 15th after, like commission.
  - The renovation rebate follows commission's money rules (7.4): an order counts nothing until it reaches half, then all it kept since the rebate started; a refund takes back; a cancelled order's money counts until Finance takes its commission back. Before, a cancelled order never counted and the half rule did not apply.
  - The rebate's total can be left empty and filled in later; until then there is no limit (7.3), and `Quota left` reads `No limit yet`.
  - Until 4b closes months, a month is still worked out again from today's records: a cancellation or an amendment can change an earlier month.
  - Deployed 2026-10-09 (merge `18973820`, every surface on it) and checked in production with the Finance login: the switch shows `KPI allowance`; By dealer shows the two new columns, the commission figures unchanged.
  - Chew's KPI allowance entered 2026-10-09 on his word (「帮我填」), from the final-check page (rule 8.2): from 22 July 2026, the memo's day, counting the Mattress Guarantee, the count starting again each month. The amounts live in the database only. Checked: the one test order with a guarantee (placed 31 July 2026) put a `KPI allowance Jul 2026` line on its dealer's statement, due 15 August.
  - Measured before applying (production, rolled back, 2026-10-09): the report's read and a dealer's statement were the same before and after, beside the new KPI rules (none yet); a rebate with no total was saved and read back; a KPI rule was added with its tiers put in order, and the same day again, a product that is not a guarantee, half a sen, two tiers at the same count, a tier in words and another period were refused; Operation and a dealer login could neither add nor read the rules, while the dealer's own statement carried them; the table could not be written around the doors; removing a rule kept the row.
- **Step 4b, closing a month — BUILT 2026-10-09 (「可以，开始做第4步」, PR #1994); 0666 APPLIED 2026-10-09 with Chew's OK (「可以，套用」), the tracker holding the file exactly (md5 `eb8dec8f703711d735f82716ed643255`).** A month closes by itself:
  - The daily run at 09:00 (Malaysia) closes the month before on the 1st; months close in order, so a missed day catches up. The figures are the report's own arithmetic (packages/shared/src/dealer-commission.ts), kept as they stood: each dealer's commission, renovation rebate and KPI allowance, and each order's commission by the month's end.
  - A closed month never changes (2.7, 6.4). By dealer shows what was charged and says the month closed. An amendment, a late refund, a cancellation or a take-back lands in the first month still open: the order pays what it earns now less what the closed month kept. Guarantees on an order cancelled after its month closed come off the KPI allowance only when Finance takes its commission back (8.4). A rebate total cut below what was already given takes nothing back (7.3a).
  - The accrual posts on the month's last day as one entry (`DC-{YYYY-MM}`): commission Dr 900-C007, Cr 410-0061 (Chew 2026-10-06); the rebate Dr 900-C008, Cr 410-0064 and the KPI allowance Dr 900-C009, Cr 410-0065 (Chew 2026-10-09); the dealer is each line's department, and a month that takes back posts the other way round. If the books are already closed through that day, it posts on the first day still open. The six accounts are posting roles (`DEALER_COMMISSION` · `DEALER_COMMISSION_ACCRUED` · `RENOVATION_REBATE` · `RENOVATION_REBATE_ACCRUED` · `KPI_ALLOWANCE` · `KPI_ALLOWANCE_ACCRUED`); Finance changes them on Settings → Posting accounts, under Dealers (0675, §0 "Automatic posting accounts").
  - Each dealer Carres owes gets one draft payment voucher dated the 15th of the month after (9.1, 9.2): every posted month's charges less every voucher already counted for the dealer (a cancelled one does not count), one line per accrual it clears. A dealer that owes Carres instead gets none, and the next month nets it. The draft names no bank: Finance picks the account it pays from when the time comes (「到时我才manual set」, Chew 2026-10-09), and a voucher with no account cannot be prepared. Its history says the month close raised it. It counts on the dealer's statement by itself and shows there as a payment once approved.
  - A month that ended before the ledger's go-live is kept, with nothing posted and no voucher.
  - Measured before applying (production, rolled back, 2026-10-09): the report's read and a dealer's statement were the same apart from the closes; the first month due was July (the first dealer order); a month out of turn, unreadable figures and a showroom were refused; July and August were kept with nothing posted; September posted one balanced entry dated 30 September (a take-back the other way round) and raised a draft for each dealer dated 15 October with no bank, netting a voucher already counted; closing it again changed nothing; without a bank a draft could not be prepared, was cancelled, and with one Finance prepared it; Finance, Operation and a dealer login could not call the close or write the closed months, which Finance reads (a dealer through its own statement).
  - Deployed 2026-10-09 (merge `5a2941d2`, every surface on it) and checked in production with the Finance login: By dealer for October and September reads as before (September RM 1,686.00 across the two test dealers, no KPI allowance), and Payment Vouchers loads with no error. The first daily run, on 10 October 2026 at 09:00 (Malaysia), closed July, August and September, measured the same morning: July and August kept with nothing posted; September posted `DC-2026-09` (`JE-202609-0019`) on 30 September, RM 1,686.00 Dr 900-C007, Cr 410-0061 across the two test dealers, each line on its dealer's department; two drafts dated 15 October, RM 1,259.75 and RM 426.25, with no bank, waiting for Finance to pick the account.
- **Paying commission out (Chew 2026-10-05).** 「佣金可以先算，但我给佣金是根据收到的钱，然后收的第一笔低过50% 是不出的, 知道clear 完才出 / 八月收一半就出一半的commission, 收60% 就出60%，尾款10月收就10月才出」. An order's whole commission is worked out at once; it is paid out as its money arrives. If the first money is at least half the order, the commission for what came in is paid that month and the rest when the rest comes in. If the first money is under half, nothing is paid until the order reaches half (next point).
- **Cancelled orders (Chew 2026-10-05).** 「照理我是根据收到的钱出commission, 所以取消的单就不再有[还没收的佣金]，所以已付的没有影响不是」, then 「可以」. A cancelled order has nothing still to collect. Commission already paid on money Carres kept stays paid; each cancelled order carries a switch, off by default, that Finance turns on to take it back. Money refunded is taken back in the month it is refunded.
- **Reaching half later (Chew 2026-10-05).** 「9月收超过50%就补回给他」. An order whose first money was under half starts paying in the month its money received reaches half: that month pays the commission on everything received so far, and later money pays as it comes in.
- **Confirmed by Chew, 2026-10-06** (rule numbers of the final-check page): sofas earn commission (3.2). Guarantee, transport and disposal come off the first money like service (5.7). The half-paid rule is measured on the whole order total, service included (5.8). The renovation rebate follows the half-paid rule: nothing counts until the order reaches half, then it counts (7.4). One payment per dealer per month: commission, rebate and KPI allowance, less what is taken back (9.1). Rate precedence: a product's own rate, else the dealer's, else the standard; a promotion item takes 5 points off the rate that applies (2.5, 「顺序对」). Each dealer's renovation rebate (total, rate, start date) is Finance's to fill in, without management (「这个有填就给 … 那天开始是我决定的」). Commission is paid on the 15th of the following month (「付佣金的日子15号」).
- **Management's answers on dealers (brought by Chew, 2026-10-07).** The questions were on one private page Chew shares: https://claude.ai/artifact/4SYoi1Qut1VzcpRcMhS6cU.
  - D1: accessories earn 25%, behind a switch with a start date (the workbook rulings below).
  - D2: the KPI count restarts each month (answer 6 above).
  - D3: each dealer logs in and sees its own statement (「dealer 要能看自己的statement」). Emailing the statement is not built for now (「email 可以不用做先」). Dealer is Chew's, so the page is Finance's to build; the dealer's order screens stay Jess's.
  - D4: when Carres keeps a cancelled order's money, commission already paid stays paid by default, and Finance takes it back order by order ("Cancelled orders" above).
- **Further rulings (Chew, 2026-10-06 and 2026-10-07):**
  - Card payments: commission is worked on the amount the customer paid, before the card fee (「照1000 算」, Chew 2026-10-06).
  - An amended order is worked out again, and the difference is adjusted in the month of the amendment (「改单的话能重新算 … 就是几时改单的月份调」, Chew 2026-10-06). The recalculation uses the rates of the original order date (「甲，用原本下单那天的%」).
  - A self-billed e-invoice for paying dealers is not needed (「d5 不需要」, Chew 2026-10-06); it is off the management page.
  - Go-live: only once every module works without problems (「全部模块没有问题了才上线」, Chew 2026-10-07). There is no date yet, and opening balances from AutoCount stay parked (Chew 2026-10-03).
- **Final check done.** Management checked the whole list (2026-10-07). It stays on a private page Chew shares: https://claude.ai/artifact/6tEBVSvjxQyvfextAHPUai.
- **Service comes off first (Chew 2026-10-05).** 「service 要扣掉哦，当第一次算和出时就要扣了」 and 「我算的commission 是不包括service 哦」. Commission never includes service. Confirmed 「1 是乙」: the first money received pays for the items that earn nothing before any of it earns commission, rather than spreading them over every payment. Example: goods RM 3,000 at 25% plus service RM 300; RM 1,650 received first earns (1,650 − 300) × 25% = RM 337.50, and the RM 1,650 balance earns RM 412.50. Guarantee, transport and disposal come off first in the same way (5.7 above).
- **Dealer statement (Chew 2026-10-05).** 「要每个月如何算commission, 其中包括当月每个新的订单， 当月收的尾款，当月的deduct。同时还需要一个比较普通类似supplier statement 这样的格式，我欠他多少，几时付他这样。实时update 的」. Two views, both live: the month's commission, order by order, covering that month's new orders, the balances collected that month and that month's deductions; and a statement of account like a supplier's: what Carres owes the dealer and when it was paid (the payment voucher). It also shows the commission still waiting on orders whose balance is not in yet. Chew checks and Finance imitates his existing statements.
- **Chew's existing statement workbook, read 2026-10-05.** One dealer's August 2026 workbook, kept by Chew (not in this repository). Its sheets: Summary, the month's claim, Statement of Account (running balance of commission and bonus charged, payments credited), line detail with each line's rate and why, an order ledger (commission if fully paid, earned, still to earn), and the AR, unclaimed and new-collection sheets that reconcile the source files. It agrees with the rules above: commission is earned on receipts, in proportion; refunds earn nothing; an order below the minimum deposit is held; a bundle discount is spread equally over the mattress pieces. Settled with Chew the same day:
  - **Accessories earn commission** at the standard rate (pillows, mattress protectors), overturning the code's "accessories earn nothing" (YH, 30 Sep 2026). It may stop later, so whether a kind of product earns commission is a switch with a start date (「配件也是25%。但到时可能会取消，所以要做可以toggle 的」). Management confirmed 25% on 2026-10-07 (D1).
  - **The workbook's bonus on receipts is the renovation rebate** (「是装修回扣」).
  - **A receipt counts in the month the system records it.** The workbook let a claim sheet move a receipt between months only because nothing was systematic yet (「到时就是根据每个月的真实收款」).
  - **The system's own records are the source.** The workbook's corrections to hand-made source files do not carry over (「到时就是根据系统的记录来算了」).
- **Subscription is not dealer commission (Chew 2026-10-05).** 「subscription 是subscription， dealer 是dealer, 不是一样的东西」. Subscription commission stays in Rental. The dealer report, statement and payout leave it out.
- **Subscription's rules are in the Rental MASTER §0** (Subscription is Chew's since 2026-10-07): billing, invoices, late interest, paying off, default, termination, bad debt, commission, Diglant and the agreement. Below is only how Finance books them.
- **Subscription in Finance's books, confirmed by Chew 2026-10-06.**
  - An invoice is income when it is issued: Dr the customer's subscription debtor, Cr subscription income. Money received: Dr bank, Cr the customer's debtor, knocking off the invoice (「我开单时就是我的income … 我收到钱就是银行增加，knock off invoice」). This replaces "income when collected".
  - The parent account holds subscription customers only.
  - The parent is a debtor control account. Each customer is its sub-account (debtor code), and every invoice and receipt posts to that customer's sub-account; the control account shows their total (「母账是debtor control account，所以每个顾客都应该是子账」, Chew 2026-10-06).
  - The invoice shows the customer's details. Its description names the agreement number, which instalment and the amount; the rest follows the standard invoice.
  - Invoices are made automatically each month, on the 1st, and fall due in that same month (Chew 2026-10-10, 「subscription一号开单，当月到期」), on the 7th as Rental MASTER §0 sets. Chew looks them over, then sends them from accounts@carresofficial.com.
  - Late interest is invoiced too.
  - Bad debt: the agreements Chew ticks on the bad-debt list post Dr bad debts, Cr the customer's debtor, once each.
  - The subscription invoice is Finance's (「invoice 那边算我这里」). Rental keeps the agreement and its billing schedule.
  - APPROVED / NOT BUILT (measured 2026-10-10). The plan follows.
- **Subscription money — the plan, PROPOSAL / NOT LAW (2026-10-10, for Chew's review).** It builds the Rental MASTER §0 rules and the bullets above. Measured first (2026-10-10, read only):
  - Today each collected month posts Dr the money account, Cr `500-2000` on the day it is paid: no invoice, no subscription debtor, no customer on the line (0475). Accounts `401-0000`, `610-0090` and `900-B002` exist but nothing posts to them. `300-3000` was not in the chart (measured 2026-10-12); 0685 added it (applied 2026-10-12), and a subscription order's invoice or payment through Payment now posts to it.
  - The schedule starts on the signing day and Stripe charges month 1 at signing (POS checkout); later months fall on the 7th. Nothing ties the first month to delivery.
  - `Record transfer` can mark any month paid, takes the day the button is pressed, and closes a whole month for any amount. A month counts as late until someone records it.
  - Late interest is 8% a month from the due date, typed in the code, charged by hand, never invoiced or posted. Paying off works (months left plus interest charged), but its interest never posts. Default, repossession and bad debt are statuses with no door. Diglant's share and the commission are worked out per month and stored, never paid or posted.
  - Agreements are numbered `RA-{n}`; no SINV invoice exists; email goes out only for purchase orders.
- Recommended, in this order (each its own release):
  1. **The subscription debtor and the monthly invoice.** Each month's invoice (`SINV…`) is made by itself on the 1st (Chew's ruling above) and posts Dr the customer's subscription debtor (`300-3000`, the customer as party), Cr `500-2000`. A payment posts Dr the bank, Cr the debtor, paying the oldest invoice first; a part payment leaves the rest owed. `Record transfer` asks the day received. Finance's page lists the month's invoices for Chew to look over.
  2. **Late interest as Chew's setting.** The rate, per month or per year, and the day it starts, with each agreement keeping the rate of its signing day. It counts from after the due month ends, never for a month Carres recorded late, and is invoiced (an interest SINV), so it posts.
  3. **Diglant's share.** As each month's rent is collected, Diglant's share is owed: Dr `610-0090` Diglant share, Cr `401-0000` Subscription creditors. On the 10th, the 20th and the last day (a setting), a draft payment voucher pays what is owed: Dr `401-0000`, Cr the bank.
  4. **Paying off and ending.** Paying off makes the RM 1 sale invoice (its amount a setting); ending an agreement makes one invoice for the remaining months and the compensation; a lost-goods invoice the same way.
  5. **Bad debt.** A list of each agreement's amount still owed; Chew ticks several and they post Dr `900-B002`, Cr the customer's debtor, once each.
  6. **Sending.** The month's invoices go out from `accounts@carresofficial.com` after Chew looks them over.
  - The first instalment on the 7th of the month after delivery, with nothing charged at signing, changes the POS signing and its Stripe checkout, which are order placement (Jess's): it waits for Chew to agree it with Jess.
  - Falsifier: in Chew's test, a customer's subscription debtor differs from the invoices less the payments on the agreement, or a month shows paid that the customer did not pay.
- **Still Jess's, for dealer commission:** an order recording its bundle discount (order placement); the 15-year guarantee's catalog price (Catalog).
- **Noted for later (Chew 2026-10-05).** A list's search box opens already typed-into, not behind a click. To change together with other UI items; first check whether it is the shared kit search.

**Supplier credit notes approach — PROPOSAL / NOT LAW, built for Chew's test (0642).**
- Payables → Credit Notes. The supplier's own credit note is entered once, with lines, as a bill is: draft → confirmed → cancelled. Confirming posts on the credit note's date: Dr the payables account with the supplier as the party, Cr each line. An expense or asset line takes a cost back; an income line records a rebate. The stored number is `PCN-YYYYMMDD-RRRR`, drawn like a bill's, so subscription credit notes keep `SCN` (Chew 2026-10-07, 「可以」; built in 0681, a credit note numbered before keeps its `SCN` number); display uses the `YYMMDD` form under Jess's system-wide 2026-10-04 COPY-STANDARD ruling (approved target, adoption not verified).
- Its credit is knocked off that supplier's confirmed bills on the same payables account, as an advance is (0485). A knock-off posts nothing and can be taken off with a reason. A bill counts it as paid from the later of the credit note's date and the knock-off's day. A voucher cannot pay what a credit note already took off, and a bill with a credit note on it cannot be cancelled.
- AP · Payables gains `Credit Left`, and its last money column subtracts it (`Unpaid After Advance and Credit`), so it still equals the books. AP Aging and the Self-check read the same arithmetic. A test walks a bill, a credit note, a knock-off, a voucher refused over what is left, a take-off and a cancel through the real doors.
- A supplier debit note is not entered as a bill: it is its own document (the table above, Chew 2026-10-03), built in 0681 (Supplier debit notes, below).
- Not built: a PDF.
- 0647 fixes a fault 0642 shipped with: a credit note's two account columns did not follow a renumbered account (0570 says every key that names the chart must), so renumbering an account a credit note used was refused. Both now follow, and the file refuses to apply while any key onto the chart still does not. A test renumbers an account under a confirmed credit note.
- Falsifier: in Chew's test, a supplier's `Unpaid After Advance and Credit` differs from its balance in the books, or a bill shows a credit note Chew did not knock off.

**Supplier debit notes — Chew 2026-10-03 (the document) and 2026-10-07 (the `PDN` prefix); APPROVED; BUILT 2026-10-10 (「做」); 0681 APPLIED 2026-10-10 on Chew's word for the whole evening's work (「晚上做时，不要一个一个和我确认，到时直接做完」), the tracker holding the file exactly (md5 `39cf1e68e29e964ec181de6a90bda4d3`).**
- Payables → `Debit Notes`. The supplier's own debit note (the supplier charges more) is entered once, with lines, as a credit note is: draft → confirmed → cancelled. Each line is a cost, as a bill line is: an expense or asset account with its department. It has its own due date (optional), number and list; it is never a bill.
- Confirming posts on the debit note's date: Dr each line's account (with its department), Cr the payables account with the supplier as the party, so Carres owes more. Its number is `PDN-YYYYMMDD-RRRR`, drawn like a bill's. Cancelling a confirmed one takes the finance approver and reverses the entry; it is refused while any voucher not cancelled holds part of it.
- A payment voucher that pays supplier bills pays a debit note the same way: the voucher form lists the supplier's confirmed debit notes under `Debit notes to pay` beside the bills, at most what no other voucher holds yet. Approving posts Dr the note's payables account (party = the supplier), Cr the bank. A debit note's page has `New Payment Voucher`, which opens the voucher form with it ticked. The voucher's page lists `Debit notes paid`; its list names them beside the bills.
- What a debit note still needs paying has one arithmetic: approved vouchers by their date. AP · Payables gains `Debit Notes Unpaid`; `Unpaid` and `Unpaid After Advance and Credit` include it, so the latter still equals the books (the Self-check reads it), and the Dashboard's supplier figure includes it. `On a Voucher, Not Approved` and `Not on a Voucher` still count bills only. AP Aging ages a debit note among the bills, by its date or due date.
- A confirmed debit note settles that supplier's debit notes owed on Notes to follow up, in part or in full (card `Notes it settles`, as on a credit note); while it is cancelled, what it settled is owed again.
- Not built: knocking a credit note or an advance off a debit note (a voucher pays it); a debit note's PDF; reading the supplier's debit note with `Read the bill`.
- Measured before applying (production, rolled back, 2026-10-10; a bill, debit notes and a voucher made inside the test): a debit note of RM 120.00 and RM 30.00 on two cost accounts posted Dr both with their department and Cr the payables account RM 150.00 with the supplier, numbered `PDN-…`; AP · Payables' figure and the supplier's balance in the books each rose by RM 150.00, and AP Aging showed it; one voucher paid a bill RM 50.00 and the debit note RM 100.00, posting Dr the payables account twice and Cr the bank RM 150.00, after which RM 50.00 of the note was left and both figures still moved together; paying more than the note, an unconfirmed note, another supplier's note, a debit note on a direct payment and a voucher line naming both a bill and a debit note were refused; the same paper entered twice, a due date before the date, a control, income or bank account and a blank description were refused; a debit note on a voucher could not be cancelled, and once the voucher was cancelled it could; a debit note settled a debit note owed in part, then in full, refused a second settlement and a credit note owed, and cancelling it made the note owed again; a credit note confirmed was numbered `PCN-…`; Operation could neither read nor write, and the tables could not be written around the doors.
- Falsifier: in Chew's test, a supplier's `Unpaid After Advance and Credit` differs from its balance in the books after a debit note, or a voucher pays a debit note that AP · Payables still shows unpaid.
- Deployed 2026-10-10 (PR #1999, `35802601`), every production surface reporting that SHA. Checked read-only in production the same night as the Finance user: the menu lists `Debit Notes` after `Credit Notes`; the register shows its empty sentence and `0 debit notes · RM 0.00 left to pay`; the form opens with its words; Unpaid by Supplier has `Debit Notes Unpaid`; the voucher list heads `Bills and Debit Notes Paid`; AP Aging still equals the books (difference RM 0.00); no console error. Chew's own test is owed.

**Foreign currency on a bill — Chew 2026-10-03 (the rule in the table above); APPROVED; BUILT 2026-10-10 (「做」); 0682 APPLIED 2026-10-10 on Chew's word for the whole evening's work, the tracker holding the file exactly (md5 `bccc4dbfa9fab8f0336894d2f40cf205`).**
- A bill's page has the fact `Foreign currency`. Finance records the currency the supplier invoiced in (three letters, never MYR), the amount on the supplier's invoice and the rate (RM for 1), changes it, or removes it. The page shows the RM the rate gives beside the bill's own total.
- A record only: the bill's lines stay in RM and post as before; nothing here posts, and no exchange gain or loss is worked out. A draft or confirmed bill takes it; a cancelled bill does not. The bill's history says who recorded, changed or removed it.
- Not built: a foreign currency on a debit note, credit note or payment voucher; a currency list (any three letters are accepted).
- The exchange difference (Chew 2026-10-10, 「2 可以，汇差记 908-0000」): when the bank pays a different RM amount than the bill, Finance enters the difference by hand, as a supplier debit note with a line to `908-0000 LOSS ON FOREIGN EXCHANGE` when the bank paid more, or a supplier credit note with a line to the same account when it paid less. The voucher then pays the bill together with the debit note, or pays what is left once the credit note is knocked off the bill. Nothing new is built for it: 908-0000 is an expense account, which both notes' lines already take (measured 2026-10-10).
- Measured before applying (production, rolled back, 2026-10-10): `usd` 1,250.00 at 4.215 was recorded as USD by the Finance user; changed to EUR 100.50 at 10, one record remained and the history read `Foreign currency EUR 100.50 at 10`; MYR, two letters, an amount of 0, with three decimals or none, a rate of 0 or with seven decimals, and a bill that does not exist were refused; Operation and a caller with no role were refused, and Operation read nothing; removing twice left no record and one `Foreign currency removed`; a draft bill took one, a cancelled bill was refused; the table could not be written around its door.
- Falsifier: in Chew's test, recording a foreign currency changes a bill's total, a ledger entry or AP · Payables.
- Deployed 2026-10-10 (PR #2000, `b21f3268`), every production surface reporting that SHA. Checked read-only in production the same night as the Finance user: a confirmed bill shows `Foreign currency` `None` with `Record foreign currency`; the form opens with `Currency`, `Amount on the supplier's invoice` and `Rate (RM for 1)`, its Save reading `Save: type the currency` while empty; it was closed with `Cancel`, and the database still held no foreign currency and no such history line; no console error. Chew's own test is owed.

**Credit and debit notes to follow up — Chew 2026-10-06, 2026-10-07 and 2026-10-09; APPROVED; BUILT 2026-10-09 (「可以，开始做」, PR #1998); 0676 APPLIED 2026-10-09 with Chew's OK (「好，做完了告诉我」), the tracker holding the file exactly (md5 `28baaa8fbd83f84ca64382589fd1b240`).**
- Chew needs one list of the credit and debit notes suppliers still owe, so he can follow each one up (「我需要有一个listing 关于supplier 那边要follow up 的cn」). It is a reminder only and posts nothing, because there is no supplier claims account (Chew 2026-10-06).
- Where one starts (「就是我转grn 去pi 时会对比我的po price， 然后提醒我，我会remark pending supplier cn or dn / 同时也有可能是开了pi, 然后要purchase return， 就要让他pending cn」):
  - when a bill is made from its GRN, each line is compared with its PO price and a difference is pointed out; Chew marks it pending a supplier credit note or debit note, with a remark;
  - a purchase return on goods already billed makes a pending credit note. Purchasing's return record is read, never changed.
- One record per note owed: supplier, credit or debit, the bill, GRN, PO or return it belongs to, the amount, the date it was noted, each follow-up (the date and what the supplier said) and the next follow-up date.
- It closes when the supplier's note arrives: entering the credit note (or, once built, the debit note) offers that supplier's open ones to settle, and a part leaves the rest open. It can also be closed with a reason, for example the supplier refused or replaced the goods.
- **How it works (Chew 2026-10-09, 「可以，开始做」):**
  - Payables → `Notes to follow up`: one row per note owed (supplier, credit or debit, why, the bill, GRN, PO or return it came from, the amount, what is settled, what is left, the next follow-up), in three groups: to follow up today or earlier, still waiting, and settled or closed. A row opens the note: record a follow-up (the date, what the supplier said, the next date), close it with a reason, and see what settled it. A note can also be added by hand, with the reason Other.
  - A confirmed bill: a line whose price differs from its PO price offers `Follow up`. Above the PO price it suggests a credit note, below it a debit note; the amount it suggests is the difference times the quantity, and can be changed. A line already marked shows its note. A draft bill offers nothing, because its lines can still change.
  - A purchase return on goods on a confirmed bill makes a credit note to follow up by itself, worth the bill's price for the returned goods: the latest confirmed bill line for that GRN and PO line, never more units than were billed. A wrong item is never billed, so it adds nothing.
  - A confirmed credit note settles that supplier's credit notes owed, in part or in full; the rest stays owed. Cancelling the credit note gives back what it settled. A confirmed supplier debit note (0681) settles that supplier's debit notes owed the same way.
  - The reasons are "Price differs from PO", "Purchase return" and "Other".
  - Preparing a voucher for a supplier says what notes it still owes.
  - Finance and principal only. It posts nothing.
  - Built as Payables → `Notes to follow up` (`/finance/notes-to-follow-up`), with `Follow up` on a confirmed bill's lines, `Notes it settles` on a confirmed credit note and the reminder on a voucher's supplier. The list, a credit note's card and the reminder each first add the notes owed for purchase returns, so a return shows the next time any of them is read.
  - Measured before applying (production, rolled back, 2026-10-09; a bill, a purchase return and a credit note made inside the test): a confirmed bill's line above its PO price was marked and a second mark refused; a draft bill, a line with no PO price, a return by hand, a note by hand with no remark, half a sen and a next day in the past were refused; a purchase return of one billed Unit added one credit note owed at the bill's price, once however often the list was read; a follow-up moved the next day, and a day after today, a next day before it and nothing said were refused; a draft credit note could not settle; a confirmed one settled part, then all, refused a second settlement, a debit note and another supplier's note, and taking it off made the note owed again; a settled note could not be closed; cancelling the credit note made its note owed again; a closed note took no follow-up; Operation could neither read nor write, and the tables could not be written around the doors.
  - Deployed 2026-10-09 (merge `1d66ea60`, every surface on it) and checked in production with the Finance login: Payables → `Notes to follow up` opens empty (`0 notes · RM 0.00 of credit notes still to come`); the one confirmed bill's line has no PO price, so it offers no `Follow up`; both reads answered 200 and added no row.
- Falsifier: in Chew's test, a note he is waiting for is not on the list, or one the supplier already sent still shows as owed.

**Bill scanning approach — PROPOSAL / NOT LAW, built for Chew's test (no migration).**
- `Read the bill` on the bill form and `Read the credit note` on the credit note form. The person picks the pages (PDF or photos, up to 8, 10 MB each); they go once to Anthropic's Claude model (`claude-sonnet-5-5`, changeable with the `BILL_READER_MODEL` setting), which answers the supplier's name, the paper's number, date, due date, currency, total and lines.
- What is read fills only what the form does not have yet: the supplier when one has that name (never a guess between two), the number, the date, the due date, and the lines when the form has none. A person still picks each line's account and department and saves. Notes under the card say what to check: a close name, a proforma, another currency, lines that do not add up to the total, a discount read as its own line. A credit note printed with minus signs is read as the credit it is.
- Once the paper is saved, the pages that were read are attached to it as its files. Nothing is written by the reading itself.
- It is OFF until Chew gives the key, which becomes the Worker secret `ANTHROPIC_API_KEY`; until then the button answers `Reading bills is not set up yet. Type the bill in.` Each reading costs a little per bill.
- Not built: Houzs's account memory (filling a line's account from the supplier's earlier bills), the multi-bill scan page, and reading for payment vouchers and payment requests.
- Falsifier: in Chew's test with real bills, a read figure is wrong more often than right, or the pre-filled form takes longer to check than typing it.

#### Money-out source-to-result journey — consolidated review recommendation, 9 October 2026

**Existing §2/§3.2 decisions remain controlling; added failure/result checks are review recommendations, not new accounting entries, roles or release authority.** Houzs Finance is inaccessible to the current study account; this journey uses the existing Chew-owned adaptation above and does not claim a fresh private-V5 inspection.

| Stage | Required source and result | Completion / exception boundary |
|---|---|---|
| Intake and bill | Finance reads exact supplier/GRN/PO-price source for goods, or the admitted other-creditor bill source for non-goods; preserve actual supplier paper and eligible request evidence | A PO or uploaded image is not a confirmed bill or payment. Partial source, unclear supplier, possible duplicate, missing cost/currency/account and scan extraction remain named review facts; scanning does not approve or post by itself |
| Prepare voucher | Qualified Finance preparer selects payable/advance/refund or other admitted purpose, exact recipient/account, amount/currency/rate, allocations and supporting evidence | Customer refund requires its existing exceptional Case/Management source. Requester access remains §3.3-scoped; no ordinary Operations money approval. Supplier credit/debit and advances retain their own source identities |
| Check | A Finance checker other than preparer reviews current voucher/source version, amounts, recipient, allocations and evidence | A checked draft is not approved or paid. Source correction invalidates affected review; no invented three-different-people requirement, since §2 permits a qualified checker also to approve |
| Approve / ledger result | Existing Finance Approver acts through the source-owned voucher transition and retains actual actor, decision and ledger linkage | Approval/posting and external bank execution/receipt are distinguishable evidence. Do not invent an extra payment-state writer or infer bank receipt from approval; §3.4 reconciliation owns bank/card evidence. Denied/uncertain result must be reconciled before a repeat, with no duplicate voucher or money effect |
| Partial / credit / correction | Read actual remaining payable and Finance-owned applied advance/credit; route refused or disputed facts back to the owning Finance document | Supplier note receipt is not accepted/application evidence. Proposed credit-note knock-off rules remain explicitly NOT LAW above; no supplier cash-refund door. Cancel/correct uses existing qualification and source lineage, preserving original ledger/evidence and affected request stage |
| Reconcile / report | Finance reconciles voucher, bill, bank/card and ledger under §3.4; AP, aging, Daily Bank and reports use the same accepted source arithmetic | Missing bank evidence remains unresolved; current waiting-voucher status is not a historical snapshot. Supplier payment never changes customer receipts, goods custody or Delivery completion |

**Configuration and handoff:** Finance-only supplier economic details link Purchasing's supplier identity; People/Workspace supplies qualifications and Cover. Existing Chart/account roles, currency/rate inputs, qualified source permissions and document dates govern the Finance record. External-service activation, sample imports, closed-period activation and new cancellation/posting behavior require their existing specific review. Ordinary Tasks links the exact source result without confirming money or making a second account.

**Acceptance owed:** goods versus non-goods provenance; same paper/request retried; exact remaining payable after partial/advance/credit; preparer cannot check own voucher; qualified checker may approve; unqualified actor refused; stale source requires re-review; uncertain approval reconciles once; requester cannot read restricted Finance detail; cancellation returns the linked request to its source-derived stage; bank/card evidence and AP/ledger/report totals reconcile. These checks were not run by this document pass and do not approve accounting mechanics beyond existing law.

### 3.3 Staff payment requests

- **Build.** Staff with permission raise a request with the bill. Finance answers it with a voucher or a bill, and the requester can see which stage it has reached.
- The entry point is **one entry in the shared menu**, visible only to permitted staff. This is the first Jess-side change Chew approved (2026-10-03); the second is the area fold (§4.1).

**Payment requests approach — PROPOSAL / NOT LAW, built for Chew's test (0645).**
- **Who may ask.** Finance or the boss (the principal) ticks which Operation, HR and BD staff may ask, under Finance Settings → `Payment requests` (Chew 2026-10-03; 0648 — 0645 let only the boss; HR and BD since 0687, Chew 2026-10-12 「hr & BD 也到能申请」). Only the people ticked see the menu row and can ask. Finance and the principal may always ask. Each grant is kept, with who gave it and who took it back: unticking never deletes it.
  - It is a permission per person, kept by Finance, as the warehouse keeps its capability grants. It is not a Workspace duty, which has one holder a day, and it is not an HR position permission.
  - A shared login cannot be ticked; only a person's own account can.
  - **HR and BD: BUILT 2026-10-12 (0687), probed on production and rolled back. It puts a row in their menus (§1 Exceptions): Chew told Jess, and 0687 was APPLIED 2026-10-12 on his 「可以套用」, the tracker holding the file exactly (md5 `d124c8531f5cb2f000ceab138839975d`). DEPLOYED 2026-10-12 (PR #2015, `6280b170`); checked on production, read only: Finance Settings → `Payment requests` shows `Works in` and lists the two Operation staff; no HR or BD person's account exists yet, so none is listed.**
    - HR staff who are ticked see `Payment Requests` at the end of the HR rail.
    - BD staff who are ticked see a `Payment Requests` pill on the POS top bar, after `Accounts`. Their page has `Back to POS`.
    - Under `/finance`, HR and BD reach Payment Requests and nothing else.
    - Measured (production, rolled back): with one BD login counted as a person for the probe, Finance's list showed it beside the two Operation staff; the boss ticked it; it asked, and saw its own request. The other BD login, a shared one, could not be ticked and may not ask; a dealer could not be ticked.
    - Before Chew's test: today there is no HR account, and both BD accounts are shared logins, so one person's HR or BD account is made under HR → Team first.
- **Asking.** The person fills `Payment Requests → New Payment Request`: who to pay, the amount, what it is for, pay by, the bill's own number and date, the bank details and a note. The bill must be attached before the request is sent. The request takes a number, `PRQ…`, drawn like every formal document.
- **Finance's answer.** Finance sees the requests waiting for it and answers each with `Make payment voucher` or `Make bill`.
  - The voucher or bill form opens pre-filled from the request. Saving it answers the request.
  - One request has one live answer, and one document answers one request.
  - A request with no bill attached cannot be answered.
  - Finance may instead `Return request` with a reason. The person changes it and sends it again.
- **The stage** is read every time from the voucher or the bill, never stored: preparing, waiting for approval, paid, bill entered, partly paid. If that voucher or bill is cancelled, the request goes back to Finance, which answers it again or returns it.
- **The person who asked** sees only their own requests, the stage, and the voucher or bill number, but not the voucher or bill itself. They may change or withdraw a request until Finance answers it.
- **The shared menu** gains one row, `Payment Requests`, under Operations → Workspace. It shows only to the staff allowed, and to the boss, who may always ask; Chew 2026-10-03: it is fine in her menu. Finance and the boss also find it under Finance → Payables.
- **The files** go to their own private store, so the person can upload without being given Finance's files. That store has two new access rules of its own; no existing rule changed.
- **Not built:**
  - Asking for the balance of a bill again.
  - The official invoice owed after a proforma.
  - Reading the bill on the request.
  - A request that names an event.
- **Falsifier:** in Chew's test, a requester sees a stage that does not match the voucher or bill, or someone the boss did not tick can ask.

### 3.4 Bank and cards

| Topic | Decision |
|---|---|
| Card (merchant) reconciliation | **Build fully.** Covers Public Bank, Maybank, GHL, Hong Leong and AhaPay, plus online money (Stripe, DuitNow). |
| Bank reconciliation | **Build inside Finance**, outside daily Payment. This matches Payment MASTER "The collection workspace": "Finance checks the bank outside daily Payment". Payment §13's reject of a bank-matching workspace *in Payment* is unchanged. |
| Daily Bank | **Build.** |
| Daily cash close | **Not built (Chew 2026-10-03).** No cash is kept in the stores: every cash receipt is banked. A cash over or short is the difference between the cash recorded and the cash banked; bank reconciliation finds it, and it is booked to a cash over/short account. |

**Card reconciliation approach.** It follows Houzs Part 7, adapted for Carres. Details are confirmed with Chew before build.

1. A card payment recorded in Payment already posts into a holding account for that card company; this is how Carres works today. The customer's balance is cleared at the full amount.
2. Finance uploads each card company's settlement report (CSV or Excel). The system matches it to the recorded card payments:
   - lines with a unique reference match automatically;
   - every other line waits for a person to confirm.

   Confirming a line books the card fee.
3. When the payout reaches the bank, bank reconciliation records the net amount received.
4. Public Bank's payout advice (PDF) splits one bank credit across several reports.
5. A charge the bank takes separately is booked to an expense account that Finance picks.
6. Three lists:
   - payments not yet matched;
   - money still with the card companies;
   - card payments that no report has shown yet.
7. One report: the card fees per card company per month.

AhaPay, Stripe and DuitNow are not in Houzs, so they are designed separately for Carres.

Carres already has a simpler Card settlement. It takes Public Bank, GHL and Maybank reports, and approving a day moves that day's money to the bank. This work extends that page rather than adding a second one.

**Daily Bank approach — PROPOSAL / NOT LAW, built for Chew's test (0637).**
- One row per money account (cash, bank, card and online holding) for the chosen day: `Brought forward` · `Inflow` · `Outflow` · `Balance` · `Waiting for approval` (checked vouchers paying from it) · `Available to pay` (balance less waiting; cash and bank only) · `Waiting for card payout` (holding accounts only, never available to pay). The totals are the table's footer.
- Opening a row lists the day's entries on the account and the vouchers waiting, totalled.
- A reversed entry and its contra both show, as the Journal shows them (0469). Houzs leaves the pair out; Carres keeps one reading of the ledger.
- `Waiting for approval` is read from each voucher's status now, so an earlier day cannot show what was waiting on it at the time; the page says so on an earlier day.
- Until Finance enters opening balances (§3.5), `Brought forward` counts from go-live, and the page says so.
- Not built: Houzs's picture export for WhatsApp, and placing each card holding account under the bank it pays out to.
- Falsifier: in Chew's test, an account's `Balance` on a day differs from the Journal's running balance for that account on that day, or Chew needs a figure the board does not answer.

**Card money waiting approach — PROPOSAL / NOT LAW, built for Chew's test (0641).**
- Bank & Cards → Card money waiting, after Card settlement. Each card and online payment whose money has not reached the bank: the day it was posted, its document and order, its card account, how many days it has waited, and where it is: no card company file shows it yet · matched but the card payout is not prepared · the card payout waits for approval.
- It covers two of the three lists in "Card reconciliation approach" above: card payments no report has shown yet, and money still with the card companies. A payment leaves the list when its day's card payout is approved.
- The footer ties the list to the card and online holding accounts in the books; a card payout made by hand on Money moves shows as a difference.
- A test walks payments, a GHL file, a match, a prepared payout and its approval, reading the list after each step.
- Not built: report rows with no payment behind them (Card settlement already shows them per day), and transfers waiting for the bank statement (that needs Bank reconciliation and its samples).
- Falsifier: in Chew's test, a payment Chew knows reached the bank is still listed, or the footer's difference is not explained by a manual card payout.

### 3.5 Ledger, month-end and tax

| Topic | Decision |
|---|---|
| Closed months lock | Keep, but **do not switch it on**. |
| Month-end stock value: groups | Four groups: warehouse, showroom, in transit (road, transit points and partner legs) and sent for repair. Supplier consignment and dealer stock are excluded; Stock MASTER §12.9 says dealer display stock is the dealer's own. |
| Month-end stock value: source | The P&L and Balance Sheet show the stock value live each time they are opened, worked out from Stock's Units (reading only) and marked **provisional**. Once Stock's Month-end Stock Confirmation (Stock MASTER §12.10, not built) confirms a month, Finance stores that month's value and it never changes again (Chew 2026-10-12, 「存货价值就不能定成我开P&L 时每次都是live 的，然后当jess 那边月底存货确认就 我这里储存起来不会再改」). **APPROVED. The live part is BUILT and APPLIED 2026-10-12 (0688); storing a confirmed month waits for Stock's confirmation.** See "Stock in the statements" below. |
| Opening balances | Finance's own figures at go-live. No old transactions are brought in, because CLAUDE.md §6 stands; the opening is a set of balances, not history. **APPROVED (Chew 2026-10-21/22); BUILT, APPLIED and DEPLOYED 2026-10-22 (0705): the place to enter them is built; Chew gives the amounts later.** See "Opening balances" below. |
| SST | Carres is not SST-registered, so there is no tax on invoices. |
| Year-end close | Later, before year end. |
| More than one company | Not needed. |
| Event or project costs | Not needed. |
| AutoCount | Stop using it once the ERP is stable. |

**Opening balances — APPROVED (Chew 2026-10-21/22); BUILT and APPLIED 2026-10-22 (0705, tracker 20261022035556, md5 equal to the file), DEPLOYED.** The place to enter them is built first; Chew gives the amounts later (「opening balance 要有地方输入先，数额我过后才提供」).
- **Page.** Ledger → `Opening balances`, after Journal. Tabs: Accounts · Customers and other debtors · Suppliers · Stock · Customer deposits. Finance enters it as a draft, saved and changed freely; the draft is not in the ledger.
- **Accounts.** Every account that is not a control account, bank and cash included. Income and expense accounts take their year-to-date balance before go-live, account by account, so Carres prints the whole year's P&L (Chew 2026-10-22, 「b」).
- **Customers, other debtors and suppliers.** For each party, its total owed first, then each invoice or bill still open (document no, date, due date, amount), so AR / AP Aging age it and a receipt or payment can settle that document. The open items should tally to the total; a party whose items do not tally may still post, with a remark showing the difference (Chew 2026-10-22, 「先输入总数，再输入每张欠的钱，两边应该tally」 and 「opening balance 可以 post 先，只是要 remark 有 different」). The part not covered by items shows as not tied to an invoice / bill.
- **Stock.** Each Unit held at go-live with its cost, pasted from Excel (Unit, cost); an unknown Unit is shown, never guessed. Finance keeps these costs as its own record and Stock value reads them for a Unit with no PO cost; Stock's records are not written (Chew 2026-10-22, 「A，可以从 Excel 贴进来」).
- **Customer deposits.** Each customer's deposit per order not yet delivered (customer, order, amount), pasted from Excel or keyed; when that order is invoiced the deposit is set against it automatically (Chew 2026-10-22, 「a」).
- **Post.** Posting writes one ledger entry dated the day before go-live, every line balanced against `160-0000`, which must be zero after it. Each party's total posts on its control account with its party. Posted once; a mistake is corrected by reversing and posting again before the first month is closed. Every report then shows it as `Brought forward` instead of `No opening balances`.

**How it is built (0705, on branch `finance-opening-balances`; not applied, not deployed).** Words: COPY-STANDARD "Opening balances (Chew 2026-10-22, approved design)".
- **Finance's own record.** Six tables: the one opening (draft or posted, its entry, who and when), its accounts, its parties with their open items, its Units with their cost, and its customer deposits. RLS on, read by Finance and the principal as every Finance table; no direct write. Stock's, Orders' and Payment's tables are only read; a Unit or an order is found by its exact Unit or SO No and is never held by a foreign key.
- **Who.** Finance and the principal save the draft; `Post` and `Reverse` are the principal's, the same right as the manual journal and the go-live date (`is_principal()`, reused). Every save carries the draft's last saved time, so two people never overwrite each other unseen.
- **Accounts tab.** Every active account that is not a heading or a control account, less `160-0000` itself, the stock account (the Stock tab posts it) and the old supplier advance account. Income and expense accounts take their year to date, so a whole-year Profit and Loss reads them.
- **Parties.** One row per party: its control account (a customer's defaults to Showroom Debtors, an other debtor's to Other debtors, a supplier's to Trade Creditors), its total (below zero allowed), and its open items (document no, a date before the books start, due date, amount). A party whose items do not tally posts; its `Remark` shows the difference.
- **Stock tab.** Pasted from Excel (Unit, cost; tab or comma separated); a Unit not found is listed and Post waits until it is corrected or removed. The cost is per Unit; its value is the Unit's quantity times it. The stock total posts Dr `330-0000` STOCK.
- **Customer deposits tab.** Pasted or typed (SO No and deposit, or customer, SO No and deposit). The order decides the customer; a customer typed differently, a delivered order and an order not found show in `Remark`, and Post waits for an order not found. Each deposit posts Cr the order's own customer account (0685's channel account) with the customer, exactly as a customer payment posts, so the Balance Sheet's deposit line (0506) holds it.
- **Post.** One entry, source `OPENING`, document `OB-{go-live yyyymmdd}`, dated the day before go-live. Refused while debits differ from credits, and refused again if `160-0000` would not be RM 0.00 after it. One OPENING entry stands at a time (an index). `Reverse` (with a reason) reverses it through the ledger's own reversal and returns it to draft; both are refused once the books are closed on or after its date (0622).
- **The date.** `gl_post` refuses every entry before go-live except this one: the exception is one function, `gl_entry_date_ok`, which `gl_post` and the Self-check's "No entry is dated before the ledger started" both ask. A later rebuild of `gl_post` that drops it fails closed (Post is refused), never silently.
- **The reports.** The Trial Balance, Balance Sheet, General Ledger, Cash Flow, Daily Bank and party statements already read every entry up to their day, so they carry it. A Profit and Loss whose period starts on or before the day before go-live carries the year to date. Every caption reads `Brought forward` once it is posted (the Dashboard's cash chart keeps `No opening balances`: it is money in and out from go-live).
- **AR and AP Aging.** Each posted open item ages by its due date (its date when it has none). What a payment voucher paid on an opening bill comes off that bill first. Then the party's money since go-live that no other open document takes (an overpayment, money on account) is set against its open items, oldest due first; the rest of the balance stays `Not tied to an invoice` / `Not tied to a bill`. A customer's money on an order still waiting for its invoice (a receipt, or a deposit brought forward) is that order's and never settles an old invoice; the invoice takes it when the order is invoiced. One arithmetic, `fin_opening_items_open`, for both agings. An opening deposit is its order's money in AR Aging, so it fills that order's invoice first, as a payment does. Payment's code and tables are not changed.
- **A payment voucher pays an opening bill** exactly as it pays a bill or a debit note: the voucher form lists the supplier's opening bills under `Opening bills to pay`, each with what is left to pay; a ceiling holds the amount to the bill; approval posts Dr the bill's payables account with the supplier; the voucher's page lists `Opening bills paid`. What is paid (`ap_opening_item_settled` / `ap_opening_item_paid`) reduces the bill in AP Aging, in the voucher's list and in Unpaid by Supplier. Reverse is refused while a voucher that is not cancelled pays an opening bill. An advance or a credit note is not knocked off an opening bill; a voucher pays it.
- **Unpaid by Supplier and the Self-check.** Unpaid by Supplier counts each opening bill as a bill and lists it under the supplier; its Net owing adds the rest of the supplier's opening total, so it stays the supplier's payables account in the ledger. The Self-check's receivables add the opening customer totals less the deposits to Payment's invoices less receipts, so the posted opening is no difference.
- **Stock value.** A Unit with no PO cost takes Finance's opening cost once posted (0643's value, which the statements' stock on hand reads, 0688).
- Measured before writing (production, read only, 2026-10-22): every function text 0705 changes (the ledger, the agings, Stock value, the payment voucher, Unpaid by Supplier and the receivables check) was found exactly once in its live definition; `160-0000` holds no line; go-live is 10 Sep 2026; no month is closed. The migration's own walk (rolled back inside it) checks the tally remark, the out-of-balance refusal, the `160-0000` zero, one post, the stale save, the date exception, the oldest-first settling, Reverse with its reason and its closed-month refusal, and posting again. It runs end to end on PGlite in `apps/api/src/test/finance-opening-balances-0705.test.ts` (with the voucher paying an opening bill, the deposit waiting for its invoice and the Self-check receivables), against production's definitions of the functions it changes; it has not run on production.
- **Not built (the remaining gaps).**
  1. Opening lines carry no channel (department). With a channel chosen, the Profit and Loss leaves out the year to date, and AR Aging's `Channel` does not count opening amounts.
  2. A customer must already be a ledger customer (a customer row) to be picked on the Customers tab; Finance does not create customers. A deposit's customer is created from its order at Post, as a customer payment does. A customer who owed money at go-live with no order in the portal is entered as an other debtor.
  3. Stock value counts a Unit only once it exists in Stock by the day it values; Units imported on go-live day are not stock on hand at the end of the day before go-live, so the Balance Sheet on that day shows the posted `330-0000` replaced by RM 0.00. From go-live on they agree.
  4. A customer receipt is recorded by Payment against an order, never against an opening invoice, and AR · Receivables (Payment's register) does not show opening invoices; only Finance's AR Aging and statements do.
- **Settled (coordinator, 2026-10-22, from Chew's rulings).** Ruling B covers the year's figures: every income and expense account takes its year to date, `600-0000` STOCKS AT THE BEGINNING OF YEAR included, on the Accounts tab. A deposit paid after go-live for an order not yet invoiced never settles an old invoice (above).
- Falsifier: in Chew's test, a report on the day before go-live or later differs from the figures he entered, an opening item ages in the wrong column, or `160-0000` is not RM 0.00 after Post.

**Stock value approach — PROPOSAL / NOT LAW, built for Chew's test (0643).**
- Reports → Stock value, for a month end. Every Carres-owned Unit held at the end of that day (Kuala Lumpur): free, reserved, on hold or on a movement. Incoming, sold and ended Units are not counted; consignment Units are counted apart and never valued.
- Each Unit's status, Site, holder and ownership are read back to that day from Stock's own log of changes, so an earlier month shows the Units as they stood then. The current month shows them as they are now, and says so.
- Groups, first match wins: `Sent for repair` (collected on a repair pickup) · `In transit` (any other movement, a Unit a logistics company holds, or a Unit at a transit point such as AL or HOUZS) · `Showroom` · `Warehouse` (any other Carres Site) · `Not placed` (listed, never dropped).
- Each Unit is valued at its PO line cost; a free-of-charge line costs nothing. A Unit with no PO line, or a line with no price, has no cost recorded: it is counted in `No cost recorded` and never valued as zero.
- Nothing is saved and nothing is entered in the ledger; Stock MASTER §9 keeps the month-end total Stock's. When Stock's Month-end Stock Confirmation exists, it is the figure and this page is retired.
- Measured 2026-10-03 on the test data: 344 Units and 10 quantity rows are held, and nearly all have no PO line (opening imports), so nearly all show `No cost recorded`. Go-live starts clean (CLAUDE.md §6), so after it Units come from POs with their cost.
- Showroom: Stock has no Site type yet, and its own register finds PJ Showroom by its name (Stock MASTER §12.9). This page counts a Unit as Showroom when a showroom party holds it, its Site's profile names one, or its Site is named as a showroom. When Stock adds a Site type, the page reads it instead.
- Chew 2026-10-03: this page is Finance reading Stock's data, and it is separate from Stock's Month-end Stock Confirmation (Stock MASTER §9), which it neither feeds nor replaces.
- Not built: posting the value to the ledger, and valuing the go-live opening stock, which comes in without a PO cost. Both go to Chew. The statements show the value without posting it (below).
- Falsifier: in Chew's test, a Unit Chew knows was in the showroom or out for repair at a month end shows in another group, or a value differs from its PO line cost times its quantity.

**Stock in the statements — Chew's ruling (2026-10-12); BUILT 2026-10-12 (0688), probed on production and rolled back; 0688 APPLIED 2026-10-12 on Chew's 「做」 for the build batch, the tracker holding the file exactly (md5 `11e18683b30c3be9a8bd544ecccb5d9d`). DEPLOYED 2026-10-12 (PR #2017, `147fd54b`); checked on production, read only: October's Profit and Loss and the Balance Sheet on 12 October carry the stock note under All, the test stock adds RM 0.00, and the Balance Sheet balances (assets RM 15,280.57 = liabilities RM 15,614.00 + equity RM −333.43).** The layout below is PROPOSAL / NOT LAW.
- Nothing is posted. The statements show stock on hand the way AutoCount's do, from the stock value of the day, on the accounts AutoCount marks for it.
- **Profit and Loss, All departments:**
  - the opening stock account (SOS, `600-0000`) carries the stock on hand at the end of the day before the period, which adds to the cost of goods sold;
  - the closing stock account (SCS, `620-0000`) carries the stock on hand at the end of the period, which takes off it.
  - Purchases already post to the cost of goods sold (0477), so the period's cost reads opening stock + purchases − closing stock.
- **Balance Sheet, All departments:** the stock account (SBS, `330-0000`) shows the stock on hand on the day in place of what the books hold on it. The difference joins `Net result not yet closed`, so the sheet still balances. The line's mark says how much it added.
- **The stock on hand** is the sum of Stock value's Unit values (0643), the one arithmetic both read. A Unit with no cost recorded adds nothing. It is provisional, and each statement says so underneath.
- **With a department chosen** there is no stock on either statement: stock on hand is not split by channel.
- Measured before applying (production, rolled back, 2026-10-12):
  - With the test stock worth RM 0.00, both statements were unchanged.
  - With two PO lines given a cost for the probe, the stock on hand was RM 1,500.00. October's Profit and Loss showed RM 1,500.00 at the start and −RM 1,500.00 at the end.
  - The Balance Sheet's stock line showed RM 1,500.00, its result rose by the same, and it balanced.
  - September's closing stock equalled October's opening stock.
  - Under Showroom neither statement showed stock, and the Balance Sheet balanced.
- Not built:
  - storing a month once Stock's Month-end Stock Confirmation confirms it (that confirmation is not built);
  - stock on hand by channel;
  - the go-live opening stock value.
- Falsifier: in Chew's test, a statement's stock differs from Stock value for the same day, or the Balance Sheet stops balancing.

#### Year-end close — complete review recommendation, 9 Oct 2026

**PROPOSAL / NOT APPROVED / NOT BUILT.** This replaces the missing journey with a reviewable contract; it does not activate §3.5's parked period locks/opening balances, decide fiscal dates, approve accounting entries or expand Chew's release scope. Houzs Finance remains inaccessible to this study account; its private V5 is not fetched or copied. Existing Chew-approved adaptation in this MASTER is the Finance authority. A bounded [Odoo official year-end reference](https://www.odoo.com/documentation/18.0/applications/finance/accounting/reporting/year_end.html) search excerpt supports an accuracy/up-to-date review before closing; full-page fetch timed out, so no detailed Odoo closing-entry or lock mechanics are adopted.

**Purpose and trade-off:** Finance should review one traceable year-end evidence package, identify unresolved source problems and preserve approved results. The added preparation/version history costs effort but prevents a completed checklist being confused with approved ledger treatment or locked periods. Reject a second stock total, copied supplier/customer transactions and a one-click close that hides incomplete source coverage.

| Journey / responsible source | Recommended action and result | Exception / handoff |
|---|---|---|
| Define the review | Finance selects the authorised fiscal period and company ledger; record cut-off, calendar/time zone, source coverage and report as-of/version | Fiscal start/end, prior-period correction and exact close/reopen qualification remain explicit decisions for Chew; never assume calendar-year end or infer approval from a duty label |
| Prepare and reconcile | Read original ledger/report versions, bank/card reconciliation, payable/receivable source lineage and outstanding differences; record each reconciliation's accepted evidence | Unreadable or incomplete sources remain named gaps. No guessed balancing number, duplicate payment/bill or invented clearing transaction |
| Reconcile stock | Read Stock's acknowledged confirmation version when available; retain Finance's valuation mapping and missing-cost coverage separately | Current provisional Stock reading remains labelled provisional. Supplier consignment/dealer-owned exclusions and repair/transit groups follow §3.5; no Finance-created physical count or duplicate month-end total |
| Resolve differences | Finance corrects its own documents through existing qualified doors; an Orders/Payment/Purchasing/Stock discrepancy links to that owner and retains returned evidence | Preparation never edits another module. Bank/card file samples, missing account mapping and unverified valuation/posting remain open; task completion alone is not accepted reconciliation |
| Review adjustments | Present proposed Finance adjustment facts, basis, accounts, date, evidence and report consequences through the existing applicable approval route | Exact year-end journal/retained-earnings treatment and posting permission require Chew's approved design. This proposal specifies no debit/credit formula and does not enable posting |
| Confirm review / retain results | Qualified reviewer records the accepted package version and unresolved/provisional scope. Preserve ledger/report/source identities and actual actor/time | A source change invalidates the affected review; disclose new differences and request re-review. Saved package is not a period lock or automatic financial finality |
| Close / later correction | After the specific approved close contract exists, show its gates and result; retain historical package and any subsequent correction/review lineage | Lock activation, exception access, reopen/correction and next-year carry treatment remain NOT APPROVED here. Never delete ledger history, reset accounts, duplicate go-live opening balances or silently revise prior reports |

**Settings, work and reports:** any eventual fiscal configuration, close qualification and effective treatment stays Finance-owned within the shared Settings home. Work links the exact source discrepancy/review, named qualified person and accepted outcome; no invented year-end deadline or automatic approval. Reports consumes the same ledger/date/coverage definitions and retains the accepted package's as-of/version; later live reports disclose changed sources instead of impersonating the old result. Export/access follows existing Finance permissions; no new generic scheduled send or public file store.

**Review acceptance:** missing bank evidence blocks that reconciliation; missing stock confirmation remains provisional; another module's corrected source invalidates only its affected review facts; repeated submission cannot double-post an adjustment; unqualified callers cannot close/correct; denied/failed actions preserve draft/evidence and prior ledger; old results remain traceable after a permitted correction. Complete this rule/permission/source review with Chew before implementation; no application or production verification is claimed.

### 3.6 Reports

The reports are:
- Profit & Loss, and Balance Sheet, both by month;
- Cash Flow;
- General Ledger and Trial Balance;
- formal AR and AP aging;
- Performance P&L, **without** an operating-expense percentage;
- Collection, Card charges and Dealer commission;
- Dashboard;
- Forecast, built last.

All reports only read. Reports → Payment stays Payment's.

**Report drill-down — Chew 2026-10-21 (approved). BUILT and DEPLOYED 2026-10-21; no migration.**
- On Profit and Loss, Balance Sheet and Trial Balance, an account line's chevron opens, right under the line, the ledger entries behind it: `Date` · `Entry No` (the Journal entry, as the General Ledger links it) · `Description` · `Document` · `Party` · `Amount`, on the line's own side so they add up to the line. A second click folds it. A heading, a subtotal, a section band and the bottom line do not drill. It is the kit's own disclosure: a button, one click, as every Finance button (Chew kept the chevron, 2026-10-21).
- One arithmetic: the entries are the General Ledger's own read (`fin_general_ledger` for that one account, `GET /finance/ledger/report-drill`), checked by the same reader, for the report's own period (Balance Sheet and Trial Balance: the ledger's first day to the as-of day) and department. The statements and the Trial Balance count the same rows: posted entries, the department's lines (`gl_department_lines`), those days. The page only adds the entries up to check; when they do not equal the line, the difference shows in red under them (`Entries add up to RM x; the line shows RM y.`).
- Not ledger figures, so they do not drill: under All, the stock accounts carrying live stock from Stock's Units (0688: SOS and SCS on the Profit and Loss, SBS on the Balance Sheet), and `Net result not yet closed`. Under a department they are the books' own and drill. Nothing drills until the chart is read.
- Money paid before its document (Chew 2026-10-21). On the Balance Sheet the money moved between lines (0506 customers onto `Customer deposits held`, 0507 suppliers onto `Advances to suppliers`) shows as rows under the drilled entries: `Moved to {line}` on each line the money leaves, `Moved from {line}` on the line it reaches (one row per line it came from), on the line's own side, so the entries and the moves add up exactly to the line. The amounts are the report's own `reclassified`, as `gl_balance_sheet` served them for that statement; nothing is worked out again. Any other gap still shows in red.
- Exports and the month-end pack are unchanged. Words: COPY-STANDARD, Finance, "Report drill-down" (approved by Chew 2026-10-21).
- Falsifier: in Chew's test, a drilled line whose entries differ from the General Ledger for the same account, days and department, or a red difference on a line that is the books' own.

**Cash Flow approach — PROPOSAL / NOT LAW, built for Chew's test (0638).**
- A receipts and payments statement of the cash and bank accounts, as Houzs's Cash Flow is; not an indirect cash-flow statement. Reached from a door on the Reports page, like Card charges.
- Each line names the account on the other side of the money. A line that pays several things is shared across them in proportion, to the sen, so the lines always add up to the accounts' money in and out.
- A move between two of Carres's own cash or bank accounts shows as a transfer, in on one and out on the other.
- Code and Account are two columns, as on the Trial Balance, Profit and Loss and Balance Sheet (Chew 2026-10-21, 「Cash Flow 也一起做」): the line's account code is in `Code`, the code alone the link to the Journal on that account for the period; `Account` carries the words without the code (`{name}` · `Transfer from {name}` · `Transfer to {name}` · `Card payout from {name}`). A row that names no account leaves `Code` empty. By account does the same. Export Excel and Export PDF write the same three columns (`Code` · `Account` · `Amount`); a section total or a bottom line has its words under `Code`, as it reads across both on screen.
- Card and online money counts as cash when its card payout reaches a bank. Until then the foot shows the card and online payments of the period and what still waits for its payout.
- For one day, each account's figures equal Daily Bank's; a test holds the two together.
- Not built: Houzs's split of a supplier payment into what the bills bought ("rule A"), one column per account, the by-month view and a layout editor.
- Falsifier: in Chew's test, an account's carried forward differs from its Journal running balance on the last day, or a line Chew cannot tell what it was for.

**General Ledger approach — PROPOSAL / NOT LAW, built for Chew's test (0639).**
- Ledger → General Ledger, after the Journal. Every account that moved or carries a balance in the period, in code order: `Brought forward`, each line with the balance after it, then `Total` with the period's debits and credits and the balance at the end.
- The figures are the Journal's own account ledger (0540), gathered for every account, so the two can never disagree; a test holds them together. Reversals and their contras both show, as on the Journal.
- A search narrows the accounts, never the lines; the department filter is the ledger pages' own. Export Excel writes the page's rows.
- Not built: Houzs's "other side" and the second reference column, an account range picker, and a PDF.
- Falsifier: in Chew's test, a balance here differs from the Journal's running balance for the same account and day, or Chew needs a column this report does not carry.

**AP Aging approach — PROPOSAL / NOT LAW, built for Chew's test (0640).**
- Reports → AP Aging. What was owed to each supplier on a chosen day: its balance on the payables control accounts in the books, its confirmed bills still owed that day by age, and `Not tied to a bill` for the rest of the balance.
- Columns by whole calendar months (`This month` to `4 months and over`) or by 30-day steps, aged by bill date or due date, as Houzs's formal aging is.
- A voucher pays a bill on the voucher's own date, the date it posts on; an advance knocked off a bill counts from the day of the knock-off until it is cancelled. How much of a bill is paid has one arithmetic, `ap_bill_settled`, which AP · Payables also reads now (its figures do not change).
- Each row adds up to the supplier's balance in the books, and the footer ties the rows to the control accounts with the difference. A test walks bills, a voucher with an advance and a knock-off through the real doors and reads three days.
- Not built: the trade or other payables chips, and a PDF.
- Falsifier: in Chew's test, a supplier's balance here differs from AP · Payables' net owing today, or the footer's difference is not zero.

**AR Aging — Chew's ruling (2026-10-03; 2026-10-12, 「就根据开了invoice还没还的就出现…包括普通顾客」); BUILT 2026-10-12 (0686) for Chew's test; 0686 APPLIED 2026-10-12 on Chew's 「做」 for the build batch, the tracker holding the file exactly (md5 `66467f6080314aa58d68ab79239159bb`). DEPLOYED 2026-10-12 (PR #2014, `e13fd964`): every production surface reports that version. The layout and the arithmetic below are PROPOSAL / NOT LAW.**
- Reports → AR Aging, after AP Aging. Every invoice issued and not yet fully paid on a chosen day, for ordinary customers (Payment's sales and storage invoices, read and never changed) and other debtors (Finance's own invoices). It is aged as AP Aging is: by month or by 30-day steps, by invoice date or due date.
- What a customer's invoice still owes is worked out on the books' own window, from the ledger's start to the day:
  - the order's payments fill its earliest invoice first;
  - a voided invoice or payment never counts, because a void reverses on the document's own date;
  - Payment keeps no balance per invoice, so this is the aging's own arithmetic over Payment's records. It agrees with the books because the books post the same invoices and payments.
- An other debtor's invoice still owes its total less the receipts allocated to it by the day.
- Each row is one debtor:
  - its balance on the debtor accounts in the books;
  - its open invoices by age;
  - `Not tied to an invoice` for the rest; below zero, it is money paid ahead of an invoice, such as a deposit.
- The footer ties the rows to the debtor accounts and shows the difference.
- `Channel` names the one channel a debtor's balance sits in, or `Several channels`. Invoices issued before the ledger started are not aged; the page says how many there are and how much.
- Measured before applying (production, rolled back, 2026-10-12):
  - Today's 7 customers each had money paid ahead and no open invoice. Together they equalled `300-0000` exactly.
  - An invoice of RM 2,629.00 on an order with a deposit of RM 1,315.00 showed RM 1,314.00 open, in Showroom. The day before the invoice, the deposit was money paid ahead.
  - An other debtor's invoice of RM 500.00 with RM 200.00 received showed RM 300.00 open. The day before the receipt it showed RM 500.00, and nothing before the invoice. The other debtors' account agreed.
  - Operation could not read it.
- Checked on production after deploying (read only, 2026-10-12): the 7 customers showed their money paid ahead under `Not tied to an invoice`, RM -13,928.00 in all, equal to `300-0000 + 305-0000`, difference RM 0.00.
- Not built: a customer refund (refunds do not post to the debtor accounts yet), a PDF, and a view by debtor account.
- **The channel of money paid ahead — Chew 2026-10-12 (「可以，补上 AR Aging 的 Channel」); BUILT 2026-10-12 (0690), probed on production and rolled back; 0690 APPLIED 2026-10-12 on Chew's word, the tracker holding the file exactly (md5 `de9000f9beadedfda6b1aa1693c13666`). DEPLOYED 2026-10-12 (PR #2026, `b9b93bff`); checked on production, read only: the 7 customers with money paid ahead each show a channel (3 the showroom, 4 their dealer), and the difference is RM 0.00.** Found on production: a row with money paid ahead and no open invoice showed no `Channel`, because the channel was read from the open invoices only.
  - Now the channel is where the debtor's balance sits: its lines on the debtor accounts, added up by the department the reports already give each line (`gl_line_departments`: an invoice's or a payment's order, or the department its entry names). A channel at RM 0.00 is left out.
  - So a deposit names its order's channel, including money posted before step 3 (0685) on `300-0000`. A debtor with an open showroom invoice and a deposit on a dealer order shows `Several channels`.
  - Measured before applying (production, rolled back, 2026-10-12): the 7 customers with money paid ahead each named one channel (3 showroom, 4 dealer), its amount equal to their balance; everything else in the answer was unchanged; Operation could not read it.
- Falsifier: in Chew's test, a debtor's open invoice differs from what Payment or Other debtors shows for it, or the footer's difference is not zero.

**Collection report approach — PROPOSAL / NOT LAW, built for Chew's test (0644).**
- Reports → Collection, after Houzs Part 10 §6. The sales orders placed in a period (by SO Doc Date, a Kuala Lumpur day), not cancelled and not rental, per salesperson. Two views on a tab bar:
  - `Deposit`: orders, order value, deposit, deposit % and how many orders fell below a chosen share (`Below (%)`, 50 unless changed).
  - `Balance`, delivered orders only: invoiced value, deposit, balance due, balance paid, balance % and outstanding.
- Opening a salesperson lists the orders.
- Deposit is the money taken with the new order (payments of kind `deposit`); balance paid is every other customer payment, storage excepted. Both are read from live allocations, so a payment moved by Payment's `Correct allocation` counts on the order it was moved to, and a voided one counts nowhere.
- Invoiced value is the live sales invoice; without one, the order value. The test proposal originally counted an issued sales invoice as delivered; that shortcut is rejected by the current Payment §2 closing-invoice and Delivery actual-result laws. The corrected target reads Delivery's authoritative customer-leg result/goods scope. Invoice issue alone never establishes delivery; exact partial-order inclusion and denominator require Finance metric review rather than inventing all-delivered treatment.
- The salesperson is the order's salesperson now.
- It reads Orders' and Payment's records and changes none. It is per salesperson, so it does not repeat Payment's own reports, which are per order and per customer.
- Not built: refunds netted against what was collected; an as-of date (the money is as it stands today); a PDF.
- Falsifier: in Chew's test, a salesperson's deposit or balance differs from what Payment's records show for the same orders, or Chew counts deposits differently (for example, every payment before the invoice).

**Forecast approach — PROPOSAL / NOT LAW, built for Chew's test (0646).**
- Reports → Forecast, after Houzs Part 10 §18. One month at a time (this month unless chosen): a plan for each income and expense account of the chart, beside what the Profit and Loss shows for that month, and `Difference` (actual less plan).
- An income account is planned as an amount. A cost or expense account is planned as an amount or as a % of the month's planned income; typing one clears the other, and the other box shows what it works out to in grey. The blocks are `Income`, `Cost of sales` (the top heading that holds the cost of goods sold account, by role) and `Expense`; `Gross profit` comes after cost of sales and `Net result` at the foot, the P&L's own word.
- The whole month saves at once. Every box is checked first; a wrong one is named above the table, and the database names the first wrong cell again and keeps nothing. When someone else saved the month after it was opened, the save is refused and `Discard` shows their plan. The month cannot be changed while a plan is not saved.
- `Copy plan from {month}` fills the boxes left blank from the latest earlier planned month: amounts and shares both, never over a typed box. Houzs copies shares only; Carres copies amounts too because a fixed cost such as rent is planned as an amount.
- A plan is kept per account in its own rows, so a renumbered account keeps its plan (0570). Nothing posts from a plan. A month not started has no actual; before the ledger's start date neither does a month.
- Measured 2026-10-03: production has 13 accounts that can be planned (5 income, 2 cost of sales, 6 expense), so a month is one screen.
- Not built: Houzs's months across one sheet, the plan for a product group (its purchase-basis rule needs item groups Carres does not have), a plan on the Dashboard beside the actual, a frozen account column when the table scrolls sideways on a phone (the kit's table has none), export.
- Falsifier: in Chew's test, Chew needs to plan several months side by side, or reads `Difference` the other way round (plan less actual), or a gross profit or net result here differs from the P&L for the same month.

**Performance P&L — NOT BUILT.** A sold item's cost is the cost on its PO; an item with no PO shows no cost, never a guessed one (Chew 2026-10-03). Houzs reads each order line's cost from its sales order; Carres has no governed cost per sold line, and `product_skus.cost` was filled at 55% of the price as a placeholder, so it is not used.
- Plan, PROPOSAL / NOT LAW (2026-10-10, for Chew's review). Measured (read only): a PO line records the order lines it was bought for and how many (`po_line_sources`) and its cost (`purchase_order_lines.cost`); a stock item keeps the PO line it came from (`ops_stock_items.po_line_id`); a bill line keeps its PO line (`supplier_bill_lines.po_line_id`). So a sold line's cost can be read from its PO, as Chew ruled, without `product_skus.cost`. Recommended after channel step 1 ("Splitting the money by channel", §0), so a sale and its cost fall in the same channel: by month and channel, each order line's sale (read from Payment's invoices) beside its cost (the cost of the PO lines bought for it, for the quantity sold, or of the stock item delivered); a line with no PO shows no cost and is counted apart. Falsifier: in Chew's test, a sold line shows a cost that is not on its PO, or a line bought on a PO shows none.

## 4 · Menu

- **Status.** APPROVED by Chew 2026-10-03 (「都可以」), after he sent a picture of the menu he wants and the conflicts below were shown to him. Built in PR #1865, merged 2026-10-05.
- **Words.** Screen words come from `docs/COPY-STANDARD.md` "Finance (Chew)". A menu word is its page's title, so a page keeps one name. One exception stands from before: the row `AP · Payables` opens the page titled `Unpaid by Supplier` (ruling YH 2026-09-14).

```text
FINANCE          its title folds the area (§4.1)
├─ Dashboard
├─ Payments      Monitor · Payment Records                                   Payment's, unchanged
├─ Payables      AP · Payables · Payment Vouchers · Bills · Payment Requests · Credit Notes · Debit Notes
│                Notes to follow up · Suppliers
├─ Receivables   AR · Receivables · Other debtors · Other receipts
├─ Bank & Cards  Daily Bank · Card settlement · Card money waiting · Money moves
├─ Ledger        Journal · Opening balances (0705, on branch) · General Ledger · Trial Balance · Self-check
├─ Reports       Profit and Loss · Balance Sheet · Cash Flow · AP Aging · Collection
│                Card charges · Dealer commission · Stock value · Payment
├─ Forecast
└─ Rental Approver · Subscriptions · Dealers                                 unchanged
```

- **Reports.** One row per report. The Profit and Loss and the Balance Sheet are two pages: `/finance/reports/profit-and-loss` and `/finance/reports/balance-sheet`. The old `/finance/reports` opens the one its address asked for, keeping its dates. The old page's list of doors is gone, because every report is on the menu. Reports → Payment stays Payment's own report, unchanged; it is now also a row.
- **Forecast.** Its own row after Reports. It becomes a group when a second forecasting page exists.
- **No page repeats the menu** (Chew 2026-10-05). The switch `Bills | Payment Vouchers | Unpaid by Supplier` at the top of those three pages is retired; the menu is the one way between them. Two page switches stay because they lead to no menu page: Other debtors' `Parties`, and Dealer commission's `Commission rates` and `Renovation quotas`. Dealer commission also waits for its calculation check with Chew (§5).
- **A page joins the menu when it is built.** No `Coming soon` rows. Not built yet, from Chew's picture: Deposit Invoices, Not Yet Billed, Credit / Debit Notes, Official Invoices Owed, Bank Recon, Month-end, Corrections, Performance P&L, Event costs, Sales Report, a forecasting Dashboard, Currencies. Several of them are not decided yet.
- **Where the picture met an existing rule, the rule stays** (Chew agreed, 2026-10-03):
  - No `Money in` / `Money out` group names. Customer `Money In` is Payment's word (Payment MASTER §1).
  - No `Setup` group. The gear in the page header is the one Settings entry (UI MASTER, GLOBAL SETTINGS ENTRY, Loo 2026-08-11). Chart of Accounts and the rest stay in Finance Settings; Item groups is there (0659); Currencies goes there when built.
  - No customer `Official Receipts`, `AR Invoices` or `Receipts` pages. Customer money has one home, Payments (owner ruling 2026-09-12).
  - No icon on a page row. A group row carries the one icon (UI MASTER rail rules).
  - Payables stays above Receivables (ruling YH 2026-09-14: `AP · Payables` above AR).
  - The current page names stay (`Bills`, `Journal`, `Card settlement`, `Card money waiting`, `Card charges`, `Suppliers`, `Forecast`). Chew may rename a Finance page later, one at a time.

### 4.1 · The area you are in folds

- **Ruling.** Chew 2026-10-03 (「都可以」): the title of the area you are in folds it, and the next click opens it. Another area's title still jumps to that area, and the area you left closes, as before.
- **This is the second shared change Chew approved** (the first is §3.3's menu row). It applies to every area, on every login that sees area titles (principal-level logins). Jess's login sees it too; Chew approved that knowingly. Nothing else in the shared menu changed.
- The fold stays while you move between pages of that area. Going to another area and back, or reloading, opens it again.
- A folded area's title turns blue. It has hidden the page you are on, so it is the rail's one mark of where you are (the rail rule: a shut parent is lit).

### 4.2 · The Finance look

- **Ruling.** Chew 2026-10-13: the shared table read as one white sheet (「整体都算白灰色，我根本分不出」), with the code and the name run together, subtotals not set apart and no line between columns. He chose a look for Finance's tables only (header 「c」, selected row 「1」, 「可以，上线，然后套到整个finance」).
- **This is a Finance exception to the one kit** (CLAUDE.md, THE ONE KIT LAW, Jess 2026-09-27). Chew chose it knowing the rule and tells Jess, as with the Chart of accounts row icons. It is an opt-in on the shared table (`look="finance"`); every other module's page draws exactly what it drew before. If Jess adopts it, turning it on for every grid is the whole change.
- What it is:
  - the header band light blue (`#E8EEFC`, text `#1E3A8A`, 600);
  - a hairline between columns;
  - the table fills its box with ONE column (Chew 2026-10-14): each table names its main name, party or description column (`fillColumn` on the grid; Account on the statements, Description on the General Ledger, the line and the account on Cash Flow), which takes the width the others leave and never drops below its own; amounts, dates and codes keep their widths per field in `finance-widths.ts` (an amount 128, a code 96), cells 10 a side, so an amount up to RM 1,234,567.89 fits;
  - a header edge drags to resize a column (Chew 2026-10-14), the edge showing a line on hover; the width is remembered per person (on the server since 0704, below; this browser keeps a copy, the grid's saved layout or one Finance key per kit table, `carres.finance.widths.<table>.v1`). A dragged fill column keeps its width and stops filling. BUILT 2026-10-14 on branch, not yet deployed;
  - a selected row light grey (`#E9EBEF`) with a dark edge on its left, so it never reads as the blue header;
  - a subtotal row light grey and 600; the total row the same with a heavy rule above;
  - an account's code and its name in two columns, the code alone being the link;
  - a zero amount a blank cell;
  - a single click selects a row and a double click opens it, on every Finance table; buttons, links, ticks, ⋮ menus and row icons still act on one click, and Enter on a row is a double click (Chew 2026-10-14, 「点的时候都算双击点开，除了是按钮」);
  - rows 40 high, not the kit's 54 (Chew 2026-10-14, 「每个row 太厚了」, every Finance table); a row with a second line grows;
  - on Chart of accounts, the special type is its own column, `Special`, between Name and Type, the money accounts' SBK, SCH and HLD included (Chew 2026-10-14);
  - **Finance tables keep the person's own saved layouts on the server (0704; Chew 2026-10-21, 「可以」). BUILT 2026-10-21; 0704 probed on production and rolled back, then APPLIED 2026-10-21 on Chew's 「可以，上线」, the tracker holding the file exactly (md5 `c62428601fde12d99acdfb6d4b705698`).** The same personal layouts Purchase Orders pilots (0528; COPY "Personal column layouts", UI MASTER §6.7 rule 4): order, hidden, widths and sort, up to 10 per table, one Default, seen only by the person who saved them, with PO's exact words (`Save layout as…` · `Load layout` · `Set as my default` …). A Finance exception admitting `finance_*` listings to the Purchase Orders pilot (Chew tells Jess; COPY still reads "Purchase Orders only" until she accepts rollout). Every `look="finance"` grid has its own listing `finance_<table>` (`finance-layouts.ts`). The General Ledger, Profit and Loss, Balance Sheet and Cash Flow keep their dragged widths as the person's layout named `Column widths` on `finance_general_ledger`, `finance_profit_and_loss`, `finance_balance_sheet`, `finance_cash_flow` and `finance_cash_flow_accounts`, sent 600ms after a drag stops and made the Default once; while that read is pending or failed, the browser's copy is drawn.
  - **Right-click row menu and double-click preview (Chew 2026-10-21, approved). BUILT and DEPLOYED 2026-10-21; no migration.** Words: COPY "Row menu and preview".
    - **Row menu.** Every Finance list whose rows are documents or parties with a page opens the kit's ONE ROW MENU (UI MASTER §6.7 rule 5, `documentRowMenu`) on a right-click, Shift+F10 or the Menu key: `View` (the page the double-click used to open) · `Print` (only where the record already prints, the same flow its page runs) · one divider · the page's own items. Bills: `New Payment Voucher` when confirmed with something unpaid. Payment Vouchers: `Duplicate`. Unpaid by Supplier: `New Payment Voucher` for that supplier. Other debtors invoices: `Record receipt` when issued and owed. AR · Receivables: `Record receipt` (while something is owed); its rows carry no button (Chew 2026-10-21, a list row carries no button), so `Record receipt` is reached by this menu or the order's drawer (double-click or `View`), which keeps its own `Record receipt` door. Credit Notes, Debit Notes, Payment Requests, Notes to follow up, Other receipts, Journal and General Ledger lines: `View` (and `Print` where it prints). Each item follows the condition and the door of the same button on the record's page, which stays: right-click is a shortcut, never the only door. Rows with no page of their own (parties edited in a window, Chart of accounts, Settings, reports) get no menu.
    - **`Duplicate` (Payment Vouchers).** Opens the new-voucher form filled from the voucher (purpose, supplier, payee, account paid from, method, note, lines, advance and amounts), dated today, with no reference and no number until approved; a bill or debit note it paid stays ticked only while something is left to pay on it, at most that. Nothing is saved until `Save`: the existing draft door with a prefill (`/finance/payment-vouchers/new?copy={id}`), no new API and no migration.
    - **Double-click preview.** On a Finance DOCUMENT list (Bills, Payment Vouchers, Credit Notes, Debit Notes, Other debtors invoices, Other receipts, Journal, General Ledger lines) a double-click, or Enter on a row, opens a read-only preview instead of the page: the kit `Modal` at its `wide` width (the kit's surface for a header and a line list), with the document's header facts, its lines, and the General Ledger entries it posted and its reversal (`Account` · `Description` · `Debit` · `Credit`, totalled; the page's own words when nothing is posted yet), and ONE button, `View`, which opens the page. Escape closes the top layer only. Read through each document's own detail endpoint and the Journal's entry read; no new endpoint. Lists whose rows are not documents keep their double-click: AR · Receivables (the order's drawer), Unpaid by Supplier (a new voucher), Payment Requests and Notes to follow up (they post nothing to the ledger; their page), parties, Chart of accounts, Settings and reports.
    - **This is a Finance exception to the kit's double-click** (UI MASTER §6.7 rule 5: "Click, double-click and number links are unchanged"). Chew chose it and tells Jess. The shared code only gained opt-ins that leave every other caller's markup unchanged: the row menu surface moved out of DataGrid unchanged into `RowContextMenu`, and the kit `DataTable` gained an opt-in `contextMenu` drawing that same menu (General Ledger first).
- Built 2026-10-13 on Trial Balance, Unpaid by Supplier (five columns at first: Supplier, Unpaid Bills, Unpaid, Advance Left, Unpaid After Advance and Credit; the rest in Columns; a supplier with nothing open only with `Show all suppliers`) and Daily Bank. Every other Finance page follows.

## 5 · Open items

1. **YH.** YH changes Finance code almost every day: over 100 commits from 2026-09-19 to 2026-10-01. Agree with YH before any Finance code changes.
2. **File samples.** Before the readers are built, collect a sample card report and a sample bank statement from each provider. Hong Leong's card report is a secured PDF.
3. **Deposit invoices.** Not built (§3.1). Chew confirms them with Jess (2026-10-03). Check them against Payment's invoice rules and e-invoice before building them.
4. **Dealer commission.** Check the calculation with Chew step by step before anything about it changes.
5. **Stock confirmation.** Stock's Month-end Stock Confirmation is not built, so every month's stock value stays live and provisional until it is; from then on each confirmed month is stored and never changes (§3.5, Chew 2026-10-12).
6. **Year-end close.** Complete review recommendation is now in §3.5. Chew must settle the fiscal period, close/correction permissions, accounting treatment and lock activation before build; this proposal is not approval.
7. **New words.** New Finance screen words go through COPY-STANDARD before UI work.

### 5.1 · Cross-module Settings reconciliation — 9 October 2026

This pass reconciles documentation boundaries only; it does not change Chew's scoped decisions, Jess's overriding authority, production permissions or existing release status. Finance still owns its own money-out, bank/card reconciliation, ledger/month-end/tax and Finance-report configuration; customer recording, receipts, allocation, customer-facing bank instructions and collection remain Payment-owned (§3.1). The two receiving accounts observed in Payment Settings are not proof of Finance account mapping, settlement or reconciliation completion. `Payment Approver` and `Finance Approver` remain distinct duties resolved through the shared Workspace source (§2), not a second Finance staff rota. Leave/cover and ordinary helpers do not grant either approval right.

Central Reports placement does not remove Finance's approved source-owned report pages (§§3.6,4) or approve a new company-wide formula. Any central summary must consume the Finance-owned definition, date anchor, permissions and coverage; provisional stock valuation remains provisional until Stock's required confirmation (§5). Customer bank messages, accounting money-account codes and bank statement accounts must be reconciled rather than presumed identical. Unverified mappings are not missing database facts. Deposit invoices are not built, and are not built until the existing checks in §3.1 and §5 are met. No notification, sync, import, payout or automatic recovery is activated by this reconciliation. Existing samples, year-end design and release/acceptance gaps in §5 remain open.

## 6 · Sources

- **Houzs Finance Specification V5 (2026-10-02):** kept locally by Chew and not in this repository. Reference only.
- **Jess rules cited:**
  - CLAUDE.md §6, §7 and §8 (GLOBAL OWNER LAW);
  - Payment MASTER §1, "The collection workspace", §13 and the numbering note (owner 2026-09-23);
  - UI MASTER "One portal rail" (Payments, owner 2026-09-12);
  - Stock MASTER §12.9 and §12.10;
  - Workspace MASTER §4 (Finance Approver).
- **Finance code today:** `apps/web/src/pages/finance/` and `apps/api/src/routes/finance/`.
