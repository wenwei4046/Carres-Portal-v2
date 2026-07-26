# Carres HR System — Full Spec (v1, 2026-07-26)

> Status: **RATIFIED 2026-07-26 (Loo)** — HR-P2…P6 approved. Standing law added by
> Loo: **every phase must have its UX/UI design done and shown BEFORE
> implementation starts.**
>
> **HR-P7 + HR-P8 RESTORED (Loo, 2026-07-26, same day)** — cut earlier that day
> ("no need p7, p8"), reinstated on his call. D3/D4/D5 went live again with them
> and were **all three decided the same day** — see §7 for the rulings (D3 =
> hr + principal; D4 = signal only; D5 = no request flow at all).
> Restoring costs ZERO rework: both phases were designed as extensions on
> top of P4/P5 (`staff_comp` FKs into `hr_employees`; leave ladders key off
> `join_date`), and those fields are already in the P4 spec. **The statutory-
> payroll exclusion (§6) is UNAFFECTED** — P7 stores base salary as a typed-in
> number for a cost ratio; it never computes EPF/SOCSO/EIS/PCB.
>
> **HR-P3 CUT (Loo, same day)** — native orders always carry a salesperson
> (verified: 18/18 native have salesperson_id; the 37 blanks are ALL AutoCount
> testimonial imports). The change-with-reason correction door survives as a
> micro-add inside HR-P5 (the run-lock guard needs it anyway). Remaining build
> order: **P2 → P4 → P5 → P6 → P7 → P8.**
>
> **PROPOSALS — Loo picked O1 + O4 (2026-07-26).**
> ✅ **O1 Overview** (HR landing digest: month money + needs-a-human rail + one-click
> "mark 37 AutoCount blanks as legacy", size S) · ✅ **O4 My HR** (staff
> self-service, size M — **carries an unresolved login dependency, see §2a**) ·
> ⬜ **O2 Appraisals** (semi-annual, scorecard-anchored, needs P5+P6 live first,
> size M) · ⬜ **O3 Claims** (receipt + approve inbox + rides the statement CSV,
> size M) — O2/O3 not picked, still on the table.
> Produced by the hr-hierarchy line via an 8-agent ultracode workflow: 4 current-state
> readers (web UI / API+engines / data model / decisions+CFs) → 3 independent designs
> (people-ops-first · performance-first · ERP-integration-first) → 1 completeness critic.
> Backbone = the integration-first design, with the performance design's KPI model and
> the people-ops design's employee-master + leave presets grafted in, plus 8 gaps all
> three missed (PDPA, offboarding revocation, clawbacks, multi-entity, dual position
> taxonomy, retail work-calendar, notifications, segregation of duties).

---

## 0. Ruling flag — scope supersession (must be explicit, never silent)

On 2026-07-25 Loo narrowed HR to **"commission CALCULATION only — no base payroll, no
statutory deductions."** This spec expands HR to a full system on Loo's later ask
("now we do full spec hr system") but **keeps the statutory-payroll exclusion
permanent** (§6). Two statutory-adjacent items are named so nothing slips in silently:
the optional comp register (§P7) stores employer-burden % as a typed-in estimate, and
the employee master stores EPF/SOCSO/tax **reference numbers** only — we never compute
contributions.

Design laws that bind every phase (from the decisions record):

1. **0244 keyhole law** — `is_internal()` never widens for `hr`; every HR read is a
   gated SECURITY DEFINER RPC; config tables are RLS deny-all except
   `app_role() in ('hr','principal')`, InitPlan-wrapped.
2. **Dealer exclusion** — dealers + dealer staff never enter hierarchy/HR; staff
   commission = showroom channel only; BD commission = dealer channel only.
