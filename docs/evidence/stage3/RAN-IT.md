# STAGE 3 · I RAN IT — the evidence the law demands
> Collected 2026-08-10 against a real running API (127.0.0.1:8891), real
> Supabase auth, and the real production database. Not a test. Not a mock.

## How the session was obtained, since it matters

The API accepts only ES256 tokens verified against Supabase's remote JWKS —
there is no local bypass. A session was minted for the **seeded test account**
`operation-test@x.com` (and `principal@carres.com`) with the service-role
admin API: `auth.admin.generateLink` issues a one-time token hash and
`verifyOtp` exchanges it for a session. **No password is typed anywhere and no
account was created.** The web app was driven with the same session written to
supabase-js's own localStorage key.

## THE ROUTES — 15 calls, status and body

```
GET  /orders/:id/attribution                     200  {"request":null}
POST /orders/:id/attribution                     201  {"id":"41de53ef…","fields":["salesperson_id"]}
POST /orders/:id/attribution   +Class B field    422  invalid_param · "Unrecognized key(s) in object: 'customer_phone'"
POST /orders/:id/attribution   second live one   422  pending_exists · "An attribution change is already waiting on this order"
GET  /orders/:id/attribution   now pending       200  {"request":{…,"salesperson":{"from":"ahsihas","to":"Alvin"},"approver":"hr_or_principal"}}
POST /attribution/:id/decide   as operation      403  "Salesperson/showroom attribution is approved by HR or the principal"
POST /attribution/:id/apply    before approval   422  not_approved · "Only an approved request can be applied"
POST /attribution/:id/decide   as principal      200  {"status":"approved"}
  → GET /orders/:id/revisions  after approve          revisions: 10 · last salesperson: ahsihas   (THE ORDER DID NOT MOVE)
POST /attribution/:id/apply                      200  {"revision":11,"changed":["salesperson_id"],"correction_work_raised":0}
POST /attribution/:id/apply    again             200  {"already_applied":true}

GET  /correction-work?module=purchasing&state=open   200  {"work":[]}
GET  /correction-work?…&state=closed                 200  3 rows
GET  /correction-work?module=warehouse               422  "Expected 'purchasing' | 'operation' | 'delivery' | 'finance'"
GET  /correction-work/order/:id                      200  3 rows
POST /orders/:id/save          +attribution field    422  "Unrecognized key(s) in object: 'salesperson_id'"
POST /orders/:id/save          items change          201  {"revision":5,"correction_work_raised":2}
POST /correction-work/:id/close  as the raiser       403  closed_by_raiser · "…closed by the module that receives it, not the one that raised it"
POST /correction-work/:id/close  as another          200  {"state":"closed"}
POST /correction-work/:id/close  again               200  {"already_closed":true}

GET  /orders/:id/amendment                       200  {"amendment":null}
POST /orders/:id/amendment     +Class B field    422  "Unrecognized key(s) in object: 'customer_phone'"
POST /orders/:id/amendment                       201  {"base_revision":11,"base_contractual_hash":"347fc81f…"}
  → a Class B save while it waits                     stale=false   (both hashes 347fc81f)
  → a Class A save while it waits                     stale=true    (base 347fc81f · now c15d566c)
POST /amendment/:id/apply                        422  accept_not_built · "Class A amendment cannot be applied - ACCEPT is not built yet"
POST /amendment/:id/issue                        404  the door does not exist
POST /amendment/:id/accept                       404  the door does not exist
```

## THE SCREENS — opened, clicked, console read

`http://localhost:5191/operation/orders/so/<SO-1308>` and
`http://localhost:5191/operation/procurement`, at **1440 and 1130**.

Clicked through, in the browser, on real data:
1. no request → the one way in, and the sentence that says why editing is not it
2. the form → "Keep Alvin" resolved by name · reason required · Send disabled
3. submitted → toast "Sent for approval"; card reads `WAITING FOR APPROVAL`,
   `Salesperson ~~Alvin~~ → ahsihas`, Approve + Reject, **no Apply**, and
   SOURCE still shows Alvin — the order had not moved
4. Approve as **operation** → red toast with the server's own GATE 3 sentence
5. Approve as **principal** → `APPROVED — NOT APPLIED YET`, Approve/Reject gone,
   only `Apply the change`
6. Apply → toast `Applied · Rev 15`, SOURCE flips to ahsihas, the PDF on the
   right re-renders with the new salesperson
7. Purchase Orders → the `SALES ORDER CHANGES TO CHECK` strip appears with two
   real SHARED rows naming PO-2036 / PO-2037 and every other SO they serve; the
   frozen register, its rail and its drawer are untouched
8. `Close this work` → inline "What did you find?" → toast `Closed`, the row
   leaves, the strip disappears when the last one goes

Console on a clean load: **zero errors**. Every API call on the Purchasing page
returned 200 (network panel read, not assumed). The one Radix `forwardRef`
warning that appears is the kit's own — `dialog-container.test.tsx` emits the
identical line.

## THE GUARDS — each made to fail

```
api-base       pointed .env.local at the production Worker → the app REFUSED to
               boot, #root empty, console `ApiBaseMisconfigured` naming the file.
               Restored → renders. Both directions, in a real browser.
column guard   put `order by created_at` back into 0335 → FAILED, naming
               `order_change_requests.created_at`. Restored → green.
hash drift     deleted one field from the SQL list → FAILED, naming
               `orders.installment_months`. Restored → green.
```

## WHAT RUNNING IT FOUND, AND FIXED IN THIS CARD

```
origin/main was RED on its own — delivery-order.test.ts asserted "1500.00"
while the gate builds its sentence with fmtMoney → "RM 1,500.00". Source and
test arrived in the SAME commit (53bf3b85), so it had never passed here; it can
only pass on a Node whose ICU data drops the separator. Now asserted THROUGH
fmtMoney, so it cannot drift from the money law or from the runtime's ICU.
```
