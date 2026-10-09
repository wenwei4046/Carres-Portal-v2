# Carres Settings List
Last updated: 9 Oct 2026 (build state added). Current single file; no versioned copies.

Confirmed = setting scope/default has source or direct owner decision; NOT a build claim and NOT confirmation of every Not set cell. To check = authority/conflict/unsupplied value requires briefing-team verification or an owner answer. Designer must not fill gaps. All rows are coverage for Settings, not permission to create duplicate editors or new sidebar modules.

Office and Delivery & warehouse are the requested display categories, not interchangeable calendars. Supplier-specific production workweek stays supplier-owned; Calendar Not set is deliberate where the exact calendar is not verified. 3 courier working days must not silently select a mixed calendar. Source-only guarded policies stay read-only where a disable switch would bypass a gate.

Latest owner direction: rules configurable by authorised people; old Service MASTER read-only constants are a source conflict, not permission to pretend new editors already exist. Define effective treatment before implementation; do not universally assume New cases only. Approver people/rota live once in Staff & Duties; each source module points there. Recorded leave triggers qualified cover; MC submission uses Workspace → Leave (select MC, dates, optional proof, Submit; no upload is required), with no standalone MC Report page; owner confirmed 9 Oct that submission of today’s MC immediately starts qualified cover without waiting for approval. All leave currently requires no approval under the owner’s 9 Oct ruling; future approval can be configured. Operational cover does not decide payroll or evidence review. Jess can delegate section-specific Settings editing; this is not an executed grant.

Task numbers reference the current15-row dispatch list, not durable system action keys.9a/9b/9c are different facts. Field labels remain subject to exact COPY review. Never infer1–7/1–3 ranges or trigger semantics from the designer sample.

## Build state · 9 Oct 2026 · branch `build/settings-completion` · NOT deployed · migrations 0669–0674 and 0677–0679 NOT applied

Build state only; the Status column below stays the business-confirmation state. "Built" means code and migration on the branch, tested locally (unit tests, a full local replay of every migration and SQL proofs); it is not production verification. 0667 (Team list) and 0668 (Settings editors table and gate) were applied to production by another session on 9 Oct.

| ID | Built on the branch | Where it shows | Not connected yet, and why |
|---|---|---|---|
| COM-01 · COM-02 | Stored company identity and support contact, with who · when · old → new · optional reason (0669). Every printed document (SO, PO, DO, Invoice, GRN, Purchase Return, Repair Order, Receipt, Service Note…) prints the stored identity; the old wrong SSM `20201055306` and the Service Note's Kepong identity are removed. | Settings → Company | Country, company telephone/email, support WhatsApp/email are `Not set` (not verified). Brands/logos and billing issuer by brand are not built (not verified). Saved PDF files already issued are unchanged; a re-printed document uses the identity in force when printed. |
| OFF-01 · OFF-02 · OFF-03 · OFF-04 | Stored Office working days, hours, flexi, lunch, region with change record (0669). Office working days and holidays drive the Office deadlines: Work Sales Order Office items, PO window and its days, Safety days, PO reply and arrival checks, Manual Purchase, supplier claim / purchase return / repair order pages and Work, the PO register day-before check, the Supplier card, the MRP Chase days late, and the SQL doors for reply due (0584) and the Repair Order target (0602) through `_office_is_working_day` (0678). Office start, end, flexi and lunch, with each person's own lunch time, drive the activity check windows, the activity recording hours and the check-time bounds; the activity commit door reads the stored working days and holidays (0677). The payment chase day follows the responsible person's own working days (People record, 0678; Office weekdays when none is recorded) with the Office holidays; the customer's due date is a Delivery fact and never moves with staff working days. | Settings → Office · Settings → Personal → Lunch time · HR person → Working days | SQL doors see recorded Office holidays only; the app computes default dates with the full calendar including the built-in list. Not on this calendar by rule or by open question: Service Case clock (Service MASTER calendar conflict unresolved), Work page week rail (mixes calendars; no rule), supplier lead engine (supplier work week PUR-03 Not set). |
| OFF-05 | Office public holidays saved one year at a time; a year nobody recorded keeps the built-in list and the page says so. | Settings → Office | No Kuala Lumpur year is recorded yet (nothing invented). Office holidays move Office actions only. Delivery facts (logistics checks, Assign logistics by, delivery-day refusal, deliver and photo dues, payment due fact) count on the Delivery calendar: Monday to Saturday with the Selangor holidays Warehouse Settings stores for the dispatching Site, else the built-in list. |
| TEAM-02 · SET-01 | Owner names a person per section; every Settings write asks the same gate in the API and in SQL (0674): Purchasing (not supplier terms days), Payment, Delivery, Warehouse (keeps its own manage-settings capability), Staff & Duties, Saturday on-call, Sales Order entry, Issue Tracker. Pages show read-only to anyone not named. Measured: the only live ops_manager holder is Jess, so nobody loses a right. | Settings → Team and access → Settings editors | No grant is made. |
| SET-01 change records | Every Settings save keeps who · when · old → new: Company and Office (0669), Sales Order entry (0674), Issue Tracker Related Party adds, edits and removals (0679 §1); the module tables already kept theirs. Sales Order Settings and Issue Tracker Settings list their changes. | Each Settings page | A reason is optional (a compulsory reason is not confirmed). |
| Same-day leave and the activity trigger | Today's leave starts cover only on a stored Office working day (0679 §2); the activity trigger runs every day from 8:00 AM to 8:59 PM MYT and the stored Office calendar decides whether the day counts (a day off does nothing). | Workspace → Leave · Tasks | |
| WS-02 · WS-03 | 10:00 AM morning check is now storable (0670). The bounds follow Settings → Office: morning from Office start and before the Office lunch, afternoon after the Office lunch and before Office end (0677). Live values untouched. | Staff & Duties | |
| WS-04 · OFF-04 (personal lunch) | Each person's standing lunch start, empty = the Office lunch, one Office lunch length, start within the Office lunch ± its shift (12:00 PM to 2:00 PM at the defaults); set by the person or a Staff & Duties editor, change record kept. The activity check skips that lunch: no work moves from a person at lunch and none is handed to a colleague at lunch; the afternoon check comes the same time after the person's own lunch as the shared check is after the Office lunch (2:01 PM → 1:01 PM for a 12:00 lunch, 3:01 PM for a 2:00 PM lunch); lunch activity is not recorded (0677). | Settings → Personal → Lunch time | Staff & Duties does not show or edit other people's lunch on screen yet (the editor door exists). A lunch is a standing setting, not a dated occurrence: a one-day change is made by changing it and changing it back. |
| WS-05 · WS-07 | Monthly PO/GRN rota planner in staff-code order (PO advances one each month, GRN the next person), newcomer PO from the first day of the month after joining, departed holder re-planned, manager months left alone (0671 + daily cron). The 24 pre-written rows (Oct 2026 to Sep 2027) are relabelled `monthly_rotation` so the planner can follow team changes. | Staff & Duties `Next` | A person with no People join date and no PO history is treated as not yet eligible for PO (existing rule); HR should record join dates. |
| WS-11 | Workspace → Leave: MC (proof optional, up to 3 files), Emergency leave (reason), Planned leave (note); no approval; today's leave starts cover at once at any hour; future leave on its date; cancel keeps the record (0670). Staff & Duties shows who is on leave. | Workspace → Leave · Staff & Duties | No approval flow (needs its effective treatment first). Leave for someone who cannot log in is not built. Menu row only in the Operations area. Supersedes open PR #1966. |
| WS-12 | Saturday on-call: editable window (default 9:00 AM to 6:00 PM) with history and a dated rota of person and optional cover; a person on leave that Saturday is flagged, never replaced; never a Duty, never moves Tasks, never makes Saturday an Office day (0671). | Staff & Duties → Saturday on-call | No automatic rotation (cadence not decided). |
| WS-08 (Manage staff) | `Manage staff` shows for the owner and HR. | Staff & Duties | |
| PAY-03 · PAY-04 | Outstation pair stored with the effective-dated rule: outstation ask 4 (engineering default), deadline 3 (owner ruling) (0672); one arithmetic for Payment Monitor, Pay by, Work payment rows, Order Route and Logistics card. | Settings → Payment → Collection timing | Saving Collection timing needs 0672 applied first. |
| DEL-04 | Assign logistics by: stored lead, default 3 Delivery working days before Scheduled, else Requested (0673); used by Work, Logistics card, Orders list, Order Route `Assign logistics by {date}`. | Delivery Settings → Delivery Rules | A partner's own booking lead is not applied (no company is assigned while this deadline runs). Orders list tooltip and late count now use the stored deadline with the opening day . |
| DEL-05 | The stored contact lead drives the Logistics card's first check and its contact due. | Logistics card | Work `confirm_delivery_date` stays on the fixed 2-day check (Workspace §5.9). |
| WH-02 · WH-03 · WH-04 | GRN lateness counts on the receiving Site's own receiving calendar; unconfigured days fall back to Sunday off plus the Selangor holidays (stored Warehouse calendar, else built-in). On `build/settings-completion`: Schedule arrival (Receiving days) and pickup (Collection days) lateness, Inbound `Expected arrival was …`, and a Unit problem's due day read the Site's own calendar. | Work receiving item · Warehouse Schedule · Inbound · Unit problem | The Dashboard's `warehouseOperatingDates` (`warehouse-outbound.ts:25`) has no caller; nothing to connect. |
| DEL-10 | `Courier dispatch within` stored on Delivery Rules (0678, default 3, range 1–30, editor gate, change record), shown on Delivery Settings → Delivery Rules; one shared `courierDispatchDueIso` on the dispatching Warehouse's Collection days with the explicit Sunday + Selangor fallback. | Delivery Settings → Delivery Rules | BUILD GAP: the dispatch workflow (Warehouse confirms packable scope → dispatch due → batch handover with tracking → Operations follows) is not built, so nothing reads the setting yet. |
| People working week (Workspace MASTER:272) | `hr_employees.work_days` (0678), edited only in the HR person drawer (`Working days`); the payment collection ACTION day follows the responsible person's working days (Office weekdays when none are recorded) with the Office holidays. Payment FACTS never read it. | HR person drawer · Work · Payment Monitor · collection workspace | Staff & Duties does not show it yet. |

