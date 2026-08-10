# STAGE 3 — BUSINESS GATES · v2, OWNER-CORRECTED

> # 🔒 FROZEN — OWNER: 我同意, 2026-08-09
> **This is the Stage 3 SPEC. The build chat READS it and may not decide anything
> here differently.** It is still not a card — the cards are in `BUILD-QUEUE.md`
> (3.0 … 3.8). No reopening Stage 1 / Stage 2.
>
> ```
> GATE 1  CLASSIFICATION        🔒   GATE 5  DOWNSTREAM OWNERSHIP  🔒
> GATE 2  ACCEPT / APPROVAL     🔒   GATE 6  CONSEQUENCE FLOORS    🔒
> GATE 3  APPROVER              🔒   GATE 7  FINALITY              🔒
> GATE 4  ISSUE/ACCEPT/APPLY    🔒
> ```
> Two things remain deliberately UNDECIDED and may not be invented: the ACCEPT
> signing mechanism, and the amendment document's visual form. See §STILL NOT
> DECIDED.

---

## THE SEVEN VERBS

`order_change_requests` (0231:44) already carries **`applied_at` — "Stamped when
the approved payload was applied (idempotency guard)."** P1 separated APPROVE from
APPLY at the schema level. Stage 3 obeys that separation; it does not reinvent it.

The owner's correction adds the verb that schema could not have known about,
because it is not an internal event at all:

```
SAVE        Direct correction  → write order + mint Revision      (Stage 2, DONE)
SUBMIT      Create a contractual amendment request
APPROVE     Internal approval only, WHEN REQUIRED
ISSUE       Freeze the proposed amendment document
ACCEPT      The customer accepts THAT EXACT amendment document
APPLY       Make the accepted amendment the current SO revision
DOWNSTREAM  Raise durable correction work; never rewrite a downstream fact
```

**THE LAW THIS ADDS:**

```
Internal approval required?   ≠   Customer acceptance required?

Class A:  Customer acceptance = ALWAYS YES     Internal approval = SOMETIMES
Class B:  Customer acceptance = NO             Internal approval = SOMETIMES (Test 3)
```

v1 was wrong. It wrote that a price increase is "approved by nobody" — true of
internal approval, and it silently let that stand in for the customer. RM 2,499 →
RM 2,999 needs no manager. It absolutely needs the customer. Those are two
different questions and v1 collapsed them into one sentence.

Owner ruling on acceptance, recorded: Class A acceptance must be **bound to the
exact amendment document**, not re-collected as a fresh signature drawing each
time. Direction reasoned from Malaysia's Electronic Commerce Act 2006 — electronic
形成合约 is recognised, the signature must identify the signer and indicate their
approval of *that* information, and later alteration must be detectable. **The
signing FORM (drawn signature · OTP · e-sign vendor · countersigned PDF) is
deferred to legal counsel and is not decided here.** I am not a lawyer; this
records the owner's reasoning and the product shape it implies, not legal advice.

`LINEAGE IS NOT PERMISSION.` APPROVE does not touch the order. ACCEPT does not
touch the order. APPLY does not touch Purchasing. ISSUE does not touch money.

---

## GATE 1 — CLASSIFICATION · TWO ALLOWLISTS, NO RESIDUE

**CORRECTED.** v1 said "A is enumerated, B is everything left over." That is a
time bomb: the day someone adds `warranty_term` or `financing_term` and forgets
the A-list, a contractual field becomes silently direct-editable.

```
A        = explicit allowlist
B        = explicit allowlist
UNKNOWN  = BLOCK. Classify before it ships.
```

**How UNKNOWN blocks without slowing anyone down:** the guard is at BUILD time,
not at operator time. A test enumerates every writable column of `orders` ·
`order_lines` · `order_addons` from `information_schema` and fails the build if any
column appears in neither list. Operators never meet this. Only the engineer who
added an unclassified column does, and they meet it before merge.

