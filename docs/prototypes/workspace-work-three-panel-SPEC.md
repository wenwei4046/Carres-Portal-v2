# Workspace Work · UI handoff specification

> Owner-review companion to `workspace-work-three-panel.html`.
> This document removes visual guessing. Business authority remains
> `docs/workspace/MASTER.md`; the HTML remains the interaction reference.

## 1. Existing kit inventory

Use these existing kit components without restyling them locally:

| Need | Existing component | Exact governed geometry |
|---|---|---|
| Page frame | `kit/PageShell` or the current shell during governed migration | title band 40px; list chrome budget 200px |
| Scope switch | `kit/Tabs` | 32px visual row; `text-body`; 2px blue active indicator |
| Search | `kit/SearchInput` | 32px high; pill radius; search icon 14px |
| Known-value filter | `kit/Select` | 32px high; 6px radius |
| Actions | `kit/Button` | md 32px; sm 24px; 6px radius or full pill |
| Filter overlay | `kit/Popover` | governed floating surface |
| Empty region | `kit/EmptyState` | title + optional detail + one action |
| Loading region | `kit/Loading` | use its skeleton mode; do not create raw pulse bars in the page |
| Status | `kit/StatusPill` | status only; counts do not use status colour |
| Count | `kit/Badge` | neutral count treatment |
| Avatar evidence | current shared staff-avatar treatment plus `kit/Tooltip` | full name on hover and focus |
| Narrow-screen detail | existing route/full-screen page behaviour; `kit/Drawer` only if it preserves browser Back and focus | no permanent desktop drawer |

Do not use `Card` or `Panel` for each Work item. An action is a dense selectable row, not a card.

## 2. Missing kit pieces

The following are not currently governed reusable kit components:

| Missing piece | Decision for this implementation |
|---|---|
| Three-pane split shell | Build `WorkSplitShell` as a Work-specific layout component. It owns geometry only and no business words or data. Do not add a generic global `SidePanel` without separate kit approval. |
| Selectable Work action row | Build `WorkActionRow`. It owns row anatomy and selected/hover/focus states; it computes no business fact. |
| Working-day navigator | Build `WorkDayNav`. It owns weekday/count navigation and the mobile horizontal form. It receives dates and counts. |
| Selected-action detail | Build `WorkActionDetail`. It renders structured contract fields and slots for source-owned action controls. |
| Communication evidence block | Build only when backed by an existing authoritative module communication contract. A presentation-only `WorkCommunicationSummary` may render evidence; it owns no send/reply persistence. |

`Skeleton` and generic `Side Panel` are named as not built in `docs/02-components.md`. Do not silently invent global kit components with those names. Use the existing `Loading` component and the Work-specific layout above.

## 3. Desktop geometry · viewport 1181px and wider

The existing global application sidebar is outside this specification. Do not duplicate it.

The Work page consumes all remaining shell width and height.

```text
Page header
Work content
  Panel 1   Panel 2   Panel 3
```

| Region | Width | Height | Overflow | Border |
|---|---:|---:|---|---|
| Page | remaining shell width | 100% available shell height | hidden | none |
| Page header | 100% | content height; target 92px maximum with wrapped controls | none | bottom 1px `slate-5` |
| Panel 1 | 204px fixed | remaining page height | vertical auto | right 1px `slate-5` |
| Panel 2 | 360px fixed | remaining page height | only action list scrolls | right 1px `slate-5` |
| Panel 3 | remaining width; minimum 420px | remaining page height | detail body vertical auto | none |

The Work page itself does not vertically scroll. Each long region owns its scroll.

## 4. Laptop geometry · viewport 821px to 1180px

| Region | Width | Behaviour |
|---|---:|---|
| Panel 1 | 0 | hidden; day and module move into the header controls |
| Panel 2 | 340px target | fixed, never narrower than 320px |
| Panel 3 | remaining width | minimum useful target 400px |

If the available canvas cannot preserve 320px + 400px, use the mobile list/detail transition. Do not create two unreadable panes.

## 5. Mobile geometry · viewport 820px and narrower

| Region | Width | Behaviour |
|---|---:|---|
| Header | 100% | scope row, search/filter row, weekday strip |
| Weekday strip | 100% | horizontal auto-scroll; 6px item gap; selected day stays in view |
| Action list | 100% | normal vertical list |
| Action detail | 100vw × 100dvh | replaces list after selection; browser/focus Back restores list state |

Touch targets are at least 40px high on mobile. The governed 32px dense desktop controls remain 32px only above the mobile breakpoint.

## 6. Header measurements

