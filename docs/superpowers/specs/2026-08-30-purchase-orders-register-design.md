# Purchase Orders Register and Object Design

**Owner-reviewed:** 30 Aug 2026
**Scope:** Purchasing → Purchase Orders
**Status:** Approved in sections; written review pending

## 1. Outcome

An inexperienced Operations employee can find every numbered PO, read its real document and
receiving state, open its goods, issue or revise the exact official PDF, record supplier answers
with evidence, and follow the true Receiving/GRN, claim and return connections.

The page is a permanent PO Register and governed PO object. It is not a dashboard, a second Work
Engine, a second Receiving writer or a replacement for SO Batch Purchase or Manual Purchase.

## 2. Locked boundaries

- Keep the approved expandable Purchasing navigation and its portal left rail.
- The destination word is `Purchase Orders`; the receiving destination/workspace word is
  `Receiving`.
- SO Batch Purchase and Manual Purchase both create approved demand through the one PO authority.
- No blank independent PO and no `+ New PO` door.
- Every numbered PO visible to the caller remains in the permanent Register, including completed
  and cancelled records. Filters never become unexplained eligibility rules.
- One PO may carry multiple governed `Deliver To` destinations at goods-line level.
- My Work, Team Work and the PO Register project the same structured action. They never create
  duplicate work records.
- Purchase Orders owns supplier outbound and supplier-answer evidence. Receiving owns physical
  check-in and creates the Goods Receipt and numbered GRN.
- This scope reads Receiving/GRN, claims, returns, Stock and Finance connections. It does not create
  another writer for them.
- No production migration is applied without the repository's explicit governed approval.

## 3. Dictionary and date law

The screen uses `PO Issued`, never `PO Date`.

```text
PO Issued              formal document date (`purchase_orders.placed_at`)
Issued                 current PO version reached the supplier with outbound evidence
PO Delivery Date       official supplier-facing date on the current PO version
Supplier Delivery Date supplier's recorded answer about delivery
Goods Received At      physical receipt date from Receiving/GRN only
```

`PO Issued` and `Issued` must never be derived from one another. A numbered PO may carry a formal
`PO Issued` date while its current version still has the fact `The PO PDF has not been sent`.

Screen dates use `fmtDate`: weekday always; year only outside the current year. Official PDFs always
print the year. Authoritative dates are never silently moved.

Purchasing supplier work uses the Operation Mon–Fri calendar. Warehouse/Receiving/GRN uses Mon–Sat.
Sunday and Selangor public holidays are excluded from work-day arithmetic.

## 4. Register composition

```text
┌─ Purchasing portal navigation ─┬─ Purchase Orders · global utilities ────────────┐
│ approved expandable tree     │ View · Search · PO Duty · Columns · Export           │
├─ 240px filter rail ─────┼─ governed Register table ──────────────────┤
│ factual PO filters           │ permanent numbered PO rows                         │
│ hide/show as one rail        │ expand goods · open object · safe outputs       │
└────────────────────────────└─ 32px factual footer ────────────────────────┘
```

The Register follows the Sales Orders Register grammar: compact Destination Header, one 45px Work
Toolbar, typed column filters, governed `DataGrid`, row expansion, Columns catalogue, safe export
and one status footer. It has no KPI preamble or Purchasing tab row.

### 4.1 Local filter rail

The 240px rail uses the governed `FilterRail` shell, can hide completely and carries factual filters:

```text
All Purchase Orders
PDF not sent
Supplier date missing
Supplier date passed
Version changed — supplier update required
Partly received
Completed
Cancelled
```

Counts are unique Purchase Orders. The default shows the full permanent Register. Labels wrap and
the rail never becomes a second Work/PIC summary.

### 4.2 Default columns

Exactly, in this order:

```text
PO No
PO Issued
Supplier
Items
Related To
Deliver To
PO Delivery Date
Supplier Delivery Date
Order Qty
Received Qty
Pending Delivery Qty
Status
Work
```

- First version prints `{po}`. A later version prints `{po} · Version {n}`.
- `Related To` reads governed Sales Order and Manual Purchase lineage. It never falls back to a
  global SKU/supplier match.
- One destination prints itself; multiple destinations print `Multiple` and expand to the exact
  goods-line mapping.
- `Supplier Delivery Date` prints `Not recorded`, `Same as PO`, or the changed supplier date.
- `Status` shows the preliminary unsent fact or the governed Operation Status.
- `Work` renders two-line fact/action copy with structured owner and governed due weekday/date.

### 4.3 Items and quantities

The disclosure arrow expands the goods without leaving the Register. The PO number and row
double-click open the full object.

```text
Item · SKU · Unit ID · Related To · Deliver To · Order Qty · Received Qty ·
Damaged Qty · Wrong Item Qty · Pending Delivery Qty
```

`Pending Delivery Qty` is good quantity still owed. Damaged, wrong and extra quantities never
reduce it and never create available Stock.

### 4.4 Search, Columns and outputs

Register Search covers PO number/version, supplier, governed source references, item/model/SKU,
Unit ID, Deliver To, Supplier DO, GRN and outbound recipient. Global `Jump to…` remains navigation
only.

Columns are grouped under Document, Supplier, Goods, Commercial, Connections and Ownership.
Optional fields include outbound channel/recipient/time, `Damaged Qty`, `Wrong Item Qty`, currency,
totals, Supplier DO, GRN No, `Goods Received At`, claims, returns, normal owner, cover and actual
actor.

Selected rows may export Excel or print/download official PDFs. The page never bulk-confirms
outbound evidence, supplier answers, receiving, revisions or cancellation.

## 5. PO object

