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
> **Conflicts.** Where a line here meets a Jess ruling (CLAUDE.md or another module MASTER), **the Jess ruling wins** and the question goes back to Chew.
>
> **Reference.** The Houzs Finance Specification V5 (2026-10-02) is **evidence, not specification**. Per the CLAUDE.md Decision Gate, external systems are evidence. The spec's own instruction to "follow its rules" does not apply here. Chew keeps the spec locally. It is **not** in this public repository, because it holds another company's internal figures.

## 1 · Boundary: Finance only

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
- Units and month-end stock (Stock);
- the dealer master;
- rental collections (Rental).

**What Finance never touches:**
- Jess's modules and their UI;
- the shared UI kit;
- `CLAUDE.md` and `AGENTS.md`;
- every other module MASTER.

**Exceptions.** If a Finance feature needs even a small change on Jess's side, stop and take it back to Chew first. The only such change Chew has approved is the staff entry for Payment Requests (§3.3).

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
- There is **no monthly accrual**, because CLAUDE.md §7 says there is no HQ→dealer debt. The commission posts to the ledger when the voucher is approved.
- The calculation itself is checked with Chew step by step before anything about commission changes, including the automatic draft voucher (Chew 2026-10-03).

**Dealer commission check with Chew — in progress (2026-10-05).**
- **Confirmed, A: which orders count.** Dealer-channel orders only, never Showroom's. A month's report reads the orders placed before that month ends, by the Malaysian day (Chew 2026-10-05). How a cancelled order counts is still open (below).
- **The rules come from Carres memos.** The memos of 22 July 2026 ("Revised Pricing Structure", §12 promotion items; "KPI Allowance — Additional 15-Year Guarantee") are kept by Chew. They are not in this public repository, and neither are their rates or amounts. The rates live in Finance's settings, where Chew keeps them.
- **What Chew maintains himself (Chew 2026-10-05).** The rate for each dealer and for each product, with the rule (memo) each comes from and the date a new rate starts; the renovation rebate (its total and how it runs down); how a cancelled order and a refund take commission back.
- **Measured 2026-10-05.** Today there is one default rate plus optional rates per product: no rate per dealer, no start date, and no record of the memo. Changing a rate changes every past month. A cancelled order drops out of every month, including months already paid. A refund is taken off in the month it is paid out. Orders carry no discount field and no negative line, so a bundle price is only seen as the line prices typed. The renovation rebate exists: total, rate, start date, running down as money is collected. The 15-year guarantee is the catalog item `GRT-MATTRESS-15Y`; its catalog price differs from the memo's (Catalog's to correct, not Finance's).
- **Chew's answers, 2026-10-05** (his words, then the reading; the readings wait for his confirmation):
  1. 「新的% 要可以决定几时开始，然后是根据订单的日期决定」. Every rate has a start date; an order uses the rate in force on its order date.
  2. 「25% 变20%」. A promotion item's rate is the normal rate less 5 points.
  3. 「这个只是可能，暂时没有说每个dealer 不一样」. A rate per dealer can be kept; today no dealer differs.
  4. 「我是根据收到的钱给佣金，如果取消单没有退也要扣，但要做能toggle 决定」. Commission follows money received. A cancelled order's commission is taken back even when its money is not refunded, behind a switch Finance can turn.
  5. 「收到的钱的%」, then 「1是a」 (2026-10-05): confirmed. The renovation rebate is money Carres pays the dealer on top of commission: the rebate rate times the money collected since its start date, until the total is reached; the total left runs down by itself.
  6. 「每个月重新数，根据订单」, then 「暂时每个月算还是每年算我再决定」 (2026-10-05). The 15-year guarantee KPI counts from orders; whether the count restarts each month or each year is Chew's to decide later, so the period is a setting.
  7. 「这个确定，是根据订单的mattress 决定的」, then 「是a」 (2026-10-05): commission is worked on the price after the bundle discount, so Carres and the dealer share it. The bundle discount belongs to the whole bundle and is shared equally by the order's mattresses, piece by piece: 「3张就500 除3， 4张就500 除4」 (Chew 2026-10-05). Each mattress's commission is its rate on its price less its share. A line of quantity 2 counts as two mattresses, and only mattresses share the discount (「可以」, Chew 2026-10-05). The order must say it carries a bundle discount; today no order field holds one, and order entry is Jess's.