**Build gaps (the rule is decided; the build is not there yet):** DEL-10 courier dispatch workflow (Warehouse confirms the packable scope → dispatch due in 3 working days on the dispatching Warehouse calendar → handover in batches with tracking → Operations follows; the setting and its due arithmetic are built); Salesperson asks the customer for the delivery date (`ask_delivery_date` to the responsible Salesperson as a Sales Portal reminder, Workspace MASTER ~L2448; Sales Portal lane); Staff & Duties does not yet show a person's working week or lunch for others.

**Nothing to build:** FIFO is fixed matching behaviour in SO Batch (Purchasing MASTER ~L244–250), not a setting; the six-month warehouse review is not an automatic move (Rental MASTER ~L291–293).

**Undecided (kept open; they do not block the confirmed features):** Saturday on-call rotation cadence; recording leave for someone who cannot log in; which departments use Workspace → Leave; what changes at the 9:00 AM daily publication (WS-01); the PAY-08 storage-fee notice event; Service Case rule changes for open Cases and the Case calendar; Subscription forecast (deferred).


## Company

| ID | Setting | Purpose | Default | Range | Starts from | Day type | Calendar | Who can change | Takes effect | History | Affects Tasks / Order Route | Source | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| COM-01 | Legal company identity | Company name, SSM, address, postcode, contact and document identity | CARRES SDN. BHD. · 202401055306 (1601150-X) · registered address recorded below | Verified company facts | Not set | Not a day | Not set | Jess or section-authorised editor | Not set | Actor/time · old/new · effective date · reason | Company/document identity | Owner-provided company letterhead screenshot · 9 Oct 2026; docs/pdf/SO-PDF-STANDARD.md:73,408 | To check |
| COM-02 | Customer support identity and phone | One customer-facing contact; individual staff actors retained | Carres Support Team · 011-6133 8862 | Governed support identity | Not set | Not a day | Not set | Jess or section-authorised editor | Not set | Actor/time · old/new · effective date · reason | Customer-facing communication | OWNER-CLARIFICATIONS.md · Team research scope | Confirmed |

### Company field breakdown · 9 Oct blueprint

This expands COM-01/COM-02, not a second editor or new UI kit. Missing verified values are not proof that database data is absent. Additional fields below are proposed coverage until their owning source is verified.

| Field | Current verified value | Purpose | Authority |
|---|---|---|---|
| Legal company name | CARRES SDN. BHD. | Legal document issuer | Owner-provided letterhead screenshot · 9 Oct 2026 |
| Former company name | CARRESS SDN. BHD. | Preserve former-name identity shown on letterhead | Owner-provided letterhead screenshot · 9 Oct 2026 |
| SSM registration number | 202401055306 (1601150-X) | Legal company registration | Owner-provided letterhead screenshot · 9 Oct 2026 |
| Registered address line 1 | E-28-02 & E-28-03, MENARA SUEZCAP 2 | Legal document header | Owner-provided letterhead screenshot · 9 Oct 2026 |
| Registered address line 2 | KL GATEWAY, NO. 2, JALAN KERINCHI | Legal document header | Owner-provided letterhead screenshot · 9 Oct 2026 |
| Registered address line 3 | GERBANG KERINCHI LESTARI | Legal document header | Owner-provided letterhead screenshot · 9 Oct 2026 |
| Postcode | 59200 | Registered address | Owner-provided letterhead screenshot · 9 Oct 2026 |
| City | KUALA LUMPUR | Registered address | Owner-provided letterhead screenshot · 9 Oct 2026 |
| Country | Not verified | Company address | Proposed field; verify stored fact |
| Company telephone | Not verified | General company contact | Proposed field; do not assume support telephone |
| Company email | Not verified | General company contact | Proposed field |
| Customer support display name | Carres Support Team | Shared Operations customer contact | Owner decision; COM-02 |
| Customer support telephone | 011-6133 8862 | Customer calls | Owner decision; COM-02 |
| Support WhatsApp contact | Not verified | Customer messaging | Proposed field; do not assume telephone is WhatsApp-enabled |
| Support email | Not verified | Customer support email | Proposed field |
| Brands and logos | Carres / 2990 in business background; assets not verified here | Brand identity | Verify brand records and source assets before selection |
| Billing issuer by brand | Not verified | Link a brand to the correct legal company | Proposed relationship; do not invent another legal company |

Editing: Jess can edit and authorise another person for this Settings section. Record actor, time and changed values. A compulsory reason for every ordinary Company edit is NOT confirmed. Historical-document treatment and effective-date behaviour need their document-owner source before implementation.

Keep bank accounts in Payments, office hours/calendars in Office, warehouse details in Warehouse, and staff login/permissions in Team. Link existing records rather than maintain duplicates. This is blueprint coverage, not a build or production verification claim.

## Office

| ID | Setting | Purpose | Default | Range | Starts from | Day type | Calendar | Who can change | Takes effect | History | Affects Tasks / Order Route | Source | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| OFF-01 | Office working weekdays | Shared office-based deadline calendar | Monday–Friday | Editable weekdays; Saturday support is a separate rota | Company calendar | Working | Office | Jess or section-authorised editor | Not set | Actor/time · old/new · effective date · reason | Office-based Tasks; supplier and warehouse calendars remain separate | Owner confirmed 9 Oct 2026 in this chat | Confirmed |
| OFF-02 | Standard office start and end | Base office hours before flexi arrangements | 9:00 AM–6:00 PM | Editable by authorised settings editor | Company local workday | Not a day | Office | Jess or section-authorised editor | Not set | Actor/time · old/new · effective date · reason | Availability; not an invented deadline | Owner confirmed 9 Oct 2026 in this chat | Confirmed |
| OFF-03 | Office flexi allowance | Preserve owner-approved one-hour flexibility | One hour | Exact start/end offset treatment to verify | Base office schedule | Not a day | Office | Jess or section-authorised editor | Not set | Actor/time · old/new · effective date · reason | Personal availability | OWNER-CLARIFICATIONS.md T02; 10:00–19:00 is an example, not base hours | Confirmed |
| OFF-04 | Default lunch and shift allowance | One-hour actual lunch excluded from checks; retain tasks | 13:00–14:00 · one-hour shift | One-hour duration · actual start 12:00–14:00 | Actual staff lunch occurrence | Not a day | Office | Jess or section-authorised policy editor | Not set | Actor/time · old/new · effective date · reason | WS-04 source link · activity checks | OWNER-CLARIFICATIONS.md · Team research scope | Confirmed |

| OFF-05 | Office public holiday calendar | Exclude applicable public holidays from Office working-day calculations | Kuala Lumpur public holidays | Applicable year · authorised corrections; Warehouse has its own calendar | Office calendar | Working | Office · Kuala Lumpur | Jess or section-authorised editor | Effective calendar dates; historical recalculation policy not set | Actor/time · old/new | Office-based Tasks and deadlines | Owner confirmed 9 Oct 2026 in this chat | Confirmed |

## Team and access

This is capability coverage, not approval of a new tab set or sidebar placement. Identity/employment/leave remain People-owned; Duty/cover remains Workspace-owned.

| ID | Setting | Purpose | Default | Range | Starts from | Day type | Calendar | Who can change | Takes effect | History | Affects Tasks / Order Route | Source | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| TEAM-01 | Directory and organisation source links | One staff identity with department, title, reports-to and account status | Existing People/Team source | Authorised scope; former profiles restricted | Source facts | Not a day | Not set | Existing personnel/account manager | Source-owned | Actor/time · old/new · effective date · reason | Staff qualification · assignment | 16-hr-MASTER.md §§2–3; Houzs directory/departments/titles/org chart observed | Confirmed |
| TEAM-02 | Section-specific Settings edit rights | Jess delegates editing for named Settings sections | No new grant made | Named section; no inherited money approval | Authorised explicit delegation | Not a day | Not set | Jess; further delegation authority not inferred | Not set | Actor/time · old/new scope · effective date | Settings writes, separate from ordinary work/approvals | OWNER-CLARIFICATIONS.md · Team research scope; Houzs settings.manage observed | Confirmed |

## Workspace

