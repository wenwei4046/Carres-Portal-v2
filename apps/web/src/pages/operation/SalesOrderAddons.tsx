import { SERVER_EXCLUSIVE_ADDON_KEYS } from "@carres/shared";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import type { AddonDto } from "@carres/shared";
import { offerableAddons } from "../dealer/pos/AddonsPanel";
import {
  addonRequiresSize,
  addonSizeOptions,
  type DraftAddon,
} from "../dealer/new-order/draft";
import { useAddOrderLines, useEditOrderAddon, useRemoveOrderAddon } from "@/lib/queries";
import type { operationOrderDetailAddon } from "@/lib/queries";
import { rm } from "@/lib/format-currency";
import Button from "@/components/kit/Button";

/**
 * THE OFFICE'S SERVICE DOOR — Jess, 2026-08-28.
 *
 * A customer rings the office after the sale: *"can you take my old mattress
 * too."* The shop could always do that from the POS. The office could not —
 * this page showed services in the Goods table and offered no way to add one,
 * so the office rang the shop to key it. That is the gap this closes.
 *
 * ⭐ IT IS THE POS'S DOOR, NOT A SECOND ONE (ownership Law C — a door, never a
 * duplicate). This writes through `POST /orders/:id/lines` and
 * `POST /orders/:id/addons/:addonId/edit`, the SAME two routes the POS uses.
 * `ORDER_MUTATE_ROLES` already admits `operation` and `principal`, so no new
 * API door, no new RPC and no migration were needed. The server re-prices
 * every pick from the live `addons` config, so a price cannot be typed here.
 *
 * ⭐ THE GATE IS THE API'S GATE, RE-STATED — never a second policy. The RPC
 * refuses unless `status = 'place'` (`wrong_status`); once Operations has
 * picked the order up, a change is the POS's change-request flow and this
 * panel says so instead of offering a control that would 422.
 *
 * ⭐ A SERVICE IS NEVER REMOVED, only increased (YH, 2026-08-28). This is not
 * politeness in the UI: `edit_order_addon` enforces it as `downsell_blocked`,
 * so there is no minus button and no delete — the screen shows the rule the
 * database already holds.
 */

/**
 * THE SIZE RULE IS THE POS’S RULE, borrowed rather than restated.
 *
 * `addonRequiresSize` / `addonSizeOptions` read the 0242 config list AND the
 * pre-0242 `DISPOSAL_SIZE_OPTIONS` fallback. A local check against
 * `sizeOptions` alone would silently disagree about every legacy
 * dispose-mattress / dispose-bedframe row — the office would sell one with no
 * size where the POS demands one. They take a `DraftAddon`, so the catalog row
 * is adapted into that shape instead of the rule being copied.
 */
function asDraftAddon(a: AddonDto): DraftAddon {
  return {
    key: a.key,
    qty: 1,
    unitPrice: a.price,
    name: a.name,
    ...(a.sizeOptions ? { sizeOptions: a.sizeOptions } : {}),
  };
}
const requiresSize = (a: AddonDto) => addonRequiresSize(asDraftAddon(a));
const sizesFor = (a: AddonDto) => addonSizeOptions(asDraftAddon(a));

/**
 * ⭐ THE ROW'S OWN DOORS, IN THE ROW (YH, 2026-09-01).
 *
 * A service used to be printed TWICE: once as a row in the Goods table, and
 * again eighty pixels below in a `Services` list that repeated its name, its
 * size, its quantity and its price purely so it could carry two buttons —
 *
 *     Dispose old mattress · Queen
 *     ×1 · RM 80.00      [ Add one more ]  [ Remove ]
 *
 * — every fact of which the table above already stated. One record, two
 * places, and the operator had to match them by eye to be sure which row the
 * `Remove` belonged to. The doors live in the row they act on now, which is
 * also the only reading of "one record, one owner" that survives a second
 * service being added.
 *
 * ⛔ NOT A SEVENTH COLUMN. `docs/orders/MASTER.md` §0.1 locks the Goods table
 * at six columns, and the document preview beside it prints from the same six.
 * The doors ride the ITEM cell as a quiet line under the name — which is
 * exactly where a goods row already puts its own configuration, so the two row
 * kinds keep the same shape.
 *
 * Every gate below is the one this file already applied; nothing was widened.
 */
