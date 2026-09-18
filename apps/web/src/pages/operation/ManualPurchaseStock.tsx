// design-standard: not-a-list-page — this is a SECTION inside an expanded
// Manual Purchase register row, not a page. The Register above owns the
// destination, the toolbar and the header; a second page chrome inside one
// table cell is the windows-inside-windows pattern the Constitution rejects.
import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MANUAL_PURCHASE_STOCK_UNIT_BLOCKED_WORDS,
  MANUAL_PURCHASE_WORDS as MW,
  manualPurchaseStockBlockWord,
  manualPurchaseStockCounts,
  manualPurchaseStockRefusal,
  manualPurchaseStockResponseSchema,
  type ManualPurchaseStockLine,
  type ManualPurchaseStockResponse,
} from "@carres/shared";
import Button from "@/components/kit/Button";
import { apiFetch } from "@/lib/api";
import StockPickerTable, { type StockPickerRow } from "./components/StockPickerTable";

/**
 * ⭐ MANUAL PURCHASE · READY STOCK — the ALLOCATION section
 * (owner ruling 2026-09-18; `docs/purchasing/MASTER.md` §9.2).
 *
 * ── WHAT THIS REPLACES, AND WHY IT IS NOT A RESTYLE ─────────────────────────
 *
 * The retired section was one read-only box at the bottom of the expansion,
 * grouped by product, with nothing to press. It rested on a sentence the owner
 * has since overwritten: *an internal purchase is owed by nobody on the
 * shelf.* That is true of buying EXTRA stock and false of a concrete need — a
 * Service Case, a staff purchase, a showroom display — which the sofa standing
 * in Klang can answer today.
 *
 * So the section moved. It is now one frame per GOODS LINE, opened from that
 * line's own `Ready Stock` cell, because a Unit answers a LINE and a box
 * shared by every line cannot say which one a choice was for.
 *
 * ── THE JOURNEY, AND THERE IS NO FIFTH CONTROL ──────────────────────────────
 *
 * ```
 * tick / untick        a DRAFT. Writes nothing.
 * Choose Ready Unit    saves the first allocation.
 * Change selection     reopens the saved set for editing.
 * Save changes         commits additions AND removals — including all of them.
 * Cancel               restores the saved set.
 * ```
 *
 * ⛔ NO PER-UNIT UNDO, and the reason is not tidiness. A Unit is not a
 * document: releasing one of five choices and saving the other four is ONE act
 * on one line, and two buttons for one act is how a half-applied replacement
 * happens. The save is atomic in SQL; the screen offers exactly the acts the
 * door can perform.
 *
 * ⛔ AND THE OPERATOR IS NEVER LOCKED OUT OF THEIR OWN CHOICE. A line whose
 * remaining quantity has fallen to zero BECAUSE OF THIS SAVE still opens, still
 * lists what it holds, and still offers `Change selection` — otherwise the one
 * journey that takes a choice back would disappear at exactly the moment it is
 * needed.
 */

const QUERY_KEY = (requestId: string) => ["manual-purchase-stock-allocation", requestId];

export function useManualPurchaseStock(requestId: string, enabled: boolean) {
  return useQuery<ManualPurchaseStockResponse>({
    queryKey: QUERY_KEY(requestId),
    enabled,
    staleTime: 15_000,
    queryFn: async () => {
      const raw = await apiFetch<unknown>(
        `/api/operation/purchasing/requests/${encodeURIComponent(requestId)}/stock-allocation`,
      );
      /* Parsed, not trusted — a response that is not an allocation read becomes
         the error state, never an empty table reading as "no stock". */
      return manualPurchaseStockResponseSchema.parse(raw);
    },
  });
}

/**
 * THE CELL — `{n} available` over `{n} reserved`, and a separate borderless
 * disclosure button (UI MASTER §6.8).
 *
 * ⚠️ FOUR ANSWERS, AND NONE OF THEM BORROWS ANOTHER'S WORDS
 * (`docs/COPY-STANDARD.md` — the same law the `Unit ID` cell already obeys):
 *
 * ```
 * Loading…              in flight
 * Could not be loaded   the read FAILED
 * Not checked           the read answered for the REQUEST and carried no
 *                       entry for THIS line — Carres did not look here, which
 *                       is an unasked question, not an unopened message
 * {n} available         a successful read. `0` is printed here and NOWHERE
 *                       else, because only here is it a measured fact.
 * ```
 *
 * ⚠️ `Not checked` WAS FOUND MISSING ON THE RENDERED WALK (2026-09-18): a
 * successful read with no entry for a line printed `Could not be loaded`, so a
 * question nobody asked read as a system fault.
 */
