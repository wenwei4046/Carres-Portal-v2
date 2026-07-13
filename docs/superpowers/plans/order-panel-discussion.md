# Carres — Order Detail Panel: design & logic (for discussion, before coding)

This is the plan for the operation **Order Detail panel** (the drawer that opens when you click an order). Every decision below is grounded in the **real production data** (168 orders / 427 order lines, checked 10–11 Jul 2026) and in Jess's 3 working files (Klg Warehouse, Carres_Master, AutoCount, all dated 10 Jul).

---

## 0. The one rule behind everything

> **Keep what a person can fill in or act on. Remove only read-only cells that are always empty AND not part of a workflow.**

A field that lets you *do* something (type a Stock ETA, arrange a transfer, receive stock) stays — it is the entry point that makes the data grow. A display-only cell that is always blank and has no purpose is clutter. We never draw a status twice, and we never show an empty box just to fill space.

---

## 1. Theme — align to the Orders listing, no more dark header

The **Orders listing page is the single style guideline.** The panel adopts its theme:
- Page background: warm greige `#ECE8E0`
- White cards, thin hairline borders `#DDD8CE` / `#E5E1D8`, soft shadow
- Title font `t-h1`, text ink `#221F20`

**Change: remove ALL dark headers.** The listing's dark table-header band, the drawer's dark table headers → all become **light** (pale band + hairline + small grey uppercase labels). Flame orange `#C44D2B` is used only on the logo and the selected filter chip. The purple "Proceed" pill is removed (purple is off-palette).

*(Status: the de-darkening is done in code and verified to compile — listing header, drawer "Items ordered" header, and "Warehouse stock" header are all light now.)*

---

## 2. Header — one clean row

`[status pill]  #1153  CR0902  ·········  [⋮] [✕]`

The header says **WHAT** only: the stage (e.g. `Ready`, `On hold delivery`), the order number `#1153`, and the old reference `CR0902`. Nothing else — no amount, no date, no duplicated customer info.

**Removed from the header:**
- The `STOCK / LOGISTIC / MONEY` status strip → it repeated status that now lives in its proper home (stock → the Items table; money → the Balance card; logistic → the action row).
- The customer deadline → the deadline is used to compute things, it does not sit in the header.
- The region/customer name → that lives in the Customer card.

**Why:** "on hold delivery" is enough in the header. WHY it's on hold (how much owed, when due) is summarised by the **Balance card** — header says the result, the card says the reason.

---

## 3. Left cards — only what has real data

- **Customer** — name / phone / address (100% filled on every order). Editable while the order is still "place".
- **Balance** — Outstanding amount (reads the imported `balance` figure — this already works and is correct; 10 orders currently owe money, e.g. one owes RM 5,794). This card carries the "why on hold" summary.
- **Storage** — shown **only when a storage fee applies** (hidden otherwise).
- **Delivery** — kept (delivery is part of moving the goods).

---

## 4. Items table — stock status lives here, each row expands

Header shows a stock summary: `Items · Stock   [Ready 2/3]`.

Collapsed row columns: **Status · Item · Qty · Stock ETA · PO · Receive-at**, and a `Receive` button appears on hover.

- **Item** — the full product text (AutoCount stores model+size+colour as one long string; 425 of 427 lines are like this). It shows on one line; if too long it truncates with the full name on hover. *(The old "name wraps to two lines" problem was a 45-character string in a narrow column, not the column being too narrow.)*
- **Stock ETA** — **auto-set** = customer delivery date − lead time (mattress/bedframe ~7 days, sofa ~5). It has a value from the start. If the supplier says it will be late, ops overrides that one line; an override later than the auto date turns the line red.
- **Receive-at** — **KEPT. This is the transfer destination** (see §5). Not a column to remove.
- Only genuinely-empty, non-workflow display cells are tidied (e.g. a never-used count cell), and only with sign-off.

---

## 5. Moving the goods to the delivery partner (the transfer logic) — the core

Today this lives as a **hand-typed note** in the Master sheet's "Carres Remark" (e.g. `AL pickup bedf at Hookka`, `TAKE READY STOCK @ PO/2604-042 RF2607`). The partner replies in "Logistic Remark" (`Completed`, `Pending`). We are turning that one note into something trackable — **but keeping it simple, one step at a time (not a pre-planned whole chain), because that is exactly how it's written today.**

