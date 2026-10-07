# Don't copy — rejected old patterns

| Rejected old pattern | Owner ruling (exact words or summary) | Date | Source |
|---|---|---|---|
| SO Batch `Purchase order details` mini table under the row or in the Quick View | "it should show at row listing, why we need another table?" then "yes"; never approved, added by build `acd0666c7` | 2026-10-06 | docs/purchasing/MASTER.md:3125-3134 · docs/COPY-STANDARD.md:1511 |
| PO No cell as `{first No} + {n} more`, `2 Purchase Orders` or a popover | Withdrawn; every PO number on one line, comma-separated, each its own link | 2026-10-06 | docs/orders/MASTER.md:1093-1098 · docs/COPY-STANDARD.md:2845 · docs/purchasing/MASTER.md:3036-3037 |
| A dash as a value, empty cell or placeholder | "i don't want UI got dash — this bad UI" | 2026-09-26 | docs/COPY-STANDARD.md:3692-3699 · CLAUDE.md:65 |
| A dash joining two facts (separator) | "dash shouldn't have — which we use 2 lines if needed or 1 line write clear" | 2026-09-28 | docs/COPY-STANDARD.md:3701-3706 |
| Blue card titles or title bands | "make it black bold", every page; overwrote the 2026-09-22 "remain blue" | 2026-09-27 | docs/orders/MASTER.md:1162 · docs/ui/MASTER.md:433-434 · CLAUDE.md:66 |
| Free text where a choice exists (Manual Purchase `Purchase requirement` and line `Note`) | "I order what, got colour to choose, what I want more to write, no free text"; line uses the Sales portal `Configure` | 2026-09-26 | docs/purchasing/MASTER.md:3423-3432 · docs/COPY-STANDARD.md:1523 |
| `Needs an owner` group at the top of Tasks for every Operation person | Not approved: check each unrouted task by existing duty, account and permission rules instead of widening visibility | 2026-10-06 | Jess chat 2026-10-06 (PROPOSAL rejected; never built) |
| Two-line Status cell (coloured pill, reason stacked in the cell) | One word, plain text, one line; the reason stays on the item line inside expansion | 2026-09-29 / 2026-10-04 | docs/purchasing/MASTER.md:2695-2701 |
| Office Sales Order create mode (`New Sales Order`, `/operation/orders/so/new`) | Operation never creates a Sales Order by any door; it is born in the Sales Portal | 2026-09-27 | docs/orders/MASTER.md:216-217 · docs/orders/MASTER.md:264-268 · docs/COPY-STANDARD.md:2738 |
| Preview fixture records, people, dates and simulated saves treated as real | Fixtures are not authority; production must not copy fixture records | 2026-09-16 / 2026-09-17 | docs/workspace/MASTER.md:816-818 · docs/workspace/MASTER.md:2977-2981 |
| Numbered `1, 2, 3` step badges on checklist acts | "confused the numbering work?"; removed because they did not read top to bottom | 2026-09-27 | docs/workspace/MASTER.md:1603-1606 |
| Delivery Monitor 72px two-line rows copied into other modules | Delivery-only exception; no other module copies it without its own ruling; Payment Monitor dropped it for the SO register density | 2026-09-25 | docs/ui/MASTER.md:1462 · docs/ui/MASTER.md:1466 · docs/payment/MASTER.md:163-165 · docs/COPY-STANDARD.md:2700 |
| Service Case status dropdown `Pending / In Progress / Follow-up / Resolved` | "pending, in progress, follow up all confused and never follow rules"; status is a derived who + action + object sentence | 2026-10-06 | docs/service/MASTER.md:23-31 |
| Edit Delivery full-screen page | Retired; every arrangement write lives inside the Monitor row's expanded panels | 2026-09-13 | docs/COPY-STANDARD.md:3487-3488 · docs/delivery/MASTER.md:717-719 |
| Payments `Payments · Invoices` tabs, standalone Invoices or Receipts pages | Payments has only `Monitor` and `Payment Records` | 2026-09-12 | docs/payment/MASTER.md:135-137 |
| One combined Warehouse `Monitor` board for both directions | Retired; two pages `Arrival Schedule` and `Pickup Schedule` | 2026-09-14 | docs/COPY-STANDARD.md:2530 |
| `Old Orders (temporary)` row on the rail | Left the rail; its routes stay for legacy links | 2026-09-23 | docs/orders/MASTER.md:576-579 |
| `Send` as an action verb | Retired and banned from reuse; the act is `Issue` | 2026-07-29 | docs/COPY-STANDARD.md:1873-1876 |
| `warehouse-ui-preview.html` (hand-written shell, blue summary box, concatenated goods expansion) | Rejected by the owner; do not revive | UNKNOWN — ask Jess | docs/ui/MASTER.md:1545-1548 |
| 48px toolbar candidate · warm-grey hex palette · literal Houzs colours, 9px badges, 700 weight or 12px radius | Rejected or withdrawn; do not revive | UNKNOWN — ask Jess | docs/ui/MASTER.md:1548-1549 |
| Generic full-order editing drawer beside the Working Panel · `DetailShell` as a cross-module shell | Rejected or withdrawn; do not revive | UNKNOWN — ask Jess | docs/ui/MASTER.md:1549-1550 |
| Always-visible icon-only Export/Columns toolbar · former quick-view `Block` | Replaced by `⋯` and by `CompactModuleCard` | UNKNOWN — ask Jess | docs/ui/MASTER.md:1550-1551 |
