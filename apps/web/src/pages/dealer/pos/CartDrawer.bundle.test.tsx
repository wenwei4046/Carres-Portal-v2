/**
 * CartDrawer — bundle component lines (0239 bundle pricing). A bundle's lines
 * carry attrs.bundle_* and are price-locked as a GROUP: removing any one
 * removes the whole group (a lone component at its split share would silently
 * under-price it), qty is fixed, no ✎ pencil, and no free-item / PWP discount
 * stacks on top of the split price.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { CatalogResponse } from "@carres/shared";
import { emptyDraft, type DraftLine, type WizardDraft } from "../new-order/draft";
import CartDrawer from "./CartDrawer";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

const CATALOG = {
  models: [
    { id: "m-mat1", category: "mattress", modelKey: "cloud", name: "Cloud", blurb: null, colors: null, gaps: null, sofaMode: null },
    { id: "m-mat2", category: "mattress", modelKey: "lumi", name: "Lumi", blurb: null, colors: null, gaps: null, sofaMode: null },
    { id: "m-bed", category: "bedframe", modelKey: "kayu", name: "Kayu", blurb: null, colors: null, gaps: null, sofaMode: null },
  ],
  skus: [
    { id: "s1", modelId: "m-mat1", sku: "MAT-001-K", variant: "King", variantKind: "size", price: 3490, cost: null, supplierId: null },
    { id: "s2", modelId: "m-mat2", sku: "LUMI-CLASSIC-K", variant: "King", variantKind: "size", price: 1000, cost: null, supplierId: null },
    { id: "s3", modelId: "m-bed", sku: "BED-201-K", variant: "King", variantKind: "size", price: 3490, cost: null, supplierId: null },
  ],
  sofaFabrics: [],
  addons: [],
  floorConfig: { id: 1, freeUpToFloor: 1, perFloorPerItem: 50 },
  modelDefaultFreeGifts: [],
  // A campaign covering the whole mattress category — bundle lines must NOT
  // offer "Make free" even when covered.
  freeItemCampaigns: [
    { id: "camp-1", name: "Xmas", active: true, maxFreeQty: 9, eligible: [{ scope: "model", modelId: "m-mat1" }] },
  ],
  pwpRules: [],
} as unknown as CatalogResponse;

const GROUP = "grp-1";
const bundleAttrs = (slot: number) => ({
  bundle_key: "bundle-1",
  bundle_label: "King Bedroom Set",
  bundle_group: GROUP,
  bundle_slot: slot,
});

const B_LINES: DraftLine[] = [
  { localId: "L-1", sku: "MAT-001-K", qty: 1, unitPrice: 1093.36, label: "Cloud · King", attrs: bundleAttrs(0) },
  { localId: "L-2", sku: "LUMI-CLASSIC-K", qty: 1, unitPrice: 313.28, label: "Lumi · King", attrs: bundleAttrs(1) },
  { localId: "L-3", sku: "BED-201-K", qty: 1, unitPrice: 1093.36, label: "Kayu · King", attrs: bundleAttrs(2) },
];
const PLAIN_LINE: DraftLine = {
  localId: "L-plain",
  sku: "LUMI-CLASSIC-K",
  qty: 1,
  unitPrice: 1000,
  label: "Lumi · King",
  attrs: null,
};

function draftWith(lines: DraftLine[]): WizardDraft {
  return { ...emptyDraft(), lines };
}
const noop = () => {};

beforeEach(() => vi.clearAllMocks());

describe("CartDrawer — bundle lines", () => {
  it("shows the bundle tag on each component line", () => {
    render(
      <CartDrawer
        draft={draftWith(B_LINES)}
        onChange={noop}
        onProceed={noop}
        onClose={noop}
        catalog={CATALOG}
      />,
    );
    for (const id of ["L-1", "L-2", "L-3"]) {
      expect(screen.getByTestId(`cart-line-bundle-${id}`)).toHaveTextContent("King Bedroom Set");
    }
  });

  it("group-remove: clicking a bundle line's remove drops all 3 group lines", () => {
    const onChange = vi.fn();
    render(
      <CartDrawer
        draft={draftWith([...B_LINES, PLAIN_LINE])}
        onChange={onChange}
        onProceed={noop}
        onClose={noop}
        catalog={CATALOG}
      />,
    );
    // Unambiguous label: only the bundle carries "Cloud · King".
    fireEvent.click(screen.getByLabelText("Remove Cloud · King"));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0];
    expect(next.lines).toHaveLength(1);
    expect(next.lines[0].localId).toBe("L-plain");
  });

  it("qty steppers are disabled on bundle lines, enabled on plain lines", () => {
    render(
      <CartDrawer
        draft={draftWith([B_LINES[0]!, PLAIN_LINE])}
        onChange={noop}
        onProceed={noop}
        onClose={noop}
        catalog={CATALOG}
      />,
    );
    const increases = screen.getAllByLabelText("Increase quantity");
    // Line order = render order: bundle line first, plain line second.
    expect(increases[0]).toBeDisabled();
    expect(increases[1]).not.toBeDisabled();
  });

  it("no ✎ pencil and no Make-free / PWP affordance on a bundle line", () => {
    render(
      <CartDrawer
        draft={draftWith([B_LINES[0]!, PLAIN_LINE])}
        onChange={noop}
        onProceed={noop}
        onClose={noop}
        catalog={CATALOG}
        onEditLine={() => {}}
      />,
    );
    // The bundle mattress line is covered by the Xmas campaign but must not
    // offer Make-free; the PLAIN mattress line isn't covered (campaign targets
    // m-mat1 only) so no affordance there either — assert none in the drawer.
    expect(screen.queryByTestId("make-free-L-1-camp-1")).toBeNull();
    // No pencil on the bundle line even though it's a mattress.
    expect(screen.queryByTestId("cart-line-edit-L-1")).toBeNull();
    // The plain mattress line still gets its pencil.
    expect(screen.getByTestId("cart-line-edit-L-plain")).toBeTruthy();
  });

  it("cart total = Σ split prices = the bundle price exactly", () => {
    render(
      <CartDrawer
        draft={draftWith(B_LINES)}
        onChange={noop}
        onProceed={noop}
        onClose={noop}
        catalog={CATALOG}
      />,
    );
    // 1093.36 + 313.28 + 1093.36 = 2500.00
    expect(screen.getByText("2,500")).toBeTruthy();
  });
});