| ID | Setting | Purpose | Default | Range | Starts from | Day type | Calendar | Who can change | Takes effect | History | Affects Tasks / Order Route | Source | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| WS-01 | Daily task publication time | Publish daily work | 09:00 | Not set | Company local day | Not a day | Not set | Authorised Staff & Duties editor | Not set | Who · when · old → new · effective date · reason | All Tasks | OWNER-CLARIFICATIONS.md · T02 | Confirmed |
| WS-02 | Morning activity check | Check availability before governed cover; observed live value 10:15 on 8 Oct, unchanged | 10:00 | Not set | Not set | Not a day | Not set | Authorised Staff & Duties editor | Not set | Who · when · old → new · effective date · reason | Routine unfinished Tasks | OWNER-CLARIFICATIONS.md:136 · owner8Oct | Confirmed |
| WS-03 | Afternoon activity check | Check availability before governed cover | 14:01 | Not set | Not set | Not a day | Not set | Authorised Staff & Duties editor | Not set | Who · when · old → new · effective date · reason | Routine unfinished Tasks | OWNER-CLARIFICATIONS.md:136 · owner8Oct | Confirmed |
| WS-04 | Actual lunch source link | Keep assigned tasks; exclude actual lunch from availability check | Office lunch default via OFF-04 | One hour · may shift one hour | Actual staff lunch occurrence | Not a day | Office | Source-authorised staff; policy editor uses Office | Actual occurrence; no task transfer solely for lunch | Who · when · old → new · effective date · reason | Activity checks | OWNER-CLARIFICATIONS.md · Team research scope | Confirmed |
| WS-05 | Duty holder and rota | One coordinating holder per duty; PO Duty and GRN Duty rotate monthly; normal rota assigns different people | PO Duty: monthly rotation · GRN Duty: monthly rotation | Active eligible staff | Not set | Not a day | Not set | Authorised Staff & Duties editor | Not set | Who · when · old → new · effective date · reason | PO · GRN · approval Tasks | 05-workspace-MASTER.md:253 · OWNER-CLARIFICATIONS.md:74 · owner8Oct | Confirmed |
| WS-06 | Cover order | Directly assign qualified available cover | Not set | Active qualified available staff | Not set | Not a day | Not set | Authorised Staff & Duties editor | Not set | Who · when · old → new · effective date · reason | Routine unfinished Tasks | OWNER-CLARIFICATIONS.md:74 · owner8Oct | Confirmed |
| WS-07 | PO Duty eligibility for new staff | Joining month assists only; eligible next month | First day of next calendar month | Not set | Employee joining date | Not a day | Not set | Authorised Staff & Duties editor | Not set | Who · when · old → new · effective date · reason | PO Duty rota · Tasks#1/3/4 | OWNER-CLARIFICATIONS.md:136 · owner8Oct | Confirmed |
| WS-08 | Employee status and leave source | Link one People record; do not duplicate HR data | People source | Active · leave · departure facts | Not set | Not a day | Not set | People-authorised administrator | Not set | Who · when · old → new · effective date · reason | Eligibility · cover | 16-hr-MASTER.md:176–177 · 08-stock-MASTER.md:1461–1464 | Confirmed |
| WS-09 | Uncertain attendance handling | Confirm once per person before task movement | Not set | Not set | Not set | Not a day | Not set | Not set | Not set | Who · when · old → new · effective date · reason | Morning/final-check cover | OWNER-CLARIFICATIONS.md:136 · owner8Oct | To check |
| WS-10 | Approval decision target | Approve or reject required applications | 1 | Not set | Not set | Working | Not set | Authorised Staff & Duties editor | Not set | Who · when · old → new · effective date · reason | Tasks#13 · source approval record | OWNER-CLARIFICATIONS.md:130 · owner8Oct | Confirmed |
| WS-11 | MC self-submission treatment | Workspace → Leave: staff selects MC and dates and submits (proof upload optional, never required); no standalone MC Report page; today’s MC or Emergency leave submission immediately starts cover without waiting for approval; HR review remains separate | No approval for all leave types; today immediate cover, future absence on its date | Qualified available cover; future approval configurable | Staff submits absence dates | Not a day | Staff absence dates; source-owned | Staff submits own MC; policy editor qualification to verify | Immediate cover trigger; no inferred MC approval | Submitter/time · absence dates · task cover and actual actors | People leave · Tasks cover; receiving colleague must be eligible and working | Owner confirmed MC trigger and Workspace Leave entry 9 Oct 2026 in this chat; 16-hr-MASTER.md:176–177 | Confirmed |
| WS-12 | Saturday on-call coverage and cover | Rotate full-day customer/driver/warehouse/delivery contact coverage | 9:00 AM–6:00 PM | Active eligible staff · editable time window | Saturday on-call window | Not a day | Saturday on-call schedule; separate from Office calendar | Authorised Staff & Duties editor | Dated rota; preserve recorded cover | Who · when · old → new · effective date · reason | Contact coverage; separately governed issue follow-up; no automatic daily-task transfer | OWNER-CLARIFICATIONS.md · Saturday duty owner8Oct | Confirmed |

## Showroom

| ID | Setting | Purpose | Default | Range | Starts from | Day type | Calendar | Who can change | Takes effect | History | Affects Tasks / Order Route | Source | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| SH-01 | Sites and showroom access link | Read governed location/operator/access setup | Warehouse Sites | No duplicate editor | Not set | Not a day | Not set | Warehouse-authorised editor | Not set | Who · when · old → new · effective date · reason | Display goods · transfers | 08-stock-MASTER.md:153,1461–1464 | Confirmed |
| SH-02 | Display and consignment policy link | Read Purchasing-owned requests/terms | Purchasing source | No duplicate editor | Not set | Not a day | Not set | Not set | Not set | Who · when · old → new · effective date · reason | Display requests · consignment | 07-purchasing-MASTER.md:7800–7808 | Confirmed |

## Sales Orders

| ID | Setting | Purpose | Default | Range | Starts from | Day type | Calendar | Who can change | Takes effect | History | Affects Tasks / Order Route | Source | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| SO-01 | Order Entry configuration link | Same single configuration used by Sales Portal | Existing source | No duplicate Operations config | Not set | Not a day | Not set | Existing source-authorised editor | Not set | Who · when · old → new · effective date · reason | Future Portal order entry | 06-orders-MASTER.md:6747–6773 | Confirmed |
| SO-02 | Operational rules links | Read purchasing/stock/delivery/payment owners | Shared source rules | Read only here | Not set | Not a day | Not set | Not set | Not set | Who · when · old → new · effective date · reason | Order Route · Tasks | 02-ERP-ARCHITECTURE.md:173–186 | Confirmed |
| SO-03 | Columns and saved views | Personal display preferences, not business law | Not set | Not set | Not set | Not a day | Not set | Each authorised user | Own display only | Who · when · old → new · effective date · reason | Own list | 06-orders-MASTER.md:6770–6773 | Confirmed |

## Purchasing

| ID | Setting | Purpose | Default | Range | Starts from | Day type | Calendar | Who can change | Takes effect | History | Affects Tasks / Order Route | Source | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| PUR-01 | PO windows | Batch qualified demand in daily rounds | First 11:30 AM · second 4:00 PM (optional) | Authorised editable times; exact current live values not checked | Eligible source demand | Not a day | Not set | Authorised Purchasing Settings editor | Not set | Who · when · old → new · effective date · reason | Tasks#1 · PO batch | 07-purchasing-MASTER.md:1374–1403 · OWNER-CLARIFICATIONS.md PO windows | Confirmed |
| PUR-02 | PO Days | Which days have PO rounds | Office working days | Configured weekdays | Not set | Working | Office | Authorised Purchasing Settings editor | Not set | Who · when · old → new · effective date · reason | Tasks#1 | 07-purchasing-MASTER.md:7793–7797 | Confirmed |
| PUR-03 | Supplier work week | Supplier production calendar | Not set | Supplier-specific | Not set | Working | Not set | Authorised Purchasing Settings editor | Not set | Who · when · old → new · effective date · reason | PO ETA · Order By | 07-purchasing-MASTER.md:7801–7804 | Confirmed |
| PUR-04 | Production days by supplier and category | Calculate supplier production target | Mattress7 · Bedframe7 · Sofa14 | Preserve explicit supplier values | Governed PO start | Working | Not set | Authorised Purchasing Settings editor | Not set | Who · when · old → new · effective date · reason | PO ETA · Route Goods | 07-purchasing-MASTER.md:7828–7840 | Confirmed |
| PUR-05 | Ready Stock priority | Ordering for manual stock match | Requested Delivery Date | Requested Delivery Date · Proceed Date | Not set | Not a day | Not set | Authorised Purchasing Settings editor | Subsequent matches; retain active match scope | Who · when · old → new · effective date · reason | SO Batch matching | 07-purchasing-MASTER.md:372–382 | Confirmed |
| PUR-06 | Supplier contacts and channel | Verified contact/address/channel | Not set | Email · WhatsApp source channels | Not set | Not a day | Not set | Authorised Purchasing Settings editor | Not set | Who · when · old → new · effective date · reason | Issue PO · supplier follow-up | 07-purchasing-MASTER.md:7801–7824 | Confirmed |
| PUR-07 | Supplier Deliver To and collection | Verified destination/receiving station and pickup model | Carres Klang source default | Governed active destinations | Not set | Not a day | Not set | Authorised Purchasing Settings editor | Not set | Who · when · old → new · effective date · reason | Receiving · custody · Route | 07-purchasing-MASTER.md:7799–7802,1122 | Confirmed |
| PUR-08 | Claim reply waiting days | Supplier Claim response target | 2 | 1–30 | Recorded supplier claim request | Working | Office | Authorised Purchasing Settings editor | Keep existing dated obligation | Who · when · old → new · effective date · reason | Supplier Claim follow-up | 07-purchasing-MASTER.md:5028–5040 | Confirmed |
| PUR-09 | Claim extra escalation days | Raise qualified approval after missed reply | 2 | 1–30 | Missed claim reply date | Working | Office | Authorised Purchasing Settings editor | Keep existing dated obligation | Who · when · old → new · effective date · reason | Claim escalation | 07-purchasing-MASTER.md:5028–5040 | Confirmed |
| PUR-10 | Manual Purchase purposes and limits | Maintain permitted buying/approval policy | Not set | Not set | Not set | Not a day | Not set | Authorised Purchasing Settings editor | Not set | Who · when · old → new · effective date · reason | Manual Purchase approval | 07-purchasing-MASTER.md:7798 · owner Jess Manual Purchase approval | To check |
| PUR-11 | Repair return target | Supplier repair follow-through | Not set | 1–90 | Not set | Working | Not set | Authorised Purchasing Settings editor | Not set | Who · when · old → new · effective date · reason | Repair tasks | 07-purchasing-MASTER.md:6332 | To check |

## Warehouse