| Element | Measurement |
|---|---|
| Horizontal page padding | 24px desktop; 12px mobile |
| Header top/bottom padding | 8px / 10px target, using shell tokens |
| Gap between title and freshness | 10px |
| Gap between controls | 8px |
| Scope control | governed `Tabs`; do not build a second segmented-button skin |
| Search | minimum 260px desktop; flexes; 100% mobile |
| Select / Button | governed 32px md height |
| Weekday mobile chip | minimum 40px touch height; full pill |

There is no Refresh button. Freshness is a fact; the current query refresh policy owns revalidation.

## 7. Panel 1 measurements

| Element | Measurement |
|---|---|
| Panel padding | 12px horizontal and 16px vertical |
| Section gap | 24px |
| Section label | `text-label`; 8px bottom gap |
| Navigator row | minimum 32px desktop; 40px mobile equivalent |
| Navigator row padding | 8px |
| Row gap | 4px |
| Row radius | 6px |
| Selected indicator | 3px blue inset bar; not a border declaration |
| Count alignment | right; tabular numerals; neutral text |

The selected row uses `blue-3`. Hover uses `slate-3`. Do not use module colours.

## 8. Panel 2 measurements

| Element | Measurement |
|---|---|
| Panel header | 44px target; 16px horizontal padding |
| Action row | natural height; minimum 82px desktop |
| Action row padding | 12px vertical; 16px horizontal |
| Row internal gap | 4px |
| Selected indicator | 3px blue inset bar |
| Row divider | 1px `slate-5` |
| Object | `text-body`, 600 |
| Module | `text-label`, 500, uppercase display only |
| Action | `text-body`, 600 |
| Party/context | `text-meta` |
| Communication/operational state | `text-meta`; semantic colour only when it has governed meaning |

Rows wrap. No line clamp or ellipsis on object, action, party or state.

## 9. Panel 3 measurements

| Element | Measurement |
|---|---|
| Heading padding | 24px horizontal; 16px vertical |
| Detail body | 24px horizontal; 20px top; 32px bottom |
| Readable content maximum | 760px; left aligned, not centred |
| Major section gap | 24px |
| Section label to content | 8px |
| Fact grid label column | 120px desktop; stacked below 520px detail width |
| Fact-grid row gap | 8px |
| Message surface | `slate-3`; 1px `slate-5`; 10px radius; 16px padding |
| Timeline left rule | 1px `slate-6` |
| Finish-when surface | 3px success inset indicator; 12px vertical / 16px horizontal padding |
| Sticky action bar | minimum 56px; 12px vertical / 24px horizontal; top 1px `slate-5` |

The detail body scrolls underneath a sticky bottom action bar. Content must receive enough bottom padding that the bar never covers the final fact.

## 10. Action hierarchy

Exactly one primary blue action exists in Panel 3.

| Position | Control |
|---|---|
| Sticky bar left | neutral `Open {owning object}` |
| Sticky bar right | primary source-owned next action |
| Communication section | neutral `Copy message`; neutral `Open WhatsApp` |

`Record message sent` starts disabled. It becomes enabled only after the governed message workflow is prepared/opened. Copy/Open still does not persist sent evidence by itself.

## 11. Required component states

### `WorkSplitShell`

Desktop three panes · laptop two panes · mobile list/detail · focus return · independent scroll.

### `WorkDayNav`

Default · hover · selected · focus-visible · zero count omitted · loading count placeholder · mobile horizontal.

### `WorkActionRow`

Default · hover · selected · focus-visible · covered · blocked · source stale. Disabled is not used because an action row is a navigation door.

### `WorkActionDetail`

Supported communication · no communication · blocked · not assigned · source stale · permission refused.

### Page states

Loading · true empty My Work · true empty Team Work · no match · partial source failure · whole-source failure.

## 12. Responsive verification dimensions

Capture production screenshots at exactly:

| View | Width × height |
|---|---:|
| Large desktop | 1440 × 900 |
| Laptop threshold | 1180 × 820 |
| Mobile threshold | 820 × 900 |
| Phone | 390 × 844 |

At 1440px, measure rendered widths in browser dev tools and record them with screenshots. A visual claim without measured geometry is not acceptance evidence.

## 13. Prototype-only differences

The standalone HTML contains its own CSS variables and simulated data so it can open without the application. Production must not copy those values or records.

Production must replace:

| Prototype | Production |
|---|---|
| Local CSS variables | Carres Tailwind/kit tokens |
| Native `<select>` | kit `Select` |
| Prototype buttons | kit `Button` |
| Simulated rows | authoritative Work response |
| Browser alert | real owning-module action or no control |
| Mock communication | real source-owned communication evidence |
| Local selection state only | URL-restorable scope/filter plus local selected-row state as governed |

## 14. No-guess rule

If production implementation needs a visual value not present in this specification or the frozen kit, do not invent one. First use the nearest existing frozen token/component. If no governed component can express the approved interaction, add only the Work-specific component named in §2 and document why it is not a new global kit primitive.
