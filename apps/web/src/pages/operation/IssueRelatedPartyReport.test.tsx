import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import IssueRelatedPartyReport from "./IssueRelatedPartyReport";
const apiFetch = vi.fn((path: string) => path.includes("related-parties") ? Promise.resolve({items:[]}) : Promise.resolve({}));
vi.mock("@/lib/api",()=>({apiFetch:(path:string)=>apiFetch(path)}));
it("keeps confirmed, waiting and disputed sections separate",()=>{const qc=new QueryClient({defaultOptions:{queries:{retry:false}}});render(<QueryClientProvider client={qc}><MemoryRouter><IssueRelatedPartyReport/></MemoryRouter></QueryClientProvider>);expect(screen.getByText("Confirmed fault")).toBeInTheDocument();expect(screen.getByText("Waiting response")).toBeInTheDocument();expect(screen.getByText("Disputed")).toBeInTheDocument();expect(screen.getByText("Cost incurred")).toBeInTheDocument();expect(screen.getByText("Amount recoverable")).toBeInTheDocument();expect(screen.getByText("Amount recovered")).toBeInTheDocument();});
