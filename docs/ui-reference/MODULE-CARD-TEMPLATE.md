# Compact module card — contract

Owner handoff 2026-10-04 (shared header for every module), on top of the card confirmed 2026-10-03.
This replaces the earlier Delivery-only reference and every separate header proposal.

**Use the kit component, never these files:** `apps/web/src/components/kit/CompactModuleCard.tsx`
(live on `/ui#compact-card` with Info and Delivery). The reference page
`module-card-reference.html` (published at `/ui-kit/module-card.html`, SHA-256 `fca84f58d7a4687f…`)
is the proof target. `node scripts/compact-card-states.mjs <dev url>` drives both through 18 states
at five widths and must report **no unexplained difference**. `module-card-measurements.json` holds
the reference card and header heights per state and width.

## Rules (owner, 2026-10-04)

- **One shared customer header** for every module: name · order · phone; a ▾/▴ at the lower right of
  the customer cell opens the sales facts (no `Order info` words); address with its own toggle; target
  date; Open and Close. The header grows with a long name; nothing overlaps.
- **Sales facts:** `Order date` · `Sales Location` · `Salesperson`, label above value.
- **Info opens sales facts and address by default; every other module starts with both closed.**
  Switching module applies that module's default and closes items and editors.
- **Summary cells:** label above value, left aligned. Info: `Total` · `Paid` · `Outstanding`.
  Delivery: `Stock` · `Logistics` · `Confirmed Delivery` · `DO`. Other modules use their own facts and
  only as many cells as they have — never padded to four.
- **Least lines:** a value takes the lines its content needs, at most four; four is a limit, not a
  reserved height. Icons sit on the line of their title and appear only when they identify or act.
- **Editors:** one open at a time; a successful save folds it, a failed save keeps the input;
  `Cancel` then `Save` at the right. No separate "saved" note — the Timeline records it.
- **DO:** one condition per line; no repeated explanation paragraph.
- **Items, Communication and Timeline start closed.**
- **Time:** shown as `30 Sep · 4:08 PM` with no zone suffix; the full instant stays in the element and
  its title (`Recorded 30 Sep 2026, 4:08:32 PM`), in Asia/Kuala_Lumpur. A source with only a date shows
  the date and `Time unavailable`; an hour is never invented.
- **Never repeat** the header, a date, the sales facts or a completion note inside a module.
- Communication: channel select in its header, `To` with the known contact or a typed phone/email,
  `Subject` for Email only, Message ⋯ for Find / Save as / Manage templates (Escape or a press outside
  closes it), a 320px naming dialog, one attachment entry, `Copy message` and `Open WhatsApp` /
  `Open email` at right. Links open drafts and never mark anything sent.

## Sample data on /ui

SO-1368 order facts (customer, order date, Sales Location, Salesperson, Total/Paid/Outstanding, the
payment at 2026-09-30T08:08:32Z, receipt RC-300926-3735) are the verified handoff sample. Delivery
`Stock 1/1 Ready` is a layout sample, not verified stock. Saves on /ui are preview only and write
nothing to the ERP.

## Deviations from the reference page — owner rules win

| State | Reference page | Component | Why |
|---|---|---|---|
| DO conditions, wide card | two conditions per line | one per line | owner rule "DO 每个条件一行" |
| Arrangement save | shows `Preview only · Recorded at …` | no note | owner rule "不重复完成说明" |
| Info strip, card ≤ 400px | loses the Paid \| Outstanding divider (a Delivery-only rule leaks) | divider kept | reference defect |
| Message ⋯ menu | Escape and outside press do nothing | both close it | owner request to fix Escape |

## Open — not approved

- Palette, font family, radii and drawn glyphs are the reference's own, not `01-design-tokens.md`.
- Controls stay 32px at phone width; a 40px touch version is shown for review only.
- The editable `To` differs from the Work panel's recorded-channels-only rule.
- The Delivery item list shows a dash for service lines (portal rule: no dash on screen).
- No production page uses the card yet.
