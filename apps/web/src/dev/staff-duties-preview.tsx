/** DEV ONLY: real Settings and Duty components with explicit test fixtures.
 * Every API call is intercepted; this preview cannot save business data. */
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WORKSPACE_DUTIES } from "@carres/shared";
import SettingsWorkspace from "@/pages/operation/SettingsWorkspace";
import { useAuth } from "@/lib/auth";
import { appTodayIso } from "@/lib/fmt-date";
import "@/index.css";
const day = appTodayIso();
const params = new URLSearchParams(location.search);
const reader = params.has("reader");
const sourceFailed = params.has("failure");
useAuth.setState({ role: reader ? "operation" : "principal", user: { id: "fixture-manager", email: "preview@example.test" } as never });
let settings = { morning: "10:30", afternoon: "15:00", revision: 1, canEdit: !reader };
const people = [{ user_id: "11111111-1111-4111-8111-111111111111", name: "Shasha" }, { user_id: "22222222-2222-4222-8222-222222222222", name: params.has("long") ? "Yu Jun Tan Abdullah Muhammad bin Abdul Rahman" : "Yu Jun" }];
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
window.fetch = async (input, init) => {
 const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.origin);
 if (sourceFailed && url.pathname.includes("workspace-duties")) return json({ message: "fixture failure" }, 503);
 if (url.pathname.endsWith("/work-activity/settings")) {
  if (init?.method === "PUT") settings = { ...settings, ...JSON.parse(String(init.body)), revision: settings.revision + 1 };
  return json(settings);
 }
 if (url.pathname.endsWith("/history")) return json({ records: [{ id: 1, office_day: day, period: "morning", cutoff_at: `${day}T02:30:00Z`, recorded_at: `${day}T02:31:00Z`, from_user_id: people[0].user_id, to_user_id: people[1].user_id, from_name: people[0].name, to_name: people[1].name, outcome: "reassigned", reason: "missing_period_activity" }] });
 if (url.pathname.endsWith("/workspace-duties")) return json({ can_assign: !reader, duties: WORKSPACE_DUTIES.map((d, i) => {
  const person = people[i % 2]; const empty = d.key === "delivery_duty";
  return { ...d, resolution: { duty_key: d.key, on_date: day, normal_user_id: empty ? null : person.user_id, normal_user_name: empty ? null : person.name, actor_user_id: empty ? null : person.user_id, acting_user_id: empty ? null : person.user_id, acting_user_name: empty ? null : person.name, source: empty ? "not_assigned" : "assignment", assignment_outcome: params.has("no-candidate") ? "no_candidate" : undefined, is_cover: false, allowed: true },
   assignments: empty ? [] : [{ id: `fixture-${d.key}`, duty_key: d.key, holder_id: person.user_id, holder_name: person.name, effective_from: day, effective_until: null, assigned_by_name: "Jess", note: null, created_at: `${day}T01:00:00Z` }], covers: [] };
 }) });
 if (url.pathname.endsWith("/staff")) return json({ staff: people, myDuties: [] });
 return json({ error: "Preview request blocked" }, 404);
};
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById("root")!).render(<QueryClientProvider client={queryClient}><BrowserRouter><Routes><Route path="/operation/settings/*" element={<div className="h-screen flex flex-col"><SettingsWorkspace /></div>} /><Route path="*" element={<Navigate to={`/operation/settings/staff-duties${location.search}`} replace />} /></Routes></BrowserRouter></QueryClientProvider>);
