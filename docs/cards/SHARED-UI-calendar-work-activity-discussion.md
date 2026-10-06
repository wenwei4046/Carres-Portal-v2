# 【SHARED UI】— Discussion Card · Calendar / Customers / Activity

**PLAN / DESIGN · 24 September 2026.** One discussion Card. No application implementation or production change.
**OWNER-APPROVED DIRECTION / DETAILED DESIGN PROPOSAL.** Jess confirmed Calendar as date-based module summary/navigation, replacing the rail's My Work with searchable customers and their orders/history, and Activity as permission-filtered portal changes. Direction is persisted in UI MASTER §5 and Workspace MASTER §7. Detailed composition, copy, identity handling and kit admission below remain **PROPOSAL / NOT APPROVED**.

[Viewable fictional layouts](../ui-reference/shared-panels-review.html). This is a local review artifact, not the Portal. Current mockups are reconstructions; destination buttons explain where real navigation must go. No real customer information is published.

## 1 · The complete recommendation

| Door | What it helps staff answer | First screen | Click result |
|---|---|---|---|
| Calendar | On this date, which module has what arranged or due? | Date picker and module summaries; named types/counts | Owning module with the selected date and event type, not a generic landing page |
| Customers (proposed label) | Who is calling, which orders do they have, and what has been recorded? | Searchable customer list | Selected customer → related orders and chronological records → exact source |
| Activity | What changed recently in the business I am permitted to see? | Recent changes across connected authorized sources | Exact source History, positioned at the event where supported |

Formal Work remains the daily action destination. These three doors are quick reference and navigation, never a second task engine, CRM editor or accounting ledger. Calendar is date-first, Customers is customer-first, Activity is change-first. Selecting a customer never silently filters the other two panels.

**Operator journey.** A customer phones while the operator is reading a PO. Open Customers; search phone/name/reference; select the right customer; see orders and recorded delivery/payment/contact facts; open the exact order or action owner if work is needed. Before discussing another day, open Calendar, choose the date, then choose Delivery's summary to inspect the full authorized schedule. A colleague's later date correction appears in Activity with actor/time/source. At close of day, remaining obligations are checked in formal Work; none of these panels claims that a quiet view means all work is complete.

**Current → problem → better design → trade-off → recommendation.** Current rail repeats the Work doorway while customer lookup requires jumping through orders. Replace the shortcut with a searchable read-only customer view, preserve formal Work, and keep date/change quick views. This adds customer aggregation complexity and removes the instant Work badge. The owner has chosen that purpose trade-off; the recommendation controls identity ambiguity rather than inventing a new customer-master workflow.

## 2 · Authority resolution and measured readiness

Read Constitution/CLAUDE → ERP-ARCHITECTURE → UI §5/templates → Workspace §§5–7; Orders §0.1/register/object, Purchasing §§9–10, Delivery §10, Stock integrations, Payment §§10–11, Rental §5.9–5.11, Service subscription boundary, Guarantee, HR and Issue Tracker boundaries; COPY, tokens, components and Action Flow. UI/UX Pro Max, design-critique and accessibility-review were applied. Skills inform evaluation, not Carres business law or tokens.

| Class | Finding |
|---|---|
| RESOLVED FROM AUTHORITY | Owner's 24 September replacement and three purposes; formal Work stays; modules write their own truth; permission filtering; customer history does not replace source History |
| APPROVED TARGET / NOT BUILT | Customer rail; full governed calendar coverage; broader Delivery/Stock Activity projections; source integration absent from present code is not an owner decision |
| BUILT / SOURCE VERIFIED | Calendar reads deliveries and arrivals; My Work currently shares Work projection; Activity is Orders-centric. Current app has not adopted the new rail direction |
| BUILT / SOURCE VERIFIED | POS `/api/orders/customer-search` searches order customer names, scans at most 40 orders, returns at most eight phone/name-deduped hits. It is not complete customer search or dossier |
| BUILT / SOURCE VERIFIED | `customers` table exists (0247) with UUID/canonical phone, used for persistent customer needs. The POS handler's “no customer entity” comment is stale. Orders still contain historical customer snapshots |
| BUILT / SOURCE VERIFIED | CustomerStatement spans multiple orders and explicitly says whether matched by phone, name or only an order. This is financial matching evidence, not proof of universal customer identity |
| REAL GAP | Complete identity linkage across outright orders, subscriptions and related records is unverified. No fuzzy-name consolidation may be called confirmed customer history |
| REAL GAP | Source authorization/completeness, exact destination filters, unified events and keyboard/dirty-form behavior require validation; these are research/engineering obligations, not questions for Jess |