| ID | Setting | Purpose | Default | Range | Starts from | Day type | Calendar | Who can change | Takes effect | History | Affects Tasks / Order Route | Source | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| WH-01 | Site details | Site/status/operator/contact/address/time zone | Verified source only | Not set | Not set | Not a day | Not set | Warehouse Settings-authorised editor | Not set | Who · when · old → new · effective date · reason | Receipt · custody · transfers | 08-stock-MASTER.md:1393–1406 | Confirmed |
| WH-02 | Receiving and collection hours | Independent weekly receiving/collection availability | Not set | Closed · configured hours | Not set | Not a day | Not set | Warehouse Settings-authorised editor | Not set | Who · when · old → new · effective date · reason | GRN · pickup/handover | 08-stock-MASTER.md:1407–1410 | Confirmed |
| WH-03 | Public holiday policy | Persist verified holiday source and site availability | Not set | Closed · receiving only · collection only · normal · special | Not set | Not a day | Not set | Warehouse Settings-authorised editor | Not set | Who · when · old → new · effective date · reason | Warehouse calendar | 08-stock-MASTER.md:1411–1416 | Confirmed |
| WH-04 | Special dates | Dated receiving/collection exceptions with reason | Not set | Not set | Not set | Not a day | Not set | Warehouse Settings-authorised editor | Not set | Who · when · old → new · effective date · reason | Warehouse calendar | 08-stock-MASTER.md:1417–1419 | Confirmed |
| WH-05 | Access capabilities | Active-person settings/receipt/collection/count capability | Not set | Capability/source permission only | Not set | Not a day | Not set | Warehouse-authorised administrator | Not set | Who · when · old → new · effective date · reason | Authorised warehouse actions | 08-stock-MASTER.md:1420–1430 | Confirmed |
| WH-06 | Stock Count policy | Scope/recount/evidence/physical-person assignment | Not set | Not set | Not set | Not a day | Not set | Not set | Not set | Who · when · old → new · effective date · reason | Stock Count tasks | 08-stock-MASTER.md:1436–1442 | To check |
| WH-07 | Month-end Count window | Maintain count/submission rule | Final day23:59 · window2 | Not set | Month end | Calendar | Not set | Not set | Not set | Who · when · old → new · effective date · reason | Month-end count | 08-stock-MASTER.md:1443–1445 | Confirmed |
| WH-08 | Problem evidence and Unit labels | Minimum observable evidence; governed Unit identity | Source policy | No renaming existing Unit · no disabling identity guard | Not set | Not a day | Not set | Not set | Not set | Who · when · old → new · effective date · reason | Receipt · problems · Unit labels | 08-stock-MASTER.md:1446–1451 | Confirmed |
| WH-09 | External operator scope | Organisation/Sites/actions/evidence/active dates | Not set | Not set | Not set | Not a day | Not set | Not set | Not set | Who · when · old → new · effective date · reason | Warehouse external portal | 08-stock-MASTER.md:1457–1464 | Confirmed |

## Payments

| ID | Setting | Purpose | Default | Range | Starts from | Day type | Calendar | Who can change | Takes effect | History | Affects Tasks / Order Route | Source | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| PAY-01 | Receiving bank accounts and routing | Verified accounts and governed selection | Not set | Not set | Not set | Not a day | Not set | Authorised Payment Settings editor | Not set | Who · when · old → new · effective date · reason | Customer payment instructions | 10-payment-MASTER.md:789–812 | Confirmed |
| PAY-02 | Payment methods | Maintain permitted active methods | Not set | Not set | Not set | Not a day | Not set | Authorised Payment Settings editor | Not set | Who · when · old → new · effective date · reason | Payment recording | 10-payment-MASTER.md:789–812 | Confirmed |
| PAY-03 | Start chasing payment | Open qualified customer collection | 3 | Start lead greater than completion lead | Before Scheduled delivery; admission gates first | Working | Office | Authorised Payment Settings editor | Snapshot effective collection clock | Who · when · old → new · effective date · reason | Tasks#8 · Route Payment | 10-payment-MASTER.md:350–378,803–809 | Confirmed |
| PAY-04 | Collection completion lead | Complete required collection before delivery | 2 ordinary · 3 outstation | Start lead greater than completion lead | Before Scheduled delivery | Working | Office | Authorised Payment Settings editor | Snapshot effective collection clock | Who · when · old → new · effective date · reason | Tasks#8 · DO money read | 10-payment-MASTER.md:364–378,803–809 | Confirmed |
| PAY-05 | Storage group free days | Per-order group free storage period | Mattress+bedframe7 · Sofa14 | Not set | Witnessed governed Storage Start | Calendar | Not set | Authorised Payment Settings editor | Snapshot at Storage Start; no old-case recalculation | Who · when · old → new · effective date · reason | Storage calculations · Tasks#12 | 10-payment-MASTER.md:578–640 | Confirmed |
| PAY-06 | Storage amount and cycle | Charge full commenced group cycle | Mattress+bedframeRM150/30days · SofaRM200/14days | Not set | End of effective free period | Calendar | Not set | Authorised Payment Settings editor | Snapshot; issued invoice retained | Who · when · old → new · effective date · reason | Storage invoice · Route money | 10-payment-MASTER.md:615–649 | Confirmed |
| PAY-07 | Free-storage extension and waiver authority | Total-day limits and eligible approval | Not set | Not set | Not set | Not a day | Not set | Not set | Not set | Who · when · old → new · effective date · reason | Storage application/approval | 10-payment-MASTER.md:651–675 · OWNER-CLARIFICATIONS.md Operations no money approval | To check |
| PAY-08 | Tell customer storage fee within | Notify customer and record proof | Same day | Not set | Governed payable storage-charge notice event | Working | Office | Authorised staff | Not set | Who · when · old → new · effective date · reason | Tasks#12 · Route Payment | OWNER-CLARIFICATIONS.md:110 · owner8Oct | Confirmed |
| PAY-09 | Message templates | Versioned payment/invoice messages | Not set | One default per purpose | Not set | Not a day | Not set | Authorised Payment Settings editor | Not set | Who · when · old → new · effective date · reason | Payment communication | 10-payment-MASTER.md:789–812 | Confirmed |
| PAY-10 | Document numbers and payment-provider status | Automatic numbering/connection fact | Existing source | No historical renumbering · no secret exposed | Not set | Not a day | Not set | Authorised Payment Settings editor | Not set | Who · when · old → new · effective date · reason | Receipt · Invoice · online payment | 10-payment-MASTER.md:789–812 | Confirmed |

## Delivery

| ID | Setting | Purpose | Default | Range | Starts from | Day type | Calendar | Who can change | Takes effect | History | Affects Tasks / Order Route | Source | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| DEL-01 | Logistics company details | Verified contacts/status/customer-facing number | Not set | Not set | Not set | Not a day | Not set | Authorised Delivery Settings editor | Not set | Who · when · old → new · effective date · reason | Assignment · contact | 09-delivery-MASTER.md:1811–1837 | Confirmed |
| DEL-02 | Coverage and default/fallback | Regions/postcodes/exclusions/default company | Not set | Not set | Not set | Not a day | Not set | Authorised Delivery Settings editor | Not set | Who · when · old → new · effective date · reason | Assign logistics · routes | 09-delivery-MASTER.md:1820 | Confirmed |
| DEL-03 | Company schedule | Pickup/delivery weekdays/transit/cutoff/capacity/closed dates | Verified company values | Not set | Not set | Not a day | Not set | Authorised Delivery Settings editor | Not set | Who · when · old → new · effective date · reason | Backward dates · pickup/last mile | 09-delivery-MASTER.md:1820,1825–1831 | Confirmed |
| DEL-04 | Assignment lead | Deadline separate from opening trigger | 3 | Not set | Before Scheduled delivery else Requested delivery | Working | Delivery & warehouse | Authorised Delivery Settings editor | Not set | Who · when · old → new · effective date · reason | Tasks#2 · Route Delivery | 09-delivery-MASTER.md:158–172 | Confirmed |
| DEL-05 | Contact lead and DO availability | Source-owned contact/DO timing; payment mirror | Not set | Not set | Not set | Not a day | Not set | Authorised Delivery Settings editor | Not set | Who · when · old → new · effective date · reason | Tasks#6 · DO gate | 09-delivery-MASTER.md:1821 · 10-payment-MASTER.md:406 | To check |
| DEL-06 | Required delivery evidence | Success/service/goods proof policy | Existing source policy | Required successful proof cannot be disabled | Not set | Not a day | Not set | Authorised Delivery Settings editor | Not set | Who · when · old → new · effective date · reason | Proof review · residual work | 09-delivery-MASTER.md:1821,1843–1858 | Confirmed |
| DEL-07 | Delivery services and charges | Stair carry/disposal/dismantling/surcharge scopes | Not set | Not set | Not set | Not a day | Not set | Authorised Delivery Settings editor | Not set | Who · when · old → new · effective date · reason | Route · charges · qualified approvals | 09-delivery-MASTER.md:1820–1821 | Confirmed |
| DEL-08 | Drivers vehicles and transit-site links | Known templates and Warehouse-owned Sites | Not set | No second transit-site editor | Not set | Not a day | Not set | Authorised Delivery Settings editor | Not set | Who · when · old → new · effective date · reason | Trip/handover | 09-delivery-MASTER.md:1820,1843–1851 | Confirmed |
| DEL-09 | Delivery message templates | Versioned messages per purpose | Not set | One default per purpose | Not set | Not a day | Not set | Authorised Delivery Settings editor | Not set | Who · when · old → new · effective date · reason | Customer/logistics communication | 09-delivery-MASTER.md:1822 | Confirmed |
| DEL-10 | Courier stock items dispatch within | Warehouse dispatch target; Ops follows batches | 3 | 1–30 | Warehouse confirms received/checked/packable dispatch scope | Working | Dispatching Warehouse (its Collection days; Sunday + Selangor holidays when not configured) | Delivery Settings editor | From the day saved | Who · when · old → new · effective date · reason | Tasks#14 · Route remaining accessories | OWNER-CLARIFICATIONS.md:114 · owner8Oct · owner 9 Oct (3 working days, adjustable, dispatching Warehouse's calendar) | Confirmed |
| DEL-11 | Sofa loan rules | Eligible loan and each action contract | Not set | Not set | Not set | Not a day | Not set | Not set | Not set | Who · when · old → new · effective date · reason | Tasks#15 | 25-MODULE-DESIGN-WORKLIST.md current dispatch review#15 | To check |

