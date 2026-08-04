// design-standard: not-a-list-page — this file is a MODAL. Its table is a
// search-result picker inside ONE FIELD of that modal: no page, no URL, no
// header band, no filters, so `ListPageShell` would put a page shell inside a
// dialog. The table itself is the kit's `DataTable`, not a hand-rolled one —
// §0.1 is obeyed; only the page SHELL is inapplicable here.
import { useMemo, useState } from "react";
import {
  DEMAND_PURPOSES,
  DEMAND_PURPOSE_DEFAULT,
  TO_ORDER_WORDS as W,
  type DemandPickItem,
  type DemandPurpose,
} from "@carres/shared";
import Button from "@/components/kit/Button";
import DataTable, { type Column } from "@/components/kit/DataTable";
import DatePicker from "@/components/kit/DatePicker";
import Input from "@/components/kit/Input";
import Modal from "@/components/kit/Modal";
import SearchInput from "@/components/kit/SearchInput";
import Select from "@/components/kit/Select";
import Textarea from "@/components/kit/Textarea";
import { apiFetch } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

export interface Destination {
  id: string;
  name: string;
  isDefault: boolean;
}

/**
 * The picker's five columns — P15's own list, with ONE substitution stated
 * rather than slipped in.
 *
 * The card names them `SKU · Item · On Hand · Reserved · Free`. The second is
 * **`Model` here**, because the FIELD this picker belongs to is already
 * labelled `Item`: `Item` as a column header would put one word on two things
 * in one dialog, which is C6's own finding (two blocks both reading `Actions`)
 * in a smaller frame. `Model` is the word the GRID already uses for this exact
 * value — `railItemLabel`'s output — so the column is named more precisely and
 * nothing is invented.
 *
 * `SKU` LEADS, which is the whole of defect 1: `5539-L(RHF)`, `5539-2NA`,
 * `5539-CNR` and `5539-Console` all render `Booqit` in the Model column, and
 * the code is the only thing that tells them apart. It is given the widest
 * share because a truncated code is no better than no code.
 */
const PICK_COLUMNS: readonly Column<DemandPickItem>[] = [
  {
    key: "sku",
    label: W.pickerColSku,
    width: 30,
    // Mono, because a code is read character by character rather than as a word.
    cell: (i) => <span className="font-mono text-meta">{i.sku}</span>,
  },
  { key: "model", label: W.colModel, width: 30, cell: (i) => i.label },
  {
    key: "onHand",
    label: W.pickerColOnHand,
    width: 15,
    align: "right",
    numeric: true,
    cell: (i) => i.onHand,
  },
  {
    key: "reserved",
    label: W.pickerColReserved,
    width: 13,
    align: "right",
    numeric: true,
    cell: (i) => i.reserved,
  },
  {
    key: "free",
    label: W.pickerColFree,
    width: 12,
    align: "right",
    numeric: true,
    cell: (i) => i.free,
  },
];