Source evidence: `apps/api/src/routes/orders.ts:381` (POS lookup), `apps/web/src/lib/queries.ts:948`, `supabase/migrations/0247_customers.sql`, `0467_a_customer_without_a_phone_is_not_a_customer.sql`, `apps/web/src/pages/finance/CustomerStatement.tsx`; rail components and Activity endpoint. These are source inspections, not production data claims.

Capability mapping: kit SearchInput/list primitives and existing order/history doors **READY to reuse**; phone/reference/full-range customer lookup **NOT READY TODAY** (proven search patterns exist, source adaptation required); customer aggregation **NOT VERIFIED**, not an assertion that nobody has solved it; chronology renderer **READY with defects**; global source integration **NOT VERIFIED**. No new engine is justified merely because one adapter lacks a field.

## 3 · Calendar: module summaries with meaningful counts

Top-to-bottom: Calendar title/close → explicit authorized source coverage and observation time → actual date chips and month → selected date/range → module rows. Each row has module name, concrete dated fact label and count, e.g. `Delivery / 2 customer deliveries / 1 contact deadline`; counts are separate links when destinations differ. Click carries date/range, event kind, Site where selected and source context. Back restores date and scroll. Full module calendar owns operational detail/capacity and edits.

No generic “5 jobs” total combines orders, Units, visits and deadlines. Month markers show arrangements/deadlines with full accessible meaning; they are not Work totals. One event shown by several modules has one owner/identity; other modules may offer a contextual link but do not add another occurrence. An order may legitimately have several different trips. Healthy zero modules can appear quietly; unavailable modules cannot show zero. Module summary count and destination population must match under the same permission/scope.

| Module owner | Admitted calendar meaning | Recommendation / dependency |
|---|---|---|
| Delivery §10 | Delivery arrangements, contact/handover deadlines, failed-delivery follow-up, returns | KEEP approved types; source deadline ≠ working-day call date |
| Purchasing/Receiving §10 | Governed supplier/balance arrival, collection and repair-return dates | KEEP source distinction; factory-ready is not arrival; PO issue date is not a schedule |
| Stock integrations | Counts, handovers, collections/returns, repair movements, month-end commitments | KEEP; shared physical event must not duplicate Delivery/Receiving |
| Payment §§10–11 | Payment deadline/promise, free-storage end, charge start, approved-free end | KEEP; recorded payment is Activity, not a Calendar appointment |
| Subscription / entitlement | Governed visit booking/due date, delivery/recovery commitments | ADAPT approved lifecycle dates; normal cleaning is not a Service Case |
| Service Case | Evidenced supplier appointment or governed case deadline | Selective proposal; never invent a Carres warranty-inspection visit |
| Orders | Link to actual owning delivery/payment/loan facts | Do not duplicate owner events or use requested delivery as booking |
| HR / Issue / unsupported Finance/Catalog | No automatic general feed | Private HR facts excluded; Issue calendar explicitly rejected; unknown connectors say not connected |

Date-only values keep their source business day; timestamps show Malaysia time. Governed holidays can change Work action dates, not a recorded supplier promise. Missing date remains in its owner/Work, not silently placed today. Cancelled/finished arrangements retain explicit source status in historical dates. Full date-range coverage is required; newest-500-orders is not a calendar data contract.

## 4 · Customers: search → select → orders and history

**Search/list.** Label the input `Name, phone or order number` (proposed copy). Search as typed with bounded delay, keep Enter as explicit search, Escape clears suggestions before closing the panel. Search visible permitted records across the full server scope, not eight cached POS hits. Normalize phone using existing governed country-aware helpers; recognize saved SO/SUB references including historical formats. Never reconstruct references from integer IDs.

