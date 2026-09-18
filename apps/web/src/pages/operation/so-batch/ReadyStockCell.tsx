// design-standard: not-a-list-page — this is a CELL and the table it opens
// inside an expanded SO Batch Purchase row, not a page. It has no route, no
// shell and no page header: the Register above already owns all three, and
// wrapping a nested disclosure in a second ListPageShell would draw a page
// inside a page — exactly the windows-inside-windows AutoCount pattern the
// Constitution rejects (§2).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  READY_STOCK_BLOCKED_WORDS,
  READY_STOCK_REFUSAL_WORDS,
  SO_BATCH_PURCHASE_WORDS as W,
  readyStockRefusalWord,
  readyStockResponseSchema,
  readyStockSaveResultSchema,
  type ReadyStockResponse,
  type ReadyStockUnit,
} from "@carres/shared";
import Button from "@/components/kit/Button";
import { ApiError, apiFetch } from "@/lib/api";
import { toast } from "sonner";
import ReadyStockTable, { type ReadyStockTableRow } from "../components/ReadyStockTable";

/**
 * ⭐ READY STOCK IS A CELL ON THE ITEM ROW — owner ruling 2026-09-18
 * (`docs/purchasing/MASTER.md` §9.1; `docs/ui/MASTER.md` §6.8–6.9).
 *
 * It used to be one section per SALES ORDER, below the goods: the operator read
 * an item line, then looked down at a separate table and matched the goods back
 * up by eye, choosing which item line each Unit answered from a dropdown. The
 * question is per ITEM LINE, so the answer is now on the item line — two counts
 * in its own cell, and a disclosure that opens the Units for THAT line directly
 * beneath it.
 *
 * ── THE ITEM LINE IS NO LONGER A THING TO CHOOSE ────────────────────────────
 *
 * `For item line` is gone, and nothing was lost with it. SO-1251, SO-1207 and
 * SO-1246 each carry two item lines of one SKU, and the old dropdown existed
 * exactly so the operator could say which. The picker now OPENS under one of
 * them, so the answer is structural rather than typed — and the door still
 * receives the exact line id and still refuses to guess (0471).
 *
 * ── FOUR STATES, AND NONE OF THEM IS `0` ────────────────────────────────────
 *
 *   LOADING  the read is in flight — `Loading…`, and no disclosure yet.
 *   FAILED   it came back an error — `Could not be read` and a retry.
 *   EMPTY    it SUCCEEDED and found nothing free and nothing saved — `0`, and
 *            no disclosure, because there is nothing under it.
 *   COUNTS   `{n} available` over `{n} reserved`, and the disclosure.
 *
 * A `0` printed while a read is in flight or after it failed is the defect this
 * separation exists to stop: it reads as *the shelf is empty* when the truth is
 * *nobody looked*.
 *
 * ── AND VIEWING STILL RESERVES NOTHING ──────────────────────────────────────
 *
 *   VIEWING    opening the picker reads. It writes no row, ever.
 *   SELECTING  a checkbox edits a DRAFT. Still no write.
 *   SAVING     `Choose Ready Unit` / `Save changes` — one act, one
 *              transaction (0545), additions and releases together.
 *   PURCHASING the goods table's OWN checkbox, on the same row. A different
 *              act, a different column, and the two never share state.
 */

/**
 * WHAT THE ACT DID, IN UNITS.
 *
 * The door is atomic, so there are exactly two outcomes and the screen says
 * which: the whole replacement went in, or none of it did and ONE Unit is the
 * reason. A count alone is not enough — an operator told "someone else took
 * that Unit" about a set of five would otherwise untick them one at a time to
 * find out which, and every attempt is another race.
 */
