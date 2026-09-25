# 【WORKSPACE】 — CARD 01 · Work page owner review (25 findings)

**Owner review, Jess, 2026-09-25.** Jess walked `erp.carresofficial.com/operation?tab=work` in an
829px-wide window and asked for a top-to-toe list. Item 1 SHIPPED (#1633). Items 6/7 SHIPPED (#1637). **Jess approved items 2–25 as written on
2026-09-25 ("yes, open card") — one build, one deploy, one review at the end.** This card owns the Work page shell, toolbar, Date
rail and list; it may not touch the right panel (Workspace §5.10) or any module's projector.

Every fix below uses the kit and the governed words. A fix that needs a new word goes to
`docs/COPY-STANDARD.md` first.

| # | Where | Problem | Fix | State |
|---|---|---|---|---|
| 1 | whole page | 829px rendered phone mode: 40px controls, one stage, the compact Date panel | the layout switch moves 960 → 768 (one stage <768, rail collapsed 768–1279, three panels ≥1280); 743×704 keeps 40px rows | **SHIPPED** PR #1633 |
| 2 | compact Date panel (<768) | one day per row, a full-width highlight, empty space to the right | days in one horizontal row of chips, `Missed` first; panel closes on pick | BUILT — this PR |
| 3 | compact Date panel | two blues: the toolbar date button and the chosen day | only the chosen day is blue while the panel is open | BUILT — this PR |
| 4 | header + list | `0 actions to do` printed twice | drop the header copy; the list heading keeps it | BUILT — this PR |
| 5 | header | `0 actions to do` while Team Work holds 183 | `0 for you · 183 for the team` when My Work is empty (word to COPY) | BUILT — this PR |
| 6 | empty list | `Nothing assigned to you` with no door | add `See Team Work` | BUILT — this PR |
| 7 | list tabs | `To do · Waiting · Completed` stretch to the page width | tabs match the list width | BUILT — this PR |
| 8 | toolbar | Search fills a row; `Covered` sits alone | Search 240px beside `Covered` | BUILT — this PR |
| 9 | sidebar | 12 icons, no labels | names by default from 1280px; below that icons, so Work keeps two panels (the named rail pushed a 941px window back into phone mode — measured 2026-09-25) | BUILT — #1639 + follow-up |
| 10 | sidebar | `OP` avatar, no name | name and role | BUILT — this PR |
| 11 | header | bell badge 78 never clears | count only today's unread | **needs design** — the bell counts live order alerts, there is no notification record to mark read; a separate card |
| 12 | header | `Jump to… ⌘K` is a developer shortcut | `Search` | BUILT — this PR |
| 13 | header | `?` and the gear have no words | label or remove | BUILT — this PR |
| 14 | right rail | three unlabelled icons | names, or fold into the sidebar | BUILT — this PR |
| 15 | toolbar | `My Work / Team Work` black segment off the blue system | blue active segment | BUILT — this PR |
| 16 | toolbar | `Covered` is jargon | `Covering` (word to COPY; `Covering for others` wrapped the 941px toolbar) | BUILT — this PR |
| 17 | toolbar | `All modules` uses a computer word | `All pages` (word to COPY) | BUILT — this PR |
| 18 | Date rail | `Date` heading is blue but not a link | slate heading | BUILT — this PR |
| 19 | Date rail | `Missed` shows no count in My Work | `Missed {n}`, `0` printed | BUILT — this PR |
| 20 | Date rail | only Mon–Fri of this week; next week needs the month arrow | two weeks | BUILT — this PR |
| 21 | Date rail | today carries no `Today` word | `Today` under the day | BUILT — this PR |
| 22 | Date rail | `No working date` row shows in Team Work only | both scopes, `0` printed | BUILT — this PR |
| 23 | list tabs | only `To do` carries a number | all three counted | BUILT — this PR |
| 24 | list | large blank canvas below an empty list | the panel shrinks to its content | BUILT — this PR |
| 25 | list heading | the date repeats the toolbar's date button | heading says `{n} actions to do` only | BUILT — this PR |

**Also found, outside this card:** `GET /api/operation/dashboard` answered 500 on production
(2026-09-25) — fixed by 0586, PR #1637.

**Round 2 (Jess, 2026-09-25, from live screenshots — approved as a batch):** 26 phone shell —
below 768px the sidebar is a `Menu` drawer and the right rail is not drawn, so the page has the
whole width · 27 the header team count wraps instead of truncating · 28 an empty list draws no
`Select a work item` box · 29 `Covering` keeps the 941px toolbar on one row. **BUILT.**

**Round 3 (Jess, 2026-09-25 — "why you different from sales order ui", "just amend the shell
first"):** 30 the Work shell is the §6.0 listing shell — 50px Destination Header, one plain
toolbar row, search 340px, Date and Page as toolbar selects, no rail, no Filters button. The card
list stays until Jess rules on the §6.0 table for Work. **BUILT.**

**Round 4 (Jess, 2026-09-26 — "this is my left rail", the Payment Monitor rail):** 31 the Work
rail is the shared `FilterRail` in the Payment Monitor's grammar — ‹ week › header, one card per
work day, `Missed` and `No working date` rows, the `Page` group, the `Owner` select in Team Work,
`Hide filters` / `Show filters` remembered — beside the list and the detail. **BUILT.**

**Acceptance for each ticked item:** a rendered walk at 1440×900, 829×900, 743×704 and 390×844
with the measurement in the PR, and the Workspace MASTER §5 rows overwritten in the same PR.