/**
 * `+ Create Purchase` — the manual entrance into `purchase_demands`.
 *
 * ── WHAT P15 CHANGED, AND WHY EACH WAS A DEFECT RATHER THAN A WISH ──────────
 *
 * All four were measured in a real browser on live data, 2026-08-04.
 *
 * **1 · Four different SKUs rendered as one word.** The picker printed
 * `railItemLabel` alone — the model name plus a size letter — so `5539-L(RHF)`,
 * `5539-2NA`, `5539-CNR` and `5539-Console` all read `Booqit`, because a PART
 * variant has no size to distinguish it. An operator could not pick the right
 * one, and this outranks everything else on the card: not knowing the stock
 * buys too much, this buys the WRONG THING. The picker leads with the SKU now,
 * which is what AutoCount's own picker does and for the same reason.
 *
 * **2 · There was no Source.** Every typed demand was filed `ready_stock`, so
 * a Warranty replacement and a Display piece were indistinguishable in the one
 * table that exists to tell them apart. **The field was blocked by a rule, not
 * by missing code**: `purchasing_create_demand` refused every purpose but
 * `ready_stock` with a named error (Jess, 2026-08-03 — *"V1 buys READY STOCK
 * only"*), and 0319 wrote that refusal precisely so *"the day one is approved
 * this gate is the only thing that changes."* Loo approved the four on
 * 2026-08-04 and migration 0323 changed that one gate.
 *
 * **3 · No stock anywhere.** You could not see the warehouse already held
 * three of the thing you were about to buy. The numbers come from the server,
 * not from here, and `free` is P10's OWN rule called rather than copied — the
 * card's Must-NOT names it: *"let the picker compute stock its own way"*.
 *
 * **4 · No supplier.** The engine groups purchase orders by supplier ×
 * category, so an operator who cannot see the supplier cannot predict which
 * purchase order their demand joins.
 *
 * ── WHAT DID NOT CHANGE, AND MUST NOT ───────────────────────────────────────
 *
 * `Required By` and `Destination` are exactly as they were — **Loo ruled both
 * correct** and the card forbids touching them.
 *
 * **THE SUPPLIER IS SHOWN, NEVER CHOSEN.** Jess's 2026-08-03 ruling stands
 * word for word: a product has one factory and the server derives it from the
 * SKU; asking a human to pick one is asking them to get it wrong. What is
 * rendered here is a FACT read back — there is no supplier control, the
 * payload carries no supplier key, and the RPC has no parameter to send one
 * to. The card says so too: *"not a chooser"*.
 *
 * **NOTHING IS DISABLED AND NOTHING IS A PLACEHOLDER.** `Spare Parts` and
 * `Other…` are ruled words with no database value, so they are absent rather
 * than greyed — a control that offers a word the server refuses by name is
 * the failure 0322 had to repair on the stock pool's reasons.
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
  /**
   * The picker's own read. It replaces the catalog bundle, which knew the
   * SKUs and nothing about the register — so the stock numbers could not have
   * come from it without inventing a second count.
   */
  const pick = useQuery({
    queryKey: ["to-order", "pick-items"],
    queryFn: () =>
      apiFetch<{ items: DemandPickItem[] }>(
        "/api/operation/purchase/to-order/demand/pick-items",
      ),
    enabled: open,
    staleTime: 60_000,
  });

  const [needle, setNeedle] = useState("");
  const [sku, setSku] = useState<string | null>(null);
  const [qty, setQty] = useState("1");
  const [purpose, setPurpose] = useState<DemandPurpose>(DEMAND_PURPOSE_DEFAULT);
  const [dest, setDest] = useState<string | undefined>(undefined);
  const [requiredBy, setRequiredBy] = useState("");
  const [remark, setRemark] = useState("");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const defaultDest = destinations.find((d) => d.isDefault) ?? destinations[0];
  const chosenDest = dest ?? defaultDest?.id;

  const items = pick.data?.items ?? [];

  /**
   * The search reads the SKU as well as the label, and it always did — what
   * changed is that the RESULT now shows the SKU, so a match on a code the
   * operator typed is visible in the row it matched.
   */
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
    setPurpose(DEMAND_PURPOSE_DEFAULT);
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
          purpose,
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
            /* THE PICKER IS A TABLE, and the SKU is the first column — P15's
               defect 1. Every row is still one button, so the click target and
               the keyboard order are exactly what they were. */
            <div className="mt-1">
              <DataTable<DemandPickItem>
                rows={shown}
                columns={PICK_COLUMNS}
                rowId={(i) => i.sku}
                onRowOpen={(i) => {
                  setSku(i.sku);
                  setNeedle("");
                }}
                label={W.pickerTableLabel}
                loading={pick.isLoading}
                /* No empty state: the picker showed an empty box before P15 and
                   shows one now. P15 does not list that as a defect, and a
                   sentence nobody has ruled may not appear on a screen. */
                empty={null}
              />
            </div>
          ) : null}
          {/* The supplier, the moment an item is picked. A FACT, read back from
              the server's own derivation — never a control. */}
          {picked?.supplier ? (
            <p className="mt-1 text-meta text-kit-slate-11" data-testid="cp-supplier">
              {W.supplierLabel}: {picked.supplier}
            </p>
          ) : null}
        </div>
        <Input
          id="cp-qty"
          label={W.itemsColQty}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
        />
        {/* Source. The label is `Reason` because that is the word this mirror
            has always held and the six option words are named after it; the
            frozen field list calls the CONCEPT `Source`, and that the two
            disagree is reported by P15 rather than settled by inventing a
            third spelling. Four options, because four is what the store can
            record. */}
        <div>
          <label htmlFor="cp-purpose" className="text-meta text-kit-slate-11">
            {W.reason}
          </label>
          <Select
            id="cp-purpose"
            value={purpose}
            onValueChange={(v) => setPurpose(v as DemandPurpose)}
            options={DEMAND_PURPOSES.map((p) => ({ value: p.value, label: p.label }))}
          />
        </div>
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