**CLASS A — CONTRACTUAL (amendment · always customer-accepted)**
```
order_lines      add · remove · sku · qty · unit_price · attrs
order_addons     add · remove · price
money            discount · total · any term the customer signed
delivery_date · delivery_date_tbd          ← "what was promised to me"
```

**CLASS B — CORRECTION (direct edit + revision · never customer-accepted)**
```
customer_name · customer_phone · customer_email · customer_emergency
customer_address · customer_billing · structured address (0230:31-35)
customer_address_unknown · customer_billing_same
delivery_floor · delivery_has_lift
proceed_date      (0165:19 planned production start — BUILD-QUEUE ruling:
                   direct-edit boundary only, never an amendment trigger)
notes
```

**CLASS B + TEST 3 INTERNAL APPROVAL (stays B — never promoted to A)**
```
salesperson_id · dealer_id · outlet_id · channel
```
The customer's agreement is unchanged; only who gets paid changes.
`LOCK THE CONSEQUENCE, NOT THE WHOLE DOCUMENT.`

---

## GATE 2 — TWO INDEPENDENT QUESTIONS

**CUSTOMER ACCEPTANCE** — mechanical, no judgement:
```
Class A  → ALWAYS. No exception, no direction test. Price up still needs ACCEPT.
Class B  → NEVER.
```

**INTERNAL APPROVAL** — two triggers, each independent of the other and of ACCEPT:
```
(a) MONEY DIRECTION — an A change that reduces what Carres is owed.
    Reuse existing precedent, do not invent: approval_kind (0001:41-43) already
    carries 'discount' · 'price_change' · 'refund'; approvals (0001:369-385)
    already carries status / decided_by / decided_at / decision_note.

(b) TEST 3 — the value moves money · commission · entitlement · ownership ·
    visibility between parties. Fires on attribution changes, any class.
```

A price increase: internal approval NO · customer acceptance YES.
A salesperson swap: internal approval YES · customer acceptance NO.
Neither implies the other. That is the whole point of the correction.

---

## GATE 3 — WHO APPROVES  ✅ unchanged

CLOSED BY STANDING RULING (BUILD-QUEUE), basis 0245:78-81:
```
Salesperson / Showroom attribution      →  hr OR principal
Dealer attribution                      →  principal ONLY
Money-direction (discount/price/refund) →  the existing approvals lane
```
**The gate is a server-side RPC, not UI.** Verified reason: internal roles
(`operation · finance · bd · principal`) have no dealer_id write floor —
`orders_dealer_update` (0002_rls.sql:195-200) constrains dealers only. A UI-only
approval is not a control for the exact roles that can bypass it.

---

## GATE 4 — WHAT BECOMES EFFECTIVE, AND WHEN

**APPROVE changes exactly one thing:** `order_change_requests.status → 'approved'`.
No order field moves. No document is issued. No downstream is touched.

**ISSUE** freezes the proposed amendment document and records its identity:
```
amendment
  base_revision            the SO revision this document was computed FROM
  base_contractual_hash    ⚠ NEW — see APPLY FLOOR
  proposed_snapshot        what the SO becomes if accepted
  document_url + document_hash    immutable document identity
```

**ACCEPT** records, against that one document and no other:
```
  accepted_at · accepted_by · acceptance_evidence · accepted_document_hash
```

**APPLY** — the only verb that moves the order:
1. re-read the order `for update` (0222:214 precedent — hold the row),
2. **CLASS-A ACCEPT FLOOR** — refuse unless `accepted_at is not null` **and**
   `accepted_document_hash = document_hash`. A Class-A amendment that reaches
   APPLY unaccepted is a bug, not a shortcut.
3. re-run every downstream floor (GATE 6) — a floor may have been crossed since
   SUBMIT, APPROVE or ACCEPT,
4. write the order through an **explicit column allowlist** (never `update orders
   set …` from a payload — see the GATE 5 trap),
5. mint the revision via the Stage 2 engine,
6. stamp `applied_at`. A second call is a no-op.

If any floor fails, APPLY **fails whole**. It never partially applies.
Approval is permission to try. Acceptance is the customer's agreement to a
specific document. Neither is a completed fact.

