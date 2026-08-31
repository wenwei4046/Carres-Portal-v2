# PURCHASING — CARD 07 · PURCHASE ORDERS BUSINESS RAIL COPY

**Card path:** `docs/cards/CARD-2026-08-31-purchasing-07-purchase-orders-business-rail-copy.md`
**Module:** Purchasing · **Sequence:** 07
**Page:** Purchase Orders
**Surface:** The 240px left Register rail only
**Status:** READY FOR BUILD — owner-approved 2026-08-31
**Lane:** BUILD / DELIVERY
**Depends on:** latest `main` `a463687d`; the shipped Purchase Orders Register and shared
Purchasing/Receiving authority
**Expected migration:** NONE. This Card changes no business fact, filter key, count, permission,
PO writer, supplier communication evidence or Receiving hand-off.

---

## 1 · Problem and outcome

The production rail currently exposes the implementation word `Filters` and presents every row as
one flat list. The longest row reads `Version changed — supplier update required`; the dash joins
two different ideas, and `supplier update` can be mistaken for editing Supplier master data.

Replace the generic heading with business groups. Keep one selectable row and one count for a
changed PO version, but render its fact and required action on two deliberate lines:

```text
Version changed
Send the new version to supplier
```

This is a copy/layout correction, not a new work queue. Clicking any row still filters the same
Purchase Orders Register with the same server-derived filter key.

## 2 · Resolved from current authority

Read before build: `CLAUDE.md` · `docs/ERP-ARCHITECTURE.md` · `docs/ui/MASTER.md` ·
`docs/COPY-STANDARD.md` · `docs/purchasing/MASTER.md` · current
`PurchaseOrdersPage.tsx` and its tests · `purchase-order-register.ts` and tests.

| Current production | Lesson | Decision | Card 07 answer |
|---|---|---|---|
| Permanent heading `Filters` | A business rail explains the business dimension, not the UI mechanism | **REJECT** | No visible generic rail title; use business group headings |
| Seven unrelated rows in one flat block | Operators scan a rail by document, date and receiving concern | **IMPROVE** | Group the existing rows without changing their filter truth |
| `Version changed — supplier update required` | Fact and next act must not look like one wrapped sentence | **IMPROVE** | Two explicit lines; no dash |
| `supplier update required` | “Update supplier” sounds like Supplier master-data maintenance | **REJECT** | Say the real act: `Send the new version to supplier` |
| Existing filter keys/counts | The current register arithmetic already answers the correct populations | **KEEP** | No new key, status or count arithmetic |

## 3 · Exact 240px rail

Use the existing Carres `FilterRail`/`NavRow` visual grammar: 240px, governed active blue line and
wash, wrapped labels, right-aligned counts, vertical scroll and no checkbox.

Exact visible structure:

```text
PURCHASE ORDERS
  All purchase orders

DOCUMENT
  PDF not sent

  Version changed
  Send the new version to supplier

DELIVERY DATE
  Supplier date missing
  Supplier date passed

RECEIVING
  Partly received
  Completed
```

Rules:

- `PURCHASE ORDERS`, `DOCUMENT`, `DELIVERY DATE` and `RECEIVING` are group headings, not rows.
- `All purchase orders` clears the rail selection and shows the permanent complete Register.
- `Version changed` + `Send the new version to supplier` is ONE row using the existing
  `supplier_update_required` key, one active state and one count.
- On that row, line 1 uses governed body size/medium emphasis. Line 2 is a deliberate supporting
  line in governed smaller text. It is not accidental wrapping and contains no `—`.
- The count remains right-aligned and vertically stable beside the two-line label.
- `Supplier date missing` and `Supplier date passed` remain the existing supplier-date facts;
  the `DELIVERY DATE` heading supplies their context without repeating a long noun in every row.
- The visible permanent word `Filters` is removed from the open desktop rail. The existing
  specific accessible name, register column filters, conditional reset action and responsive rail
  mechanics are outside this wording correction.

## 4 · Truth and permission boundary

The exact mappings remain:

```text
PDF not sent                    → pdf_not_sent
Supplier date missing           → supplier_date_missing
Supplier date passed            → supplier_date_passed
Version changed / send new copy → supplier_update_required
Partly received                 → partly_received
Completed                       → completed
```

