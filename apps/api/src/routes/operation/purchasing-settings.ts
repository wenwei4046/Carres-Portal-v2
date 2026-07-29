import { Hono, type Context } from "hono";
import {
  isOpsManager,
  purchasingSetDestinationAddressInput,
  purchasingSetNumberInput,
  purchasingSetPoDaysInput,
  purchasingSetProductionDaysInput,
  purchasingSetSupplierCollectionInput,
  purchasingSetWorkWeekInput,
  purchasingSettingsResponseSchema,
} from "@carres/shared";
import { requireOperationOrPrincipal } from "../../lib/auth-guards";
import { myDuties } from "../../lib/duties";
import { loadPurchasingSettings } from "../../lib/purchasing-settings";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * Purchasing → Settings — card P1 (migration 0303).
 *
 *   GET  /                  every number, who last changed it, and what it was
 *   PUT  /number            one of the single numbers
 *   PUT  /po-days           the weekdays POs are sent on
 *   PUT  /production-days   one supplier × category (null clears it)
 *   PUT  /work-week         one supplier's working week
 *
 * The tab is manager-only. `canEdit` in the GET decides what RENDERS; the
 * SECURITY DEFINER RPCs re-gate in SQL, which is the actual protection — the
 * settings tables carry no write policy at all, so PostgREST cannot be used to
 * walk around this route.
 */
const purchasingSettingsRouter = new Hono<AppEnv>();

/** Settings is manager-only (§1 of the working flow). The card names the key:
 *  the existing `ops_manager` duty — NO new duty key. */
async function canEditSettings(c: Context<AppEnv>): Promise<boolean> {
  const { role, email } = c.var.auth;
  return isOpsManager(role, email, await myDuties(c));
}

purchasingSettingsRouter.get("/", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  try {
    const settings = await loadPurchasingSettings(sb);
    return c.json(
      purchasingSettingsResponseSchema.parse({
        ...settings,
        canEdit: await canEditSettings(c),
      }),
    );
  } catch (e) {
    return c.json(
      {
        error: "settings_unavailable",
        code: "settings_unavailable",
        message: (e as Error).message,
      },
      500,
    );
  }
});

/** Every write returns the whole settings object, so the screen re-renders
 *  from the server's answer rather than from what it hoped it wrote. */
async function respondWithSettings(c: Context<AppEnv>) {
  const sb = userClient(c.env, c.var.auth.jwt);
  const settings = await loadPurchasingSettings(sb);
  return c.json(
    purchasingSettingsResponseSchema.parse({
      ...settings,
      canEdit: await canEditSettings(c),
    }),
  );
}

purchasingSettingsRouter.put("/number", requireOperationOrPrincipal, async (c) => {
  const parsed = await parseJsonBody(c, purchasingSetNumberInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.rpc("purchasing_set_number", {
    p_key: parsed.data.key,
    p_value: parsed.data.value,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return respondWithSettings(c);
});

purchasingSettingsRouter.put("/po-days", requireOperationOrPrincipal, async (c) => {
  const parsed = await parseJsonBody(c, purchasingSetPoDaysInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.rpc("purchasing_set_po_days", { p_days: parsed.data.days });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return respondWithSettings(c);
});

purchasingSettingsRouter.put("/production-days", requireOperationOrPrincipal, async (c) => {
  const parsed = await parseJsonBody(c, purchasingSetProductionDaysInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.rpc("purchasing_set_production_days", {
    p_supplier_id: parsed.data.supplierId,
    p_category: parsed.data.category,
    p_days: parsed.data.days,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return respondWithSettings(c);
});

purchasingSettingsRouter.put("/work-week", requireOperationOrPrincipal, async (c) => {
  const parsed = await parseJsonBody(c, purchasingSetWorkWeekInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.rpc("purchasing_set_supplier_work_week", {
    p_supplier_id: parsed.data.supplierId,
    p_off_days: parsed.data.offDays,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return respondWithSettings(c);
});

/**
 * P4 (migration 0307) — the destination address.
 *
 * Only the two EXTERNAL destinations have one to set: `Carres Klang` derives
 * its address from the warehouse record and the RPC refuses to write one
 * (`address_comes_from_the_warehouse`), which is what keeps a single address
 * from having two sources.
 */
purchasingSettingsRouter.put("/destination-address", requireOperationOrPrincipal, async (c) => {
  const parsed = await parseJsonBody(c, purchasingSetDestinationAddressInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.rpc("purchasing_set_destination_address", {
    p_destination_id: parsed.data.destinationId,
    p_address: parsed.data.address,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return respondWithSettings(c);
});

/**
 * P4 (migration 0307) — a supplier that does not deliver.
 *
 * Q3's ruling: the Nice Future collection rule lives in these manager-only
 * settings with audit history, NOT as a hard-coded slug (P1 spent a whole card
 * deleting that habit) and not as a new `suppliers` boolean.
 */
purchasingSettingsRouter.put("/supplier-collection", requireOperationOrPrincipal, async (c) => {
  const parsed = await parseJsonBody(c, purchasingSetSupplierCollectionInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.rpc("purchasing_set_supplier_collection", {
    p_supplier_id: parsed.data.supplierId,
    p_destination_id: parsed.data.destinationId,
    p_partner_id: parsed.data.partnerId,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return respondWithSettings(c);
});

export default purchasingSettingsRouter;