### ⚠ NEW — THE APPLY FLOOR THAT ACCEPT FORCED

Adding ACCEPT opens a window that did not exist in v1: **time passes between ISSUE
and ACCEPT, and the order can move inside it.**

If a Class B correction lands while the customer is still holding the document,
the SO's current revision advances. Blocking B during that window is wrong —
`LOCK THE CONSEQUENCE`: a phone-number fix must not be held hostage to a customer
who has not replied.

**Resolution, and it falls straight out of GATE 1 being two explicit allowlists:**
the amendment binds a **`base_contractual_hash` computed over the CLASS A FIELDS
ONLY.** A Class B correction cannot change it, by definition of the allowlist. So:

```
Class B lands during the window     → hash unchanged → APPLY proceeds. Correct.
Another Class A change lands first  → hash changed   → APPLY REFUSES.
                                      Re-ISSUE, re-ACCEPT. The customer accepted
                                      a document that is no longer true.
```

Without this the system would let a customer's acceptance of an old document
apply on top of a newer contract. That is exactly the failure ACCEPT exists to
prevent, so the floor ships with the verb, not after it.

---

## GATE 5 — DOWNSTREAM · DURABLE WORK, NOT A NOTIFICATION

**CORRECTED.** v1 said "a NOTICE, never a write." The second half stands. The
first half was too weak.

```
DOWNSTREAM = PERSISTED correction work, owned by the receiving module,
             with a state and an owner, that survives until someone closes it.

NOT a toast.  NOT an email.  NOT a fire-and-forget event.
NOT an automatic rewrite of the other module's fact.
```

Otherwise an amendment applies cleanly, the purchasing person never touches the
PO, and the consequence disappears permanently with the browser tab.

Verified downstream consumers of an order in this repo:
```
purchase_orders     via dl_refs (0017) — MANY-TO-MANY, one PO serves many orders
po_receipts         received_qty (0001:355-363)
order_payments (0193) · payments · invoices (0001:412) · refunds (0001:424)
commission          live for an OPEN month; FROZEN at approved (0272)
logistics           ON THE ORDER ROW ITSELF — logistics_stage · do_number ·
                    partner_stage · invoice_no. There is no delivery_orders table.
service_cases (0210) · guarantee_entitlements (0262)    snapshot precedent
ops_order_control (0159) · order_supplier_threads (0033)
```

**THE TRAP:** because logistics and invoicing live **on the orders row**, "write the
order" and "write downstream" are physically the same table. This is why GATE 4
step 4 is an explicit column allowlist and not a payload spread.

---

## GATE 6 — FLOORS ARE PER-CONSEQUENCE, NOT PER-ORDER

**CORRECTED.** v1 reused 0222's `operation_stage <> 'confirmed'` refusal as a
global amendment blocker. That violates `LOCK THE CONSEQUENCE, NOT THE WHOLE
DOCUMENT`. 0222 is evidence that the stage is a real boundary for *unproceed*; it
is not evidence that every field freezes when HQ starts.

**Evaluate changed field → affected downstream state. Nothing else blocks.**

```
CHANGED FIELD          CONSEQUENCE CHECKED              FLOOR
─────────────────────────────────────────────────────────────────────────────
phone · email ·        none                              none. Never blocked by
emergency · notes                                        operation_stage.

address · floor · lift  an already-ISSUED DO would now   blocked ONLY if a DO was
                        misstate where goods go          issued and its bytes are
                                                         not reproducible (GAP ②)

order_lines qty/sku ·   purchase_orders on this DL       flag POTENTIALLY AFFECTED
addons                                                   (+ SHARED when dl_refs
                                                         holds >1 order). NEVER
                                                         auto-revise. BUILD-QUEUE
                                                         PO LINEAGE, locked.

order_lines qty down    po_receipts.received_qty          qty may not fall below
                                                         received. 2990's
                                                         ReceivedFloorError shape
                                                         (so-revision.ts:445),
                                                         thrown PRE-mutation (:552).

order_lines · addons ·  operation_stage in ('in_production',…)  production has
delivery_date                                            started on THIS item →
                                                         operation gate, per field.
                                                         Not a whole-SO refusal.

delivery_date           logistics_stage / partner_stage   dispatched or later →
                                                         delivery correction work.

money · discount ·      invoices row with voided_at null  amount is issued. The
unit_price · total                                       amendment may NOT change
                                                         it. Route: credit note /
                                                         refunds (0001:424, which
                                                         already carries approval_id).

salesperson · dealer ·  commission month lock             0272
outlet · channel                                          `_commission_assert_order_
                                                          month_open()` ALREADY
                                                          blocks this, with its own
                                                          message: "reopen the run
                                                          before changing who gets
                                                          credit for it." Call it.
                                                          Do not write a second one.
```

