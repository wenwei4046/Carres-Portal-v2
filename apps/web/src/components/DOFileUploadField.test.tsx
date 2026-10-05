import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import DOFileUploadField from "./DOFileUploadField";

vi.mock("../lib/api", () => ({ apiFetch: vi.fn() }));
vi.mock("../lib/supabase", () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        uploadToSignedUrl: vi.fn().mockResolvedValue({ error: null }),
      })),
    },
  },
}));
import { apiFetch } from "../lib/api";
import { supabase } from "../lib/supabase";

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  vi.mocked(supabase.storage.from).mockClear();
});

describe("DOFileUploadField", () => {
  it("uses the Warehouse source proof door and arrival bucket for a non-PO upload", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ token: "tok", path: "source/person/proof.pdf" });
    const done = vi.fn();
    render(<DOFileUploadField poId="" arrivalSourceId="source" warehouseArrival doNumber="HANDOVER-1" onUploaded={done} />);
    fireEvent.change(screen.getByLabelText("Handover proof"), { target: { files: [new File(["pdf"], "proof.pdf", { type: "application/pdf" })] } });
    await waitFor(() => expect(done).toHaveBeenCalledWith("source/person/proof.pdf"));
    expect(apiFetch).toHaveBeenCalledWith("/api/warehouse/arrivals/source/proof", expect.objectContaining({ method: "POST" }));
    expect(supabase.storage.from).toHaveBeenCalledWith("arrival-proofs");
  });

  it("rejects file > 10MB client-side", async () => {
    const onUploaded = vi.fn();
    render(<DOFileUploadField poId="PO-100" doNumber="DO-1" onUploaded={onUploaded} />);

    const file = new File(["x"], "big.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "size", { value: 11 * 1024 * 1024 });
    const input = screen.getByLabelText(/do file/i) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByText(/too large/i)).toBeInTheDocument());
    expect(onUploaded).not.toHaveBeenCalled();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("rejects .docx mime", async () => {
    render(<DOFileUploadField poId="PO-100" doNumber="DO-1" onUploaded={vi.fn()} />);
    const file = new File(["x"], "doc.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    fireEvent.change(screen.getByLabelText(/do file/i), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText(/unsupported file type/i)).toBeInTheDocument());
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("uploads valid PDF and calls onUploaded with file path", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ token: "tok", path: "PO-100/abc.pdf" });
    const onUploaded = vi.fn();
    render(<DOFileUploadField poId="PO-100" doNumber="DO-1" onUploaded={onUploaded} />);
    const file = new File(["%PDF-1.4"], "a.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText(/do file/i), { target: { files: [file] } });
    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith("PO-100/abc.pdf"));
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/storage/dos/sign-upload",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("PO-100"),
      }),
    );
  });
});