export function ReadyStockCell({
  line,
  state,
  open,
  onToggle,
}: {
  line: ManualPurchaseStockLine | null;
  state: "loading" | "error" | "ready";
  open: boolean;
  onToggle: () => void;
}) {
  if (state === "loading") {
    return <span className="text-kit-slate-11">Loading…</span>;
  }
  if (state === "error") {
    return <span className="text-kit-slate-11">Could not be loaded</span>;
  }
  if (line == null) {
    return <span className="text-kit-slate-11">Not checked</span>;
  }
  const counts = manualPurchaseStockCounts(line);
  return (
    <span className="flex items-start gap-1">
      <span className="min-w-0 flex-1">
        <span className="block tabular-nums">{counts.available}</span>
        {counts.reserved ? (
          <span className="block text-label tabular-nums text-kit-slate-11">
            {counts.reserved}
          </span>
        ) : null}
      </span>
      {/* A DISCLOSURE ONLY WHERE THERE IS SOMETHING TO DISCLOSE — zero
          available with nothing saved has no table to open, and a control that
          opens nothing is a dead control (`03-page-patterns.md:149`). A SAVED
          choice keeps its door open at zero availability, always. */}
      {line.units.length > 0 ? (
        <button
          type="button"
          aria-expanded={open}
          aria-label={`Ready Stock for ${line.item}`}
          data-testid={`mp-stock-disclosure-${line.demandId}`}
          className="shrink-0 rounded-control px-1 text-kit-slate-11 hover:bg-kit-slate-3"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          <span aria-hidden>{open ? "▾" : "▸"}</span>
        </button>
      ) : null}
    </span>
  );
}

