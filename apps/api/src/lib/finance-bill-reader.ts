import {
  BILL_READER_PROMPT,
  cleanBillReading,
  parseModelJson,
  type BillReadInput,
  type BillReading,
} from "@carres/shared/bill-reading";

/**
 * Finance → read a supplier's bill with Claude (Finance MASTER §3.2 "Bill
 * scanning", Chew 2026-10-03). One call per bill; the bill's files are its
 * pages. Nothing is written: the answer only pre-fills a form.
 *
 * The key is a Worker secret Chew gives later (`wrangler secret put
 * ANTHROPIC_API_KEY`). Without it the feature is OFF and the route answers
 * 503 bill_reader_not_set_up — the Stripe pattern (lib/stripe.ts). The model
 * may be changed with the `BILL_READER_MODEL` variable without a deploy of code.
 *
 * Read through a local type, so the shared Worker bindings (types.ts) are not
 * changed for a Finance-only setting.
 */
type ReaderEnv = { ANTHROPIC_API_KEY?: string; BILL_READER_MODEL?: string };

export const BILL_READER_DEFAULT_MODEL = "claude-sonnet-5-5";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const TIMEOUT_MS = 90_000;

export function billReaderKey(env: unknown): string | null {
  const key = (env as ReaderEnv | undefined)?.ANTHROPIC_API_KEY;
  return typeof key === "string" && key.trim() !== "" ? key.trim() : null;
}

export function billReaderModel(env: unknown): string {
  const model = (env as ReaderEnv | undefined)?.BILL_READER_MODEL;
  return typeof model === "string" && model.trim() !== "" ? model.trim() : BILL_READER_DEFAULT_MODEL;
}

export type BillReadResult =
  | { ok: true; reading: BillReading }
  | { ok: false; why: "refused" | "failed" | "timeout" | "unreadable" };

/** The Messages API body: every page first, then the instruction. */
export function billReaderRequest(model: string, files: BillReadInput["files"]) {
  return {
    model,
    max_tokens: 8000,
    messages: [{
      role: "user",
      content: [
        ...files.map((f) => f.mime === "application/pdf"
          ? { type: "document", source: { type: "base64", media_type: f.mime, data: f.dataBase64 } }
          : { type: "image", source: { type: "base64", media_type: f.mime, data: f.dataBase64 } }),
        { type: "text", text: BILL_READER_PROMPT },
      ],
    }],
  };
}

export async function readBillWithModel(opts: {
  key: string;
  model: string;
  files: BillReadInput["files"];
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<BillReadResult> {
  const doFetch = opts.fetchImpl ?? fetch;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), opts.timeoutMs ?? TIMEOUT_MS);
  let res: Response;
  try {
    res = await doFetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": opts.key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(billReaderRequest(opts.model, opts.files)),
      signal: abort.signal,
    });
  } catch (e) {
    return { ok: false, why: (e as { name?: string })?.name === "AbortError" ? "timeout" : "failed" };
  } finally {
    clearTimeout(timer);
  }
  // 400 is the service refusing these pages (too large, not a document); any
  // other failure is the service, never the bill.
  if (!res.ok) return { ok: false, why: res.status === 400 ? "refused" : "failed" };
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, why: "failed" };
  }
  const content = (body as { content?: Array<{ type?: string; text?: string }> } | null)?.content ?? [];
  const text = content.filter((b) => b?.type === "text" && typeof b.text === "string").map((b) => b.text).join("\n");
  const reading = cleanBillReading(parseModelJson(text));
  return reading ? { ok: true, reading } : { ok: false, why: "unreadable" };
}
