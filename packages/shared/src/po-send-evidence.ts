import { z } from "zod";

/** Internal-only prefix in the existing private delivery-orders bucket. */
export const poSendEvidencePathSchema = z.string().max(400).regex(/^po-send\/[^/]+\/V[1-9]\d*\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg)$/);
const noteSchema = z.object({ type: z.literal("po_send_evidence"), path: poSendEvidencePathSchema, note: z.string().optional() }).strict();
export function poSendEvidenceNote(path: string, note?: string): string {
  return JSON.stringify(noteSchema.parse({ type: "po_send_evidence", path, ...(note ? { note } : {}) }));
}
export function readPoSendEvidence(note: string | null | undefined): z.infer<typeof noteSchema> | null {
  try { const parsed = noteSchema.safeParse(JSON.parse(note ?? "")); return parsed.success ? parsed.data : null; } catch { return null; }
}
