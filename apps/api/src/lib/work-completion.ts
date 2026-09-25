/**
 * ⭐ THE COMPLETED WRITER (0584 · owner rulings, Jess 2026-09-24).
 *
 * Only the owning module's completion fact produces `completed`; Work never
 * marks anything done. Each module supplies ONE spec per object kind:
 *
 *   probe       this object's Work occurrences — the same projector the Work
 *               feed runs, over this ONE object (never the whole feed), each on
 *               its current occurrence identity
 *   readFacts   the module's own completion facts for this object
 *   result      the module result that closed a rule, or null while it does not
 *
 * HOW A COMPLETION IS PROVEN — one arithmetic, no second admission rule:
 *   1. BEFORE the module's write, probe each object the write is about and keep
 *      the open occurrences of the rules THIS door can complete.
 *   2. The module's door performs ITS write. A refused write records nothing.
 *   3. AFTER it, probe again. An occurrence that was open and is now gone, AND
 *      whose module fact now holds, is completed — by the person who performed
 *      the write, at that moment, with the Work date and document it had.
 * Anything unknown records NOTHING and says so in the log: a missing
 * Completed row is honest, a guessed one is not. A recorder failure never
 * undoes the module write the operator already made.
 */
import type { Context, MiddlewareHandler } from "hono";
import type { OperationWorkItem } from "@carres/shared";
import type { AppEnv } from "../types";
import { adminClient } from "./supabase";

export interface WorkCompletionSpec<F = unknown> {
  /** For logs: `Sales Orders`, `Purchasing`. */
  owner: string;
  /** The rules this spec's module completes. */
  rules: readonly string[];
  probe: (c: Context<AppEnv>, objectId: string) => Promise<OperationWorkItem[] | null>;
  /** `since` = when the write began: a fact recorded earlier is not this write's. */
  readFacts: (c: Context<AppEnv>, objectId: string, since: string) => Promise<F>;
  result: (ruleKey: string, facts: F) => string | null;
}

export interface WorkCompletionTarget {
  spec: WorkCompletionSpec<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  objectIds: readonly string[];
}

export interface OpenOccurrence {
  occurrenceId: string;
  ruleKey: string;
  objectId: string;
  /** The original Work date (null = No working date). */
  actionOn: string | null;
  /** The document reference, `SO-1318`. */
  objectLabel: string;
  sourceVersion: string;
}

export interface CompletedWrite {
  occurrenceId: string;
  actorId: string;
  at: string;
  actionOn: string | null;
  objectLabel: string;
  resultReference: string;
  sourceVersion: string;
  idempotencyKey: string;
}