Initial view lists permitted recent customer records with an explicit recent scope, not an apparent full-company directory. Search is the primary control. Sort results by exact phone/reference match first, then matching names; within equal matches use most recent source activity. Never auto-open a name match. Each result shows name, permitted phone, useful locality and latest source reference/date. No sensitive demographics, emergency contact or full address in results. Counts are authorized results, not company-wide counts. Large results load more and preserve query/scroll.

**Identity recommendation.** Use explicit stable customer relationships where evidenced. Existing canonical-phone identity may group matching source records under its governed rule, but disclose “matched by phone” for legacy records without an explicit relation. Name-only hits are candidates, kept separate by source; a shared household phone/conflicting names is flagged as uncertain rather than merged into a confident person. Read-only fallback opens the individual order. Do not create, merge, relink or edit customers in the rail. Never rewrite historical SO/PDF identity snapshots from the latest customer profile. Uncertain identity must not generate a combined balance, visit entitlement or obligation.

**Selected customer.** Back to results retains query. Header shows name/phone and relationship/coverage explanation. Two simple views below: `Orders` and `History` (proposed placement using kit tabs).

- Orders: each visible SO/SUB has its saved reference, original date, concise item/contract description and source-owned status. Click opens that transaction's normal object page. A distinct `Order Route` link is permitted only for an SO and an authorized existing route; never fabricate a customer-wide Order Route or translate past events into next actions. Subscription opens its own source, not SO.
- History: most recent recorded customer-related facts across authorized linked sources; source/type filter, exact date, actor and reference. Contact outcome, changed booking, receipt/payment, accepted service completion and Case outcome are distinct. Expand long text inline. Source link opens the original object's History; documents open the original authorized document. “Customer requested…” identifies a request, not approval or executed amendment.
- No duplicate payment arithmetic, profile edit, generic note box or completion control. To record a contact/note, open the responsible source's existing action door. No statements that the customer personally entered data unless actor evidence establishes that.
- Coverage states which connected sources/time range were searched. Show no-records only after successful complete reads. Preserve customer selection when another rail panel opens, but never leak it across logout/user changes.

**Cross-module consequences.** Sales owns order snapshots and route; Subscription owns contract/visit relationships; Payment owns amounts/statements; Delivery owns contact/arrangement/results; Service owns Case decisions; Stock/Receiving provide linked goods evidence. Customers is a read-only union with permissions per item and field. A matching customer name never grants access to an otherwise hidden order. Revocation removes cached records and counts. Search must not reveal hidden customers via suggestions, totals or differentiated denial messages.

## 5 · Activity: portal scope within each person's permissions

Default: connected authorized business sources, including changes recorded by colleagues. Not only “my actions”; not public to every login. Staff see records their existing permissions permit; a manager's broader scope requires actual grants, not a hard-coded manager shortcut. Partner/dealer users remain in their allowed scope; no access widening is part of the design.

Top-to-bottom: header → named connected sources + time window/freshness → Search → Source/Type/Person filters → visible filter conditions/Clear filters → chronological rows → Load more. Proposed initial window is last 30 Malaysia days. Search covers the whole selected window, not only loaded rows. Selecting Person narrows already-authorized events. Person selection never exposes forbidden staff/customer identities.

Row: what happened (13/18 semibold), who + exact time (12/16 secondary), result/change (11/14), source reference and party link. Newest first, stable event ID for ties; de-duplicate events surfaced by multiple modules. Include meaningful saved changes/outcomes, not page views, polling, raw logs or every notification retry. Explicitly distinguish a prepared WhatsApp message from a confirmed send/customer reply.

Activity states recorded changes, not a live universal status board. Current status comes from its owning record. Clicking opens source History, never silently turns the rail into an order timeline. Customers History is scoped to one selected customer's linked records; Activity is scoped to authorized recent business changes. Share event semantics/formatter, not separate logs. HR salary/personnel records do not enter a broad business feed.

## 6 · Shell, interactions, failure and responsive contract

Reuse frozen typography/spacing/colors: 50px header, 18px icon, title 15/22 semibold, primary 13/18, metadata 12/16, detail 11/14; 16px body padding, 12px gaps, 24px section separation; 40px minimum control targets. Neutral surfaces; blue selection/action; danger only actual urgent/error meaning. Observed rail340px + strip52px remains proposed, not a silent override of generic420px token or stale320px guideline. New RailPanel recipe requires explicit kit admission. Existing MonthCalendar requires its 30×36px targets to meet governed40px minimum in this recipe. No page-private component exception.