3. **Money writes = audited DEFINER RPC** (guardrail #4), never raw updates.
4. **"PIN = workflow, not security boundary"** — RLS is the security boundary; PIN /
   duty-key narrowing is workflow. Anything that must be security-grade gets RLS, not
   a duty check.
5. English-only UI · effective-dated append-only rates · guardrail #8 tail pre-check ·
   single-overload check before any `CREATE OR REPLACE` · union-tip deploys.

---

## 1. What is already live (do not rebuild — extend)

| Module | Where |
|---|---|
| HR keyhole role + RLS pattern | 0244 |
| Commission engines ×3: staff % (+manager override) · staff per-model (+tiers/milestones) · BD % / item-KPI (+CBO override) — pure `@carres/shared`, effective-dated, program-separated | 0245/0246/0250-0252 |
| Attribution worklist + audited `hr_assign_salesperson` / `hr_assign_dealer_bd` | 0245/0250 |
| Org hierarchy: positions (3 bands) · departments · reports_to (cycle-guarded) · CRnnn codes (cross-table) · 职位更替 history · department chart | 0254/0259 |
| Team tab = THE account door (dealer/store exception) + showroom-staff door | PR #276/#295 |
| Staff PIN identities + POS Staff page | 0233/0241 |

Known small debts to fold into nearby phases: month not in URL (reset on reload) ·
`ROLE_LABEL` duplicated in 3 files · Commission KPI row ignores BD money · stale
"add staff from POS" copy · Setup month-keyed query oddity · `hr_set_reports_to`
unaudited · no disable/enable door on Team rows · no re-assign door in Attribution ·
staffless showrooms unconfigurable in Setup · per-outlet scheme dimension dormant.

---

## 2. Roadmap at a glance

Build order: **P2 → P4 → P5 → P6 → P7 → P8** (P7 reads P4's comp register + P5's
run totals, so it cannot precede either; P8's leave ladders key off P4's
`join_date`).

| # | Phase | Module | Size | Migration | Blocking decision |
|---|---|---|---|---|---|
| 1 | **HR-P2** | Hierarchy-driven permissions (duty keys) + audit/taxonomy fixes | M | 1 | D2 ✅ |
| — | ~~HR-P3~~ | ~~Attribution at source~~ — **CUT** (18/18 native orders already attributed) | — | — | — |
| 2 | **HR-P4** | Employee master + documents vault + on/offboarding + revocation | L | 1 | D1 ✅ |
| 3 | **HR-P5** | Commission runs (month lock + adjustments + CSV export) | M-L | 1 | D1 ✅ |
| 4 | **HR-P6** | KPI targets + scorecards + rollups | M | 1 | — |
| 5 | **HR-P7** | Chairman overview (cost vs revenue) — needs comp register | M | 1 | D3 ✅ |
| 6 | **HR-P8** | Roster + presence signal · Leave (HR-entered records, no request flow) | M-L | 1-2 | D4 ✅ D5 ✅ |
| +1 | **O1 Overview** | HR landing digest — slots in right after P2 (reads data that is already live) | S | 0 | — |
| +2 | **O4 My HR** | Staff self-service — after P5 at the earliest (needs P4 profile + P5 statement to have anything to show) | M | 1 | **login gap, §2a** |

### 2a. O4's unresolved dependency — who can actually log in

O4 is "staff self-service", but **most of the staff it serves have no login**.
Showroom floor staff exist as `salespersons` rows with a PIN identity (0233/0241);
`salespersons.user_id` is mostly null, and CF `staff-salesperson-user-id-provisioning`
records that future email logins start unlinked. The email restructure that would fix
this is PARKED by Loo.

Three ways out, and the honest cost of each:

| Route | Serves | Cost / risk |
|---|---|---|
| **A. HQ-only O4** (recommended default) | 12 HQ staff who already have real email logins + RLS | No new dependency, ships clean. Floor staff get nothing — which may gut the point if O4 was meant for them |
| **B. Revive the email restructure**, give floor staff real logins, then O4 for everyone | Everyone | Unparks work Loo shelved; that plan already exists in chat and is the "proper" fix |
| **C. Floor staff reach My HR behind the POS PIN** | Everyone, no email work | **Names a real conflict**: "PIN = workflow, not a security boundary" is a locked law. Personal pay + leave data behind a 6-digit code on a shared showroom tablet is PII on weak protection. The my-orders board (PR #259) already sets a PIN-gated precedent, so this is a *widening* of an existing door, not a new one — but it is still a deliberate downgrade for PII and must be Loo's explicit call, not a silent build choice |

**RESOLVED — Loo picked B (2026-07-26): floor staff get real logins.**

**Scope correction, made when B was costed against live data.** The option-B wording
above ("revive the email restructure") bundled two things that do not need to be
bundled — that framing was wrong. What O4 actually needs is *floor staff can log in*,
which is far smaller than the parked email project:

- Live count: **5 salesperson rows total** — 3 at `litte mattress sdn bhd` (channel
  `dealer`) and 2 at `Carres Kelana Jaya` (channel `showroom`). **0 have `user_id`.**
- The dealer-exclusion law removes the 3 dealer staff from HR entirely. **O4's
  floor-staff population today is 2 people**, 1 of whom already has an email on file.
- A portal login needs an address that can receive a password reset — **not** a
  Google Workspace mailbox. A personal address works. Workspace seats cost
  RM35/user/month; using them as a login prerequisite would be paying a recurring
  fee for a capability Supabase Auth already gives free.

**Therefore B executes as:** (1) create a Supabase Auth account per showroom staff
member, (2) close CF `staff-salesperson-user-id-provisioning` so the existing Team-tab
account door WRITES `salespersons.user_id` instead of leaving it null, (3) done —
scales automatically as showrooms open. Recurring cost RM0.

**The email restructure is NOT a prerequisite and is NOT unparked by this ruling.**
It (Groups-as-forwarders, `opshub@` → Cloudflare Email Worker on
`in.carresofficial.com` → ERP Mail page) is a separate initiative about company mail
routing, with its own value and its own decision. Related open item worth revisiting
on its own merits, not O4's: 4 unidentified Workspace users (Kris / LeeLee / Richard /
Vivian, 3 of whom have never signed in) at RM35/mo ≈ **RM1,680/yr of seats nobody uses.**

Every phase: own worktree, tail-checked migration numbers (parallel lines active),
full suites at §17.7 baseline, union-tip deploy.

---

## 3. Phase specs

### HR-P2 — Hierarchy-driven permissions (the parked "Phase 2", now first)

**User story.** Promote someone in the Team tab and the portal follows within one
login — no code change, no redeploy. Kills `OPS_MANAGER_EMAILS` / `isPoDutyEditor` /
`OPS_GENERIC_EMAILS`.

**Design — duty keys, not per-position ACLs** (a 15-person company needs ~5 keys,
not a permission matrix; one human wears three hats, so band-driven grants would
over- or under-grant):

```
org_duties            key PK ('ops_manager','po_duty_editor','account_creator',
                      'finance_approver','roster_editor'), name, description
org_position_duties   position_id FK, duty_key FK, unique(position_id, duty_key)
```

- `my_org_duties() → text[]` — STABLE SECURITY DEFINER, **self-only** (caller's
  position → duties; `{}` otherwise). Surfaced via `/me`. No RLS widening.
- Frontend/API swap the three email hardcodes for duty checks. **Transition
  fallback**: legacy email list OR-ed in for one release, fallback hits logged,
  removed after a clean week — nobody loses power on switch day.
- **Trust model named (critic's catch):** duties gate *workflow*. Anything
  money-approving keeps its role check (`principal`/`hr`); a duty may narrow further
  but never replaces the role gate. RLS remains the only security boundary.
- Duty assignment UI: checkboxes per row in the Team → Positions card. Audited.

**Folded fixes:** audit `hr_set_reports_to` (currently silent) · **dual-taxonomy
reconciliation** (critic miss #5): map POS tiers to registry seats in ONE place
(`SHOWROOM_TIER_POSITION` moves to shared, keyed on org_positions rows) so KPI /
duties / appraisals can treat floor staff uniformly · `ROLE_LABEL` dedupe ·
month-in-URL fix.

### HR-P3 — Attribution at source

**User story.** The POS already knows who is selling (PIN session). Stamp
`salesperson_id` at order creation; owner sessions get a required "Who made this
sale?" picker (same-store active staff, **showroom channel only** — dealer POS is
never shown the picker, per the dealer-exclusion law). The Attribution tab shrinks
to an exception queue.

- New audited RPC `hr_reassign_salesperson(p_order_id, p_salesperson_id, p_reason)` —
  the missing correction door; reason required; refuses months inside an approved
  commission run (HR-P5) — paid history never moves silently.
- Attribution tab gains "Recently attributed" with a Change action.
- Order-write path change → guardrail #5 (concurrency) review applies.

### HR-P4 — Employee master + lifecycle (the people spine)

**User story.** One record per human — HQ logins AND showroom floor staff — with
join/confirm/exit dates, IC, emergency contact, bank + statutory *reference* numbers,
documents, and a dated employment history. Hiring opens an onboarding checklist;
recording an exit opens offboarding and actually revokes access.

```
hr_employees          id · entity text default 'carres' (multi-entity reserve)
                      · staff_code (sync w/ CRnnn) · app_user_id FK null
                      · salesperson_id FK null · check(one is not null)
                      · unique on each FK (merge RPC designed up-front, not retrofitted)
                      · full_name/preferred_name · ic_number · nationality · dob
                      · gender · marital_status · phone · personal_email · address jsonb
                      · bank_name/account_no/holder · epf_no/socso_no/tax_no (refs ONLY)
                      · employment_type · status(active|probation|resigned|terminated)
                      · join_date/confirm_date/exit_date
hr_employment_events  append-only: employee_id · event(hired|confirmed|promoted|
                      transferred|resigned|terminated|rehired) · effective_date ·
                      notes · recorded_by/at
hr_employee_documents id · employee_id · doc_type(ic|contract|certificate|other) ·
                      file_path (private bucket hr-docs, signed URLs via Hono) ·
                      uploaded_by/at
hr_checklist_*        templates + instances; onboarding auto-opens from BOTH account
                      doors; offboarding auto-opens on exit_date
```

**PDPA 2010 pack (critic miss #1):** IC/bank rendered masked with click-to-reveal;
**every reveal writes an audit row**; documents + PII carry a stated 7-year
post-employment retention rule (purge RPC, principal-confirmed); doc-vault delete is
soft + audited; breach-notification duty noted in ops runbook.

**Offboarding revocation (critic miss #2), sequenced:** disable login (new audited
Team-row door) → GoTrue admin sign-out/ban so the live JWT dies now, not at expiry →
PIN deactivation verified server-side (`salespersons.active` checked at unlock —
verify, don't assume) → checklist records keys/device returns.

**Backfill:** one row per existing internal user + showroom staff; PII empty for HR
to fill. UI: **People** becomes the first HR tab; Linear-style row + drawer
(Identity / Contact / Bank & refs / Employment timeline / Documents / Checklists).

### HR-P5 — Commission runs: report → ledger

**User story.** Early each month HR clicks **Close month** → reviews → **Approve**.
Figures freeze into an immutable statement per person; one CSV exports to whatever
pays people (the payroll-SaaS bridge); per-staff PDF optional. Config edits and
attribution changes can no longer silently rewrite a paid month.

```
commission_runs       id · year · month · program('staff'|'bd') · status(draft|
                      approved|paid|void) · created/approved/paid by+at · note ·
                      superseded_by_run_id · unique(y,m,program) where status!='void'
commission_run_lines  run_id · subject_kind('salesperson'|'hq_user') · subject_id ·
                      staff_code+name+store text snapshots · basis · direct ·
                      override · per_model · milestone · kpi_bonus · total ·
                      breakdown jsonb (renders the statement forever)
commission_run_adjustments   (critic miss #3) run_id · subject · amount (±) ·
                      reason(clawback|refund|correction|rental_share|other) ·
                      ref_order_id null · entered_by · audited RPC only
```

- Close = server re-runs the SAME pure engines and persists — no second engine,
  drift-proof. Approve/void/reopen = audited RPCs; approve requires principal (role
  check; `finance_approver` duty may narrow, never replace — P2 trust model).
- Attribution/rate writes into an approved month: hard-reject with "July is approved
  — reopen the run first"; reopen is principal-only + audited.
- Adjustments carry cancelled/refunded orders after payout as negative lines (no
  void-and-reissue sledgehammer) and reserve the **rental 20% share** slot so the
  rental line lands in the same ledger (binding ruling: rental reuses 0245 machinery).
- Commission tab gains a status banner + Runs history; Export CSV
  (`staff_code, name, month, commission, kpi_bonus, adjustments, total`).

### HR-P6 — KPI targets + scorecards + rollups (Loo's explicit ask)

**Targets (performance design's model — inheritance, not per-person data entry):**

```
kpi_definitions   id · name · metric(sales_basis|units_sold|orders_count|manual) ·
                  category null · unit(rm|qty) · active · sort
kpi_targets       append-only effective-dated: kpi_id · scope_kind(person|store|
                  position|department|band) · scope_id · target_value ·
                  effective_from · unique(kpi,scope,scope_id,effective_from)
kpi_bonus_tiers   kpi_id · scope · attainment_pct · bonus_amount (highest reached
                  pays — same semantics as model tiers; WIRING to money optional,
                  off by default)
kpi_manual_actuals  kpi_id · subject · y/m · value · entered_by (the escape hatch
                  for non-sales KPIs — no formula builder, ever)
```

Resolution: person > store > position > department > band (pure
`resolveKpiTarget` in shared). Actuals derive from the same month slice
`hr_commission_source` already returns — attribution is the ground truth.
**Self-action guard — REMOVED (Loo 2026-07-26):** an hr-role user MAY author
rates/targets/tiers scoped to themselves; the audit trail is the control (§4), and
such writes carry the `SELF · …` marker.

**Scorecards:** computed, not stored (until locked into a run). New **Performance
tab**: per-staff attainment bars (green ≥100 / amber 70-99 / grey), prose breakdown
in the existing StaffBreakdown style. **Rollups:** manager rows aggregate direct +
transitive reports along `reports_to`; showroom staff → store → the seat holding the
Sales-Manager duty over that store; department chart cards get an attainment dot —
the chart becomes a live health board.

### HR-P7 — Chairman overview: people cost vs revenue *(D3 ✅ hr + principal)*

Comp register `staff_comp` (employee_id · base_monthly · fixed_allowance ·
employer_burden_pct typed estimate · effective_from, append-only). Loaded cost =
(base+allowance)×(1+burden) + run totals. **Overview tab**: per-outlet and
per-department cost / attributed pure item revenue / ratio, 6-month trend. Honest
labels: HQ departments show cost with revenue "—" — cost-visibility, not a fake P&L.

**Access (D3):** RLS + the read RPC admit `app_role() in ('hr','principal')`. HR
administers comp, so HR reads every row; principal reaches the same numbers through
each person's tab. **Write = same set, including your own row** (Loo 2026-07-26,
§4): an hr user MAY edit their own `staff_comp`. No subject ≠ caller block. The
audited DEFINER RPC stamps `SELF · …` on the audit action when subject = caller, so
self-edits stay one filter away rather than blocked.

**Statutory line (unmoved):** `employer_burden_pct` is a number a human types as an
estimate. This phase never computes EPF/SOCSO/EIS/PCB, never issues a payslip, never
generates a bank or e-filing file — see §6. Restoring P7 did not reopen that door.

### HR-P8 — Roster + presence · Leave (HR-entered records only, no request flow)

**Roster:** `shift_templates` + `roster_entries` (staff × outlet × date) + week grid
UI; store-side "My week" read-only via existing staff-scoped POS routes.
**Presence signal:** first/last PIN unlock per day upserts `staff_presence` — UI
hard-labels it "seen at POS", an informational signal, never an automatic pay input
(named boundary; real time-and-attendance = the payroll SaaS's mobile clock-in).
**Leave (D5 ✅) = an HR-entered RECORD. There is no request flow.** Loo's ruling:
HR types in who took leave. Explicitly NOT built — not deferred, not phase-2'd,
simply not in scope until Loo asks for it: employee leave submission, manager
approval chain, approval inbox, notifications, employee self-service, and the
`my_team_leave()` DEFINER design that a request flow would have needed. This is
what makes P8 land at M-L instead of L — the request/approval machinery was the
bulk of the original estimate.

Tables: `leave_types` + `hr_leave_entitlements` + `leave_records`; balance derived,
never stored. **Malaysian presets** seeded (EA ladders: annual 8/12/16d, MC
14/18/22d + 60d hospitalisation, maternity 98d, paternity 7d) **with per-population
work calendars** (critic miss #6): HQ counts skip Sun+PH; floor-staff calendars
count per store roster, and PH-worked days can record replacement leave.

**Judgement call to confirm at build time:** entitlement + derived balance is KEPT
even though only the record was asked for — without it "who took leave" is a bare
log and HR still can't answer "can Ali take 3 more days?". It is ~1 seed table plus
arithmetic, nowhere near the cost of the request flow. If Loo wants a pure log,
drop `hr_leave_entitlements` and the balance column; nothing else changes.
Recorded leave overlays the roster grid so "planned but not seen" days aren't
false alarms.

---

## 4. Cross-cutting (from the critic, applies to every phase)

- **PDPA**: masked-PII + reveal-audit + retention/purge + private bucket (P4).
- **Multi-entity**: `entity` column on hr_employees from day one; config tables gain
  it only when a second entity actually exists.
- **Notifications**: approval inboxes get a delivery mechanism only when the mail
  phase (parked opshub/ERP-mail plan) lands; until then tabs + the existing
  unattributed-banner pattern are the notification.
- **Segregation of duties — OVERRULED by Loo 2026-07-26.** The original rule was
  "no self-authored rates/targets/claims; every such write checks subject ≠ caller".
  Loo's ruling: *"hr can change ownself de, nvm, audit log got record all action, so
  can track back."* **Detective control replaces preventive control** — hr may write
  rows about themselves (comp, rates, targets, claims); nothing is blocked.
  Implementation duty that FOLLOWS from his own rationale: the control is only real
  if the trail is legible, so every self-write is **marked as such** in the audit
  action text (`SELF · …` prefix when subject = caller), making "did anyone edit
  their own numbers?" a one-filter question instead of a manual row-by-row read.
  Applies to BOTH the P7 comp register and the P6 rates/targets guard.

## 5. Explicitly parked (each has an owner decision, none is forgotten)

@carresofficial.com email restructure + login-email change door (Loo parked — but
note it is now route B of O4's §2a decision, so it is parked-with-a-consequence, not
forgotten) · salesperson email logins (CF `staff-salesperson-user-id-provisioning`) ·
appraisal cycles = O2, not picked (build after 2-3 months of locked scorecard history
exists) · claims module = O3, not picked (pairs naturally with the payroll SaaS's).

~~employee self-service~~ — no longer parked: approved as **O4** (2026-07-26).

## 6. Never build — and why

| Not building | Why | Instead |
|---|---|---|
| **Statutory payroll** (EPF/SOCSO/EIS/PCB/HRDF, payslips, bank files, e-filing) | Rates/tables change every Budget; real agency liability; negative ROI at ≤20 headcount | **Buy**: PayrollPanda (~RM12-15/staff/mo) or Kakitangan; BrioHR/Swingvia if buying leave+claims too. **Talenta ruled out** (Indonesia-first: BPJS/PPh21, not EPF/PCB). Our P5 CSV is the integration contract |
| Biometric/geofence attendance | Hardware rabbit hole; presence signal + SaaS clock-in covers it | P8 signal |
| Recruitment/ATS, LMS, surveys, 360 reviews | Wrong scale at ≤20 staff | Notion/Sheets |
| Configurable workflow engine | One fixed chain covers a 15-person company | Fixed flows |
| Dealer-staff HR | Locked law: dealers are independent entities | — |
| Second rental commission engine | Locked ruling: rental reuses 0245 machinery | P5 adjustment slot |

## 7. Decisions for Loo (the 拍板 list)

**ALL FIVE DECIDED (Loo, 2026-07-26).**

| # | Decision | Ruling |
|---|---|---|
| **D1** | Ratify the scope expansion (full HR system; statutory payroll stays excluded forever) | ✅ **Yes** |
| **D2** | HR-P2 permissions via duty-keys + transition fallback | ✅ **Yes** |
| **D3** | Does base salary enter the ERP, and who reads it? | ✅ **hr + principal.** Loo: *"hr 一定看得到的. principal 看得到, 是因为可以进去每一个人的 tab"* — HR administers comp, so hiding it from HR is nonsense; principal reads it via the per-person tab (principal's reach is universal by nature, not a special comp grant). **Overrides the earlier principal-only recommendation.** Segregation of duties does **NOT** bind here — Loo overruled it the same day (§4): an hr user may write rows about themselves, including their own comp, rates and targets. Nothing is blocked; the control is detective, and every self-write is marked `SELF · …` in the audit action. (An earlier draft of this row said the opposite — "may NOT write their OWN". That was the pre-ruling text, retracted here; §4 is the later decision and wins.) |
| **D4** | Attendance = presence signal only (never a pay input)? | ✅ **Yes — signal only.** |
| **D5** | Leave scope | ✅ **NO request/approval flow at all.** Loo: *"不需要做请假的东西先… 他的 request（请假）这边暂时放给 HR 自己去填, 谁有没有请假"* — HR types in who took leave. No employee submission, no manager approval chain, no notifications, no self-service. Narrower than the earlier "records-first" recommendation, which still implied a future request flow. |

## 8. Risk register (top 5, merged from the three designs)

1. **Month-lock vs Loo's fluid workflow** — if corrections happen "whenever noticed",
   the lock fights him. Mitigation: draft stays fluid; adjustments (not void) absorb
   late changes; ship P5 only after P3 has cut the correction rate.
2. **Attribution/reports_to hygiene is the payment spine** — rollups inherit every
   gap. Mitigation: P3 fixes at source; unattributed banner escalates into the
   manager's own team number; CR code is the durable person key across the future
   email migration.
3. **Dual-identity split** (HQ uuid vs PIN staff) — a person with both identities
   could fork records. Mitigation: dual-FK employee spine + merge RPC designed in
   P4, not retrofitted.
4. **Non-sales KPIs quietly die as manual entry** — mitigation: closed metric enum,
   one computed metric added per phase max, no formula builder.
5. **Duty-keys drifting into security** — mitigation: trust model written into P2;
   money gates keep role checks; RLS-only for anything security-grade.
