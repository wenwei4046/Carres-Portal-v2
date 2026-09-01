/**
 * THE POS REMARK CONTROL IS RETIRED (2026-08-24).
 *
 * It was added by Loo on 2026-07-12 as a remark with an optional ± RM price
 * adjustment, and it ended up doing two jobs badly: its own placeholder read
 * "custom headboard, deliver before CNY" — half a pricing reason, half a
 * delivery instruction, structured as neither. Free-text remarks are retired
 * (Loo); YH confirmed on 2026-08-24 that this POS control is the target, the
 * Warehouse remark box having already gone.
 *
 * ⭐ BOTH HALVES WENT TOGETHER, AND THAT IS THE POINT OF THIS FILE. Keeping the
 * ± RM without the text would leave a price adjustment whose ONLY justification
 * was the free text just retired — manufacturing precisely the untraceable
 * discount the office amendment lane is already criticised for. Special cases
 * carry structured reasons now; Activity & notes (0138) is the surviving note
 * channel.
 *
 * This file no longer tests the feature. It tests that the feature STAYS gone,
 * and that retiring it did not rewrite history: a line that already carries a
 * stored remark keeps it, and keeps its price, because dropping it on edit
 * would silently re-price a live line and erase the only record of why its
 * price is what it is.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ProductModelDto, ProductSkuDto } from "@carres/shared";
import type { DraftLine } from "../new-order/draft";
import PosConfigurePage from "./PosConfigurePage";

const mattModel = {
  id: "m-mat",
  category: "mattress",
  modelKey: "lumi",
  name: "Lumi",
  blurb: null,
  colors: null,
  gaps: null,
  sofaMode: null,
} as ProductModelDto;

const mattSkus = [
  { id: "s1", modelId: "m-mat", sku: "LUMI-Q", variant: "Queen", variantKind: "size", price: 1200, cost: null, supplierId: null } as ProductSkuDto,
];

function renderMatt(onAdd: (l: DraftLine) => void, editLine?: DraftLine) {
  render(
    <PosConfigurePage
      model={mattModel}
      meta={undefined}
      skus={mattSkus}
      editLine={editLine}
      onAdd={onAdd}
      onClose={() => {}}
    />,
  );
}

describe("PosConfigurePage — the remark control is retired", () => {
  it("⭐ neither the remark text nor the ± RM field is on the page", () => {
    renderMatt(vi.fn());
    fireEvent.click(screen.getByTestId("cfg-size-s1"));
    expect(screen.queryByTestId("cfg-remark")).not.toBeInTheDocument();
    expect(screen.queryByTestId("cfg-remark-price")).not.toBeInTheDocument();
    expect(screen.queryByTestId("cfg-remark-section")).not.toBeInTheDocument();
  });

  it("a new line carries NO remark keys at all", () => {
    // Not an empty string and not a zero — the keys are simply absent, so a
    // fresh line is byte-identical to one from before the control existed.
    const onAdd = vi.fn();
    renderMatt(onAdd);
    fireEvent.click(screen.getByTestId("cfg-size-s1"));
    fireEvent.click(screen.getByTestId("cfg-add-to-cart"));
    const line = onAdd.mock.calls[0][0] as DraftLine;
    const attrs = (line.attrs ?? {}) as Record<string, unknown>;
    expect("remark" in attrs).toBe(false);
    expect("remark_surcharge" in attrs).toBe(false);
    expect(line.unitPrice).toBe(1200);
  });

  it("⭐ EDITING a line that already has a remark PRESERVES it, price included", () => {
    // The retirement closes the door; it does not rewrite what is behind it.
    // Dropping the stored remark here would move a live line's price by 200 and
    // delete the only reason that price was ever agreed.
    const onAdd = vi.fn();
    renderMatt(onAdd, {
      localId: "L1",
      sku: "LUMI-Q",
      qty: 1,
      unitPrice: 1400,
      label: "Lumi · Queen",
      attrs: { remark: "custom quilting", remark_surcharge: 200 },
    } as DraftLine);
    fireEvent.click(screen.getByTestId("cfg-add-to-cart"));
    const line = onAdd.mock.calls[0][0] as DraftLine;
    expect(line.unitPrice).toBe(1400);
    expect(line.attrs).toMatchObject({ remark: "custom quilting", remark_surcharge: 200 });
  });

  it("a preserved remark still shows in the price breakdown", () => {
    // The operator must still be able to see WHY the line costs what it does,
    // even though nobody can author a new reason this way.
    renderMatt(vi.fn(), {
      localId: "L1",
      sku: "LUMI-Q",
      qty: 1,
      unitPrice: 1400,
      label: "Lumi · Queen",
      attrs: { remark: "custom quilting", remark_surcharge: 200 },
    } as DraftLine);
    expect(screen.getByTestId("cfg-live-total").textContent).toContain("1,400");
  });

  it("a stored remark with NO surcharge preserves the note and the price", () => {
    const onAdd = vi.fn();
    renderMatt(onAdd, {
      localId: "L1",
      sku: "LUMI-Q",
      qty: 1,
      unitPrice: 1200,
      label: "Lumi · Queen",
      attrs: { remark: "match showroom" },
    } as DraftLine);
    fireEvent.click(screen.getByTestId("cfg-add-to-cart"));
    const line = onAdd.mock.calls[0][0] as DraftLine;
    expect(line.unitPrice).toBe(1200);
    expect(line.attrs).toMatchObject({ remark: "match showroom" });
  });
});
