# STATUS STANDARD — dials, checklist marks, chase buttons

> Companion to [`docs/UI-KIT.md`](UI-KIT.md) (the law — this file details ONE
> subsystem: how order status renders). Locked 2026-07-17 (Jess). Code lives
> in `OrderDetailDrawer.tsx` (`PieDial`, `CheckMark`) + `index.css`
> (`.btn-reminder` / `.btn-chase` / `.railtab*`).

## 1. Dials (Balance + Stock panels)

A 30px donut (SVG, `stroke=currentColor`, grey `base-200` track) whose FILL
fraction and COLOUR are the state. No icon inside; the number next to it says
the rest.

**Balance (payment) dial** — fraction = collected ÷ total:

| State | Fraction | Tone class |
|---|---|---|
| Unpaid | 0 (empty ring) | `text-info` blue |
| Deposit | collected/total | `text-info` blue |
| Overdue (owing past deadline) | collected/total | `text-danger` red |
| Paid | 1 (full) | `text-success` green |
| Sent | — only rendered when an invoice-sent signal EXISTS (none today — omitted) |

**Stock dial** — fraction = ready ÷ goods lines:

| State | Fraction | Tone |
|---|---|---|
| No stock | 0 | `text-base-300` grey |
| Partial / Arriving | ready/goods | `text-warning` amber |
| Delayed (ETA passed, not ready) | ready/goods | `text-danger` red |
| Ready | 1 | `text-success` green |

## 2. Checklist marks (all panels; Logistic has no dial)

20px rounded mark, shape-first (§8c):

| Mark | Meaning | Recipe |
|---|---|---|
| ✓ | done | green circle `bg-success-soft text-success` + `check` 14 |
| ⏲ | waiting / partial | amber circle `bg-warning-soft text-warning` + `clock` 14 |
| ⚠/✗ | blocked / needs action | red circle `bg-error-soft text-danger` + `x` 14 |
| ○ | pending | empty ring `border-base-300` |
| — | not applicable | grey circle `bg-base-100 text-base-400` + `minus` 14 |

## 3. The chase pair (every party panel's footer)

Both COPY the locked WhatsApp template (`lib/wa-templates.ts`) and stamp the
chase log. Customer templates are multi-line and never mention a delivery date.

| Button | Look | Tone |
|---|---|---|
| **Reminder** | `.btn-reminder` — white, grey `base-300` outline, `bell` 14 | gentle / first contact |
| **Chase** | `.btn-chase` — white, WhatsApp-green outline `#1D9E75`, ink `#0F6E56`, `message-circle` 14 | firm follow-up |
| **Chase (hot)** | `.btn-chase-hot` — light green fill `#E1F5EE` | the track is OVERDUE |

Green is the WhatsApp association — never the brand mark glyph (copyright);
the glyph is always `message-circle`. Flame stays reserved for the page's ONE
hero; **panels carry no flame**. Black paints ONLY the `#so` badge in the
Customer panel.

## 4. Tab rail states

Active + hover = BLUE (selection colour): `.railtab-active` = `#DBEAFE` fill +
`#1E40AF` text; hover = `#DBEAFE` at 50%. Red dot = the tab's track needs
action; count chip (white bg, amber ink) where a number says more.
