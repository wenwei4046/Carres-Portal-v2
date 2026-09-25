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
| 2 | compact Date panel (<768) | one day per row, a full-width highlight, empty space to the right | days in one horizontal row of chips, `Missed` first; panel closes on pick | approved |
| 3 | compact Date panel | two blues: the toolbar date button and the chosen day | only the chosen day is blue while the panel is open | approved |
| 4 | header + list | `0 actions to do` printed twice | drop the header copy; the list heading keeps it | approved |
| 5 | header | `0 actions to do` while Team Work holds 183 | `0 for you · 183 for the team` when My Work is empty (word to COPY) | approved |
| 6 | empty list | `Nothing assigned to you` with no door | add `See Team Work` | approved |
| 7 | list tabs | `To do · Waiting · Completed` stretch to the page width | tabs match the list width | approved |
| 8 | toolbar | Search fills a row; `Covered` sits alone | Search 240px beside `Covered` | approved |
| 9 | sidebar | 12 icons, no labels | expanded by default with names; collapse is the choice | approved |
| 10 | sidebar | `OP` avatar, no name | name and role | approved |
| 11 | header | bell badge 78 never clears | count only today's unread | approved |
| 12 | header | `Jump to… ⌘K` is a developer shortcut | `Search` | approved |
| 13 | header | `?` and the gear have no words | label or remove | approved |
| 14 | right rail | three unlabelled icons | names, or fold into the sidebar | approved |
| 15 | toolbar | `My Work / Team Work` black segment off the blue system | blue active segment | approved |
| 16 | toolbar | `Covered` is jargon | `Covering for others` (word to COPY) | approved |
| 17 | toolbar | `All modules` uses a computer word | `All pages` (word to COPY) | approved |
| 18 | Date rail | `Date` heading is blue but not a link | slate heading | approved |
| 19 | Date rail | `Missed` shows no count in My Work | `Missed {n}`, `0` printed | approved |
| 20 | Date rail | only Mon–Fri of this week; next week needs the month arrow | two weeks | approved |
| 21 | Date rail | today carries no `Today` word | `Today` under the day | approved |
| 22 | Date rail | `No working date` row shows in Team Work only | both scopes, `0` printed | approved |
| 23 | list tabs | only `To do` carries a number | all three counted | approved |
| 24 | list | large blank canvas below an empty list | the panel shrinks to its content | approved |
| 25 | list heading | the date repeats the toolbar's date button | heading says `{n} actions to do` only | approved |

**Also found, outside this card:** `GET /api/operation/dashboard` answers 500 on production
(2026-09-25). The Dashboard page cannot load. Owner: Workspace §8; needs its own fix.

**Acceptance for each ticked item:** a rendered walk at 1440×900, 829×900, 743×704 and 390×844
with the measurement in the PR, and the Workspace MASTER §5 rows overwritten in the same PR.