/** THE FRAME — a subtle bordered white box, opened beneath its own item. */
export function ManualPurchaseStockFrame({
  requestId,
  line,
  reference,
  draft,
  onDraft,
}: {
  requestId: string;
  line: ManualPurchaseStockLine;
  reference: string | null;
  /**
   * ⭐ THE DRAFT IS HELD BY THE PAGE, NOT BY THIS FRAME, and that is a
   * correctness requirement rather than a preference.
   *
   *   · Collapsing the cell must not throw away ticks the operator has made.
   *   · `Issue PO` upstairs must REFUSE while any line here is unsaved
   *     (MASTER §9.2), and a gate cannot ask a component that is unmounted.
   *
   * `null` means *not editing*: the saved set is shown and nothing is pending.
   */
  draft: ReadonlySet<string> | null;
  onDraft: (next: ReadonlySet<string> | null) => void;
}) {
  const qc = useQueryClient();
  /** The set that was SAVED when this frame last read the server. */
  const saved = useMemo(
    () => line.units.filter((u) => u.reservedForThisLine).map((u) => u.itemId),
    [line.units],
  );
  const [refusal, setRefusal] = useState<{ wrong: string; todo: string } | null>(null);
  const [refusedUnit, setRefusedUnit] = useState<string | null>(null);
  const [saved0k, setSaved0k] = useState(false);

  const block = line.stockBlock;
  const blockWord = manualPurchaseStockBlockWord(block);
  const editing = draft != null;
  const chosen = draft ?? new Set(saved);

  const save = useMutation({
    mutationFn: async (itemIds: string[]) =>
      apiFetch<unknown>(
        `/api/operation/purchasing/requests/${encodeURIComponent(requestId)}/stock-allocation`,
        {
          method: "POST",
          body: JSON.stringify({
            demandId: line.demandId,
            itemIds,
            /* THE OPTIMISTIC CHECK. The server refuses the whole save if this
               line's saved set has moved since this frame read it, so nobody
               silently overwrites somebody else's allocation. */
            expectedItemIds: saved,
          }),
        },
      ),
  });

  const commit = useCallback(
    async (itemIds: string[]) => {
      setRefusal(null);
      setRefusedUnit(null);
      try {
        await save.mutateAsync(itemIds);
        /* THE SERVER'S ANSWER DRIVES THE SCREEN. The draft is dropped and the
           read is refetched, so counters, Status and the remaining quantity
           come from what was actually stored — never from what the browser
           hoped it stored. */
        onDraft(null);
        setSaved0k(true);
        await qc.invalidateQueries({ queryKey: QUERY_KEY(requestId) });
      } catch (e) {
        /* ⚠️ THE REFUSAL'S OWN CODE, WHATEVER THREW IT. Narrowing on
           `instanceof ApiError` looked safe and silently discarded the body of
           anything else — so every refusal that did not arrive as that exact
           class printed the generic fallback and the operator lost the one
           sentence that said which Unit went stale. The shape is what matters:
           an error carrying a `body.code` is the door speaking. */
        const body = (e as { body?: { code?: string; itemId?: string } } | null)?.body;
        setRefusal(manualPurchaseStockRefusal(body?.code));
        setRefusedUnit(body?.itemId ?? null);
        /* ⭐ A REFUSAL KEEPS THE OPERATOR'S CHOICES ON SCREEN. They chose five
           Units and one went stale; throwing the other four away would make
           them do the work again to reach the same refusal. */
        onDraft(new Set(itemIds));
      }
    },
    [onDraft, qc, requestId, save],
  );

  const rows: StockPickerRow[] = line.units.map((u) => ({
    itemId: u.itemId,
    unitCode: u.unitCode,
    identityScope: u.identityScope,
    sku: u.sku,
    goodsReceivedDate: u.goodsReceivedDate,
    stockLocation: u.stockLocation,
    supplier: u.supplier,
    sourceRef: u.sourceRef,
    condition: u.condition,
    ownership: u.ownership,
    qty: u.qty,
    reservedForThisLine: u.reservedForThisLine,
  }));
  const blockedById = new Map(line.units.map((u) => [u.itemId, u.blocked]));

  const canChoose = block == null;
  const chosenCount = chosen.size;
  const changed =
    editing &&
    (chosenCount !== saved.length || saved.some((id) => !chosen.has(id)));

  return (
    <div
      className="overflow-hidden rounded-control border border-kit-slate-6 bg-white"
      data-testid={`mp-stock-frame-${line.demandId}`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-kit-slate-6 bg-kit-slate-2 px-2 py-1.5">
        <span className="text-body font-semibold text-kit-slate-12">{MW.colReadyStock}</span>
        <span className="text-label text-kit-slate-11">{line.item}</span>
        {/* ⛔ THE ASK IS PRINTED AND IS NEVER REWRITTEN. Requested, saved and
            still-to-buy stand side by side so the arithmetic is readable
            rather than inferred from a number that quietly shrank. */}
        <span className="text-label tabular-nums text-kit-slate-11">
          {`Requested ${line.requestedQty} · ${line.reservedQty} reserved · ${line.remainingQty} to buy`}
        </span>
      </div>

      {blockWord ? (
        <p
          className="border-b border-kit-slate-6 px-2 py-1.5 text-label text-kit-slate-11"
          data-testid={`mp-stock-block-${line.demandId}`}
        >
          {blockWord}
        </p>
      ) : null}

      {refusal ? (
        <p
          className="border-b border-kit-slate-6 bg-kit-amber-3 px-2 py-1.5 text-label"
          data-testid={`mp-stock-refusal-${line.demandId}`}
        >
          <span className="block font-medium">{refusal.wrong}</span>
          <span className="block">{refusal.todo}</span>
          {/* Stated ONCE, for every refusal alike: the door is atomic. */}
          <span className="block">Nothing was saved.</span>
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="px-2 py-2 text-label text-kit-slate-11">{MW.stockNoneMatches}</p>
      ) : (
        <StockPickerTable
          label={`${MW.colReadyStock} for ${reference ?? MW.page} · ${line.item}`}
          rows={rows}
          selection={
            canChoose
              ? {
                  isChosen: (itemId) => chosen.has(itemId),
                  onToggle: (itemId) => {
                    const next = new Set(draft ?? saved);
                    if (next.has(itemId)) next.delete(itemId);
                    else next.add(itemId);
                    setSaved0k(false);
                    onDraft(next);
                  },
                  isRefused: (itemId) => refusedUnit === itemId,
                  frozen: save.isPending,
                  blockedWord: (row) => {
                    const b = blockedById.get(row.itemId) ?? null;
                    /* A Unit this line ALREADY HOLDS is never blocked by the
                       remainder its own allocation created — unticking it is
                       the only way back. */
                    if (row.reservedForThisLine) return null;
                    return b ? MANUAL_PURCHASE_STOCK_UNIT_BLOCKED_WORDS[b] : null;
                  },
                }
              : undefined
          }
        />
      )}

      {canChoose && rows.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-kit-slate-6 px-2 py-1.5">
          <span className="text-label text-kit-slate-11" data-testid={`mp-stock-count-${line.demandId}`}>
            {`${chosenCount} selected`}
          </span>
          {/* ⚠️ `Not saved` IS THE WHOLE POINT OF THE DRAFT STATE. A tick that
              looks committed and is not is the defect this word exists to
              prevent, and the same fact blocks Issue PO upstairs. */}
          {changed ? (
            <span className="text-label font-medium text-kit-amber-11">{MW.stockNotSaved}</span>
          ) : saved0k ? (
            <span className="text-label text-kit-slate-11">{MW.stockSaved}</span>
          ) : null}
          {/* ⚠️ THE CONTROLS SIT BESIDE THE COUNTS, NOT AT THE FAR RIGHT.
              Found on the rendered walk (2026-09-18): the frame is as wide as
              the columns it spans, so a `flex-1` spacer pushed `Change
              selection` off the visible canvas on a 1440px screen with the
              sheet scrolled — the one control the journey depends on, out of
              reach. They follow the facts they act on. */}
          {saved.length === 0 && !editing ? (
            <Button
              size="sm"
              variant="primary"
              disabled
              title="Tick a Unit first."
              data-testid={`mp-stock-choose-${line.demandId}`}
            >
              {/* A disabled control NAMES ITS GAP rather than sitting there
                  grey and silent (`03-page-patterns.md:219`). */}
              {`${MW.chooseReadyUnit} — tick a Unit first`}
            </Button>
          ) : null}
          {editing ? (
            <>
              <Button
                size="sm"
                variant="neutral"
                disabled={save.isPending}
                data-testid={`mp-stock-cancel-${line.demandId}`}
                onClick={() => {
                  /* CANCEL RESTORES THE SAVED SET — it does not clear the
                     line. Dropping the draft IS the restore, because the saved
                     set is what renders when there is no draft. */
                  onDraft(null);
                  setRefusal(null);
                  setRefusedUnit(null);
                }}
              >
                {MW.cancelChanges}
              </Button>
              <Button
                size="sm"
                variant="primary"
                disabled={save.isPending || !changed}
                data-testid={`mp-stock-save-${line.demandId}`}
                onClick={() => void commit([...chosen])}
              >
                {/* THE FIRST SAVE AND A LATER ONE ARE DIFFERENT ACTS AND SAY
                    SO: `Choose Ready Unit` commits an allocation that did not
                    exist; `Save changes` replaces one that did. */}
                {saved.length === 0 ? MW.chooseReadyUnit : MW.saveChanges}
              </Button>
            </>
          ) : saved.length > 0 ? (
            <Button
              size="sm"
              variant="neutral"
              data-testid={`mp-stock-change-${line.demandId}`}
              onClick={() => onDraft(new Set(saved))}
            >
              {MW.changeSelection}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * ⭐ THE ISSUE PO GATE, IN ONE PLACE (MASTER §9.2: "Pending edits must be
 * saved/cancelled before Issue PO").
 *
 * A draft that differs from what is stored is the ONLY thing that blocks. A
 * draft equal to the saved set is somebody who ticked and unticked, and
 * refusing them would be punishing a person for changing their mind.
 */
export function stockDraftIsDirty(
  draft: ReadonlySet<string> | null,
  saved: readonly string[],
): boolean {
  if (draft == null) return false;
  if (draft.size !== saved.length) return true;
  return saved.some((id) => !draft.has(id));
}

/** The saved set of a line, as the server last answered it. */
export function savedUnitsOf(line: ManualPurchaseStockLine): string[] {
  return line.units.filter((u) => u.reservedForThisLine).map((u) => u.itemId);
}