**The default final destination = Carres Klang warehouse.** Once a delivery partner is assigned, the goal becomes "get each item to where the partner can take it." The system **suggests** a way to move it (you can change it):

| Item | Where it is now | Suggested move | Who does it |
|---|---|---|---|
| Accessory (pillow / MP) | Carres Klang | call **Lalamove** to the partner | Carres books it |
| Mattress | at Carres Klang | call **NETS** to the partner | NETS (runs this warehouse) |
| Mattress | still at Nice Future (not yet collected) | **HOUZS collects → HOUZS Balakong warehouse** → partner picks up there | ask HOUZS (partner has no warehouse of its own, so we borrow HOUZS's) |
| Bedframe / Sofa | still at supplier (Hookka / Ohana / Dorsettloft) | **partner picks up at the supplier** | ask the partner / supplier |

You see this per item on the "Receive-at" / the expanded row: current location → suggested move → who → mark done.

**Roles (for clarity):** AL = logistics only (no warehouse) · HOUZS = logistics + owns a warehouse (Balakong) · NETS = logistics + runs Carres Klang + collects from Nice Future · Nice Future / Ohana / Dorsettloft / Hookka = suppliers. The only two real warehouses are **Carres Klang** and **HOUZS Balakong**.

**What we need to add to support this (small — the bones already exist):**
- One warehouse row: **HOUZS Balakong** (the system currently only knows Carres Klang).
- One field for the **"how it moves" (carrier)** — Lalamove / NETS / HOUZS-pickup / supplier-direct — which is the only thing genuinely missing today.
- A small rules helper that suggests the move (you always override).
- *(The per-item supplier→warehouse→partner→delivered structure already exists in the system, just unused — we reuse it, not rebuild it.)*

---

## 6. "Take ready stock" — a big part of the daily work

Many orders are **not** waiting for a supplier — they are filled from **Carres Klang free stock**, matched by PO / RF reference (the remarks are full of `TAKE READY STOCK @ …`). Carres Klang currently holds **87 free pieces** (43 bedframes + 33 mattresses).

So the **Warehouse stock** section under the items:
- Its header shows **what it is matching** (e.g. `Matching: Haven FirmCare · King`) — so you know why these rows are shown.
- Below it lists the **matching free stock of that category**, ready to reserve to this order in one click.

This is mainline, not an edge case.

---

## 7. Future — let the logistics partner see/update their own jobs

Today ops fills in the logistics status on the partner's behalf (that's why the logistic ETA is filled on only 1 of 168 orders — the field isn't broken, there's just no one filling it yet). In future:
- (a) the partner logs into the portal and sees only their assigned orders (this matches the per-partner tabs in the Master sheet — NETS, AL, HOUZS…), and fills their own ETA / remark / delivery time; **or**
- (b) we share a **read-only link** (like a tracking link) so partners who don't want to log in can still see progress.

The portal already has a partner role and the per-order partner structure, so this is an extension, not new machinery. Not now — later.

---

## 8. What is deliberately NOT changing

- The order submit pipeline, the create-order path, and the existing customer/supplier flows — untouched.
- The Balance/Money card maths — checked, it is correct (it already falls back to the imported balance).
- The per-order Activity history (already live in the right rail) — kept, we just connect the "next step" to it.
- Lead times are hardcoded for now (mattress 7 / bedframe 7 / sofa 5) — noted; moved into a setting later if suppliers change.

---

## 9. Order of work

1. **Theme** — remove dark headers, align to the listing. *(done in code)*
2. **Header** — clean it to one row. *(status strip removed; row-1 slimming next)*
3. **Left cards + items table** — show only real data; Warehouse stock shows what it's matching.
4. **Transfer tracking** — add HOUZS Balakong warehouse + the "how it moves" field + the suggest-a-move helper + the per-item expand. *(this one needs a small database change — Jess decides, it's an operation change)*
5. **Take ready stock** matching, then the **partner share** — later.

Steps 1–3 need no database change and can ship first. Step 4 is the transfer feature. Steps are independent — none blocks building other pages.
