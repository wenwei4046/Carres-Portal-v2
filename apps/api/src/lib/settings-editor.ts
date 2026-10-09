/**
 * THE SETTINGS WRITE GATE — owner rule TEAM-02 / SET-01 (Carres Settings
 * List, confirmed 9 Oct 2026): Jess edits every Settings section and may name
 * a person for a named section. Every Settings write route puts
 * `requireSettingsEditor("<section>")` in front of its handler; the answer is
 * the database's own `settings_can_edit` (0664) under the caller's token, so
 * the API and the database can never disagree about who may edit.
 *
 * Reading Settings is unchanged: whoever may read a section still sees it.
 * A grant is configuration editing only — never a money approval or a Duty.
 */
import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { userClient } from "./supabase";
import type { AppEnv } from "../types";

export const SETTINGS_SECTIONS = [
  "company",
  "office",
  "staff_duties",
  "sales_orders",
  "purchasing",
  "payment",
  "warehouse",
  "delivery",
  "issue_tracker",
] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export async function canEditSettings(
  env: AppEnv["Bindings"],
  jwt: string,
  section: SettingsSection,
): Promise<boolean> {
  const { data, error } = await userClient(env, jwt).rpc("settings_can_edit", { p_section: section });
  if (error) return false;
  return data === true;
}

export function requireSettingsEditor(section: SettingsSection): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const auth = c.var.auth;
    if (!auth?.jwt || !(await canEditSettings(c.env, auth.jwt, section))) {
      throw new HTTPException(403, { message: "Only Jess or a person she names may change these settings." });
    }
    await next();
  };
}