type ActResult =
  | { kind: "ok"; reserved: number; added: number; released: number }
  | { kind: "refused"; sentence: string; unitId: string | null; unitCode: string | null }
  /**
   * ⭐ THE THIRD OUTCOME, AND IT IS THE DANGEROUS ONE.
   *
   * A CONFIRMED refusal is the server saying no: the transaction rolled back
   * and nothing moved. A request that never came back — a timeout, a dropped
   * connection, a 502 in front of the Worker — says nothing at all about the
   * transaction, which may well have COMMITTED. Printing `Nothing was changed.`
   * there is a guess wearing the clothes of a fact, and the operator's next move
   * is to press again.
   *
   * So the uncertain case states that it is uncertain, re-reads the
   * authoritative record, and closes the draft so the same button cannot be
   * pressed blind.
   */
  | { kind: "unknown"; sentence: string };

/** The draft for one item line, and whether it is an edit of a SAVED set. */
interface Draft {
  chosen: Set<string>;
  /** True once the line has a saved set being replaced — `Save changes`. */
  editing: boolean;
}

export interface SoBatchReadyStock {
  /** The two-line cell for one item line, disclosure included. */
  cell: (orderLineId: string) => React.ReactNode;
  /** The picker that opens under that item row, or null when it is closed. */
  detail: (orderLineId: string) => React.ReactNode;
  /** Any line with an unsaved edit — `Issue PO` waits for a decision on it. */
  pending: boolean;
}

/**
 * ONE READ PER EXPANDED SALES ORDER, and it stays lazy at the Register's grain:
 * this hook only runs inside an expansion, so a page of collapsed rows still
 * counts no warehouse. The counts have to be on screen BEFORE the picker is
 * opened, so the read cannot wait for the disclosure — and a read that has not
 * answered prints its own words rather than a zero.
 */
