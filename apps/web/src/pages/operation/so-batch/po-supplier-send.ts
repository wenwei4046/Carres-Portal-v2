/**
 * THE SUPPLIER SEND OPERATIONS — one implementation, two presentations.
 *
 * `PoSupplierBundle` (the issued-result area) and `BatchPanel` (a Tasks
 * working panel) send the same POs through the same doors, so the reads, the
 * Email dispatch with its unknown-outcome guard and the evidence writes live
 * here once. Nothing here holds React state; each presentation keeps its own.
 *
 *   documents   `print-data` per PO, validated; a missing Supplier Deliver To
 *               address names itself and blocks only that PO's PDF.
 *   history     `sends` per PO, plus the server's Email attempts when Email is
 *               configured (a lost response is recovered, never re-sent).
 *   Email       the attempt is reserved in sessionStorage BEFORE dispatch, so
 *               a reload cannot forget an unknown outcome. A definite refusal
 *               releases it; anything else stays `unknown` and blocks resend.
 *   record      `confirm-sent` per PO and version — `PO sent to supplier`.
 */
import { SO_BATCH_PANEL_WORDS } from "@carres/shared";
import { ApiError, apiFetch } from "@/lib/api";
import { renderPoPdf } from "@/lib/pdf/render";
import type { PoTemplateData } from "@/lib/pdf/types";
import { preparePoBundle, poBundleDocumentList, type PreparedPoDocument } from "@/lib/purchasing/po-bundle";
import type { IssuedPo, PoSendEvidence } from "../components/PoIssueEvidence";

export type EmailAttempt = {
  id: string;
  status: "unknown" | "dispatched";
  providerId?: string;
  recipient: string;
  documents: Array<{ id: string; version: number; recorded: boolean }>;
  /** Who started the send and when — kept for an unknown or failed outcome so
   *  the Timeline can name them; never invented (absent until recorded). */
  actorName?: string;
  at?: string;
};

/** A failed attempt as the server recorded it: who, when, which POs. */
export type FailedEmailAttempt = Omit<EmailAttempt, "status" | "providerId"> & { status: "failed" };

export const emailAttemptsKeyOf = (userId: string) => `carres-po-email-attempts:${userId}`;

export function readEmailAttempts(key: string): EmailAttempt[] {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(key) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((attempt): attempt is EmailAttempt => Boolean(attempt) && typeof attempt.id === "string" &&
      (attempt.status === "unknown" || attempt.status === "dispatched") && typeof attempt.recipient === "string" &&
      (attempt.providerId === undefined || typeof attempt.providerId === "string") && Array.isArray(attempt.documents) &&
      attempt.documents.every((document: { id?: unknown; version?: unknown; recorded?: unknown }) =>
        typeof document.id === "string" && typeof document.version === "number" && Number.isInteger(document.version) && document.version > 0 && typeof document.recorded === "boolean"));
  } catch { return []; }
}

/** The current document of one issued PO, refused when it is not that PO's. */
export async function loadPoDocument(po: Pick<IssuedPo, "id">): Promise<PoTemplateData> {
  const document = await apiFetch<PoTemplateData>(`/api/operation/pos/${encodeURIComponent(po.id)}/print-data`);
  if (document.draft || document.po_id !== po.id || typeof document.po_number !== "string" || !document.po_number.trim()
    || !Number.isInteger(document.version) || document.version < 1) throw new Error("invalid_po_document");
  return document;
}

/** Why one PO's PDF could not be read. Only an address names a Settings door. */
export function documentFailureOf(po: Pick<IssuedPo, "id" | "destination">, reason: unknown): { id: string; message: string; settings?: boolean } {
  if (reason instanceof ApiError && (reason.body as { code?: string } | null)?.code === "destination_address_missing") {
    return { id: po.id, message: SO_BATCH_PANEL_WORDS.deliverToAddressMissing(po.destination ?? "Not recorded"), settings: true };
  }
  return { id: po.id, message: "Could not be loaded" };
}

/** One PO's send history and, when Email is configured, its recorded attempts. */
export async function loadPoSendFacts(po: Pick<IssuedPo, "id">, emailConfigured: boolean) {
  const result = await apiFetch<{ sends: PoSendEvidence[] }>(`/api/operation/pos/${encodeURIComponent(po.id)}/sends`);
  if (!Array.isArray(result.sends)) throw new Error("invalid_send_history");
  const recovery = emailConfigured
    ? await apiFetch<{ attempts: Array<Omit<EmailAttempt, "status"> & { status: EmailAttempt["status"] | "failed" }> }>(`/api/operation/pos/${encodeURIComponent(po.id)}/email-attempts`)
    : { attempts: [] };
  const failedRecords = recovery.attempts.filter((attempt): attempt is FailedEmailAttempt => attempt.status === "failed");
  const failed = failedRecords.map((attempt) => attempt.id);
  const attempts = recovery.attempts.filter((attempt): attempt is EmailAttempt => attempt.status !== "failed").map((attempt) => ({ ...attempt,
    documents: attempt.documents.map((document) => ({ ...document,
      recorded: result.sends.some((event) => event.kind === "confirmed_sent" && event.po_version === document.version && event.note?.includes(`po-email/${attempt.id}`)) })) }));
  return { sends: result.sends, attempts, failed, failedRecords };
}

