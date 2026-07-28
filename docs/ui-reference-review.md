# UI Reference Review — what we learn from the world, and what we refuse

> **Opened by Loo, 2026-07-28**, immediately after the Order Detail Information Architecture
> line closed. **It is a separate line and must not be mixed into that one.**
>
> This file is the ONE home for the review. It is not a design document and it changes nothing
> on its own.

## The rules (Loo, 2026-07-28 — not negotiable by a chat)

1. **One reference at a time.** Never two in a discussion, never a comparison table of five.
2. **Never copy a design.** A reference is read for its *reasoning*, never for its look. "They
   do it this way" is not an argument.
3. **Every reference answers three questions**, in this order and in full:
   - **What do we learn?**
   - **What do we NOT learn?**
   - **Why does it fit Carres?** — including where it does not.
4. **Freeze one, then start the next.** No reference is revisited once frozen.
5. **`docs/UI-KIT.md` is NOT touched during this line.** Every reference is reviewed and frozen
   first; the kit is updated **once, at the end**, from the frozen set. Editing the kit while
   the review runs is how five references become five half-applied styles.

**A reference is a source of REASONING, not of authority.** Nothing in this file outranks
`docs/UI-KIT.md`, `docs/COPY-STANDARD.md`, `docs/ACTION-FLOW-STANDARD.md`,
`docs/execution-queues-index.md`, or the frozen
[`ORDER-DETAIL-INFORMATION-MODEL.md`](ORDER-DETAIL-INFORMATION-MODEL.md). Where a reference
conflicts with one of those, the conflict is **reported and the law wins** — that is a finding,
not a licence.

## The order

| # | Reference | What it is being read for | State |
|---|---|---|---|
| **R1** | **SAP Fiori** | Enterprise workflow | 🔵 in review |
| R2 | Linear | Operator workflow | ⏳ |
| R3 | Stripe Dashboard | Detail page | ⏳ |
| R4 | Vercel | Design system | ⏳ |
| R5 | GOV.UK · NN/g · Shopify Polaris · SAP Content | Microcopy | ⏳ |

**Then, and only then:** one card that updates `docs/UI-KIT.md` from the frozen set.

## What each entry must record when it freezes

The three questions, plus two things a future chat will need and cannot recover:

- **Conflicts found** — where the reference disagrees with a Carres law, and which won.
- **The limits of the reading** — what was read (published design guidance, a live product, a
  screenshot) and what was not. A reference reviewed from memory says so.
