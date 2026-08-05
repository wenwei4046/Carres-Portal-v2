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
 *
 * **P19 DID NOT RETUNE THESE FIVE SHARES — it made the surface wide enough for
 * them to hold their worst string.** Measured on production 2026-08-05, the
 * SKU column was 142.8px and the longest SKU the picker can offer
 * (`SVC-DISPOSE-BEDFRAME`) is 144.0px of ink: P15's own column was clipping the
 * code its card exists to show. Sizing the column would have been the second
 * fix; 600px is the first, and it fixes it for all five.
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
 * ONE line of the purchase being typed.
 *
 * `sku` is the only field that decides whether the line is REAL: a row with no
 * item is not a line, it is the empty row at the bottom of every ERP grid.
 *
 * `createdAs` is the whole of P19's per-row result and it is deliberately not a
 * boolean pair. A line is untouched, or in flight, or CREATED (and can never be
 * posted again), or it FAILED and carries the server's own sentence. Two
 * booleans would allow "created and failed", which is a state no record can be
 * in.
 */
type LineState = "idle" | "pending" | "created" | "failed";

interface LineDraft {
  /** Local only — never sent. A line has no identity until the server gives it one. */
  id: string;
  sku: string | null;
  /** What is typed in the search box while no item is picked. */
  needle: string;
  qty: string;
  remark: string;
  state: LineState;
  /** The server's own message, on a `failed` line only. */
  error: string | null;
}

/**
 * `Item` takes what is left after the three fixed cells, and `Remark` takes the
 * same — measured on the live dialog at 600px: Item and Remark 207.5 each, Qty
 * 53, Remove 73.9. The worst item name (`Mattress Protector SS`, 174px with the
 * search icon's gutter) fits in 207.5 with room; at 512 it did not.
 */
const LINE_GRID = "minmax(0,1fr) 53px minmax(0,1fr) auto";

let seq = 0;
const blankLine = (): LineDraft => ({
  id: `l${++seq}`,
  sku: null,
  needle: "",
  qty: "1",
  remark: "",
  state: "idle",
  error: null,
});

/**
 * A line that carries nothing an operator typed. Only these may be ignored on
 * submit — see `canSave`.
 */
const isBlank = (l: LineDraft) => l.sku == null && l.qty === "1" && l.remark.trim() === "";

