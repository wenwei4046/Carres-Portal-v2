STATUS: IMPLEMENTED — RELEASE OWED
DATE: 2026-08-18
PR: committed on safety/e404cf43-omnibus — ffbd7368
IMPLEMENTATION: APPROVED — owner ruled the shape with the architect 2026-08-18, build straight to production

# PURCHASING SIDEBAR — the module's pages leave the header and join the rail (one card)

**RAIL — `PortalSidebar` + `portal-nav.ts` + `PurchasingTabs.tsx`.** This card owns
the DOOR to every purchasing page. It may not touch what is INSIDE any of those
pages — no grid, no rail, no action, no copy on the page body changes here.

Read `CLAUDE.md`, `docs/ERP-ARCHITECTURE.md` §2.1 (the nav tree),
`docs/ui/MASTER.md` §4 · §6.4, `docs/purchasing/MASTER.md` §1,
`docs/COPY-STANDARD.md` (the module words) on the LATEST `origin/main`. Execute as
CONTINUOUS BUILD: implement → tests → release gate → PR → CI → merge → deploy →
prove SHA → overwrite the owning MASTERs in the same PRs. **If code structure
conflicts with this card, STOP and report — do not choose.**

## 1 · ONE rail, not two

Purchasing is about to hold eleven pages. Today the module hides all of them
behind a single sidebar word and lists them in a 44px tab strip at the top of
every page (`PurchasingTabs.tsx:64-83`). A tab strip is a good home for three
siblings and a bad home for eleven: it scrolls sideways, it cannot show a count
without shouting, and it cannot group.

The obvious fix — a second left column inside the module — is REFUSED. The portal
rail is already 232px (`PortalSidebar.tsx:179`) and a purchasing page already
carries a 200px right rail (`ui/MASTER.md` §5). A second left column would spend
roughly 430px of a 1440px screen on navigation before the first column of data.

**So the existing `Purchasing` item EXPANDS IN PLACE.** One rail. The pages become
its children, exactly the way the area groups already open and close in that same
file (`PortalSidebar.tsx:255-283`).

```
  Carres                 ⊏
  ─────────────────────────
  ▫ Dashboard
  ▫ Sales Orders      (3)
  ▾ Purchasing
      SO Batch Purchase  4
      Manual Purchase         Coming soon
      Purchase Orders    2
      Receiving          1
      Supplier Claims
      … (the full thirteen are in §2)
  ▫ Delivery
  ▫ Stock
  ▫ Payments
```

Only the module you are standing in is open. Clicking `Purchasing` goes to its
first page and opens the list; clicking `Stock` closes Purchasing and opens Stock.
That is the rule the area groups already follow — *"the active area stays open"*
(`PortalSidebar.tsx:107`) — applied one level down, so nothing new is invented.

## 2 · THIRTEEN entries — the whole map, and the unbuilt ones say so