Do not change `purchaseOrderRegisterFacts`, `purchaseOrderWork`, PO version/sent evidence,
supplier-date ledgers, receipt quantities or completion rules. The two-line row does not itself
send anything. The actual supplier action remains in governed Work/Object Detail and completes
only from the existing confirmed-sent evidence for the current PO version.

## 5 · Build boundary

Expected files:

- `apps/web/src/pages/operation/purchase-orders/PurchaseOrdersPage.tsx`;
- `apps/web/src/pages/operation/purchase-orders/PurchaseOrdersPage.test.tsx`;
- `docs/COPY-STANDARD.md` and `docs/purchasing/MASTER.md`;
- this Card's completion evidence after production verification.

No API, shared arithmetic, SQL, migration, Purchase Order table, Object Detail, Work Engine,
Receiving page or global rail redesign is authorised.

## 6 · Acceptance contract

1. The open desktop rail contains no visible generic `Filters` heading.
2. The four exact business headings render in the exact order in §3.
3. All seven current selectable meanings remain available with the same filter keys and counts.
4. The version row is one button, one count and one active state with two explicit visual lines:
   `Version changed` then `Send the new version to supplier`.
5. No em dash and no visible `supplier update required` phrase remain on this rail.
6. Clicking each row returns the same Purchase Order population as before; clicking the active row
   clears it; `All purchase orders` restores the full permanent Register.
7. The 240px rail, active treatment, right-aligned counts, narrow-width behaviour and Register
   table remain visually and behaviourally unchanged outside this correction.
8. Focused Purchase Orders tests, full web tests, typecheck, design-standard, production build and
   `git diff --check` pass before merge.
9. After merge, all production surfaces converge on the merge SHA and an authenticated walk proves
   the grouped rail, two-line version row and unchanged filter populations.

## 7 · Owner Decision Gate

No owner question remains. The Owner rejected `Filters`, rejected the dash compound, approved the
business groups and approved the two-line fact/action wording. Build must implement those exact
words without proposing alternatives or expanding the page.

---

## 8 · Completion evidence — SHIPPED AND PRODUCTION-VERIFIED 2026-08-31

**Status: COMPLETE.** Built from `codex/purchase-orders-rail-copy` @ `63580f9f`, merged to `main`
via PR #997 (`build/purchasing-07-rail-copy`), merge commit `00adbb6f`.

**Release gate (all pass before merge):**

- Focused `PurchaseOrdersPage.test.tsx`: 21/21.
- Full web suite: 282 files / 3,627 tests, exit 0.
- `tsc --noEmit` typecheck · design-standard lint · production `vite build` · `git diff --check`.
- GitHub CI `verify`: pass (run 33357645574).

**Production convergence (deploy run 33358235564, success):** all five canonical surfaces report
`commit 00adbb6f20cce221dae2d53818c470844618890b` — carres-portal Pages, carres-pos Pages,
`erp.carresofficial.com`, `pos.carresofficial.com` (`__carres_deploy.json`) and
`api.carresofficial.com/health`.

**Served-bundle proof (`/assets/index-CSxikwOh.js`):** `Send the new version to supplier`,
`Supplier date missing`, `Supplier date passed`, `All purchase orders` each present once;
`supplier update required` and the em-dash compound absent (0 matches).

**Authenticated production walk (operation@carres.com, 2026-08-31):**

- The open desktop rail shows no `Filters` heading; the four headings render in order:
  `PURCHASE ORDERS · DOCUMENT · DELIVERY DATE · RECEIVING`.
- The version row is one button, one count, one active state, with the two deliberate lines
  `Version changed` / `Send the new version to supplier` — no dash, no wrapped sentence.
- Populations unchanged and equal to the rail counts: `All purchase orders` 24 · `PDF not sent`
  22 (footer `22 purchase orders · Ordered 43 · Received 0 · Open 43`) · `Completed` 2 (footer
  `2 purchase orders · Ordered 4 · Received 4 · Open 0`, rows PO-2054 and PO-2052) ·
  `Version changed` 0 · both supplier-date rows 0 · `Partly received` 0.
- Clicking the active row clears the selection back to the full permanent Register (24); clicking
  `All purchase orders` restores it likewise.
- Active treatment, right-aligned counts, register table and narrow-width mechanics unchanged.

`docs/purchasing/MASTER.md` and `docs/COPY-STANDARD.md` already carry the governed law from
`63580f9f`; no further MASTER change is owed by this Card.
