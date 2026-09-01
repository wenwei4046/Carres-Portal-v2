import { useState } from "react";
import { toast } from "sonner";
import type { ProductSkuDto } from "@carres/shared";

import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  useDeleteSkuSupplierOffer,
  useSkuSupplierOffers,
  useUpsertSkuSupplierOffer,
} from "@/lib/queries";
import { INPUT_CLS, Modal, SectionHead } from "@/pages/operation/components/Modal";
import { usePatchCatalogSku } from "@/lib/queries";

/**
 * WHO SUPPLIES THIS SKU - the offers half, lifted out of the Operation cost
 * tab so BOTH catalog doors can show it (2026-09-01).
 *
 * It was born inline in `OperationSkuCostTab.tsx` because only that tab had it.
 * The admin catalog carried a single `Supplier` COLUMN instead, and a column
 * can only ever show ONE supplier - the slot. Migration 0388 made a SKU able to
 * remember every supplier that quoted it, so the column under-reports by
 * construction: it is not in the wrong place, it is too small.
 *
 * Moved here UNCHANGED first, so the move is provable on its own before the
 * behaviour changes.
 */

export function SupplierOffersStrip({
  sku,
  suppliers,
  category,
  heights,
}: {
  sku: ProductSkuDto;
  suppliers: Array<{ id: string; name: string }>;
  /** The MODEL's category — a sofa offer is priced per seat height (0389),
   *  everything else keeps the flat price box. */
  category: string | null;
  /** The active sofa seat heights, pool-ordered — one box per height. */
  heights: string[];
}) {
  const isPrincipal = useAuth((s) => s.role) === "principal";
  const offersQ = useSkuSupplierOffers(sku.id, true);
  const upsert = useUpsertSkuSupplierOffer();
  const remove = useDeleteSkuSupplierOffer();
  const [supplierId, setSupplierId] = useState("");
  const [code, setCode] = useState("");
  const [price, setPrice] = useState("");
  const [pwp, setPwp] = useState("");
  /* 0389 — a sofa module is priced per seat height (Xammar: 24"/28"/30", from
     BOTH Hookkas). One box per active height; blanks are simply not quoted. */
  const [heightPrices, setHeightPrices] = useState<Record<string, string>>({});
  const sofa = category === "sofa";
  const offers = offersQ.data?.offers ?? [];

  function save() {
    if (!supplierId) return;
    const p = price.trim() === "" ? null : Number(price);
    const w = pwp.trim() === "" ? null : Number(pwp);
    if (
      (p !== null && (!Number.isFinite(p) || p < 0)) ||
      (w !== null && (!Number.isFinite(w) || w < 0))
    ) {
      toast.error("Enter non-negative numbers (blank = not quoted)");
      return;
    }
    const heightMap: Record<string, number> = {};
    for (const h of heights) {
      const t = (heightPrices[h] ?? "").trim();
      if (t === "") continue;
      const n = Number(t);
      if (!Number.isFinite(n) || n < 0) {
        toast.error("Enter non-negative numbers (blank = not quoted)");
        return;
      }
      heightMap[h] = n;
    }
    upsert.mutate(
      {
        skuId: sku.id,
        supplierId,
        supplierCode: code.trim() || null,
        price: p,
        pwpPrice: w,
        /* Sent only from the sofa lane, and null when every box is blank — an
           explicit clear, matching what the boxes show. Non-sofa saves omit
           the key entirely: leave the stored map alone, and keep the payload
           free of a column an older Worker's schema would refuse. */
        ...(sofa
          ? { pricesBySize: Object.keys(heightMap).length > 0 ? heightMap : null }
          : {}),
      },
      {
        onSuccess: () => {
          toast.success(`${sku.sku} · offer saved`);
          setSupplierId("");
          setCode("");
          setPrice("");
          setPwp("");
        },
        onError: (e: unknown) =>
          toast.error(e instanceof ApiError ? e.message : "Save failed"),
      },
    );
  }

  return (
    <div
      className="border-b border-base-100 bg-base-50 px-3 py-2"
      data-testid={`opcost-offers-${sku.sku}`}
    >
      {offersQ.isLoading ? (
        <span className="text-meta text-base-500">Loading…</span>
      ) : offers.length === 0 ? (
        <span className="text-meta text-base-500">No offers recorded</span>
      ) : (
        <ul className="flex flex-col gap-1">
          {offers.map((o) => (
            <li
              key={o.supplierId}
              className="flex flex-wrap items-center gap-2 text-meta text-base-700"
            >
              <span className="font-medium">{o.supplierName ?? "—"}</span>
              <span className="font-mono text-base-500">{o.supplierCode ?? "—"}</span>
              <span>
                {o.pricesBySize && Object.keys(o.pricesBySize).length > 0
                  ? heights
                      .filter((h) => typeof o.pricesBySize?.[h] === "number")
                      .map((h) => `${h}″ RM ${(o.pricesBySize as Record<string, number>)[h].toFixed(2)}`)
                      .join(" · ")
                  : o.price == null
                    ? "—"
                    : `RM ${o.price.toFixed(2)}`}
              </span>
              <span className="text-base-500">
                {o.pwpPrice == null ? "PWP —" : `PWP RM ${o.pwpPrice.toFixed(2)}`}
              </span>
              {isPrincipal && (
                <button
                  type="button"
                  onClick={() =>
                    remove.mutate(
                      { skuId: sku.id, supplierId: o.supplierId },
                      {
                        onError: (e: unknown) =>
                          toast.error(e instanceof ApiError ? e.message : "Remove failed"),
                      },
                    )
                  }
                  aria-label={`Remove ${o.supplierName ?? "offer"}`}
                  data-testid={`opcost-offer-remove-${sku.sku}-${o.supplierId}`}
                  className="text-base-400 hover:text-kit-red-11"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {isPrincipal && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <select
            value={supplierId}
            onChange={(e) => {
              const next = e.target.value;
              setSupplierId(next);
              /* ⭐ PICKING A SUPPLIER WITH AN OFFER LOADS THAT OFFER
                 (2026-08-26). A re-save writes the WHOLE offer, so fixing a
                 code typo with blank price boxes silently wiped the recorded
                 price — the keyer had no way to know the blank meant "erase",
                 not "keep". The boxes now start from what is on file, and the
                 save writes back exactly what is shown. */
              const existing = offers.find((o) => o.supplierId === next);
              setCode(existing?.supplierCode ?? "");
              setPrice(existing?.price == null ? "" : String(existing.price));
              setPwp(existing?.pwpPrice == null ? "" : String(existing.pwpPrice));
              const map: Record<string, string> = {};
              for (const [k, v] of Object.entries(existing?.pricesBySize ?? {})) {
                if (typeof v === "number") map[k] = String(v);
              }
              setHeightPrices(map);
            }}
            aria-label={`${sku.sku} offer supplier`}
            data-testid={`opcost-offer-supplier-${sku.sku}`}
            className={`${INPUT_CLS} w-44 text-meta`}
          >
            <option value="">Supplier…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Their code"
            data-testid={`opcost-offer-code-${sku.sku}`}
            className={`${INPUT_CLS} w-36 text-meta font-mono`}
          />
          {sofa ? (
            heights.map((h) => (
              <input
                key={h}
                value={heightPrices[h] ?? ""}
                onChange={(e) =>
                  setHeightPrices((prev) => ({ ...prev, [h]: e.target.value }))
                }
                placeholder={`${h}″`}
                title={`Price at ${h}″`}
                data-testid={`opcost-offer-height-${sku.sku}-${h}`}
                className={`${INPUT_CLS} w-20 text-meta`}
              />
            ))
          ) : (
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="Price"
              data-testid={`opcost-offer-price-${sku.sku}`}
              className={`${INPUT_CLS} w-24 text-meta`}
            />
          )}
          <input
            value={pwp}
            onChange={(e) => setPwp(e.target.value)}
            placeholder="PWP"
            data-testid={`opcost-offer-pwp-${sku.sku}`}
            className={`${INPUT_CLS} w-24 text-meta`}
          />
          <button
            type="button"
            onClick={save}
            disabled={!supplierId || upsert.isPending}
            data-testid={`opcost-offer-save-${sku.sku}`}
            className="btn-primary text-meta"
          >
            Save offer
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * WHO SUPPLIES THIS SKU - one door, two facts, and they are NOT the same fact.
 *
 *   MAIN SUPPLIER   `product_skus.supplier_id` - the SLOT. Who the next
 *                   Purchase Order is addressed to. Exactly one.
 *   OFFERS          `sku_supplier_offers` (0388) - who has QUOTED this item,
 *                   with their own code and prices. Any number.
 *
 * Migration 0388 states the distinction and the reason: "the slot and the offer
 * list are DIFFERENT facts - who the next PO goes to versus who has quoted this
 * item, at what terms - so this is not a second copy of one fact (Law D); it is
 * the first home of a fact that had none."
 *
 * THIS REPLACES THE ADMIN CATALOG'S `Supplier` COLUMN, and the reason is size,
 * not placement. That column sat on the SKU row, which is correct - HOUZS ERP
 * records the same rule the hard way in `docs/modules/mrp.md`: "a Model or a
 * Sales Order does not have suppliers, each VARIANT does." What a column cannot
 * do is show a LIST. It could only ever print the slot, so from the day 0388
 * shipped it under-reported every dual-sourced SKU by construction.
 */
export function SupplierOffersModal({
  sku,
  suppliers,
  category,
  heights,
  onClose,
}: {
  sku: ProductSkuDto;
  suppliers: Array<{ id: string; name: string }>;
  category: string | null;
  heights: string[];
  onClose: () => void;
}) {
  const patch = usePatchCatalogSku();
  const [slotId, setSlotId] = useState(sku.supplierId ?? "");
  const [slotCode, setSlotCode] = useState(sku.supplierCode ?? "");

  /* The slot writes are the admin catalog's old inline cell, moved whole. Same
     one-field PATCH, same toast, same no-op guard - a re-save that changes
     nothing must not write, because `updated_at` is read as "somebody touched
     this". */
  function commitSlot(nextId: string) {
    const val = nextId || null;
    if (val === (sku.supplierId ?? null)) return;
    patch.mutate(
      { id: sku.id, patch: { supplierId: val } },
      {
        onSuccess: () => toast.success(`${sku.sku} · main supplier updated`),
        onError: (e: unknown) =>
          toast.error(e instanceof ApiError ? e.message : "Update failed"),
      },
    );
  }
  function commitSlotCode(raw: string) {
    const val = raw.trim() || null;
    if (val === (sku.supplierCode ?? null)) return;
    patch.mutate(
      { id: sku.id, patch: { supplierCode: val } },
      {
        onSuccess: () => toast.success(`${sku.sku} · supplier code updated`),
        onError: (e: unknown) =>
          toast.error(e instanceof ApiError ? e.message : "Update failed"),
      },
    );
  }

  return (
    <Modal title={`Who supplies ${sku.sku}`} onClose={onClose} size="lg">
      <div className="flex flex-col gap-4" data-testid={`supplier-offers-modal-${sku.sku}`}>
        <div>
          <SectionHead>Main supplier</SectionHead>
          {/* The one the next Purchase Order is addressed to. Said in words,
              because "main" alone does not tell a new operator what it DOES. */}
          <p className="text-meta text-base-500 mb-2">
            The next Purchase Order for this item goes here.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={slotId}
              onChange={(e) => {
                setSlotId(e.target.value);
                commitSlot(e.target.value);
              }}
              aria-label={`${sku.sku} main supplier`}
              data-testid={`supplier-slot-${sku.sku}`}
              className={`${INPUT_CLS} w-56 text-meta`}
            >
              <option value="">No supplier</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <input
              value={slotCode}
              onChange={(e) => setSlotCode(e.target.value)}
              onBlur={(e) => commitSlotCode(e.target.value)}
              placeholder="Their code for it"
              aria-label={`${sku.sku} main supplier code`}
              data-testid={`supplier-slot-code-${sku.sku}`}
              className={`${INPUT_CLS} w-44 text-meta font-mono`}
            />
          </div>
        </div>

        <div>
          <SectionHead>Everyone who has quoted it</SectionHead>
          <p className="text-meta text-base-500 mb-2">
            A record of what each supplier charges. Changing it does not move the
            Purchase Order - that is the main supplier above.
          </p>
          <SupplierOffersStrip
            sku={sku}
            suppliers={suppliers}
            category={category}
            heights={heights}
          />
        </div>
      </div>
    </Modal>
  );
}