Every floor above is real code or a real column today. Reuse; do not build a
second engine.

---

## GATE 7 — AFTER DELIVERY / CANCELLED  ✅ unchanged, owner keeps v1 verbatim

Today's floor already exists: 0222:79-81 — `status` in (`delivered`,`cancelled`)
raises *"Order is no longer editable."* Stage 3 does not loosen it.

```
ALLOWED    customer contact corrections (Class B, no downstream consequence)
ALLOWED    money settlement via order_payments / refunds / credit note
ALLOWED    appending a revision — ALWAYS
FORBIDDEN  editing order_lines · prices · delivery_date · attribution
```

**Revisions stay append-only even on a frozen order (0327).** If history froze with
the order you could never record *why* it froze. The document locks; the ledger
never does.

---

## THE GAPS — RE-RANKED BY THE OWNER

```
BLOCKERS — close before the gate they block is built
───────────────────────────────────────────────────────────────────────────
① column-level GRANTs never inspected     BLOCKS GATE 4. If a role can UPDATE
                                          orders directly through PostgREST, the
                                          APPLY-only RPC is theatre. One
                                          inspection query settles it.

② 0326 / 0327 unmerged                    BLOCKS MECHANICALLY. Merge first.

③ Items fill rate UNKNOWN                 BLOCKS GATE 1. Line-level classification
                                          is undefined on orders with no lines.
                                          One count query.

NARROWED
───────────────────────────────────────────────────────────────────────────
④ paper-DO not reproducible               Real gap, but it blocks ONLY corrections
   (print-DO is a live read)               that would alter an ALREADY-ISSUED DO's
                                           content — i.e. the address/floor/lift row
                                           of GATE 6. It does not block Gate 6 as a
                                           whole and it does not block Gate 4.

DOWNGRADED — no longer a Gate 4 blocker
───────────────────────────────────────────────────────────────────────────
⑤ no issued_at on the sales order          v1 made this block Gate 4. ACCEPT
                                           replaces it. The question that matters is
                                           not "when was a PDF opened or posted" —
                                           it is **WHICH EXACT AMENDMENT DID THE
                                           CUSTOMER ACCEPT.** That is answered by
                                           document_hash + accepted_document_hash +
                                           accepted_at, which the amendment record
                                           carries by construction. A generic
                                           issued_at is a weaker answer to a
                                           question ACCEPT already answers better.

RECORD ONLY
───────────────────────────────────────────────────────────────────────────
⑥ commission is a live read                0272 freezes closed months and guards
                                           attribution. Residual exposure: the OPEN
                                           month only.

⑦ orders_dealer_update has no WITH CHECK   RESOLVED for dealers — USING doubles as
                                           WITH CHECK (PostgreSQL docs, verbatim).
                                           Internal-role exposure is handled by
                                           GATE 3's server-side RPC.
```

---

## STILL NOT DECIDED HERE — ON PURPOSE

- **The signing FORM for ACCEPT** — drawn signature · OTP · e-sign vendor ·
  countersigned PDF. Owner deferred to legal counsel. The product shape (bound to
  the exact document identity) is frozen; the mechanism is not.
- **The amendment document's layout.** Golden SO is the SO baseline; the
  amendment's own form is a separate design conversation.

Everything else in this file is FROZEN. Owner said 我同意 on 2026-08-09.
