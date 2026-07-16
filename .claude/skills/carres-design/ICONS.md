# Carres icon standard

**One icon system: [Lucide](https://lucide.dev)** (same as Carres POS). Stroke
width **2**, size **16–18px** in UI / **15px** inside buttons / **13–14px**
inside pills. Colour = `--muted`/`--ink-2`, or the pill's own ink inside a pill.
**No emoji. No hand-drawn SVG. No brand logos** (chasing is via WhatsApp, but we
use a neutral chat-bubble, not the WhatsApp mark — copyright).

Load: `lucide.createIcons({ attrs: { 'stroke-width': 2 } })`.

## Canonical mapping — same meaning ⇒ same glyph, everywhere

### Actions
| Meaning | Lucide |
|---|---|
| Add / new | `plus` |
| Edit | `pencil` |
| Delete | `trash-2` |
| View / open | `eye` |
| More / overflow (⋮) | `more-horizontal` |
| Close | `x` |
| Search | `search` |
| Filter | `sliders-horizontal` |
| Refresh / sync | `refresh-cw` |
| Expand / collapse | `chevron-down` |
| Back | `chevron-left` |
| Reminder (nudge) | `bell` |
| **Chase (message on WhatsApp)** | `message-circle` |
| Call (phone) | `phone` |
| Record payment | `plus-circle` |
| Confirm / done | `check` |
| Book logistic | `calendar-check` |
| Auto-match | `wand-2` |
| Print | `printer` |
| Export / download | `download` |
| Flag / pin | `flag` |
| Settings | `settings` |
| Help | `circle-help` |

### Entities (nav + sections)
| Meaning | Lucide |
|---|---|
| Dashboard | `layout-grid` |
| Orders | `clipboard-list` |
| POS | `shopping-cart` |
| Stock / package | `package` (item) · `boxes` (nav) |
| Warehouse / location | `warehouse` |
| Logistic / delivery | `truck` |
| Money / payments | `wallet` |
| Customer | `user` |
| Calendar | `calendar-days` |
| Notes | `lightbulb` |
| Follow-ups | `flag` |
| Activity / timeline | `scroll-text` |

### Status (always inside a pill, icon + word)
| State | Lucide | Pill |
|---|---|---|
| Ready / paid / on-time | `check` | green |
| Waiting / to reserve / chasing | `clock` | amber |
| Overdue / problem / no PO | `alert-circle` | red |
| On hold | `pause-circle` | amber |
| New (stock) | `sparkle` | green |

## The rule for Claude Code

> "Icons come only from this Lucide mapping — same meaning uses the same glyph on
> every page. Stroke 2. Never an emoji, a hand-drawn SVG, or a real brand logo.
> Chase = `message-circle` (WhatsApp), not a phone."
