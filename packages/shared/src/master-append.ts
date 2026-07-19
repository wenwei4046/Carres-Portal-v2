import { z } from "zod";

import { splitPoKeys } from "./stock-eta-import";

/**
 * Master append — "sheet has it, portal doesn't" reconcile (Jess Option A,
 * 2026-07-18). After a Master import, an EXISTING AutoCount order can be
 * missing a line the sheet carries (0214 made re-import create-only, so the
 * importer never adds it). This module is the pure detector the import screen
 * + the server endpoint share: given the sheet's order rows and the portal's
 * AutoCount orders (with their lines), list the rows whose PO appears nowhere
 * on their order — the append candidates.
 *
 * The DANGEROUS twin of a missing line is a CHANGED line (customer swapped
 * sofa model → AutoCount re-raised the PO → the portal, created from a newer
 * export, has the replacement; the stale sheet row is NOT a second sofa).
 * Discriminator (`clean`): a candidate is safe to default-tick ONLY when every
 * portal line on that order is also present in the sheet (all its POs
 * accounted for). If the portal holds a line the sheet doesn't know,
 * both sides have diverged — the operator must eyeball it (default UNticked,
 * the portal's unaccounted lines are surfaced beside the row).
 */

// ---------------------------------------------------------------------------
// Ref key — mirrors the import door's normalizeRefs (apps/api orders.ts): a
// combined Ref splits on / + , & into a sorted uniq token set, so
// "CR0925 + TCF0394" and "TCF0394+CR0925" group identically and compare
// against orders.source_ref[] (stored sorted).
// ---------------------------------------------------------------------------
export function normalizeRefTokens(ref: string): string[] {
  return Array.from(
    new Set(
      ref
        .split(/[/+,&]/)
        .map((r) => r.trim().toUpperCase())
        .filter((r) => r.length > 0),
    ),
  ).sort();
}

export interface MasterAppendRow {
  /** The Master "Ref" cell (possibly combined). */
  ref: string;
  /** The Master "Item Group" (Mattress / Bed Fram / Sofa / …). */
  itemGroup: string;
  qty: number;
  /** The Master "Item Detail" — becomes the appended line's sku (raw). */
  detail: string;
  /** The Master "PO" cell (may list several). */
  po: string;
}

export interface AppendOrderRef {
  id: string;
  so: number;
  /** orders.source_ref (canonical sorted token array). */
  sourceRef: string[];
  lines: { sku: string; sourcePo: string | null }[];
}

export interface MissingLineCandidate {
  orderId: string;
  so: number;
  ref: string;
  detail: string;
  itemGroup: string;
  qty: number;
  po: string;
  /** True = every portal line is accounted for in the sheet → safe default-tick.
   *  False = the portal holds line(s) the sheet doesn't carry (model change /
   *  re-raised PO / lost PO) → default UNticked, operator decides. */
  clean: boolean;
  /** Portal lines on this order whose PO no sheet row carries (the divergence
   *  that made the candidate un-clean; shown beside the row). */
  portalUnaccounted: { sku: string; sourcePo: string | null }[];
}

/**
 * Detect the append candidates. Pure — unit-tested without a DB.
 *
 * Order resolution: exact source_ref set equality first; else the order with
 * the highest ref-token overlap (ties broken by closest cardinality; an
 * unresolved tie is skipped — never guess between two orders).
 */
export function detectMissingLines(
  rows: MasterAppendRow[],
  orders: AppendOrderRef[],
): MissingLineCandidate[] {
  const byExact = new Map<string, AppendOrderRef>();
  for (const o of orders) {
    byExact.set([...o.sourceRef].map((r) => r.trim().toUpperCase()).sort().join("|"), o);
  }

  const resolve = (tokens: string[]): AppendOrderRef | null => {
    const exact = byExact.get(tokens.join("|"));
    if (exact) return exact;
    let best: { o: AppendOrderRef; overlap: number; card: number } | null = null;
    let tied = false;
    for (const o of orders) {
      const refs = o.sourceRef.map((r) => r.trim().toUpperCase());
      const overlap = refs.filter((r) => tokens.includes(r)).length;
      if (overlap === 0) continue;
      const card = Math.abs(refs.length - tokens.length);
      if (!best || overlap > best.overlap || (overlap === best.overlap && card < best.card)) {
        tied = !!best && overlap === best.overlap && card === best.card;
        best = { o, overlap, card };
      } else if (overlap === best.overlap && card === best.card && o !== best.o) {
        tied = true;
      }
    }
    return best && !tied ? best.o : null;
  };

  // Group sheet rows per resolved order.
  const groups = new Map<string, { order: AppendOrderRef; rows: MasterAppendRow[] }>();
  for (const r of rows) {
    const tokens = normalizeRefTokens(r.ref);
    if (tokens.length === 0) continue;
    const order = resolve(tokens);
    if (!order) continue;
    const g = groups.get(order.id) ?? { order, rows: [] };
    g.rows.push(r);
    groups.set(order.id, g);
  }

  const out: MissingLineCandidate[] = [];
  for (const { order, rows: groupRows } of groups.values()) {
    const linePoKeys = new Set<string>();
    for (const l of order.lines) for (const k of splitPoKeys(l.sourcePo)) linePoKeys.add(k);
    const sheetPoKeys = new Set<string>();
    for (const r of groupRows) for (const k of splitPoKeys(r.po)) sheetPoKeys.add(k);

    const missing = groupRows.filter((r) => {
      const keys = splitPoKeys(r.po);
      if (keys.length === 0) return false; // PO-less rows can't be safely compared
      return keys.every((k) => !linePoKeys.has(k));
    });
    if (missing.length === 0) continue;

    // Portal lines the sheet doesn't carry (incl. PO-less portal lines — they
    // are unverifiable, so they always count as divergence).
    const portalUnaccounted = order.lines.filter((l) => {
      const keys = splitPoKeys(l.sourcePo);
      if (keys.length === 0) return true;
      return keys.every((k) => !sheetPoKeys.has(k));
    });
    const clean = portalUnaccounted.length === 0;

    for (const r of missing) {
      out.push({
        orderId: order.id,
        so: order.so,
        ref: r.ref,
        detail: r.detail,
        itemGroup: r.itemGroup,
        qty: r.qty,
        po: r.po,
        clean,
        portalUnaccounted,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Server zod — re-validates the rows the client mapper produced.
// ---------------------------------------------------------------------------

export const masterAppendRowSchema = z
  .object({
    ref: z.string().trim().min(1).max(120),
    itemGroup: z.string().trim().max(60).default(""),
    qty: z.number().int().min(1).max(999),
    detail: z.string().trim().min(1).max(200),
    po: z.string().trim().max(120).default(""),
  })
  .strict();
export type MasterAppendRowParsed = z.infer<typeof masterAppendRowSchema>;

export const appendMissingLinesInput = z
  .object({
    rows: z.array(masterAppendRowSchema).min(1).max(2000),
    /** Preview only — detect + return candidates, write nothing. */
    dryRun: z.boolean().optional(),
  })
  .strict();
export type AppendMissingLinesInput = z.infer<typeof appendMissingLinesInput>;

export interface AppendMissingLinesResult {
  candidates: MissingLineCandidate[];
  /** Lines actually appended (0 on a dry run). */
  appended: number;
  /** Distinct orders appended to (0 on a dry run). */
  orders: number;
  dryRun: boolean;
}
