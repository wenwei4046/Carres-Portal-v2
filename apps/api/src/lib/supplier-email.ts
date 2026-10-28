/** Adapted from Houzs's human-triggered PDF email pattern. No attachmentless fallback/replay. */
export interface SupplierEmailAttachment {
  filename: string;
  content: string;
}
export interface SupplierEmailPayload {
  recipient: string;
  subject: string;
  message: string;
  attachments: readonly SupplierEmailAttachment[];
  /** Persist/reuse this key for retries of the same confirmed operation. */
  attemptKey: string;
}
export type SupplierEmailResult =
  | { status: "dispatched"; providerId: string }
  | { status: "not_configured" | "invalid_payload" | "failed" | "unknown" };

const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const FILE_CAP = 5 * 1024 * 1024;
const TOTAL_CAP = 20 * 1024 * 1024;

export function validPoEmailAttachments(attachments: readonly SupplierEmailAttachment[]): boolean {
  if (!attachments.length || attachments.length > 25) return false;
  if (new Set(attachments.map(file => file.filename)).size !== attachments.length) return false;
  let total = 0;
  for (const file of attachments) {
    if (!/^[a-zA-Z0-9._-]+\.pdf$/.test(file.filename) || !file.content || file.content.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(file.content)) return false;
    const bytes = file.content.length * 3 / 4 - (file.content.endsWith("==") ? 2 : file.content.endsWith("=") ? 1 : 0);
    if (bytes < 1024 || bytes > FILE_CAP) return false;
    total += bytes;
    if (total > TOTAL_CAP) return false;
    // Reject an HTML/error payload disguised by its filename or MIME type.
    try { if (!atob(file.content.slice(0, 12)).startsWith("%PDF-")) return false; }
    catch { return false; }
  }
  return true;
}

/** Success is provider dispatch, never receipt. A transport exception has an unknown outcome. */
export async function sendSupplierPoEmail(
  config: { apiKey?: string; from?: string },
  payload: SupplierEmailPayload,
  transport: typeof fetch = fetch,
): Promise<SupplierEmailResult> {
  if (!config.apiKey || !config.from || !EMAIL.test(config.from.trim())) return { status: "not_configured" };
  if (!EMAIL.test(payload.recipient.trim()) || !payload.subject.trim() || payload.subject.length > 200 ||
    payload.message.length > 20_000 || !/^[a-zA-Z0-9/_-]{1,200}$/.test(payload.attemptKey) ||
    !validPoEmailAttachments(payload.attachments)) return { status: "invalid_payload" };
  try {
    const response = await transport("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": payload.attemptKey },
      body: JSON.stringify({ from: config.from.trim(), to: [payload.recipient.trim()], subject: payload.subject,
        text: payload.message, attachments: payload.attachments }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return { status: response.status >= 500 ? "unknown" : "failed" };
    const result = await response.json() as { id?: unknown };
    return typeof result.id === "string" && result.id.length > 0
      ? { status: "dispatched", providerId: result.id } : { status: "unknown" };
  } catch {
    // Never log recipient, attachment bytes or provider credentials; never claim not sent.
    return { status: "unknown" };
  }
}
