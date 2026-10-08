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
7. Open (Chew 2026-10-06): goods bought without an order would leave money paid to suppliers outside every channel in Receipts & Payments (「这样我看receipt & payment 就不太对了」); how such a payment is placed is still to decide.

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

**The account mapping — approved by Chew 2026-10-07 (「可以」); the chart is BUILT (PR #1977, 0654 and 0655 APPLIED 2026-10-07), the postings by item group and merchant are NOT BUILT.** New accounts are marked new; the rest are in Chew's AutoCount chart.

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
- Bank transfers, cheques, FPX and DuitNow post to `310-2000` Hong Leong Bank, and Stripe to `315-5000`. Card payments still post to the one old card account, renamed `CARD - MACHINE NOT KNOWN`, until each merchant machine is its own method (the two-step methods above).
- A test account the new chart has no place for is retired. One that still carries test postings cannot be, so its name ends `(TEST ONLY)` until go-live starts clean (CLAUDE.md §6). On production today that is the old current account and rent and utilities.
- The rest of Chew's chart, about 250 accounts, names directors, staff and related companies, so it is never written into this public repository. Chew loads it himself: Chart of accounts → `Import from AutoCount`, choosing AutoCount's printed chart as a PDF. The PDF is read in the browser and never sent. The database first answers what each account would do: new, already in the chart, or not imported and why. Only `Import` makes the new accounts, under the account AutoCount prints them under, or under their section's top heading.
- The import never renames, moves or retires an account already in the chart, and never makes a bank, cash or control account: a bank or cash account is made in Money accounts, and a control account is the system's.
- Measured: Chew's PDF, read on this computer, gives 251 accounts with none unreadable. Before applying, both migrations ran on production inside a transaction that was then rolled back: every role, map and money check passed, and an import of a test listing made the expected accounts in the expected places, with no two accounts sharing a name.
- Applied 2026-10-07. The tracker holds each file exactly (md5 `68869fb5…` for 0654, `8b24d8d5…` for 0655). Production then had 71 active accounts and none of the old system numbers; `1120` and `6200` carry `(TEST ONLY)`; bank, cheque, DuitNow and Online post to `310-2000`, Stripe to `315-5000`, cash to `320-0000`, and card, credit card and debit card to `1130`. The import is open to signed-in callers only, and refuses any role but Finance and principal.
- Three old roles still name retired accounts, measured after applying. `SUPPLIER_ADVANCE` (`1230`) is now only the Balance Sheet's line for suppliers paid ahead: a supplier advance already posts to that supplier's own payables account, never to `1230`. `CUSTOMER_MONEY_HEADING` (`2200`) and `STOCK_HEADING` (`1300`) now only stop an account being added or moved under those retired headings; the money-in check reads the accounts themselves. Nothing posts to any of the three. They go when the Balance Sheet is next changed (§0, suppliers paid ahead).
- Imported 2026-10-07 on Chew's own Finance login, in his Chrome, after he saw the preview (「可以，按吧」): 210 new, 41 already in the chart, none refused. Production then held 297 accounts, 281 in use (asset 33, liability 74, equity 5, income 15, expense 154), with no two sharing a name, none under a retired heading or an account the ledger posts to, every account the kind of its heading, and no empty heading.
- Falsifier: after the import, an account Chew knows is in AutoCount is missing or sits under another heading, or a payment posts to an account Chew did not expect.

**The Chart of accounts screen reads like AutoCount's — approved by Chew 2026-10-07 (「可以」), after he showed the Houzs chart he wants (「我的chart of account 要这样」); BUILT (PR #1979, merged 2026-10-07 as `9c37e180`); 0656 APPLIED 2026-10-07 with Chew's OK (「可以，套用吧」), the tracker holding the file exactly (md5 `8e16561f…`).**
- Accounts are grouped by AutoCount's section, in AutoCount's order: CAPITAL, RETAINED EARNING, FIXED ASSETS, OTHER ASSETS, CURRENT ASSETS, CURRENT LIABILITIES, LONG TERM LIABILITIES, SALES, SALES ADJUSTMENTS, COST OF GOODS SOLD, OTHER INCOMES, EXPENSES, TAXATION. Each group shows its kind and how many accounts it holds, and folds.
- Three columns: `Code`, `Name`, `Type`. After the name, AutoCount's special type in small grey letters (SFA, SAD, SRE, SBK, SCH, SDC, SCC, SBS, SOS, SCS). A heading is marked as one and folds; the accounts under it are indented.
- Each account can be edited (name, number, section, and the heading it sits under) and retired. Only an account the ledger has never posted to can be retired; a used account stays, as in AutoCount. Retired accounts are hidden until asked for.
- Where those two actions sit: an edit and a retire icon at the end of each row, as in the Houzs chart; a row click also opens the edit window, which holds Retire too. Chew chose the icons knowing the shared listing rule keeps buttons out of rows (UI MASTER §6.0 rule 10, Jess's) (「2」), then ruled to build them now (「直接做，这个是我finance 的使用方式」, 2026-10-07). It is a Finance-only exception for this one page; no other page copies it, and Chew sends Jess the request so the UI MASTER can record it.
- Accounts read in number order, as in AutoCount. Dragging to reorder goes; the heading an account sits under is changed in edit.
- Not on this screen: a company column (Carres is one company, Chew: 「选公司不需要没关系」), the event tick (event and project costs are not kept, Chew 2026-10-03) and the performance statement row (it comes with the Performance P&L, not built).
- The top headings `0000` to `7000` no longer show on this screen; the reports keep them for now.
- Each account keeps its AutoCount section and special type. Importing the same PDF again fills them for the accounts already in the chart, and never renames or moves one. The system's own accounts that are not in Chew's PDF (the merchant clearing accounts, subscription, cost of service and the like) take theirs from the migration.
- The retire icon shows only where retiring can work: never on an account the system posts to (a role, an income or payment map row), a bank, cash or card account, a control account, or a heading with accounts in use. An account the ledger has posted to keeps it, and the database says why it stays.
- Done 2026-10-07: after 0656, Chew's PDF imported again on his Finance login with his OK (「可以，按吧」): 0 new, 251 already in the chart, 251 sections filled in. Production then held 297 accounts, 281 in use, 275 with a section and 19 with a special type, every top account in a section, and none in a section of another kind. In use by section: CAPITAL 2, RETAINED EARNING 2, FIXED ASSETS 7, OTHER ASSETS 1, CURRENT ASSETS 24, CURRENT LIABILITIES 73, SALES 6, SALES ADJUSTMENTS 2, COST OF GOODS SOLD 15, OTHER INCOMES 6, EXPENSES 135, TAXATION 1.

**How money is recorded, Chew 2026-10-07.** 「每张so 记录收款，当开新的so 时就会填顾客下的货，然后填付款，填付款时就会选付款方式，online, cash, merchant, 选了merchant 就会跳卡机出现 / 然后尾款就是operation记录收的钱然后 会link回哪种sales order, 付款方式同理」:
- A new sales order records the goods, then the payment. The payment method is Online, Cash or Merchant; choosing Merchant asks which machine: `Merchant - PBB`, `Merchant - GHL`, `Merchant - HLBB`, `Merchant - MBB`.
- A balance is recorded by Operation against its sales order, with the same methods.
- Each merchant posts to its own clearing account (`315-1000` PBB, `315-2000` GHL, `315-3000` HLBB, `315-4000` MBB, `315-6000` AhaPay — 「ahapay 也要放去进去」); Online goes straight into the bank; Cash to `320-0000`; cheques are still taken and go into the bank (「有收支票」). Today the system records only "card", so the machine is not known (measured 2026-10-07).
- The method is chosen in two steps (「付款方式应该是online, cash, cheque, merchant。 我选了merchant 才会跳merchant选项」): Online, Cash, Cheque or Merchant first; Merchant then asks for PBB, GHL, HLBB, MBB or AhaPay. Order entry already asks a second question after a method (as card asks for the bank), so it needs only settings; Operation's balance form needs a second picker on Jess's screen, which Chew will tell her about.
- Order entry and Operation's recording are Jess's. Chew authorises Finance to change their payment settings directly (「直接改」, 2026-10-07); her screens' code is not changed without him. Both record the same facts as Chew's 2990 example: date, method, amount, approval code, slip and who collected; the account follows from the method.

Two Finance Settings pages keep the mapping in Chew's hands (「其他的收入，费用同理」, 「可以」):
- **Automatic posting accounts.** Every kind of posting the system makes, and the account it goes to. Chew can change the account; the new one must be of the same type (income for income, expense for expense). A change applies to postings from then on; earlier ones stay, and a journal moves them if needed. Each change records who, when, and from which account to which.
  - Built 2026-10-07 as Finance Settings → `Posting accounts` (PR #1981; 0657 APPLIED 2026-10-07, tracker md5 `aead67a59b23a19bbe1747be0f65522d`). Four groups: Sales (an invoice's goods, subscription fees, storage and every add-on, an add-on with no account flagged), Purchases and charges (goods on a supplier bill, bank and card charges, money the bank pays in), Customer money, and the accounts the system keeps (payables, customer deposits, stock, equity: renamed or renumbered in Chart of accounts, never swapped here). A row opens a window offering only accounts of the posting's kind that are in use, not headings, not control or money accounts. A change made by someone else in between is refused, not overwritten. The changes are listed under the postings and cannot be altered.
  - The principal-only door to the income map (`gl_map_income_account`) now writes through the same path, so every change is recorded and Finance may use it.
  - The add-on `Dispose old sofa (big size)` had no income account, so its invoices could not be issued (measured 2026-10-07). 0657 gives it `500-3000` SERVICE CHARGES, as every other disposal (the mapping above).
  - Customer money. **Chew 2026-10-07 (「1 可以」):** Finance changes the money account each way of being paid lands in, from this page. Only that one setting: a method's name, whether it is Active and every other Payment setting stay with the principal or the holder of the ops manager duty (`payment_settings_gate`, Payment MASTER §12). Built as `payment_method_account_set` (0658 APPLIED 2026-10-08 with Chew's OK 「做」, tracker md5 `74aa547eebcd2188214b4679e000f1f7`; no account was changed by it): the window offers the money accounts Payment settings offers and the door takes only those; a change someone made in between is refused; the change is kept in Payment settings' own change record, in the same shape its doors write, so both pages list it, and the row shows when it last changed. Payment MASTER §12 still says only the manager edits Payment settings; Chew tells Jess about this exception (§1).
- **Item groups**, as in the 2990 reference Chew showed (「就是这个item group 绑定什么account 也需要有」). Each group binds a Purchase, Sales, Sales Return and Purchase Return account; Chew can change the accounts, add groups and turn a group off, and a change applies to postings from then on. Confirmed by Chew 2026-10-07 (「1 可以 2 可以 3 开新的，cost of service」):
  - Each product starts in the group of its catalog category (mattress, bedframe, sofa, accessory, service, guarantee). Finance may add its own groups and move a product into one; the catalog is not changed.
  - A bill for an unbound group cannot be confirmed until the group is bound. A sale is never held back: it posts to `500-0000` and the page lists it for binding.
  - The starting groups: MATTRESS `610-0020`, SOFA `610-0030`, BEDFRAME `610-0040`, MATTRESS PROTECTOR `610-0050`, PILLOW `610-0070` and OTHERS `610-0000` for purchases, each selling to `500-0000`; SERVICE sells to `500-3000` and GUARANTEE to `500-5000`, and both cost to a new `604-0000` Cost of service. Every group returns to `510-0000` (sales) and `612-0000` (purchases). Curtain (`610-0060`), footrest (`610-0080`) and storage (`500-4000`) get a group when such a product exists. The existing accessories are placed for Chew to check: one protector, three pillows.
  - A guarantee claim's replacement cost stays `900-W005`.

**A purchase without an order** takes its channel from the Manual Purchase Request's required purpose (Purchasing §5.2), so nothing extra is marked on the PO. Confirmed by Chew 2026-10-06 (「1 对，2 对，3 可以」):
- Showroom Display → that showroom; Ready Stock → stock not yet in a channel; Service Case → the case's order; Internal Staff Purchase and Other Purchase → Office; Subsidiary Purchase → the amount due from that related company (350-00xx). The approved Diglant advance PO, when built → Subscription; a dealer display request, when built → that dealer.
- When Purchasing allocates such stock or PO quantity to a Sales Order, the goods take that order's channel. Allocated before the supplier is paid: the bill and the payment carry the order's channel. Allocated after: that month's Receipts & Payments keeps it under stock and does not change, and the cost reaches the order's channel when the goods are sold. A PO split between orders is split unit by unit.
- The KPI allowance is accrued like the renovation rebate (900-C009 / 410-0065).

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
- the machine picker after `Merchant` on Operation's balance form (「要做，直接做」, 2026-10-07, §0);
- Finance setting the money account each way of being paid lands in, from Finance Settings → Posting accounts, although Payment MASTER §12 leaves Payment settings to the manager (「1 可以」, 2026-10-07, §0 "Automatic posting accounts").

Each changes only what Finance needs on that screen; nothing else on Jess's screens moves (Chew: 「别碰到其他的view哦」).

**Pointers.** Short `CLAUDE.md` pointers inside the Finance code folders point to this document, so a chat that opens Finance code reads it first.

## 2 · Who does what

| Person | Does |
|---|---|
| Finance user | Prepares payment vouchers. Keys supplier bills, other debtors and other receipts. Runs card and bank reconciliation and month-end. Reads the reports. |
| Checker | Any Finance user except the one who prepared the voucher. |
| Finance Approver | The existing Workspace duty `finance_approver` (Workspace MASTER §4 Staff & Duties). It takes Finance users only, allows a cover, and the principal can always approve. Approves vouchers and money moves, and cancels confirmed Finance documents. |
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
| Refunds | **Jess's no-refund policy stands** (Payment MASTER §13). The exceptional refund (Service Case → Management → Finance pays) is paid with a Finance **Customer Refund** voucher, so that it is in the ledger. Where it shows: on Finance's own AR page, the refunded amount stands on its own beside the customer's outstanding; Payment's figures and pages do not change (Chew 2026-10-03). **Not built.** |
| Moving a deposit to another order | **Not built.** It changes payment records, and Payment already has `Correct allocation`. |
| Old-slip approval window | **Not built.** |
| Customer credit and debit notes | **Not built.** Customer invoices belong to Payment (Payment MASTER §1). |
| Deposit invoices | **Built inside Finance and switched OFF.** See the rules below this table. |
| Customer credit pot | **Not built.** |
| Other debtors and other receipts | Keep. |

Deposit invoice rules:
- They are made from payment records, which Finance only reads. Payment's recording is not changed.
- There is no menu entry while they are switched off.
- Before they are ever switched on, check them against Payment's invoice model, the approved numbering (owner 2026-09-23) and e-invoice.

### 3.2 Money out

| Topic | Decision |
|---|---|
| Payment vouchers | Prepare → Check → Approve, as in §2. The voucher is the only way money leaves. |
| Supplier bills | Keep: from a GRN at PO price, and through other creditors for non-goods bills. |
| Supplier advances | Keep. |
| Supplier credit and debit notes | **Build.** This includes reading the supplier's paper and knocking the note off that supplier's invoices. A **debit note** (the supplier charges more) is its own document, with its own number and list, never mixed with bills; it is paid by a payment voucher and counts in AP and AP Aging (Chew 2026-10-03; **not built**). A supplier never pays a credit back in money: the credit is knocked off the next bill, or a credit or debit note is raised, so no refund-from-supplier door is built. |
| Supplier finance data (tax numbers, bank account) | **Build** as Finance's own record, linked to Purchasing's supplier. Purchasing screens do not change. |
| Bill scanning | **Build.** It sends bill images to an external AI service and costs a little per bill. |
| Foreign currency | Needed, but rarely used. Record the foreign amount and the rate only; the books stay in RM, and no exchange gain or loss is worked out automatically (Chew 2026-10-03). **Not built.** |
| Dealer commission | Calculated on money actually received; Finance maintains the rates. See the rules below this table. |

Dealer commission rules:
- Each month a **draft** payment voucher is raised automatically.
- **Commission is accrued at month end** (Chew 2026-10-06, 「dealer 佣金对」): Dr 900-C007 Commission - Dealer, Cr 410-0061 Accruals - Commission Dealer. The payment voucher clears it: Dr 410-0061, Cr bank. This replaces the 2026-10-03 rule of no accrual. Chew reads CLAUDE.md §7's "no HQ→dealer credit or debt" as goods money, not commission Carres owes a dealer.
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
  - Invoices are made automatically each month. Chew looks them over, then sends them from accounts@carresofficial.com.
  - Late interest is invoiced too.
  - Bad debt: the agreements Chew ticks on the bad-debt list post Dr bad debts, Cr the customer's debtor, once each.
  - The subscription invoice is Finance's (「invoice 那边算我这里」). Rental keeps the agreement and its billing schedule.
- **Still Jess's, for dealer commission:** an order recording its bundle discount (order placement); the 15-year guarantee's catalog price (Catalog).
- **Noted for later (Chew 2026-10-05).** A list's search box opens already typed-into, not behind a click. To change together with other UI items; first check whether it is the shared kit search.

**Supplier credit notes approach — PROPOSAL / NOT LAW, built for Chew's test (0642).**
- Payables → Credit Notes. The supplier's own credit note is entered once, with lines, as a bill is: draft → confirmed → cancelled. Confirming posts on the credit note's date: Dr the payables account with the supplier as the party, Cr each line. An expense or asset line takes a cost back; an income line records a rebate. The stored number is `SCN-YYYYMMDD-RRRR`, drawn like a bill's; display uses `SCN-YYMMDD-RRRR` under Jess's system-wide 2026-10-04 COPY-STANDARD ruling (approved target, adoption not verified).
- The prefix becomes `PCN`, so subscription credit notes keep `SCN` (Chew 2026-10-07, 「可以」). Not built yet.
- Its credit is knocked off that supplier's confirmed bills on the same payables account, as an advance is (0485). A knock-off posts nothing and can be taken off with a reason. A bill counts it as paid from the later of the credit note's date and the knock-off's day. A voucher cannot pay what a credit note already took off, and a bill with a credit note on it cannot be cancelled.
- AP · Payables gains `Credit Left`, and its last money column subtracts it (`Unpaid After Advance and Credit`), so it still equals the books. AP Aging and the Self-check read the same arithmetic. A test walks a bill, a credit note, a knock-off, a voucher refused over what is left, a take-off and a cancel through the real doors.
- A supplier debit note is not entered as a bill: it is its own document (the table above, Chew 2026-10-03), not built yet.
- Not built: a PDF.
- 0647 fixes a fault 0642 shipped with: a credit note's two account columns did not follow a renumbered account (0570 says every key that names the chart must), so renumbering an account a credit note used was refused. Both now follow, and the file refuses to apply while any key onto the chart still does not. A test renumbers an account under a confirmed credit note.
- Falsifier: in Chew's test, a supplier's `Unpaid After Advance and Credit` differs from its balance in the books, or a bill shows a credit note Chew did not knock off.

**Credit and debit notes to follow up — Chew 2026-10-06 and 2026-10-07; APPROVED / NOT BUILT except where marked.**
- Chew needs one list of the credit and debit notes suppliers still owe, so he can follow each one up (「我需要有一个listing 关于supplier 那边要follow up 的cn」). It is a reminder only and posts nothing, because there is no supplier claims account (Chew 2026-10-06).
- Where one starts (「就是我转grn 去pi 时会对比我的po price， 然后提醒我，我会remark pending supplier cn or dn / 同时也有可能是开了pi, 然后要purchase return， 就要让他pending cn」):
  - when a bill is made from its GRN, each line is compared with its PO price and a difference is pointed out; Chew marks it pending a supplier credit note or debit note, with a remark;
  - a purchase return on goods already billed makes a pending credit note. Purchasing's return record is read, never changed.
- One record per note owed: supplier, credit or debit, the bill, GRN, PO or return it belongs to, the amount, the date it was noted, each follow-up (the date and what the supplier said) and the next follow-up date.
- It closes when the supplier's note arrives: entering the credit note (or, once built, the debit note) offers that supplier's open ones to settle, and a part leaves the rest open. It can also be closed with a reason, for example the supplier refused or replaced the goods.
- PROPOSAL / NOT LAW, asked on 2026-10-07 and not answered: the reasons are "Price differs from PO", "Purchase return" and "Other", and preparing a voucher for a supplier shows the notes it still owes.
- Falsifier: in Chew's test, a note he is waiting for is not on the list, or one the supplier already sent still shows as owed.

**Bill scanning approach — PROPOSAL / NOT LAW, built for Chew's test (no migration).**
- `Read the bill` on the bill form and `Read the credit note` on the credit note form. The person picks the pages (PDF or photos, up to 8, 10 MB each); they go once to Anthropic's Claude model (`claude-sonnet-5-5`, changeable with the `BILL_READER_MODEL` setting), which answers the supplier's name, the paper's number, date, due date, currency, total and lines.
- What is read fills only what the form does not have yet: the supplier when one has that name (never a guess between two), the number, the date, the due date, and the lines when the form has none. A person still picks each line's account and department and saves. Notes under the card say what to check: a close name, a proforma, another currency, lines that do not add up to the total, a discount read as its own line. A credit note printed with minus signs is read as the credit it is.
- Once the paper is saved, the pages that were read are attached to it as its files. Nothing is written by the reading itself.
- It is OFF until Chew gives the key, which becomes the Worker secret `ANTHROPIC_API_KEY`; until then the button answers `Reading bills is not set up yet. Type the bill in.` Each reading costs a little per bill.
- Not built: Houzs's account memory (filling a line's account from the supplier's earlier bills), the multi-bill scan page, and reading for payment vouchers and payment requests.
- Falsifier: in Chew's test with real bills, a read figure is wrong more often than right, or the pre-filled form takes longer to check than typing it.

### 3.3 Staff payment requests

- **Build.** Staff with permission raise a request with the bill. Finance answers it with a voucher or a bill, and the requester can see which stage it has reached.
- The entry point is **one entry in the shared menu**, visible only to permitted staff. This is the first Jess-side change Chew approved (2026-10-03); the second is the area fold (§4.1).

**Payment requests approach — PROPOSAL / NOT LAW, built for Chew's test (0645).**
- **Who may ask.** Finance or the boss (the principal) ticks which Operation staff may ask, under Finance Settings → `Payment requests` (Chew 2026-10-03; 0648 — 0645 let only the boss). Only the people ticked see the menu row and can ask. Finance and the principal may always ask. Each grant is kept, with who gave it and who took it back: unticking never deletes it.
  - It is a permission per person, kept by Finance, as the warehouse keeps its capability grants. It is not a Workspace duty, which has one holder a day, and it is not an HR position permission.
  - Today only Operation staff can be ticked, because the Finance pages are open to Finance, the principal and Operation.
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
  - HR or BD staff asking. They cannot open the Finance pages today; letting them would need Jess's routes to change. Whether they should, and where the menu row sits, waits for Chew (2026-10-03).
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
| Month-end stock value: source | Use Stock MASTER §12.10's Month-end Stock Confirmation once it exists. Until then, Finance works out a **provisional** value from Stock's Units, reading only, and marks it provisional. |
| Opening balances | Finance's own account figures at go-live. No old transactions are brought in, because CLAUDE.md §6 stands. **Parked (Chew 2026-10-03)** until every feature is tested: it is data entered at go-live, though each customer's and supplier's opening balance will need a place to be entered. |
| SST | Carres is not SST-registered, so there is no tax on invoices. |
| Year-end close | Later, before year end. |
| More than one company | Not needed. |
| Event or project costs | Not needed. |
| AutoCount | Stop using it once the ERP is stable. |

**Stock value approach — PROPOSAL / NOT LAW, built for Chew's test (0643).**
- Reports → Stock value, for a month end. Every Carres-owned Unit held at the end of that day (Kuala Lumpur): free, reserved, on hold or on a movement. Incoming, sold and ended Units are not counted; consignment Units are counted apart and never valued.
- Each Unit's status, Site, holder and ownership are read back to that day from Stock's own log of changes, so an earlier month shows the Units as they stood then. The current month shows them as they are now, and says so.
- Groups, first match wins: `Sent for repair` (collected on a repair pickup) · `In transit` (any other movement, a Unit a logistics company holds, or a Unit at a transit point such as AL or HOUZS) · `Showroom` · `Warehouse` (any other Carres Site) · `Not placed` (listed, never dropped).
- Each Unit is valued at its PO line cost; a free-of-charge line costs nothing. A Unit with no PO line, or a line with no price, has no cost recorded: it is counted in `No cost recorded` and never valued as zero.
- Nothing is saved and nothing is entered in the ledger; Stock MASTER §9 keeps the month-end total Stock's. When Stock's Month-end Stock Confirmation exists, it is the figure and this page is retired.
- Measured 2026-10-03 on the test data: 344 Units and 10 quantity rows are held, and nearly all have no PO line (opening imports), so nearly all show `No cost recorded`. Go-live starts clean (CLAUDE.md §6), so after it Units come from POs with their cost.
- Showroom: Stock has no Site type yet, and its own register finds PJ Showroom by its name (Stock MASTER §12.9). This page counts a Unit as Showroom when a showroom party holds it, its Site's profile names one, or its Site is named as a showroom. When Stock adds a Site type, the page reads it instead.
- Chew 2026-10-03: this page is Finance reading Stock's data, and it is separate from Stock's Month-end Stock Confirmation (Stock MASTER §9), which it neither feeds nor replaces.
- Not built: posting the value to the ledger (Dr stock on hand, Cr cost of goods sold; bills from a GRN post the goods to cost of goods sold, 0477, so without it the month's cost is every purchase of the month) and valuing the go-live opening stock, which comes in without a PO cost. When posting is built, Stock MASTER §9 applies: Finance values from the confirmation version it acknowledges and saves no month-end Stock total of its own. Both go to Chew.
- Falsifier: in Chew's test, a Unit Chew knows was in the showroom or out for repair at a month end shows in another group, or a value differs from its PO line cost times its quantity.

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

**Cash Flow approach — PROPOSAL / NOT LAW, built for Chew's test (0638).**
- A receipts and payments statement of the cash and bank accounts, as Houzs's Cash Flow is; not an indirect cash-flow statement. Reached from a door on the Reports page, like Card charges.
- Each line names the account on the other side of the money. A line that pays several things is shared across them in proportion, to the sen, so the lines always add up to the accounts' money in and out.
- A move between two of Carres's own cash or bank accounts shows as a transfer, in on one and out on the other.
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
- AR Aging is built the same way as AP Aging, reading Payment's invoices and receipts and changing none (Chew 2026-10-03). **Not built yet.**
- Not built: the trade or other payables chips, and a PDF.
- Falsifier: in Chew's test, a supplier's balance here differs from AP · Payables' net owing today, or the footer's difference is not zero.

**Collection report approach — PROPOSAL / NOT LAW, built for Chew's test (0644).**
- Reports → Collection, after Houzs Part 10 §6. The sales orders placed in a period (by SO Doc Date, a Kuala Lumpur day), not cancelled and not rental, per salesperson. Two views on a tab bar:
  - `Deposit`: orders, order value, deposit, deposit % and how many orders fell below a chosen share (`Below (%)`, 50 unless changed).
  - `Balance`, delivered orders only: invoiced value, deposit, balance due, balance paid, balance % and outstanding.
- Opening a salesperson lists the orders.
- Deposit is the money taken with the new order (payments of kind `deposit`); balance paid is every other customer payment, storage excepted. Both are read from live allocations, so a payment moved by Payment's `Correct allocation` counts on the order it was moved to, and a voided one counts nowhere.
- Invoiced value is the live sales invoice; without one, the order value. An order counts as delivered when it is delivered or its sales invoice is issued.
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

## 4 · Menu

- **Status.** APPROVED by Chew 2026-10-03 (「都可以」), after he sent a picture of the menu he wants and the conflicts below were shown to him. Built in PR #1865, merged 2026-10-05.
- **Words.** Screen words come from `docs/COPY-STANDARD.md` "Finance (Chew)". A menu word is its page's title, so a page keeps one name. One exception stands from before: the row `AP · Payables` opens the page titled `Unpaid by Supplier` (ruling YH 2026-09-14).

```text
FINANCE          its title folds the area (§4.1)
├─ Dashboard
├─ Payments      Monitor · Payment Records                                   Payment's, unchanged
├─ Payables      AP · Payables · Payment Vouchers · Bills · Payment Requests · Credit Notes · Suppliers
├─ Receivables   AR · Receivables · Other debtors · Other receipts
├─ Bank & Cards  Daily Bank · Card settlement · Card money waiting · Money moves
├─ Ledger        Journal · General Ledger · Trial Balance · Self-check
├─ Reports       Profit and Loss · Balance Sheet · Cash Flow · AP Aging · Collection
│                Card charges · Dealer commission · Stock value · Payment
├─ Forecast
└─ Rental Approver · Subscriptions · Dealers                                 unchanged
```

- **Reports.** One row per report. The Profit and Loss and the Balance Sheet are two pages: `/finance/reports/profit-and-loss` and `/finance/reports/balance-sheet`. The old `/finance/reports` opens the one its address asked for, keeping its dates. The old page's list of doors is gone, because every report is on the menu. Reports → Payment stays Payment's own report, unchanged; it is now also a row.
- **Forecast.** Its own row after Reports. It becomes a group when a second forecasting page exists.
- **No page repeats the menu** (Chew 2026-10-05). The switch `Bills | Payment Vouchers | Unpaid by Supplier` at the top of those three pages is retired; the menu is the one way between them. Two page switches stay because they lead to no menu page: Other debtors' `Parties`, and Dealer commission's `Commission rates` and `Renovation quotas`. Dealer commission also waits for its calculation check with Chew (§5).
- **A page joins the menu when it is built.** No `Coming soon` rows. Not built yet, from Chew's picture: Deposit Invoices, Not Yet Billed, Credit / Debit Notes, Official Invoices Owed, Bank Recon, Month-end, AR Aging, Corrections, Performance P&L, Event costs, Sales Report, a forecasting Dashboard, Item Groups, Currencies. Several of them are not decided yet.
- **Where the picture met an existing rule, the rule stays** (Chew agreed, 2026-10-03):
  - No `Money in` / `Money out` group names. Customer `Money In` is Payment's word (Payment MASTER §1).
  - No `Setup` group. The gear in the page header is the one Settings entry (UI MASTER, GLOBAL SETTINGS ENTRY, Loo 2026-08-11). Chart of Accounts and the rest stay in Finance Settings; Currencies and Item Groups go there when built.
  - No customer `Official Receipts`, `AR Invoices` or `Receipts` pages. Customer money has one home, Payments (owner ruling 2026-09-12).
  - No icon on a page row. A group row carries the one icon (UI MASTER rail rules).
  - Payables stays above Receivables (ruling YH 2026-09-14: `AP · Payables` above AR).
  - The current page names stay (`Bills`, `Journal`, `Card settlement`, `Card money waiting`, `Card charges`, `Suppliers`, `Forecast`). Chew may rename a Finance page later, one at a time.

### 4.1 · The area you are in folds

- **Ruling.** Chew 2026-10-03 (「都可以」): the title of the area you are in folds it, and the next click opens it. Another area's title still jumps to that area, and the area you left closes, as before.
- **This is the second shared change Chew approved** (the first is §3.3's menu row). It applies to every area, on every login that sees area titles (principal-level logins). Jess's login sees it too; Chew approved that knowingly. Nothing else in the shared menu changed.
- The fold stays while you move between pages of that area. Going to another area and back, or reloading, opens it again.
- A folded area's title turns blue. It has hidden the page you are on, so it is the rail's one mark of where you are (the rail rule: a shut parent is lit).

## 5 · Open items

1. **YH.** YH changes Finance code almost every day: over 100 commits from 2026-09-19 to 2026-10-01. Agree with YH before any Finance code changes.
2. **File samples.** Before the readers are built, collect a sample card report and a sample bank statement from each provider. Hong Leong's card report is a secured PDF.
3. **Deposit invoices.** Chew confirms them with Jess (2026-10-03). Check them against Payment's invoice rules and e-invoice before switching them on.
4. **Dealer commission.** Check the calculation with Chew step by step before anything about it changes.
5. **Stock confirmation.** Stock's Month-end Stock Confirmation is not built, so Finance's stock value stays provisional until it is.
6. **Year-end close.** Design it before year end.
7. **New words.** New Finance screen words go through COPY-STANDARD before UI work.

## 6 · Sources

- **Houzs Finance Specification V5 (2026-10-02):** kept locally by Chew and not in this repository. Reference only.
- **Jess rules cited:**
  - CLAUDE.md §6, §7 and §8 (GLOBAL OWNER LAW);
  - Payment MASTER §1, "The collection workspace", §13 and the numbering note (owner 2026-09-23);
  - UI MASTER "One portal rail" (Payments, owner 2026-09-12);
  - Stock MASTER §12.9 and §12.10;
  - Workspace MASTER §4 (Finance Approver).
- **Finance code today:** `apps/web/src/pages/finance/` and `apps/api/src/routes/finance/`.
