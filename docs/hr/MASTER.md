# HR — MASTER

> **The only HR document.** Overwritten when re-ruled; never versioned.
> **You read `CLAUDE.md` and this file.**

| I am working on | Read |
|---|---|
| anything | **§1** |
| the org chart and accounts | **§2 Team** |
| an employee record | **§3 People** |
| commission | **§4** |
| targets | **§5** · **people cost** — **§6** |

---

# §1 · Overview

### MISSION
Know who works here, what they are owed, what they are aiming at, and what the team costs.
**Statutory payroll is excluded forever.**

### WHAT IS ON SCREEN TODAY
`apps/web/src/pages/hr/` — six tabs. *Measured 2026-08-05 by listing the directory and reading
the tab shell; **pages not read line by line.***

```
HrApp 177   HrOverviewTab 169   HrTeamTab 1377   HrPeopleTab 260 + HrPersonDrawer 820
HrCommissionTab 610 + HrCommissionRunPanel 511   HrPerformanceTab 632
HrPeopleCostTab 556   HrSetupTab 962
```

**HR lands on an OVERVIEW — *what needs me today*, not a dashboard.**

### LIVE SCALE
**9 CR-coded humans.** ⚠️ **No `app_users` row holds `role='hr'`**, so the whole portal is
reachable by the principal account only, and the `hr` branch of every gate has never run
against a real session.

---

# §2 · Team — the org registry, and THE account door

### FROZEN RULES
- **Team is the ONE door that creates an internal account.** The principal's Accounts screen was
  narrowed to dealer/showroom store accounts.
- **Permissions follow the POSITION, not the person and never an email.** `org_duties` +
  `org_position_duties`; five email hardcodes were retired behind a one-release fallback that
  logged every hit.
- **`disabled` means disabled, at four layers.** The four auth helpers require `status='active'`,
  all eight `hr_*` gates are fail-closed, and the JWT hook refuses to mint a role for a disabled
  account. **The halves are inseparable:** tightening the helpers alone turns the role NULL, and
  `NULL not in (…)` is NULL, so the HR functions would have OPENED to exactly the person being
  locked out.
- **A residual is accepted and documented:** a token issued BEFORE the disable lives out its
  hour.
