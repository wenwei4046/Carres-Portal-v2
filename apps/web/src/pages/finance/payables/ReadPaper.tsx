import { useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BILL_READ_MAX_BYTES,
  BILL_READ_MAX_FILES,
  BILL_READ_MIME,
  linesMatchTotal,
  type BillReadAnswer,
} from "@carres/shared/bill-reading";
import Button from "@/components/kit/Button";
import { apiFetch } from "@/lib/api";
import { uploadApFile, type ApDocKind } from "@/lib/payables-queries";
import { money, refusal } from "./payables-words";

/**
 * Read a supplier's paper (a bill or a credit note) to pre-fill the form
 * (Chew 2026-10-03, Finance MASTER §3.2 Bill scanning). The pages go to the
 * API once; what comes back fills only what the form does not have yet, and
 * the notes say what to check. Saving stays the person's act.
 */

/** A page as base64, without the `data:…;base64,` head. */
function base64Of(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(new Error(`${file.name} could not be opened.`));
    reader.readAsDataURL(file);
  });
}

/** The first reason these pages cannot be read, or null. */
export function pagesGap(files: readonly File[]): string | null {
  if (files.length === 0) return "Choose the paper to read.";
  if (files.length > BILL_READ_MAX_FILES) return `Read at most ${BILL_READ_MAX_FILES} pages at a time.`;
  for (const f of files) {
    if (!(BILL_READ_MIME as readonly string[]).includes(f.type)) return `${f.name} is not a PDF or a photo (JPEG, PNG or WebP).`;
    if (f.size > BILL_READ_MAX_BYTES) return `${f.name} is too big to read. 10 MB at most.`;
  }
  return null;
}

export async function readPaper(files: readonly File[]): Promise<BillReadAnswer> {
  const pages = await Promise.all(files.map(async (f) => ({ name: f.name.slice(-200), mime: f.type, dataBase64: await base64Of(f) })));
  return apiFetch<BillReadAnswer>("/api/finance/payables/read-bill", { method: "POST", body: JSON.stringify({ files: pages }) });
}

/** The words under the form after a reading: what was read, and what to check. */
export function readPaperNotes(answer: BillReadAnswer, o: {
  pages: number;
  /** The paper this form is for. */
  expect: "bill" | "credit_note";
  /** The form already had lines, so the read lines were not used. */
  linesKept: boolean;
}): string[] {
  const r = answer.reading;
  const notes = [`Read from ${o.pages === 1 ? "1 page" : `${o.pages} pages`}. Check every figure before you save.`];
  if (answer.supplier?.how === "exact") notes.push(`From ${answer.supplier.name}.`);
  else if (answer.supplier) notes.push(`From ${answer.supplier.name}: the paper prints ${r.vendorName ?? "a close name"}. Check it is the same supplier.`);
  else if (r.vendorName) notes.push(`The paper names ${r.vendorName}. No supplier has that name, so choose the supplier.`);
  else notes.push("The supplier's name could not be read. Choose the supplier.");
  if (o.expect === "bill" && r.documentKind === "proforma") notes.push("It reads as a proforma invoice, not a final invoice.");
  if (o.expect === "bill" && r.documentKind === "quotation") notes.push("It reads as a quotation, not an invoice.");
  if (o.expect === "bill" && r.documentKind === "credit_note") notes.push("It reads as a credit note. A credit note is entered under Credit Notes.");
  if (o.expect === "credit_note" && r.documentKind !== null && r.documentKind !== "credit_note") notes.push("It does not read as a credit note. Check the paper.");
  if (r.currency !== null && r.currency !== "MYR") notes.push(`The paper is in ${r.currency}. Carres enters it in ringgit.`);
  if (o.linesKept) notes.push("The lines were not changed, as the form already has lines.");
  else if (r.lines.length === 0) notes.push("No item line could be read. Add the lines.");
  if (!o.linesKept) {
    for (const l of r.lines.filter((x) => x.amount < 0)) {
      notes.push(`${l.description}: ${money(-l.amount)} off was read. Take it off the lines it belongs to.`);
    }
  }
  if (r.total === null) notes.push("The total could not be read.");
  else if (!o.linesKept && linesMatchTotal(r) === false) {
    const sum = r.lines.reduce((s, l) => s + Math.round(l.amount * 100), 0) / 100;
    notes.push(`The lines come to ${money(sum)}, but the total reads ${money(r.total)}. Check the lines.`);
  }
  return notes;
}

/** A supplier's credit note often prints its amounts with a minus sign. When
 *  every line (and the total) reads below zero, the credit is read as it is
 *  meant: the same amounts, above zero. Mixed signs are left as read. */
export function asCredit(answer: BillReadAnswer): BillReadAnswer {
  const r = answer.reading;
  const allBelow = r.lines.length > 0 && r.lines.every((l) => l.amount < 0) && (r.total === null || r.total <= 0);
  const totalBelow = r.lines.length === 0 && r.total !== null && r.total < 0;
  if (!allBelow && !totalBelow) return answer;
  return {
    ...answer,
    reading: { ...r, total: r.total === null ? null : -r.total, lines: r.lines.map((l) => ({ ...l, amount: -l.amount })) },
  };
}

/** The read lines a form can take: a line is more than RM 0.00, so a discount
 *  read as its own negative line is left for the person (a note says so). */
export function formLines(answer: BillReadAnswer): Array<{ description: string; amount: string }> {
  return answer.reading.lines
    .filter((l) => l.amount > 0)
    .map((l) => ({ description: l.description.slice(0, 200), amount: l.amount.toFixed(2) }));
}

/** Attach the pages that were read to the saved paper. False when one failed. */
export async function attachPages(kind: ApDocKind, id: string, files: readonly File[]): Promise<boolean> {
  for (const f of files) {
    try {
      await uploadApFile(kind, id, f);
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * The button: pick the pages, read them, hand the answer and the pages back.
 * The pages stay with the form, so they can be attached once it is saved.
 */
export function ReadPaperButton({ label, onRead, testId }: {
  label: string;
  onRead: (answer: BillReadAnswer, files: File[]) => void;
  testId?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const read = useMutation<BillReadAnswer, Error, File[]>({ mutationFn: readPaper });
  const pick = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (input.current) input.current.value = "";
    if (files.length === 0) return;
    const gap = pagesGap(files);
    if (gap) { toast.error(gap); return; }
    read.mutate(files, {
      onSuccess: (answer) => onRead(answer, files),
      onError: (e) => toast.error(refusal(e)),
    });
  };
  return (
    <span>
      <input ref={input} type="file" multiple hidden accept={BILL_READ_MIME.join(",")}
        aria-label={label} data-testid={testId ? `${testId}-input` : undefined}
        onChange={(e) => pick(e.target.files)} />
      <Button icon="attach" loading={read.isPending} data-testid={testId} onClick={() => input.current?.click()}>
        {read.isPending ? "Reading…" : label}
      </Button>
    </span>
  );
}
