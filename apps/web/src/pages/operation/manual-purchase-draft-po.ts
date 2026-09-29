/**
 * MANUAL PURCHASE CREATE → THE DRAFT PURCHASE ORDER PAPER (owner instruction
 * 2026-09-28: "it should pdf preview … it same with so batch").
 *
 * The create page's right half used to be an internal read-back of the form.
 * The owner ruled it shows the paper instead — the same Purchase Order template
 * SO Batch's `Review Purchase Orders` renders — so the requester sees what the
 * supplier will eventually receive, including the colour and fabric chosen
 * through `Configure`.
 *
 * ⛔ WHAT A DRAFT MAY NOT CLAIM (Purchasing MASTER §9.2, PO-PDF-STANDARD):
 *   · no PO number and no version — `draft: true` prints `Assigned when issued`
 *     and the `DRAFT · Not issued · Do not send to supplier.` footer;
 *   · no PO Doc Date and no PO Delivery Date — both are set when the PO is
 *     issued (the delivery date from Settings working days), and the request's
 *     own `Supplier Delivery Date` is never copied into the PO's date;
 *   · no Unit IDs — they are born with the official PO.
 *
 * One paper per supplier, because one PO never carries two suppliers. A line
 * whose item names no supplier still prints, under `Supplier not set`, so the
 * requester sees the gap before sending rather than after.
 */
import { GOODS_ABSENCE_WORDS } from "@carres/shared";
import type { PoTemplateData } from "@/lib/pdf/types";

export interface ManualPurchaseDraftLine {
  key: string;
  sku: string;
  /** The Catalog name the picker showed (`Booqit King`). */
  item: string;
  /** Catalog's supplier for the SKU — never typed. `null` = not set. */
  supplierName: string | null;
  qty: number;
  /** 0591 — the configuration chosen through `Configure`. */
  attrs: Record<string, unknown> | null;
}

export interface ManualPurchaseDraftPo {
  key: string;
  supplierName: string;
  data: PoTemplateData;
}

const norm = (name: string) => name.trim().toLowerCase();

export function manualPurchaseDraftPos(input: {
  lines: readonly ManualPurchaseDraftLine[];
  /** The request's purpose word — it prints under the item on the PO the
   *  request becomes (DOCUMENT-KIT §1: the MPR's reason is not internal). */
  purposeLabel: string | null;
  destination: { name: string; address: string | null } | null;
  suppliers: readonly { name: string; address?: string | null }[];
  /** Suppliers Carres collects from (Purchasing Settings collection rule). */
  collectedSupplierNames: ReadonlySet<string>;
}): ManualPurchaseDraftPo[] {
  const address = new Map(input.suppliers.map((s) => [norm(s.name), s.address ?? null]));
  const collected = new Set([...input.collectedSupplierNames].map(norm));
  const groups = new Map<string, ManualPurchaseDraftLine[]>();
  for (const line of input.lines) {
    const supplier = line.supplierName?.trim() || GOODS_ABSENCE_WORDS.supplierNotSet;
    groups.set(supplier, [...(groups.get(supplier) ?? []), line]);
  }
  /* Nothing chosen yet: still one paper, so the right half is the document
     from the first second rather than a blank pane. */
  if (groups.size === 0) groups.set(GOODS_ABSENCE_WORDS.supplierNotSet, []);

  return [...groups.entries()].map(([supplierName, lines]) => {
    const known = supplierName !== GOODS_ABSENCE_WORDS.supplierNotSet;
    const data: PoTemplateData = {
      draft: true,
      po_number: "DRAFT",
      po_id: "",
      version: 0,
      issue_date: "",
      supplier: {
        name: supplierName,
        address: known ? address.get(norm(supplierName)) ?? null : null,
        contact: null,
      },
      destination: {
        name: input.destination?.name ?? GOODS_ABSENCE_WORDS.notChosen,
        address: input.destination?.address ?? "",
      },
      delivery_instructions: null,
      eta_date: null,
      delivery_working_days: null,
      delivery_method: known && collected.has(norm(supplierName)) ? "we_collect" : null,
      terms: null,
      so_refs: [],
      lines: lines.map((line) => ({
        sku: line.sku,
        description: [line.item, input.purposeLabel].filter(Boolean).join(" · "),
        qty: line.qty,
        unit: "unit",
        attrs: line.attrs,
        sources: null,
      })),
    };
    return { key: supplierName, supplierName, data };
  });
}
