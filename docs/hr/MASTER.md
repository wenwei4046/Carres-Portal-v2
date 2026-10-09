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