## Customer Care

| ID | Setting | Purpose | Default | Range | Starts from | Day type | Calendar | Who can change | Takes effect | History | Affects Tasks / Order Route | Source | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CARE-01 | Shared eligibility calendar and payment links | Use existing source permissions; no second staff/holiday/finance config | Source-owned settings | Read only links | Not set | Not a day | Not set | Not set | Not set | Who · when · old → new · effective date · reason | Customer enquiries/support | 14-customer-service-MASTER.md:855–867 | Confirmed |
| CARE-02 | Channel configuration | Authorised integration/recovery setup | Not set | Not set | Not set | Not a day | Not set | Not set | Not set | Who · when · old → new · effective date · reason | Customer communication channels | 14-customer-service-MASTER.md:857–866 | To check |
| SVC-01 | Service first substantive reply | Service Case reply target | 2 | Not set | Case submission/opening | Working | Office | Not set | Not set | Who · when · old → new · effective date · reason | Case first response | 11-service-MASTER.md:19,188–195 · owner editable-rule direction | Confirmed |
| SVC-02 | Service Case period and day10 call | Case clock and deadline-bound contact | 14 · day10 | Not set | Source Case calendar rule | Working | Office | Not set | Not set | Who · when · old → new · effective date · reason | Case deadline · call | 11-service-MASTER.md:422 · owner editable-rule direction | Confirmed |
| SVC-03 | Service policy/playbooks/evidence and changes | Approved remedies/guarantee scope; versioned structured outcomes | Source approved policy | Not set | Not set | Not a day | Not set | Not set | Not set | Who · when · old → new · effective date · reason | Case decision · linked module actions | 11-service-MASTER.md:64–68,775–794 · 12-guarantee-MASTER.md source | To check |
| SVC-04 | Service duty and approver links | One Case owner with help, qualified approvals | Staff & Duties source | No separate staff list | Not set | Not a day | Not set | Not set | Not set | Who · when · old → new · effective date · reason | Service Case Tasks | 11-service-MASTER.md:19 · OWNER-CLARIFICATIONS.md team/approval boundaries | Confirmed |

## Issue Tracker

| ID | Setting | Purpose | Default | Range | Starts from | Day type | Calendar | Who can change | Takes effect | History | Affects Tasks / Order Route | Source | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ISS-01 | Types and source mappings | Governed incident classification | Not set | Not set | Not set | Not a day | Not set | Not set | Not set | Who · when · old → new · effective date · reason | Issue intake/links | 15-issue-tracker-MASTER.md:403–416 | Confirmed |
| ISS-02 | Materiality review cost/recovery rules | Thresholds/attribution/recovery/restricted scopes | Not set | Not set | Not set | Not a day | Not set | Not set | Not set | Who · when · old → new · effective date · reason | Issue review/approval; Finance owns money | 15-issue-tracker-MASTER.md:403–416 | Confirmed |
| ISS-03 | Review meeting schedule | Review day/time/duration/backup/participants/reminders | Wednesday day only | Other values Not set | Not set | Not a day | Not set | Not set | Not set | Who · when · old → new · effective date · reason | Review sessions/agendas | 15-issue-tracker-MASTER.md:964–969 | Confirmed |
| ISS-04 | Recipients retention learning destinations | Related-party reporting and governed access/retention | Not set | Not set | Not set | Not a day | Not set | Not set | Not set | Who · when · old → new · effective date · reason | Issue reporting/history | 15-issue-tracker-MASTER.md:403–416 | Confirmed |

## Reports

| ID | Setting | Purpose | Default | Range | Starts from | Day type | Calendar | Who can change | Takes effect | History | Affects Tasks / Order Route | Source | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| REP-01 | Metric definitions and coverage | One definition shared by summaries/reports | Not set | Not set | Not set | Not a day | Not set | Not set | Not set | Who · when · old → new · effective date · reason | Reports · module Summary | 23-REPORTS-PLACEMENT-DECISION.md | To check |
| REP-02 | Evening report time recipients and frequency | Publish owner-approved content with defined metrics | Not set | Not set | Not set | Not a day | Not set | Not set | Not set | Who · when · old → new · effective date · reason | Evening report | OWNER-CLARIFICATIONS.md T08 | To check |

## Suppliers

| ID | Setting | Purpose | Default | Range | Starts from | Day type | Calendar | Who can change | Takes effect | History | Affects Tasks / Order Route | Source | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| SUP-01 | Supplier configuration link | Purchasing owns contacts/channel/address/workweek/lead/destination | Purchasing source | No duplicate editor | Not set | Not a day | Not set | Not set | Not set | Who · when · old → new · effective date · reason | PO · supplier replies | 07-purchasing-MASTER.md:7801–7824 | Confirmed |

## Catalog

| ID | Setting | Purpose | Default | Range | Starts from | Day type | Calendar | Who can change | Takes effect | History | Affects Tasks / Order Route | Source | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CAT-01 | Product/category identity policy | Own product identity/category; exact setup needs canonical authority | Not set | Not set | Not set | Not a day | Not set | Not set | Not set | Who · when · old → new · effective date · reason | Items · stock/storage grouping · services | 02-ERP-ARCHITECTURE.md:304–321 | To check |

## Dashboard

| ID | Setting | Purpose | Default | Range | Starts from | Day type | Calendar | Who can change | Takes effect | History | Affects Tasks / Order Route | Source | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| DASH-01 | Summary metric source link | Use same report definitions; no separate calculation settings | Reports source | No duplicate metric writer | Not set | Not a day | Not set | Not set | Not set | Who · when · old → new · effective date · reason | Dashboard summaries | 23-REPORTS-PLACEMENT-DECISION.md | To check |

## Settings

| ID | Setting | Purpose | Default | Range | Starts from | Day type | Calendar | Who can change | Takes effect | History | Affects Tasks / Order Route | Source | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| SET-01 | Rule edit/change contract | Central permission-filtered home; owner-controlled changes | Old/new · actor/time · reason · effective date | No duplicate source-owned settings | Not set | Not a day | Not set | Source-qualified editor | Not set | Who · when · old → new · effective date · reason | All authorised Settings changes | 02-ERP-ARCHITECTURE.md:173–186 · 10-payment-MASTER.md:789–812 | Confirmed |
| SET-02 | Office holiday and time-zone configuration | Link Office holiday OFF-05 and weekdays OFF-01; no duplicate editor; time zone still to verify | Kuala Lumpur holidays · time zone not verified | Verified source only | Not set | Not a day | Not set | Not set | Not set | Who · when · old → new · effective date · reason | Office-based deadlines | 05-workspace-MASTER.md:1159 · 07-purchasing-MASTER.md:1391–1392 | To check |
| SET-03 | Appearance and EN/中文 wording | Shared visual/wording config, not business permissions | Not set | Not set | Not set | Not a day | Not set | Not set | Not set | Who · when · old → new · effective date · reason | All screens | OWNER-CLARIFICATIONS.md T04 · owner fresh-design direction | To check |

## Sales Orders · Subscription (Deferred)

| ID | Setting | Purpose | Default | Range | Starts from | Day type | Calendar | Who can change | Takes effect | History | Affects Tasks / Order Route | Source | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| SUB-01 | Forecast plan configuration | Scope/units/report day/calendar/method/explicit buffer | Monthly target ·45day horizon; exact values Not set | Not set | Not set | Not a day | Not set | Not set | Not set | Who · when · old → new · effective date · reason | Future subscription forecast | 13-rental-MASTER.md:679–683 · OWNER-CLARIFICATIONS.md B07 | To check |


## Production reconciliation and audit evidence · 8 October 2026

Read 26-BLUEPRINT-AUDIT-BACKLOG.md for priority, source ownership and acceptance. The Settings rail was freshly observed read-only at `/operation/settings/payment` (SA profile); content/write/denied behaviour is not implied by a destination being visible.

| Existing source | Observed production destination / scope | Inventory mapping | Proof boundary |
|---|---|---|---|
| Sales Order Settings | `/operation/settings/sales-orders`; recorded earlier shared Order Entry/payment methods/fields | SO-01; existing editor reused | Earlier editor opened/cancelled; local reuse source verified; persistence untested |
| Warehouse Details | `/operation/settings/warehouse/details` | WH-01 | Rail visible, fresh content/write untested |
| Working Hours | `/operation/settings/warehouse/working-hours` | WH-02 | Receiving/collection stay site-owned, not Office |
| Public Holidays | `/operation/settings/warehouse/public-holidays` | WH-03 | Policy/source and actor's Office calendar are separate |
| Special Dates | `/operation/settings/warehouse/special-dates` | WH-04 | Dated site exception; no implied Office override |
| Warehouse Access | `/operation/settings/warehouse/access` | WH-05 | Local guarded capability grant/revoke exists; no grant made |
| Delivery Access | `/operation/settings/delivery/access` | DEL-12 below | Local page links Duty/charge approver to shared Staff & Duties; not a second Warehouse grant matrix |
| Payment Settings | `/operation/settings/payment` | PAY rows | Live 3/2 collection; old Saturday and Operations storage-approval words; some unknown actors and missing templates. BA-02/05/10/15, not a new approved rule |

| ID | Setting/capability | Source ownership and current evidence | Default/effective/editor/history | Status |
|---|---|---|---|---|
| DEL-12 | Delivery Access source links | Existing Delivery page reads delivery_duty and delivery_charge_approver; shared Staff & Duties owns dated holders, qualification and cover. Local DeliverySettings.tsx:1060–1078; live rail8Oct | Existing source only; no grant or extra approval power; effective/history use shared resolver; section-edit rights separate from operational approval | Existing local source + production destination VERIFIED; runtime rights UNVERIFIED |
| SET-04 | Required connection/sync/job evidence | Owning integration reads safe connection status, object/job/attempt/result/error and retry evidence; no secrets in Settings; actual required integrations identified before treating as gate | Current values/required scope not verified; editor source-qualified; retry cannot duplicate source writes; history preserves attempts | PROPOSAL/VERIFY BA-11/16; no universal go-live blocker |

