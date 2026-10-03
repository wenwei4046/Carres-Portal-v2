# Confirmed Delivery card template

Owner confirmed 3 Oct 2026. Current source: compact-timeline-38 plus functioning recipient links. This replaces clean-communication-29 and all intermediate template toolbar proposals.

## Copy these files together

- delivery-card-approved.html — complete approved interactive reference.
- delivery-card-approved.css — exact complete cascade and media rules.
- delivery-card-measurements.json — every visible element's Chromium bounds and computed styles, at widths1146,480,440,420,390 and height900; measured states are listed in JSON.

Published template: `/ui-kit/delivery-card.html?show=communication`. Timeline: `?show=timeline`.
HTML SHA-256: `bdbaee5395663faead83948ac82cf88eaacecba99249ef0dca79eccd65ceb92a`.

## Required composition

560px maximum card; grey customer header; module tabs and Communication/items/Timeline icons; one four-cell fact strip; inline editors; collapsed shared items; Communication then Timeline below. Cancel precedes blue Save at right. Copy the complete CSS; responsive widths and content-dependent heights are measured, not guessed.

Communication: channel dropdown112×32 in header beside close; no separate channel row. Recipient label48px and input32px. Select the known customer or enter phone/email. Email alone shows Subject. Message textarea80px; Message options32px ellipsis opens Find template, Save as template, Manage templates. Named-template dialog320px. One attachment entry. Copy message and Open WhatsApp/Open email at right.

Timeline:28px actor avatar, actor name in accessible label/tooltip instead of duplicate name row. Event summary and date/time on first line; receipt/reference/result on second. New preview saves use actual save timestamp in Asia/Kuala_Lumpur with MYT. If source only establishes date, retain date and explicitly indicate Time unavailable; never invent hour. Opening a channel or copying text does not claim sent/contacted.

Stock Ready counts order-eligible goods secured; receiving, packing and handover are separate. Stock1/1 is a layout example, not verifiedSO1368. No product pictures on Delivery lines. Use module-specific facts when adopting Purchasing/Warehouse.

## Implemented reference boundary

Recipient links need no API: wa.me opens a WhatsApp draft, mailto opens a default mail draft. Actual sending remains in that application. No invented supplier contact; no verified customer email. PO/evidence attachments require manual attachment in external mail. Template names/bodies persist in this browser's localStorage only; no team sharing/access control or backend upload. Reference publication does not migrate production module cards.