Three icons Calendar/Customers/Activity, accessible names and hover/focus tooltips, explicit expanded state and controlled region. No My Work badge on Customers. Desktop non-modal: opening focuses heading/search as appropriate, no focus trap; switching preserves panel state, closing returns icon focus. Escape closes nested popup first, then panel. One scroll region with fixed header; no horizontal page overflow. Links use existing navigation and dirty-form guard; a cancelled leave preserves current form, query and selected source. No auto-navigation from typing or refresh. Logout/role change invalidates all cached identity/scope.

| State | Calendar | Customers | Activity |
|---|---|---|---|
| Loading | Date controls stay; summary placeholders, never0 | Query stays; search/selected-detail skeleton | Filters stay; row skeleton |
| Healthy empty | Named date/source has no arrangements/deadlines | No match + try phone/reference; no history is distinct from no customer | No recorded events in window |
| Filtered empty | Show conditions and Clear filters | Keep query and correction help | Clear filters; never “no business activity” |
| First failure | Could not load + Retry; counts unknown | Search failure distinct from not found; keep text | Could not load + Retry |
| Partial failure | Healthy summaries plus named unavailable source; no grand total | Available orders retained; missing History source explicitly incomplete | Healthy streams retained; search result not called complete |
| Stale cached | Last observed time + retry; no claim of current availability | Same authorized customer/query only, marked stale | Preserve rows/time/filter, marked stale |
| Permission/session loss | Remove forbidden counts/items; existing login remedy | Remove customer details/cache; no existence disclosure | Remove unauthorized events; no fabricated empty |
| Recovered | Replace from authoritative complete snapshot; preserve date | Preserve query/selection and announce recovery | Preserve filters/scroll and de-duplicate |
| Long/large | Module summaries bounded; full module owns detail | Wrap identifying facts; paged matches/orders/history | Wrap changes, expand long notes, paged window |

**Narrow recommendation:** below1024px omit the rail; Calendar and Activity use existing full module calendars/object History. For the newly approved customer quick-search capability, propose a `Customers` entry in the existing shell menu opening the same search/list/detail composition as a full-width read-only view, not a floating drawer. It is the same feature and permission rules, not a new CRM module. This placement is **PROPOSAL**, needing review. Work stays at its normal full destination. 320/390px: stacked controls, one scroll, full references wrap. Browser Back returns list/detail/source predictably. No global keyboard shortcut is invented.

Kit owns frame, disclosure, search/list/loading/error/keyboard primitives and event-row typography. Module owners supply dates, identities, status words, source links, permission grants and completion facts. Proposed copy: Customers; Name, phone or order number; Orders/History tab use; Matched by phone; Possible match; linked-source coverage; module-summary count sentences. COPY admission is required before application work.

## 7 · Reference-to-Carres matrix

Primary documentation read24 September; no authenticated reference product operated. Shopify and Dynamics are useful for customer search/record history, not authority to copy their editing/marketing features.

