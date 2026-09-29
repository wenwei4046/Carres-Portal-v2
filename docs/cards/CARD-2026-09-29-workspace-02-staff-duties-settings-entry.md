# 【WORKSPACE】 — CARD 02 · Move Staff & Duties into Settings

- **Module:** Workspace — Staff & Duties
- **Sequence:** 02
- **Lane:** BUILD / DELIVERY
- **Status:** OPEN — relocation-first scope authorised; not merged or deployed
- **Owner instruction:** Jess, 2026-09-29: “first open card to fix the staff & duties move to setting first”
- **Authority:** `docs/workspace/MASTER.md` §4 entry placement; shared Settings entry in `docs/ui/MASTER.md`; Duty destination in `docs/COPY-STANDARD.md`.
- **Existing work:** draft PR #1791, branch `codex/staff-duties-delivery`. The release diff is narrowed to this Card; the broader draft is preserved on `codex/staff-duties-full-draft-20260929`.

## Outcome

Staff open the existing Staff & Duties page through the header gear → **All System Settings →
Staff & Duties**. Its permanent main-menu row disappears. Existing bookmarks and contextual
links still open the requested Duty, and staff can return to the originating work context.

This is the first independent delivery slice of the approved Blueprint. It does not wait for
new rotation, leave, departure or permission engines. Missing Supabase migration tools do not
block this navigation-only Card: no schema, migration, RLS or production-data mutation is required.

## Included

- Add the canonical `/operation/settings/staff-duties` destination to the existing Settings shell.
- Remove the permanent Staff & Duties main-menu row; preserve **Workspace** and its unchanged
  `/operation?tab=work` identity.
- Redirect `/operation?tab=staff-duties` to the canonical destination, preserving the requested
  Duty, applicable query context and safe return state.
- Point existing module Duty links to the same destination and exact Duty. Do not introduce a
  second assignment editor or invent new Work actions.
- Reuse the existing page and authorised read/management controls. Keep one utility header;
  Settings must not falsely highlight Dashboard.
- Make Settings navigation available on demand so the catalogue and selected detail are not
  squeezed beside a third compulsory column. Preserve narrow-screen back navigation and focus.

## Excluded from this Card

- Automatic PO/GRN rotation, newcomer admission, leave facts and automatic cover selection.
- Departure recording, access disablement, former-profile management and People workflow changes.
- Widening PO, GRN, approval or other business-action permissions.
- Assignment/cover writer changes, bounded exceptions, impact previews and database migrations.
- New resolver/read contracts, history pagination, next-assignment algorithms, and the separate
  detail/history/form redesign. Those approved targets remain in the owning MASTER.
- Changes to Work projection, task ownership, source PICs, completion or immutable actor evidence.

## Existing draft reconciliation

The release diff now contains only route, navigation, shell and return-context changes with their
regression tests. The broader API, HR, resolver and form/detail work is restored to current main
for this release and preserved on `codex/staff-duties-full-draft-20260929`. PR #1791 is reused for
this relocation-only change.
Primary implementation surfaces are `OperationApp.tsx`, `SettingsWorkspace.tsx`, `portal-nav.ts`,
`PortalSidebar.tsx`, existing module links such as `DeliverySettings.tsx`, and only the page-level
navigation plumbing needed by `StaffDuties.tsx`. Tests follow those surfaces. This is not authority
to alter HR or owning-module business rules.

## Acceptance and release

- [ ] Gear → All System Settings → Staff & Duties opens the existing authorised page.
- [ ] No permanent Staff & Duties main-menu row remains; Workspace naming is preserved.
- [ ] An old exact-Duty bookmark reaches the same Duty at the new address; browser Back and
      originating Work context remain usable.
- [ ] Reader/manager access and existing assignment/cover behaviour are unchanged; no permission
      or employee record is modified as a consequence of opening the page.
- [ ] One destination header, no false Dashboard selection, and usable Settings navigation.
- [ ] Browser verification at **1440, 1180, 820, 743 and 390px**: no horizontal overflow, clipped
      names/controls or page errors; keyboard operation, narrow back focus, and loading/failure
      behaviour checked. Mark fixture evidence separately from authenticated production evidence.
- [ ] Focused navigation regressions, required repository checks and exact-head CI pass.
- [ ] Self-review confirms the released diff contains this Card only; merge and normal main-owned
      deployment complete, with exact deployment SHA and authenticated production journey verified.
- [ ] Update Workspace MASTER §4 with the relocation's measured delivered status. Keep the wider
      approved operating model explicitly unfinished; this Card does not close the whole Blueprint.

## Build handoff

**【WORKSPACE】 — CARD 02 · Move Staff & Duties into Settings.** Deliver the navigation-only scope
above from current main, using the existing Settings shell and Duty page. Own route relocation,
legacy/contextual links, responsive shell, tests and production verification. Do not change duty
allocation, leave, departure, HR access, business permissions or database contracts. Follow the
current constitution and owning MASTER; keep the broader approved Blueprint for subsequent work.

## Verification in progress — 2026-09-29

Local focused checks: StaffDuties 96, OperationApp 43, SettingsWorkspace 13, DeliverySettings 8,
and PortalSidebar 111 tests passed (271 total). The actual application shell with synthetic API
fixtures passed at 1440, 1180, 820, 743 and 390px: canonical exact-Duty navigation, on-demand
Settings rail, one destination header, document overflow, narrow Back focus, reader controls,
loading, initial failure and page-error checks. Screenshots and measurements in
`docs/evidence/staff-duties/settings/` are fixture evidence only. Production is not yet verified.