export function ServiceRowActions({
  orderId,
  row,
  catalogAddons,
  status,
}: {
  orderId: string;
  row: operationOrderDetailAddon;
  catalogAddons: AddonDto[];
  status: string | null;
}) {
  const byKey = useMemo(
    () => new Map(catalogAddons.map((a) => [a.key, a])),
    [catalogAddons],
  );
  const editAddon = useEditOrderAddon(orderId);
  const removeAddon = useRemoveOrderAddon(orderId);
  const inPlaceLane = status === "place";
  /* ⛔ NOT ON A COMPUTED FEE (2026-08-31). `0393` made the stair carry the
     fourth server-computed key and never added itself to `0258`'s refusal
     list, so a `Stair carry` row shipped with a live `Add one more` and ONE
     CLICK doubled a fee nobody quoted. `0406` refuses it in the database;
     this declines to offer the door. The delivery trio is computed the same
     way — nobody picked those rows, so nobody can misclick them. */
  const editable = inPlaceLane && !SERVER_EXCLUSIVE_ADDON_KEYS.has(row.addon_key);
  if (!editable) return null;

  const meta = byKey.get(row.addon_key);
  const nextQty = row.qty + 1;
  /* A sized service needs one size per unit, so growing the qty grows the
     list — repeat the size already sold rather than asking again for a service
     the customer already chose. */
  const sizes = row.attrs?.sizes ?? [];
  const grown =
    meta && addonRequiresSize(asDraftAddon(meta)) && sizes.length > 0
      ? [...sizes, sizes[sizes.length - 1]!]
      : null;

  return (
    <span
      className="mt-0.5 flex flex-wrap items-center gap-x-2"
      data-testid={`so-addon-row-${row.addon_key}`}
    >
      {/* ⭐ NO MINUS, BUT A REMOVE (YH, 2026-08-28). `edit_order_addon` refuses
          a DECREASE as `downsell_blocked`, so there is no minus — a control
          that always fails is worse than no control. Taking the row back
          entirely is a different act: it is undoing a pick that should never
          have happened, and before `0395` there was no path to it from any
          surface — the only correction for a misclicked service was cancelling
          the whole order. `Remove` is the ruled word (COPY-STANDARD:926). */}
      <button
        type="button"
        data-testid={`so-addon-more-${row.addon_key}`}
        disabled={editAddon.isPending}
        onClick={() =>
          editAddon.mutate({
            addonId: row.id,
            input: {
              qty: nextQty,
              ...(grown ? { attrs: { sizes: grown, size: grown.join(" · ") } } : {}),
            },
          })
        }
        className="rounded-control px-1 text-meta text-kit-blue-11 hover:bg-hovertint disabled:opacity-50"
      >
        Add one more
      </button>
      <button
        type="button"
        data-testid={`so-addon-remove-${row.addon_key}`}
        disabled={removeAddon.isPending}
        onClick={() => removeAddon.mutate({ addonId: row.id })}
        className="rounded-control px-1 text-meta text-danger hover:bg-hovertint disabled:opacity-50"
      >
        Remove
      </button>
    </span>
  );
}

/**
 * ⭐ WHAT IS LEFT HERE IS THE ADD DOOR (YH, 2026-09-01). The `Services`
 * heading, the list that repeated the table, and the per-row buttons are gone —
 * the rows are the table's rows and their doors moved into them
 * (`ServiceRowActions`). This is the one control the table cannot hold: adding
 * a row that does not exist yet.
 */
