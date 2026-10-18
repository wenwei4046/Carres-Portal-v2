import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import CaseRemedyApproval from "./CaseRemedyApproval";
vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));
import { apiFetch } from "@/lib/api";
const id = "00000000-0000-4000-8000-000000000001";
const state = (canDecide=true) => ({ canDecide, approver: { actorName: "TEST approver" }, requests: [], evidence: [], units: [], events: [], proposals: [{ id, status: "pending", scopeCurrent: true, payload: { proposal: { remedy: "replace", movement: "replace_first", policy: "TEST policy", policyVersion: "TEST version", policyResult: "eligible", charge: "free", amount: null, payer: "", reason: "TEST exact goods", evidence: ["TEST.jpg"], affectedUnits: [] }, scope: { context: { lines: [{ sku: "TEST-CHAIR", qty: 2 }] } } } }] });
const answer = (canDecide=true) => vi.mocked(apiFetch).mockImplementation(async path => (String(path).endsWith("/evidence") ? { evidence: [{ path: "TEST.jpg", url: "https://example.test/TEST.jpg" }] } : state(canDecide)) as never);
function mount(disabled=false) { const q=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});return render(<MemoryRouter><QueryClientProvider client={q}><CaseRemedyApproval caseId={id} disabled={disabled}/></QueryClientProvider></MemoryRouter>); }
afterEach(()=>{cleanup();vi.mocked(apiFetch).mockReset();});
it("shows exact goods before the qualified decision and uses only the Case decision door", async()=>{
 answer();mount();
 expect(await screen.findByText("TEST-CHAIR · 2")).toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"Approve"}));
 await waitFor(()=>expect(apiFetch).toHaveBeenCalledWith(`/api/ops/service-cases/${id}/remedy/decisions`,expect.objectContaining({method:"POST",body:JSON.stringify({approvalId:id,status:"approved",reason:""})})));
});
it("never offers an approval button to an unqualified reader",async()=>{
 answer(false);mount();await screen.findByText("TEST-CHAIR · 2");expect(screen.queryByRole("button",{name:"Approve"})).not.toBeInTheDocument();
});
it("requires saved Case facts before acting on a proposal",async()=>{
 answer();mount(true);await screen.findByText("TEST-CHAIR · 2");expect(screen.getByRole("button",{name:"Approve"})).toBeDisabled();expect(screen.getByText("Save the Case changes before reviewing its remedy.")).toBeInTheDocument();
});
it("treats a failed approval read as unknown, with a retry",async()=>{
 vi.mocked(apiFetch).mockRejectedValue(new Error("TEST unavailable"));mount();expect(await screen.findByText("Case approvals could not be loaded.")).toBeInTheDocument();expect(screen.getByRole("button",{name:"Try again"})).toBeInTheDocument();
});
