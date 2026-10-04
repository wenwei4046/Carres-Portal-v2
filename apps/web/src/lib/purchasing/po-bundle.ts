import type { PoTemplateData } from "@/lib/pdf/types";

/** One selected, issued document. Supplier membership comes from the owning PO read. */
export interface SelectedPoDocument {
  id: string;
  supplierId: string;
  version: number;
}

export interface PreparedPoDocument extends SelectedPoDocument {
  number: string;
  filename: string;
  pdf: Blob;
}

export class PoBundleError extends Error {
  constructor(public readonly code: "empty_selection" | "mixed_suppliers" | "duplicate_po" | "stale_po_version" | "invalid_po_document") {
    super(code);
  }
}

/** Preparation is all-or-nothing. It never issues a PO or records a send. */
export async function preparePoBundle(
  supplierId: string,
  selection: readonly SelectedPoDocument[],
  load: (id: string) => Promise<PoTemplateData>,
  render: (data: PoTemplateData) => Promise<Blob>,
): Promise<PreparedPoDocument[]> {
  if (!selection.length) throw new PoBundleError("empty_selection");
  if (selection.some(po => po.supplierId !== supplierId)) throw new PoBundleError("mixed_suppliers");
  if (new Set(selection.map(po => po.id)).size !== selection.length) throw new PoBundleError("duplicate_po");
  // Copy the selection before awaits: changing the UI selection cannot change this operation.
  const snapshot = selection.map(po => ({ ...po }));
  function validate(po: SelectedPoDocument, data: PoTemplateData) {
    if (data.draft || data.po_id !== po.id || !data.po_number || !Number.isInteger(data.version) || data.version < 1) {
      throw new PoBundleError("invalid_po_document");
    }
    if (data.version !== po.version) throw new PoBundleError("stale_po_version");
  }
  const prepared = await Promise.all(snapshot.map(async po => {
    const data = await load(po.id);
    validate(po, data);
    const pdf = await render(data);
    if (!pdf.size || pdf.type !== "application/pdf") throw new PoBundleError("invalid_po_document");
    const filename = `${data.po_number.replace(/[^a-zA-Z0-9._-]/g, "_")}-V${data.version}.pdf`;
    return { ...po, number: data.po_number, filename, pdf };
  }));
  // A revision while another attachment rendered invalidates the whole prepared set.
  await Promise.all(snapshot.map(async po => validate(po, await load(po.id))));
  return prepared;
}

/** The message lists exactly the independent documents prepared for this operation. */
export function poBundleDocumentList(documents: readonly PreparedPoDocument[]): string {
  return documents.map(po => `${po.number} · V${po.version}`).join("\n");
}