- **Not built until Chew confirms the whole calculation** (「先别做」, 2026-10-05).
- **Paying commission out (Chew 2026-10-05).** 「佣金可以先算，但我给佣金是根据收到的钱，然后收的第一笔低过50% 是不出的, 知道clear 完才出 / 八月收一半就出一半的commission, 收60% 就出60%，尾款10月收就10月才出」. An order's whole commission is worked out at once; it is paid out as its money arrives. If the first money is at least half the order, the commission for what came in is paid that month and the rest when the rest comes in. If the first money is under half, nothing is paid until the order is cleared. Open: whether reaching half later, before clearing, starts payment.
- **Cancelled orders (Chew 2026-10-05).** 「照理我是根据收到的钱出commission, 所以取消的单就不再有[还没收的佣金]，所以已付的没有影响不是」, then 「可以」. A cancelled order has nothing still to collect. Commission already paid on money Carres kept stays paid; each cancelled order carries a switch, off by default, that Finance turns on to take it back. Money refunded is taken back in the month it is refunded.
- **Reaching half later (Chew 2026-10-05).** 「9月收超过50%就补回给他」. An order whose first money was under half starts paying in the month its money received reaches half: that month pays the commission on everything received so far, and later money pays as it comes in.
- **Final check.** Chew takes the whole list to management for a final check before anything is built (2026-10-05). The list is a private page he shares: https://claude.ai/artifact/6tEBVSvjxQyvfextAHPUai.
- **Service comes off first (Chew 2026-10-05).** 「service 要扣掉哦，当第一次算和出时就要扣了」 and 「我算的commission 是不包括service 哦」. Commission never includes service. Confirmed 「1 是乙」: the first money received pays for the items that earn nothing before any of it earns commission, rather than spreading them over every payment. Example: goods RM 3,000 at 25% plus service RM 300; RM 1,650 received first earns (1,650 − 300) × 25% = RM 337.50, and the RM 1,650 balance earns RM 412.50. Assumed, not yet confirmed: guarantee, transport and disposal come off first in the same way, and the half-paid rule is measured on the whole order total.
- **Dealer statement (Chew 2026-10-05).** 「要每个月如何算commission, 其中包括当月每个新的订单， 当月收的尾款，当月的deduct。同时还需要一个比较普通类似supplier statement 这样的格式，我欠他多少，几时付他这样。实时update 的」. Two views, both live: the month's commission, order by order, covering that month's new orders, the balances collected that month and that month's deductions; and a statement of account like a supplier's: what Carres owes the dealer and when it was paid (the payment voucher). It also shows the commission still waiting on orders whose balance is not in yet. Chew checks and Finance imitates his existing statements.
- **Chew's existing statement workbook, read 2026-10-05.** One dealer's August 2026 workbook, kept by Chew (not in this repository). Its sheets: Summary, the month's claim, Statement of Account (running balance of commission and bonus charged, payments credited), line detail with each line's rate and why, an order ledger (commission if fully paid, earned, still to earn), and the AR, unclaimed and new-collection sheets that reconcile the source files. It agrees with the rules above: commission is earned on receipts, in proportion; refunds earn nothing; an order below the minimum deposit is held; a bundle discount is spread equally over the mattress pieces. Settled with Chew the same day:
  - **Accessories earn commission** at the standard rate (pillows, mattress protectors), overturning the code's "accessories earn nothing" (YH, 30 Sep 2026). It may stop later, so whether a kind of product earns commission is a switch with a start date (「配件也是25%。但到时可能会取消，所以要做可以toggle 的」).
  - **The workbook's bonus on receipts is the renovation rebate** (「是装修回扣」).
  - **A receipt counts in the month the system records it.** The workbook let a claim sheet move a receipt between months only because nothing was systematic yet (「到时就是根据每个月的真实收款」).
  - **The system's own records are the source.** The workbook's corrections to hand-made source files do not carry over (「到时就是根据系统的记录来算了」).
- **Subscription is not dealer commission (Chew 2026-10-05).** 「subscription 是subscription， dealer 是dealer, 不是一样的东西」. Subscription commission stays in Rental, Jess's module. The dealer report, statement and payout leave it out.
- **Subscription, measured 2026-10-05.** Subscription commission is a separate mechanism inside Rental (Jess's module). Each plan carries its own commission rate, set in Rental's plan settings. The rate is copied onto the agreement when it is signed. Each collected month records commission = the month's payment × that rate, beside the supplier's share. It is not in the dealer commission report and has no payout. It shows only on Rental's collection screen, and it does not say whether it is the dealer's or a salesperson's. A subscription's sales order is priced at RM 0, so it earns nothing in the dealer report and is not counted twice.
- **Noted for later (Chew 2026-10-05).** A list's search box opens already typed-into, not behind a click. To change together with other UI items; first check whether it is the shared kit search.

**Supplier credit notes approach — PROPOSAL / NOT LAW, built for Chew's test (0642).**
- Payables → Credit Notes. The supplier's own credit note is entered once, with lines, as a bill is: draft → confirmed → cancelled. Confirming posts on the credit note's date: Dr the payables account with the supplier as the party, Cr each line. An expense or asset line takes a cost back; an income line records a rebate. The stored number is `SCN-YYYYMMDD-RRRR`, drawn like a bill's; display uses `SCN-YYMMDD-RRRR` under Jess's system-wide 2026-10-04 COPY-STANDARD ruling (approved target, adoption not verified).
- Its credit is knocked off that supplier's confirmed bills on the same payables account, as an advance is (0485). A knock-off posts nothing and can be taken off with a reason. A bill counts it as paid from the later of the credit note's date and the knock-off's day. A voucher cannot pay what a credit note already took off, and a bill with a credit note on it cannot be cancelled.
- AP · Payables gains `Credit Left`, and its last money column subtracts it (`Unpaid After Advance and Credit`), so it still equals the books. AP Aging and the Self-check read the same arithmetic. A test walks a bill, a credit note, a knock-off, a voucher refused over what is left, a take-off and a cancel through the real doors.
- A supplier debit note is not entered as a bill: it is its own document (the table above, Chew 2026-10-03), not built yet.
- Not built: a PDF.
- 0647 fixes a fault 0642 shipped with: a credit note's two account columns did not follow a renumbered account (0570 says every key that names the chart must), so renumbering an account a credit note used was refused. Both now follow, and the file refuses to apply while any key onto the chart still does not. A test renumbers an account under a confirmed credit note.
- Falsifier: in Chew's test, a supplier's `Unpaid After Advance and Credit` differs from its balance in the books, or a bill shows a credit note Chew did not knock off.

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