/** Recovered attempts join the ones this browser reserved; a failed one leaves. */
export function mergeEmailAttempts(previous: readonly EmailAttempt[], restored: readonly EmailAttempt[], failedIds: ReadonlySet<string>): EmailAttempt[] {
  const merged = new Map(previous.filter((attempt) => !failedIds.has(attempt.id)).map((attempt) => [attempt.id, attempt]));
  for (const attempt of restored) {
    const existing = merged.get(attempt.id);
    const documents = new Map((existing?.documents ?? []).map((document) => [document.id, document]));
    for (const document of attempt.documents) documents.set(document.id, document);
    merged.set(attempt.id, { ...attempt, documents: [...documents.values()] });
  }
  return [...merged.values()];
}

/** The message lists exactly these POs and versions. */
export const poListMessage = (documents: ReadonlyArray<Pick<PoTemplateData, "po_number" | "version">>) =>
  documents.map((document) => `${document.po_number} · V${document.version}`).join("\n");

export class SupplierEmailFailure extends Error {
  constructor(public readonly definite: boolean, public readonly stale: boolean) { super(stale ? "stale_po_version" : "email_not_confirmed"); }
}

/**
 * Send one supplier's selected POs by Email. Each PDF is its own attachment.
 * `onReserved` receives the attempt list once the unknown attempt is stored;
 * the dispatched attempt is returned. A definite refusal throws with
 * `definite` (the caller releases the attempt); any other failure leaves it
 * unknown, and the caller blocks a second send until the record is checked.
 */
export async function dispatchSupplierEmail(input: {
  supplierId: string;
  picked: ReadonlyArray<{ id: string; supplierId: string; version: number }>;
  expectedMessage: string;
  recipient: string;
  subject: string;
  message: string;
  resend: boolean;
  attemptsKey: string;
  attempts: readonly EmailAttempt[];
  onReserved: (attempts: EmailAttempt[]) => void;
}): Promise<{ attemptId: string; providerId: string; documents: EmailAttempt["documents"] }> {
  const attemptId = crypto.randomUUID();
  try {
    let prepared: PreparedPoDocument[];
    try {
      prepared = await preparePoBundle(input.supplierId, input.picked, (id) => apiFetch<PoTemplateData>(`/api/operation/pos/${encodeURIComponent(id)}/print-data`), renderPoPdf);
    } catch (cause) {
      throw cause instanceof Error && cause.message === "stale_po_version" ? new SupplierEmailFailure(true, true) : cause;
    }
    if (poBundleDocumentList(prepared) !== input.expectedMessage) throw new SupplierEmailFailure(true, true);
    const files = await Promise.all(prepared.map(async (po) => {
      const bytes = new Uint8Array(await po.pdf.arrayBuffer());
      let binary = "";
      for (let start = 0; start < bytes.length; start += 8192) binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
      return { id: po.id, version: po.version, filename: po.filename, content: btoa(binary) };
    }));
    // Metadata only, no PDF bytes or credentials. A reload cannot silently forget an unknown send.
    const reserved: EmailAttempt = { id: attemptId, status: "unknown", recipient: input.recipient, at: new Date().toISOString(),
      documents: files.map(({ id, version }) => ({ id, version, recorded: false })) };
    const attempts = [...input.attempts, reserved];
    sessionStorage.setItem(input.attemptsKey, JSON.stringify(attempts));
    input.onReserved(attempts);
    const result = await apiFetch<{ status: "dispatched"; providerId: string; documents: EmailAttempt["documents"] }>("/api/operation/pos/supplier-email", {
      method: "POST", body: JSON.stringify({ supplierId: input.supplierId, recipient: input.recipient, subject: input.subject,
        message: input.message, attemptId, documents: files, resend: input.resend }),
    });
    if (result.status !== "dispatched") throw new SupplierEmailFailure(false, false);
    return { attemptId, providerId: result.providerId, documents: result.documents };
  } catch (failure) {
    if (failure instanceof SupplierEmailFailure) { (failure as { attemptId?: string }).attemptId = attemptId; throw failure; }
    const definite = failure instanceof ApiError && ([403, 409, 422, 503].includes(failure.status) ||
      (failure.body as { code?: unknown } | null)?.code === "email_failed");
    const error = new SupplierEmailFailure(definite, false);
    (error as { attemptId?: string }).attemptId = attemptId;
    throw error;
  }
}

/** Save the evidence a dispatched Email has not yet recorded — never a second Email. */
export async function recordEmailEvidence(attempt: EmailAttempt): Promise<EmailAttempt["documents"]> {
  if (!attempt.providerId) return attempt.documents;
  return Promise.all(attempt.documents.map(async (document) => {
    if (document.recorded) return document;
    try {
      await apiFetch(`/api/operation/pos/${encodeURIComponent(document.id)}/confirm-sent`, { method: "POST", body: JSON.stringify({
        channel: "email", recipient: attempt.recipient, poVersion: document.version, note: `Email dispatch ${attempt.providerId}; po-email/${attempt.id}`,
      }) });
      return { ...document, recorded: true };
    } catch { return document; }
  }));
}

/** `PO sent to supplier` for one PO at the version staff looked at. */
export async function confirmPoSent(poId: string, version: number, channel: "whatsapp" | "email", recipient: string): Promise<void> {
  await apiFetch(`/api/operation/pos/${encodeURIComponent(poId)}/confirm-sent`, {
    method: "POST", body: JSON.stringify({ channel, recipient, poVersion: version }),
  });
}
