# archive — history. **No chat is required to read anything in here.**

Retired on **2026-08-05** by the Documentation Architecture Migration. **Nothing was deleted
that held unique business knowledge** — every active rule was moved into a MASTER first, and git
keeps the rest either way.

## Where to go instead

```
CLAUDE.md                    the Project Constitution — the only automatic entrance
docs/<module>/MASTER.md      everything about that module
docs/ENGINEERING.md          stack, migrations, deployment, testing, measuring
```

| Retired file | Active home |
|---|---|
| `ORDERS-WORKING-FLOW.md` · `ORDER-DETAIL-INFORMATION-MODEL.md` · `portal-core-shipped-cards.md` · `order-journey-shipped-cards.md` · `operation-portal-redesign.md` · `orders-panel-concept-proposal.md` · `CHECKPOINT-orders-*` | `docs/orders/MASTER.md` |
| `PURCHASING-WORKING-FLOW.md` · `PURCHASING-INFORMATION-MODEL.md` · `PURCHASING-MODULE-MAP.md` · `PURCHASING-NEXT.md` · `purchasing-shipped-cards.md` · `receiving-claim-shipped-cards.md` · `RECEIVING-INFORMATION-MODEL.md` · `CHECKPOINT-purchase-orders/-claims/-to-order/-receiving/-grn` · `HANDOFF-0319-purchase-demands.md` | `docs/purchasing/MASTER.md` |
| `delivery-shipped-cards.md` · `delivery-module-proposal.md` | `docs/delivery/MASTER.md` |
| `ready-stock-shipped-cards.md` · `inventory-module-proposal.md` | `docs/stock/MASTER.md` |
| `payment-module-proposal.md` | `docs/payment/MASTER.md` |
| `service-shipped-cards.md` | `docs/service/MASTER.md` |
| `UI-KIT-superseded.md` · `ui-kit-shipped-cards.md` · `ui-reference-review.md` · `right-rail-widgets-proposal.md` | `docs/ui/MASTER.md` |
| `hr-system-full-spec.md` | `docs/hr/MASTER.md` |
| `rental-service-plan-proposal.md` · `subscription-mattress-proposal.md` | `docs/rental/MASTER.md` · `docs/purchasing/MASTER.md` §10 |
| `execution-queues-index.md` · `HOW-TO-RUN-A-CHAT.md` · `NEW-CHAT-KICKOFF.md` · `OPS-BUILD-BRIEF.md` · `PANEL-PROPOSALS-FOR-REVIEW.md` · `PROJECT-HANDOVER.md` · `CARRES_SYSTEM_MASTERPLAN.md` | `CLAUDE.md` + `docs/ENGINEERING.md` |
| `phase-10-worklog.md` · `claude-md-archive-2026-07-25.md` · `phase-*-reflection.md` · `CHECKPOINT-2026-06-*` · `PARALLEL-DEV-CHECKPOINT.md` | history only — nothing active |

## ⚠️ Application-code comments still cite old paths

**This migration did not touch application code**, so source comments still name files that have
moved — measured at retirement time: `ORDERS-WORKING-FLOW.md` **43** citations ·
`UI-KIT.md` **32** · `receiving-claim-execution-queue.md` **21** ·
`ready-stock-execution-queue.md` **18** · `PURCHASING-WORKING-FLOW.md` **13** ·
`delivery-execution-queue.md` **8**, and smaller counts elsewhere.

**The table above is the redirect.** Repointing those comments means editing application code,
which this migration is explicitly forbidden to do; it is a separate mechanical card.

## Why any of this was retired

**8,999 lines of Purchasing queues and checkpoints held eight cards of open work.** Across the
whole repository the pattern was the same: every chat walked past dozens of shipped cards to
find what was left, so every chat skipped, and what a chat skips it re-invents.

```
Done work and to-do work may never live in the same file.
A MASTER is overwritten, never versioned. Git history is the archive.
Documents do not carry history.
```

**Links inside these files point at documents that no longer exist. That is expected** — they
are frozen records of what was true when they were written, and repairing them would make them
lie about their own date.