**Jess overruled the empty-shell rule on 2026-08-18, and she was right.** The
original draft of this card listed only the four pages that exist and quoted
`03-page-patterns.md:149` (*"an unbuilt region is not rendered as an empty
placeholder"*) to justify it. But that line governs REGIONS INSIDE a page. The
rail is the module's MAP, and a map that shows four of eleven roads teaches three
operators a shape that is about to change under them seven more times.

Her own law already grants the way to do it — `03-page-patterns.md:219`:
**"a control that is deliberately disabled must say why, on screen."**

```
▾ Purchasing
    SO Batch Purchase      4
    Manual Purchase             Coming soon
    Purchase Orders        3
    Receiving              1
    Supplier Claims
    Purchase Returns            Coming soon
    Repair Orders               Coming soon
    Display Requests            Coming soon
    Consignment Orders          Coming soon
    Consignment Receipts        Coming soon
    Consignment Returns         Coming soon
    ─────────────────────
    Report
    Settings
```

Order is the approved eleven of `purchasing/MASTER.md` §1, unchanged. `Report` and
`Settings` sit below a hairline because they are PORTAL pages, not Purchasing
pages (`ERP-ARCHITECTURE.md` §2.1) — they are reached here today and the divider
is what stops that convenience reading as ownership.

### A `Coming soon` entry IS NOT A CONTROL

This is the whole of why it is allowed to be there:

- **It is a `<span>`, never a `<Link>`.** There is no href, so there is no dead
  arrow to click. `03-page-patterns.md:149` bans a chevron that opens nothing;
  this opens nothing because it is not an opener.
- **It is out of the tab order** (`tabIndex={-1}` / not focusable) and carries
  `aria-disabled`. A keyboard user who tabs into a dead stop has found the same
  dead control by another door.
- **`Coming soon` prints on the row**, right-aligned and quiet. That is §219's
  requirement satisfied literally: the row says why it does nothing.
- **It never carries a count**, not even zero. A number on it would claim work
  exists on a page that does not.
- Grey text, no hover tint, no active bar, `cursor-default`.

### THE RAIL NOW SCROLLS, AND THAT IS THE ONE COST

Thirteen children plus the module rows is roughly 860px of rail on a screen whose
viewport is about 800px. **The rail already scrolls** (`PortalSidebar.tsx:219`,
`overflow-auto`) so nothing breaks — but `Delivery` and `Stock` can now sit below
the fold while Purchasing is open, and an operator who works Purchasing → Stock all
day would scroll for it every time.

**Stated as a trade-off, not hidden:** the whole map costs the bottom of the rail.
Jess chose the map. The one defect that must not survive is landing on a rail whose
highlighted row is off screen, so:

- **On load, the active entry is scrolled into view.** Not centred, not animated —
  just visible.
- No max-height, no inner scrollbox, no "show more" link. One scroll region, the
  one that is already there.

### The two renames

`To Order` → **`SO Batch Purchase`**. `To Order` reads like a status a row can be
in, not a place a buyer goes. The renamed word says whose demand it is (a sales
order's) and what the page does with it (batches it). The rename is also the first
section of `CARD-2026-08-18-so-batch-purchase.md`; whichever card ships first
performs it and the other inherits it.

`Claims` → **`Supplier Claims`**. Carres has claims in two directions — a customer
claiming from us, and us claiming from a supplier. The bare word is the one that
gets opened by mistake.

`Receiving` KEEPS ITS WORD. The eleven-page list approved on 2026-08-18 wrote
`Goods Receipts`, but `ERP-ARCHITECTURE.md:123` names pages after the job the staff
member does and blesses `Receiving` by name, and `purchasing/MASTER.md:768` bans
the letters `GRN` from a tab forever. `Goods Receipts` is a document name;
`Receiving` is the work. **The work wins.**

## 3 · What is left of the header row

`PurchasingTabs.tsx` STAYS and keeps drawing `ModuleHeader` — the shell law
(*"壳画头 — the shell draws the header, pages never do"*, Loo 2026-08-02) is not
being touched, and eight pages import it. **Only the `children` tab strip is
deleted.** The row keeps the nameplate, the page-meta slot and the global icons:

```
BEFORE  [🛍] Purchasing │ To Order  Purchase Orders  Receiving  Claims  Report  Settings ····· stamp │ 🔔 ❓ ⚙
AFTER   [🛍] Purchasing · Receiving ······························································· stamp │ 🔔 ❓ ⚙
```

The nameplate gains the page word after a `·`, because with the tabs gone the
header would otherwise no longer say which page you are on. `document.title` is
unchanged — it already prints `${page} · Purchasing — Carres`.

## 4 · Collapse — nothing new is invented

The rail already collapses to a 60px icon column and already remembers it
(`PortalSidebar.tsx:22` `ops-sidebar-collapsed`, `:179` width 60/232). **Reuse
both. Do not write a new width and do not write a new storage key.**

Collapsed, the children disappear and the module's ONE icon remains, exactly as
the collapsed rail behaves today (`:221-250`). A collapsed rail is for table room,
not for navigating thirteen pages by guessing thirteen icons.

## 5 · Counts are work waiting, never totals

A number on a rail entry means **rows a human must act on today**, not how many
rows the table holds. `Purchase Orders` shows the count of POs waiting on
somebody, never every PO ever raised.

**At zero, nothing is printed.** No `0`, no grey dot, no empty pill. A zero badge
is a daily invitation to check a page that has nothing on it.

The parent `Purchasing` entry shows no number of its own. Summing its children
would produce a figure that matches no page and no queue.

Counts come from the existing `procurement` badge feed
(`portal-nav.ts:66`, `PortalSidebar.tsx:95-99`); this card only re-points and
splits them. **Any child whose count is not already fed shows no number** rather
than a guessed one.

## 6 · How an entry goes live

Every entry is already on the rail from day one, so the list NEVER reshuffles under
a staff member who has learned it. **Shipping a page does exactly two things, in
that page's own PR: the `<span>` becomes a `<Link>`, and `Coming soon` disappears.**

That is the whole growth mechanism. No entry is added later, no order is
renegotiated, and the day a page lands nobody has to be told where it went — they
have been looking at its name for weeks.

## 7 · Copy

Every rail word comes from `docs/COPY-STANDARD.md`. **No new word is invented in
code.** The two renames above are added to the module-word list in the same PR.
Rail entries are nouns — a door is named for the place, not the verb; verbs are
the ACTION layer and may never share a name with a field or a door
(`purchasing/MASTER.md:211-216`).

**`Coming soon` is Jess's own word (2026-08-18) and is added to `COPY-STANDARD.md`
as the ONE way the portal marks a door that is planned but not open.** Never
`TBD`, never `Not available`, never a greyed word with nothing beside it — those
are three different sentences for one fact, and a new hire has to learn all three.

## STILL LOCKED — do not touch

The 232/60 widths and the `ops-sidebar-collapsed` key · the area-group accordion
and its roles gating · `ModuleHeader`'s 44px white row, its colour law and the
global icon cluster · every route and `?tab=` value (this card changes the DOOR,
not the address) · the Settings server gate · the contents of all six pages ·
`StockTabs.tsx` and every other module's tab strip.

## TESTS AND DEPLOY — MANDATORY, EVERY SLICE

- Standing on any purchasing page, the rail shows all thirteen entries and the
  module is open; standing on Stock, Purchasing is closed.
- The thirteen labels are exactly the thirteen words in §2, in that order;
  `To Order` and `Claims` appear nowhere in the rendered rail.
- Each of the seven unbuilt entries renders as a NON-link: assert no `href`, no
  `role="link"`, `tabIndex` is -1, `aria-disabled` is set, and `Coming soon` is
  present on the row.
- Clicking an unbuilt entry changes neither the URL nor the active highlight.
- Tabbing through the rail visits only the six live entries.
- On load the active entry is within the rail's visible area without user scroll.
- No unbuilt entry renders a count, and none renders a `0`.
- Settings does not render for a caller the server says may not edit.
- Collapsing hides the children, shows one icon, and survives a reload.
- A live child with zero work prints no badge — assert the absence of the element,
  not a `0` string.
- The parent entry prints no count.
- The purchasing header renders the nameplate and page word and NO tab strip;
  every one of the eight importing pages still renders exactly one header.
- Every existing purchasing route still resolves from its old URL.
- Widths and row heights re-measured in a real browser; no guessed number is
  written down.

## Acceptance boundary

Authenticated production verification at 1440×900 and ~1920: all thirteen entries
under an open `Purchasing` in the approved order, the seven unbuilt ones grey,
unclickable, unfocusable and reading `Coming soon`, both renames live, no tab strip
on any purchasing page, the collapse remembered across a reload, counts that mean
work waiting and vanish at zero, and every old purchasing link still landing on its
page. Overwrite
`docs/ERP-ARCHITECTURE.md` §2.1 and `docs/ui/MASTER.md` in the same PR under the
MASTER OVERWRITE LAW.

*Corrected on execution: this line first named `ui/MASTER.md` §4, which is Shells
and grids and owns no navigation. The law landed as a new **§4.2 · MODULE
NAVIGATION** instead. The section number is fixed here rather than defended.*

---

**IMPLEMENTED 2026-08-18** — `ffbd7368` + `a80992d6` on
`safety/e404cf43-omnibus`. 28 tests pass on `PortalSidebar.test.tsx` (16 existing
+ 12 new); `tsc --noEmit` clean. Law written to `ERP-ARCHITECTURE.md` §2.1,
`ui/MASTER.md` §4.2 and `COPY-STANDARD.md` (`Coming soon`).

## RELEASE — what the build chat executes now

Engineer-Owned Delivery (`CLAUDE.md`): delivery is owned to PRODUCTION. In order:

1. Full gate on the branch: `pnpm --filter @carres/web typecheck` ·
   `pnpm --filter @carres/web lint` · `pnpm --filter @carres/web test`. A red
   anywhere stops the release; fix forward on the same branch.
2. `git push origin safety/e404cf43-omnibus` → PR to `main` → CI green → merge.
3. Vercel deploys `main`; prove the SHA on production.
4. **The owed browser measurement, on production:** the child row's `text-meta`
   size, `py-[7px]` height and 43px indent were DERIVED from the parent row's
   numbers, never measured. Measure at 1440×900 and ~1920; if a number changes,
   change the code and this card in the same PR.
5. Acceptance boundary above, verified authenticated on production.
6. Flip this card to EXECUTED with the production SHA.
