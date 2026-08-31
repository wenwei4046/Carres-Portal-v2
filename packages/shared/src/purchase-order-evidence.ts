export type SupplierAnswerChannel = "whatsapp" | "email" | "phone" | "in_person";

export interface SupplierAnswerEvidenceInput {
  answer: "same_as_po" | "changed_date";
  poDeliveryDate: string;
  supplierDeliveryDate: string;
  channel: SupplierAnswerChannel;
  evidencePath?: string;
  evidenceNote?: string;
  supplierAnsweredAt: string;
  reportedByUserId: string;
  reason?: string;
  remarks?: string;
}

export type SupplierAnswerEvidence =
  | { kind: "file"; path: string }
  | { kind: "note"; note: string };

export interface ValidSupplierAnswerEvidence {
  answer: SupplierAnswerEvidenceInput["answer"];
  poDeliveryDate: string;
  supplierDeliveryDate: string;
  channel: SupplierAnswerChannel;
  evidence: SupplierAnswerEvidence;
  supplierAnsweredAt: string;
  reportedByUserId: string;
  reason?: string;
  remarks?: string;
}

function required(value: string | undefined, error: string): string {
  const clean = value?.trim();
  if (!clean) throw new Error(error);
  return clean;
}

export function validateSupplierAnswerEvidence(
  input: SupplierAnswerEvidenceInput,
): ValidSupplierAnswerEvidence {
  const poDeliveryDate = required(input.poDeliveryDate, "po_delivery_date_required");
  const supplierDeliveryDate = required(
    input.supplierDeliveryDate,
    "supplier_delivery_date_required",
  );
  const supplierAnsweredAt = required(
    input.supplierAnsweredAt,
    "supplier_answered_at_required",
  );
  const reportedByUserId = required(input.reportedByUserId, "reported_by_required");

  if (input.answer === "same_as_po" && supplierDeliveryDate !== poDeliveryDate) {
    throw new Error("same_as_po_mismatch");
  }
  if (input.answer === "changed_date" && supplierDeliveryDate === poDeliveryDate) {
    throw new Error("changed_date_mismatch");
  }

  const reason = input.reason?.trim() || undefined;
  if (input.answer === "changed_date" && !reason) throw new Error("reason_required");

  const evidence: SupplierAnswerEvidence = input.channel === "whatsapp" || input.channel === "email"
    ? { kind: "file", path: required(input.evidencePath, "evidence_required") }
    : { kind: "note", note: required(input.evidenceNote, "evidence_required") };

  return {
    answer: input.answer,
    poDeliveryDate,
    supplierDeliveryDate,
    channel: input.channel,
    evidence,
    supplierAnsweredAt,
    reportedByUserId,
    reason,
    remarks: input.remarks?.trim() || undefined,
  };
}
