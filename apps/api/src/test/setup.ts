import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./server";

// MSW (Mock Service Worker) intercepts outbound fetch in Node so route tests
// don't hit real Supabase. Per-test handlers can be added via server.use(...).
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