Company support remains **Carres Support Team / 011-6133 8862**; company name, former name, SSM and registered address were supplied in the owner’s 9 Oct letterhead screenshot; other company values remain unverified. Office Monday–Friday, 9:00 AM–6:00 PM were confirmed by the owner on 9 Oct. Lunch is approved; WS-04 links OFF-04 instead of a second policy editor. Saturday support09:00–18:00 is editable and distinct from ordinary Office workweek. Section delegation is approved capability, not executed permissions. Root and briefing copies are distribution copies of this one inventory, not independent versions.

### Leave types · owner update 9 Oct 2026

Workspace → Leave is one submission entry. MC and Emergency leave submissions covering today immediately start qualified available cover without waiting for approval; this is operational routing, not HR approval. Emergency leave records absence dates and a short reason. On leave is the employee’s absence status, not another application type or page. Owner confirmed: all leave types currently require no approval. Submission covering today starts qualified available cover immediately; future-dated leave starts cover on the absence date, not on the submission date. Settings must allow Jess or an authorised editor to introduce approval requirements later; policy effective treatment must be defined before implementation.

### Leave approval policy · confirmed 9 Oct 2026

All leave types currently need no approval (MC, Emergency leave, Planned leave). Keep one Workspace → Leave entry. Configure Approval required = No in Staff & Duties leave policy; Jess may change it or delegate an authorised editor to change it later. Submission covering today activates qualified available cover immediately; a future absence activates cover on its absence date. This does not remove required evidence fields. Any future approval-policy change must define its effective date and treatment of existing submissions; do not retroactively reject them by assumption. No implementation claim.

### PO Duty rota · confirmed 9 Oct 2026

PO Duty rotates once per calendar month. Keep one coordinating duty holder; other qualified staff may help, with actual action actor recorded separately. A new employee becomes eligible for PO Duty from the first day of the month after joining (20 Oct → 1 Nov); other work is not excluded by this PO-only rule. Monthly cadence does not decide rota order. GRN Duty monthly rotation was also confirmed by the owner on 9 Oct.

### GRN Duty rota · confirmed 9 Oct 2026

GRN Duty rotates once per calendar month, like PO Duty. Keep one coordinating holder for each duty; actual helpers are recorded separately. Normal monthly rota must assign different people to PO Duty and GRN Duty (owner confirmed 9 Oct). Existing owner clarification permits one qualified available person to coordinate both duties; normal multi-person scheduling remains separate. Stable monthly rotation order is defined in Workspace MASTER:222–234. The next-month eligibility restriction is PO-only and must not automatically be applied to GRN.

### Separate PO and GRN holders · confirmed 9 Oct 2026

Normal monthly rota assigns PO Duty and GRN Duty to different people. Each duty has one coordinating holder; other staff can help and actual actors remain recorded. Existing Variable team size owner clarification already permits one qualified available person to coordinate both duties; no new owner answer required.

## Staff & Duties · consolidated blueprint coverage · 9 Oct 2026

| Area | Required settings or source-linked facts | Current authority/status |
|---|---|---|
| Staff record | Name, personal login/contact, joining date, active status, department/title/reporting line | Existing People-owned record; TEAM-01; no duplicate employee editor |
| Work eligibility | Existing work/access qualifications; helpers record actual actor separately | Confirmed; does not grant money approval |
| Settings editing | Jess delegates named section editing | Confirmed; no executed grant claimed |
| PO/GRN monthly rota | Stable cyclic staff order; PO holder and next person GRN; advance monthly | Workspace MASTER:222–234; normal holders different; implementation target |
| New staff | Joining month no PO Duty allocation; next month eligible; ordinary work/help permitted | Workspace MASTER:210–219; HR MASTER:83–90 |
| Staff departure | Effective last working date removes future allocations; preserve history and handover | People/HR-owned departure; Workspace MASTER:237 onward |
| One available person | Qualified person may coordinate PO, GRN and ordinary Delivery | Existing OWNER-CLARIFICATIONS Variable team size; no additional owner question |
| No qualified person | Work remains visibly unassigned; alert staffing gap; do not mark complete or bypass gates | Same existing owner clarification |
| Saturday rota | Full day 9:00 AM–6:00 PM; eligible duty staff and cover order | Confirmed; exact rotation cadence still to verify, not an immediate blocker |
| Leave submission | Workspace → Leave; MC/Emergency/Planned; dates and type-specific evidence | Owner confirmed 9 Oct; no separate MC Report |
| Leave approval | Approval required = No; configurable later by authorised editor | Owner confirmed 9 Oct; later effective-policy treatment to define |
| Leave cover | Today immediately on submission; future leave on absence date; eligible working recipient | Confirmed operational policy; HR review separate |
| Daily task publication | Default 9:00 AM | WS-01; publication mechanics/build verification outstanding |
| Availability checks | Defaults 10:00 AM / 2:01 PM; actual lunch excluded; check after shifted lunch ends | Latest owner defaults; older MASTER defaults must not silently supersede |
| Colleague attendance answer | Ask once per person; working keeps tasks; not working activates cover; no automatic HR finding | Existing owner clarification; Not sure morning/final branch needs source reconciliation |
| Direct dispatch and help | Recipient sees assigned Tasks without claim; record helper separately; no silent return/ping-pong | Existing owner clarifications |
| Change history | Staff/rota/cover/config changes retain actor/time and values | Existing source contracts; ordinary Company edits do not gain invented compulsory reasons |

Remaining verification is scoped: actual staff roster and qualifications, Saturday cadence, attendance Not sure branch, return/cover implementation, and production acceptance. No repeated owner questionnaire for rules already sourced. Approved blueprint coverage is not proof that automatic routing is built.

## Purchasing · consolidated Settings coverage · 9 Oct 2026

Source: current docs/purchasing/MASTER.md §5.6.1 (1374–1466), §11 (7783–7850), supplier check at 1719, Ready Stock priority at 372–391. Source defaults are not a fresh production read.

| Setting group | Required content / sourced rule | Boundary |
|---|---|---|
| PO windows | First default 11:30 AM; optional second default 4:00 PM; editable, second can be disabled | Earlier supplier cut-off wins; missed occurrence retains original deadline |
| PO Days | Configured weekdays; owner sets every Office working day | Separate setting; do not silently recalculate Order By |
| Supplier-specific cut-off | Earlier last PO time or Uses the PO windows | Same governed window source |
| Supplier identity and communication | Name, address, contacts, Email/WhatsApp group, preferred channel | Verified records only; no guessed address/contact |
| Supplier workweek | Supplier-specific production weekdays/calendar | Not the Office calendar |
| Production days | Mattress 7 working days; bedframe 7; sofa 14 | Supplier calendar; preserve explicit supplier values; no transit add-on |
| Pillow/MP replenishment | China replenishment lead 2 months; existing warehouse stock fulfils from actual availability | Not 60 days; not 7-day production; field placement to design |
| Supplier delivery/collection | Supplier delivers or governed factory pickup; collector/destination as appropriate | Source route-specific; no automatic rewrite of existing supplier rows |
| Deliver To master | Address, availability/default, receiving party/calendar, linked site, stock consequence, scan/evidence requirements | Governed destinations; no fictitious GRN |
| Ready Stock priority | Requested Delivery Date or Proceed Date | Current governed manual-match priority; no automatic stock allocation inferred |
| Supplier arrival confirmation | One Office working day before effective expected arrival | Existing Work contract; not approved as an editable numeric setting by this list |
| Manual Purchase | Purposes, approval limits and source-qualified approver | Values to verify; Operations may not approve own purchase |
| PO grouping/source preservation | Owning grouping rules and source references | Read-only policy unless source explicitly authorises configuration |
| Consignment terms | Agreement and settlement terms, distinct from purchase | No Consignment Sale Notice restoration |
| Supplier labels / documents | Unit-label capability, external templates/notes, numbering/version rules, customer privacy exclusion | Locked identity families/privacy laws are not bypass switches |
| Claim/return/repair | Outcome permissions, supplier reply/escalation targets and repair targets | Preserve source permissions; outstanding numeric verification remains explicit |
| Duty links | Link PO/GRN rota in Staff & Duties | No second roster or local Duty calculation |

Known research items: reconcile existing Hookka/Ohana collection rows per supplier, locate verified Ohana address, verify Manual Purchase limits and repair target. Do not change production data or ask the owner again for approved production-day defaults.

## Warehouse · consolidated Settings coverage · 9 Oct 2026

Source: docs/stock/MASTER.md:1370–1464. Historical production verification in the MASTER is not a new live read today.

| Area | Fields / rules to include | Source status |
|---|---|---|
| Warehouse Details | Site, active status, operating organisation, full address, time zone, individual key contact and phone | Existing five-section Settings surface; verified real records only |
| Working Hours | Seven weekdays; separate Receiving hours and Collection hours; Closed or configured hours | Existing surface; do not copy Office schedule or assume Sunday closure |
| Public Holidays | Country/state, observed holidays, availability policy, dated calendar source/reference/verification | Existing surface; no automatic official-calendar sync; no invented holiday dates |
| Special Dates | Full closure, receiving/collection unavailable, special hours; required reason; past entries remain history | Existing source-enforced policy |
| Access | Manage Settings, confirm inbound receipt, confirm collection, perform count; active individual identity | Settings management enforced; other action enforcement and site scope must follow source doors |
| Stock Count | Sites, frequency, scope, blind count, recount, evidence and physical-person assignment | Approved target, not built per MASTER |
| Month-end Count | Final calendar day 11:59 PM, two-calendar-day count window, submission-date rule | Approved target, not built per MASTER |
| Problems / evidence | Observable reasons; minimum scan/photo/receiver/factual-note evidence | Approved target; financial outcomes are not observer reasons |
| Unit labels | Governed ID/product scope, applied/verified labels, duplicate/replacement/never-reuse rules | No editor may rename an existing Unit or bypass identity |
| External warehouse operator | Organisation, roles, allowed sites/actions, calendar, evidence and active dates | Organisation/Site-scoped controls not fully built |
| Duty links | PO/GRN rota and cover from Staff & Duties; People identity/leave remains source-owned | No duplicate staff records or Warehouse rota |
| Pillow / MP courier link | Warehouse physically packs/dispatches; target defaults 3 working days after ready-to-pack confirmation; partial quantities/tracking retained | Delivery-owned dispatch rule linked here, not a second timing editor; exact calendar to verify |

