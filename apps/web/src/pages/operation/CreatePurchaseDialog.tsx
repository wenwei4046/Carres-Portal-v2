import { useMemo, useState } from "react";
import { TO_ORDER_WORDS as W, railItemLabel } from "@carres/shared";
import Button from "@/components/kit/Button";
import DatePicker from "@/components/kit/DatePicker";
import Input from "@/components/kit/Input";
import Modal from "@/components/kit/Modal";
import SearchInput from "@/components/kit/SearchInput";
import Select from "@/components/kit/Select";
import Textarea from "@/components/kit/Textarea";
import { apiFetch } from "@/lib/api";
import { useCatalog } from "@/lib/queries";

export interface Destination {
  id: string;
  name: string;
  isDefault: boolean;
}

/**
 * `+ Create Purchase` — the manual entrance, and V1 buys READY STOCK only
 * (Jess, 2026-08-03).
 *
 * Five fields and nothing else: Item · Quantity · Deliver To · Required By ·
 * Remark. There is no Purpose picker, because there is one purpose; there is
 * no Supplier picker, because a product has one factory and the server derives
 * it from the SKU — asking a human to pick it is asking them to get it wrong,
 * and a demand pointed at the wrong factory becomes a purchase order pointed
 * at the wrong factory.
 *
 * NOTHING IS DISABLED AND NOTHING IS A PLACEHOLDER. Display begins at the
 * Dealer/Sales portal and Office at a future internal request workflow; both
 * will arrive through the same table, and neither is hinted at here.
 */
export default function CreatePurchaseDialog({
  open,
  onOpenChange,
  destinations,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  destinations: readonly Destination[];
  onCreated: () => void;
}) {
  const catalog = useCatalog({ enabled: open });
  const [needle, setNeedle] = useState("");
  const [sku, setSku] = useState<string | null>(null);
  const [qty, setQty] = useState("1");
  const [dest, setDest] = useState<string | undefined>(undefined);
  const [requiredBy, setRequiredBy] = useState("");
  const [remark, setRemark] = useState("");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const defaultDest = destinations.find((d) => d.isDefault) ?? destinations[0];
  const chosenDest = dest ?? defaultDest?.id;

  /** The catalog, as pickable items. A SKU with no factory is NOT offered —
   *  the server would refuse it, and offering it teaches the operator that the
   *  refusal is random rather than a configuration hole. */
  const items = useMemo(() => {
    const models = new Map(
      (catalog.data?.models ?? []).map((m) => [m.id, m.name as string]),
    );
    return (catalog.data?.skus ?? [])
      .filter((s) => s.supplierId != null)
      .map((s) => ({
        sku: s.sku,
        label: railItemLabel(
          models.get(s.modelId) ?? s.sku,
          s.variantKind === "size" ? s.variant : null,
        ),
      }));
  }, [catalog.data]);

  const shown = useMemo(() => {
    const n = needle.trim().toLowerCase();
    if (!n) return items.slice(0, 8);
    return items
      .filter((i) => i.label.toLowerCase().includes(n) || i.sku.toLowerCase().includes(n))
      .slice(0, 8);
  }, [items, needle]);

  const picked = items.find((i) => i.sku === sku) ?? null;
  const qtyN = Number(qty);
  const canSave =
    !saving && sku != null && Number.isInteger(qtyN) && qtyN >= 1 && chosenDest != null;

  function reset() {
    setNeedle("");
    setSku(null);
    setQty("1");
    setDest(undefined);
    setRequiredBy("");
    setRemark("");
    setFailed(null);
  }

  async function save() {
    if (!canSave || !sku || !chosenDest) return;
    setSaving(true);
    setFailed(null);
    try {
      await apiFetch("/api/operation/purchase/to-order/demand", {
        method: "POST",
        body: JSON.stringify({
          sku,
          qty: qtyN,
          destinationId: chosenDest,
          requiredBy: requiredBy || null,
          remark: remark.trim() || null,
        }),
      });
      reset();
      onOpenChange(false);
      onCreated();
    } catch (e) {
      // The failure STAYS in the dialog with the form intact: a demand that
      // did not save must not look like one that did.
      setFailed(e instanceof Error ? e.message : W.createFailed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
      title={W.createPurchase}
      footer={
        <span className="flex items-center gap-3 pt-1">
          {failed ? (
            <span className="text-meta text-kit-red-11" data-testid="to-order-create-failed">
              {failed}
            </span>
          ) : null}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {W.cancel}
          </Button>
          <Button
            variant="primary"
            disabled={!canSave}
            loading={saving}
            onClick={() => void save()}
            data-testid="to-order-create-submit"
          >
            {W.create}
          </Button>
        </span>
      }
    >
      <div className="flex flex-col gap-3" data-testid="to-order-create-dialog">
        <div>
          <label htmlFor="cp-item" className="text-meta text-kit-slate-11">
            {W.itemLabel}
          </label>
          <SearchInput
            id="cp-item"
            value={picked ? picked.label : needle}
            onChange={(e) => {
              setNeedle(e.target.value);
              setSku(null);
            }}
            placeholder={W.searchItem}
          />
          {sku == null ? (
            <div className="mt-1 flex flex-col rounded-control border border-kit-slate-5 bg-white">
              {shown.map((i) => (
                <button
                  key={i.sku}
                  type="button"
                  className="px-2 py-1.5 text-left text-body hover:bg-kit-slate-3"
                  data-testid={`cp-item-${i.sku}`}
                  onClick={() => {
                    setSku(i.sku);
                    setNeedle("");
                  }}
                >
                  {i.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <Input
          id="cp-qty"
          label={W.itemsColQty}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
        />
        <div>
          <label htmlFor="cp-dest" className="text-meta text-kit-slate-11">
            {W.destination}
          </label>
          <Select
            id="cp-dest"
            value={chosenDest}
            onValueChange={setDest}
            options={destinations.map((d) => ({ value: d.id, label: d.name }))}
          />
        </div>
        {/* The kit DATE field, not a text input with type="date" — one date
            spelling for the whole portal (02 · DatePicker). Empty is a real
            answer: buy it on the next run. */}
        <DatePicker
          id="cp-required"
          label={W.requiredBy}
          value={requiredBy || null}
          onChange={(v) => setRequiredBy(v ?? "")}
        />
        <Textarea
          id="cp-remark"
          label={W.remark}
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
        />
      </div>
    </Modal>
  );
}
