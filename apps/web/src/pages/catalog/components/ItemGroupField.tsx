import { useEffect, useState } from "react";
import type { ProductCategory } from "@carres/shared";
import { useItemGroupChoices } from "@/lib/item-group-queries";
import Select from "@/components/kit/Select";

/**
 * 0659 — the Finance item group a new product starts in, on the catalog's
 * New Model and New SKU forms (Chew 2026-10-07, Finance MASTER §1: the one
 * thing Finance adds to these forms). It starts on the category's own group
 * and follows the category until someone picks another. Only a group other
 * than the category's is sent; the database then places the new product
 * there (gl_item_group_start). If the groups cannot be read, the field is not
 * shown and the product starts in its category's group, as it would anyway.
 */
export function useItemGroupPick(category: ProductCategory) {
  const choices = useItemGroupChoices();
  const [picked, setPicked] = useState<string | null>(null);
  // A new category starts on its own group again.
  useEffect(() => setPicked(null), [category]);
  const start = choices.data?.starts[category] ?? null;
  const value = picked ?? start ?? "";
  return {
    groups: choices.data?.groups ?? [],
    value,
    pick: setPicked,
    /** What the create request carries: only a group other than the category's. */
    itemGroupId: picked && picked !== start ? picked : undefined,
  };
}

/** The kit Select (ONE KIT LAW), though the forms around it are older. */
export function ItemGroupField({
  pick,
  disabled,
  id,
}: {
  pick: ReturnType<typeof useItemGroupPick>;
  disabled?: boolean;
  id: string;
}) {
  if (pick.groups.length === 0) return null;
  return (
    <Select
      id={id}
      // PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md, Finance (Chew), 0659).
      label="Item group"
      value={pick.value}
      onValueChange={pick.pick}
      disabled={disabled}
      options={pick.groups.map((g) => ({ value: g.id, label: g.name }))}
    />
  );
}