Calendar precedence: Special Date → Site closure → applicable public-holiday policy → normal weekly hours. Record which rule resolves the day. Missing configuration remains explicit. Warehouse address/contact/hours require actual source records, not Company address/Office values copied by assumption.

## Payments · consolidated Settings coverage · 9 Oct 2026

Source: docs/payment/MASTER.md §12 (789–812), bank routing 2354–2355, methods/settings 2394–2417. Source build records are not a current production read.

| Section in source order | Content to include | Known values / boundary |
|---|---|---|
| Receiving bank accounts | Bank name, verified receiving-account holder/name and number, active account identity | Live Settings read 9 Oct: Hong Leong Bank · CARRES SDN BHD · 177-003-23633; RHB · CARRES SDN BHD · 26219 3000 29076; no writes performed |
| Which bank to use | Governed source-based routing | PJ own-showroom → Hong Leong Bank; Dealer → RHB; no ad hoc staff account choice |
| Payment methods | Active methods, evidence requirements, linked money account | Bank transfer/slip; QR/screenshot; cheque/photo+number; cash/proof; card/terminal receipt+approval code; provider-recorded online payment separate |
| Collection timing | Start lead and completion lead, effective date and calendar | Ordinary 3/2 working days; admission requires outstanding due + confirmed delivery + goods ready or reliable arrival expectation; outstation source rule separate |
| WhatsApp templates | Named active templates by purpose, default template and version | Source amount/account/delivery/partner fields protected; no guessed template content |
| Invoice and Receipt numbers | Automatic numbering status and next example | No manual prefix/reset/history renumbering editor |
| Storage charges | Per-product-group free days, full-cycle amount/duration, approved extension/waiver policy, notification deadline | Mattress+bedframe 7 calendar days then RM150/30-day started cycle; sofa 14 then RM200/14-day started cycle; notify same day; no automatic goodwill |
| Online payment provider | Connection/status facts | No server-secret entry/display on page; provider records online money |

Payment-specific edits follow the source Edit → Review changes, effective date and old/new/actor/time/reason history contract. Collection clocks and storage cases snapshot effective rules; no silent recalculation of existing cases/invoices. Settings edit delegation does not grant money approval. Owner/approver/cover people live in Staff & Duties; Payment does not maintain another roster. Finance hold independently blocks delivery even when amount due is zero.

To verify without a new questionnaire: approved template content, storage extension/waiver authority conflict, and source outstation clock details. Historical MASTER reports blank bank numbers; this does not prove today’s database is blank.

## Delivery · consolidated Settings coverage · 9 Oct 2026

Source: docs/delivery/MASTER.md §2.1 (158–174), §11/11.1 (1811 onward). Four source-owned sections; no new independent staff/payment/site editors.

| Section | Content to include | Policy / boundary |
|---|---|---|
| Logistics · Company details | Name, active status, customer-facing phone, office contact, address, WhatsApp group | Verified master data; Payment reads the customer-facing number |
| Logistics · Coverage | States/cities/postcodes, exclusions, Klang Valley default and fallback | Do not hard-code one company or invent coverage |
| Logistics · Schedule | Pickup days, regional delivery days, transit days, cut-off, capacity and closed dates | Actual company schedule; not supplier production transit add-on |
| Logistics · Transit points | Source-linked transit sites and two-leg handover locations | Warehouse Sites is the one identity editor; not a Carres warehouse by assumption |
| Logistics · Drivers and vehicles | Known driver/phone; plate/type/capacity | Templates, not live vehicle tracking |
| Logistics · Services and charges | Stair carry, dismantling, disposal, surcharge areas and company charges | Source-qualified approval; no Operations fee waiver inferred |
| Logistics · Portal access | Company roles, visibility and allowed API/action scope | Does not grant full ERP or money access |
| Delivery Rules · Assign logistics by | Default 3 Delivery working days before Scheduled, Requested fallback; earlier evidenced booking/pickup requirement wins | Opens on PO issue day, or Operations entry for stock orders; opening is not deadline |
| Delivery Rules · Customer contact | Logistics contacts customer; Operations only defined exceptions and recording on behalf | Fixed policy, not a per-company selector |
| Delivery Rules · Timing and release reads | Shared contact/chase rule; Payment clock and DO gate shown as read-only links | No duplicate clock or manual DO release switch |
| Delivery Rules · Evidence | Result/goods/service proof; failure-photo policy where permitted | Successful delivery required proof cannot be disabled |
| Delivery Rules · Agreed periods | Effective-dated morning/afternoon definitions and customer-specific agreement | No invented clock ranges; blank is not explicit anytime |
| Message Templates | Versioned WhatsApp/email/copy messages and one default per purpose | Same library contract as Payment |
| Access | Delivery capabilities and Staff & Duties link | One staff/cover source; no local roster |
| Courier accessory dispatch link | 3 working days after warehouse confirms received/checked/packable scope; batches and tracking retained | Delivery-owned workflow; precise calendar remains to verify; central hosting placement is proposal |

Display Logistics, not Logistics Partners. Sofa loan workflow and postpone/address-change branches remain source research; do not present unverified settings as approved. Per-DO dates, ETA, chosen company and trip result are operational records, not Settings. Approved target coverage does not establish production completion.

## Service Case / Issue Tracker · consolidated Settings coverage · 9 Oct 2026

Service Case owns customer remedy and its execution/confirmation. Issue Tracker owns recorded incident, responsibility, cost/recovery, review and learning. A linked Case and Issue are separate records; neither duplicates the other's decisions or Finance ledger.

| Module / area | Settings or source-linked policy to show | Authority boundary |
|---|---|---|
| Service Case · Response and Case clock | First substantive response 2 Office working days; Case period 14 working days and day-10 contact under exact §4 calendar | Current Service MASTER says read-only constants; wider owner direction to configure rules is a source conflict to reconcile, not proof of an edit control |
| Service Case · Ownership | One per-Case owner, helpers and qualified cover | Read Staff & Duties; actual actor separately recorded; no second staff roster |
| Service Case · Approvals | Formal repair/replacement/charge/customer-movement decisions use Service Case Approver | No repeat approval for unchanged approved scope; leave approval No does not waive business approvals |
| Service Case · Remedy/evidence | Approved remedies, guarantee scope, observed evidence and customer confirmation | Versioned source policy; unapproved remedies/closure paths not designer defaults |
| Issue Tracker · Classification | Issue types, source mappings and restricted categories | Owning Issue source; observer evidence separate from confirmed responsibility |
| Issue Tracker · Review/materiality | Review rules, cost/recovery thresholds, attribution/recovery roles | Finance records money; authorised authority decides waiver/restricted closure |
| Issue Tracker · Weekly Review | Wednesday default; time/duration, chair/backup, participants, reminders, holiday/unavailable rules | Values not sourced remain Not set; completed/in-progress sessions not moved by new settings |
| Issue Tracker · Minutes / learning | Minutes reviewer/approval, carry-forward and learning destinations | Skipping a meeting does not close Issues |
| Issue Tracker · Reporting / retention | Related Party report contacts/recipients, access and retention | Restricted operations and external report sending stay authorised and audited |

Sources: docs/service/MASTER.md:19, §4, §7.30 and read-only Settings ruling at 1128–1133; docs/issue-tracker/MASTER.md:403–416,964–977. Approved settings coverage is not whole-blueprint approval or build proof. Explicit service editability/clock conflict is retained for source reconciliation; do not ask owner to repeat the approved numeric defaults.

## Reports and system controls · consolidated coverage · 9 Oct 2026

Sources: 23-REPORTS-PLACEMENT-DECISION.md; 25-MODULE-DESIGN-WORKLIST.md Houzs evidence; existing 26-BLUEPRINT-AUDIT-BACKLOG.md. Houzs evidence is reference/proposal, not approval or Carres implementation proof.

| Area | Settings / control coverage | Status / boundary |
|---|---|---|
| Reports placement | Independent central Reports; module summaries link there; Workspace remains today’s actions | Owner-approved C; exact sidebar slot/tabs remain proposal |
| Report definitions | Metric names/formula, source/date basis, filters and missing-data coverage | To verify/propose; one definition shared with module summaries |
| Report comparisons | Period and comparison options; truthful available historical range | Proposed detail; no invented imported years or totals |
| Report access / export | Allowed report scopes, sensitive fields, export permissions | Source permission required; Finance-only RM not approved |
| Scheduled reports | Content, frequency, send time, recipients and channel | Approved content versus unapproved timing/recipients remain separated; no automatic external sending inferred |
| Notifications / Email | Event channels, recipients, enabled state, provider connection/error visibility | Houzs reference proposal; current Carres triggers/build must be verified; no secret exposed |
| Document controls | Source-owned templates, versions, numbering and attachment requirements per document family | Preserve Carres number pools; do not copy Houzs registry or generalise attachment enforcement |
| Change history | Actual actor/time, object and old/new values where owning source requires; access scope | Audit record viewer, not permission to edit/delete history |
| System Health | Error visibility, failed jobs, integration health and authorised recovery | Houzs reference proposal; retries/mutations separately qualified |
| AutoCount Sync | Connection/sync scope, status, last result, errors, qualified retry | Existing Carres integration source required; not an owner promise of automatic sync |
| Mailboxes / announcements | Source-owned mailbox identity/access and announcement scope | Research/blueprint coverage; no mailbox provisioning or message send implied |
| Assistant / Agent / Venture | Optional advanced controls | Deferred; not required for first order go-live, no resume/run authority |
| Personal Appearance | Per-person theme/focus stored in personal profile using current kit tokens | Owner v4 direction; no second company business policy or UI kit |

