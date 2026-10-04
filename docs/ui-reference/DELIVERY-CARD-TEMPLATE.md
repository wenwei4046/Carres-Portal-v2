# Confirmed Delivery card template

Owner confirmed 3 Oct 2026. Current source: compact-timeline-38 plus functioning recipient links. This replaces clean-communication-29 and all intermediate template toolbar proposals.

## Copy these files together

- `delivery-card-approved.html` — complete approved interactive reference (single file; the `<style>` block is byte-identical to the CSS file below).
- `delivery-card-approved.css` — exact complete cascade and media rules, including rules left over from earlier preview rounds. Later rules override earlier ones; copy the cascade whole, never single rules.
- `delivery-card-measurements.json` — Chromium bounds and 17 computed styles for every visible element inside `#complete-panel`, keyed by viewport width only: `1146`, `480`, `440`, `420`, `390`, height `900`.

Published template: `/ui-kit/delivery-card.html?show=communication`. Timeline: `?show=timeline`. `?show=template` opens the naming dialog with sample text. The `.html` address redirects to the extension-less address; both serve the same file.
HTML SHA-256: `bdbaee5395663faead83948ac82cf88eaacecba99249ef0dca79eccd65ceb92a`.

## Required composition

560px maximum card; grey customer header; module tabs and Communication/items/Timeline icons; one four-cell fact strip; inline editors; collapsed shared items; Communication then Timeline below. Cancel precedes blue Save at right. Copy the complete CSS; responsive widths and content-dependent heights are measured, not guessed.

Communication: channel dropdown 112×32 in header beside close; no separate channel row. Recipient label 48px and input 32px. Select the known customer or enter phone/email. Email alone shows Subject. Message textarea 80px; Message options 32px ellipsis opens Find template, Save as template, Manage templates. Named-template dialog 320px. One attachment entry. Copy message and Open WhatsApp/Open email at right.

Timeline: 28px actor avatar, actor name in accessible label/tooltip instead of duplicate name row. Event summary and date/time on first line; receipt/reference/result on second. New preview saves use actual save timestamp in Asia/Kuala_Lumpur with MYT. If source only establishes date, retain date and explicitly indicate Time unavailable; never invent hour. Opening a channel or copying text does not claim sent/contacted.

Stock Ready counts order-eligible goods secured; receiving, packing and handover are separate. Stock 1/1 is a layout example, not verified SO-1368. No product pictures on Delivery lines. Use module-specific facts when adopting Purchasing/Warehouse.

## Measured state and how to reproduce it

The JSON holds **one state per width**: Communication open on WhatsApp with an empty recipient, Timeline open with one event, items/editors/address/menu/dialog closed. Reproduce it with `?show=timeline` and then one click on the Communication icon. Geometry re-measured on 4 Oct 2026 matched every element within 0.6px at all five widths. One recorded difference: in the JSON the Communication icon shows its inactive colour although the panel is open, because the capture opened the panel without the icon; after a real click the icon is active (`#006ac2` on `#f0f3f6`).

Fixed sizes: card max 560 · header 56 · module tab row 36.8 · icon controls 32×32 · fact cell min 60 · channel 112×32 · recipient label 48, input 32 · message 80 · named-template dialog 320 · avatar 28. Content decides: card height, Communication height (312 in the measured state, of which 6px is the empty `#copied` status line), Timeline height, fact strip (one row of four above 420px, two rows of two at 420px and below), every editor height.

### States not in the JSON — audit values, 4 Oct 2026, Chromium, widths 1146 / 390

| State | Measured | Note |
|---|---|---|
| Email channel | Subject row 538/348 × 32 above Message; button reads `Open email`; enabled only for a valid address | No email suggestions exist |
| Message ⋯ menu | 190×108, right-aligned under ⋯ | No page overflow |
| Find template | Picker 538/348 × 126 | |
| Named-template dialog | 320×166, centred | Escape closes it |
| Manage templates, empty | 538/348 × 72, `No saved templates yet.` | |
| Logistics editor | 538/348 × 121 | |
| Arrangement editor | 538 × 198 at 1146; 348 × 291 at 390 (stacks) | |
| DO conditions | 538 × 128 at 1146; 348 × 155 at 390 | |
| Items expanded | 538/348 × 117 | |
| Address expanded | full card width × 60 | |
| Timeline with no events | heading row only, no empty-state words | Not defined |
| Long customer name at 390 | name wraps to 72px inside the fixed 56px header and covers the tab row | Defect, see below |

## Known gaps in the reference — recorded, not approved changes

- Message ⋯ menu does not close on Escape or on an outside click.
- At 390px every control stays 32px or smaller (address control 37×18); the kit touch rule is 40px below 768px.
- Fixed 56px header does not grow with a long name at narrow width.
- Colours, font family, radii, 10px type and stroke 1.7 icons are local values (`#006ac2`, `#202631`, `system-ui`, radius 8/4), not `01-design-tokens.md` values (blue-9, slate-12, Inter, radius 10/6, Lucide stroke 2).
- Header Open/Close and ⋯ are text glyphs, not the kit Icon registry.
- Logistics editor DOM order is Save then Cancel; CSS reverses it visually, so keyboard order differs from screen order.
- Save note stamp is 24-hour; the Timeline stamp is 12-hour.
- Items table shows a dash for service lines.
- Visible words `Find template…`, `Save as template…`, `Manage templates…`, `Message options`, `Time unavailable`, `Data not loaded`, `Subject`, `Saved templates`, `Attach evidence` are not in `COPY-STANDARD.md`.
- Inline `<script>` and `onclick` handlers would stop under the production `script-src 'self'` policy, which is currently report-only.
- Element ids (`#communication`, `#timeline`, `#message`, `#recipient`) are page-global; two cards on one page collide.
- Native `confirm()` is used for replace-draft and delete-template.

## Implemented reference boundary

Recipient links need no API: wa.me opens a WhatsApp draft, mailto opens a default mail draft. Actual sending remains in that application. No invented supplier contact; no verified customer email. PO/evidence attachments require manual attachment in external mail. Template names/bodies persist in this browser's localStorage only; no team sharing/access control or backend upload. Reference publication does not migrate production module cards.

There is no shared React component for this card. `apps/web/src/components/kit` has none, and production Work communication (`apps/web/src/pages/operation/work/WorkCommunication.tsx`) is a separate design: recorded channels only, no manual recipient, no ⋯ template menu. Adopting the card means rebuilding it with kit primitives, not importing it.
