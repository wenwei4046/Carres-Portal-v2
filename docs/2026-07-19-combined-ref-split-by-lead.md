# Combined Ref → split by lead token (import order-identity fix)

**Status:** spec + dormant helper only. NOT wired into the live import. Needs wenwei coordination on the shared `/api/orders/import` door before flipping.
**Owner of the door:** wenwei. **Requested by:** Jess (COO), 2026-07-19.

---

## The rule (Jess's Ref law)

One customer can hold **several Ref numbers**. The prefix names the goods / PO:
`CR…` and `TCF…` are **different products**. So the **LEAD (first) token** of a
combined Ref names the order that row is about; trailing tokens are
"delivered-with" cross-refs, not part of the identity.

- `CR1127 + TCF0477` = the **CR1127** order (MS + BF, RM1923, Paid)
- `TCF0477 + CR1127` = the **TCF0477** order (sofa, RM1568, Paid)

These are **two orders**, not one. Different balance across ref spellings is
**correct data, not a conflict**.

## The current bug

`normalizeRefs()` (apps/api/src/routes/orders.ts) **sorts** the token set, so the
import groups by an order-insensitive key. Comment there literally assumes
"CR0925+TCF0394 and TCF0394 & CR0925 are the SAME order … one shared balance."
That **merges two genuinely different orders** into one.

**Proven on Master 18 Jul 26.xlsx** (116 orders / 306 lines):

| key model | groups | groups with conflicting balance |
|---|---|---|
| current (sorted set) | 113 | **2** — `CR0925\|TCF0394` (1748 vs 4193), `CR1127\|TCF0477` (1923 vs 1568) |
| lead token | 112 | 0 (the 2 "conflicts" dissolve — remaining diffs are RM1748=RM1748, 4193=4193 text-format only) |

Impact **today is cosmetic**: both merged pairs are fully Paid (owing 0), so the
owing total (29 / RM49,889) is unaffected — the portal just shows 1 merged order
where Jess wants 2.

## The dormant helper (already on `feat/orders-drawer`)

`apps/api/src/routes/orders.ts`:
- `importOrderKey(ref)` → lead token (the future grouping key)
- `importSourceRef(ref)` → lead-first, deduped, **NOT sorted** token list (the
  future `source_ref[]`)
- `normalizeRefs` is **unchanged** (still the search-alias / dedup key in use).

Tests: `orders.import-order-key.test.ts` (10) + `orders.normalize-refs.test.ts`
(5, unchanged) all green.

## What flipping the live key touches (the reason it's NOT done unilaterally)

1. **Import grouping** (orders.ts ~L1535): key on `importOrderKey`, store
   `importSourceRef` as `source_ref`.
2. **RPC dedup** (`import_autocount_orders`, 0143): matches existing by
   `source_ref = v_src_ref` — Postgres array-equality is **order-sensitive**, so
   lead-first-unsorted arrays make the two orders distinct **without a schema
   change**. ✅ good news.
3. 🔴 **The ~116 already-imported live orders** were stored with a **SORTED**
   `source_ref[]`. After the flip, a re-import sends a lead-first array that
   won't array-match the old sorted one → **it would CREATE a duplicate** instead
   of dedup-skipping. → needs a **one-off re-key migration** (rewrite existing
   `orders.source_ref` to lead-first for the combined-ref rows) applied together
   with the flip.
4. **`paid: parsePaid(first.balance)`** — after the split each lead-group's first
   row carries its own balance (more correct than the merge; verify in tests).
5. **`packages/shared/src/master-append.ts`** (0237 补-line door) mirrors
   `normalizeRefs` — must adopt the same lead-key or the two doors disagree.
6. **Search** (operation/orders.ts) — contains-match on `source_ref[]`; all
   tokens stay present, so search is unaffected.

## Residual risk to confirm with Jess / AutoCount

Lead-first dedup assumes AutoCount **always exports the same physical order with
the same lead ref**. Her data supports it (reordered spellings = genuinely
different orders). If AutoCount ever re-exports one order with a different lead,
we'd get a dup. Confirm lead-ref stability before the flip.

## Recommended rollout (coordinated)

1. Re-key migration for the 116 existing orders' `source_ref[]` (lead-first).
2. Flip grouping + `source_ref` to the lead helpers, in the SAME deploy.
3. Update `master-append.ts` to the lead key.
4. Add the `paid`-per-split + re-import-dedup integration tests.
5. Deploy web+api paired; verify the 2 known pairs split; verify no dup on
   re-import of the 116.

Urgency low (cosmetic today) — do it right, together, not fast.
