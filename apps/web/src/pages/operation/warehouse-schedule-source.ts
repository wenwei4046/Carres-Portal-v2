/**
 * ⏳ TEMPORARY — the seam between the Schedule UI (BUILD A) and the Schedule
 * projection (BUILD B), so the two could be built in parallel worktrees.
 *
 * **On integration this file becomes one line** — a re-export of BUILD B's
 * `./useWarehouseSchedule` — and then it is deleted and its single importer
 * points at B's hook directly.
 *
 * Until then it returns NO CARDS AND ONE ERROR. That is deliberate and it is
 * the safe direction to fail in: a fixture wired here would put invented
 * supplier names, quantities and dates on a real ERP page if this ever shipped
 * unintegrated, and the whole point of the contract is that the portal never
 * shows a number nobody recorded. An error is honest; fake work is not.
 *
 * `warehouse-schedule-source.test.ts` FAILS while this stub is in place. That
 * red test is the tripwire: the PR cannot merge until B's hook is wired in.
 */
import type {
  WarehouseScheduleInput,
  WarehouseScheduleResult,
} from "./warehouse-schedule-contract";

export function useWarehouseSchedule(input: WarehouseScheduleInput): WarehouseScheduleResult {
  return {
    cards: [],
    operatingDates: plainWindow(input.from, 6),
    loading: false,
    errors: [
      {
        direction: input.direction,
        message: "The schedule could not be read.",
      },
    ],
  };
}

/** Six consecutive dates — a placeholder window, never a governed calendar. */
function plainWindow(from: string, count: number): string[] {
  const [y, m, d] = from.split("-").map(Number);
  if (!y || !m || !d) return [];
  const p = (n: number) => String(n).padStart(2, "0");
  return Array.from({ length: count }, (_, i) => {
    const at = new Date(y, m - 1, d + i);
    return `${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())}`;
  });
}
