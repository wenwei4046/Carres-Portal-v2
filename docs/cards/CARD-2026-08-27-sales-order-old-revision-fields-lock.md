# SALES ORDERS — CARD · AN OLD REVISION IS A PHOTOGRAPH, AND A PHOTOGRAPH CANNOT BE TYPED INTO

**Module:** Sales Orders · **Surface:** Sales Order Workspace, `oldrev` mode
**Status:** QUEUED — recorded 2026-08-27; **owner review required before build. NOT LAW.**
**Lane:** BUILD / DELIVERY (after owner approval)
**Found by:** production acceptance of
`CARD-2026-08-27-sales-order-revisions-history-readable-records.md` (§11.4), which was forbidden
by its own §10 boundary from touching Order page editing law — so the finding is recorded here
instead of fixed there.

---

## 1 · The defect, measured on production

Opening an old Sales Order revision (Revisions → any non-current record, e.g. SO-1319 Rev 3)
shows the banner `Viewing Rev 3 · read-only` and renders the form filled from that snapshot. The
intent is stated in `apps/web/src/pages/operation/SalesOrderWorkspace.tsx` (~line 1130): *"the
same fields render, filled from THAT snapshot and locked."* But on production the ten
customer/address/floor inputs report `readOnly = false` and `disabled = false`.

- **No data is at risk.** The `oldrev` view has no writer — no Save bar (`changedFields` returns
  `[]` by construction), no Edit, no Amend control — so nothing typed can be persisted.
- **The hazard is trust.** An operator can type into a historical photograph and believe they
  changed it. A read-only banner over typable fields teaches staff that banners lie.

## 2 · Why the existing test did not catch it

`SalesOrderWorkspace.ui-contract.test.ts` asserts the SOURCE contains
`disabled={mode === "oldrev"}` on a `<fieldset>` — a source-string assertion. The rendered DOM
proves the `disabled` state is not reaching the individual inputs (likely because the controls
are not descendants of that fieldset, or a component swallows the fieldset's disabling). The fix
must carry a rendered-DOM test, not another source grep.

## 3 · Scope when approved

- Make every input, select, date picker and checkbox in `oldrev` mode actually inert, and assert
  it from the rendered DOM.
- Change nothing about the `object`/`create` modes, the amendment lane, Print, or the Revisions/
  History views (`SalesOrderLedger.tsx` is out of scope — it shipped verified).
- No migration, no API change expected.

## 4 · Boundaries

Do not reopen the readable-records Card, the merged Order-tab composition, or the one-page
object-state ruling. This card locks a photograph; it does not redesign the room it hangs in.
