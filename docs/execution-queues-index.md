# Execution queues — THE index (Jess's build map, 2026-07-27)

> **The whole balance of work lives in FIVE card-queue docs.** Open a new chat, pick ONE
> card from ONE line, paste the line's kickoff sentence. When a card ships, that chat
> marks ✅ + PR number in its own doc. These docs are the memory; chats are disposable.
>
> **Parallel law (upgraded 2026-07-27, after the serial version proved too cautious):**
> - WITHIN a line: strictly one card at a time, in order (R1 before R2, never together).
> - ACROSS lines: parallel chats are FINE when the lines live on different pages —
>   **R + S + K is a safe trio** (Purchasing · Service Cases · Stock never share files).
> - **① Delivery (T) and ② Journey (J) may NEVER run at the same time** — both edit the
>   Orders drawer. Either of them CAN run alongside R/S/K.
> - Migration-bearing cards: check the remote tracker tail immediately before apply
>   (guardrail #8). Two lines may take dual numbers the same day — cosmetic, the tracker
>   keys on timestamp; never renumber applied files.
> - Deploys will occasionally collide: every chat already follows the union-tip rule
>   (fetch → `log HEAD..origin/main` empty → build from union → both Pages projects →
>   poll 4 canonicals). A "different hash" moment during polling is normal — it resolves.

## The five lines

| Line | Doc | Cards | State |
|---|---|---|---|
| ① Delivery | `docs/delivery-execution-queue.md` | T1-T11 | T1-T6 ✅ · T7 next · ENDS at T11 |
| ② Order Journey | `docs/order-journey-execution-queue.md` | J1-J3 | ✅ **LINE COMPLETE** — J1 #385 · J2 #389 · J3 #394 |
| ③ Service Case wizard | `docs/service-case-execution-queue.md` | S1-S5 | not started |
| ④ Receiving & Supplier Claim | `docs/receiving-claim-execution-queue.md` | R1-R6 | not started |
| ⑤ Ready Stock | `docs/ready-stock-execution-queue.md` | K0-K5 | K0 ✅ #376 |

**State 2026-07-27:** ① T1-T7 ✅ (T8 running) · ② J1-J2 ✅ · ⑤ K0 ✅ — 10 of 31 shipped.
**Run now in parallel:** T8 (already running) + R1 + S1 + K1, four chats. J3 waits for the
T-line's drawer work to pause (slot it right after T8). Total = 31 cards.

## Sidebar map — where every line lands

**Law: only ONE new menu item ever (Delivery, born at T11). Everything else upgrades an
existing door.**

```
Dashboard
Orders              ← ① T1-T6 live here · ② Order Journey button lives in its drawer
Purchasing          ← ④ R1-R3 (Receiving tab exists; Claims becomes a sibling tab)
Delivery            ← NEW at ① T11 only (the 3-pane module page)
Stock               ← ⑤ K0 merges On Hand + Movements into ONE door with tabs
                       (On hand · Ready stock · In & out); "Inventory"/"Movements"
                       banned from UI — one warehouse, three questions
Payments            ← unchanged (reminder schedule stays parked here)
Operation Catalog   ← unchanged
Suppliers           ← ④ R5 supplier scorecard lands here
                       (④ R6 warehouse LOGIN = a new external ROLE like supplier/partner
                        portals — a portal shell, not a sidebar item here)
Service Cases       ← ③ S1-S5 (wizard rebuilds the entry, list/Service Note stay)
```

## Standing laws (apply to every line)

- One card = one chat = one PR = one deploy. Never two cards in one chat.
- Never rebuild anything a doc marks ALREADY EXISTS.
- Migration cards: check the remote tracker tail first (guardrail #8); drafts need Jess.
- Copy law `docs/COPY-STANDARD.md` (plain words; POD banned → "delivery photo") ·
  design law `docs/UI-KIT.md` · deploy law: main tip, both Pages projects, 4 canonicals.
- Chat stuck or inventing → close it, open a fresh one, paste the same line. No mercy.

## Kickoff sentences (copy exactly, change the card number)

```
Read docs/delivery-execution-queue.md. Do card T4 ONLY. ...
Read docs/order-journey-execution-queue.md. Do card J1 ONLY. ...
Read docs/service-case-execution-queue.md. Do card S1 ONLY. ...
Read docs/receiving-claim-execution-queue.md. Do card R1 ONLY. ...
Read docs/ready-stock-execution-queue.md. Do card K1 ONLY. ...
```

Full sentence template: "Read <doc>. Do card <n> ONLY. Build it, test it, create the PR,
merge, deploy from main, then mark <n> ✅ in the doc with the PR number. Do not touch any
other card. Do not redesign anything marked ALREADY EXISTS."
