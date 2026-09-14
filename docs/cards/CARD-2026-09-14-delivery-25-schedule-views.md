# Delivery Card 25 · Schedule responsive views, calendar indicators and compact cards

| | |
|---|---|
| Module | Delivery |
| Sequence | 25 |
| Owner authority | `docs/delivery/MASTER.md` §8.2 (the four view words, the rail calendar, the two-fact card) · `docs/ui/MASTER.md` · owner rulings 2026-09-14 |
| Build reference | the approved prototype, §2 rail and Work week, §3 tablet, §4 card gallery |
| Depends on | **Card 24** — it draws the kinds and counts Card 24 defines |
| Blocks | nothing |
| Migration | **none.** Presentation only. |

## What this Card owns

**How the schedule looks: the view words, the rail calendar's marks, and the card itself.**

## The work

1. **The four view words.** `Day` (<768px) · **`3 days`** (768–1279px) · **`Work week`**
   (≥1280px, the desktop default, six Mon–Sat columns) · `Month`.
   **A layout never wears a word it does not honour.** The desktop six-day week was never broken;
   the defect was the tablet three-day half-week still being labelled `Week`. The layouts are
   unchanged — `operatingWeekOf` and `tabletWindowOf` stay exactly as they are.

2. **The rail calendar.**
   - **Today wears a blue ring.** It currently has no treatment at all: production renders 14 Sep
     identically to 16, 17 and 18, although the component's own comment claims otherwise.
   - The selected date keeps the governed blue **fill**, so the two never compete.
   - **The current work week carries a subtle grey band.**
   - **Two separate marks per date — customer delivery and transfer** — by shape and position,
     with the same split in the day's accessible sentence. Never one mark for both.
   - **Marks follow the picked scope and every active filter.** `workDayIsos` is currently
     computed over all cards, so a date can carry a mark and open an empty day.
   - Two-month navigation, one arrow pair, muted unclickable Sundays: unchanged.

3. **The card — two facts, never one vague status.** In order: type label (`DELIVERY` /
   `TRANSFER`) with the partner · the confirmed window · who and where · the goods summary · the
   identity (`DO No`, or `SO No · Leg {n} of {m}`, or `DO not released`) · **line 1 journey
   progress · line 2 readiness or blocker.**
   - The status no longer repeats the date of the column it sits in.
   - It is a **text line, not a pill** — production truncates the pill to `Confirmed for Tu…`,
     losing the only part that carried meaning.
   - `DO not released` replaces `No delivery order yet` everywhere the fact appears, so the two
     surfaces cannot split (Law D).
   - A transfer card is visually distinct — its own ground and left rule — and prints its own route.
   - Readiness precedence: `Payment blocked` → `Stock risk` → `Logistics details incomplete` →
     `DO not released` → `Ready`.
   - Colour never travels without its word; no emoji, tick or warning glyph (§8.3 icon law).

4. **`Month`** prints `Deliveries {n}`, `Transfers {n}`, `Exceptions {n}` and
   `No logistics picked {n}` per date, never summing deliveries and transfers.

5. **States** — loading skeletons at the governed row height; an error says the read FAILED and
   never prints `0`; `No matching deliveries.`; the empty range keeps its one spanning sentence
   with the real `{n} deliveries need a confirmed date.` count and its door.

## Acceptance

- At ≥1280px the toolbar reads `Work week` over six Mon–Sat columns; at 768–1279px it reads
  `3 days` over three; below 768px, `Day`. No layout is ever labelled `Week`.
- Today is visibly distinct from both an ordinary day and the selected day.
- 15 Sep 2026 carries a transfer mark and no customer-delivery mark.
- A card shows two separate fact lines and never a date it already sits under.
- No status text truncates at the governed column width.

## Tests

- `delivery-monitor.test.ts` — the view-word map per breakpoint; month counts keep the two kinds
  apart; marks respect filters.
- `OperationDelivery.test.tsx` — the card renders both fact lines and the type label; the
  ring/fill/band treatments; the four states.
