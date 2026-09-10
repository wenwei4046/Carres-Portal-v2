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
- **Workspace → Staff & Duties is the ONE company-wide Duty assignment door** (owner rulings
  2026-09-01 / 2026-09-03). It keeps the Duty catalogue, each Duty's one Primary holder, optional
  Buddy cover and effective dates. `Team` may show staff and workload, but it is not a second Duty
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
  `../purchasing/MASTER.md` §2.2 and its one edit door remains Team.
- **Checklists are a shared constant, not a config table.**
- **People owns Duty eligibility, not Duty assignment** (owner ruling 2026-09-01): employee name,
  personal account, active/disabled, last working date and membership of the eligible Carres staff
  rotation pool. A last-working-date change removes the person from future resolution; People does
  not store any Duty assignment or Buddy cover.

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
| **Duty-cover leave fact** | **APPROVED 2026-09-03.** This is the effective-dated unavailable fact the Shared Duty Resolver needs to route today's Duty work to the governed Buddy. It is not a shift roster, attendance clock or presence monitor. |
| **Shift roster / attendance / live presence** | **DROPPED by Loo at the design stage.** Missing heartbeat never activates a Cover; only a recorded leave fact does. |
| **BD revenue on the cost screen** | Cost shows; revenue reads *not enrolled* — 0 dealers have a BD owner. Wiring it needs a dealer-channel revenue read, **not a widening of the showroom-only source.** |
| **Effective dating on the other four config tables** | Approved. Today only rates carry it, so editing model rates, tiers, milestones or the scheme method rewrites live figures. Harmless for CLOSED months **because the run freezes the lines** — which is exactly why closed months must be read, never recomputed. |
| **Pro-rating salary by join date** | Approved; blocked because `join_date` is filled for 0 of 9. |
| **Bonus tiers** | Skipped on purpose: zero commission rates exist, and the model-tier table already has the semantics. Wire attainment-pays through the adjustment slot, **never a parallel engine.** |
