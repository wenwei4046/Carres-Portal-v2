/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_API_BASE_URL: string;
  /** Deliberate opt-in to point a DEV build at a remote API. See lib/api-base.ts. */
  readonly VITE_ALLOW_REMOTE_API?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
