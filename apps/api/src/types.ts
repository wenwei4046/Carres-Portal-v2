import type { Role } from "@carres/shared/domain";

export type Bindings = {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_JWT_SECRET: string;
};

export type AuthContext = {
  id: string;
  email: string;
  role: Role;
  dealerId: string | null;
  supplierId: string | null;
  partnerId: string | null;
  outletId: string | null;
  jwt: string;
};

export type Variables = {
  auth: AuthContext;
};

export type AppEnv = { Bindings: Bindings; Variables: Variables };
