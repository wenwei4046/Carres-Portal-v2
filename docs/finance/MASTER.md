# FINANCE — MASTER

> **Status 2026-10-03: BUILD on the local branch `finance-build`. Nothing is pushed, merged, applied to the production database or live.** Chew tests everything once at the end; nothing goes live before Chew approves it.
>
> | Built on the branch (tests pass locally) | Migration |
> |---|---|
> | One person may check and approve a voucher (§2) | 0635 |
> | Finance menu modules (§4) | none |
> | Suppliers: Finance's own tax and bank details, and `Pay to` on a voucher (§3.2) | 0636 |
> | Daily Bank (§3.4) | 0637 |
> | Cash Flow (§3.6) | 0638 |
> | General Ledger (§3.6, §4) | 0639 |
> | AP Aging (§3.6) | 0640 |
> | Card money waiting (§3.4) | 0641 |
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
| Finance user | Prepares payment vouchers. Keys supplier bills, other debtors and other receipts. Runs card and bank reconciliation, the daily cash close and month-end. Reads the reports. |
| Checker | Any Finance user except the one who prepared the voucher. |
| Finance Approver | The existing Workspace duty `finance_approver` (Workspace MASTER §4 Staff & Duties). It takes Finance users only, allows a cover, and the principal can always approve. Approves vouchers and money moves, and cancels confirmed Finance documents. |
| Staff with permission | Raise a payment request with the bill attached (§3.3). |
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
| Refunds | **Jess's no-refund policy stands** (Payment MASTER §13). The exceptional refund (Service Case → Management → Finance pays) is paid with a Finance **Customer Refund** voucher, so that it is in the ledger. |
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
| Supplier credit and debit notes | **Build.** This includes reading the supplier's paper and knocking the note off that supplier's invoices. |
| Supplier finance data (tax numbers, bank account) | **Build** as Finance's own record, linked to Purchasing's supplier. Purchasing screens do not change. |
| Bill scanning | **Build.** It sends bill images to an external AI service and costs a little per bill. |
| Foreign currency | Needed, but rarely used. |
| Dealer commission | Calculated on money actually received; Finance maintains the rates. See the rules below this table. |

Dealer commission rules:
- Each month a **draft** payment voucher is raised automatically.
- There is **no monthly accrual**, because CLAUDE.md §7 says there is no HQ→dealer debt. The commission posts to the ledger when the voucher is approved.

### 3.3 Staff payment requests

- **Build.** Staff with permission raise a request with the bill. Finance answers it with a voucher or a bill, and the requester can see which stage it has reached.
- The entry point is **one entry in the shared menu**, visible only to permitted staff. This is the one Jess-side change Chew approved (2026-10-03).

### 3.4 Bank and cards

| Topic | Decision |
|---|---|
| Card (merchant) reconciliation | **Build fully.** Covers Public Bank, Maybank, GHL, Hong Leong and AhaPay, plus online money (Stripe, DuitNow). |
| Bank reconciliation | **Build inside Finance**, outside daily Payment. This matches Payment MASTER "The collection workspace": "Finance checks the bank outside daily Payment". Payment §13's reject of a bank-matching workspace *in Payment* is unchanged. |
| Daily Bank | **Build.** |
| Daily cash close | **Build.** Carres takes cash. |

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
| Opening balances | Finance's own account figures at go-live. No old transactions are brought in, because CLAUDE.md §6 stands. |
| SST | Carres is not SST-registered, so there is no tax on invoices. |
| Year-end close | Later, before year end. |
| More than one company | Not needed. |
| Event or project costs | Not needed. |
| AutoCount | Stop using it once the ERP is stable. |

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
- Not built: AR aging (it reads Payment's invoices and receipts, so it comes after AP), the trade or other payables chips, and a PDF.
- Falsifier: in Chew's test, a supplier's balance here differs from AP · Payables' net owing today, or the footer's difference is not zero.

## 4 · Menu: DRAFT

- **Status.** Chew 2026-10-03: 「可以，先这样」. This is a draft, not final. It will be shown again before any UI work.
- **Words.** Screen words come from `docs/COPY-STANDARD.md`. The Chinese group names are for reading only.

```text
Finance
├─ Dashboard
├─ 收钱 money in         AR · Other debtors · Other receipts
├─ 付钱 money out        Payment Requests · Bills · Payment Vouchers · AP
│                        Supplier credit / debit notes · Suppliers
├─ 银行和刷卡 bank/cards Daily Bank · Card settlement · Bank recon · Unmatched · Money moves
├─ 账本 books            Journal · General Ledger · Trial Balance · Month-end · Self-check
└─ 报表 reports          P&L · Balance Sheet · Cash Flow · Aging · Performance
                         Collection · Card charges · Dealer commission · Forecast
```

These stay exactly as they are today, because they are not Finance's:
- Monitor and Payment Records. UI MASTER "One portal rail" says Payments is a module of two destinations.
- Rental Approver and Subscriptions.
- Dealers.
- Reports → Payment.

Settings stay in the central Settings.

## 5 · Open items

1. **YH.** YH changes Finance code almost every day: over 100 commits from 2026-09-19 to 2026-10-01. Agree with YH before any Finance code changes.
2. **File samples.** Before the readers are built, collect a sample card report and a sample bank statement from each provider. Hong Leong's card report is a secured PDF.
3. **Deposit invoices.** Check them against Payment's invoice rules and e-invoice before switching them on.
4. **Exceptional refunds.** Decide how the Customer Refund voucher shows next to Payment's outstanding figure before it is built.
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
