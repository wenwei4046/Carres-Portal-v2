import { Hono, type Context } from "hono";
import {
  purchasingCreateDestinationInput,
  purchasingSetNumberInput,
  purchasingSetPoDaysInput,
  purchasingSetReadyStockPriorityInput,
  purchasingSetPoWindowsInput,
  purchasingSetSupplierPoCutoffInput,
  purchasingSetProductionDaysInput,
  purchasingSetSupplierTermsDaysInput,
  purchasingSetSupplierAddressInput,
  purchasingSetSupplierChannelInput,
  purchasingSetSupplierCollectionInput,
  purchasingSetWorkWeekInput,
  purchasingSettingsResponseSchema,
  purchasingUpdateDestinationInput,
} from "@carres/shared";
import { z } from "zod";
import { requireOperationOrPrincipal } from "../../lib/auth-guards";
import { canEditSettings as canEditSection, requireSettingsEditor } from "../../lib/settings-editor";
import { loadPoWindows, loadPurchasingSettings } from "../../lib/purchasing-settings";
import { parseJsonBody, fail } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * Purchasing → Settings — card P1 (migration 0303).
 *
 *   GET  /                  every number, who last changed it, and what it was
 *   PUT  /number            one of the single numbers
 *   PUT  /po-days           the weekdays POs are sent on
 *   PUT  /po-windows        the first and optional second daily PO window (0585)
 *   PUT  /production-days   one supplier × category (null clears it)
 *   PUT  /work-week         one supplier's working week
 *   POST /destinations      one future Deliver To
 *   PUT  /destinations/:id  its name, address, availability or default state
 *
 * The tab is manager-only. `canEdit` in the GET decides what RENDERS; the
 * SECURITY DEFINER RPCs re-gate in SQL, which is the actual protection — the
 * settings tables carry no write policy at all, so PostgREST cannot be used to
 * walk around this route.
 */
const purchasingSettingsRouter = new Hono<AppEnv>();

/** The Settings-only numbers (0602 Repair return target · 0606 claim reply
 *  timing). Read here only, each fault-tolerant: a Settings-only number never
 *  decides whether the page loads, and a column not yet applied is absent. */
async function readSettingsOnlyNumber(sb: ReturnType<typeof userClient>, column: string): Promise<number | null> {
  try {
    const { data, error } = await sb.from("purchasing_settings").select(column).eq("id", 1).maybeSingle();
    const v = (data as Record<string, number | null> | null)?.[column];
    return error || v == null ? null : Number(v);
  } catch {
    return null;
  }
}

/**
 * Every number PLUS the daily PO windows. The windows ride through the ONE
 * window reader (`loadPoWindows`, the same read Work and SO Batch use), so
 * Settings can never show a window the engine does not use.
 */
async function loadSettingsWithWindows(sb: ReturnType<typeof userClient>) {
  const [settings, windows, repair, claimWait, claimExtra] = await Promise.all([
    loadPurchasingSettings(sb),
    loadPoWindows(sb),
    readSettingsOnlyNumber(sb, "repair_return_working_days"),
    readSettingsOnlyNumber(sb, "claim_reply_waiting_days"),
    readSettingsOnlyNumber(sb, "claim_escalation_extra_days"),
  ]);
  return {
    ...settings,
    ...(repair == null ? {} : { repairReturnWorkingDays: repair }),
    ...(claimWait == null ? {} : { claimReplyWaitingDays: claimWait }),
    ...(claimExtra == null ? {} : { claimEscalationExtraDays: claimExtra }),
    poWindows: windows.settings,
    /* Each supplier's own earlier `Last PO time`, from the same reader. */
    suppliers: settings.suppliers.map((s) => ({ ...s, poCutoff: windows.cutoffBySupplier.get(s.id) ?? null })),
  };
}