Not every row is a Settings form: Reports displays results; Change Log displays history; System Health displays status. Settings contains the authorised configuration that feeds them. Keep remaining gaps in the existing audit backlog, not duplicate tickets/documents. No app/production modifications commissioned here.

## Inventory reconciliation · 9 Oct 2026

This is a scoped document review, not production acceptance or full business-blueprint approval.

| Finding | Current resolution |
|---|---|
| Multiple appearances of the same configuration | Consolidated tables explain inventory IDs; they are not extra editors. Supplier setup stays Purchasing; duty/cover stays Staff & Duties; bank/collection/storage stays Payments; sites stay Warehouse. |
| Leave wording | Latest owner ruling supersedes approval-required proposals: all leave needs no approval now; future approval is configurable. |
| One-person / no-person staffing | Already answered in existing owner clarification. No new question: qualified single person may coordinate both; nobody qualified means visible unassigned work and staffing alert. |
| Missing Sales Orders summary | Existing SO-01–03 cover shared Sales Portal entry configuration, source-owned operational rule links and personal list preferences; no duplicate Operations entry rules. |
| Showroom/Supplier/Dashboard overlap | Read existing source links, not three new parallel settings systems. |
| Catalog detail | CAT-01 exists but exact approved fields/edit authority still needs owning-source study. Do not call complete. |
| Personal Appearance | Current v4 owner direction uses personal theme/focus; earlier generic appearance row is coverage only, not a second company theme writer. Chinese wording remains source review. |
| Service editability conflict | Retain read-only source constants versus wider configurable-rule direction for scoped reconciliation. Do not assume editability or recalculate Case deadlines. |
| Missing verified facts | Actual bank numbers, staff roster/qualifications, supplier/site contacts and calendars require verified values; absence from this document does not prove database absence. |
| Source freshness | Original 6 Oct frozen MASTER snapshots retain their version. Later current-source checks must name current docs paths; do not pretend all older snapshot line numbers are current. |

Next completeness work: Catalog owning-source fields; exact existing edit authority/effective-date contracts; resolve flagged source conflicts; connect current inventory to existing audit backlog. Reports/system-control proposals stay separate from first-order go-live requirements. No repeated per-setting owner questionnaire.

## Catalog · source-backed field coverage · 9 Oct 2026

Catalog is product master-data maintenance, not a second bank/calendar/duty settings home. ERP ARCHITECTURE:318–320 states there is no canonical Catalog MASTER: retain that authority gap. ERP:520–564 governs shared Catalog ownership and permission boundaries. packages/shared/src/schemas/catalog.ts is implementation field evidence, not new business approval.

| Area | Fields / capability to cover | Evidence boundary |
|---|---|---|
| Model identity | Model key/name, category, description and image | Existing schema evidence; exact approved edit contract to verify |
| SKU identity | SKU, model, variant and variant kind | Catalog owns identity; no duplicate Purchasing SKU editor |
| Category / stock identity | Product category and exact-unit versus quantity mode | Other modules read Catalog; never classify by guessed SKU text |
| Model choices | Applicable sizes, colours, compartments, gaps, fabric and leg/divan-height options | Existing source option fields; do not expose every option for every product by assumption |
| Supplier mapping | Supplier and supplier item code | ERP approved shared Catalog facts; Supplier contacts/calendar stay Purchasing |
| Selling prices | Selling price, PWP and size-specific prices | ERP selling-price write restricted to Principal; Operations reads only |
| Purchasing cost | SKU cost | ERP Operation or Principal cost write; selling-grid visibility exception remains source-specific |
| Availability | Selling availability/discontinued state | Verify current governing transitions; no unauthorised permanent delete |
| Import / Export / New SKU | Existing shared maintenance entry capabilities | ERP alignment scope; actual server permission remains authoritative |
| Scheduled supplier price | Catalog-owned price maintenance | Purchasing MASTER:7891; detailed schedule/effect policy to verify, not a separate Purchasing scheduler |

Source-known unresolved decisions: permanent bulk deletion and navigation consolidation are not approved merely by alignment. Legacy schema comments/June implementation plan must not override later ERP permissions or supply a new UI kit. This fills field coverage, not complete Catalog approval/build acceptance.

### Payments live read · 9 Oct 2026

Read-only authenticated page: https://erp.carresofficial.com/operation/settings/payment. Dealer → RHB, account holder CARRES SDN BHD, account number 26219 3000 29076. PJ own-showroom → Hong Leong Bank, account holder CARRES SDN BHD, account number 177-003-23633. Earlier document-only account-number gaps are superseded by this visible evidence; no changes saved, no payment made. Routing rendered on Settings is verified; end-to-end message/payment routing remains untested.

Other visible gaps retained in existing audit: Standard bank transfer has No template yet; collection text says Operation does not work on Saturday (distinguish normal Office calendar from approved Saturday support); Mattress/Bedframe says Operation may approve until Day 21 (authority conflict remains); Changes has Staff identity not recorded. Do not infer backend enforcement from those labels.

## Current Settings authenticated page audit · 9 Oct 2026

Scope: read-only session SH. Read all 14 visible Settings destinations (Staff, SO, Purchasing, Payments, Issue, five Warehouse, four Delivery), all 12 Logistics company details and 64 of 72 company subpages. Eight subpages remained unverified after blank-page failure: TSDD services/access and all six TT subpages. Subsequent return to Payment also rendered blank; cause not established. No saves, grants, messages, retries of business jobs or production-data changes. This proves displayed content only, not server enforcement or end-to-end execution.

| Area | Current visible facts / differences from document-only inventory |
|---|---|
| Staff & Duties | Morning 10:15 AM, afternoon 2:01 PM. PO Shasha; GRN Yu Jun. Storage Waiver/Purchasing/Payment approvers Jess. Delivery Charge, Finance, Stock Adjustment, Service Case, Issue Triage/Review and Delivery Duty not assigned. No Company/Office/Leave/Saturday configuration visible on this main page. |
| SO | Active Online transfer/Cash/Cheque/Merchant; Credit-Debit/Installment inactive. Stripe online system-managed. Customer form fields editor available; 0 custom fields. Editor internals not tested this round. |
| Purchasing | Actual windows 11:00 AM / 4:00 PM, second enabled; PO Days Mon–Fri. Ready Stock priority Customer Requested Delivery Date. Only Nice Future shown in collection section: NETS → Carres Klang. Five destinations include Hookka. Supplier Ohana address field still blank despite destination Ohana having address. Nice Future workweek Mon–Fri, others shown Mon–Sat. Repair target 14 working days; claim response/escalation 2/2 Office working days. |
| Purchasing omissions recovered | Safety days 14 working days; earliest date store may sell 30 days; Manual Purchase earliest lead 0 days; Confirm delivery date 3 working days; supplier Payment terms fields blank. These are observed configuration, not newly approved values. |
| Payments | Real accounts recorded in preceding live-read section. 3/2 collection. Six of eight template purposes empty; two reminder templates present. Operations Day21 storage concession text remains; changes show missing staff identity. |
| Issue Tracker | Only Related Party master visible; name/type/contact/recipient form and empty table. Broad review/classification Settings blueprint is not fully represented by this current page. |
| Warehouse details | Carres Klang, NETS, active, Klang address present, GMT+8. Key contact displays raw UUID instead of name. |
| Warehouse hours | Monday receiving 8:30 AM–6:00 PM (Closed unchecked); Sunday receiving closed; Tue–Sat receiving and all collection hours Not configured. |
| Warehouse holidays/special dates | Public-holiday policy not configured; no calendar imported; no upcoming/past Special Dates. |
| Warehouse Access | Shasha/Yu Jun shown checked for four capabilities; departed-holder text says Not recorded; history actors Not recorded. Actual enforcement not tested. |
| Logistics | 12 active company rows including four E2E-named entries. All customer-facing phone numbers Not configured. Details largely lack office contact/address. E2E labels are not proof of disposable data; do not delete. |
| Delivery Rules/Templates/Access | Contact lead 3 working days; system DO/payment mirror; per-company required proof and Operations recording-on-behalf. All 11 displayed delivery template purposes empty. Access links Staff & Duties. Assignment-lead editor not displayed on inspected rules page. |
| NETS details | Coverage fields blank and Klang Valley default No; pickup weekdays unchecked; Sunday not-delivering checked; booking lead 0, most schedule fields blank; no driver configured; a vehicle row exists; portal account None. Displayed configuration is not proof of the actual service contract. |
| TEOW schedule | Pickup Mon/Wed/Fri; JB delivery Tue/Thu/Sat with transit1; Melaka Mon/Wed/Fri with transit0. Other inspected coverage/contact gaps retained. |

Company/Office/new leave/rota policy confirmations remain blueprint, not newly saved online values. Main-page scan does not audit every edit dialog or save permission. Amend source inventory with observed current values separately from approved defaults; avoid inventing missing data.

**Saturday on-call boundary — owner confirmed 9 October 2026:** rotating contact coverage, default 9:00 AM–6:00 PM and editable. Answer customer, driver and warehouse calls/WhatsApp and record any required follow-up. It is not normal Saturday office attendance, PO Duty or GRN Duty, and does not automatically transfer all routine Tasks to the on-call person. Any follow-up retains its source-owned permission, normal owner and qualified cover rules. Rotation frequency remains unspecified; implementation unverified.