Normal read is a full-width, one-scroll object with the views `Document`, `Revisions`, `History`
and `Order Route`.

Top to bottom in `Document`:

1. identity: PO number/version, supplier, `PO Issued`, Status and governed actions;
2. current Work block, only when work exists;
3. authoritative facts: supplier, `Related To`, dates, destinations, currency and total;
4. goods lines and all five governed quantity facts;
5. one outbound communication/evidence area;
6. supplier answer and its field-local history;
7. Receiving/GRN connections;
8. claims, returns and Stock/Unit connections;
9. the readable `Official PO`.

### 5.1 50/50 official document surface

Issue and governed revision use 50% decision/check + 50% live official PO preview. The right pane is
the exact PDF being reviewed and later sent. Changes to quantity, price, PO Delivery Date, Deliver
To or supplier-facing lines update the live preview.

Below 1130px, the decision work stacks above the readable official PO. Neither half is squeezed.
After completion, the object returns to full-width read while `Official PO` remains available.

### 5.2 Outbound evidence

One area owns:

```text
Issue PO / Issue Version {n}
Open WhatsApp / Open WhatsApp group / Open email / Download PDF
Record the PDF sent
```

Opening a channel or downloading the document is communication history and completes nothing.
Confirmation requires exact current version, recipient, channel, actual actor and time. An outbound
screenshot may be attached. A stale version writes nothing.

### 5.3 Supplier answer evidence

The answer UI first asks `Same as PO` or a different delivery date. It then records channel,
evidence, answer received/reported by, supplier answered/reported time, recorded by, recorded time,
reason and remarks where needed.

Evidence is required for the supplier answer. It may be a WhatsApp/email screenshot/file or a
structured phone/in-person note. Opening an external channel never completes the action.

The supplier answer never rewrites the official PO Delivery Date. An official date change creates a
new version.

## 6. Revisions, History and Order Route

`Revisions` preserves every complete official version, reason, changed fields, creator/time and the
outbound evidence for that exact version. A price change requires commercial approval. A quantity
cannot be reduced below good quantity already received. Supplier replacement is a cancellation/new
PO path, not a quiet revision.

`History` uses the governed three-rank event grammar and live Today/Yesterday/Earlier grouping.
Supplier-date history remains beside its field; History may point at the event but does not flatten
or duplicate its full evidence.

`Order Route` links only true owners:

```text
Sales Order / Manual Purchase → purchase demand → PO/version → outbound evidence →
supplier answer → Receiving Session → Supplier DO → Goods Receipt/GRN →
Stock/Units → claim/return/repair → Finance read-only
```

Every numbered object opens its exact owning record. Purchase Orders does not write Receiving/GRN,
Stock movement, claim outcome or Finance truth.

## 7. State and Work mapping

```text
Current version has no confirmed outbound evidence
  Status: The PO PDF has not been sent
  Work: Issue PO / Issue Version {n}

Current version has confirmed outbound evidence
  Status: Issued
  Next Purchasing fact: supplier delivery answer

Supplier fulfilment is underway
  Status: In Production

Physical good receipt has started
  Status: Receiving

All good quantity is received and no Purchasing action remains
  Status: Completed

Commitment will no longer be fulfilled
  Status: Cancelled
```

There is no `Acknowledged`, `Open`, `Send Status`, `Receiving Status`, `Draft`, `Prepared` or
`Pending` PO lifecycle word.

Work uses the dictionary's exact two-line facts/actions. It always carries structured owner,
structured object, recipient/result and governed due weekday/date. No staff name appears inside the
action sentence. Completion comes from the named business fact, never a manual Done checkbox.

My Work, Team Work and the PO Register deep-link the same action surface. A permitted colleague can
cover from the Register. The action closes everywhere after its authoritative result records.

## 8. Owner and permission evidence

- monthly PO Duty is the normal owner;
- dated cover is the resolved cover owner for its range;
- actual actor is the authenticated employee who performed the act;
- `operation@carres.com` and Jess are Operations Superusers and may act even when they are not the
  duty holder or cover;
- other employees follow governed Purchasing permissions.

Normal owner, cover and actual actor remain separate evidence. Work ownership is not the entire
permission model.

## 9. Failure and concurrency rules

Every failure has two-line Primary School Standard English: the concrete problem, then exactly what
to do. Required reads distinguish loading, failed and genuinely empty states.

- A version change while the issue surface is open refuses the stale evidence and writes nothing.
- An evidence upload failure does not create a complete supplier-answer record.
- Supplier answer and its evidence commit as one governed act.
- Repeated submission is idempotent and does not create duplicate completion evidence.
- A Receiving/GRN read failure never changes PO quantities.
- Historical values that cannot be proven print `Not recorded`; no migration manufactures them.

The existing supplier-date path may have overwritten `eta_date`. Implementation must audit the
formal version/snapshot authority and preserve the official PO date separately from supplier-answer
history. Any additive correction migration is delivered through repository law and is not applied
to production without explicit approval.

## 10. Verification boundary

Implementation is not complete until it proves:

- shared-state arithmetic and exact-version outbound evidence;
- API permission, pagination, governed lineage and no silent record cap;
- Register search, typed filters, columns, expansion and full-record visibility;
- 50/50 live official PO preview and stacked narrow layout;
- supplier-answer evidence, owner/cover/actual actor and Work deep links;
- Receiving/GRN, Unit, claim and return read connections without duplicate writers;
- UI Dictionary bans and exact Purchasing words;
- full tests, typecheck, lint, migration law and production build;
- authenticated browser owner walks at desktop and narrow widths with governed data paths.

No production deployment or migration is implied by passing these gates.
