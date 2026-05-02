export const SHARED_VERSION = "0.0.0" as const;

// Sub-path imports also work, e.g.:
//   import type { DealerRow } from "@carres/shared/db-types";
//   import { dealerFromRow }   from "@carres/shared/adapters";
//   import { loginSchema }     from "@carres/shared/schemas/auth";

export * as DB       from "./db-types";
export * as Domain   from "./domain";
export * as Adapters from "./adapters";

export {
  loginSchema,
  meResponseSchema,
  type LoginPayload,
  type MeResponse,
} from "./schemas/auth";
