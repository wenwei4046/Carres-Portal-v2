/**
 * ⭐ A READ FAILURE HAS THREE FACES, AND A PERMISSION REFUSAL NEVER OFFERS
 * `Try again` — owner ruling 2026-09-26 (Orders MASTER).
 *
 * Measured on production 2026-09-25: the object page printed the raw transport
 * `error.message` under `This sales order could not be opened`, and a 403 wore
 * the same sentence with a retry that can never succeed.
 *
 * ONE translator answers every read failure:
 *   refused     403 — the reader may not see it. The way back, no retry.
 *   not-found   404 or an invalid parameter — no such record. The way back.
 *   failed      anything else — the surface's own sentence, and `Try again`.
 * A transport message never reaches the screen: this function reads the status
 * and nothing else.
 */
export type ReadFailureSurface =
  | "sales-orders-register"
  | "sales-order"
  | "revisions"
  | "history"
  | "order-route";

export interface ReadFailureWords {
  face: "refused" | "not-found" | "failed";
  title: string;
  detail: string | null;
  /** `back` opens the Sales Orders Register; `retry` reads again. */
  action: "back" | "retry";
}

const FAILED: Record<ReadFailureSurface, string> = {
  "sales-orders-register": "Sales orders could not be loaded",
  "sales-order": "This sales order could not be opened",
  revisions: "These revisions could not be opened",
  history: "This history could not be opened",
  "order-route": "This order route could not be opened",
};

const statusOf = (error: unknown): number | null => {
  if (!error || typeof error !== "object") return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
};

export function readFailureWords(error: unknown, surface: ReadFailureSurface): ReadFailureWords {
  const status = statusOf(error);
  if (status === 403) {
    return {
      face: "refused",
      title: surface === "sales-orders-register" ? "You cannot view sales orders" : "You cannot view this record",
      detail: "Ask an authorised operation user for access.",
      action: "back",
    };
  }
  if (status === 404 || status === 400 || status === 422) {
    return { face: "not-found", title: "Sales Order not found.", detail: null, action: "back" };
  }
  return { face: "failed", title: FAILED[surface], detail: null, action: "retry" };
}
