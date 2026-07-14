# WhatsApp chase templates (locked 2026-07-13)

Source of truth for every chase message the portal produces. Code:
`apps/web/src/lib/wa-templates.ts` (tests `wa-templates.test.ts`). The Orders
detail page's KPI boxes render a **[Reminder] + [Chase]** pair per actionable
track; every click copies the template AND logs a chase event
(`ops_order_control.last_chased_at`, migration 0221 — today a manual WhatsApp
paste; the future portal auto-fire writes the same event).

## Rules (locked)

- **Two tones per audience**: Reminder = gentle, first contact · Chase = firmer follow-up.
- **Lead id**: customer + logistic partner = **REF** (e.g. CR0902) · supplier = **PO**. Never the SO number — external parties don't speak SO.
- **Multi-line**: real line breaks; `waEncode` → `%0A` for wa.me deep links.
- `{items}` = one line per item: `{qty}× {model}`.
- `{outstanding}` = live Total − Collected, thousands-formatted (`1,749`).
- **Customer messages carry NO delivery date** — the logistic partner contacts the customer for the final slot; if the customer asks about delivery, ops replies with the partner's contact. No pressure phrasing ("settle by", "deliver on time").
- `{salutation}` = the optional preferred-name/title field when set, else Title-Case of the customer name. **Never auto-infer Mr/Ms.**

## CUSTOMER (money track)

Reminder:

```
Hi {salutation},
Just a friendly reminder regarding your order.

REF: {ref}
Outstanding: RM {outstanding}
Item: {items}

Do let us know once arranged. Thank you!
```

Chase:

```
Hi {salutation},
Following up on your order — the balance below is still outstanding.

REF: {ref}
Outstanding: RM {outstanding}
Item: {items}

Kindly arrange payment so we can proceed. Thank you!
```

## LOGISTIC partner (REF-led)

Reminder:

```
Hi {partner},
Friendly reminder — this delivery still needs an arrangement.

REF: {ref}
Customer: {customer} ({region})
Item: {items}
Deadline: {deadline}

Please confirm the delivery date + time slot with the customer. Thank you!
```

Chase:

```
Hi {partner},
Following up — this delivery is still not booked[ and the deadline has passed].

REF: {ref}
Customer: {customer} ({region})
Item: {items}
Deadline: {deadline}[ — overdue]

Please confirm the delivery date + time slot with the customer today. Thank you!
```

## SUPPLIER (PO-led)

Reminder:

```
Hi,
Friendly reminder — checking the stock ETA for this PO.

PO: {po}
Our ref: {ref}
Item: {items}
Needed by: {deadline}

Please advise when the stock will be ready. Thank you!
```

Chase:

```
Hi,
Following up — we still need the stock ETA for this PO.

PO: {po}
Our ref: {ref}
Item: {items}
Needed by: {deadline}

Please confirm the ready date today so we can plan the delivery. Thank you!
```
