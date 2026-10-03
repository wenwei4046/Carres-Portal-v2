# Confirmed compact module card — copy contract

Owner approved 2026-10-03. APPROVED UI TARGET / NOT BUILT.

## Single source

- `delivery-card-approved.html`: frozen approved composition and interactions.
- `delivery-card-approved.css`: complete exact stylesheet extracted from that HTML, including cascade and all media rules. Do not cherry-pick early declarations: later rules override them.
- `delivery-card-measurements.json`: actual Chromium computed measurements of EVERY visible element at viewport widths 1146, 480, 440, 420 and 390 px, height 900 px. Includes bounding box, display/grid columns, gap, padding, margin, typography, foreground/background, border, radius, min-height, alignment.

Measured state: address collapsed, items and Communication expanded, Confirmed Delivery editor open with Confirmed selected. These measurements describe the frozen sample text; content-dependent heights may change. Frame max width560px; narrow rules are in the CSS and computed JSON, not inferred. Hidden states and unconfirmed follow-up controls are defined by the frozen HTML/CSS; do not claim measured visibility for hidden elements.

## Desktop measurement index (CSS pixels)

| Element | Actual width × height | Padding | Font / line height | Gap |
|---|---:|---|---|---|
| `complete-panel` | 560.00 × 885.94 | 0px | 13px / 18.2px | normal |
| `header option-one` | 558.00 × 56.00 | 6px 12px | 13px / 18.2px | 8px |
| `module-nav` | 558.00 × 36.80 | 0px 10px | 13px / 18.2px | 0px |
| `four strip` | 538.00 × 62.00 | 0px | 13px / 18.2px | 0px |
| `cell` | 134.00 × 60.00 | 8px | 13px / 18.2px | normal |
| `cell` | 134.00 × 60.00 | 8px | 13px / 18.2px | normal |
| `cell` | 134.00 × 60.00 | 8px | 13px / 18.2px | normal |
| `cell` | 134.00 × 60.00 | 8px | 13px / 18.2px | normal |
| `editor1` | 538.00 × 264.36 | 10px | 13px / 18.2px | normal |
| `arrange-split` | 518.00 × 176.17 | 0px | 13px / 18.2px | 12px |
| `original-date` | 176.00 × 176.17 | 0px 10px 0px 0px | 13px / 18.2px | 5px |
| `requested-date` | 165.00 × 36.19 | 8px | 13px / 18.2px | normal |
| `arrange-update` | 330.00 × 176.17 | 0px | 13px / 18.2px | normal |
| `date1` | 330.00 × 33.00 | 7px | 12px / normal | normal |
| `btn` | 49.17 × 32.00 | 6px 10px | 12px / 16.8px | normal |
| `btn` | 60.83 × 32.00 | 6px 10px | 12px / 16.8px | normal |
| `communication` | 558.00 × 312.00 | 10px | 13px / 18.2px | normal |
| `btn` | 29.56 × 32.00 | 6px 10px | 12px / 16.8px | normal |
| `recipient-line` | 538.00 × 32.00 | 0px | 13px / 18.2px | 8px |
| `recipient` | 482.00 × 32.00 | 7px | 12px / normal | normal |
| `message-toolbar` | 538.00 × 32.00 | 0px | 13px / 18.2px | 8px |
| `template` | 150.00 × 32.00 | 4px 8px | 12px / normal | normal |
| `message` | 538.00 × 80.00 | 7px | 12px / normal | normal |
| `btn` | 105.20 × 32.00 | 6px 10px | 12px / 16.8px | normal |
| `btn` | 114.25 × 32.00 | 6px 10px | 12px / 16.8px | normal |

## Mandatory reuse

Copy the approved header, module navigation, compact editable fact strip, inline editor, shared expandable item table and below-item collapsible Communication composition. Buttons at right-bottom: Cancel followed by blue Save. Template beside Message; recipient label column48px; icon controls32px with16px icons. Preserve original requested date as read-only. Keep source-specific facts and approved words for each module: Purchasing must not inherit Delivery's four field names. No technical explanation paragraphs inside the product card; preview caveats remain outside. No duplicate attachment menu or product pictures on Delivery lines. No `readiness` wording.

Stock Ready quantity means eligible goods secured for the order/scope. Receipt and scanning/checking/packing/handover are separate facts. Sample1/1 is not a verified SO1368 fact. No application code, WhatsApp API, upload persistence or production behavior is certified by this reference.

All chats must read these same three files before proposing derivative cards. If governed production tokens conflict with the frozen prototype, report the precise conflict; do not silently adjust measurements or say exact-copy verified without comparing.

Frozen HTML SHA-256: `14ca07bf11b34d16eaa97e8c73fea80ded06327dbe68b673cea84cb338a713e0`.
