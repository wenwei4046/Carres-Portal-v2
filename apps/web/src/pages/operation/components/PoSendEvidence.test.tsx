import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { poSendEvidenceNote } from "@carres/shared";
import PoSendEvidence, { PoSendEvidenceButton, usePoSendProof } from "./PoSendEvidence";
const api = vi.hoisted(() => vi.fn());
const path = "po-send/PO-TEST/V2/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.png";
vi.mock("@/lib/api", () => ({ apiFetch: api }));
vi.mock("@/components/EvidenceUploadField", () => ({ default: ({ onChange }: { onChange: (entries: unknown[]) => void }) => <button onClick={() => onChange([{ path, kind: "photo" }])}>Upload TEST screenshot</button> }));
vi.mock("@/components/kit/SavedEvidenceViewer", () => ({ default: ({ activeId, files }: any) => activeId ? <div data-testid="saved-proof">{files[0].url} · {files[0].context}</div> : null }));
function Form({ channel = "whatsapp" }: { channel?: string }) {
  const proof = usePoSendProof(), documents = [{ id: "PO-TEST", version: 2 }];
  return <><PoSendEvidence proof={proof} documents={documents} channel={channel} /><button disabled={!proof.ready(channel, documents)}>Record TEST sent</button><output>{proof.path(documents[0])}</output></>;
}
beforeEach(() => { api.mockReset(); });
describe("PUR-16 sending proof", () => {
  it("Active blocks until a completed upload belongs to the selected PO/version", async () => {
    api.mockResolvedValue({ required: true, available: true });
    render(<Form />);
    expect(screen.getByRole("button", { name: "Record TEST sent" })).toBeDisabled();
    fireEvent.click(await screen.findByRole("button", { name: "Upload TEST screenshot" }));
    expect(screen.getByRole("button", { name: "Record TEST sent" })).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent(path);
  });
  it("Inactive permits a confirmation without inventing evidence", async () => {
    api.mockResolvedValue({ required: false, available: true }); render(<Form />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Record TEST sent" })).toBeEnabled());
    expect(screen.getByRole("status")).toHaveTextContent("");
  });
  it("a failed policy read stays blocked and can be retried", async () => {
    api.mockRejectedValueOnce(new Error("unavailable")).mockResolvedValue({ required: false, available: true }); render(<Form />);
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Record TEST sent" })).toBeEnabled());
  });
  it("Email retains its existing proof contract", () => {
    api.mockRejectedValue(new Error("unavailable")); render(<Form channel="email" />);
    expect(screen.getByRole("button", { name: "Record TEST sent" })).toBeEnabled();
    expect(screen.queryByText("WhatsApp screenshot")).toBeNull();
  });
  it("reopens a saved screenshot through the exact PO's authorised reader", async () => {
    api.mockResolvedValue({ url: "https://test.invalid/signed-proof" });
    render(<PoSendEvidenceButton poId="PO-TEST" note={poSendEvidenceNote(path)} context="PO-TEST-V2 · TEST supplier" />);
    fireEvent.click(screen.getByRole("button", { name: "WhatsApp screenshot" }));
    expect(await screen.findByTestId("saved-proof")).toHaveTextContent("PO-TEST-V2");
    expect(api).toHaveBeenCalledWith(`/api/operation/pos/PO-TEST/send-evidence?path=${encodeURIComponent(path)}`);
  });
});