/**
 * `+ Create Purchase` — the manual entrance into `purchase_demands`.
 *
 * ── P19 · IT TAKES MANY LINES (Loo, 2026-08-05) ─────────────────────────────
 *
 * The comparison that decided it, all three read on screen: the Sales Portal's
 * New Sales Order takes many lines, AutoCount's Purchase Request takes many
 * lines, and ours made you re-open the dialog for the second thing you needed
 * to buy. Three documents for the same kind of act and ours was the odd one.
 *
 * **NOTHING IN THE SCHEMA CHANGED, AND THAT IS NOT LUCK — it is what the frozen
 * model already said.** `purchase_demands` is ONE ROW PER SKU (*"one row = one
 * issue"*), so N lines was always N rows; the dialog was the only thing
 * insisting on one. This card is the FORM, not the data — no migration, and the
 * api route is byte-untouched.
 *
 * **WHERE EACH FIELD BELONGS.** Buying three things for the showroom is one
 * Source, one Destination, one date, three items:
 *
 *     HEADER (once)   Source · Destination · Required By
 *     LINES  (N)      Item · Qty · Remark        [+ Add line] [Remove]
 *
 * `remark` is already PER ROW in the table, so a per-line remark maps straight
 * onto the column that exists — and the header keeps none. One act, one home.
 *
 * **SUBMIT IS ONE ACT WITH A PER-ROW RESULT, and it is the page's OWN frozen
 * Issue behaviour rather than a new invention.** `issueAll` posts once per
 * group, keeps each result on its own row, and lets a failure sit there with a
 * retry — so this dialog posts once per LINE, sequentially, and:
 *
 *   · **what succeeded stays created.** There is no transaction spanning the
 *     lines and there must not be one: rolling three good lines back because
 *     the fourth had a bad SKU is the failure the card exists to stop.
 *   · a created line can never be posted twice, because `submit` walks only
 *     rows whose state is not `created` — the guard is the loop, not a flag
 *     somebody has to remember to check.
 *   · a failed line KEEPS ITS ROW with the server's own words, and pressing
 *     `Create` again retries exactly those. No `Retry` control is added; the
 *     button that made the attempt is the button that repeats it.
 *
 * **THE DIALOG CLOSES ONLY WHEN THERE IS NOTHING LEFT TO ANSWER FOR.** All
 * lines created → reset and close, exactly as the single-line version behaved.
 * Anything failed → it stays open showing what happened, and the grid behind it
 * is refreshed anyway, because rows that WERE created exist and the page must
 * say so.
 *
 * ── WHAT P15 CHANGED, AND WHY EACH WAS A DEFECT RATHER THAN A WISH ──────────
 *
 * All four were measured in a real browser on live data, 2026-08-04, and all
 * four survive P19 unchanged — the card requires it by name.
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
 * correct** and P15's card forbade touching them. P19 moves them into the
 * header BAND, which is where they always were relative to one purchase; it
 * changes no control, no word and no value.
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
 *
 * **THERE IS NO PRICE COLUMN AND THERE MAY NEVER BE ONE.** Purchasing prices
 * nothing here; the purchase order carries cost.
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

  // ── The header — asked ONCE for the whole purchase ────────────────────────
  const [purpose, setPurpose] = useState<DemandPurpose>(DEMAND_PURPOSE_DEFAULT);
  const [dest, setDest] = useState<string | undefined>(undefined);
  const [requiredBy, setRequiredBy] = useState("");

  // ── The lines — always at least one ───────────────────────────────────────
  const [lines, setLines] = useState<LineDraft[]>(() => [blankLine()]);
  /**
   * Which line's picker is open. **A single id, so two open pickers cannot be
   * REPRESENTED** — the same property Q5 built the row expand on. An operator
   * reading two result tables at once would not know which one their click
   * lands in.
   */
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /* No explicit choice means the FIRST line, so a freshly opened dialog shows
   * its picker exactly as the single-line version did. */
  const active = activeId ?? lines[0]?.id;

  const defaultDest = destinations.find((d) => d.isDefault) ?? destinations[0];
  const chosenDest = dest ?? defaultDest?.id;

  const items = pick.data?.items ?? [];

  const patch = (id: string, p: Partial<LineDraft>) =>
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...p } : l)));

  const qtyOf = (l: LineDraft) => Number(l.qty);
  const qtyOk = (l: LineDraft) => Number.isInteger(qtyOf(l)) && qtyOf(l) >= 1;

  /**
   * What `Create` will post: every line that names an item and has not already
   * been created. A line that FAILED is in here, which is the retry.
   */
  const submittable = lines.filter((l) => l.sku != null && l.state !== "created");

  /**
   * **A line an operator half-filled is never silently dropped.** Blank rows
   * are ignored — they are the empty row at the bottom — but a row carrying a
   * remark or a quantity and NO item holds the button, because posting the
   * others and closing would throw that typing away without saying so.
   */
  const everyStartedLineNamesAnItem = lines.every((l) => l.sku != null || isBlank(l));

  const canSave =
    !saving &&
    chosenDest != null &&
    submittable.length > 0 &&
    submittable.every(qtyOk) &&
    everyStartedLineNamesAnItem;

  function reset() {
    setLines([blankLine()]);
    setActiveId(null);
    setPurpose(DEMAND_PURPOSE_DEFAULT);
    setDest(undefined);
    setRequiredBy("");
  }

  function addLine() {
    const l = blankLine();
    setLines((ls) => [...ls, l]);
    setActiveId(l.id);
  }

  /**
   * Removing the LAST line leaves one empty line rather than an unusable form
   * — the card's own Done-when. A dialog with no rows has no way back.
   */
  function removeLine(id: string) {
    setLines((ls) => {
      const rest = ls.filter((l) => l.id !== id);
      return rest.length > 0 ? rest : [blankLine()];
    });
    setActiveId((a) => (a === id ? null : a));
  }

  /**
   * ONE act, one POST per line, in order — see the header comment. Sequential
   * rather than parallel on purpose: the demands land in the order they were
   * typed, and a server refusing one is not asked to refuse five at once.
   */
  async function submit() {
    if (!canSave || !chosenDest) return;
    const targets = submittable.map((l) => l.id);
    setSaving(true);
    setLines((ls) =>
      ls.map((l) =>
        targets.includes(l.id) ? { ...l, state: "pending", error: null } : l,
      ),
    );

    let created = 0;
    for (const id of targets) {
      // Read the row back out of state rather than off the closure's snapshot:
      // the operator cannot type while saving, but a stale copy is how a retry
      // posts yesterday's quantity.
      const line = lines.find((l) => l.id === id);
      if (!line || !line.sku) continue;
      try {
        await apiFetch("/api/operation/purchase/to-order/demand", {
          method: "POST",
          body: JSON.stringify({
            sku: line.sku,
            qty: Number(line.qty),
            purpose,
            destinationId: chosenDest,
            requiredBy: requiredBy || null,
            remark: line.remark.trim() || null,
          }),
        });
        created += 1;
        patch(id, { state: "created", error: null });
      } catch (e) {
        // The failure STAYS on its row with the server's own sentence: a demand
        // that did not save must not look like one that did.
        patch(id, {
          state: "failed",
          error: e instanceof Error ? e.message : W.createFailed,
        });
      }
    }
    setSaving(false);

    // Rows that WERE created exist now, so the grid is told either way.
    if (created > 0) onCreated();
    // ...and the dialog only leaves when nothing is left to answer for.
    if (created === targets.length) {
      reset();
      onOpenChange(false);
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
      /* 600px — the line grid does not fit 512, measured on the live dialog
       * rather than estimated. See `tailwind.config.ts`. */
      width="wide"
      footer={
        <span className="flex items-center gap-3 pt-1">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {W.cancel}
          </Button>
          <Button
            variant="primary"
            disabled={!canSave}
            loading={saving}
            onClick={() => void submit()}
            data-testid="to-order-create-submit"
          >
            {W.create}
          </Button>
        </span>
      }
    >
      <div className="flex flex-col gap-3" data-testid="to-order-create-dialog">
        {/* ── HEADER · asked once for the whole purchase ─────────────────────
            Source. The label is `Reason` because that is the word this mirror
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

        {/* ── LINES · N of them, one row per SKU ─────────────────────────────
            The column words are typed ONCE, here, and each control takes the
            same word as its accessible name — a row of unlabelled inputs is
            unreadable to a screen reader, and repeating the visible label per
            row would be three more words of ink on every line. */}
        <div className="flex flex-col gap-2" data-testid="to-order-create-lines">
          <div
            className="grid items-center gap-2 text-label text-kit-slate-11"
            style={{ gridTemplateColumns: LINE_GRID }}
          >
            <span>{W.itemLabel}</span>
            <span>{W.itemsColQty}</span>
            <span>{W.remark}</span>
            <span />
          </div>

          {lines.map((line, i) => {
            const picked = items.find((it) => it.sku === line.sku) ?? null;
            const showPicker = line.id === active && line.sku == null;
            const done = line.state === "created";
            return (
              <div key={line.id} className="flex flex-col gap-1">
                <div
                  className="grid items-center gap-2"
                  style={{ gridTemplateColumns: LINE_GRID }}
                  data-testid={`to-order-create-line-${i}`}
                >
                  <SearchInput
                    id={`cp-item-${i}`}
                    aria-label={W.itemLabel}
                    value={picked ? picked.label : line.needle}
                    disabled={done}
                    onFocus={() => setActiveId(line.id)}
                    onChange={(e) => {
                      setActiveId(line.id);
                      patch(line.id, { needle: e.target.value, sku: null });
                    }}
                    placeholder={W.searchItem}
                  />
                  <Input
                    id={`cp-qty-${i}`}
                    aria-label={W.itemsColQty}
                    value={line.qty}
                    disabled={done}
                    onChange={(e) => patch(line.id, { qty: e.target.value })}
                  />
                  <Input
                    id={`cp-remark-${i}`}
                    aria-label={W.remark}
                    value={line.remark}
                    disabled={done}
                    onChange={(e) => patch(line.id, { remark: e.target.value })}
                  />
                  {/* A created line is a RECORD now. Offering to take it out of
                      a form would imply the form can un-make it, and nothing
                      here can — cancelling a demand is the grid's own act. */}
                  {done ? (
                    <span
                      className="text-meta text-kit-slate-11"
                      data-testid={`to-order-line-created-${i}`}
                    >
                      {W.createdWord}
                    </span>
                  ) : (
                    <Button
                      variant="ghost"
                      onClick={() => removeLine(line.id)}
                      data-testid={`to-order-line-remove-${i}`}
                    >
                      {W.lineRemove}
                    </Button>
                  )}
                </div>

                {/* The supplier, the moment an item is picked. A FACT, read back
                    from the server's own derivation — never a control. */}
                {picked?.supplier ? (
                  <p
                    className="text-meta text-kit-slate-11"
                    data-testid={`cp-supplier-${i}`}
                  >
                    {W.supplierLabel}: {picked.supplier}
                  </p>
                ) : null}

                {line.error ? (
                  <p
                    className="text-meta text-kit-red-11"
                    data-testid={`to-order-line-failed-${i}`}
                  >
                    {line.error}
                  </p>
                ) : null}

                {showPicker ? (
                  /* THE PICKER IS A TABLE, and the SKU is the first column —
                     P15's defect 1. Every row is still one button, so the click
                     target and the keyboard order are exactly what they were.
                     It renders under the line being filled and nowhere else. */
                  <LinePicker
                    items={items}
                    needle={line.needle}
                    loading={pick.isLoading}
                    onPick={(sku) => patch(line.id, { sku, needle: "" })}
                  />
                ) : null}
              </div>
            );
          })}

          <div>
            <Button variant="ghost" onClick={addLine} data-testid="to-order-line-add">
              + {W.lineAdd}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/**
 * The search-result table for ONE line.
 *
 * It is a component rather than inline JSX so the filtering runs per line
 * against that line's own needle — one list shared across rows would show every
 * row the last thing anybody typed.
 */
function LinePicker({
  items,
  needle,
  loading,
  onPick,
}: {
  items: readonly DemandPickItem[];
  needle: string;
  loading: boolean;
  onPick: (sku: string) => void;
}) {
  /**
   * The search reads the SKU as well as the label, and it always did — what
   * changed in P15 is that the RESULT now shows the SKU, so a match on a code
   * the operator typed is visible in the row it matched.
   */
  const shown = useMemo(() => {
    const n = needle.trim().toLowerCase();
    if (!n) return items.slice(0, 8);
    return items
      .filter(
        (i) => i.label.toLowerCase().includes(n) || i.sku.toLowerCase().includes(n),
      )
      .slice(0, 8);
  }, [items, needle]);

  return (
    <DataTable<DemandPickItem>
      rows={shown}
      columns={PICK_COLUMNS}
      rowId={(i) => i.sku}
      onRowOpen={(i) => onPick(i.sku)}
      label={W.pickerTableLabel}
      loading={loading}
      /* No empty state: the picker showed an empty box before P15 and
         shows one now. P15 does not list that as a defect, and a
         sentence nobody has ruled may not appear on a screen. */
      empty={null}
    />
  );
}
