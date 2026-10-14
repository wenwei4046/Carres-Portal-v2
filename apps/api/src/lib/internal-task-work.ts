import type { Context } from "hono";
import { z } from "zod";
import {
  internalTaskOpenSchema,
  projectInternalTaskWork,
  type OperationWorkItem,
} from "@carres/shared";
import { userClient } from "./supabase";
import type { AppEnv } from "../types";

/**
 * Open internal tasks as Work items (Workspace MASTER "Employee-created
 * internal tasks", Jess 2026-10-14; 0694). Read as the caller through the
 * `internal_tasks_open` door, which admits Operation and Principal only.
 */
export async function loadInternalTaskWork(
  c: Context<AppEnv>,
  input: { today: string; observedAt: string },
): Promise<OperationWorkItem[]> {
  const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("internal_tasks_open");
  if (error) throw new Error(`Internal task work source failed: ${error.message}`);
  const tasks = z.array(internalTaskOpenSchema).parse(data ?? []);
  return projectInternalTaskWork({ tasks, ...input });
}