export interface WorkCompletionDeps {
  recordCompleted: (c: Context<AppEnv>, write: CompletedWrite) => Promise<void>;
  now: () => string;
  log: (message: string, detail: Record<string, unknown>) => void;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** One object's open occurrences of the given rules. */
export function openOccurrencesOf(
  items: readonly OperationWorkItem[],
  objectId: string,
  rules: readonly string[],
): OpenOccurrence[] {
  return items
    .filter((item) => item.object.id === objectId && rules.includes(item.ruleKey))
    .map((item) => ({
      occurrenceId: item.id,
      ruleKey: item.ruleKey,
      objectId,
      actionOn: item.timing.actionOn,
      objectLabel: item.object.label,
      sourceVersion: item.sourceVersion,
    }));
}

async function probeAll(
  c: Context<AppEnv>,
  targets: readonly WorkCompletionTarget[],
  deps: WorkCompletionDeps,
  stage: "before" | "after",
): Promise<Map<WorkCompletionTarget, OpenOccurrence[]> | null> {
  const out = new Map<WorkCompletionTarget, OpenOccurrence[]>();
  for (const target of targets) {
    const found: OpenOccurrence[] = [];
    for (const objectId of target.objectIds) {
      try {
        found.push(...openOccurrencesOf((await target.spec.probe(c, objectId)) ?? [], objectId, target.spec.rules));
      } catch (error) {
        deps.log("work completion unknown: the object's Work could not be read", {
          owner: target.spec.owner, objectId, stage, error: errorText(error),
        });
        return null;
      }
    }
    out.set(target, found);
  }
  return out;
}

/** Wrap one module door; its Response is returned unchanged. */
export async function withWorkCompletion(
  c: Context<AppEnv>,
  targets: readonly WorkCompletionTarget[],
  write: () => Promise<Response>,
  deps: WorkCompletionDeps,
): Promise<Response> {
  const since = deps.now();
  const before = await probeAll(c, targets, deps, "before");
  const response = await write();
  const opened = before ? [...before.values()].flat() : [];
  if (!response.ok || !before || opened.length === 0) return response;

  const after = await probeAll(c, targets, deps, "after");
  if (!after) return response;

  for (const target of targets) {
    const stillOpen = new Set((after.get(target) ?? []).map((o) => o.occurrenceId));
    const closed = (before.get(target) ?? []).filter((o) => !stillOpen.has(o.occurrenceId));
    const factsByObject = new Map<string, unknown>();
    for (const occurrence of closed) {
      let facts = factsByObject.get(occurrence.objectId);
      if (facts === undefined) {
        try {
          facts = await target.spec.readFacts(c, occurrence.objectId, since);
          factsByObject.set(occurrence.objectId, facts);
        } catch (error) {
          deps.log("work completion unknown: the module facts could not be read", {
            owner: target.spec.owner, objectId: occurrence.objectId, error: errorText(error),
          });
          continue;
        }
      }
      const result = target.spec.result(occurrence.ruleKey, facts);
      if (!result) {
        // It left Work for a reason that is not this module's result (the order
        // was cancelled, the goods became ready): that is not a completion.
        deps.log("work left without its completion fact: not recorded as completed", {
          owner: target.spec.owner, occurrenceId: occurrence.occurrenceId,
        });
        continue;
      }
      try {
        await deps.recordCompleted(c, {
          occurrenceId: occurrence.occurrenceId,
          actorId: c.var.auth.id,
          at: deps.now(),
          actionOn: occurrence.actionOn,
          objectLabel: occurrence.objectLabel,
          resultReference: result,
          sourceVersion: occurrence.sourceVersion,
          idempotencyKey: `completed:${occurrence.occurrenceId}`,
        });
      } catch (error) {
        deps.log("work completion could not be recorded", {
          owner: target.spec.owner, occurrenceId: occurrence.occurrenceId, error: errorText(error),
        });
      }
    }
  }
  return response;
}

/** The 0584 completion door — the service role only. Replays are idempotent. */
export async function recordWorkCompleted(c: Context<AppEnv>, write: CompletedWrite): Promise<void> {
  const { error } = await adminClient(c.env).rpc("work_record_completed", {
    p_occurrence_id: write.occurrenceId,
    p_actor_id: write.actorId,
    p_at: write.at,
    p_action_on: write.actionOn,
    p_object_label: write.objectLabel,
    p_result_reference: write.resultReference,
    p_source_version: write.sourceVersion,
    p_idempotency_key: write.idempotencyKey,
  });
  if (error) throw new Error(`${error.details ?? error.code ?? ""} ${error.message}`.trim());
}

export function workCompletionDeps(): WorkCompletionDeps {
  return {
    recordCompleted: recordWorkCompleted,
    now: () => new Date().toISOString(),
    log: (message, detail) => console.warn(`[work completion] ${message}`, detail),
  };
}

/**
 * The writer as a middleware in front of a module door, so the door's own
 * handler is not touched. `targets` names what the write is about (an empty
 * list observes nothing); `when` skips every probe for a write that cannot
 * touch a completion fact.
 */
export function workCompletion(
  opts: {
    targets: (c: Context<AppEnv>) => readonly WorkCompletionTarget[] | Promise<readonly WorkCompletionTarget[]>;
    when?: (c: Context<AppEnv>) => boolean | Promise<boolean>;
  },
  deps: () => WorkCompletionDeps = workCompletionDeps,
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (opts.when && !(await opts.when(c))) {
      await next();
      return;
    }
    let targets: readonly WorkCompletionTarget[];
    try {
      targets = (await opts.targets(c)).filter((t) => t.objectIds.length > 0);
    } catch (error) {
      console.warn("[work completion] work completion unknown: the write's objects could not be named", {
        error: errorText(error),
      });
      targets = [];
    }
    if (targets.length === 0) {
      await next();
      return;
    }
    await withWorkCompletion(c, targets, async () => {
      await next();
      return c.res;
    }, deps());
  };
}