/** Who may change Purchasing Settings (owner rule TEAM-02, 9 Oct 2026): the
 *  owner, or a person named for Purchasing in Settings → Settings editors —
 *  the same `settings_can_edit('purchasing')` the SQL gate asks (0674), so
 *  what renders matches what the database accepts. The shared `operation@`
 *  login is never named and never sees Save. */
async function canEditSettings(c: Context<AppEnv>): Promise<boolean> {
  return canEditSection(c.env, c.var.auth.jwt, "purchasing", c.var.auth.role);
}

purchasingSettingsRouter.get("/", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  try {
    const settings = await loadSettingsWithWindows(sb);
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
  const settings = await loadSettingsWithWindows(sb);
  return c.json(
    purchasingSettingsResponseSchema.parse({
      ...settings,
      canEdit: await canEditSettings(c),
    }),
  );
}

purchasingSettingsRouter.put("/number", requireSettingsEditor("purchasing"), async (c) => {
  const parsed = await parseJsonBody(c, purchasingSetNumberInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.rpc("purchasing_set_number", {
    p_key: parsed.data.key,
    p_value: parsed.data.value,
  });
  if (error) return fail(c, error);
  return respondWithSettings(c);
});

purchasingSettingsRouter.put("/po-days", requireSettingsEditor("purchasing"), async (c) => {
  const parsed = await parseJsonBody(c, purchasingSetPoDaysInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.rpc("purchasing_set_po_days", { p_days: parsed.data.days });
  if (error) return fail(c, error);
  return respondWithSettings(c);
});

purchasingSettingsRouter.put("/ready-stock-priority", requireSettingsEditor("purchasing"), async (c) => {
  const parsed = await parseJsonBody(c, purchasingSetReadyStockPriorityInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const { error } = await userClient(c.env, c.var.auth.jwt).rpc("purchasing_set_ready_stock_priority", { p_priority: parsed.data.priority });
  if (error) return fail(c, error);
  return respondWithSettings(c);
});

/** 0585 · `First PO window` · `Second PO window` + its switch. The SECURITY
 *  DEFINER door re-gates the manager and re-checks the order of the times,
 *  and records the old and new value in the Settings history. */
purchasingSettingsRouter.put("/po-windows", requireSettingsEditor("purchasing"), async (c) => {
  const parsed = await parseJsonBody(c, purchasingSetPoWindowsInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.rpc("purchasing_set_po_windows", {
    p_first: parsed.data.first,
    p_second: parsed.data.second,
    p_second_enabled: parsed.data.secondEnabled,
  });
  if (error) return fail(c, error);
  return respondWithSettings(c);
});

/** 0585 · one supplier's `Last PO time` (null = the PO windows). The door
 *  refuses a time that is not earlier than the last PO window. */
purchasingSettingsRouter.put("/po-cutoff", requireSettingsEditor("purchasing"), async (c) => {
  const parsed = await parseJsonBody(c, purchasingSetSupplierPoCutoffInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.rpc("purchasing_set_supplier_po_cutoff", {
    p_supplier_id: parsed.data.supplierId,
    p_cutoff: parsed.data.cutoff,
  });
  if (error) return fail(c, error);
  return respondWithSettings(c);
});

purchasingSettingsRouter.put("/production-days", requireSettingsEditor("purchasing"), async (c) => {
  const parsed = await parseJsonBody(c, purchasingSetProductionDaysInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.rpc("purchasing_set_production_days", {
    p_supplier_id: parsed.data.supplierId,
    p_category: parsed.data.category,
    p_days: parsed.data.days,
  });
  if (error) return fail(c, error);
  return respondWithSettings(c);
});

/** PUT /terms-days — 0530, one supplier's payment terms (null clears). */
purchasingSettingsRouter.put("/terms-days", requireOperationOrPrincipal, async (c) => {
  const parsed = await parseJsonBody(c, purchasingSetSupplierTermsDaysInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.rpc("purchasing_set_supplier_terms_days", {
    p_supplier_id: parsed.data.supplierId,
    p_days: parsed.data.days,
  });
  if (error) return fail(c, error);
  return respondWithSettings(c);
});

/** PUT /supplier-address — 0611, one supplier's `Address` or `Return
 *  address`, one field per call (blank clears). Same gate and history as the
 *  other supplier rows; answers with the whole settings payload. */
purchasingSettingsRouter.put("/supplier-address", requireSettingsEditor("purchasing"), async (c) => {
  const parsed = await parseJsonBody(c, purchasingSetSupplierAddressInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.rpc("purchasing_set_supplier_address", {
    p_supplier_id: parsed.data.supplierId,
    p_kind: parsed.data.kind === "address" ? "address" : "return_address",
    p_text: parsed.data.text,
  });
  if (error) return fail(c, error);
  return respondWithSettings(c);
});

purchasingSettingsRouter.put("/supplier-channel", requireSettingsEditor("purchasing"), async (c) => {
  const parsed = await parseJsonBody(c, purchasingSetSupplierChannelInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.rpc("purchasing_set_supplier_channel", {
    p_supplier_id: parsed.data.supplierId,
    p_kind: parsed.data.kind === "contactEmail" ? "contact_email" : parsed.data.kind === "poSendChannel" ? "po_send_channel" : "whatsapp_group_url",
    p_text: parsed.data.text,
  });
  if (error) return fail(c, error);
  return respondWithSettings(c);
});

purchasingSettingsRouter.put("/work-week", requireSettingsEditor("purchasing"), async (c) => {
  const parsed = await parseJsonBody(c, purchasingSetWorkWeekInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.rpc("purchasing_set_supplier_work_week", {
    p_supplier_id: parsed.data.supplierId,
    p_off_days: parsed.data.offDays,
  });
  if (error) return fail(c, error);
  return respondWithSettings(c);
});

purchasingSettingsRouter.post("/destinations", requireSettingsEditor("purchasing"), async (c) => {
  const parsed = await parseJsonBody(c, purchasingCreateDestinationInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.rpc("purchasing_create_destination", {
    p_name: parsed.data.name,
    p_address: parsed.data.address,
  });
  if (error) return fail(c, error);
  return respondWithSettings(c);
});

purchasingSettingsRouter.put(
  "/destinations/:destinationId",
  requireSettingsEditor("purchasing"),
  async (c) => {
    const destinationId = z.string().uuid().safeParse(c.req.param("destinationId"));
    if (!destinationId.success) {
      return c.json({ error: "invalid_destination", message: "Invalid Deliver To." }, 422);
    }
    const parsed = await parseJsonBody(c, purchasingUpdateDestinationInput);
    if (!parsed.ok) return c.json(parsed.body, parsed.status);
    const sb = userClient(c.env, c.var.auth.jwt);
    const { error } = await sb.rpc("purchasing_update_destination", {
      p_destination_id: destinationId.data,
      p_name: parsed.data.name,
      p_address: parsed.data.address,
      p_active: parsed.data.active,
      p_is_default: parsed.data.isDefault,
    });
    if (error) return fail(c, error);
    return respondWithSettings(c);
  },
);

purchasingSettingsRouter.put(
  "/supplier-collection/:supplierId",
  requireSettingsEditor("purchasing"),
  async (c) => {
    const supplierId = z.string().uuid().safeParse(c.req.param("supplierId"));
    if (!supplierId.success) {
      return c.json({ error: "invalid_supplier", message: "Invalid supplier." }, 422);
    }
    const parsed = await parseJsonBody(c, purchasingSetSupplierCollectionInput);
    if (!parsed.ok) return c.json(parsed.body, parsed.status);
    const sb = userClient(c.env, c.var.auth.jwt);
    const { error } = await sb.rpc("purchasing_set_supplier_collection", {
      p_supplier_id: supplierId.data,
      p_destination_id: parsed.data.destinationId,
      p_partner_id: parsed.data.partnerId,
    });
    if (error) return fail(c, error);
    return respondWithSettings(c);
  },
);

export default purchasingSettingsRouter;
