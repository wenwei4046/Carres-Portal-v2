/// <reference types="vite/client" />

/* A font embedded as a `data:` URI at build time — the review package's paper
   needs its bytes present, not fetchable (see `lib/pdf/fonts/noto.preview.ts`). */
declare module "*.ttf?inline" {
  const dataUri: string;
  export default dataUri;
}

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_API_BASE_URL: string;
  /** Deliberate opt-in to point a DEV build at a remote API. See lib/api-base.ts. */
  readonly VITE_ALLOW_REMOTE_API?: string;
  /** The commit a portable review package was built from (portal-shell preview only). */
  readonly VITE_PREVIEW_SHA?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
