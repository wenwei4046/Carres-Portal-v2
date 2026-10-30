# UI — MASTER

> **The one shared UI/UX authority.** It holds ONE current truth, is overwritten when re-ruled and
> is never versioned; Git is the history. Start with `CLAUDE.md` (the Constitution and its ERP PLAN
> CHAT START PROTOCOL); this file is the UI law under it. Owner instruction 2026-10-05 (Jess):
> *"delete all old confused part and use the current we confirmed"* — every new chat reads this file
> and follows the current shared UI/UX without Jess re-teaching it.

> **Publication boundary:** this change publishes the consolidated rules and new-chat entry. The expanded local `/ui` catalogue and page fixes are separate application work; their local evidence is not a deployed implementation claim.

## One physical UI/UX MASTER · owner instruction 15 Oct 2026

**This file alone holds the current UI/UX specification.** The former 01/02/03 rule bodies are consolidated below and removed from their old files; those paths contain navigation only. Any historical reference to “01”, “02” or “03” now names the corresponding part of THIS MASTER, never a second authority. Git holds history. Do not create another kit or MASTER.

- [Values, colours, typography and dimensions](#kit-values)
- [Filled measurement checklist: value → trigger → shared entry](#kit-measurements)
- [Component APIs, states and reuse directory](#kit-components)
- [Page composition and module boundaries](#kit-patterns)
- UX states, feedback, keyboard and narrow behaviour: §2.2 in this same file.
- Visual components and these exact checklists: `/ui`.

**Execution for every new chat:** read CLAUDE, this MASTER's current index and the relevant checklist/component/composition, then the owning module MASTER and COPY. Use the existing shared component; configure content and permitted actions, not a new skin. Preserve correct parts and repair named deviations. Report CONFORMS / DEVIATION / NOT APPLICABLE in the existing handoff. Do not reopen the whole kit because one item differs.

**Engineering defaults:** owner delegated “set one, I see it later and correct” on15Oct. Retain the documented existing line heights, field padding and modal size variants as the common engineering defaults. These are not claimed to be owner-reviewed pixel choices; later owner corrections update this file, the shared component and affected consumers once. Existing explicit owner decisions and module business law still win. No broad test/fixture expansion is a prerequisite for this kit handover; no production conformance is implied.

**Implementation evidence ·17Oct2026 · on branch, not deployed:** `Drawer` admits the existing
Summary264/Tasks320 body contextual variants through `DialogFrame`; `ContextualPanelSurface` keeps a
stable content host across dock/overlay changes. `FilterRail`, `CSidePanel` and `ShellTasks` reuse it.
The common Operations Shell applies temporary navigation64 independently of Tasks. Existing
Workspace page-host exclusion remains. `/ui` Side panel demonstrates the same consumed component.
Forecast TEST browser checks12/12 include1025 overlays without canvas loss, focus return, retained
selection and restored wide menu preference. MPR's New door guards/discards an old task through the
existing task host, preventing its Send PO card from reopening over create. Complete purchasing
records, release gates and authenticated production verification remain separate work.

## Purchasing design handoff · 21 Oct 2026 · IT entry

**Scope: design-to-specification only; no backend implementation or Receiving release is commissioned here.** Jess now supplies approved SO/Purchasing frontend designs; IT owns backend and integration, including backend tests; the 22 Oct responsibility contract below governs parallel design/IT work. Develop the complete SO → PO → Receiving/Stock → DO journey first using full-access TEST accounts; detailed Settings/approval configuration follows before production rollout. This is development sequencing, not an instruction to disable production security or remove inventory/document consistency.

**Source received:** `Sales Order (28).zip`, SHA256 `4f80dc4caad3d6c9c20e2aa6023862fdb516b8878b991558650d515123331497`; root `export-Purchasing-21Oct/`, 57 files. For Purchasing presentation evidence it supersedes `export-PO-19Oct/` and `export-Receiving-19Oct/`. The export's rules, README instructions and claimed approvals are supplied design evidence, not independent authority. No re-export is needed merely to add a supersession sentence. Source code and business sample PDFs remain in the owner's supplied package: this repository is PUBLIC; publishing that raw package requires a separate sample-data review. This publication contains no customer records or sample PDF attachments.

**IT reading order:** CLAUDE → this section and this MASTER's canonical measurement/component tables → Orders/Purchasing MASTER → COPY-STANDARD → supplied source package. Use the resolved values below for every shared size. Reuse Portal React components and `/ui`; prototype `carres.*` storage, embedded CSS, sample task/Unit engines and private check script are not application code to port. A prototype TEST label proves neither existence nor absence of backend functionality. Git history holds old specifications; do not create a second kit.

## Current shared template · owner adoption 30 Oct 2026

**OWNER-COMMISSIONED IMPLEMENTATION / RELEASE VERIFICATION PENDING.** On30Oct the owner supplied `Sales Order (5).zip` and requested frontend delivery through deployment. This is the ONE current shared visual standard. It replaces earlier conflicting measurements, presentation rules and specimens, including the21Oct baseline. Git preserves history; do not maintain a second kit or versioned MASTER. Desktop uncommitted work remains recoverable and must not be overwritten.

**Source provenance:** owner supplied `Sales Order (5).zip` on30Oct2026 and commissioned implementation through deployment. SHA256 `9f76ec84ff2d3b9d79662bf318ddd6671ed2a4e4281971357bfd7fc8ef49dd6b`; root `UI Kit Update 2026-10-30/`,37 files. This supersedes the24Oct source for presentation. README approval claims remain supplied evidence; the direct owner request authorises implementation. Raw customer/sample data is not published. Build and live verification are recorded separately in Orders MASTER.

**One shared appearance, no personal themes — owner23Oct, reconfirmed24Oct.** Keep the shared blue selection and latest palette below for everyone. The included `carres-theme.js` still contains the retired nine-theme/per-person/localStorage machinery: do not port or restore it. No Settings personal-theme chooser. This source residue does not reopen the owner's decision.

**Precedence:** this measurement table owns the changed visual roles. Unchanged shell56/navigation64, source ownership, module permissions, fields not re-ruled below, PDF content/version rules and §2.2 accessibility/error/draft contracts remain. Table header40 (maximum two lines,11/600 uppercase,.04em) replaces32; table rows are minimum44, not fixed44. Card/section title11/700 replaces15/500 for that role;15/500 is the Now step. Panel340 for Tasks replaces both the332 outer/320 inner recipe; do not add old wrapper widths. Quick card/History560, card8/page-panel8/button6/table-frame8 replace their earlier roles. Viewport clamping and touch hit areas remain; content fits inside the panel rather than expanding it.

### Template 1 · Type (size / weight)
| Use | Size | Weight | Colour |
|---|---|---|---|
| Page / record title | 20 | 600 | #111827 |
| Now line step | 15 | 500 | #111827 |
| Body, values, row line 1 | 13 | 400 / 500 | #111827 |
| Row line 2, labels, notes | 12 | 400 | #5F6672 or #6B7280 |
| Status pill text | 12 | 500 | pill colour |
| Card / section title (CAPS, .08em) | 11 | 700 | #374151 |
| Table header (CAPS, .04em) | 11 (10 allowed) | 600 / 700 | #374151 |
| Avatar initials | 11 (10 in 18–20 px avatars) | 500 / 600 | white on the Shell avatar palette (staff) · #4B5563 on #F1F2F4 (outside party) |
Icons (Material Symbols 16 / 18 / 20) are not text and are not counted.

Field labels (cards, quick cards, PDFs) = Title Case, the template's words (SO Doc Date · Proceed Date · Sales Location · Customer Original Delivery Date · Customer Confirmed Delivery Date · DO Date · SO No). Table column headers = CAPS. Sentences and notes = sentence case.

Document numbers: prefix + date with no dash, then "-" + running number — DO261024-0001 · PO260928-0004 · GRN261008-0001 · PR / RO / DR / CO / TR the same (Jess 24 Oct "DO after no dash, same for all docs"; matches MPR CR261014-1234). Old sheet numbers (PO/2607-035) keep their original form.

### Template 2 · Colour
Ink #111827 · body #1F2937 · grey #374151 #4B5563 #5F6672 #6B7280 #9CA3AF · lines #E5E7EB #F1F2F4 #D5D9DE · white · navy main button #1B1B39 · blue selected #2F55E0 / #DCE6FD / #EEF3FF.
Avatar palette (Shell, one colour per person): #6B7A8F #7A6A58 #5E7D6E #8A6670 #6A6F9A #8C7A4E. Shared soft selection #E8EFFE.
Status only inside pills / icons: green #E7F6EC / #1E7A40 · amber #FBF0D6 / #7A5A00 · red #FDE8E6 / #B42318 · grey #F1F2F4 / #374151.
Red = we are late. Amber = waiting on someone. Green = done. Grey = not reached.

### Template 3 · Shapes
Card/table/Tasks-group radius 8 (page panels 8) · segmented tab track 10 (UI Kit) · pill 999 · avatar / step dot 50% · button radius 6 · table frame 8.

### Template 4 · Sizes
Button 32 high (icon button 32 × 32) · status pill 22 high (20 inside dense rows, 18 for the Now tag) · avatar 32 (Now line) / 22 (card row) · step dot 22 · table header 40 · table row ≥ 44 · card row ≥ 36 · column gap clamp(8 → 16) by width.

Side panels: quick card (Module Card) 560 wide · History 560 · Tasks 340. Content inside a panel fits its width; never widen the panel to fit content.

**Sales Order document layout:** record facts take2/3 and the existing official PDF preview takes1/3 of usable content. Stack when the content is below820px. The PDF card has zoom out/percentage reset/zoom in/fullscreen; Escape leaves fullscreen. Preserve historical stored documents, pending-amendment warning, unsaved watermark and saved-data Print/Download. A preview never changes a document or business result.

### Template 5 · Row grammar (cards, Order Route, Tasks)
`[tick 20] [avatar 22] step (13/500) + one fact (12 grey, one line) | date or Due (13) / red Late pill (right 104)`
One "Now" per page. "What if" rows only when they happen. Missing value = nothing (never "Not recorded").

### Template 6 · Buttons
Text button = box 32, radius 6, 1px #D5D9DE, white; one navy main per page. Icon next to boxed buttons = same 32 box. ← back = 32 round outlined. Stand-alone icon (✕, card ▥ / ⋮) = round, no box.

### Template 7 · Route line (Order Route top)
Ops §4 Journey steps 2–10, same for every order. Done = green ✓ dot · current = solid blue dot · not reached = grey ring · optional = grey "–". Under a done step: its result as the label (NETS assigned, Received 4/4). Under the current step: one pill (amber Waiting / red Late nd).

### Shared quick-card composition — current source

Use existing CompactModuleCard/Drawer,560px wide clamped to viewport; dark identity header#1F2937,56px high,padding0 16px 0 20px,close at right,one20px left content alignment. Header identifies the actual document type and its source-owned status, not a hardcoded SO/customer identity. Codes104–108 and numeric columns52–64 are supplied starting widths inside this panel; adapt wrapping/contained scroll to fit rather than widen it or hide exact identities. Keep fields and pills from Template1–6, remove repeated identical facts, preserve full-document/evidence/action doors and retained return context. No prototype CSS or sample state engine is imported. Older removal of a dark-header `/ui` specimen does not retire this newly supplied composition. Runtime parity is not established.

### Reconciliation and limits — current implementation

| Item | Current resolution |
|---|---|
| Missing values | Leave the missing value empty on lists, records, cards, quick cards and generated document fields. Retire `Not recorded` and dash placeholders for absence. Keep a field label where needed. Failed read, no access, missing required input and missing setup must still be explicitly explained; blank is not a successful read or permission result. Factual states such as `Not received` and `No PO yet` are not empty-value substitutes. The optional-step dash is permitted only as the explicit not-applicable Journey marker. |
| Colour and date meaning | Red Late applies to Carres work past its governing deadline; amber Waiting applies to waiting on another party. A past calendar date alone does not prove either. Customer postponement is an arrangement fact, not `Ready to deliver`. The supplier's amber past-date fix is not proof that all late states are amber. Status semantic colour stays in pills/icons; ordinary text retains the type palette. |
| Number shape | Adopt prefix immediately followed by the governed date, one hyphen before the serial, and no hyphen after the prefix, e.g. `DO261024-0001`. COPY owns the cross-module spelling. Preserve stored identities, issued history, old sheet numbers, supplier references, Unit IDs, revisions and links. Examples do not authorise replacing permanent records or changing random/sequential allocation, prefix families or privacy/business partitions. Those allocator questions remain under the owning numbering authority; no allocator change is commissioned here. |
| Order Route | One Journey overview line and party-oriented Overview cards (Purchasing/Supplier, Warehouse, Logistics, Payment). Goods lineage remains per source line/PO/receipt/Unit, available within the relevant party card and Map/Documents. No second GOODS overview band duplicating the party cards. Parallel work remains parallel; one Now highlights the next recommended focus, not a global execution gate. Detailed Orders/COPY reconciliation below preserves source writers. |
| Journey source | The supplied template's `const J` contains nine displayed slots for Ops§4 steps2–10: PO sent/From stock; Logistics; Supplier; Goods; Early offer; Date; Payment; DO; Delivered. These are display slots, not a business dependency algorithm. The actual Ops§4 document is not in this package; its exact business wording/admission remains UNKNOWN. Do not port `its.every`, array-first-false, prototype dates/ETA or fabricated delivery booleans as truth. Done/current/optional come from owning saved facts. Early offer is conditional, never always skipped. |
| No confirmed date at D−1 | Existing Delivery assignment/contact/calendar and DO issue rules continue: show the missing confirmed date as open work under the existing PIC/assignment and preserve the last actual agreement. Never invent a confirmation, auto-cancel, auto-waive a hold, mark Failed Delivery before a real attempt, or release goods. No new D−1 escalation/penalty/cut-off is approved by this package. A new policy, if required beyond existing rules, remains an explicit unresolved business decision. |
| Checker discrepancies | `carres-template-check.js` checks only visible descendants of `main`; it skips previews and hidden/unmounted states and deduplicates failures. Its allowlists admit20/700,13/600, extra12/11 weights, extra colours, and button heights18/20/22/24/26/28/36/44. Those allowances do not create approved roles. Treat the supplied Spec's role table as authority; align checks to roles before claiming full conformance. Shell, overlays, quick card, record, History, Tasks and PDFs require their own applicable review. |
| Colour coverage | The Spec does not assign a new page-ground role; retain the prior approved ground#FAFAF9 pending explicit owner correction. The checker/source also include#F6F7F9 and other unassigned fills; their presence does not silently change the ground. Preserve their identity as unresolved source values, not new token law. |
| Runtime reuse | Use existing Button, StatusPill/Badge adapter, Block/CompactModuleCard, DataGrid/ItemRows, Drawer/DialogFrame, Icon, History and route host. A generic Avatar/Stepper is not proven by this export; admit a real shared gap in this same kit and `/ui`, never port page-local CSS/storage/task engines. |

Design owns the complete specification and integrated preview review. IT copies/adapts suitable source to that confirmed design, integrates the backend, tests and verifies release. This PLAN publication changes governing documents only. Receiving PR#2111 remains an independent lane.

### Page inventory and interaction contracts

| Source screen | Views / object doors | Handoff behaviour to implement through existing kit |
|---|---|---|
| SO Batch Purchase | To buy / Ordered / All; supplier/SO/category grouping | Review POs selection; every PO opens the shared PO record with return context; no private PO register/task source |
| Forecast Purchase | Suggested / Ordered / All | New stock request opens RS/MPR; ordered rows link request and PO; archived forecast approve/issue code is unreachable and must not be ported |
| Manual Purchase Request | All / Need approval / Need PO / No PO needed; create / record / Review POs | Proceed date first; expanded goods/spec/quantity/stock/destination/PO; create header Cancel, Send for approval, more-last/Clear the form. Production approval logic remains IT-owned |
| Purchase Orders | Open / Received / All; Overview/Purchasing/Warehouse columns; PO/Route/Revisions/History | Half-pane table target: Item / SO-MPR / Received n/m; GRN/date/site/pieces/claim links; exact-version PDF; Unit/GRN/current state; Route due/next information folded into Steps, not lost |
| Receiving | Not received / Received / Differences; Check in / exact GRN | Not received due-first and pending goods/Unit expansion; counts this delivery; existing source correction/claim links; CO and repair GRNs share register, no duplicate identity |
| Supplier Claims | To do / Waiting / Closed / All; grouped list / exact claim | Choose Unit → record request/sending → supplier reply → next disposition → owning Return/Repair → closure. No external transmission or backend outcome inferred from prototype click |
| Purchase Returns | To do / Waiting / Done / All; create / exact PR | Send, pickup-date confirmation, actual pickup, supplier receipt. Pickup prototype is a Warehouse stand-in; no fake completion |
| Repair Orders | To do / Waiting / Done / All; create / exact RO | Issue, supplier receipt, pickup, supplier reply, Receiving return, inspection; reported +14-working-day target is module rule evidence, not new approval here |
| Showroom | Display Requests / Consignment Orders / Consignment Returns | Reply/issue/request; CO send/check-in→shared GRN; CR partial handover preserves remainder; Inventory move remains stand-in |
| Workspace / Tasks | To do / Waiting / Done; My Task / Team Work | Same source-owned task/action, exact record link, retained return context; action opens on owning record. Complete only from persisted owning result; opening a page/channel is not completion |
| Partner Coming In | Klang phone check-in | Repair returns shown; not evidence that every showroom or Warehouse screen exists |
| SO / DO readers | SO Items / DO Goods | Read the same Unit lineage. Missing link is shown honestly; sample adapter is not backend allocation logic |

Shared states: row hover#F3F4F6; link hover#3965FA; keyboard one table Tab stop, arrows, Enter; loading placeholders; explicit empty sentence; error keeps dialog/draft; save only closes after persistence and records actor/time/history; record-not-found names exact requested identity; back retains list context. Do not invent server permission/persistence from prototype. Reference+record version, actual actor, duty owner and company are distinct facts.

### IT implementation and evidence boundaries

The14 export PLANNER rows are resolved in Purchasing MASTER's design table; presentation updates do not alter business law. Design claims page-by-page owner review; this intake verifies files and compares source, it does not independently certify every approval date, screenshot, journey or size claim. Source conflicts on table height, wrapper dimensions and disabled clicks are resolved above. Apply the one baseline; do not reopen settled values or ship competing skins.

Papers: Carres-owned PO/SO samples are supplied references; they are not publicly republished here. Official PO/GRN/Claim/Return/Repair/CO/CR must use `docs/pdf/DOCUMENT-KIT.md` and owning PDF specification; sketches cannot replace versioning, file generation or price/content policy. Settings/approval screens present in prototype do not undo Jess's development-first sequencing. No runtime component changes, SQL, real-account access changes or application deployment are part of this docs publication.

---

## Start here · the one Master UI Kit

**Narrow contextual panels — OWNER-APPROVED TARGET / NOT BUILT, Jess 2026-10-17.**
For the shared module-page layout below1100 CSS px, temporarily use the64px menu regardless of
whether Tasks is open. Keep the64px compact rail under the21Oct shared baseline; preserve page context when navigation opens or closes. Summary and Tasks open on demand as overlays over the main content,
not columns that subtract from its available width. Keep Summary usable body264; Tasks uses the24Oct340px panel contract and
shared component appearance; use the existing Drawer/overlay focus, close, Escape and unsaved-work
guards. Opening/closing or switching panels must not discard draft inputs, selection, filters or
scroll position. Do not automatically reopen a prior Send PO task over a new form. Normal wide
panel defaults are unchanged; Workspace's own task/pick-list layout remains separately governed.

The underlying toolbar stays36px, one line, with every existing action reachable and its view
name retained. Do not adopt the prototype72px/two-row fallback, hide business controls or shrink
text to force fit. The ordinary close/hide doors return to the unchanged page. This approval
resolves the recorded1025 menu/Summary/Tasks fit proposal; it grants no business action or new
permission. This is a shared Shell correction, not a per-module layout. Implement and verify its
actual fit; owner approval of direction is not proof all1025 states now fit.


- **New chat: execute, do not guess.** Read this MASTER's [filled measurement checklist](#kit-measurements) and this MASTER §2.2's UX contract before touching UI. For the parts being built, name the approved value, trigger, existing component and `/ui` example. Mark CONFORMS / DEVIATION / NOT APPLICABLE in the existing handoff; a missing value is UNRESOLVED, never an implementation value promoted to law. Do not create another guide or tracker.
- **Rules:** this MASTER: values → components → page compositions; COPY and module MASTERs keep business ownership.
- **Practical reference:** the approved Sales Order Outright v12 direction, improved in existing shared components; no fresh redesign or second kit.
- **Local catalogue:** `/ui`, implemented by `apps/web/src/pages/dev/UiShowcase.tsx`. The coordinated developer serves it at `http://127.0.0.1:5415/ui`; an address is a local session entry, not permanent hosting or proof of acceptance.
- **Next page:** configure the existing shared parts, fix only the relevant defect, remove its replaced old presentation, continue. A kit-document cleanup is complete without an application deploy; full-Portal adoption is a separate deliverable.
- **Pending decisions:** use §7.2/§7.4 and the existing handoff. A proposal cannot silently override approved values; one pending choice does not reopen the entire kit.

## Owner handover · 15 Oct 2026 · one Carres-owned kit

**APPROVED direction (Jess, `Audit UI kit workflow`):** Carres owns and maintains this existing
kit. Claude Design supplies visual proposals; it does not define business rules, permissions,
record ownership or completion. Retain the approved resolved values in 01 and decisions below;
this handover approves no new palette, component, workflow or presentation proposal.

**One entry and one rule body:** this file. Its values, components and page-composition parts replace the former 01/02/03 files. COPY owns words; each module MASTER owns its business differences. The runtime families `components/kit`,
`components/carres` and `components/register/DataGrid` are complementary homes identified in 02;
folder count alone is not evidence of duplicate kits. `/ui` must show the actual consumed components.
Design exports and old screenshots are evidence only; their filename or arrival never silently
changes approved law. A later explicit owner ruling supersedes only its stated scope.

**Authority reconciliation:** baseline read at `origin/main` `3ee517b20` (15 Oct 2026). The Desktop
`desktop-main` checkout contains uncommitted 9 Oct v4/v8 documents and Appearance/theme code that
conflict with this baseline. They are preserved work, not a new approved standard. Do not deploy,
overwrite or migrate from them blindly. Reconcile unique work against current authority before
adopting it; preserve recoverability before removing superseded content. Git is the history;
never create another kit MASTER or versioned guide. This note does not claim those drafts removed.

| Active chat | Responsibility | Boundary |
|---|---|---|
| Audit UI kit workflow | Kit authority reconciliation and one consolidated adoption/retirement inventory | Coordinate shared-file ownership before edits; no competing application migration |
| Create Claude design checklist | Explain unresolved business/presentation decisions to Jess and record actual rulings | No separate kit or duplicate implementation; do not re-ask settled decisions |
| Deploy PR #2083 and verify UI | Existing implementation, functional delivery and release proof | Continue independent authorised work; retain one shared implementation per purpose |

**Bounded execution:** use the existing completion table in
[`../handoff/CARRES-CONTINUOUS-BUILD-HANDOFF.md`](../handoff/CARRES-CONTINUOUS-BUILD-HANDOFF.md),
not another tracker. Each change names its defect, shared implementation, affected consumers and
done evidence. Reuse passed evidence for unchanged code; repeat checks only for a relevant change,
failure or unresolved material concern. Documentation-only reconciliation needs link/diff review,
not another application build or deployment. Required release gates remain in force for code.
Do not let one blocked business decision stop independent approved work.

**Retirement:** confirm replacement capability and its affected consumers, migrate them, verify the
changed scope, then remove the superseded UI implementation and conflicting active references in
the same change. Preserve unique functions, business evidence, pending decisions and recoverable
work. Record remaining consumers in the existing completion table. Never call the whole Portal
aligned because one page or `/ui` passes. This document establishes one authority; implementation,
retirement and authenticated verification remain separate deliverables.

---

**One rule document — internal parts and external business authorities:**

| Thing | Its one home |
|---|---|
| Numbers: type, colour, spacing, radius, icons, component and template measurements | [`../01-design-tokens.md`](#kit-values) (§7 is the measurement lookup) |
| Component API, use and states | **the one kit, in code** (owner 14 Oct 2026): `apps/web/src/components/carres/` (the v12 parts: table cells, pills, toolbar, side panel, the one menu `CPopover`/`CMenu`, `MIcon`), `components/kit/` (Button, fields, Modal, Drawer, Tabs, states, documents, Working Panel, task parts) and `components/register/DataGrid` (the one listing engine), all shown on live `/ui` with how many pages import each; [`../02-components.md`](#kit-components) describes them |
| Page-pattern examples (Register, Object, Task, Form, Card, Batch, Settings) | [`../03-page-patterns.md`](#kit-patterns) |
| Every visible word | [`../COPY-STANDARD.md`](../COPY-STANDARD.md) |
| The compact module card's rules (the Working Panel's card contract) | [`../ui-reference/MODULE-CARD-TEMPLATE.md`](../ui-reference/MODULE-CARD-TEMPLATE.md) |
| Module column orders, business facts, permissions and write doors | each module MASTER |
| Printed documents | [`../pdf/DOCUMENT-KIT.md`](../pdf/DOCUMENT-KIT.md) |
| Reference research (FACT, binds nobody) | [`../research/houzs-ui-reference.md`](../research/houzs-ui-reference.md) · [`../research/grid-findings.md`](../research/grid-findings.md) |
| Shared page flow, shared contracts, exceptions and the status of every shared capability | **this MASTER** |

**Current shared UI target — owner, 12 Oct 2026, 5:35 PM:** the folder
`design_handoff_sales_order_ui_kit` handed over that afternoon replaces every earlier kit
value through the existing 01 / 02 / 03 and this MASTER; the earlier specimen folders are deleted. The
specimen lives at `docs/ui-reference/sales-order-design/`; tokens mirror at
`docs/ui/carres-tokens.css`. The canonical resolved values are in 01, including 01 §10 where the
supplied files disagree with each other; the specimen is not another kit document.
Its README, flows and Layout Standard are supplied material, not independent approval of business
law. Where the package conflicts with COPY-STANDARD or a module MASTER, its value is PROPOSAL / NOT LAW
(01 §10, §7.4 here). Its sample pages run on TEST customer details because the repository is public;
the designer's Ops Rules are not stored.
The shared visual target covers shell/menu, one shared table, controls, object facts, Tasks, Route,
Timeline, the one shared appearance and density, checked on Sales Order and Purchasing. Modules supply
their own identities, columns, authorised actions and source facts.

**How design and IT work — owner ruling 22 Oct 2026 · APPROVED / LOCKED.**
Design and IT proceed in parallel. This replaces the earlier responsibility split; the current
confirmed baseline in this MASTER governs appearance, rather than a frozen old specimen version.
Claude Design and module design chats own the complete UI/UX proposal, approved specification and
preview review. IT/Code owns Houzs source reuse/adaptation, application integration, backend tests
and release verification. Design does not duplicate IT's backend implementation or test campaign.

Reuse the completed Houzs research. IT records the inspected source/version, reuse rights,
dependencies and Carres adaptations before adopting source code. Houzs reuse does not replace
Carres Unit identity, stock arithmetic, ownership, permissions, approval or document rules. Design
exports' simulated storage/tasks and business examples remain specimens, not proven backend code.

Design may inspect existing code, API facts and evidence read-only to make the design workable;
it names business/interaction gaps for the owning IT lane. Backend correctness is still required:
IT owns persistence, access refusals, stock/GRN consequences, partial results, duplicate submission
and failure recovery. Review existing evidence and rerun checks only for changed or unresolved
behaviour; a design-only change does not require another backend test campaign.

Before release, the same integrated journey is checked for design conformance and correct saved
results: design reviews the actual UI and IT proves the owning data/document/stock outcomes.
Record design approval, implementation, backend verification and production verification separately
in the existing module MASTER/handoff. A preview, copied code or updated specification proves none
of the other states. Existing scope, SQL/security approval and release gates remain in force; this
work split does not commission a paused PLAN chat to build or deploy.

```
ONE KIT        The Portal's own components (apps/web/src/components/kit, components/carres) and
               their live /ui page ARE the UI kit. Design files (.dc.html) show content and flow
               only; their styles are never copied and never prove that something works.
ONE WORD LIST  COPY-STANDARD. The designer's Layout Standard does not repeat words.
ONE CHECK      carres-check.js lives in this repository and runs in CI on the kit pages at
               1025 / 1164 / 1440. Design uses the same file, never a private copy.
ONE CHANGE     A shared part changes once, in the kit, with its /ui example; every module gets
               it. A page never draws its own copy of a shared part.
```

| Who | Does |
|---|---|
| Owner | answers business rules · says yes / no on the preview, then on live · passes design's files to Code |
| Design | uses the current confirmed baseline, Blueprint and kit · specifies complete page interactions/states and facts · updates this MASTER/shared rules and owning module truth · checks the integrated preview; no duplicate backend test campaign |
| IT / Code | reuses suitable Houzs source and existing Carres capabilities within the commissioned scope · adapts shared components once · owns backend/integration tests and release verification · reports PR, integrated preview, live commit and `example · expected · seen · PASS/FAIL` · resolves engineering mechanics and names genuine authority conflicts |

**Each commissioned journey:** design specification and IT reuse/integration progress in parallel → CI (applicable tests · carres-check · screenshot compare) → integrated preview
URL → design checks the preview → owner yes → merge → deploy → Code checks live, read only → owner
accepts → next page.

- **Screenshot baselines.** When the owner approves a page, its screenshots at 1025 / 1164 / 1440
  are stored in CI, taken from fixture previews so a picture changes only when the code changes.
  Any visual difference fails CI and blocks the merge until the new picture is approved: the PR
  that changes a baseline shows before and after, and approving that PR approves the picture.
- **Preview URL first.** Every PR is deployed to its own preview address before it goes live. The
  preview reads real data, so it is checked read only (no Save, no Send). A change to the API or the
  database previews its web part only; the server part is checked on live after merge, read only.
- **Order.** Sales Order Outright → SO Batch Purchase → then one by one down the side menu.
  Workspace, Tasks and Forecast Purchase are approved and live; each is checked when its turn comes,
  not rebuilt. Forecast/MPR implementation is authorised by Jess on17Oct2026 under Purchasing §5.2;
  the approved checklist governs its scope. Prototype evidence is not deployment or verification.

Status 15 Oct 2026: Sales Order Outright page 1 is DEPLOYED (#2066, `41bc9a6d3`); production read on
15 Oct: `carres-check.js` PASS at 1025 / 1164 / 1440 with Summary and Tasks in each state, no
sideways page scroll, the footer words and four Supplier examples as built. The rules are APPROVED. BUILT: the per-PR preview (`.github/workflows/preview.yml`,
PR #2063) and the screenshot baselines (`e2e-kit/kit-baselines.spec.ts`, 45 pictures, PR #2064; the label
`update-baselines` retakes them). `carres-align.js` (design's fingerprint of the shared parts, 14 Oct) lives
beside `carres-check.js`; the Sales Order kit check compares it with v12 in every state. `/ui` shows only the v12 kit parts the pages use (Carres Table and its
item rows and footer, side panel, toolbar parts, cells, pills); a part a page still draws itself joins
the kit when that page's turn comes. No second MASTER, page-local kit or versioned standard is created.

**Law order:** Business Rules → Information Architecture → Design System → Implementation; on a
conflict Business wins. Current target token values are defined in 01; existing component internals require migration to that target. Composition inside the
admitted templates is the chat's job. A missing component or template capability is a **KIT GAP**:
it joins the kit once, with its `/ui` example, and every page gets it — never a page-local copy.
A rule that exists only as documentation is temporary: it should become a type, a lint rule or a
failing test.

**Status words used in this file:** `APPROVED / LOCKED` (owner ruling, in force) ·
`APPROVED TARGET / NOT BUILT` · `BUILT` (merged code) · `DEPLOYED` (merged and released) ·
`PRODUCTION VERIFIED` (authenticated production evidence recorded) · `PROPOSAL / NOT LAW` ·
`REAL GAP` (no answer, or two current answers conflict) · `KIT GAP` (the kit lacks it). Approved is
not built; built is not verified; one page verified is not every page adopted.

---

# §0 · Current kit index — read this first

**Current reuse inventory:** entries mix current shared implementations and remaining adapters. Use the named source, 02's runtime directory and each row's scoped status. Appearance comes from 01; source existence is not whole-page adoption. Historical names below never override a later retirement.

**One row per thing on screen; one current source per row.** If something is not in this table it is
not a current pattern: do not copy it from a neighbouring page. Live examples are on `/ui`.

| Area | Use this | Source | Status |
|---|---|---|---|
| Tokens: type · colour · radius · icons · layers | Tailwind token classes; `Icon`; `overlay-layer` | `01-design-tokens.md`, `tailwind.config.ts`, `components/kit/Icon.tsx` | Existing component built; current visual migration owed |
| Page frame | `ListPageShell` today; kit `PageShell` is the target | `components/ListPageShell.tsx` · `components/kit/PageShell.tsx` | Moving a page onto `PageShell` re-lays it out: owner preview first |
| Page header + global utilities | `ShellHeader` (shell-drawn; `ModuleHeader` names the page into it) · search pill · `TeamButton` · bell | `pages/operation/components/` | §4 · template 2026-10-08 · built on branch |
| Portal navigation | `PortalSidebar` + `portal-nav` (six groups, one shared menu) | `pages/portal/` | §4.2 · template 2026-10-08 · built on branch |
| Contextual summary / legacy mission rail | Current source-summary composition; existing FilterRail adapters only for retained module contracts | 02 shared adoption map · `pages/operation/components/workspace-rail.tsx` | Current appearance in 01 §4; source semantics in §6.1 and owning module. `SalesOrdersRegister.tsx` is retired (§7.7), never a live reference or extraction target. |
| Register / listing | `register/DataGrid` — the one listing engine; every list in the Portal passes `appearance="reference"`, Sales Order Outright included since 15 Oct 2026 (`carres/CTable` deleted) | `components/register/DataGrid.tsx` | §6.0 · §6.2 · built. The engine draws the v12 table for every list (header band, 10 between columns with 14 at the edges, ▸ before ☐, 24 round chevron; the current40px two-line header) and keeps Export and Columns in its one ⋮ Page tools menu. A page that draws its own v12 toolbar row passes `hideToolbar` and opens Columns from its own ⋮ (`openColumns`); `fitContent` widens a column to its longest value (01 §5); `expandable.frame` draws the opened row's one frame (used by Outright; §7.2) |
| Goods expansion | `GoodsMiniTable` + connector | `pages/operation/components/GoodsMiniTable.tsx` · `ConnectedSections.tsx` | §6.9 · built |
| Simple and document tables | `DataTable` · `DocumentTable` · `TotalsSummary` · `TableScroller` | `components/kit/*` · `components/TableScroller.tsx` | §3 · built |
| **Compact module card** (the right Working Panel: identity header, Info and module tabs, module summary, editors, Items, Communication, Timeline) | **`CompactModuleCard`** in kit `Drawer variant="compact-card"` — pass the header facts once and each module's own facts, editors and items | `components/kit/CompactModuleCard.tsx` · contract `docs/ui-reference/MODULE-CARD-TEMPLATE.md` (old dark-header `/ui` example removed by owner direction 15 Oct 2026; component retained for existing consumers, not a current visual specimen) | §4.3 · shared component built · Sales Orders adoption PRODUCTION VERIFIED 2026-10-05 (PR #1893/#1896/#1897, `2ce91e2d`) · embedded presentation DEPLOYED (PR #1926, `dc631e1a`, production SHA verified 2026-10-05; owner review owed) · other modules per §4.3.4 table |
| Object header + tabs | `SalesOrderTabs` recipe | `pages/operation/SalesOrderTabs.tsx` | §4.1 · accepted; page-owned — no generic ObjectHeader/ObjectPage kit API (KIT GAP) |
| Object facts | `Block` — the one card · `Panel` · `StatusPill` · `EmptyState` · `Loading` | `components/kit/*` | Existing component built; current visual migration owed |
| Forms | `Input` · `Textarea` · `Select` · `SearchInput` · `Checkbox` · `DatePicker` · `FieldFrame` | `components/kit/*`, `field-recipe.ts` | Existing component built; current visual migration owed |
| Buttons and menus | `Button` · the one pop-up `CPopover` (a menu: `CMenu` with items as data, or `CMenuItem` rows; a small panel: filter, calendar, links) · `Tooltip` · `Tabs` (segmented) | `components/kit/*` · `components/carres/CPopover.tsx` | DEPLOYED. `DropdownMenu` (#2070) and kit `Popover` (#2072) retired 15 Oct 2026 (a test blocks their return); inside a dialog `CPopover` opens within it |
| Dialogs, documents and evidence | `Modal` · `Drawer` · `Toast` · `PdfPreview` + `PdfPreviewHeader` · `SavedEvidenceViewer` | `components/kit/*` | §4.4 · built |
| Work route pieces | `RouteStop` | `components/kit/RouteStop.tsx` | §3 · built 2026-09-28 · drawn by the Repair Order record. `ChecklistRow` and `QuietRouteRow` were drawn by no page after the Workspace rebuild (13 Oct 2026) and were deleted 15 Oct 2026, with the unused `Card` (Block is the one card) and `GridToolbar` (the list engine draws its own selection bar) |
| Orders list / drawer band | `SectionPanel` (cream band) — that surface only, not a general card | `components/SectionPanel.tsx` | Not a `Block` duplicate |
| Communication card under a task (Workspace page) | `WorkCommunication` — recorded channels only | `pages/operation/work/WorkCommunication.tsx` | Built; on branch `build/workspace-v3` it is drawn under the one task view (Workspace MASTER §5.10); differs from the card's editable `To` (§7.2) |
| Record history | §5.2 three-rank grammar | this MASTER | LOCKED · no shared component; each page draws it |
| Tasks and quick reference | Existing Work/Tasks host; `OperationRightRail` for existing quick capabilities | `pages/operation/work/` · `pages/operation/components/OperationRightRail.tsx` | §5 · supplied target has a collapsible Tasks region; Calendar/Activity capability retained, unresolved placement stays explicit; runtime adoption not verified |

**Retired — do not import; a test blocks new use** (`components/retired-components.test.ts`): `Btn`
(→ `Button`), `Field` (→ kit inputs / `field-recipe`), `PageHeader` (→ `PageShell`), `kit/DropdownMenu`
(→ `CMenu`, deleted 15 Oct 2026). Their remaining
pages move only after the owner approves a before/after preview, because each swap changes what the
operator sees. The `carres-design` skill, the old `ui-reference/` mocks and the Delivery-only card
reference are deleted; `docs/ui-reference/` holds behaviour evidence for the compact card and the current imported Sales Order specimen. Neither is a second standard.

## §0.1 · Page anatomy — the table of contents

**Not every module has, or must show, all six parts.** A module shows the parts its job needs; a part
it does not use is stated as not applicable, with the reason, never treated as a defect or invented.

| Part | Its job | Where the law is |
|---|---|---|
| **Shell** | where am I · global tools · navigation · quick reference | §4 header, toolbar rows, Settings, Jump to, toasts · §4.2 portal navigation · §5 right Quick Rail |
| **Left mission rail** | what work needs doing here; scope the records | §6.1 |
| **Listing** | find and compare records | §6.0 one-page template · §6.2 capabilities · §6.3 Columns and cross-module facts · §6.4–§6.11 detail |
| **Working Panel** | do the record's work without leaving the list | §4.3 + the card contract |
| **Object page** | the full record: View, deliberate Edit, Revisions, History, Route | §4.1 |
| **Document preview** | the document the other party receives | §4.4 |
| **One UX contract** | words, states, feedback, keyboard, narrow screens, acceptance | §2.1 · §2.2 · §5.1 · §5.2 |

## §0.2 · Shared module page flow — owner ruling 2026-10-05 · APPROVED TARGET

Jess: the left rail shows the mission, not a reproduction of the table; every module uses the same
table listing with different columns; every module uses the shared right Working Panel, with different
module tabs and the Info structure retained as in Sales Order. Warehouse work uses a `Warehouse` tab.
(Persisted by PR #1918, `1b43419e7`.)

```
module entry → left mission rail → one shared listing → right Working Panel (Info + module tab;
             opens on the current page's own main work tab)
             → the module's action and result → return to the list with its context retained
```

- **Left mission rail** (§6.1): tells the operator what work needs doing from source-owned task or
  mission facts. It is not a copy of listing columns and not a summary of whatever the table loaded.
  It may scope the records through governed navigation or filtering. Reuse the existing source and
  resolver authority; never a second task engine, ownership resolver or completion counter.
- **Listing** (§6.0, §6.2): one shared DataGrid and one interaction contract. Modules differ by record
  grain, default columns, optional columns, data, business filters, permissions and actions — never
  by a module-local grid or an invented layout.
- **Right Working Panel** (§4.3): the shared Sales Order-derived `CompactModuleCard`. Keep its Info
  structure and interaction grammar; add the module's own tab with source-owned facts and actions.
  The panel opens on the current page's own main work tab (owner 2026-10-05, §4.3.1).
  Never fabricate Sales Order or customer facts for a record whose source has none. Reusing the
  structure never transfers write ownership.
- **Completing work:** the module's authorised work happens in its tab, with the existing approved
  editors, preview and save/result interactions. Preserve source identity, exact goods/document
  scope, permissions, saved-versus-draft and the list's return context.
- **The Working Panel never replaces** the full object page (§4.1), its read-first View, its
  deliberate Edit, the PDF preview (§4.4), Revisions or History. Their approved roles stay until Jess
  changes them; this flow is not permission to auto-edit, remove document pages or change gates.
- **Exceptions:** when a genuine business constraint cannot fit this flow, the chat proves it with
  evidence and brings a concrete alternative with its impact (§0.3). Never force the pattern blindly;
  never invent an exception silently. A different UX needs Jess's approval.

**Adoption acceptance:** compare the actual module page top to bottom against the Sales Orders
reference at the operator's viewport and a narrow layout. Verify the mission source independently of
table loading/filtering, the listing interactions, record-to-panel opening, Info and the module tab (the page's main work tab selected on open),
authorised edit/preview/result, source scope and retained return state. Record verified and missing
coverage per module (§4.3, §6.1). Tests or shared-component imports alone do not prove adoption.

**Current SO composition exception — owner 9 Oct 2026:** the supplied Outright list opens the full SO on row click, with Sales Order / Order Route / Timeline. Its Summary and Tasks are independently collapsible. In v12 (11 Oct 2026) the full SO opens in the middle in place of the list: Summary and the toolbar hide and Tasks stays. This replaces the previous SO default compact-card opening and visual rail example; other modules’ source-owned work and document doors are not silently changed. CompactModuleCard remains the reusable work/embedded adapter where that purpose applies.

## §0.3 · Every new chat — before acting

1. **State the authority and its version:** this MASTER, the owning module MASTER and COPY entries,
   read at `origin/main` `{sha}`; name the reference instance you compare against (Sales Orders unless
   the module MASTER names another).
2. **Name what you reuse:** the kit components, DataGrid props, card adapter and configuration.
3. **Classify every needed capability** as `SUPPORTED` (§6.2 names the prop) · `APPROVED TARGET /
   NOT BUILT` · `REAL GAP` / `KIT GAP`. A gap goes to the kit owner, never into a page-local copy.
4. **List the anatomy parts that do not apply** (§0.1) with the reason and the operator impact.
5. **When a standard does not fit, write:** Current → Problem → Better design → Trade-off →
   Recommendation (Constitution Law 4). Never make a silent exception; never answer "the MASTER says so".
6. **Ordinary engineering is yours** — files, props, tests, merge, deploy. Only a business rule or a
   change to a locked word, workflow or presentation goes to the owner, through the controlling chat.
7. **Before a design may direct BUILD it specifies:** page purpose, user and entry; template role and
   shell; reference interaction with provenance; ordered regions and each region's job; real
   component per region; the source of every fact, action and owner; primary and secondary doors;
   disclosure/edit/submit/result behaviour; all applicable states (§2.2); narrow, keyboard and long
   content; allowed business differences; known gaps; operator acceptance. A list of arrows is not a
   specification, and a specification is not a working interface.
8. **Conflicts without an owner questionnaire:** the latest explicit scoped owner ruling wins over an
   older generic example. If two current explicit rulings still conflict, record the exact
   consequence as a REAL GAP (§7.2); never pick whichever gives the preferred layout, and never
   rewrite locked values or approved action placement to make a document shorter.
9. **Every number states its trigger** (a documentation convention the owner requested 2026-10-05, not a
   UI rule) — viewport width, grid canvas width, available content canvas
   (after shell rails), card width or pointer type. A number without its trigger is how chats end up
   copying different things; 01 §7 carries the trigger beside each measurement.
10. **Module Settings completion — owner ruling 2026-10-05.** When a module's build is complete, the
    chat proactively offers how to complete that module's Settings: every setting the module needs to
    run, its Settings door, current value or default, which are still empty, and who sets it — before
    calling the module complete. Never wait for the owner to ask.
11. **One combined review for shared UI — owner ruling 2026-10-05 ("agree, tell every chat to align
    with you").** A module chat never shows the owner its own variant of a shared part: Working Panel
    host and tabs, Tasks entries, compact card, row menu or listing kit. It sends them to the chat that
    controls this MASTER, in one message: per page, route · main object · panel host · tabs in order ·
    opens on · ↗ destination · row menu; per Tasks item, act wording · card + tab it opens; any kit part
    that does not exist (named, not drawn); status per item (APPROVED with MASTER § · BUILT with SHA ·
    PROPOSAL with preview + branch@SHA); known conflicts with another module's card. The UI owner
    combines every module into one table and one local preview; the owner accepts once; this MASTER is
    then written and each module writes its own section. Module business rules stay with the module
    chat.

## Find it — this index is enough

| I need | Go to |
|---|---|
| The listing (template on one page) | §6.0, then §6.2 for the capability table |
| The left rail (mission rule, recipe, per-module status) | §6.1 |
| The right Working Panel | §4.3 (rules in `MODULE-CARD-TEMPLATE.md`, numbers in 01 §7.6) |
| Which tab the panel opens on (page-owned main work tab) | §4.3.1 |
| Default page work and `Tasks` (layout under research) | §4.3.5 · §5 |
| Row right-click (ONE ROW MENU `View` · `Print`) and click behaviour per register | §6.7 rule 5 · §6.5 |
| Standalone versus embedded Sales Order card | §4.3.3 |
| Columns and other modules' facts on my list | §6.3 |
| Row expansion | §6.9 (goods tables §6.8) |
| The full object page | §4.1 |
| PDF and document preview | §4.4 |
| Loading, empty, error, denied, feedback, keyboard, narrow, acceptance | §2.2 |
| Every exception, real gap, kit gap and proposal | §7 |
| A number | 01 §7 (§7.5 SO-derived template, §7.6 compact card) |
| A word | COPY-STANDARD |

---

# §1 · Working law for every UI chat

## §1.1 · Production UI Execution Law — owner ruling 2026-08-11

**Production UI is built on proactive design judgment and reviewed on its preview before it goes
live** (owner 14 Oct 2026). The blanket "ASCII mock first, wait for yes" and the localhost "Layout
Approved" hold stay retired for production execution work:

```
BEFORE build   token values, the kit, COPY-STANDARD and the page patterns BIND exactly as
               before. The chat composes within the admitted shared template using its own
               judgment; it does not wait for a layout sign-off.
AFTER build    design checks the PREVIEW against the fix list and v12, the owner says yes,
               then it merges and Code checks live (the flow at the top of this file). A
               later verdict is a normal re-ruling: it changes the next commit.
STILL GATED    a NEW business rule · a change to an approved workflow or ruled word · anything
               the Constitution's interrupt list names. Judgment covers COMPOSITION, never law.
```

When the owner is IN the conversation choosing between options, sketch before code (Constitution
§10). The one approval gate is the preview: building never waits for a layout sign-off, going live does.

## §1.1.1 · The pre-show gate — owner ruling 2026-09-26 · APPROVED / LOCKED

The chat runs this on its own screenshot BEFORE the owner sees a surface. A page that fails a line
is fixed first, not shown. State the six results in one line with the screenshot.

```
1  WORDS      every visible word is in COPY-STANDARD, with its row named; none invented
2  ONE KIT    selection, buttons, status and typography match current 01 tokens;
              condition words remain readable without colour
3  WIDTH      a card wider than 480px with more than three facts lays them in columns
4  ICONS      a record door is the kit's `open` icon with its accessible name, not the word
              `Open …` beside a title
5  REFERENCE  the surface was put beside its reference (Sales Orders Register · Gmail reading
              pane · Linear issue) and every difference is named or removed
6  SELF-RATE  the chat rates its own screenshot out of 10 with the 🔴/🟡 list; under 8 it is
              not shown
```

**Why:** the owner rated a Work rebuild 3/10 after ten review rounds she had to lead herself. Every
fault was visible in the chat's own screenshot first. The owner reviews design; she does not run the
checklist.

## §1.2 · Plan / Design: the UI extension of the start protocol — APPROVED / LOCKED 2026-08-11/13/14

The Constitution's ERP PLAN CHAT START PROTOCOL, its MISSION / CARD / CHAT BOUNDARY LAW and its PLAN
DECISION PERSISTENCE LAW apply unchanged and are not repeated here. For a UI surface the whole-domain
audit additionally includes the four items below. APPROVED / LOCKED decisions are not re-researched,
reopened or offered for re-approval. Governance is not feature freeze: an existing capability is
KEEP, but its placement and presentation bind only where a MASTER explicitly locks them, and a
missing capability may be proposed with its operator value.

1. **Dictionary / IA preflight.** Before ANY proposal, inspect COPY-STANDARD, navigation/IA, module
   ownership, this MASTER, the tokens and the target module MASTER. For every proposed button, tab,
   menu, destination, page, action or Settings entry, name the existing Carres word, owner and
   destination first; check duplicates, wrong module placement, future consequences and missing
   useful capability; recommend **KEEP · IMPROVE · RELOCATE · RETIRE · BUILD** with the reason.
   Extract a short **LOCKED CONSTRAINTS** list (sidebar active treatment · header law · toolbar law ·
   typography · density and row heights · pill/button/tab/filter/dropdown/overflow admission ·
   spacing · width/scroll law · locked column order · capabilities to preserve · retired patterns).
   A conflict with LOCKED truth makes the proposal INVALID before Jess sees it; conflicting
   authorities are reported, never silently resolved.
2. **Eight-lens review** (Loo 2026-08-11) — none skipped: UI Dictionary · Information Architecture ·
   Cross-module consistency · Component/interaction language · Capability gap · Future consequence ·
   Reference translation · Recommendation (KEEP/IMPROVE/RELOCATE/RETIRE/BUILD with reasons). A mockup
   that has not passed the eight lenses is INVALID even when its tokens are right.
3. **Reference function mining** (Jess 2026-08-12) — object-level, not screenshot-level. For the
   unresolved surface inventory every applicable reference capability (workflow, Settings/Maintenance,
   navigation, detail, preview, edit, print, export, search, filter, columns, scan, copy, bulk and
   context actions) as:

   | REFERENCE CAPABILITY | CARRES CURRENT EQUIVALENT / OWNER | KEEP / ADAPT / RELOCATE / BUILD / REJECT | WHY | DEPENDENCY / CONFLICT |
   |---|---|---|---|---|

   Then give ONE evidence-based Carres recommendation, not an A/B/C menu. Screenshots are evidence of
   implementation, never authority over frozen target truth or unresolved placement.
4. **Completion gate** — before calling a UI plan complete, show coverage of: current capability ·
   locked governance · dictionary/IA/ownership · reference mining matrix · mature benchmark where
   useful · gap analysis · cross-module consequences · Blueprint synthesis · dependencies.

Every action remains one structured contract — **owner context + short action + necessary
object/recipient/result + actual working date** (§2.1, §5.1). When the owner approves a complete UI
decision, overwrite this MASTER or the owning module MASTER immediately (PLAN may update governing
documents; it may not implement application code).

## §1.3 · Reference direction — current owner instruction 11 Oct 2026

The supplied Sales Order design (v12), checked against Purchasing on the same template, is the current visual reference. Adapt it through the shared kit, not by copying page-local CSS or its simulated backend. Its full-page SO, Route and Timeline establish the visual family; module content and doors still come from their MASTERs. Houzs and other products may supply capabilities and organisation, but do not become another token authority. Five compositions share one kit: Register, Object, Task, Form and Overview/Settings.

---

# §2 · Shared architecture

| Concern | The ONE home |
|---|---|
| token values | `docs/01-design-tokens.md` · mirrored (never driven) by `apps/web/src/lib/design-standard.ts` |
| the components themselves | `apps/web/src/components/kit/**` (plus `components/register/DataGrid`) |
| the live look | **`/ui`** — public, lazy, its own chunk, so a kit reference never rides the operator's bundle |
| the enforcement | `pnpm --filter @carres/web lint` + the kit source scans + `scripts/check-design-standard.mjs` |

**Current values:** typography, spacing and icon target are in 01. Existing icon meaning IDs and shared component APIs are preserved during migration.

## §2.1 · New-staff operating language — owner ruling 2026-08-20 · APPROVED / LOCKED

**The system knows the process; staff confirm facts, perform the stated act and record the result.**
No surface may depend on experience, memory, WhatsApp history or asking a long-serving employee what
comes next; any authorised cover must be able to resume from the structured facts.

English is the one official language for fields, records, search, reports and documents. Facts,
warnings, actions, validation, empty states and prepared messages use **Primary School Standard
English**: one sentence carries one fact or one act; about 12 words at most where governed terms
allow; actions start with common verbs (`Send`, `Call`, `Ask`, `Check`, `Choose`, `Save`, `Upload`,
`Add`); required business words stay (`Purchase Order`, `Supplier`, `Deliver To`, `Unit ID`, `Invoice`,
`Credit Note`, `Claim`, `Consignment`) with on-demand explanation; never `Process`, `Handle`,
`Proceed accordingly`, `Action required`, `Resolve discrepancy` or `Follow up`; actual dates such as
`18 Aug 2026`, never `ASAP`, `Today`, `Tomorrow`, `T−2`; an error states the failed fact and the act
that fixes it; a button states what pressing it does. Optional `What does this mean?` help may explain
in Chinese or Bahasa Malaysia without changing the authoritative English. Prefer governed choices and
prepared messages over free typing.

An action-capable surface separates the fact from the act:

```
Supplier invoice is missing
[YJ] Ask the supplier to send the invoice by 18 Aug 2026
```

`[YJ]` is a structured owner chip, never sentence text; the action record carries trigger, owner
rule, resolved owner, completion fact, governed date, source object and cover evidence. This law
simplifies execution; it removes no permission, approval or separation of duties.

## §2.2 · One UX contract — states, feedback, keyboard, narrow screens, acceptance

**Truthful states — never mixed, never disguised:**

| State | Required visible behaviour |
|---|---|
| Loading | busy state inside the work surface; toolbar stays |
| Genuinely empty / filtered empty | the two read differently; criteria stay visible with a way to remove them |
| Failed read | `Could not be loaded` + `Try again`; never zero, never "no work", never a completed status |
| Denied / read-only | the restricted action or data is absent; no fake empty, no pointless retry |
| Missing setup | says which setting is missing and where it is fixed |
| Required / invalid | the exact missing item and how to fix it; the same fact in the field and in any summary |
| Upload pending / failed | per-file state, safe retry, source association; no false saved evidence |
| Unsaved / submitting / conflict | valid draft kept; current version explained; no duplicate or silent partial result |
| Success / waiting / partial | the actual effect, what remains and who is responsible next; a toast alone is not enough |
| Historical / document failure | correct version and actor; business success is separate from a failed PDF capture |
| Long content / many records | the full identity is reachable; quantities and actions stay findable; contained scroll |

**Interaction checklist — the same contract, applied through the existing components:**

| State | Required visible behaviour |
|---|---|
| Record navigation | Open the exact record; Back restores list scope, sort, page and scroll. Row click, checkbox, expand and in-row controls remain separate operations (DataGrid and owning route). |
| Viewing / editing | Plain facts until Edit; missing values stay blank under the24Oct template. Starting Edit must not invent values (existing field/property-row adapter). |
| Unchanged / submitting | Save unavailable when unchanged; submitting prevents a second request. Existing owning writer decides success, not a local click (Button and module mutation). |
| Cancel / discard | Cancel preserves the saved record; changed input requires the existing discard decision before loss. Restore the baseline on discard; no write (owning editor and shared dialog). |
| Tab / refresh | Keep a valid draft across tab changes; source refetch must not overwrite an open edit (Tabs and owning draft state). |
| Overlay close | Use DialogFrame focus isolation and focus return. The owning variant decides whether outside/Escape may close; review forms that prohibit dismissal retain Save/Cancel. |
| Keyboard / names | Every action reachable by keyboard; grid one Tab stop; icon-only action has accessible name and tooltip; colour alone never explains a state. |
| Task result | Show the owning module's actual effect, outstanding work and responsible next party. No generic Done; no document preview or toast treated as completion (TaskView and owning module). |
| Document read | Show the exact saved version; loading/error/retry stay inside PdfPreview or SavedEvidenceViewer. A failed PDF read does not reverse a successful business action. |

**Feedback:** use the current 01 §3 Toast: fixed bottom centre, ordinary results3.2seconds; task closure 12 seconds with optional Next and Close, never timed Undo (owner 12 Oct evening). This replaces the older 2 Oct bottom-right/five-second composition. Never put ordinary toasts in document flow. A persistent business blocker
stays an in-page message by the affected surface; field validation stays inline. The listing's three
message kinds are in §6.5. A `Save` is disabled until something changed, and a blocked save names the
gap (`Save changes — say why this date is different`). Editors: one open at a time; a failed save
keeps the input and says why; a refetch never clobbers an open edit (§6.4 C3).

**Keyboard and focus:** every overlay opens by keyboard (tested, not assumed); `DialogFrame` returns
focus to the element that opened it (§3); a grid is one Tab stop (§6.2); icon-only controls have a
tooltip and an accessible name; colour is never the only signal.

**Narrow screens:** the page never scrolls sideways; a table scrolls inside itself; touch targets are
at least 44px; check 1440 / 1180 / 820 / 390 and 200% zoom; nothing (footer, floating control, toast) covers a
fact or an action; the bottom of long content stays reachable.

**Field-operation UI — owner ruling 2026-09-29 (Opit-Warehouse) · APPROVED DIRECTION, validation
pending.** Office staff manage through registers; Warehouse, Delivery and NETS field tasks share one
simple interaction pattern for operators with limited English and computer literacy: show only the
current necessary step with one clear next action; the system supplies party, place, goods, quantity
and the related record; prefer scan or selection over typing; ask for photos where the owning
workflow requires evidence; a problem door captures the observed problem and evidence and office
staff handle the management work. Photos alone never establish completion; Unit/quantity, receiving,
loading, handover and proof rules stay with the owning workflow; loading stays distinct from driver
acceptance. Show the recorded outcome and next responsible party; a failed upload never looks
complete. Schedules open the owning work record; keep established navigation and PDF formats. Validate
receiving, short/damaged arrivals and delivery with the target operators before claiming completion.

**Workflow-guidance acceptance for task pages:** show (1) task/source identity, (2) the current
required check or input, (3) the exact blockers, (4) the authorised next action, (5) the recorded
result, remaining quantity/work and receiving owner. Work/Duties decides responsibility; the owning
business result decides completion.

**Every adopting chat finishes this checklist before saying "aligned":**

- Name the owning module, the reference recipe and the shared components used; identify any adapter.
- Preserve the module's governed columns, quantities, statuses, permissions and write ownership.
- Show a complete working page, not a cropped header: desktop and 390px, plus the 896px
  available-canvas rail boundary with global navigation expanded and collapsed.
- Check contextual regions open/closed, backdrop/Escape, search, selection and column filters;
  supported presentation switches keep the same result and filters. The supplied SO target omits Table/Cards; do not add it from an older example.
- Check the Working Panel and full-object door, long identities, all §2.2 states, keyboard focus,
  icon accessible names and 40px touch controls.
- Check long content is reachable, headers stay fixed and horizontal overflow stays in its pane.
- Provide the preview URL, visual evidence and test results; state remaining gaps. Passing tests,
  importing kit primitives or another chat's approval is not whole-page visual proof. Approved,
  built, deployed and visually verified are separate claims, each with scope and evidence.

---

# §3 · Shared kit

Appearance and dimensions are defined once in 01; component use and states in 02; page compositions in 03. Reuse existing kit components and the DataGrid engine. Preserve component APIs, source-owned facts, accessible names and permissions. No page-local status, button, drawer, field or grid replacement.

Soft status pairs replace the previous solid-white status styling; Hold is dark. A condition determines tone, never the verb. Counts are not record status. Main action is charcoal `#1B1B39`; selection follows the person's theme, default Blue. Business status words still come from COPY and the owning module. See 01 for every value and migration gap.

# §4 · Shell and page composition

Use 03 §§1–4 and 01 §4. Contextual summary and Tasks regions collapse independently. Settings uses plain grouped rows and entity tables, not mandatory extra rails. Preserve global utilities, source navigation and module permission boundaries. A prototype page opening does not authorise replacing every module's record doors.

## §4.1 · Object page — the full record

**How one record opens — four surfaces, each with one job; a fifth needs an owner ruling.**

```
INSPECT    row expansion            the record's goods and related facts; ↑↓ moves · Esc closes (§6.9)
WORK       right Working Panel      Info + module tab; quick work in place of the list (§4.3)
OBJECT     full object page         read-first View · deliberate Edit · Revisions · History · Route
DOCUMENT   document preview         the saved/current document the other party receives (§4.4)
```

**Anatomy of the page:** identity row → tab row → form pane (left) + document pane (right) where the
object rule splits (§4.4), otherwise one facts flow. The supplied SO target opens the full object on row click (03 §2.1), rather than automatically editing or opening a compact card. Other module record doors remain governed by their MASTER; the Working Panel remains available for its approved work purpose (§0.2). the full object page keeps its approved roles and is reached from the identity number or the panel's ↗. View, deliberate
Edit, PDF, Revisions and History stay distinct: only explicit `Edit` opens the formal edit context;
View, Preview and Print are never edit; Revisions are complete versions, History is events.

**Approved in-list write state — two owner rulings, no other register copies them without its own:**
the **Delivery Monitor** row expansion (owner ruling 2026-09-13) is the delivery brief of four kit
`Panel`s; a panel that owns a Delivery write flips its own body into a focused edit state through its
one right-slot control (`Update date and time`, `Assign logistics` / `Change logistics`) with a named
Save, staying on the same row and narrowings. The **Delivery Orders** register (owner ruling
2026-09-26) opens the Delivery Order brief in place — two columns at ≥1024px, acts left, read-only
facts right — so a result, signed DO, receipt and proof review are recorded without leaving the list.
Sales facts inside a brief stay read-only (`View Sales Order` unfolds the governed SO document in
place; the row's `SO No` is the door to change them). Full law: Delivery MASTER §§8.5–8.7.

**Object header template — APPROVED / LOCKED 2026-08-14; presentation accepted 2026-10-01.** One
owning-register back destination, one persistent identity (`number · party`), governed actions at the
right, the applicable object views directly below; View and Edit keep the same context. Current 01/03 own its appearance and responsive composition. Identity and actions wrap without loss; preserve visible focus, full identity and owning-register return context. No duplicate singular/plural pseudo-tabs or second Back door.
Output actions (`Print ▾`) stay distinct from Edit; rare or destructive actions live in overflow.
Numbers: 01 §7.5. **KIT GAP:** `SalesOrderTabs` and Workspace `FullFact` are page-owned recipes, not a
generic ObjectHeader/ObjectPage API; `kit/DetailShell` embeds an order-specific action track and
four-fact contract (and has no `state` prop, by type) and must not be forced onto other objects.

**Scoped SO exception — goods-summary inspection (owner 2026-10-01, BUILT):** a compact goods summary
with a `+{n}` count of remaining goods LINES (never quantity) opens a read-only goods inspection in the
kit `Drawer` (`SO-{n} · Items`), reading the same goods source as the expansion. It is not a full-order
drawer and has no edit form.

**The four regions** (03 Detail pattern): Header (which record · state · `‹ 4 of 69 ›`) · Summary ·
Sections · History (`Today · Yesterday · Earlier`).

**One card grammar for every object, detail and review surface — owner instruction 2026-09-26, BUILT.**
The shared Block is the one section component. Use 01 for its surface, heading and spacing. Read-only facts are plain text; editable and automatic form inputs remain distinguishable, labelled and source-owned. No module-local boxed-fact palette.

**A tab earns its place two ways, and only two.** Reason one — genuinely parallel tracks (a Sales
Order: goods, delivery, money move at once). Reason two — reference a human opens rarely but must find
(Versions, History, the route map). Everything else is ONE SCROLL. The mechanical test: would a staff
member open this tab on an ordinary Tuesday? Yes and it runs beside the others → reason one; no, but
they would hunt for it when something went wrong → reason two; neither → a section in the scroll.

```
PARALLEL TRACKS   Sales Order
REFERENCE ONLY    Purchase Order · Supplier Claim — work is the first tab; then Versions / History / Order Route
ONE SCROLL        Goods Receipt · Purchase Return · Repair Order · Display Request · Manual Purchase ·
                  the governed Consignment documents
```

**Object composition (accepted 2026-10-01):** in a split, the left form scrolls as ONE pane and the
right document preview independently; Items has its natural height and no nested vertical scroll;
desktop wraps product details; small screens stack (form then document). Two-column object
composition for a facts-and-events object (Delivery Order): fixed facts in a ~420px right column,
events in a scrolling left column at ≥1024px, one column below; a Sales Order keeps its tabs and a PO
its 50/50 split. **A panel's actions live in its own header `⋮`** (Jess 2026-07-11); the redundant
inline button is gone.

**What is remembered:** whether a rail or a panel is collapsed (per browser). Register column
preferences follow §6.7 rule 4. Object goods tables gain no column customisation.

**The reference instance** is the Sales Order page: `SalesOrderWorkspace` (read-first View, deliberate
Edit with the 50/50 live document, Revisions, History, Order Route). Orders MASTER owns its business
facts, field standard, Items (five columns `Item · Qty · Unit (RM) · Disc (RM) · Amount (RM)`) and the
Order Route ONE NODE MAP (`docs/orders/MASTER.md`). Other objects copy the grammar, never SO fields or
arithmetic. The owner-selected Houzs Service Case detail composition (2026-10-01) is a reference for
hierarchy and sections, not an approved adaptation (research file §6).

## §4.2 · Portal navigation

Reuse PortalSidebar and portal-nav; geometry and selected appearance live in 01 §4. Preserve the approved module hierarchy and each user's access. Navigation order is not a new permission. Source menus in the imported HTML are visual evidence, not automatic activation of Subscription or unbuilt pages. Scroll long navigation rather than shrinking items. Bottom Settings and user identity remain reachable.

## §4.3 · Working Panel — the compact module card

**APPROVED TARGET for every module (owner ruling 2026-10-05, §0.2) · shared kit BUILT · Sales Orders
PRODUCTION VERIFIED.** The right Working Panel is the kit **`CompactModuleCard`** inside the shared
`Drawer variant="compact-card"` (the Drawer owns focus containment, Escape, background scroll lock and
return focus; the card owns its visible identity and Close; closing preserves the register context).
Never copy reference HTML or CSS into a page; never draw a lookalike panel.

- **Its shell, the same for every module:** identity Header → `Info` tab and the module tabs (the
  panel opens on the current page's own main work tab; related tabs such as the embedded
  `Sales Order`) → helper entries (`Items`, `Communication`, `Timeline`) → module summary cells → one inline editor at
  a time. Responsive rules follow the **card's** width, not the viewport.
- **The rules of the card** (header facts, sales facts, Info and module defaults, summary cells,
  editors, DO conditions, Items, Communication, Timeline, the SO document preview, the dark Header
  colour, the original requested-date day count, the adapters and the reference differences) live
  **once** in [`MODULE-CARD-TEMPLATE.md`](../ui-reference/MODULE-CARD-TEMPLATE.md). Its numbers live in
  [01 §7.6](#kit-values); its words in
  COPY-STANDARD "Compact module card words" (`CARD_WORDS`). It is not on `/ui` until its page's turn (one kit, 14 Oct 2026).
- **Sales fact word — UI Master approved 2026-10-06 (owner ruling: two dates, two names).** The
  card's planned-date fact (`orders.proceed_date`) and its `{n}d` tooltip say **`Planned production
  start`** (`CARD_WORDS.proceedDate`, `CARD_WORDS.dayCountTitle`); `Proceed Date` names only the actual
  hand-off (`orders.proceeded_at`) and never appears on this card. Name only: the card reads the same
  date. On a card wider than 440px the longer label wraps to two lines in its `1fr` column, so the four
  labels share one row and the four values the next (CSS subgrid; sizes and fractions unchanged, +16px
  on the then-current card); these historical dimensions are not the new visual target. BUILT on branch, not yet deployed.

### §4.3.1 · The panel opens on the current page's own main work tab — owner-approved 2026-10-05

**The right Working Panel on each module page shows that page's own main work tab, selected by
default when the panel opens.** The panel structure, style and interaction are shared (Info + module
tab, §0.2); each page supplies its own identity, work content and authorised actions. The labels are
the current COPY page/object names: SO Batch Purchase page → main tab `SO Batch Purchase`; Purchase
Orders page → `Purchase Order`; Manual Purchase Request page → `Manual Purchase Request`. A related
`Sales Order` tab keeps its approved capability and uses the shared embedded SO component (§4.3.3).
There is no generic `Purchasing` main tab. The Sales Orders page's standalone SO card keeps
`Info · Delivery` (§4.3.3).

### §4.3.2 · The outer identity belongs to the host module

The Header always describes the **main record that is open**, with the shared structure and style:
a Sales Order is the customer (name · SO No · phone · `Customer’s original` / `requested delivery`);
a Purchase Order is the supplier · PO No (with its PO state); a purchasing round is the round time and
date (with `Passed` / `Done` through `referenceStatus`); a GRN is the supplier and GRN No. **`Info`
always describes that main record.** No customer, address, amount or date is fabricated where the
source has none (empty header slots collapse). Module work lives in its own tab; write ownership stays
with the owning module, and the panel only reaches its existing governed doors. A module tab reads its
own source; a missing or failed read stays explicit inside that tab. Current work in a tab uses the
existing task identity, duty/person and source action: fact, blocker and authorised next step stay
together; exception inputs sit beside the affected field or goods; submission feedback distinguishes
pending review from completed stock, payment, delivery or approval. No new panel engine.

### §4.3.3 · Standalone and embedded Sales Order — owner-approved 2026-10-05

| | Standalone SO card | Embedded SO (`Sales Order` tab inside a host panel) |
|---|---|---|
| Where | the Sales Orders register (and any surface whose main record is the SO) | a PO panel, a purchasing round panel or another approved host whose main record is not the SO |
| Identity | the shared identity Header (customer · SO No · phone · original requested delivery · ↗ · ×), styled by current 01 | light identity in the tab: name, underlined SO No → saved PDF, phone, two-line `Customer’s original` / `requested delivery`, `31d · Sat, 31 Oct` (original revision-1 date minus Planned production start, calendar days), ↗ full SO page. No second identity header, no nested tabs, no × |
| Tabs | `Info · Delivery` | none inside the tab |
| Opens with | Info: address and sales facts open; Items, Communication and Timeline closed | address and sales facts open; money; the items table shown by default with `Item · Qty · Unit (RM) · Disc (RM) · Amount (RM)` |
| Component | `CompactModuleCard` | the same component in its embedded presentation |

A single-SO card whose Header is already that SO does not embed the same SO again. A host shows its
`Sales Order` tab only when a Sales Order is linked. **DEPLOYED (PR #1926, `dc631e1a`; deploy run 37293312776; production SHA verified on all five surfaces 2026-10-05); owner review owed**: the PO full page
`Sales Order` view, one SO builder (`sales-order-card.tsx`) feeding the standalone and embedded cards, and
the host entry `EmbeddedSalesOrders({ orderIds })`; owner acceptance owed. The PO working panel and round
panel adopt it as approved hosts (their work-content layouts are localhost-first). Complete defaults,
hidden parts, states and entry points: the contract's "Embedded presentation"; numbers: 01 §7.6.

### §4.3.4 · Adoption by module

| Module / host | Panel | Status | Evidence / owner |
|---|---|---|---|
| Sales Orders register (Table and Cards) | standalone SO card, `SalesOrderCompactView`; Info · Delivery | PRODUCTION VERIFIED 2026-10-05 for the confirmed corrections; the 2026-10-05 Info layout (#1915) and the original-date header (#1919/#1920, `9294659a2`) are DEPLOYED with live acceptance not yet recorded | PR #1893/#1896/#1897 merge `2ce91e2d` (deploy 37213753695); Orders MASTER owns the business path |
| Delivery tab (inside the SO card) | `DeliveryBrief` summary + Delivery-owned editors | DEPLOYED with the SO card; editors reuse Delivery's governed doors | Delivery MASTER |
| SO Batch Purchase quick view / Cards | `SoBatchCompactView`; opens on main tab `SO Batch Purchase` (§4.3.1, target) | DEPLOYED (#1891); its header still shows the current request with a today-based countdown — the original-date fix is LOCAL ONLY in the Purchasing lane | Purchasing MASTER §9.1 |
| Receiving (GRN) | `ReceivingCompactView`: supplier/source + GRN No, `referenceStatus` `Cancelled` | DEPLOYED (#1894); wrapped summary labels PRODUCTION VERIFIED (#1906, `d4cca587`) | Purchasing MASTER §9.4 |
| Shared embedded SO component (kit `CompactModuleCard presentation="embedded"`, `EmbeddedSalesOrders`, `sales-order-card`) | one SO builder for standalone and embedded cards | DEPLOYED (PR #1926, `dc631e1a`, production SHA verified 2026-10-05) | UI MASTER §4.3.3 · card contract |
| Purchase Orders full page | `Sales Order` view = `EmbeddedSalesOrders` (embedded presentation) | DEPLOYED (PR #1926, `dc631e1a`, production SHA verified 2026-10-05); owner acceptance owed | Purchasing MASTER §9.3 |
| Purchase Orders (PO working panel) | supplier · PO No + PO state; Info · `Purchase Order` (default) · `Sales Order` (embedded, §4.3.3) | APPROVED TARGET / NOT BUILT — tabs owner-approved 2026-10-05; the layout of the work content is PROPOSAL, localhost first; a `GRN` tab is pending owner decision (stale PR #1859 not authorised) | Purchasing MASTER §9.3 |
| SO Batch Purchase purchasing round | round time/date + `Passed` / `Done`; Info · `SO Batch Purchase` (default) · `Sales Order` (embedded) | APPROVED TARGET / NOT BUILT — tabs owner-approved 2026-10-05; the layout of the work content is PROPOSAL, localhost only | Purchasing MASTER §5.6.1 |
| Manual Purchase Request | Info · `Manual Purchase Request` (default) · related `Sales Order` (embedded) per its approved capability | APPROVED TARGET / NOT BUILT — tabs owner-approved 2026-10-05; the layout of the work content is PROPOSAL | Purchasing MASTER §9.2 |
| Warehouse | a `Warehouse` tab in the shared panel | APPROVED TARGET / NOT BUILT (§0.2) | Stock MASTER |
| Workspace page | the one task view (§5; `TaskView` through `TaskFrame`) beside its list, with the `Communication` card under it; a PO task's `Sales Order` fact opens the embedded Sales Order (§4.3.3) | BUILT ON BRANCH `build/workspace-v3`, NOT DEPLOYED (`docs/workspace/MASTER.md` §5.10). The earlier three-column page and its right panel are removed; the Logistics, Customer and Supplier cards are drawn on no screen (§5.9 there) | Workspace MASTER |

### §4.3.5 · Default page work and `Tasks` — owner direction 2026-10-05

- **Default work presentation — APPROVED DIRECTION, localhost first, NOT BUILT.** Entering a module
  page, the right Working Panel shows that page's **highest-priority actionable work** from the
  existing Work / module task sources (owner, permissions, completion facts) — no new task engine, and
  never guessed from the current table filter. Purchasing priority: earliest `Passed` → today's due
  round → next round. Nothing is ticked, ordered, reserved or sent automatically. A task the operator
  navigates to by hand stays selected across a refresh; a draft is never lost. When there is no work,
  the panel says so plainly (COPY word needed) and record viewing stays available.
- **Page work and `Tasks` — APPROVED DIRECTION, NOT BUILT.** The page's own work and the global
  `Tasks` view (§5) never show as two stacked panels; a way back to the page's work is always present;
  selecting a row never silently changes the object open in Tasks; `View` opens the full document
  (§6.7 rule 5).
- **PROPOSAL / UNDER RESEARCH — not law:** how Tasks coexists with Calendar, Activity and the page's
  work. The owner requires Calendar to stay quickly viewable while handling a task; "Tasks replaces the
  page's work in the same area" is not decided (§7.4).

**Open items on the card** are in §7: the compact-card token decision, 40px phone tabs, the editable
`To` versus Work's recorded channels, the native Input/Textarea cascade, the preview-versus-kit
differences, the link-style button inside the card and "several SOs → list first". (↗ renders only when
the page passes `onOpen` — DEPLOYED in PR #1926, production SHA verified.)

## §4.4 · Document preview — the document the other party receives

- **SO/Purchasing document-bearing record composition · current21Oct target:** facts on the left and the saved document (or clearly labelled internal request preview) on the right, equal widths at available content820px and above; below820 stack them with the document region900px high and its own scroll. This covers PO, GRN, MPR, Claim, Return, Repair and Showroom records where the supplied design has a paper pane. A missing official file shows an explicit unavailable/loading/error state, never a fabricated PDF. Viewing stays read-only; editing previews and saved official versions remain distinct. Payment and other modules keep their owning object composition. PDF contents, numbering and production generation remain under PDF/module authority.

- **The preview surface:** `PdfPreview` (fit to width, zoom, its own scroll, explicit loading/error with
  Try again) under `PdfPreviewHeader` — a wrapping document title naming the actual document number
  (the SO instance: `Sales order PDF · {actual SO number}`; other titles need COPY), source-owned actions (`Download` disabled until the saved file exists) and a named icon Close, in
  one row; zoom on the next row. Identity and Close stay available during loading and error. Closing
  returns focus to the opener. The compact card opens its saved document from the document number
  (the SO instance is in the card contract).
- **Versions stay separate:** current, proposed, last-sent and historical documents are labelled
  accurately and never mixed; a failed PDF capture after a business success is not a failed business
  act and is not a reason to repeat it.
- **Register list PDF** (a listing output, never mistakable for a business document — no letterhead,
  terms or signature): Excel and PDF derive their cells once; the list PDF opens in the in-page
  `Modal` + `PdfPreview` with Download. PRODUCTION VERIFIED (PR #1911, `5604b06d`, deploy 37248636367).
- **Document numbers:** every module follows COPY-STANDARD's two-digit-year display contract through
  the one shared `documentDisplayNumber` (`packages/shared/src/document-display.ts`, PR #1890) on lists,
  panels, pages, related records, search, Work and previews; stored identities and issued documents
  never change; never apply it to supplier-owned references. Adoption is verified per surface.
- **Printed documents** follow `docs/pdf/DOCUMENT-KIT.md`; screen heading styles never recolour a PDF.

---

# §5 · The Tasks panel (right) — owner rulings 2026-10-08

**The list and the one task view — owner 12 Oct 2026 (03 §8), round 3 brief of 13 Oct 2026 (point 2) · DEPLOYED 13 Oct 2026
(#2047, `3a9188f95`: the ERP reported that commit and its bundle held this code); the signed-in look at 1025, 1164 and 1440 is owed.** Title row 36 with no
line under it. The day strip of the working week; a day's number is its `To do`, amber when that day holds late work;
the chosen day is filled in the selection colour. `To do` · `Waiting` · `Done` as the segmented control, each with its
number. Then one white group per party (name, count, a fold), and in it one card per task on the ground colour: module
icon, title, ›, then one row per fact, label left and value right. The whole card opens the task; amber is only on the
row that has passed. `To do` on today is what is due today or earlier and what has no working date; another day shows
only its own work. `Waiting` is every task a request was recorded for whose answer is not due yet; `Done` is what the
person finished on the chosen day. All three read the ONE Work read (`lifecycle` and `completed`); nothing is counted
twice and no second engine exists. The module filter icons, the `Late` and `No date` sections and the day badge of the
earlier panel are removed.

**The Workspace page** (Workspace MASTER §5.10; deployed 13 Oct 2026, #2049; seen signed in on production 13 Oct 2026 at 1025, 1164 and 1440, view only) lists the same tasks
as one table. It opens a task through the same task desk (`useTaskDesk`) and counts with the same list arithmetic
(`task-cards.ts`), so its `To do` · `Waiting` · `Done` are this panel's numbers. While that page is shown, this panel
and its pill step aside.

A card opens **the one task view** (kit `TaskView`, 02; composition in 03 §8). The Tasks area supplies the task (the
list card's own title and facts, `TaskOpenContext`); the owning module's panel supplies its steps and what only it
knows through `TaskFrame`: extra facts, the Sales Orders the task serves, what was recorded and its documents. No
module draws its own card inside Tasks any more: `BatchPanel`, `SupplierAnswerTaskPanel`, the PO Duty panel and the
act panel all render through `TaskFrame`, and `CompactModuleCard` stays for module pages and embedded Sales Orders.
What each tab reads: `Route` the one Order Route model (`useMissionRoute`); `History` the Work
record's request and answer day plus the owning module's records (a PO's `sends` and supplier answers); `Files` the
owning module's existing print doors, rendered on demand. A tab that cannot be read says so in one line and never
takes the task's steps down with it. Goods of a PO are drawn as wrapping lines (`PoTaskGoods`), and a purchase batch's
PO row puts its items and destination under the PO number with the PDF door at the right, so nothing is cut or
passes the panel's edge at 320 (measured 13 Oct 2026: the one-line PO row passed the edge by 31). A form wider than the panel is never squeezed into it to scroll sideways: `Record supplier answer` (a line table
900 wide) opens on the host's full surface (`WorkPanelHost.openReview` with `TaskWideSurface`, the door Issue PO's
review already uses), titled with the act, the supplier and the PO; the form's own `Cancel` and saving button are the
only ways out, and the task stays mounted underneath. After a task is saved the app's dark toast says the module's own words for 12 seconds with ✕, and
`Next: {party} ›` when another task of the same kind waits in the list's order; nothing opens by itself, and no
`Undo` is offered (owner 12 Oct 2026 evening). The green result line of the earlier panel is removed.

**Measured (13 Oct 2026, fixture previews, `pnpm kit:check` · `e2e-kit/kit-tasks.spec.ts`):** `carres-check.js`
answers PASS at 1025, 1164 and 1440 with the list, with a task open and on each of its four tabs; the panel is 320
below 1280 and the title row 36; nothing passes the panel's edge and no value is cut. The supplier answer form on
the full surface has no side scroll at the three widths (its table is 951 to 1066 wide there; inside the panel it
scrolled 576 to 628 sideways). At 1025 with the panel open the
list behind it is narrower than its columns' minimums, so the table scrolls sideways inside its own scroller with the
first column fixed (01 §5), as the package's own page does; the kit lists' scroller carries `data-list-scroll`, the
mark the package's check reads, and `e2e-kit/kit-lists.spec.ts` still measures that each list FITS wherever it must.

**`+ Task` (owner 2026-10-14): BUILT 14 Oct 2026; deployment and the signed-in production check owed.** `Task` with the
plus icon in the Tasks panel's 36 title row and in the Workspace `Module` title row opens ONE dialog (the Workspace
toolbar had no room for a third control at 1025: measured on production 14 Oct 2026, its controls already fill 512 of
513) built from the kit
(`Modal`, `Input`, `Textarea`, `Select`, `DatePicker`): `Task name` · `Description (optional)` · `For` · `Due date`, then
`Cancel` · `Add task`. The first field takes the focus, a refusal is said under the field it is about, and the dark toast
says `Task added · for {name}`. An internal task opens as the one task view with `Steps` and `History` only and one act,
`Mark done` (Workspace MASTER "Employee-created internal tasks"; COPY "The internal task words"). Measured in
`e2e-kit/kit-tasks.spec.ts` and `kit-workspace.spec.ts` at 1025, 1164 and 1440. **Not built:** `@` notes and `Mention`
(the Portal has no per-person notification record), the package's `Time` and `Linked to` fields (an internal task links
to no other module's record) and `Add another task` on the toast. `Undo` for 15 minutes with `Correct` after it (the package's Ops Rules §8) reverses stock
moves, tasks and approvals across modules and is a plan of its own, not a toast change.

**Current supplied shell target — owner 9 Oct 2026, kept in v12 of 11 Oct.** Task card and open-card composition: 03 §8. A collapsible Tasks region (01 §4)
is opened by the labelled Tasks/count control; Summary collapses independently. Do not add the old
permanent right icon column to the supplied SO composition. Tasks uses the signed-in person's
cross-module work from the one Work source; Workspace keeps its formal My Task/Team Work purpose.
The latest visual target replaces the old icon-only Tasks-door placement, not task business law.

- A task row opens the exact source-owned work/result. Module filter icons follow the menu order;
  counts come from authorised source work, never current table filters or a second engine.
- Keep task/source, reason, owner, due, required proof, recorded result and next action. Prototype
  choices and generic Save do not create permissions, evidence waivers or completion rules.
- Document inspection and task work share the available page area without stacked duplicate task
  panels; drafts and return context remain. Desktop drawer geometry lives in 01; narrow adoption
  still needs full-page checks.
- Calendar is still a shared quick-reference capability. Activity and Calendar integration not shown
  in this ZIP remain unresolved placement, not deleted capability or permission to invent new doors.
  The previously approved quick access while handling work must remain available in later composition.
- No Customers rail door. Customer/contact lookup remains an approved capability whose source-free
  enquiry placement is still reviewed with Workspace/Customer Service; never fabricate an SO.
- Module Quick Schedule and Activity's unfinished blueprint remain separate owner-reviewed work.

Historical production behaviour and old Quick Rail screenshots are implementation evidence only,
not another current shell standard. This document has not measured the new runtime deployment.

**One job, two doors (owner-confirmed 2026-09-25).** A job can be done from Work or on its owning
module page; both use the same module action and write the same record. Done means the source fact
exists — the item closes everywhere; nobody presses `Done`.

**Customer lookup — capability APPROVED 2026-09-24/26; placement OPEN.** Find a caller by name, phone
or saved order number across their orders, read only, permission-filtered, exact matches first, name-only
hits kept apart as `Possible match`. The header search (§4) now finds customer names → their Sales
Orders; a full cross-order caller view still has no placement (§7.2).

**A page never resolves Duty** (owner ruling 2026-09-01): every action surface renders the resolved
owner from the one Work Engine Action contract (`../ERP-ARCHITECTURE.md` Law F.1); only Settings →
Staff & Duties edits assignments.

## §5.1 · Work owner and two-line action grammar — OWNER-APPROVED / LOCKED 2026-08-14

- **Owner is structured identity, never sentence copy:** the governed compact avatar/initial chip;
  hover and accessible name expose the full name. My Work omits the current user's avatar; Team Work
  groups by owner (avatar · full name · `{n} actions to do · {n} late`). My Work is every employee's
  default, including a manager's.
- **`Assigned to` / `Completed by` (owner ruling 2026-09-29, APPROVED TARGET / NOT BUILT):** current
  responsibility reads `Assigned to`, the actual performer `Completed by`; `Updated by` records an
  update; `Assigned by system` and timestamped movements belong in history. Normal owner, Acting
  owner, Buddy cover, Covering a person and Temporary owner leave routine pages, tooltips and filters.
  Assignment never stops another authorised person from helping; one owning business fact completes
  the Work everywhere (Workspace §3).
- **Action owner template (owner-approved 2026-09-03):** identity in the row/card header, owner in
  structured metadata, the sentence carries only the act; counts name concrete work
  (`5 customer balances need collection`), never abstract `open`/`late` totals.
- **Two lines when both fact and act are needed:** line 1 the fact/problem, `text-body` 13 semibold;
  line 2 the act, `text-label` 11 at `font-normal`, quieter but readable (owner ruling 2026-08-15).
  Never blend the two into one clipped sentence; do not repeat context the row already supplies.
- **A register cell carries the FACT alone (owner ruling 2026-08-18, extended 2026-09-04):** no action
  clause, owner avatar, owner name or duty holder in a register cell, and no `Work` column; a cell's
  second line is supporting evidence, never an instruction. Actions live in My Work, Team Work, the
  Order Route, the Working Panel's module tab and detail panels. **A left mission rail may present
  source-owned missions (§6.1); it never calculates its own work or owners.**
- **Ruled exceptions (no other register copies them without its own ruling):** the **Delivery Monitor** `Delivery Status` column (Delivery MASTER §8.4) — one status
  word set from one function, no avatar and no second action; the **Delivery schedule card** — two
  facts on two lines (journey progress, then readiness/blocker) and a type label, never summed
  (Delivery MASTER §§8.2, 8.4). **Delivery Work sentences** are two structured lines: act with
  recipient (`Call NETS`), then the required result (`Confirm the delivery date`).
- Missing optional facts render the governed neutral empty value; a missing required fact that opens
  work renders the fact plus its action; a blank missing value never impersonates a warning; the reason/action stays explicit.

## §5.2 · History and revision three-rank record grammar — OWNER-APPROVED / LOCKED 2026-08-27

History and Revisions answer in five seconds: **what happened · who did it · when · the important
result.** Up to three lines in fixed order (omit an inapplicable third; never an empty line):
1 what happened — 13 / 500; 2 who and when — `text-meta` 12 / 400 (real staff name + role +
`fmtDate()` date/time); 3 the important result — `text-meta` 12 / 400 (sizes follow 01 §2, v12
11 Oct 2026: 11 is only for caps labels, tags and badges). Never concatenate actor, role, action
and raw fields into one dotted sentence.

**Staff identity law (Jess 2026-08-27):** `Who did it?` is a PERSON, never a permission. Every staff
member has an individual account; every write stores the individual `user_id`, resolved to the real
display name (`Jess · Principal · Thu, 27 Aug 12:30` · `Recorded by Jess · Thu, 27 Aug 12:30`;
forbidden: `principal · Principal`, `Recorded by principal`, `Unknown user`). `System` appears only when
the event's own facts prove automation acted. An unrecoverable old actor reads
**`Staff identity not recorded`**. A logistics company answering through its external link is
**`{company} via external link`** — an organisation, never a person (owner ruling 2026-09-24). A
Revision uses the same ranks and stays a complete-version door (Rev 1 `Original order`).

```text
Order created
Jess · Principal · Mon, 24 Aug 11:16
No deposit · Online order
```

**Acceptance:** a staff member who did not build the screen answers all four questions within five
seconds, or the record fails.

---

# §6 · Listing

## §6.0 · Listing template — every Portal listing

Read 01 §§4–5 and 03 §2. Current visual reference: `docs/ui-reference/sales-order-design/Carres Table.dc.html` and `Sales Order Outright v12.dc.html`; shared runtime adapter: DataGrid. The old dense-row and vertical-separator recipe is removed.

1. Module views, shared search/tools, source-owned table, footer; contextual summary and Tasks may collapse.
2. Columns, quantities, meanings and opening doors come from the owning module MASTER. Linked document numbers open their own records.
3. Missing values are blank under the24Oct template. Loading, failed, denied and genuinely empty states remain explicit under COPY/§2.2. No placeholder dash for absence.
4. Row expansion has one job: goods and connected source facts. Do not invent another work queue inside it.
5. Filters, resize, sorting, selection and grouping use the existing shared engine. Preserve list context on return.
6. Content defines column widths. Re-measure the registry against current font/padding; never clip a date, amount, status or identity to preserve an old measurement.
7. Check the complete page under §2.2 before claiming adoption. Previous deployment evidence proves the previous implementation, not this new visual target.

**Warehouse placement — owner-approved 2026-10-22 / NOT BUILT:** the three primary entries are
Inbound, Inventory and Outbound. Use the existing shared module-view controls to expose Arrival
Schedule inside Inbound and Pickup Schedule inside Outbound. Keep full-width directional schedule
content as an alternate view, not a calendar strip beside the register and not another shared kit.
Stock MASTER §2 owns scope, source-link continuity and retained context; COPY owns the exact words.
This approval changes no shared dimensions, Summary/Tasks behaviour, business engine or permissions.
Stock MASTER §2's **Inventory design coverage** and §7's location coverage are the approved design
brief, including product-to-Unit detail, source links, PJ's shared stock and supplier/transit custody.
Use this MASTER's current measurements and components for the complete sample; do not copy an old
Houzs skin, add per-location pages, or treat a written brief as a working component. The exact visuals
remain subject to review; this is not page acceptance or an implementation/deployment commission.

## §6.1 · Contextual summary/filter rail

Use the shared FilterRail adapter when the module's purpose needs it. Approved source-owned filters and their count semantics remain. Current selected appearance and widths come from 01. Do not impose SO filters, mission labels or rail groups on every module. Hide/show retains filters and leaves the record table usable.

## §6.2 · Shared listing — one engine, one interaction contract

Every module uses the **same `register/DataGrid`, toolbar and interaction contract**. A module supplies
only: record grain, default columns, optional columns, real data, business filters, permissions and
actions. **A component existing is not whole-page adoption** — each page proves adoption by §2.2.

| Capability | Status | DataGrid prop / source | Note |
|---|---|---|---|
| Search | SUPPORTED | built-in box; `searchPlaceholder` · `searchScope` · `initialSearch` · `onSearchChange` · `searchPresentation="responsive"` (`Search: {query}` chip) | Current 01 search dimensions; the accessible hint names only fields actually searched; server search is the page's reader |
| Table / Cards | SUPPORTED | `presentationTools` + `renderResults` (Cards consume the grid's exact sorted/filtered result) · `presentationKey` | Adopted: Sales Orders, SO Batch, Purchase Orders, Receiving. Kit `Tabs` segmented with `Table2` / `LayoutGrid` icons and visible words |
| Page tools `⋯` | SUPPORTED | `presentationTools` menu: Export · `outputActions` · `pageToolsItems` · Columns | Entries icon + text; page tools never write business records |
| Columns (show/hide, grouped chooser) | SUPPORTED — parent columns only; default-hidden columns stay hidden (DEPLOYED and production SHA verified on all five surfaces (PR #1927, `a78e527c4`; deploy run 37293651075)) | column `defaultHidden` · `chooserGroup` · `chooserGroupOrder` | Expansion columns are not listed (§6.3, KIT GAP) |
| Sort | SUPPORTED | column `sortable` · `sortFn` · `onSortChange` · `sortDefault` | 12px arrow; grouped listings sort the whole register once. `sortDefault` (13 Oct 2026) seeds the sort only when this browser has no saved layout for the `storageKey`; a saved sort, or a saved choice of none, wins |
| Column band | SUPPORTED (opt-in; BUILT 13 Oct 2026) | column `band` · token `--c-column-band` (`bg-c-column-band` for item rows) | One neutral grey `#EEF0F3` over a column's header, rows and opened items; holds through hover and a ticked row; never the theme colour (01 §5) |
| Per-column filter | SUPPORTED | column `filterable` · `filterType` · `filterValue` · `dateValue` · `numberValue` | Every filter matches its column type (dates get presets and Between…); paged registers use `serverColumns` |
| Active conditions | SUPPORTED | `activeConditions` · `onClearConditions` · `reserveConditionRow` | One removable strip for rail + column + search conditions; neutral `Clear all` |
| Drag order (columns) | SUPPORTED | header drag; layout per `storageKey` | `leadingColumns` / `pinnedPrefix` columns cannot be dragged or hidden |
| Drag order (rows) | SUPPORTED (opt-in) | `rowDrag` | Keyboard Alt+↑/↓; the page persists |
| Drag width | SUPPORTED | resize handle; column `width` / `minWidth` from `REGISTER_FIELD_WIDTH` | `Best fit` in personal layouts; the last handle stays inside the table |
| Pinning | SUPPORTED | `leadingColumns` (date + identity; `.before` for an approved leading column) · `pinnedPrefix` · `stickyIdentity` (older) | ≥768px canvas pins date + identity; below pins identity only |
| Select / select all | SUPPORTED | `selectable` (`isSelectable`, `unselectableReason`, indeterminate parents) · `selectionSummary` · `selectionPrimary` · `selectionActions` | A group header selects only its group (PR #1912 `a929e90d`, deployed; live check not recorded) |
| Grouping | SUPPORTED | `fixedGroups` (governed, §6.10) · `initialGroupBy` · `allowColumnGrouping` · `countsInGroup`; optional `Group by` via `pageToolsItems` | Sales Orders optional grouping released (PR #1850); the choice rides the route parameters — browser/account persistence beyond the URL is not built; one grouping at a time, never duplicating a record across groups |
| Expansion | SUPPORTED | `expandable` (`renderExpansion` · `flush` · `alignToColumn` · `fitExpansionToViewport` · `trigger` · `defaultExpandedKeys` · `revealExpandedKey`) + `GoodsMiniTable` + connector | §6.9 |
| Identity link | SUPPORTED (page-rendered cell) | `leadingColumns.identity` + the page's link cell · `onRowClick` · `onRowDoubleClick` | No generic identity-link prop; Enter = double-click |
| Row right-click menu | SUPPORTED — ONE ROW MENU `View · Print` (§6.7 rule 5), DEPLOYED (PR #1928, `488a627a8`; deploy run 37297402433 succeeded with its five-surface SHA check); authenticated production walk owed | `contextMenu` (Shift+F10 / Menu key) + the shared `documentRowMenu` helper (`components/register/row-menu.ts`) | Per-register menus in §6.5 |
| Export (current view) | SUPPORTED | Excel and list PDF from one derivation: column `exportValue` · `exportLabel` · `exportName`; selection exports the ticked rows | List PDF in-page preview PRODUCTION VERIFIED (#1911) |
| Paged full-population export | SUPPORTED | `loadExportRows` | Receiving first; PRODUCTION VERIFIED for Excel (#1905, `a087fec9`); live PDF-list download of a paged register not claimed |
| Server-side column filter/sort | SUPPORTED | `serverColumns { values, onChange }` + shared `register-column-query` | PRODUCTION VERIFIED on Receiving (#1899/#1901, `5c04b662`) |
| Footer | SUPPORTED | Current-token status footer: `statusSummary` · column `footerTotal` · filtered `{n} of {m}` | Information only; never a second toolbar |
| Loading / error / empty | SUPPORTED | `isLoading` · `errorState` (opt-in) · `emptyMessage` · `noMatchMessage` · `warning` (message kind ②) | §2.2 |
| Long text in a cell | SUPPORTED | column `overflowText` (CPopover `{column}: {value}`) · column `wrap` (row grows; completeness columns only) · `headerLines` · `headerSub` (a grey 12 / 400 second header line, 13 Oct 2026) | A page-level `Wrap` tool is a GAP |
| Row stripe | SUPPORTED (opt-in) | `rowHighlight` (semantic condition token, with a label) | Never paint the whole row (§6.8) |
| Narrow screen | SUPPORTED | grid-canvas rules below 768px (40×40 checkbox target, identity-only pinning); toolbar follows the viewport and never shrinks; filter menus clamp to an 8px viewport inset | Proof per page at 390px; canvas-versus-viewport trigger mismatch is a REAL GAP (§7.2) |
| Keyboard | SUPPORTED | one Tab stop (roving row); ↑/↓ Home/End PageUp/PageDown over the full list; Enter opens; Space ticks; →/← expansion; Shift+F10 / Menu key row menu | 🟡 a keyboard user crosses every header button before the rows |
| Personal layouts (account-saved) | SUPPORTED (opt-in) · rollout APPROVED NOT BUILT | `personalLayouts` (Purchase Orders pilot only, migration 0528); browser layout per `storageKey` for everyone | Other listings wait for owner acceptance of the PO pilot |
| Return context | SUPPORTED | `sessionKey` · `presentationKey` | Back from a record restores search, filters, view, expansion and scroll |
| Virtualization | PARTIAL / GAP | `useVirtualizer` only for flat lists over 25 rows | Expansion or groups are not virtualized — engine debt |
| Expansion columns in Columns | GAP | — | PROPOSAL / KIT GAP (§6.3) |

## §6.3 · Columns and cross-module facts — owner principle 2026-10-05

- **Modules differ by DEFAULT columns, not by table.** Staff add other permitted facts related to the
  row from the **same** Columns menu, grouped by source (`chooserGroup`, named for the owning module).
  Never a module-specific table, a duplicate mini table or a second listing engine for "other
  modules' facts".
- **Fields come from the owning module.** Viewing never grants editing; no business truth is copied
  into another module's store; the owning module's arithmetic is the one arithmetic (ERP Law D).
- **One-to-many facts state their aggregation** — e.g. `PO No` lists every linked number, each its
  own link (SO Batch, Purchasing §9.1); never one arbitrary PO or Unit, never duplicated parent rows.
- **Future fields extend the same column configuration** (the same column definitions and chooser),
  never a new table. A field joins with: business meaning · owning source · record relationship ·
  default or optional · filter/sort/export behaviour · how several related records show · its
  unknown/error/permission treatment. A shared fact (SO number, Proceed Date, customer) is reused once,
  not duplicated under each module.
- **Do not claim every module's fields are available.** What exists today is per page; a new
  cross-module field is approved per module (Purchasing's SO Batch field inventory is localhost only;
  new cross-module fields there are NOT approved).
- **Main table versus goods expansion are separate choices.** Today the Columns menu lists **parent
  columns only**. An opt-in "expansion columns" capability (e.g. `expandable.columns`, optional goods
  columns OFF by default) is **PROPOSAL / KIT GAP** — Purchasing asked for it; the owner has not
  decided (§7.4).

## §6.4 · Register interaction rulings still in force — Loo 2026-08-08

```
②  EVERY FILTER MATCHES ITS COLUMN — a date column gets This week · Next week · No date ·
    Between…, never a textbox
③  ITEMS READ AS HUMAN WORDS — `King Mattress`, not `B1201S-K`; the SKU rides the hover
⑥  SAVE IS DISABLED UNTIL SOMETHING CHANGED
⑦  HISTORY GROUPS BY Today · Yesterday · Earlier, never a flat list of dates
⑩  NO Refresh button (data refreshes itself) · Close, never Back, on a panel · no spare header height
```

- **C1 · dates:** preserve fact identity and readable full values; selection uses current 01 and is not a business-status signal.

- **C2 · one search AND per-column filters.** A caller says "I'm Umi" — a name or a phone? Keep ONE
  search over the register's governed fields beside the per-column filters (AutoCount does both).
- **C3 · A REFETCH MAY NEVER CLOBBER AN OPEN EDIT.** Auto-refresh pauses while a panel or form is
  dirty (asserted in `SalesOrderWorkspace.ui-contract.test.ts`).

## §6.5 · Register chrome and feedback

Shared tools remain in the listing region; selection replaces ordinary tools in place. The owning module approves commands, group/view options, row menus and record doors. Create exists only at a record's authorised entry point; Operations cannot create an SO. Footer is informational and uses current 01 dimensions. Current minimum rows can grow for source-required content; never squeeze essential facts to match old density.

Distinguish loading, no records, no search matches, read failure, denied and incomplete setup. Preserve filters, selection and drafts on retry. An error names the affected action; a successful command does not falsely claim downstream physical completion. Scroll inside the table, keep header/footer reachable, and test keyboard and narrow screens.

## §6.6 · Sales Orders — the reference register

Sales Orders is the production reference for the shell, register and object/edit templates. Its
column order, population, Proceed/SO Doc Date semantics, expansion columns, related-document columns,
Monthly demand, summary rail and amendment rules are owned by **Orders MASTER** ("Sales Orders
Register — find truth, never assign work" and "Sales Order accepted shared UI template"); this MASTER
does not repeat them. It is a truth register, not Work and not a dashboard. Creation stays in the
Sales Portal (no New Sales Order or Copy order in Operation). Production history: the ERP shell and
SO reference were verified 2026-08-14 (PR #795, `759d49ef`); the accepted 2026-10-01 template is
recorded in §6.0; the compact card in §4.3.4.

## §6.7 · Shared listing standard — owner approved 2026-09-16, staged adoption

1. **Search and filters.** Show active conditions and `Clear filters` whenever search, rail or header
   filters narrow the list; clear all three together; preserve permissions and the governed base
   population; the footer shows filtered versus total (`5 of 62`). Grouping is presentation, not a
   filter.
2. **Date and identity lead — APPROVED (Jess 2026-09-17).** Every listing begins with its own record
   date, then its document number. Canvas ≥768px pins both; narrower pins identity only; neither can
   be hidden or moved by a personal layout (`leadingColumns`). Mappings: Sales Orders
   `Proceed Date · SO Doc Date · SO No` (`Proceed Date` rides `leadingColumns.before`); SO Batch
   `Proceed Date · SO No`; Manual Purchase `Proceed Date · MPR No`; Purchase Orders `PO Date · PO No`;
   Receiving `GRN Date · GRN No`; Delivery Orders `DO Date · DO No`; Payment Records
   `Paid date · Receipt No`. Supplier Claims is the one exception (§7.1). Never invent a date fact;
   exact page orders live in the module MASTERs and are never rearranged by a general heuristic.
3. **A useful default view.** At 1440px with filters open, identity and the facts for the main
   judgement are fully visible in the real shell and font; other columns scroll or sit in Columns;
   never squeeze dates or names, never silently hide approved facts.
4. **Personal columns — APPROVED 2026-09-17 · BUILT, Purchase Orders pilot only.** `Columns` offers
   show/hide, `Save layout as…`, `Load layout`, `Set as my default`, `Reset columns`, `Best fit`,
   `Expand all`, `Collapse all`. Up to 10 named layouts per listing per signed-in user, owner-only.
   A layout saves order, widths, visibility and sort ONLY — never search, filters or group state;
   `Reset columns` restores the company layout (and clears sort). Browser-remembered layout per page key
   applies everywhere. Rollout beyond Purchase Orders waits for owner acceptance of the pilot.
   **One layout rule (DEPLOYED and production SHA verified on all five surfaces (PR #1927, `a78e527c4`; deploy run 37293651075)):** `register/DataGrid`: every layout writer
   passes through one rule (`settleLayout`) — on a pristine layout pin, drag, hide or show changes only
   that column and default-hidden columns stay hidden until shown; an arranged layout keeps an empty
   hidden literal; `Reset columns` alone returns to pristine (PR #1927, `a78e527c4`).
5. **ONE ROW MENU (owner 2026-10-05) — DEPLOYED (PR #1928, `488a627a8`; deploy run 37297402433 succeeded with its five-surface SHA check); authenticated production walk owed.** Every register's right-click
   menu starts `View · Print` from the shared `documentRowMenu` helper — View opens the record's full
   read-first document page (Edit only when pressed), Print runs that record's existing print flow; an
   item is omitted where the record has no full page or paper. Module MASTER-approved items follow
   after one divider (Sales Orders: Cancel SO). Click, double-click and number links are unchanged.
   Essential actions stay discoverable on the record opened via identity; right-click is a shortcut,
   never the only door; read-only registers get no invented batch actions.
6. **Presentation.** Shared header, typography, palette, icons, row treatment and width registry; no
   separate page theme.
7. **Expansion and states.** Reuse the governed expansion; loading, failure, empty and filtered-empty
   stay distinct; collapsed records stay in totals; missing data never implies zero or completion.
8. **Group-local headers** — §6.10.
9. **Narrow canvas.** Filters use an overlay when they would consume the content; tables scroll inside
   their container; inputs, Back/Cancel and submit stay usable; Cards are an admitted presentation
   where the module offers Table/Cards.

**Facet counts — one reading for every page.** A count reflects every OTHER active filter and the
search, and NOT the selections inside its own group — the only reading under which a count never
promises rows it cannot deliver. Purchase Orders §9.3, Purchase Returns §9.6 and Supplier Claims §9.5
still spell three different readings: converging them is owed, each in its own round (§7.2).
*Falsifier: a measured journey in which whole-register counts read truer — then this changes once,
here.*

### Portal-wide listing readability

Current appearance and minimum measurements come from 01 §§1–5. All listings share that target; adoption is per page, not proved by old deployment records. Important facts never use disabled styling. Source-specific columns and words remain unchanged.

**Different jobs, shared interaction:** Sales Orders is the customer-transaction register; SO Batch
uses `To buy` / `No purchase needed`; Manual Purchase `Need approval` / `To buy` /
`No purchase needed`; Purchase Orders its §9.3 groups; Receiving is a formal GRN register, not a queue.
An operator sends a PO PDF outside, then records `PO sent to supplier` — recorded sending is not proof
of supplier receipt (Purchasing MASTER owns the send/version contract).

## §6.8 · Shared goods tables — SO Batch reference (Jess 2026-09-18, BUILT)

SO Batch listing and stock-picker composition is the approved reference for shared goods-table work;
business columns stay in the module MASTERs; no page gains editing or reservation powers implicitly.
Manual Purchase inherits the same capabilities (Purchasing §9.2). Engine capabilities (all opt-in):
`leadingColumns.before`; `headerTone` (existing API; map its presentation to current tokens); `GoodsMiniTable soBatchGoodsLayout`; `ReadyStockTable layout="picker"`.

- Use current 01 cell padding, typography and row minimums; maintain content-defined widths and vertically aligned checkbox/quantity controls.
- SO Batch keeps separate leading checkbox and goods-disclosure controls; `SO No` opens the record and
  never carries a decorative arrow; keyboard disclosure exposes its expanded state. A goods row's
  `Ready Stock` cell shows available then reserved with its own borderless disclosure; saved
  selections have one `Change selection` journey; the stock picker shows `PO No / Ref No` with the
  Unit ID on line two and the date only (six-column order in Purchasing §9.1). The parent listing has
  no `Ready Stock` column (owner 2026-10-05).
- **Two-line goods rows:** use current 01; allow source-required content to grow rather than clip. Historical measurements do not define new target geometry.
- **One cell may carry a document and the exact goods it names — never two documents.** Line one is
  the full document number; line two one Unit ID, `{n} Units` as a disclosure into that row's
  expansion, `Counted stock`, or the honest absence/failure word. Never fabricate a Unit ID.
- **Header bands never overlap or leave blank blocks:** every header cell belongs to one opaque band;
  paint order is shared (sticky header above body, pinned above unpinned, pinned header above both).
- **Row highlight** (owner ruling 2026-09-29, BUILT): `rowHighlight` draws a 3px left stripe —
  current semantic condition colour — with its label as hover title and `aria-description`; one row
  height, one word per cell; the reason prints where the row's details live; never paint the row.
- **Refused selection explains itself** (DEPLOYED + authenticated readback 2026-09-24, #1589):
  `selectable.unselectableReason` adds an accessible description and kit Tooltip to a refused box,
  explaining facts already visible on the page.
- **Evidence controls inside a row are icon + text, never buttons:** `Photos {n}` / `Video {n}`, 12px,
  hover/focus tint only, a focus ring, `aria-expanded`; each opens beneath its row independently; a
  count is never printed when unknown.
- **One shared saved-evidence viewer:** `SavedEvidenceViewer` (DEPLOYED #1593; fullscreen focus fix
  #1595; Receiving and Claim photos PRODUCTION VERIFIED; Stock/Service adoption separate). Read-only
  photo zoom/drag/Reset/Previous/Next/Close/Esc and native video; missing is not unreadable
  (`Photo {n} could not be loaded` + `Try again`); file-to-Unit/event relationships stay visible;
  recording evidence stays with the owning record.
- Production walks of SO Batch at 1440/1180/820/390 and 200% zoom are owed per Purchasing §9.1.

## §6.9 · Row expansion — one job, connected to its row

**The contract.** `▸` opens the record's **goods and related facts** as a structured read-only child
table (`GoodsMiniTable`) with real headings, aligned values and exact identity links. Expand has
exactly one job: it is **not a second Working Panel**, not an editing form and never concatenated
prose. Module-specific goods facts stay the module's (receiving and loading results are not forced
into Sales columns). Only explicitly ruled in-place write states (§4.1, Delivery) edit inside it.
SO Batch's separate `Purchase order details` table is deleted (owner ruling 2026-10-06): its PO
facts are on the row listing and each PO page — see Purchasing MASTER §9.1. The deletion is
Purchasing-specific and does not generalise to other modules.

**The connector belongs to the table (BUILT 2026-09-18 / 2026-09-21).** Only the grid knows where its
caret cell is, so the line is drawn by CSS inside that cell, never by arithmetic over declared widths
(measured failures: summing widths was ~900px wrong on wide canvases; anchoring the frame at a column
put it beyond the fold). The row-to-expansion line drops from beneath the `▸` (50% of the caret cell),
curves in the expansion's pinned gutter and runs flat into `ConnectedSections` at
`EXPANSION_JOIN_Y` = 21px; it holds under sideways scroll. An item's `Ready Stock` disclosure draws a
1px line from beneath its own cell to the TOP BORDER of its stock frame, which spans the full goods
row; it disappears when collapsed and never runs into the next item. The active goods context carries
the current selected-state boundary; the stock frame is neutral white; neither is evidence of a saved reservation. A
padded or viewport-fitted expansion (Delivery Monitor brief) keeps its own first elbow; a plain child
table gets no connector. 🟡 SO Batch's 40px goods header meets the line 8px above its middle;
`connectAt` 20px is Purchasing's follow-up.

**One expanded state per row; a second door is not a second panel.** A row-leading disclosure and an
in-cell disclosure (`Ready Stock` count, Supplier Claims `{n} Units`) open and close the SAME expansion
(`DataGridRowExpansionContext`); the in-cell door also moves focus to the part it names. A per-item
evidence disclosure inside an expansion is its own independent state.

## §6.10 · Group-local headers — owner ruling 2026-09-18 · BUILT (#1462)

A governed grouped listing reads, per group: collapsed = heading + count; expanded = heading → column
header → records. There is no header above all groups; the current group's header is sticky within
its own group and stops at its boundary. Every group shares ONE setting: the same widths, visibility,
sorting and resizing; sorting from any group's header sorts the whole register once. Pinned identity
is unchanged. It is the ENGINE's behaviour for every register handing the grid `fixedGroups` (SO
Batch, Manual Purchase, Purchase Orders); a flat register keeps one sticky header. Structure: each
group is its own `<table>` in one scroll container sharing one `<colgroup>` and `table-layout: fixed`
(one `<tbody>` per group was measured failing — the header escaped its section). A group header's
checkbox selects only that group's selectable rows (PR #1912). An always-open group states its
emptiness beside the zero through `fixedGroups[].emptyLabel` (`Need approval 0 · Nothing waiting for
approval`). *Falsifier: a browser where a sticky
`<thead>` is not constrained by its own table, or groups drifting out of column alignment.*

## §6.11 · Field-width registry — one number per field

**Migration note 11 Oct:** target widths by column type are 01 §5 (v12). The table below is prior implementation measurement evidence. Re-measure all adopted fields with 01 typography/padding before using them as new target widths. Preserve stable registry keys; do not copy literal old widths into pages.

A page MASTER never carries its own width for a registry field; it records its MEASUREMENT as evidence.
**The registry number is the WIDEST measured requirement across the pages showing the field.**
`MEASURED` = the rendered portal in the real font; `prototype` = not yet measured (a prototype that
clips a governed value is wrong — fix the shared definition, never squeeze the cell). Required numbers
never truncate; content may wrap; user resizing stays. **The registry is code:**
`apps/web/src/components/register/register-field-widths.ts` — a page passes
`REGISTER_FIELD_WIDTH.poNo`, never `168`. Owed convergence is each page's own round.

| Field / role | Width | Status | Evidence, and the convergence owed |
|---|---:|---|---|
| Checkbox / disclosure (each) | 40 | prototype | |
| Date (short date) | 120 | **MEASURED** | SO Batch cross-year 99px → 120; PO widened 118 → 120. **Owed:** Manual Purchase built 112 |
| PO No / MPR No / GRN No | 170 | **MEASURED** | `PO-20260903-4316` 125px in JetBrains Mono; 142 cut 34 live rows. **Owed:** SO Batch and Manual Purchase built 144 |
| SO No | 90 | **MEASURED** | Sales Orders 2026-09-21: `SO-1334` 54.6px + 16; header controls set the floor |
| SO No / MPR No mixed reference | 176 | **MEASURED** | PO, 2026-09-18 |
| Status | 144 | prototype | |
| Approval Status | 188 | **MEASURED** | Manual Purchase: `Sent back for changes` pill 134px + avatar |
| PO Safety Days | 110 | prototype | |
| Order By | 112 | **MEASURED** | Manual Purchase |
| Category (parent) | 112 | prototype | Sales Orders live 2026-10-05 renders Category at 208 — reconcile in the SO round |
| Stock Status (status pill) | 120 | **MEASURED — old words** | Sales Orders live 2026-10-05 cut the retired `Receipt unconfirmed` pill; re-measure against the Orders MASTER Stock Status words when they are built |
| Qty | 64 | **MEASURED** | header floor 24px + 16 |
| Item / Items | 208 | **MEASURED** | PO 2026-09-18. **Owed:** Manual Purchase built 180 |
| Supplier / Ready Stock | 140 | **MEASURED** | longest live supplier 17 characters; PO widened 136 → 140 |
| Supplier Deliver To | 150 | **MEASURED** | PO. **Owed:** Manual Purchase built 132 |
| Customer | 150 | prototype | one line; a longer name ends in `…` and opens whole |
| Sales Location | 168 | **MEASURED** | `Carres Kota Damansara` 145.4px + 16 |
| Salesperson | 120 | **MEASURED** | `Khoo Aik Yean` 89.2px + 16; header + filter icon 103px floor |
| Sales Orders optional catalog: amount 116 · party name 150 · reference 150 · phone 132 · email 200 · address 240 · place word 140 · short fact 96 · small count 120 | — | prototype | registry roles, not typed numbers. **Owed:** measurement when shown by default |
| Customer Delivery Location | 176 | prototype | |
| Customer Requested Delivery Date | 180 | prototype | **Owed:** re-measure against the longest governed absence |
| PO Delivery Date | 150 | **MEASURED** | wording `PO {n}-Day Delivery Date` (Purchasing §5.7, COPY own the rule) |
| Supplier Confirmed Delivery Date | 180 | **MEASURED** | holds `Not confirmed` and `Supplier changed from {date}` |
| Goods Received Date | 140 | **MEASURED** | holds `{n} receipt dates` and `Time not recorded` |
| Purpose | 150 | **MEASURED** | Manual Purchase |
| Requested By | 144 | prototype | **Owed:** Manual Purchase built 124 |
| Stock Location | 160 | prototype | |
| Unit ID standalone | 140 | prototype | |
| Condition | 120 | prototype | |
| PO Version with send evidence | 265 | **MEASURED** | `PO sent to supplier · WhatsApp · Wed, 28 Sep` needs 247px at 11px |
| SO No / MPR No / CO No / RO No | 176 | prototype | Receiving; several references stack as lines |
| Goods arrived at | 150 | prototype | a receiving SITE, deliberately not `Stock Location` |
| Received / Damaged / Wrong Item / Extra Qty | 112 | prototype | one family, one width |
| Supplier DO No | 150 | prototype | supplier's own reference; a longer one wraps |
| RO No | 170 | prototype | apply the two-digit-year display rule before re-measuring |
| Supplier Claim No | 150 | prototype | §9.5 measurement 122.8px + header chrome |
| Cost Responsibility | 144 | prototype | a responsibility WORD, never an amount |

**The goods table is the second scope of the same registry:** its numbers live in `GoodsMiniTable`'s
`CHILD_COLUMNS` — Category 132 · Unit ID 140 · Deliver To 200 · SKU 152 · Qty 64 · Supplier 140 ·
`PO No / Unit ID` 230 · Item flexible, floor 220. Exactly one goods column is flexible, always last.

---

# §7 · Exceptions, real gaps, kit gaps and proposals

**This is the one exceptions list.** An item here is current; when it is decided or built it moves
into the section it belongs to, and this list loses it.

## §7.1 · Approved module-specific exceptions — no other module copies them without its own ruling

| Exception | Owner ruling | Owner of the detail |
|---|---|---|
| Delivery Monitor: 72px two-line rows; in-place panel write state in the expansion; `Delivery Status` word set | 2026-09-12 / 09-13 / 09-14 / 09-25 | Delivery MASTER §§8.3–8.5 |
| Delivery Orders: DO brief recorded in place (two columns ≥1024px) | 2026-09-26 | Delivery MASTER §8.7 |
| Delivery schedule card: two facts on two lines + type label | 2026-09-14 / 09-25 | Delivery MASTER §§8.2, 8.4 |
| SO Batch Purchase and Manual Purchase: their own approved listing designs (§6.8); the PO Duty owner chip only beside the selected `Issue PO` (`YJ`), Export at the far right | 2026-09-18 | Purchasing MASTER §§9.1–9.2 |
| SO Batch `PO No` cell: every linked PO on one line, comma-separated, each its own link, 170px, no wrap (DEPLOYED #1924; signed-in check owed). Sales Orders' `PO No` cell follows the same rule (owner 2026-10-06, NOT BUILT); Sales Orders' `DO No` is unchanged | 2026-10-05 / 10-06 | Purchasing MASTER §9.1 |
| Supplier Claims leading order `☐ · ▸ · Claim status · Supplier Claim No · Claim Reported · …` (status leads; date never pinned; `pinnedPrefix`, BUILT on branch 2026-09-29) | 2026-09-18 | Purchasing MASTER §9.5 |
| Purchase Orders rail: section icons (message/goods/supplier/warehouse, 16px, aria-hidden), no `Clear filters`; Purchasing `reserveConditionRow` | 2026-09-18 / 10-02 | Purchasing MASTER §9.3 |
| Purchase Returns rail reuses the Supplier Claims supplier list | 2026-09-18 | Purchasing MASTER §9.6 |
| Repair Orders: automatic RO Doc Date (no backdating), 14-working-day target from evidenced supplier receipt; all Unit IDs shown beneath their PO (row may grow); optional `Price` only in create/detail; outstanding owner consent shown in detail + Workspace, never disabling Issue (APPROVED TARGET / NOT BUILT) | 2026-09-19 / 09-20 | Purchasing MASTER §9.7 |
| GRN document composition and arithmetic; `Received Qty` versus `Physical arrived Qty` (NOT BUILT) | 2026-09-23 | Purchasing MASTER §9.4 |
| Warehouse `Monitor · Inbound · Inventory · Outbound`: Inbound/Outbound on the 240px rail + register grammar; column `wrap` and `expandable.trigger` opt-ins | 2026-09-06 / 09-07 | Stock MASTER §7 |
| Sales Orders rail: no `Clear filters` inside; dealer/product multi-select is an SO-specific target not yet in the kit (NOT BUILT) | 2026-09-22 | Orders MASTER |
| Sales Orders goods summary: `+{n}` counts remaining goods LINES (never quantity) and opens a read-only `SO-{n} · Items` goods inspection Drawer (BUILT, `GoodsSummary`; §4.1) | 2026-10-01 | Orders MASTER |

## §7.2 · REAL GAPs and conflicts — need a decision; none is silently resolved

| Gap | The conflict | Next step |
|---|---|---|
| Card editable `To` vs Work recorded channels | `CompactModuleCard` Communication offers an editable `To`; Work's `WorkCommunication` allows recorded channels only (owner ruling 2026-09-17) | Owner decision |
| `Jump to…` empty word | The locked contract prints `No results`; COPY-STANDARD rule 5 lists `No results` as the ✘ empty-state example. Reconcilable (a search matched nothing; a worklist is empty) but COPY does not yet carry that split | COPY ruling |
| Facet counts spelt three ways | PO §9.3 (whole register), Purchase Returns §9.6 (respect other dimensions), Supplier Claims §9.5 (complete searched/filtered set) versus §6.7's one reading | Converge each page in its own round |
| Shared Select long option at 390px | measured right edge 420.72px beyond the viewport (research file §9) | Kit fix |
| WarehouseIncoming modal close | focus lands on the page, not the Count trigger (research file §9) | Adopt `DialogFrame` focus return |
| Picker inside a dialog renders UNDER it | a real P1 defect, approved, not built | Kit fix |
| **Opened row: v12 frame vs §6.9 connector** | 01 §5 (v12, owner 14 Oct 2026) draws an opened row and its items as one box (1px `#CBD0D6` frame, corners 8, 8 above and below); §6.8–§6.9 (owner 2026-09-18/21, Purchasing reference) hang the expansion flush under its row with a 1px connector from the caret. Since 15 Oct 2026 the engine can draw the frame (`expandable.frame`): Sales Order Outright keeps it, every other list keeps the connector or flush item rows | Owner/Design: confirm the v12 frame replaces the §6.9 connector on every list; then each list turns `frame` on. Recommendation: the v12 frame (the latest explicit look; one frame is simpler to read than a connector), keeping §6.9's flush item columns |
| **List header case** | COPY approves sentence-case headings for the Sales Order view (`Proceed date` · `SO no.`, 14 Oct 2026) and SO Batch/Forecast already read sentence case; other lists still read Title Case (`Proceed Date`, `PO Delivery Date`). Design's Round 4 log (K1, 15 Oct 2026) asks for one rule for every list | Owner decision, once, for all modules. Recommendation: sentence case everywhere (the v12 look, already live on the three newest pages); COPY changes each heading in one pass |
| **Customer lookup placement** | The caller-lookup capability (name/phone/order number across all a customer's orders and recorded history) is approved 2026-09-24/26; its rail door was removed 2026-10-05. Tasks → `Sales Order` tab shows only the linked SO's customer | Owner decision on where the cross-order lookup lives (PROPOSAL in §5) |

## §7.3 · KIT GAPs — admit once, never draw locally

- **v12 pieces with no shared component yet** — choice chip, theme chip, one shared record link,
  item-row control and staff avatar; the segmented look for Tabs and the selection bar on the
  shared toolbar are restyles of existing components (02 "Shared pieces of the current kit").

- **Mission rail composition** — `.so-template-rail` + SO selectors are not a kit export (§6.1).
- **Generic ObjectHeader / ObjectPage** — `SalesOrderTabs` and `FullFact` are page-owned (§4.1).
- **Expansion columns in the Columns menu** — PROPOSAL `expandable.columns` (§6.3); Purchasing's demo
  uses `Goods: …` Page tools items (words pending) and a proposed registry width `unitWithPo: 260`.
- **A link-style button inside the card** — SO numbers inside card content fall back to a ghost
  `Button` (reported by Purchasing).
- **Virtualization with expansion or groups** — flat lists only today (§6.2).
- **Page-level Wrap tool** — only per-column `wrap` exists.
- **Account-saved layouts beyond Purchase Orders; kit `DataTable` layout memory** — APPROVED TARGET /
  NOT BUILT (`OperationOrdersControl.test.tsx` measures the DataTable gap).
- **Shared region error/permission recipe** — component adoption and full-page states still require proof (01 §8).
- **Touch targets** — existing consumers must pass §2.2; a drawn glyph size does not prove the control hit area.

- **Accessible assignment avatar** — the avatar-only hover/focus/tap identity contract has no shared
  component.
- **`/ui` whole-page coverage** — Register, Working Panel and Object examples with all responsive and
  failure states still need an audit; component examples are not complete-page evidence.

## §7.4 · PROPOSAL / NOT LAW — challenge, never obey

| Proposal | Source | Falsifier / decision owed |
|---|---|---|
| How `Tasks` coexists with Calendar, Activity and the page's work (same-area replacing is one option, not decided); Calendar must stay quickly viewable while handling a task | owner direction 2026-10-05 | Under research; owner review |
| Reduced motion: animations respect the operator's reduced-motion setting | consolidation review 2026-10-05 | Owner/kit decision; no rule until approved |
| Confirm before an act that cannot be undone, in COPY wording | consolidation review 2026-10-05 | Any word change goes through COPY |
| Expansion-only Columns (opt-in goods columns, OFF by default) | Purchasing 2026-10-05 | Owner has not decided (§6.3) |
| "Several SOs → list first, then one" inside a host panel | Purchasing 2026-10-05 | Owner decision |
| PO working panel and round panel content layouts; SO Batch round rail; `Match Ready Stock` placement; SO Batch optional goods columns replacing the details table | Purchasing lane, localhost | Owner review in the Purchasing lane |
| Purchasing fit review — four cross-module contracts: linked sections distinguish loading/error/empty/present/denied; current, last-sent and goods completion are separate facts; blocker summaries point to the exact row/field and keep the draft; source/Unit evidence stays traceable | Purchasing PLAN 2026-10-01 | Verify against existing components; Purchasing owns its sample |
| Specimen words: sentence-case list headers (`SO no.`, `Proceed date`), `Customer’s original requested delivery`, `Log contact`, `Request amendment`, `Waiting for Jess`, `Staff and duties`, `Order PO deadline`, `Supplier ready by`, `Delivery ETA`, and its date, time and money formats | `Sales Order.zip` (12 Oct 2026) · 01 §10.2 | COPY-STANDARD stands; any word change goes through COPY |
| Specimen business rules: which amendment changes skip approval, the stair carry fee formula, batch cut-off times, outstation logistics order, task completion and undo | `Sales Order.zip` (12 Oct 2026) · 01 §10.2 | The owning module MASTER stands; owner ruling in that module |
| v12 values the package does not settle: main button hover `#2B2B55`, choice chip unselected fill `#F2F3F5`, pressable Summary rows | 01 §10.1 | Overturned when the owner names the other value |
| Inventory top-filter placement (instead of a rail) | research file §4 | Complete compact-top versus rail analysis |

## §7.5 · Approved targets not yet built (shared)

Shared Tasks-region adoption plus retained Calendar/Activity integration and all-module calendar filters (§5) · `Assigned to` /
`Completed by` wording (§5.1) · mission entries on module rails (§6.1) · `Warehouse` tab (§4.3.4) ·
personal saved-layout rollout (§6.7) · facet-count convergence (§6.7) · SO dealer/product multi-select
`base-*` → kit palette (4,661 sites; page by page with the page migrations, never globally) · real
pages on `PageShell` / `DataTable` / `DetailShell` (the order drawer is BLOCKED: L4 needs a facts
4-tuple that does not exist) · splitting the grid's `layout` prop when a page needs resize without
reorder · `SavedEvidenceViewer` adoption in Stock and Service.

## §7.6 · Rejected or withdrawn — do not revive

`warehouse-ui-preview.html` (hand-written shell, blue summary box, concatenated goods expansion —
rejected by the owner) · `inbound-flow.html` (not accepted as a build reference) · the 48px toolbar
candidate · the unapproved alternative palettes, 9px essential labels and 700 weight ·
a generic full-order editing drawer beside the Working Panel · `DetailShell` as a cross-module shell ·
the always-visible icon-only Export/Columns toolbar (replaced by `⋯`) · the former quick-view `Block`
composition (replaced by `CompactModuleCard`).

## §7.7 · Measured debt

**One table (15 Oct 2026).** Sales Order Outright moved onto `register/DataGrid` and `carres/CTable`
was deleted. The engine took what CTable had (🟡 COPY REQUIRED, no engine gap): the page's own pager
footer through `statusSummary` (`CListFooter`), a column as wide as its longest value (`fitContent`),
the opened row's frame (`expandable.frame`), header value filters held in the page's address
(`serverColumns.selected`), the page's own toolbar row (`hideToolbar` + `openColumns`), and the row
tick and chevron in the page's words (`selectable.rowLabel`, `expandable.label`). A two-line header now
stays inside the 40 header on every list (01 §5). `kit-outright.spec.ts` measures the engine's real
table; `carres-align.js` still reads the toolbar and the dates.

**Type outside 01 §2 (measured 15 Oct 2026).** Pages move by role, never by a blind 11px swap: a
label or second line is 12 / 400, a caps label 11 / 500 .06em, a table header or pill 12 / 500, 600 only
on identifiers, the record number and main buttons. Done: Delivery, Warehouse, Stock, the left rail,
caps labels, pills and the side menu (#2078, production carres-check PASS at 1025 · 1164 · 1440 on
Delivery Orders, Delivery Monitor, Outbound, Inventory, SO Batch and Outright); SO detail, Order Route,
Delivery brief, Purchasing and Receiving (#2080, production PASS on Purchase Orders and Receiving at the three widths). Left: the legacy old-orders files, Finance (144
sites), Principal (106), Supplier portal (85) and HR (59); `sales-order-route.ts` sizes its wrapped
lines for 11px text.

**Old Sales Order register retired (15 Oct 2026).** `SalesOrdersRegister.tsx` (unrouted since 8 Oct)
and `DestinationHeader.tsx` were deleted after every approved capability was on Outright or replaced
by a later owner ruling. Moved onto Outright: per-column sort, `Columns`, `Group by` (Delivery, Stock,
Payment Status), the row menu `View · Print · Cancel SO`, clickable PO, Delivery Order and Receipt
numbers, header value filters in the address. Replaced by owner rulings: the row quick card and Cards
(row click opens the full Sales Order, owner 9 Oct 2026), the rail's money summary and money footer
totals (Summary panel and the quantities footer, v12 11 Oct and fix list 14 Oct), the role money
default (the views and `Save as my view`, handoff 8 Oct). Monthly demand lives on Purchase Orders and
opens Outright narrowed (PR #2075). The SO quick card part (`SalesOrderCompactView`) is kept but has no
entry point; whether another page opens it is a product decision for the Sales Order lane.

**Colour** (measured 2026-07-29): 6,385 colour sites; after the ruler shipped 5,545 of 6,129 measured
(90.5%), rules O 4,661 · P 594 · Q 111. **Typography:** the `t-*` ramp is retired; sizes carry weight
and line-height in ONE class. **The kit's own coverage number may never go down.** The grid's render
cost is linear in rows and flat in density (research `grid-findings.md` F64–F70): a windowing
question, never a row-height one.


---

<a id="kit-values"></a>

## Values and measurements · former 01

**Historical specimen provenance ·12Oct2026; superseded visually by the24Oct shared template above.** This replaces every earlier value in this file; there is no second version. Every kit the owner hands over replaces the kit: this file, 02, 03, UI MASTER, the token mirror and the specimen are updated together and whatever the new kit contradicts is deleted (owner 12 Oct 2026). Source: the folder `design_handoff_sales_order_ui_kit` handed over on 12 Oct 2026 at 5:35 PM, which replaced that morning's `Sales Order.zip` (`README.md` with its `Fix now` list and its section 5 on Purchasing, `UX-FLOWS.md`, `docs/Carres Layout Standard.md`, `carres-theme.js`, `carres-check.js`, `carres-tasks.js`, `Carres UI Kit.dc.html`, `Carres Screen Map.dc.html`, `Carres Shell.dc.html`, `Carres Table.dc.html`, `Sales Order Outright v12.dc.html`, `Purchasing v3.dc.html`, `Settings v2.dc.html`, `Workspace My Tasks.dc.html`). The specimen was replaced again on 13 Oct 2026 by the round 3 package (`Sales Order (7).zip`, with `docs/CODE-BRIEF-13-Oct-round3.md`): no token changed; `Workspace v3.dc.html` is the only Workspace page and `Workspace v2.dc.html`, `Workspace My Tasks.dc.html` and the two earlier fix lists are deleted. This is a design adoption, not a claim that the React kit or production has migrated.

Business facts, permissions, completion gates, document formats and exact words remain owned by module MASTERs and COPY-STANDARD. Where the package conflicts with COPY-STANDARD or a module MASTER, its value is PROPOSAL / NOT LAW (§10). The supplied Ops Rules are not stored in this repository. The specimen's sample pages use TEST customer details.

## 0 · One kit and implementation boundary

| Home | Purpose | Status |
|---|---|---|
| This file | Shared visual values | Current target |
| `docs/ui/carres-tokens.css` | Machine-readable target token values | Current target; not wired into the application |
| `docs/02-components.md` | Shared component contracts | Current target |
| `docs/03-page-patterns.md` | Shared page compositions | Current target |
| `docs/ui/MASTER.md` | Interaction, ownership and acceptance | Current authority |
| `apps/web/src/styles/carres-tokens.css`, `components/kit/`, `components/carres/`, `components/register/` | Running implementation | Current components and remaining migration debt; use 02 and UI MASTER §7.7 for scope, not a blanket old-kit claim |
| `docs/ui-reference/sales-order-design/` | Supplied specimen (files refreshed from the 13 Oct 2026 package; no token value changed) | Reference only; not production code or business law |

Use tokens, not page-local numbers. Change the shared components once; never clone the specimen into a module. The frame, sizes, widths and cell formats never change per module; a module only chooses its content. Git keeps the old values; no archive or second kit is created.

**Measurement context:** values are CSS pixels. The specimen is measured at 1164 × 715 and must pass at 1025, 1164 and 1440 wide. Desktop only; no phone breakpoint is supplied or claimed. Hit areas are at least 32 on desktop and 44 on mobile and partner surfaces.

## 1 · Colour

Use Template2 in **Current shared template ·30Oct2026** above. One shared palette; no personal themes. Do not use the retired no-red policy or older selection/status pairs.

## 2 · Typography

Use Template1 above for every role, case, tracking and permitted size/weight. Material Symbols are icons, not text. Missing values follow the reconciliation table; no old `Not recorded` role.

## 3 · Controls and surfaces

Use Template3–6 above. Existing accessible names, focus isolation/return, draft/discard, disabled explanation, keyboard and mobile hit-area contracts remain. A32px visual control does not reduce the existing44px touch target.

## 4 · Shell

Keep the shared56px top bar,64px compact navigation,36px page toolbar and existing navigation tree. Use the current template for control, avatar and panel roles. Below1100, contextual panels overlay without subtracting the main canvas. Summary retains its existing scope/width unless separately re-ruled. Tasks is340 wide; do not add the old332/320 wrapper recipe. Preserve page state, drafts and focus through every open/close.

## 5 · Register

One DataGrid. Header32, rows minimum44 and the current template typography/geometry. Expanded rows may grow for full identity, exact quantities and long content. Preserve source-owned search/filter/sort/group/selection/export, frozen identity and return context. All-columns views may scroll within the table; no page overflow. A partial loaded population must not claim whole-register search/count coverage.

## 6 · Settings

Plain grouped rows: name and purpose on the left, value on the right; no box around every setting. Read-only values are plain text. Edit controls appear only during editing. Authorized staff can fill a missing approved setting; `Not set` does not itself remove edit permission. Unapproved business rules remain visibly unresolved. IDs, source, permission, effective treatment and history belong in the detail or disclosure, not repeated in every row. Timing changes do not silently rewrite existing deadlines. The Settings sections are a left section list, never a row of top tabs that wraps (owner 11 Oct 2026); the segmented control is used only for the groups inside one section. Never two facts in one box: a number per category is its own row with its unit (`Production days · Mattress`, a number, `working days`; owner 12 Oct 2026). A group is its title and one line above one bordered list; each row is the setting's name with one short explanation on the left and its value on the right.

<a id="kit-measurements"></a>

## 7 · Canonical component measurements — executable checklist

The single current measurement table is **Current shared template ·30Oct2026**, Template1–7 above. Earlier duplicated numeric tables are removed. For each role record value, trigger, shared component, `/ui` example and CONFORMS / DEVIATION / NOT APPLICABLE in the existing handoff. Spec/checker disagreement is not PASS.

### 7.1 Shell and controls

Use Template4/6 and the Shell interaction contract in§4. Keep inherited viewport rules only where the new template does not override them.

### 7.2 Inputs and toolbar

Use Template1/3/4/6; unchanged field/input measurements from the21Oct intake remain where not re-ruled: input32, label12/400, field radius6, search34, standard/action/viewer dialogs640/560/880. No caller-local variant.

### 7.3 Surfaces

Use Template3/4/6. Ordinary menus remain250 wide with32px rows and existing accessible keyboard/viewport behaviour. Toast remains ordinary3.2s/task-close12s, bottom centre. No personal Appearance picker.

### 7.4 Goods tables

Use Template1/3/4 and the one DataGrid/ItemRows engine. Keep the approved first-column Item expansion, Qty and at most three contextual facts, with source-owned quantities and full Unit identity. Header32 replaces40 in both parent/detail tables.

### 7.5 Accepted SO-derived template — measurement lookup

Use Template1–7 and its reconciliation table. SO/Purchasing document-bearing records retain50:50 at available content820+ and stack below; do not impose this object composition on all modules. Keep existing exact-version document/evidence and source-scoped action contracts.

### 7.6 Compact module card — CompactModuleCard

| Check | Contract | Owning entry |
|---|---|---|
| Surface | Same card/control/type/colour values above; never copy reference HTML CSS | components/kit/CompactModuleCard.tsx |
| Identity and facts | Host identity, source-linked facts, honest missing/error/permission states | Owning module adapter |
| Actions | Existing permission and writer; saved result comes from module | Owning module MASTER; no generic Done |
| Content disclosure | Preserve unique facts and controls; narrow stacking does not remove them | Current module contract in02/03 |

**New-chat execution checklist:** read CLAUDE → UI MASTER §0 current index → this §7 plus §§1–6 for the used roles →02 component API →03 composition → owning MASTER/COPY. Select the actual shared component before implementation. For each used property fill approved value/trigger/component/example; missing values stay UNRESOLVED. No second MASTER, no copied page skin, no invented values. UI MASTER §2.2 owns the UX state contract. Kit standards, page adoption and deployment are separate outcomes.

## 8 · Verification and migration gaps

| Item | Required evidence before a completion claim |
|---|---|
| Runtime token migration | Shared tokens, CSS, component examples and consumers match §§1–5; the application token file equals `docs/ui/carres-tokens.css` |
| Running app against this kit (12 Oct 2026) | Follows the kit: default theme Blue; one page ground `#F6F7F9` in every theme, a theme changes only the selection colours; ink, greys and lines; main button `#1B1B39`; errors amber, no red; hover and table row hover; side menu (§4), menu and top bar hairlines; the segmented control for every `Tabs`; type pairs 20 / 600 and 15 / 500. Local shared-token reconciliation 15 Oct: neutral pill fill `#E5E7EB`, menu shadow, default menu width 250, menu groups 11/500/.06em and page-title tracking −.01em are implemented and browser-measured; not deployed. Still on the previous build: the Tasks title row, the Summary panel on lists other than Sales Order Outright, the opened row's one frame on lists other than Sales Order Outright (the engine draws it since 15 Oct 2026; pending UI MASTER §7.2), the muted grey. Focus chooser removal and fixed 2px Blue focus are locally implemented 15 Oct; Button/input computed focus and chooser removal browser-verified; release and remaining custom-control adoption stay scoped in the existing handoff. The list engine took the header band `#F8F9FA`, 10 between columns with 14 at the edges, ▸ before ☐ and the 24 round chevron on 15 Oct 2026, and Sales Order Outright moved onto it the same day (a two-line header now stays inside the 40 header on every list) |
| Measured rules | `carres-check.js` ported to automated tests and passing at 1025, 1164 and 1440 wide on every state in `UX-FLOWS.md`. **Started 12 Oct 2026:** `pnpm kit:check` (`e2e-kit/`, run by CI) measures the kit lists already moved (SO Batch Purchase `By supplier`, Purchase Orders `Overview`) at the three widths, rows closed and one row open: no page side scroll, no list side scroll, the last column inside the list, nothing cut. The rest of `carres-check.js` is not ported yet and most screens would not pass it |
| Type | Only the §2 pairs appear; 20 / 600 once per page |
| Rows | 40 / 54 / 44 / 36 exactly; no cut text; no side scroll except the two 8-column views |
| Overlays | Menus, dialogs and toasts never clipped |
| Theme | A theme change alters only the selection values |
| Shared pieces | Shell, Table and detail page are shared components; Sales Order and Purchasing use them with no copied layout code |
| Register and full object | Realistic long records and document links |
| Desktop / narrow / keyboard | UI MASTER §2.2 full-page checks, zoom, focus, scrolling |
| Specimen | Demonstrates design only; sample facts and simulated permissions do not prove production |

Source: the folder handed over on 12 Oct 2026 at 5:35 PM (it replaced `Sales Order.zip`, SHA-256 `793931a7922b24155b963593139bd13c960fb101072edd8fdc94d5618164fe59`, of that morning).

## 9 · One shared appearance

Personal themes are removed by the owner23Oct2026 and the latest-kit adoption24Oct. Everyone uses the same shared appearance defined above. Retire the chooser, theme chips, alternative palette table and per-person theme application requirements. Source files that retain those mechanisms are superseded implementation residue, not authority.

## 10 · Supplied-package conflicts

The current package's conflicts and evidence limits are resolved in **Reconciliation and limits ·24Oct2026** above. Earlier intake conflict tables are retired; Git holds them. Prototype implementation, owner design approval, React implementation, backend verification and production verification are separate states.

<a id="kit-components"></a>

## Components and reuse · former 02

**Current shared target · owner instruction 12 Oct 2026 · supplied 12 Oct.** Appearance comes exclusively from `01-design-tokens.md` and `ui/carres-tokens.css`. Replace existing kit internals; never create page-local copies. Existing component APIs and business contracts remain until deliberately migrated. Prototype HTML is a specimen, not application implementation.

## Component register

| Component family | Existing home / adapter | Current contract |
|---|---|---|
| Page shell and header | PageShell, GlobalTopBar, ModuleHeader | Conditional navigation/summary/tasks regions; current shell tokens |
| Navigation | PortalSidebar and portal-nav | Current module/page600 in theme colour on selected pill; resting module500/page400; authorised tree; long names wrap; scroll without shrinking rows |
| Register | components/register/DataGrid | Header40, parent/group54; cell lines do not wrap; identifier/customer subtitle follows the explicit second-line exception; shared sort/filter/resize/select/group/expand capabilities |
| Bounded / goods tables | DataTable, DocumentTable, GoodsMiniTable | Shared tokens; preserve source-specific quantities and connected records |
| Object header / tabs | Existing module object adapters and Tabs | Identity, status, owner, authorised actions, module-specific views |
| Card / sections | Block, SectionHeader, CompactModuleCard | Light bordered surface, plain facts, headings; no alternate module palette |
| Working Panel | Drawer and CompactModuleCard | Host-owned identity; Info plus module-owned work; retained draft; current visual tokens |
| Tasks | Existing work components and right-rail adapter | Task, reason, owner, deadline, proof, recorded outcome and next action |
| Buttons / menus | Button, CMenu and CPopover (`carres/CPopover`) | One `#1B1B39` main button per area; white word buttons; round icon-only buttons with no border; one 250 menu design for every ⋮, columns and filter menu |
| Inputs | Input, Textarea, Select, Checkbox, DatePicker, FieldFrame | Shared dimensions and validation; preserve valid input on failure |
| Status / count | StatusPill and Badge | Soft status pairs; Hold dark; in table rows a pill only for amber and green, plain text otherwise; words never cut; counts separate |
| Evidence / PDF | SavedEvidenceViewer, PdfPreview | Saved source versus draft evidence; failure and retry; no invented document |
| Dialog / drawer | Modal, DialogFrame, Drawer | Focus trap, Escape where safe, focus return; no hidden unsaved loss |
| Feedback | Toast, EmptyState, Loading | Outcome-specific words; errors beside affected action; no false success |
| Route / history | RouteStop, module history adapters | Actual source-owned facts; parallel paths; immutable recorded events |
| Task steps | StepList, Step | The numbered steps of one job (owner's 12 Oct 2026 package): a 20px round mark, a 13 / 500 title, one 12 grey line and the step's own controls, a hairline between steps. Done is green with a tick, the step to do now is dark, a later step is white with the chip border. The marks show where the person is and never record anything; the act stays one named button. A step's button drops under its words when the room is narrow (the Tasks panel at340), so neither is squeezed or cut |
| Task view | TaskView, TaskToast | The ONE shape of an opened task (owner's round 3 brief, 13 Oct 2026; 03 §8): the task at 13 / 500; its module icon, page and record with the owner's initials at the right, the record being the door to its page; one row per fact in one grid (icon 16, label as wide as the longest and at most 104, then the value), amber only on the fact that has gone by, and a fact may open its own detail under its row; then the segmented tabs. The first tab is the owning module's work and stays mounted; another tab is drawn when it is first opened. The view reads nothing, writes nothing and closes nothing. `TaskToast` is the dark toast after a task closes (01 §3): bottom centre, 12 seconds, `Next: {party} ›` when another task waits, ✕, never `Undo` |
| Settings | Shared page/row/form components | Plain row groups; edit mode, access, current value, treatment and history |

## Runtime reuse directory · 15 Oct 2026

| Need | Existing shared entry | Rule |
|---|---|---|
| List, selection, sort, filter, expansion | `register/DataGrid`, `register/ItemRows` | One listing engine; no CTable or copied HTML table |
| Model/specification cells and list totals | `carres/CCell`, `carres/CListFooter` | Module supplies facts; shared renderer supplies presentation |
| Detail order lines | `carres/COrderLines` | Different job from a register; preserve order-line arithmetic |
| View, panel and icon tools | `carres/CToolbar`: CViewButton, CShowPanelButton, CIconButton, CChip | Reuse the exported control; do not rebuild its wrapper/skin per page |
| Menus and small floating panels | `carres/CPopover`: CMenu, CMenuItem, CMenuGroup | Retired DropdownMenu/kit Popover are not alternatives |
| Status rendering | `carres/CPill`, `kit/StatusPill` | Two caller-tone adapters already share PILL_SHAPE and kit/tokens; one visual implementation. `/ui` shows the current CPill gallery once. |
| Forms, dialogs, documents, task view | Existing `kit/` families in the register above | Preserve behaviour and source ownership during visual adoption |
| Glyphs | `carres/MIcon`, semantic `kit/Icon` adapter | One approved glyph family; preserve semantic names, accessible labels and consumer APIs |
| Live catalogue | `pages/dev/UiShowcase.tsx` at `/ui` | Imports actual runtime components with TEST examples; it is not a separate implementation |

### Source-checked control contracts

These describe the measured implementation, not new approved values. The acceptance gaps remain in the existing handoff matrix.

| Entry | Preserved caller API and behaviour | Measured adoption boundary |
|---|---|---|
| `kit/Button` | `variant=primary/neutral/ghost`, `size=md/sm/touch`, `iconOnly`, `shape`, semantic `icon`, `loading`; forwards its ref and native button props. Busy disables input. No caller `className`/`style` skin. | Desktop md32/sm28/touch36; below768 all44. Icon-only32 desktop/44 narrow, actual glyph20; word glyph18. Main600, disabled45%; neutral hover #EDEFF2; icon hover .10/pressed or open .16. Standard word roles target32; small28 remains explicit, touch/mobile targets remain44. Runtime adoption is a separate IT deliverable. |
| `carres/CPopover` | Controlled/uncontrolled open; trigger, label, align, explicit width, menu/panel roles. CMenu consumes command data and returns focus; disabled commands do not invoke actions. CMenuItem retains checked/strong/note adapters. | Default menu250 with available-viewport cap; explicit picker widths retained. Item32 desktop/44 narrow, ordinary13/400, selected/strong500, disabled45%. |
| `tasks/TaskFiles` | Owning module supplies lazy `TaskFile.load`; View and Download use that reader. Viewer retry calls the same reader, retains failure on a second rejection, and ignores stale responses after close/file change. | `work-preview` seeds only its exact order's existing Sales Order data reader. `file=failed`/`file=retry` exercise source failure. Fixture rendering is not production permission or document acceptance. |
| `kit/Modal` task-wide review | Existing full-surface task review uses `variant="task-review"` through the same DialogFrame as other modals. Full viewport, no duplicate visible header/Close/padding; the owning form retains Save/Cancel, draft, submission and result rules. Escape/outside do not discard this review. | `useTaskDesk.host.openReview` serves BatchPanel, SupplierAnswerTaskPanel and the PO-duty/Delivery task adapters. Shared Radix focus trap, background isolation, scroll lock, return focus and dialog-contained pickers replace its hand-written portal. `/ui` Dialogs includes the actual shared variant with TEST input. Ordinary Modal/Drawer dismissal is unchanged. |
| `kit/field-recipe` / `floating-surface` | Existing controlClass single/multi/pill/toolbar shapes, labels, validation and source callbacks remain. Interactive controls have min-height44 below768; CONTROL_BASE remains height-free for callers that skin read-only facts. Select list options also have mobile min-height44, disabled45%. | Personal `/ui`390 measurement: input/error/Select/search/date44, textarea68; three Select options44, disabled opacity.45, page390. Desktop1440 single fields32. Actual Delivery task date/time/source triggers44 at390, no page overflow. Monitor rail's 216-wide/28-day adapter remains a separate mobile acceptance gap. |
| `kit/DatePicker` field calendar | ISO in/out and minDate gates retained. DayPicker autoFocus starts on its selected enabled day or today; arrows move dates, selection closes and returns focus to its trigger. Field pop-up adds44×44 day and month-nav targets below768; exported shared skin and Monitor's distinct adapter are retained. | Personal390: pop-up320 wide at x45, height346, all measured day/nav44×44, page390;1440 days32×32. Enter opened19Oct, ArrowRight focused20Oct, Enter selected `Tue, 20 Oct` and returned to trigger. Monitor phone layout remains unverified and incomplete. |

Direct absolute-import inventory (15 Oct source scan, excludes test/spec, `src/dev` and `pages/dev`, does not count relative imports or re-exports): Button131 files; CPopover17; Icon29; DataGrid54; ItemRows4; TaskView2; StatusPill19; CPill3. These are source consumers, not accepted pages. ItemRows callers are Outright, SO Batch by order/by supplier and Forecast; TaskView callers are TaskFrame and its task-view adapter. Preserve their different capabilities before retirement.

Outright return-context consumer wiring: its caller retains account-scoped, tab-lifetime page/pageSize/sort/selection; URL criteria remain authoritative. It now passes existing DataGrid sessionKey and a query/page/size/sort presentationKey for expansion, active row and scroll. A changed criterion or row count starts page1; direct Back to the same criterion restores the same page. This is local fixture/integration proof, not authenticated production acceptance. Its Summary now uses SalesOrderReadFailure on failed/refused order reads, never zero facts.

Outright empty-state reader contract: `useSalesOrderRegisterOrders(filters, enabled=true)` preserves its existing query key, permission scope and complete-page reader. The optional gate enables only the fallback for a completed empty search whose authoritative unsearched total is unknown; otherwise no extra unsearched read. Pending/refused/failed fallback never becomes empty. `No sales orders yet` requires the authoritative zero or the complete unsearched answer; a narrowed empty result uses the approved no-match words. Existing `onClearConditions` clears the page search/header/requested criteria. Page URL updates are merged against the latest criteria so a concurrent grid effect cannot restore the cleared search. `/ui` Complete pages links to genuine empty, unknown-count empty search, population retry, list failure and denial TEST states. The1025 two-chip aggregate Clear duplication remains in the existing handoff; this contract is not a complete narrow-toolbar acceptance.

**Retirement state:** CTable, DropdownMenu, kit Popover, unused Card, GridToolbar,
ChecklistRow and QuietRouteRow are already retired in the mainline source. Do not recreate them.
Btn, Field and PageHeader are legacy contracts blocked from new adoption; remaining consumers
move with their page. CPill/StatusPill are adapters over one pill drawing; generic Block/specialised side-panel surfaces require
capability review rather than deletion by name. Keep the remaining work in the existing handoff.

## Reuse rules

- Keep existing record-opening contracts from the owning module; the downloaded SO full-page door does not change every register into an SO page.
- Do not clone `support.js`, mock storage, TEST permissions or sample records into production.
- Existing retired Btn, Field and PageHeader stay retired; their replacements remain shared kit components.
- One Icon adapter, one status component, one field recipe and one grid engine across modules.
- Long addresses wrap; dates, amounts, statuses and linked document identities remain readable.
- Team identity uses initials plus accessible full name/role and a keyboard/touch-reachable tooltip; avatar colour is supplementary. Record the actual person who acted separately from owner and cover.
- A missing shared component is admitted here with its /ui example and checks, not drawn privately.

## Required states and behaviour

| Family | Checks |
|---|---|
| Every data region | Loading, empty, no matches, failed read, denied, incomplete setup, partial data |
| Form / action | Unchanged, valid/invalid, uploading, upload failure, saving, save failure, conflict, success, historical lock |
| Register | Filters and selection retained; full document links; expansion counts use module meanings; internal overflow |
| Dialog / panel | Keyboard entry/exit, labelled controls, visible focus, return to invoking element |
| Settings | Allowed editor can configure missing approved values; denied user cannot edit; scheduled versus effective distinguished |

## Implementation status

The 11 Oct ZIP supplies a shared Shell, a shared Table, the Sales Order list and detail with Order Route, Timeline, amendment and SO PDF, Purchasing on the same template, Settings → Appearance and a component specimen. Phone/tablet, complete failure states, every module adapter, shared runtime migration and authenticated production acceptance are not proven by this import. /ui and complete pages must be checked under UI MASTER §2.2 before claiming adoption. Approval, implementation, deployment and verified operation are separate.

## Appearance picker · retired

No personal theme picker or per-person palette application. Use the one shared template above; existing appearance code does not establish approved behaviour.

## Shared adoption map — one implementation per purpose

| Source part | Reuse / configuration | Scope and acceptance |
|---|---|---|
| Menu and shell | PortalSidebar, portal-nav, shared header adapters | One permission-filtered tree on list, object, Workspace and Settings; only selection changes. Logo, compact64 rail and overlay navigation from the current baseline. |
| Listing | register/DataGrid and column registry | Module supplies grain, columns, data and allowed actions; preserve sort/filter/resize/select/group. SO target has Open/Delivered/All and column views; do not add a Table/Cards switch to this supplied SO composition. |
| Selection tools | Existing selection toolbar configuration | Replaces ordinary tools in the same area; count and quantities use the current scope; supported export/print only. |
| Summary | Existing source-summary composition | Collapsible 264px region; one white card per section, rows 32; module supplies verified facts and drill-through, no invented KPIs. |
| Tasks | Existing Work source and shared task host | Collapsible340px region; row opens exact owning action; save/result must follow that source's permissions and completion. No second engine or generic Done. |
| Complete object | Module object adapters plus Tabs/Block | Identity, authorised actions, source facts, Route and Timeline where relevant; not a cloned SO page for every object. |
| Documents | PdfPreview/SavedEvidenceViewer with Drawer or Modal | Real saved version, loading/failure/retry, focus return; document is not an editor. |
| Compact facts | Existing property-row/field compositions | 01 §5.1 density, labelled text until Edit; one shared recipe, no module-local skin. |

## Shared pieces of the current kit — where each lives

The current adoption map is a reuse contract, not a second kit. Source-checked on 15 Oct 2026 against `pages/dev/UiShowcase.tsx` and the existing component files. A KIT GAP is not permission to invent a page-local component; extend the owning family once and expose it on `/ui`.

| Specimen piece | Home | State |
|---|---|---|
| Shell: menu, top bar, toolbar row, Summary, Tasks, Settings → Appearance | PortalSidebar, PageShell, shared header adapters, ShellTasks | Extend the one shell |
| Table: header, list row, group row, item row, ticks, footer, frozen identifier | register/DataGrid | Extend the one engine; a module passes columns |
| Detail page: header, tabs, cards | DetailShell, Tabs, Block | Generic object header remains a KIT GAP (UI MASTER §7.3) |
| Button · IconButton | Button | Word button is a box; icon-only is round with no border (01 §3) |
| Pill | StatusPill | One status component |
| Menu | `CMenu` (items as data) or `CPopover role="menu"` + `CMenuItem`; `CPopover` (dialog) for a small panel | One menu design (01 §3); `DropdownMenu` and kit `Popover` retired 15 Oct 2026 |
| Card · FieldRow | Block (the one card), field-recipe | Field rows 36, label 150 (01 §5.1) |
| Tabs · SegmentedControl | Tabs | Segmented look (01 §3) |
| Toast | Toast | Bottom centre (01 §3) |
| Selection bar | DataGrid `selectable` (the engine draws it) | Replaces the toolbar in place |
| Choice chip | `carres/CToolbar.CChip` | Existing shared choice chip; reuse current API. Theme-choice adoption remains governed by 01 §9, not inferred from the existence of CChip. |
| Link: record number | PoNumberLinks and module link cells | KIT GAP: one shared record link |
| Avatar | none | KIT GAP (UI MASTER §7.3) |
| Item-row control | none | KIT GAP |

Behaviour the specimen fixes for every module:

- A row click opens the record; the tick, in-row controls and selecting text do not. Ctrl or ⌘ click opens a new tab. Back returns to the same scroll position.
- Hover, pressed, open and disabled follow 01 §1. A button whose menu, form or panel is open keeps its pressed grey and is never the selection colour.
- A record number in a card or task is the link that opens it; there is no separate Open button.
- Menus, dialogs and toasts are never clipped by a parent.
- Print and Download print only the document page, never the whole application.
- Parent list cells, expanded goods and detail order lines follow their distinct 01 §5 contracts. Only the approved customer-name second line may use ellipsis, with full hover/record access; never apply a generic wrap rule that changes every table.

Existing source names are entry points, not proof the latest visual target is built. A missing
API is recorded as KIT GAP; later implementation extends the same family with a `/ui` example.
The imported HTML/support.js demonstrates interactions only and is never the runtime component.

## Behaviour contracts retained through the visual replacement

- **Button/overlays:** existing variants remain API-compatible and read current tokens. Button
  forwards its DOM ref so menu, tooltip and popover anchors remain correct. Loading/disabled
  and keyboard focus are distinct. A navigation link is not a business-action button.
- **Checkbox:** label activates the whole hit area; table controls require an accessible name.
  Select-all preserves checked/unchecked/indeterminate and the exact authorised selection scope.
- **Select:** chooses a value; a menu (`CMenu`) performs an action. Input/Select share field skin,
  labels and validation. Use existing options-data API and keyboard behaviour; long choice sets
  need the existing searchable control. Do not remove a permission or validation to match a mock.
- **CMenu/CPopover:** trigger, floating content and labelled items; keep keyboard navigation (↓, Enter or Space open a menu on its first command; ↑ ↓ Home End move; Escape or Tab close it and return focus to its button),
  safe dismissal and focus return. A row menu acts on its row, a selection bar on its selection.
- **PdfPreview/PdfPreviewHeader:** caller supplies the actual rendered/saved PDF URL and owns its
  lifetime. Preview never issues a document or fetches business facts. Fit/zoom and contained
  scrolling remain; source change/retry/unmount cancel stale paints and release worker resources.
  Ready means all pages painted. Loading, decode failure and Retry are distinct from business
  success. Source header keeps identity, permitted download and Close reachable.
- **SavedEvidenceViewer:** authorised source supplies stable file IDs, media kind, signed URL and
  recorded context/Unit associations. Viewer does not list storage, widen access, upload, delete
  or rewrite evidence. Known-but-unreadable files show failure; truly empty evidence has no fake
  opening door. Retry calls the owning reader. Switching file resets zoom and cannot be replaced
  by a late retry. Retain photo zoom/drag/reset, video playback, previous/next and focus return
  after fullscreen. Never infer Unit attribution from receipt-level photos.
- **CompactModuleCard:** host passes identity once plus module facts, editors/items and source
  events; `presentation="embedded"` reuses the same SO adapter. Card never writes another
  module's record, uploads evidence or marks a message sent. Editors close only on confirmed
  save success; failure keeps the draft. Standalone/embedded defaults stay in MODULE-CARD-TEMPLATE.
  `CardEditorButtons`, `CardChecklist` and `compactCardStyles` remain reuse entry points.
- **Icon:** reuse the existing semantic-name adapter. Current font/glyph family and measurements
  come from 01; historical Lucide dimensions do not override the new visual target. Missing
  meanings join the shared registry once, never a page-local icon map.

These contracts preserve useful supported behaviour, not retired colours, font sizes or geometry.
Current source APIs must be checked before calling any family fully adopted.

## Current catalogue boundary · owner cleanup 15 Oct 2026

`/ui` presents the current design once per purpose: DataGrid and its cells/footer/expansion,
COrderLines, one pill gallery, toolbar, Summary, icons, fields, menus, tabs, dialogs, feedback,
documents/evidence and TaskView/StepList. The old dark-header compact-card preview, older extra
register demos, duplicate StatusPill gallery, RouteStop/Block task composition, placeholder task
words, dated import counts and obsolete CTable migration note are removed from the catalogue.
This retires demonstrations, not the business APIs still used by module pages. Internal sample
actions are explicitly TEST-only and do not save records. Remaining module migrations belong
in the existing delivery handoff, never as competing styles at the bottom of `/ui`.


---

<a id="kit-patterns"></a>

## Page compositions · former 03

**Current shared target · owner instruction 12 Oct 2026 · supplied 12 Oct.** Use the supplied Sales Order design, checked against Purchasing on the same template, as the visual reference, through the existing shared kit. All visual values live in 01; component contracts live in 02. Business record structure, permissions and exact words come from module MASTERs and COPY-STANDARD. No second layout guide.

## Apply the existing kit · execution order

1. Identify the page's job and owning module; read only its relevant facts, actions, words and approved differences.
2. Compose its shell, list/detail and task areas with 02's runtime reuse directory and 01's values. Preserve the current approved Claude Design direction.
3. Configure existing components; never copy specimen CSS, mock storage, permission checks or business completion.
4. When a shared part needs a fix, change that family once and its actual `/ui` example. A genuine missing capability joins the existing kit, not a module-local skin.
5. Replace the affected consumers and remove superseded presentation only after capability parity; keep unique functions and unresolved decisions.
6. For documentation-only reconciliation, review links and the diff. For a UI change, verify the changed scope and reuse unchanged passed evidence; run required release gates at the functional release boundary. Do not wait for whole-Portal perfection to finish an approved page.

The sole entry is UI MASTER; these compositions, 01 and 02 are its supporting contracts.
The existing delivery handoff tracks migration and production evidence; this file does not duplicate that queue.

## 1 · Shell

Menu → top bar (module and page, search, team, notifications) → one 36 toolbar row → Summary on the left, list or detail in the middle, Tasks on the right. Summary and Tasks are collapsible contextual regions, not mandatory columns on every screen. Selection uses the one shared Blue palette. The page never scrolls; panels and the table body scroll inside. A detail opens in the middle in place of the list: Summary and the toolbar hide, Tasks stays, Back returns to the same scroll position. There is no list plus detail three-panel view; the one exception is the Workspace page, where an opened task stands beside its pick list (§8). Panels open by window width: at 1600 or wider Summary and Tasks; from 1280 to 1599 Tasks only; under 1280 neither. Tasks also opens itself for the Log form, an open task and every detail. Opening or closing a panel never changes a column width. Keep content reachable with the64rail and the full navigation overlay. Below1100 follow the17Oct overlay-panel contract; secondary panels do not reduce the main canvas or compress essential facts.

## 2 · Register

Module views and shared tools → source-owned records → filtered totals/footer. Current references are `ui-reference/sales-order-design/Carres Table.dc.html` and `Sales Order Outright v12.dc.html`. Use the shared grid, two-line facts where meaningful, horizontal separators and governed columns. Record doors preserve the owning module's opening behaviour; linked document numbers open their own records. No Operations create-SO door. Selection replaces tools in place. Preserve list filters, scroll and selection on return.

**Three layers; every fact lives in exactly one.** The list row holds what is needed to decide the next step, at most 6 data columns. The expanded rows hold what is needed to recognise the goods. The detail page holds everything else. Hover may repeat a value from another layer; it never holds a fact found nowhere else.

### 2.1 Supplied Sales Order composition

Open · Delivered · All → source-owned column view → one table → quantities/footer. The view tabs are one segmented control; only active filter chips appear beside them; the view button, which always names the current view, and ⋮ sit at the right; there is no separate line saying what is shown. The view menu swaps the middle columns by module view and may carry the page's groupings; the identifier and status stay. A column header opens sort and filter by value; a picked filter appears as a chip that can be removed. No added Table/Cards switch or permanent funnel on every header. Selection replaces the toolbar. The row opens the full SO object; checkbox, item inspection, linked document actions and selecting text must not trigger it. Ctrl/⌘-click opens a new tab; Back restores list scope and scroll. These are SO adapter choices, not an instruction to remove other modules’ approved views or actions.

## 3 · Full object

Identity/customer-or-party/status/owner → authorised actions → module views → grouped source-owned facts. Header: Back, the record number with the party under it, the status pill, revision or waiting chips, owner avatars, then word buttons and ⋮ at the right. Tabs sit under the header. Below: one full-width summary strip, then two cards side by side that stack when narrow, then the order-line table. Never one card per section. SO uses its record, Route and Timeline views; other modules use their own records and facts, not copied SO field names. Two-column fact groups may become one column at narrow widths. Read-only facts are text. Edits, amendments, approval and document generation retain their owning module's gates.

SO reference: Sales Order · Order Route · Timeline. Normal viewing is read-only; Request amendment reveals only approved editable facts and keeps the current record context: editing is inline, with one sticky bar at the top of the tab carrying the change count, reason, proof, Cancel and Submit. Which changes need approval, and who approves, is Orders law; the specimen's sample rule is not imported. Historical revision view stays read-only and offers Back to current. Existing amendment approval and financial/stock consequences are not replaced by the prototype.

## 4 · Working Panel and guided work

Shared host identity → Info and owning module tab → current action and checks → evidence → recorded outcome → next responsible party. Reuse CompactModuleCard and Drawer. A full object and a compact work panel have different purposes; neither introduces a second kit. A photo upload is not completion by itself. Never add approvals or customer calls merely to fill a layout.

## 5 · Order Route

Use Template7 and the24Oct party-card Overview. Show concurrent Goods, Delivery and Payment facts, with related problems and source documents. Composition: one Journey line with party-oriented Overview, source-linked Map and Documents; no duplicate GOODS overview band. A card that needs action has an amber frame, never an amber fill. The step map fits without side scroll and marks the current step with a 1px theme frame. A blocked state names its actual cause and responsible party. DO generation does not complete delivery, missing goods or service obligations. Linked claims, issues and cases retain their own record owners. Route facts do not write another module's records.

## 6 · Timeline and revisions

Recorded date/time → actor → event/result → source document/evidence. Distinguish normal owner, temporary assignee and actual person who acted. Historical versions are read-only. Filters change the visible history, not its facts. Missing source and failed read differ.

## 7 · Settings

Group by purpose and owning module. Sections are a left section list (owner 11 Oct 2026); a segmented tab row is only for the groups inside one section. Plain rows show name, short explanation and value; detail reveals stable ID, access, source, effective treatment and history. Repeated entities such as companies, brands, bank accounts and staff use tables. Authorized users can fill approved missing settings. Rules awaiting a business decision cannot be activated by the prototype. Do not add a box or status pill to every row. A change must show its effect on open records without silently restarting clocks.

## 8 · Tasks and field screens

Office Tasks show assigned action, source, why, due, proof and next result. **The panel (owner 12 Oct 2026):** the day strip of the working week, then `To do` · `Waiting` · `Done` as the segmented control, then one card per contact (supplier · Logistics · Customer) or action (Issue PO · Send PO · Approve · Pay · My notes), late first. `Waiting` holds what was asked and is waiting for an answer, nearest first; it returns to `To do` on its next contact date. A `No reply` try is not Done. The day strip counts `To do` only. **A task card in the list** is its module icon, its title and › with one row per fact under it, label left and value right; the whole card opens the task and it carries no button and no status tag (01 §4). `Done` shows the same cards. **An open task is the one task view (owner's round 3 brief, 13 Oct 2026; kit `TaskView`, 02):** the same shape in every module. The task in the words of its list card; then its module icon, page and record (`Purchasing / PO-2609-0042`) with the initials of who does it now at the right, the record being the link that opens its own page, so there is no Open button in the head; then one row per fact, icon, label and value, the list card's own rows without the record, then `Contact`, then what only the owning module knows; then the segmented tabs `Steps` · `Route` · `History` · `Files {n}`. `Steps` is the owning module's own work through its own doors and stays as it was typed while another tab is looked at. `Route` is the Order Route of the Sales Order behind the task, top to bottom, read from the one Order Route model; a task that serves several Sales Orders shows one at a time. `History` is what was recorded, newest first, with who recorded it. `Files` lists the task's documents staged in the route's order (`Sales Order`, then `Purchase Order`), each with view and download; a file is read only when asked for, and looking at it or keeping it records nothing. Amber is on the one fact that has gone by. The Tasks panel stays340px wide with a task open at every desktop width; it never expands to560px and squeezes the list. A form wider than the panel (a supplier answer's line table) opens on the full surface over the page, titled with the act and its record, and returns to the task; it is never squeezed into the panel to scroll sideways. One main button per card. One task open at a time, with `All tasks`, `{n} of {m}` and the two arrows above it; the list does not jump. **Sending issued POs** is three numbered steps, each a 20 round dot (the step to do now: charcoal with its number; later: white ring; done: green tick), a title and one grey line that says the state, never an explanation: 1 `Download PDFs` (`{k} of {n} downloaded`) · 2 `Send by WhatsApp or Email` (the `Communication channel` switch, with the message box inside the step) · 3 `PO sent to supplier ({n})` (charcoal; it first asks `Record as sent by {channel}?`). The steps are not locked: the dots show the order, a download or an opened channel records nothing, and only step 3 records, through the owning module's one writer (Purchasing MASTER §5.6.1). **Owner, 12 Oct 2026 evening:** `Issue PO` stays the governed action; the package's `Place` stage, its separate `Send PO` stage and its `Mark n POs sent` wording are not adopted, nothing opens by itself, and no timed `Undo` is offered for a saved record. **A task that messages someone** (chase a supplier, check a new date, ask for the Supplier DO) is the same three steps: 1 `Send by WhatsApp or Email` · 2 `Record the answer` · 3 `Save` with its proof line. Steps 2 and 3 are not locked, because the answer may come by phone first; the dots show the order. Pressing a contact button never sends: it opens WhatsApp or Email with the message ready and copied. Email is the same message box as WhatsApp with `To` and `Subject` rows above it. After a task is saved or closed the panel returns to the list and the app's dark toast says what was saved; it may offer `Next: {name} ›` when another task of the same kind waits, and ✕. `Undo` is not offered for a saved record (owner 12 Oct 2026 evening): a wrong record is corrected by the owning module's rules. It never jumps by itself. The answer choices, their reasons, who may record them and what a saved answer changes belong to the owning module (Purchasing MASTER §5.7 for a supplier answer). Field screens show the current necessary step with scan/choice/count/photo as the owning workflow requires. Ordinary helping is different from approval permission. Preserve upload input and drafts on failure and conflict. Phone/tablet layouts need their own complete-page verification; the desktop specimen is not proof. **`+ Task` (owner 2026-10-14; Workspace MASTER "Employee-created internal tasks"):** `Task` in the panel's title row opens the `New task` dialog; an internal task is a card like every other and opens as the one task view with `Steps` and `History` only and one act, `Mark done`.

**The Workspace page (owner's round 3 brief, 13 Oct 2026, point 3; Workspace MASTER §5.10; deployed 13 Oct 2026, #2049; seen signed in on production 13 Oct 2026 at 1025, 1164 and 1440, view only)** lists the same tasks as one table: a `Module` panel on the left with the day strip and one plain number per module, then `My Task` · `Team Work` and `To do` · `Waiting` · `Done` on the one toolbar row. A row opens the same one task view beside a narrow pick list, through the same task desk as the panel, with the `Communication` card under it; under 1180 wide the task takes the whole room. The shell's Tasks panel steps aside on that page, so one task is never open in two places.

Tasks stays visible while inspecting a document on supported desktop widths; the document drawer uses the adjacent work area, not a second stacked task panel. On narrow screens preserve one reachable active surface, safe draft return and access to the other context. Quick Calendar and Activity capabilities are retained; their unrepresented placement is not invented from the ZIP.

## 9 · Reports

Central Reports with module summary links remains the recorded owner direction. Period, comparison, metrics and drill-through follow their approved definitions. The kit supplies composition, not invented KPI definitions or financial access.

## 10 · Acceptance

Apply UI MASTER §2.2 to complete pages: desktop/narrow, keyboard, zoom, long content, read/save/upload failures, denied access, draft retention, conflict and historical records. Use verified data; explicit TEST cases may cover failures. Never label a scenario passed merely because a screenshot exists. Importing the prototype or kit is not production verification.