export default function SalesOrderAddons({
  orderId,
  catalogAddons,
  status,
}: {
  orderId: string;
  catalogAddons: AddonDto[];
  /** The order's lane. Only `place` may be edited directly — see the gate note. */
  status: string | null;
}) {
  const offerable = useMemo(() => offerableAddons(catalogAddons), [catalogAddons]);
  const byKey = useMemo(
    () => new Map(catalogAddons.map((a) => [a.key, a])),
    [catalogAddons],
  );

  const [picking, setPicking] = useState(false);
  const [pickKey, setPickKey] = useState("");
  const [pickSize, setPickSize] = useState("");
  const [error, setError] = useState<string | null>(null);

  const addLines = useAddOrderLines(orderId, {
    onSuccess: () => {
      setPicking(false);
      setPickKey("");
      setPickSize("");
      setError(null);
    },
    onError: (e) => setError(e.message),
  });
  const inPlaceLane = status === "place";
  const chosen = pickKey ? byKey.get(pickKey) : undefined;
  const needsSize = chosen ? requiresSize(chosen) : false;
  const canSubmit = !!chosen && (!needsSize || !!pickSize) && !addLines.isPending;

  function submit() {
    if (!chosen) return;
    addLines.mutate({
      lines: [],
      addons: [
        {
          addonKey: chosen.key,
          qty: 1,
          /* One size PER UNIT (0242), plus the composed summary the POS writes.
             qty is 1 here, so the list is one long. */
          ...(needsSize ? { attrs: { sizes: [pickSize], size: pickSize } } : {}),
        },
      ],
    });
  }


  return (
    <div className="mt-3" data-testid="so-addons">
      {/* ⭐ ONE BUTTON, NO SECTION (YH, 2026-09-01). This was a `Services`
          heading with a rule above it and a list under it that restated every
          row of the table eight lines up. The rows belong to the table and
          their doors moved into them; what is left is the act the table cannot
          perform — adding a service that is not there yet. It sits under the
          table it adds to, in the same shape create mode's `Add line` uses. */}
      {inPlaceLane && !picking && offerable.length > 0 && (
        <Button
          size="sm"
          variant="neutral"
          data-testid="so-addon-open"
          onClick={() => setPicking(true)}
        >
          <Plus size={14} /> Add a service
        </Button>
      )}

      {picking && (
        <div className="mt-2 flex flex-wrap items-end gap-2" data-testid="so-addon-picker">
          <label className="flex flex-col gap-1">
            <span className="text-label text-base-500">Service</span>
            <select
              value={pickKey}
              data-testid="so-addon-key"
              onChange={(e) => {
                setPickKey(e.target.value);
                setPickSize("");
              }}
              className="rounded-control border border-kit-slate-5 px-2 py-1 text-body"
            >
              <option value="">— pick a service —</option>
              {offerable.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.name} · {rm(a.price)}
                </option>
              ))}
            </select>
          </label>

          {needsSize && (
            <label className="flex flex-col gap-1">
              <span className="text-label text-base-500">Size</span>
              <select
                value={pickSize}
                data-testid="so-addon-size"
                onChange={(e) => setPickSize(e.target.value)}
                className="rounded-control border border-kit-slate-5 px-2 py-1 text-body"
              >
                <option value="">— pick a size —</option>
                {(chosen ? sizesFor(chosen) : []).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          )}

          <Button size="sm" disabled={!canSubmit} data-testid="so-addon-save" onClick={submit}>
            {addLines.isPending ? "Adding…" : "Add"}
          </Button>
          <Button
            size="sm"
            variant="neutral"
            data-testid="so-addon-cancel"
            onClick={() => {
              setPicking(false);
              setPickKey("");
              setPickSize("");
              setError(null);
            }}
          >
            Cancel
          </Button>
        </div>
      )}

      {error && (
        <p className="mt-1 text-meta text-danger" data-testid="so-addon-error">
          {error}
        </p>
      )}

      {!inPlaceLane && (
        /* Say WHERE the act moved, not merely that it is unavailable — an
           operator told "no" with no next step rings the shop anyway, which is
           the call this panel exists to stop. */
        <p className="mt-1 text-meta text-base-500" data-testid="so-addons-locked">
          Operations has this order — a service is added from the shop's order
          screen now, and needs approval
        </p>
      )}
    </div>
  );
}