- **Settings → Staff & Duties is the ONE company-wide Duty assignment door** (owner rulings
  2026-09-01 / 2026-09-03; Settings placement production verified 2026-09-29, PR #1791, Workspace §4). It keeps the Duty catalogue, each Duty's one Primary holder, optional
  assignment changes and effective dates. `Team` may show staff and workload, but it is not a second Duty
  editor. No module Settings surface keeps another approver list or rota. The Shared Duty Resolver
  defined by ERP Architecture Law F.1 is the only reader exposed to pages and Work.

### Houzs people-control adaptation — review draft, 9 October 2026

Source evidence: existing `25-MODULE-DESIGN-WORKLIST.md`, Houzs Team comparison and additional read-only Directory/Title/Bulk observations. This section records coverage and proposals, not approval, implementation or tested permission enforcement. Existing §2 account/position laws and §3 privacy/departure rules prevail.

| Reference capability | Current Carres boundary | Missing adaptation / verification |
|---|---|---|
| Directory and attention filters | §2 Team creates accounts; §3 People owns employment/access | PROPOSAL: current staff, invitation pending, never logged in and disabled attention views with explicitly scoped counts. Login does not prove attendance. Former-profile access remains restricted. Verify current fields/filters before adding anything. |
| Invite member, resend and bulk onboarding | Existing Team is the sole internal account writer | PROPOSAL: one authorised onboarding door with company/department/position/reporting assignment and no-access initial qualification. Bulk invalid/duplicate input, partial results, delivery and effective access require verification; no invite/password/import is authorised by this draft. |
| Departments and leads | Existing organisation registry under §2 | PROPOSAL: distinguish configured lead from derived reporting lead; headcount targets are not Duty or approval rights. Rename/reassign/archive effects and historical references need verification. Do not copy Houzs departments or personnel. |
| Titles and organisation chart | §2 position-based permissions; one People identity | PROPOSAL: department-scoped title maintenance and read-only hierarchy from existing assignments. Chart editing must use the same writer; member reassignment before title removal and historical retention need review. Outsourced-team exclusion is not adopted. |
| Roles, title policy and action permissions | §2 position/duty gates; ERP Law F/F.1 | PROPOSAL: inspectable resource/action matrix, page visibility separated from approval and Settings delegation. Preserve governed position/duty qualification; do not import Houzs role grants or an extra permission resolver. Denied direct API access and post-change enforcement remain unverified. |
| Profile, activity and offboarding | §3 sensitive reveal/audit and one departure flow | KEEP existing law; verify unified account/profile identity, assignment history, effective departure and retained actors. A profile login-as control is NOT adopted or authorised. |

**Recommended people-control journey — PROPOSAL; existing approved laws remain controlling.** The current registry/account laws solve identity and access ownership; the reference demonstrates useful organisation and onboarding controls, but merely listing them leaves the failure and handoff journey unspecified. Adapt them through the existing Team/People writers, paying the cost of explicit validation and attempt history to avoid duplicate employees and false invitation completion. Reject any proposed addition already fulfilled by an evidenced existing workflow.

| Journey | Recommended normal result | Exception / downstream boundary and acceptance |
|---|---|---|
| Find staff | Read one People/account identity, permitted company/department/position/reporting assignments and distinct employment/access facts; counts identify their population | Pending invitation, never-login, recorded absence and departed employment are different facts. Incomplete/failed searches remain explicit. Verify count/filter scope and denied former-profile/detail reads; reference counts are not Carres headcount |
| Single or bulk onboarding | Qualified account manager validates identity and assignments before the one Team writer creates an account/invitation. Proposed preview reports invalid, duplicate, existing and eligible rows individually | Preserve per-row result/attempt; a repeated invite must not create another employee. Provider failure does not claim delivery or activation. Default qualification never imports Houzs role grants; active login does not admit joining-month PO allocation. Populated bulk validation, retry and access evidence remain owed |
| Change organisation/position | Qualified owner changes source department/title/reporting membership; hierarchy and Directory read the same saved assignment | Invalid cross-company/reporting relationships and referenced-title removal need governed handling. A lead/title change never appoints a Duty or approver. Verify canonical re-read, permission consequences through existing gates and preserved historical actors; no new chart writer |
| Review access | Display governed position/action/Duty/Settings qualification separately; perform changes only through their current qualified source doors | Verify denied direct API access, company scope and post-change enforcement; account/profile display is no grant. Existing token-residual law remains explicit, not silently replaced with immediate revocation claims |
| Absence and departure | People supplies eligible identity and effective departure; Workspace owns Leave/availability, assignment/cover and stable monthly rota. Existing one departure flow coordinates due access and handover effects | Future departure preserves current access until the governed effective date; partial failure retains unfinished effects. PO-only next-month admission, ordinary help and GRN distinction remain approved. Zero eligible staff stays unassigned without pausing deadlines or granting approval |

Daily operator use is current staff discovery and source-qualified action; personnel managers reconcile failed invitations/assignment/departure effects. Ordinary task recipients continue the same Tasks with their current qualified cover. Directory exports, company-wide profiles, sensitive reveals and any bulk operations require existing scoped permission; no reference export or impersonation affordance creates a Carres right. Save/source re-read, invitation delivery, actual account access and Work routing are separate completion evidence. Team placement remains unresolved; this lifecycle adds no UI composition or new navigation.

Mailbox ownership/provisioning, system health, notifications and integrations belong to ERP Architecture's system-control adaptation; HR supplies identities and memberships only. Team navigation placement remains undecided. These proposals do not block Outright and do not commission UI/code.

# §3 · People — one record per CR-coded human

### FROZEN RULES
- **`hr_employees` stores ONLY what has no home elsewhere.** Identity is read through the join,
  never copied — a second cosmetic copy of `status` rebuilds the hole that let a disabled
  account keep working.
- **Two columns, two questions:** **Employment** (HR's record, derived) and **Access** (the real
  switch).
- **PDPA fields are reveal-with-audit.**
- **HR may disable a login**, because the only disable route was principal-only and offboarding
  could not offboard. **Offboarding is TWO shapes** — the PIN path already refuses an inactive
  salesperson.
- **OFFBOARDING HAS AN EFFECTIVE DATE — owner ruling 2026-09-01.** The COO records the actual last
  working date and disables access; this People/account fact is the one source consumed by shared
  duty resolution. On the effective date, open and future duty-owned Work automatically resolves
  among the remaining active staff, including two-person and one-person operation. Historical actor,
  avatar, receipt, handover, approval and cover evidence remain unchanged. HR/People does not store
  a second PO Duty, GRN Duty or Warehouse rota; that one duty model remains in
  `../purchasing/MASTER.md` §5.3 and its one edit door is Settings → Staff & Duties
  (placement production verified, PR #1791; Workspace §4).
- **Rotation entry timing — owner clarification 2026-10-09 / APPROVED TARGET; execution unverified:** the joining-month exclusion applies only to allocation as PO Duty holder. An active, otherwise eligible employee joins PO allocation on the first day of the next calendar month (20 October → 1 November). It does not exclude GRN or ordinary work, and qualified colleagues may help with ordinary PO actions during the joining month. No separate training sign-off is inferred. PO and GRN rotate monthly with different normal holders; one qualified available employee may coordinate both when alone. Workspace §4 owns the rota and records actual helpers separately. Departure exclusion remains immediate on its effective date.
- **Checklists are a shared constant, not a config table.**
- **PEOPLE ENTRY — FINAL BLUEPRINT OWNER-APPROVED 2026-09-29 / NOT BUILT:** Staff & Duties
  provides `Manage staff` to authorised personnel managers, opening the existing People surface
  with return context. It creates no second employee record or parallel management permission.
- **ONE DEPARTURE FLOW — OWNER-APPROVED 2026-09-29 / APPROVED TARGET / NOT BUILT:** the
  authorised People/account manager selects the employee, records the last working day, reviews
  the effects and confirms once. The workflow records departure and arranges the corresponding
  access disablement together; it must not require a second, unrelated disable-account action.
  When departure takes effect, disable access, remove the person from default active staff lists,
  current choices and routine Duty allocation, and re-resolve affected current/future routing.
  Employment and Access remain distinct source facts, coordinated by this one workflow, not copied
  into Workspace. A future departure confirmation schedules its effects; it does not claim access
  has already been disabled or hide a still-current employee early. Preserve entered facts on
  failure, identify any unfinished effect and never announce full completion on partial success.
  Completion means the due departure/access effects are recorded and reflected by their owning
  sources. Retain actor/time and history; the existing HQ-login and store-PIN distinction remains.
- **FORMER STAFF VISIBILITY / ACCESS — OWNER-APPROVED 2026-09-29 / TARGET / NOT BUILT:**
  departure automatically removes the account from Settings and other default active staff lists;
  no second remove/delete action is needed. Ordinary staff cannot browse or open former employee
  account/profile details. Only users with the existing personnel-management permission may
  deliberately look up those retained records; those users also default to the current-staff list.
  Enforce this on reads and direct detail access, not just by hiding a row. Existing separate
  sensitive-field controls still apply. Preserve historical PO/GRN and other actual-actor names
  for users already entitled to those source documents; seeing a historical name does not grant
  access to the person's account/profile. Do not delete the identity or rewrite past evidence.
  This approves a unified departure workflow and its access boundary, not a second employee store
  or an unreviewed redesign of the whole HR module.
- **Monthly order — owner-approved 2026-09-29 / NOT BUILT:** Workspace maintains a stable
  PO/GRN cycle; admitted newcomers join its tail, effective departures leave it, and existing
  people keep their relative order. People supplies eligibility without maintaining a second rota.
- **People owns Duty eligibility, not Duty assignment** (owner ruling 2026-09-01): employee name,
  personal account, active/disabled, last working date and membership of the eligible Carres staff
  rotation pool. A last-working-date change removes the person from future resolution; People does
  not store any Duty assignment or reassignment.

# §4 · Commission

### FROZEN RULES
- **ONE engine.** The review screen and the month close share `lib/commission-month.ts`, so
  reviewed figures and frozen figures come from the same call.
- **The close is a 4-check PRE-FLIGHT, not a button.** Live, July had RM 52,081 sold by two
  people and **zero commission rates configured** — a plain Close would have frozen *you earned
  RM 0* permanently and then locked the month against fixing it.
- **A close FREEZES the computed lines.** A closed month must therefore always be READ from the
  frozen lines, never recomputed — only `staff_commission_rates` is effective-dated, so editing
  any other config table rewrites history.
- **Adjustments key to the OPEN month** with an origin pointer, never to a run.
- **The lock guards attribution and back-dated rates**, in the function and in a trigger.
- **Attribution as a worklist was DELETED, not fixed.** 19 native orders carry a salesperson and
  0 do not; the 37 without one are the AutoCount archive, which has no salesperson to assign —
  so the count could never reach zero and the badge stopped meaning anything. **The rule moved
  into the database.**

### Commission reference reconciliation and complete journey — review draft, 9 Oct 2026

**Fresh Houzs observation:** authenticated Commission shows a date range, live open-period calculation wording, payout-history revision/status/people/total/closed-by/reopened columns and disabled Close/Export in the observed no-profile state. HR Settings renders staff/tier/showroom membership, commission/KPI thresholds, showroom-versus-chain override explanations and product/category/fabric/special item-KPI setup. No staff assignment, rate change, calculation, close, reopen or export was performed; no payout or enforcement is proven.

**KEEP / ADAPT / REJECT:** keep Carres's approved one engine, four-check preflight, frozen closed lines, open-month adjustments and guarded backdating. Adapt explicit missing-configuration and period-history explanations where the current workflow lacks them. Reject copying Houzs commission percentages, payout amounts, tiers, item bonuses or manager override modes as Carres policy. In particular, Houzs's showroom/chain selector does not solve Carres §5's missing manager-duty/store dimensions; the Carres manager rollup remains off under its existing law.

**Recommended complete journey (PROPOSAL wherever it extends the frozen law):** the qualified HR owner establishes source-linked employee/eligible seller identity and approved effective rates; an authorised reader chooses an admitted period and reviews the shared calculation, source coverage and missing inputs. Ordinary corrections return to their owner (Sales attribution, Payment/Finance facts or HR rates), never a second commission ledger. Run the existing four-check preflight before freezing: actual preflight predicates come from the existing engine/authority and must be inspected, not replaced with invented checks. A successful close preserves the exact computed lines and applicable source/rate version evidence; later reports read those frozen lines. Authorised adjustments attach to an open month with their origin pointer; no history rewrite or new reopen/payout right follows from the reference's history columns.

**Exceptions and handoffs:** no configured profile/rate, unresolved source coverage, changed data during review, failed/duplicate close and denied access must remain explicit and must not announce a paid or frozen period. Reconcile recorded close outcome after an uncertain response before attempting it again. Missing configuration is not proven zero entitlement. HR determines its approved commission result; any actual money-out remains Finance-owned and independently evidenced. People cost and performance retain their separate §5/§6 arithmetic and coverage boundaries; statutory payroll remains excluded.

**Evidence needed:** authorised/denied period reads and close; actual four-check predicates; preview-versus-frozen equality; changed effective configuration leaves a closed statement unchanged; open-month adjustment origin retained; interrupted/duplicate close produces no duplicate freeze; source coverage and report/export totals reconcile. These are blueprint acceptance requirements, not tests run in this pass. Complete HR policy/domain verification remains open.

# §5 · Targets and the scoreboard

### FROZEN RULES
- **Two tables, not the specced four**, and the scope ladder is `person | store`, not five rungs
  — **3 of 5 rungs can never resolve** with two sellers in one store, and a department-scoped
  SALES target is meaningless for departments with no revenue.
- **The manager rollup ships OFF, with its reason on screen.** It routes via *the seat holding
  the Sales-Manager duty over that store*, and **there is no such duty key and no store
  dimension** on the duty table; live there is exactly ONE `reports_to` edge, connecting two
  people with zero sales. Shipping it would have told the COO her team sold RM 0 while her store
  sold RM 52,081.
- **Sold is ONE shared computation for open and closed months alike**, and this screen shows no
  commission, so it cannot contradict a frozen statement.

# §6 · People cost

### FROZEN RULES
- **Fixed cost and commission cost are SEPARATE and there is no field summing them.**
  Commission is a VARIABLE cost; folding it in makes *average cost per person* meaningless and
  makes a good sales month look like cost inflation.
- **The cost/revenue ratio is WITHHELD while a month is in progress**, with the coverage stated
  on screen. Measured: every order sat in six days of a 31-day month, so a full month of salary
  over that revenue would have said a profitable store was collapsing.
- **HQ cost is NEVER allocated across stores.** There is no allocation function.

---

### Targets and People cost operating journey — consolidated review draft, 9 Oct 2026

This completes the operating coverage of §§5–6 alongside the Commission journey in §4. **Existing frozen calculation laws remain authority; additional review/error/history requirements are recommendations, not new HR policy or implementation proof.** Houzs KPI/profile configuration is reference evidence only, not Carres target rates, scopes or payroll rules.

1. **Prepare the owning inputs.** Qualified editors maintain admitted person/store targets and effective personnel cost inputs through their existing source. People owns employee identity, join/departure and actual eligibility; Sales owns attributed revenue; HR owns approved target/cost configuration. Do not fabricate a store or dealer owner to fill a missing dimension. Approved join-date pro-rating cannot be computed from an unknown join date.
2. **Choose the period and scope.** The authorised reader selects an admitted person/store and period, sees source coverage and observation time, then reads the one shared sold computation. Closed commission statements still use frozen lines; a target scoreboard is not commission, money paid or entitlement approval. Missing target, absent attribution, unavailable source and genuine zero sales are separate outcomes.
3. **Review performance.** Compare only the same governed scope, period and definition. Manager rollup remains off until its required duty/store sources exist; no team/chain approximation. A source-linked drilldown explains included sales and exclusions without multiplying an order through its goods, payments or deliveries. Activity checks and Saturday contact coverage are not attendance or performance findings.
4. **Review cost.** Show fixed and commission costs separately, preserve the existing in-progress cost/revenue withholding and never allocate HQ cost to stores. Dealer/BD revenue uses its own enrolled-owner source when admitted; showroom revenue cannot substitute. Unknown cost/configuration is not zero cost or a proven profitable period. Finance owns actual payout and accounting treatment.
5. **Correct at source and re-read.** Wrong attribution returns to Sales under existing closed-period guards; wrong personnel inputs return to People/HR; actual payment returns to Finance. Qualified configuration correction must respect approved effective treatment and closed Commission freezes. A refreshed scoreboard/cost report reads the corrected owning result, with no manual total or competing calculation. Where historical target/configuration treatment is not governed, retain that as a review gap rather than assume retroactivity.
6. **Share the permitted result.** Reports/module summaries consume these same definitions, scope and coverage; source-specific access protects personnel economic fields. New exports, ranking, manager aggregation or automated HR decisions require their own admitted contract. Viewing or exporting a report never closes Commission or proves payout.

**Settings and completion:** targets use the admitted person/store scope; cost uses approved personnel inputs and eligibility facts; Commission configuration remains §4-owned. Source re-read proves a saved permitted input, not full downstream acceptance. Failed/stale writes preserve operator input and must not announce saved figures; uncertain responses require reconciliation before retry. Effective dating already approved in §7 must be implemented through the owning source, not a new Workspace or Reports configuration copy.

**Acceptance owed:** same sold source for open/closed periods; source drilldown reconciles totals; missing target/rate/join date is explicit; denied personnel cost access leaks no counts/amounts; unenrolled BD remains distinct from zero; in-progress ratio remains withheld; HQ cost unallocated; fixed and commission cost remain separate; closed Commission unchanged by later configuration; permitted source correction updates the same report definition. No calculation, save, close, export or production test was performed in this document pass. Exact new metric/target-history policies remain review decisions; existing frozen laws are not reopened.

# §7 · Approved Evolution

| What | Why it is not built |
|---|---|
| **Operation flexible working hours** | **APPROVED TARGET; 9 Oct owner clarification.** Office is Monday–Friday, 9:00 AM–6:00 PM. Existing permitted flexible arrival/departure and eight working hours remain; a permitted 10:00 AM start is not proof of lateness. Saturday support is a separate 9:00 AM–6:00 PM rota, not automatic expansion of every module calendar. Lunch defaults to 1:00–2:00 PM and remains one hour, with a configured start between noon and 2:00 PM. Workspace §4.4 owns configurable 10:00 AM / 2:01 PM checks and skips actual lunch until one minute after it ends. Checks are work routing, not payroll or proof of attendance. No automatic HR finding is authorised. |
| **Leave fact for work assignment** | **Owner clarification 9 Oct / APPROVED TARGET; implementation unverified.** Workspace → Leave is the single submission entry for MC, Emergency and Planned leave. Currently no type needs approval; authorised Settings editors may introduce future approval policy with explicit effective treatment. Required type-specific evidence remains governed; no second MC Report is introduced. Today's recorded absence initiates qualified available cover immediately, while future absence activates on its absence date. People owns absence/eligibility facts and Workspace owns assignment/cover; neither maintains a second rota. |
| **Work activity versus HR attendance** | **OWNER RULING 2026-09-29 / APPROVED TARGET / NOT BUILT.** Two period-specific activity checks may change unfinished Work assignment without a manager recording MC. An activity gap does not establish MC, attendance, employment status or access; no automated HR finding is created. Morning activity cannot satisfy the afternoon check, and background heartbeat is not fresh work-period evidence. |
| **BD revenue on the cost screen** | Cost shows; revenue reads *not enrolled* — 0 dealers have a BD owner. Wiring it needs a dealer-channel revenue read, **not a widening of the showroom-only source.** |
| **Effective dating on the other four config tables** | Approved. Today only rates carry it, so editing model rates, tiers, milestones or the scheme method rewrites live figures. Harmless for CLOSED months **because the run freezes the lines** — which is exactly why closed months must be read, never recomputed. |
| **Pro-rating salary by join date** | Approved; blocked because `join_date` is filled for 0 of 9. |
| **Bonus tiers** | Skipped on purpose: zero commission rates exist, and the model-tier table already has the semantics. Wire attainment-pays through the adjustment slot, **never a parallel engine.** |

**Saturday on-call boundary — owner confirmed 9 October 2026:** rotating contact coverage, default 9:00 AM–6:00 PM and editable. Answer customer, driver and warehouse calls/WhatsApp and record any required follow-up. It is not normal Saturday office attendance, PO Duty or GRN Duty, and does not automatically transfer all routine Tasks to the on-call person. Any follow-up retains its source-owned permission, normal owner and qualified cover rules. Rotation frequency remains unspecified; implementation unverified.