export function useSoBatchReadyStock({
  orderId,
  so,
  onSaved,
  onPendingChange,
}: {
  orderId: string;
  so: number | null;
  /**
   * This order has an edit nobody has saved or cancelled. The Register holds
   * `Issue PO` while it is true, because the pending change IS a change to the
   * quantity that purchase would be raised against. Reported false on unmount:
   * collapsing the row discards the draft exactly as `Cancel` does, and a
   * hidden draft blocking a button the operator cannot see is worse than a
   * draft that was never written anywhere.
   */
  onPendingChange?: (orderId: string, pending: boolean) => void;
  /**
   * The item lines this act answered. The Register drops every purchasing tick
   * standing on them: the `To buy` those ticks were arranged against has just
   * changed, and `Issue PO` is one click while the recomputed read is a round
   * trip away.
   */
  onSaved?: (orderId: string, orderLineIds: readonly string[]) => void;
}): SoBatchReadyStock {
  const [openLines, setOpenLines] = useState<ReadonlySet<string>>(new Set());
  const [drafts, setDrafts] = useState<ReadonlyMap<string, Draft>>(new Map());
  const [acts, setActs] = useState<ReadonlyMap<string, ActResult>>(new Map());
  const [savingLine, setSavingLine] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const q = useQuery<ReadyStockResponse>({
    queryKey: ["so-batch-ready-stock", orderId],
    staleTime: 15_000,
    queryFn: async () => {
      const raw = await apiFetch<unknown>(
        `/api/operation/purchase/demands/${encodeURIComponent(orderId)}/ready-stock`,
      );
      /* Parsed, not trusted — a response that is not a Ready Stock read becomes
         the error state, never an empty table that reads as "no stock". */
      return readyStockResponseSchema.parse(raw);
    },
  });

  const units = useMemo(() => q.data?.units ?? [], [q.data]);

  /** The goods of this item line, need or no need (§9.1). */
  const unitsForLine = useCallback(
    (lineId: string): ReadyStockUnit[] =>
      units.filter((u) => (u.lineIds ?? u.matchingLineIds).includes(lineId)),
    [units],
  );
  /** What is SAVED against this item line right now — the server's own answer. */
  const savedForLine = useCallback(
    (lineId: string) => unitsForLine(lineId).filter((u) => u.reservedForLineId === lineId),
    [unitsForLine],
  );
  /**
   * What is FREE for this item line. Exact Units only: a counted row is on the
   * shelf and is SHOWN in the table below, but 0368 makes it unbindable, so
   * counting it here would offer a number nothing can act on. A line that needs
   * nothing more still reads its shelf honestly — need is the other count's
   * question, not this one's.
   */
  const availableForLine = useCallback(
    (lineId: string) =>
      unitsForLine(lineId).filter(
        (u) => u.reservedForLineId == null && u.identityScope === "unit",
      ),
    [unitsForLine],
  );

  const draftFor = useCallback(
    (lineId: string): Draft =>
      drafts.get(lineId) ?? {
        chosen: new Set(savedForLine(lineId).map((u) => u.itemId)),
        editing: false,
      },
    [drafts, savedForLine],
  );

  const pending = useMemo(() => {
    for (const [lineId, draft] of drafts) {
      const saved = new Set(savedForLine(lineId).map((u) => u.itemId));
      if (draft.chosen.size !== saved.size) return true;
      for (const id of draft.chosen) if (!saved.has(id)) return true;
    }
    return false;
  }, [drafts, savedForLine]);

  useEffect(() => {
    onPendingChange?.(orderId, pending);
  }, [onPendingChange, orderId, pending]);
  useEffect(
    () => () => {
      onPendingChange?.(orderId, false);
    },
    [onPendingChange, orderId],
  );

  const save = useMutation({
    mutationFn: (v: { orderLineId: string; itemIds: string[] }) =>
      apiFetch<unknown>("/api/operation/purchase/demands/ready-stock/save", {
        method: "POST",
        body: JSON.stringify({ orderId, orderLineId: v.orderLineId, itemIds: v.itemIds }),
      }),
    onSuccess: (raw, v) => {
      /* Parsed, not trusted — and what came back is what the DOOR committed,
         never what the browser asked for. */
      const parsed = readyStockSaveResultSchema.safeParse(raw);
      const reserved = parsed.success ? parsed.data.reserved : v.itemIds.length;
      const added = parsed.success ? parsed.data.added : 0;
      const released = parsed.success ? parsed.data.released : 0;
      toast.success(
        `Ready Stock saved · ${reserved} Unit${reserved === 1 ? "" : "s"}${
          so == null ? "" : ` on SO-${so}`
        }`,
      );
      setActs((prev) => new Map(prev).set(v.orderLineId, { kind: "ok", reserved, added, released }));
      /* The draft has become the record. It is dropped rather than kept, so the
         cell reads the server's answer and not the browser's memory of it. */
      setDrafts((prev) => {
        const next = new Map(prev);
        next.delete(v.orderLineId);
        return next;
      });
      onSaved?.(orderId, [v.orderLineId]);
      /* The server's own recomputation decides what still needs buying — the
         Register is invalidated rather than edited in place. */
      void queryClient.invalidateQueries({ queryKey: ["so-batch-ready-stock", orderId] });
      void queryClient.invalidateQueries({ queryKey: ["so-batch-purchase"] });
      void queryClient.invalidateQueries({
        queryKey: ["operation", "orders", orderId, "expansion"],
      });
    },
    onError: (e: Error, v) => {
      const body =
        e instanceof ApiError ? (e.body as { code?: string; itemId?: string } | null) : null;
      const code = body?.code ?? null;
      /* A CONFIRMED refusal is one the door NAMED. Anything else — no response,
         no body, or a body carrying no governed code — leaves the outcome
         unknown, and the only honest next step is to re-read. */
      if (code == null || !(code in READY_STOCK_REFUSAL_WORDS)) {
        const sentence = "Ready Stock could not confirm the result. It has been read again.";
        toast.error(sentence);
        setActs((prev) => new Map(prev).set(v.orderLineId, { kind: "unknown", sentence }));
        setDrafts((prev) => {
          const next = new Map(prev);
          next.delete(v.orderLineId);
          return next;
        });
        void queryClient.invalidateQueries({ queryKey: ["so-batch-ready-stock", orderId] });
        void queryClient.invalidateQueries({ queryKey: ["so-batch-purchase"] });
        void queryClient.invalidateQueries({
          queryKey: ["operation", "orders", orderId, "expansion"],
        });
        return;
      }
      const sentence = readyStockRefusalWord(code);
      toast.error(sentence);
      /* 0473/0545 name the Unit the act stopped on. THE DRAFT IS LEFT ALONE, so
         the operator unticks that one and presses again rather than rebuilding
         a selection the refusal never touched — the owner's own rule: a refusal
         saves nothing and preserves the draft. */
      setActs((prev) =>
        new Map(prev).set(v.orderLineId, {
          kind: "refused",
          sentence,
          unitId: body?.itemId ?? null,
          unitCode: body?.itemId ? codeOf(body.itemId) : null,
        }),
      );
    },
    onSettled: () => setSavingLine(null),
  });

  function codeOf(itemId: string): string | null {
    return units.find((u) => u.itemId === itemId)?.unitCode ?? null;
  }

  function setDraft(lineId: string, next: Draft) {
    setDrafts((prev) => new Map(prev).set(lineId, next));
  }

  function toggleUnit(lineId: string, itemId: string) {
    /* A result is about the act that produced it. The moment the choice moves,
       last act's sentence is history and stops being shown beside a new one. */
    setActs((prev) => {
      const next = new Map(prev);
      next.delete(lineId);
      return next;
    });
    const draft = draftFor(lineId);
    const chosen = new Set(draft.chosen);
    if (chosen.has(itemId)) chosen.delete(itemId);
    else chosen.add(itemId);
    setDraft(lineId, { ...draft, chosen });
  }

  function cancel(lineId: string) {
    /* `Cancel` restores the SAVED set: the draft is dropped and the cell reads
       the server again. It never half-applies and never leaves the tick where
       the operator left it. */
    setDrafts((prev) => {
      const next = new Map(prev);
      next.delete(lineId);
      return next;
    });
    setActs((prev) => {
      const next = new Map(prev);
      next.delete(lineId);
      return next;
    });
  }

  const cell = (orderLineId: string) => {
    const saved = savedForLine(orderLineId);
    const free = availableForLine(orderLineId);
    const open = openLines.has(orderLineId);
    /* ⛔ NEITHER OF THESE MAY BECOME A ZERO. */
    if (q.isPending) {
      return (
        <span className="text-kit-slate-11" data-testid={`ready-stock-cell-${orderLineId}`}>
          {W.readyStockLoading}
        </span>
      );
    }
    if (q.isError) {
      return (
        <span data-testid={`ready-stock-cell-${orderLineId}`}>
          <span className="block text-kit-slate-11">{W.readyStockFailed}</span>
          <button
            type="button"
            className="text-meta text-kit-blue-11 underline-offset-2 hover:underline"
            onClick={() => void q.refetch()}
          >
            {W.readyStockRetry}
          </button>
        </span>
      );
    }
    if (free.length === 0 && saved.length === 0) {
      /* A SUCCESSFUL read that found nothing. `0` and no arrow, because there
         is nothing under it to open. */
      return (
        <span className="tabular-nums" data-testid={`ready-stock-cell-${orderLineId}`}>
          {W.readyStockNone}
        </span>
      );
    }
    return (
      <span
        className="flex items-start gap-1"
        data-testid={`ready-stock-cell-${orderLineId}`}
      >
        <span className="min-w-0 flex-1">
          <span className="block tabular-nums">{W.readyStockAvailable(free.length)}</span>
          {/* THE SECOND LINE IS THIS ITEM LINE'S OWN, never the order's. */}
          <span className="mt-0.5 block text-meta tabular-nums text-kit-slate-11">
            {W.readyStockReserved(saved.length)}
          </span>
        </span>
        {/* ⭐ A SEPARATE, BORDERLESS DISCLOSURE (§6.8). It is not the row's
            goods arrow and it is not the SO No link: one control, one job. Its
            expanded state is exposed, so the keyboard reads it too. */}
        <button
          type="button"
          aria-expanded={open}
          aria-label={open ? W.readyStockClose : W.readyStockOpen}
          title={open ? W.readyStockClose : W.readyStockOpen}
          data-testid={`ready-stock-toggle-${orderLineId}`}
          className="mt-px shrink-0 rounded-control border-0 bg-transparent px-1 text-kit-slate-11 hover:text-kit-slate-12"
          onClick={(e) => {
            e.stopPropagation();
            setOpenLines((prev) => {
              const next = new Set(prev);
              if (next.has(orderLineId)) next.delete(orderLineId);
              else next.add(orderLineId);
              return next;
            });
          }}
        >
          <span aria-hidden>{open ? "▾" : "▸"}</span>
        </button>
      </span>
    );
  };

  const detail = (orderLineId: string) => {
    if (!openLines.has(orderLineId)) return null;
    const rows = unitsForLine(orderLineId);
    const saved = savedForLine(orderLineId);
    const draft = draftFor(orderLineId);
    const act = acts.get(orderLineId);
    const dirty =
      draft.chosen.size !== saved.length ||
      saved.some((u) => !draft.chosen.has(u.itemId));
    const hasSaved = saved.length > 0;
    const editing = drafts.has(orderLineId);
    const busy = savingLine === orderLineId && save.isPending;

    return (
      <SoBatchStockDetail
        orderLineId={orderLineId}
        so={so}
        rows={rows}
        empty={rows.length === 0}
        chosen={draft.chosen}
        blockedWord={(row) => {
          const unit = rows.find((u) => u.itemId === row.itemId);
          if (unit?.reservedForLineId === orderLineId) return null;
          if (unit?.blocked) return READY_STOCK_BLOCKED_WORDS[unit.blocked];
          return unit && unit.matchingLineIds.length > 0 ? null : "—";
        }}
        refusedId={act?.kind === "refused" ? act.unitId : null}
        onToggle={(itemId) => toggleUnit(orderLineId, itemId)}
        /* THE ONE JOURNEY: choose → saved → change → save / cancel. */
        primaryLabel={hasSaved ? W.readyStockSave : W.readyStockChoose}
        showPrimary={!hasSaved || editing}
        showChange={hasSaved && !editing}
        canSave={dirty && !busy}
        busy={busy}
        onPrimary={() => {
          setSavingLine(orderLineId);
          save.mutate({ orderLineId, itemIds: [...draft.chosen] });
        }}
        onChange={() =>
          setDraft(orderLineId, {
            chosen: new Set(saved.map((u) => u.itemId)),
            editing: true,
          })
        }
        onCancel={() => cancel(orderLineId)}
        showCancel={editing}
        act={act}
      />
    );
  };

  return { cell, detail, pending };
}