| Reference | Evidence | Carres current | Decision and benefit | Trade-off |
|---|---|---|---|---|
| Shopify customer search | [Official search guide](https://help.shopify.com/en/manual/customers/customer-search) | POS name-only, eight hits | ADAPT name/phone/reference lookup to customer list; faster caller identification | Requires full-range authorized search |
| Shopify customer profile/timeline | [Official profiles](https://help.shopify.com/en/manual/customers/manage-customers) | Orders + financial statement are separate | ADAPT selected customer → orders/history; REJECT inline merge/edit/marketing | Identity linkage must be honest |
| Dynamics record timeline | [Official timeline](https://learn.microsoft.com/en-us/power-apps/user/add-activities) | Rail silently switches to one order | ADAPT explicit selected-customer history and source links; REJECT generic create/complete in rail | Source navigation required to act |
| Outlook My Day | [Official pane](https://support.microsoft.com/en-us/outlook/calendar/use-my-day-with-to-do-in-outlook) | Cross-page quick rail exists | KEEP context-preserving reference access; owner has chosen customer door instead of task duplicate | No Work badge in rail |
| Google Calendar tasks | [Official tasks](https://support.google.com/calendar/answer/9901136?hl=en-uk) | Governed contact/payment deadlines omitted | ADAPT dated distinctions; reject claim that tasks cannot appear on a calendar | Counts need named semantics |
| Linear My Issues | [Official guide](https://linear.app/docs/my-issues) | Formal Work owns action focus | KEEP focused Work in its existing home; no miniature new queue | One navigation to Work |

UI/UX Pro Max targeted search `search results empty feedback`: predictions as typed, useful no-match recovery, explicit empty guidance. Adapt search behavior; reject generic “create one” empty action because this rail cannot create customer truth. Accessibility review applies visible labels/focus/contrast and correct error semantics. Its44px rule is AAA guidance, not AA; Carres40px rule remains binding.

## 8 · Audit, critique and score

Existing fixture (fictional intercepted reads, real components at base3aa6e5a98) verified Calendar/Activity failures shown as empty; Work partial-source icon falsely confident; raw Activity type keys, inert Module filter; Calendar static rows; Activity hidden order scope switch; Escape not closing. Current Activity merges two150-source reads and caps200, not300. Calendar delivery population comes from newest500 orders, not complete date coverage. Renderer has unknown field/status fallbacks. Session/Order Route retry problem was reported, not reproduced; it stays with existing BUILD owner, outside this redesign.

Limited authenticated production observation saw three icons, Work zero accessible label and empty Calendar; actual empty-source truth was not proven. No production role matrix, screen-reader speech, midnight/permission recovery or dirty-form navigation test was completed. Fixture evidence is not operator validation.

Design critique revisions: removed duplicate Work slot per owner; changed event-heavy Calendar into date/module summary doors; explicit customer identity/coverage before history; retained source History and Work; no customer-wide Order Route/status invention; removed automatic source scope switching; no public Activity feed. Same-name/household-phone ambiguity must not produce an authoritative merged customer balance.

| Rubric /2 | Current | Proposal | Remaining deduction |
|---|---:|---:|---|
| Operator clarity | 0.9 | 1.8 | Three concrete questions; customer-match comprehension untested |
| Workflow/destinations | 0.8 | 1.6 | Target specified; customer linkage and exact destination filters unverified |
| Data truth/scope/failure | 0.5 | 1.5 | States designed; full-range customer/event permissions unproven |
| Visual consistency/readability | 1.0 | 1.7 | Locked scales; kit frame/target-width adoption pending |
| Accessibility/responsive | 0.6 | 1.4 | Keyboard/small-screen contract; assistive-tech and menu placement unverified |
| **Total/10** | **3.8** | **8.0** | Design assessment, not measured employee usability |

10/10 is not claimed. Falsifiers: wrong customer merged; hidden source treated as no record; summary opens a different population; history hides its source; query resets after return; staff cannot distinguish recorded event from required action. Any one defeats the recommendation until corrected.

## 9 · Review boundary

Approved direction is already persisted; do not ask Jess to re-approve removing the rail My Work or searching customers. Review the complete detailed recommendation, especially customer identity disclosure and full-width narrow placement, with one coherent walkthrough. No application code, build Card, migration, deployment or external cutover is authorized. Final detailed approval must replace governing presentation law before BUILD handoff. PLAN MISSION COMPLETE is not yet reached.

Numbering: current Orders §0.1 table; fictional SO2609-4827(1), SUB2609-48271(1); saved source references, no reconstructed SO-{integer}; historical SO-1365 preserved. SO generator remains an approved target, not claimed built.

**Review-artifact verification, 24 September:** walked live local HTML: search `Mei` returned two separately identified fictional customers; selecting one exposed its two orders; History switched to recorded facts; Back retained `Mei`; Activity stayed global; first-load failures displayed three explicit errors; healthy empty displayed no-match recovery. Desktop screenshot checked for readable hierarchy. JavaScript syntax and diff whitespace checks passed. This focused workflow prototype uses a compact sample date selector and Source filter; full month/Type/Person controls and production navigation remain specified, not fully simulated. Narrow option is a composition example, not proof of 390px or assistive-tech behavior. No app tests or production writes were performed.