/**
 * THE PICKER ITSELF — the shared stock table in its approved six-column picker
 * layout, its connector, and the one act bar.
 *
 * ⭐ THE FRAME IS THIS FILE'S; THE CONNECTOR IS THE TABLE'S (§6.9). The 1px line
 * comes down from under the disclosure arrow and touches this frame's TOP
 * BORDER, and `GoodsMiniTable` draws it — it is the only thing that knows where
 * the `Ready Stock` column is, and a line drawn from anywhere else would have to
 * measure that offset and would drift the first time a column moved.
 */
function SoBatchStockDetail({
  orderLineId,
  so,
  rows,
  empty,
  chosen,
  blockedWord,
  refusedId,
  onToggle,
  primaryLabel,
  showPrimary,
  showChange,
  canSave,
  busy,
  onPrimary,
  onChange,
  onCancel,
  showCancel,
  act,
}: {
  orderLineId: string;
  so: number | null;
  rows: ReadyStockUnit[];
  empty: boolean;
  chosen: ReadonlySet<string>;
  blockedWord: (row: ReadyStockTableRow) => string | null;
  refusedId: string | null;
  onToggle: (itemId: string) => void;
  primaryLabel: string;
  showPrimary: boolean;
  showChange: boolean;
  canSave: boolean;
  busy: boolean;
  onPrimary: () => void;
  onChange: () => void;
  onCancel: () => void;
  showCancel: boolean;
  act: ActResult | undefined;
}) {
  return (
    <div className="pb-2" data-testid={`ready-stock-detail-${orderLineId}`}>
      {/* The connector that reaches this frame's TOP BORDER is drawn by
          `GoodsMiniTable`, which is the only thing that knows where the
          `Ready Stock` column — and so the arrow this line comes from — is. */}
      <div className="overflow-hidden rounded-control border border-kit-slate-6 bg-white">
        {empty ? (
          <div className="px-3 py-2 text-meta text-kit-slate-11">{W.readyStockEmpty}</div>
        ) : (
          <>
            <ReadyStockTable
              layout="picker"
              label={
                so == null
                  ? "Ready Stock for this item line"
                  : `Ready Stock for SO-${so}, this item line`
              }
              rows={rows as ReadyStockTableRow[]}
              selection={{
                isChosen: (itemId) => chosen.has(itemId),
                onToggle,
                isRefused: (itemId) => refusedId === itemId,
                blockedWord,
              }}
            />
            <div className="flex flex-wrap items-center gap-2 border-t border-kit-slate-5 px-3 py-2">
              <span className="text-meta text-kit-slate-11" data-testid={`ready-stock-count-${orderLineId}`}>
                {chosen.size === 0 ? W.readyStockNoneChosen : W.readyStockChosen(chosen.size)}
              </span>
              <span className="flex-1" />
              {/* ⭐ THE KIT'S OWN CONTROLS, NOT THE MOCKUP'S CSS. One blue per
                  block (§3.4): the save is the primary, `Change selection` and
                  `Cancel` are neutral, and all three are the governed 32px. */}
              {showChange ? (
                <Button
                  variant="neutral"
                  size="md"
                  data-testid={`ready-stock-change-${orderLineId}`}
                  onClick={onChange}
                >
                  {W.readyStockChange}
                </Button>
              ) : null}
              {showCancel ? (
                <Button
                  variant="neutral"
                  size="md"
                  data-testid={`ready-stock-cancel-${orderLineId}`}
                  onClick={onCancel}
                >
                  {W.readyStockCancel}
                </Button>
              ) : null}
              {showPrimary ? (
                <Button
                  variant="primary"
                  size="md"
                  data-testid={`ready-stock-save-${orderLineId}`}
                  disabled={!canSave}
                  loading={busy}
                  onClick={onPrimary}
                >
                  {primaryLabel}
                </Button>
              ) : null}
            </div>
          </>
        )}
        {/* WHAT THE ACT DID, IN UNITS — never a bare count. The door commits the
            whole replacement or none of it, so this says what the line now
            stands at, or which Unit stopped the act and that nothing changed. */}
        {act ? (
          <div
            data-testid={`ready-stock-act-${orderLineId}`}
            className={`border-t border-kit-slate-5 px-3 py-2 text-body ${
              act.kind === "ok" ? "bg-kit-blue-3" : "bg-kit-amber-3"
            }`}
          >
            {act.kind === "ok" ? (
              <>
                <div>{`Ready Stock · ${act.reserved} Unit${act.reserved === 1 ? "" : "s"} on this item line`}</div>
                <div className="text-meta text-kit-slate-11">
                  {`${act.added} added · ${act.released} given back`}
                </div>
              </>
            ) : act.kind === "unknown" ? (
              <>
                <div>{act.sentence}</div>
                <div className="text-meta text-kit-slate-11">
                  Check the Unit IDs above before choosing again.
                </div>
              </>
            ) : (
              <>
                <div>{act.sentence}</div>
                <div className="text-meta text-kit-slate-11">
                  {act.unitCode ? `Unit ID · ${act.unitCode} · ` : ""}
                  Nothing was changed.
                </div>
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
