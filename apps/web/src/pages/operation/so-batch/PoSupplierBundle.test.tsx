import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import type { PoTemplateData } from "@/lib/pdf/types";
import PoSupplierBundle, { readPoSupplierPreparation, type PoSupplierPreparation } from "./PoSupplierBundle";
const api = vi.hoisted(() => vi.fn());
const renderPdf = vi.hoisted(() => vi.fn());
const zip = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async () => ({ ...await vi.importActual<typeof import("@/lib/api")>("@/lib/api"), apiFetch: api }));
vi.mock("@/lib/pdf/render", () => ({ renderPoPdf: renderPdf }));
vi.mock("@/lib/purchasing/po-bundle", async () => {
  const actual = await vi.importActual<typeof import("@/lib/purchasing/po-bundle")>("@/lib/purchasing/po-bundle");
  return { ...actual, zipPoBundle: zip };
});
const pos = [
  { id: "PO-001", supplierId: "s1", supplierName: "Hooka", destinationId: "d1", destination: "Klang", contactEmail: "supplier@example.invalid", poSendChannel: "email" },
  { id: "PO-002", supplierId: "s1", supplierName: "Hooka", destinationId: "d2", destination: "Buloh" },
  { id: "PO-003", supplierId: "s2", supplierName: "Ohana", destinationId: "d1", destination: "Klang" },
];
function data(id: string) { return { po_id: id, po_number: id, version: 1 } as PoTemplateData; }
beforeEach(() => {
  sessionStorage.clear();
  api.mockReset().mockImplementation(async (path: string) => path.endsWith("email-capability") ? { configured: false } : path.endsWith("/sends") ? { sends: [] } : data(path.split("/").at(-2)!));
  const pdf = new Blob(["%PDF-1.4"], { type: "application/pdf" });
  Object.defineProperty(pdf, "arrayBuffer", { value: async () => new TextEncoder().encode("%PDF-1.4").buffer });
  renderPdf.mockReset().mockResolvedValue(pdf);
  zip.mockReset().mockResolvedValue(new Blob(["zip"], { type: "application/zip" }));
  URL.createObjectURL = vi.fn(() => "blob:bundle");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});
async function ready() { await waitFor(() => expect(screen.getByRole("button", { name: "Download PDFs" })).toBeEnabled()); }
describe("issued supplier bundle", () => {
  it("displays the shared dated PO/version while preserving the actual supplier document identity", async () => {
    const dated = { ...pos[0], id: "PO-20260903-7907" };
    const open = vi.fn();
    render(<PoSupplierBundle pos={[dated]} onPreview={() => {}} onOpenObject={open} />);
    await ready();
    expect(screen.getByLabelText("PO-260903-7907-V1")).toBeChecked();
    expect(screen.getByLabelText("PO No")).toHaveValue("PO-20260903-7907 · V1");
    fireEvent.click(screen.getByRole("button", { name: "Open full page" }));
    expect(open).toHaveBeenCalledWith(dated.id, expect.objectContaining({ selectedIds: [dated.id] }), [dated]);
    expect(api).toHaveBeenCalledWith(`/api/operation/pos/${dated.id}/print-data`);
    expect(api.mock.calls.every(call => call.length === 1)).toBe(true);
  });
  it("retains readable documents, refuses a selected failed source and retries the exact supplier set without writing", async () => {
    let unavailable = true;
    api.mockImplementation(async (path: string) => {
      if (path.endsWith("email-capability")) return { configured: true };
      if (path.endsWith("/email-attempts")) return { attempts: [] };
      if (path.endsWith("/sends")) return { sends: [] };
      if (path.endsWith("/print-data") && path.includes("PO-002") && unavailable) throw new Error("source unavailable");
      return data(path.split("/").at(-2)!);
    });
    render(<PoSupplierBundle pos={pos} onPreview={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("PO-002 · Could not be loaded");
    expect(screen.getByLabelText("PO-001-V1")).toBeChecked();
    expect(screen.getByRole("button", { name: "Download PDFs" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Copy message" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send Email" })).toBeDisabled();
    fireEvent.click(screen.getByLabelText("PO-002"));
    await ready();
    expect(screen.getByLabelText("PO No")).toHaveValue("PO-001 · V1");
    fireEvent.click(screen.getByLabelText("PO-002"));
    unavailable = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await ready();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("PO No")).toHaveValue("PO-001 · V1\nPO-002 · V1");
    expect(api.mock.calls.filter(call => call[0].endsWith("/print-data")).map(call => call[0]))
      .toEqual(["/api/operation/pos/PO-001/print-data", "/api/operation/pos/PO-002/print-data", "/api/operation/pos/PO-001/print-data", "/api/operation/pos/PO-002/print-data"]);
    expect(api.mock.calls.every(call => call.length === 1)).toBe(true);
    expect(renderPdf).not.toHaveBeenCalled();
  });
  it("names an original destination-address refusal instead of implying transient PDF trouble", async () => {
    api.mockImplementation(async (path: string) => path.endsWith("email-capability") ? { configured: false }
      : path.endsWith("/sends") ? { sends: [] }
      : (() => { throw new ApiError(422, "No address", { code: "destination_address_missing" }); })());
    render(<PoSupplierBundle pos={[pos[0]]} onPreview={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("PO-001 · Address not recorded. Check Purchasing Settings.");
    expect(screen.getByRole("button", { name: "Download PDFs" })).toBeDisabled();
  });
  it.each([
    { ...data("another-po") }, { ...data("PO-001"), draft: true },
    { ...data("PO-001"), version: 0 }, { ...data("PO-001"), po_number: "" },
  ])("refuses malformed or mismatched document facts before message preparation: %j", async document => {
    api.mockImplementation(async (path: string) => path.endsWith("email-capability") ? { configured: true }
      : path.endsWith("/sends") ? { sends: [] } : path.endsWith("/email-attempts") ? { attempts: [] } : document);
    render(<PoSupplierBundle pos={[pos[0]]} onPreview={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("PO-001 · Could not be loaded");
    expect(screen.getByLabelText("PO No")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Copy message" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send Email" })).toBeDisabled();
  });
  it("shows exactly one supplier's separate POs and saved preferred channel", async () => {
    render(<PoSupplierBundle pos={pos} onPreview={() => {}} />);
    await ready();
    expect(screen.getByLabelText("PO No")).toHaveValue("PO-001 · V1\nPO-002 · V1");
    expect(screen.getByLabelText("To")).toHaveValue("supplier@example.invalid");
    expect(screen.getByRole("button", { name: "Send Email" })).toBeDisabled();
    expect(screen.queryByLabelText("PO-003-V1")).not.toBeInTheDocument();
    expect(api.mock.calls.every(call => call.length === 1)).toBe(true);
  });
  it("retains readable history when another PO fails and retries that unknown read", async () => {
    let unavailable = true;
    api.mockImplementation(async (path: string) => {
      if (path.endsWith("/sends")) {
        if (path.includes("PO-002") && unavailable) throw new Error("unavailable");
        return { sends: path.includes("PO-001") ? [{ kind: "confirmed_sent", channel: "email", po_version: 1, sent_at: "2026-10-05T02:20:00Z" }] : [] };
      }
      if (path.endsWith("email-capability")) return { configured: false };
      return data(path.split("/").at(-2)!);
    });
    render(<PoSupplierBundle pos={pos} onPreview={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("PO-002 · Evidence could not be loaded");
    expect(screen.getAllByText("PO sent to supplier").length).toBeGreaterThan(0);
    unavailable = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(screen.getByText("Sending not confirmed")).toBeInTheDocument();
  });
  it("keeps message and archive on the same individual selection", async () => {
    render(<PoSupplierBundle pos={pos} onPreview={() => {}} />);
    await ready();
    fireEvent.click(screen.getByLabelText("PO-002-V1"));
    expect(screen.getByLabelText("PO No")).toHaveValue("PO-001 · V1");
    fireEvent.click(screen.getByRole("button", { name: "Download PDFs" }));
    await waitFor(() => expect(zip).toHaveBeenCalledOnce());
    expect(zip.mock.calls[0][0].map((po: { id: string }) => po.id)).toEqual(["PO-001"]);
    expect(api.mock.calls.every(call => call.length === 1)).toBe(true);
  });
  it("copies the editable message with only the selected current PO versions", async () => {
    const copy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy } });
    render(<PoSupplierBundle pos={pos} onPreview={() => {}} />);
    await ready();
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Please confirm delivery." } });
    fireEvent.click(screen.getByLabelText("PO-002-V1"));
    fireEvent.click(screen.getByRole("button", { name: "Copy message" }));
    await waitFor(() => expect(copy).toHaveBeenCalledWith("Please confirm delivery.\n\nPO-001 · V1"));
  });
  it("opens the exact formal PO object independently of PDF review", async () => {
    const open = vi.fn();
    const preview = vi.fn();
    render(<PoSupplierBundle pos={pos} onPreview={preview} onOpenObject={open} />);
    await ready();
    fireEvent.click(screen.getAllByRole("button", { name: "Open full page" })[1]);
    expect(open).toHaveBeenCalledWith("PO-002", expect.objectContaining({ supplierId: "s1", selectedIds: ["PO-001", "PO-002"] }), pos);
    expect(preview).not.toHaveBeenCalled();
    expect(api.mock.calls.every(call => call.length === 1)).toBe(true);
  });
  it("restores the exact supplier, ticked subset and editable preparation after a full-object return, using fresh versions", async () => {
    const open = vi.fn();
    const view = render(<PoSupplierBundle pos={pos} onPreview={() => {}} onOpenObject={open} />);
    await ready();
    fireEvent.click(screen.getByLabelText("PO-001-V1"));
    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Delivery request" } });
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Please confirm." } });
    fireEvent.click(screen.getAllByRole("button", { name: "Open full page" })[1]);
    const preparation = open.mock.calls[0][1] as PoSupplierPreparation;
    view.unmount();
    api.mockImplementation(async (path: string) => path.endsWith("email-capability") ? { configured: false }
      : path.endsWith("/sends") ? { sends: [] }
      : path.endsWith("/issue-context") ? { ...pos.find(po => po.id === path.split("/").at(-2)), contactEmail: "current@example.invalid" }
      : { ...data(path.split("/").at(-2)!), version: 2 });
    render(<PoSupplierBundle pos={[pos[2], pos[0], pos[1]]} initialPreparation={preparation} onPreview={() => {}} />);
    await ready();
    expect(screen.getByLabelText("Supplier")).toHaveTextContent("Hooka");
    expect(screen.getByLabelText("PO-001-V2")).not.toBeChecked();
    expect(screen.getByLabelText("PO-002-V2")).toBeChecked();
    expect(screen.getByLabelText("Subject")).toHaveValue("Delivery request");
    expect(screen.getByLabelText("Message")).toHaveValue("Please confirm.");
    expect(screen.getByLabelText("PO No")).toHaveValue("PO-002 · V2");
    expect(screen.getByLabelText("To")).toHaveValue("current@example.invalid");
    expect(api.mock.calls.every(call => call.length === 1)).toBe(true);
  });
  it("refuses a mismatched current supplier source on return and retries without losing the draft or selected subset", async () => {
    let unavailable = true;
    api.mockImplementation(async (path: string) => {
      if (path.endsWith("/issue-context")) {
        const id = path.split("/").at(-2);
        if (unavailable && id === "PO-002") return { ...pos[1], id: "wrong-po" };
        return pos.find(po => po.id === id);
      }
      return path.endsWith("email-capability") ? { configured: false } : path.endsWith("/sends") ? { sends: [] } : data(path.split("/").at(-2)!);
    });
    render(<PoSupplierBundle pos={pos} initialPreparation={{ supplierId: "s1", selectedIds: ["PO-002"],
      channel: "email", scope: "round", subject: "Prepared", messageIntroduction: "Please confirm." }} onPreview={() => {}} />);
    await screen.findByText("Evidence could not be loaded");
    expect(screen.getByRole("button", { name: "Download PDFs" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Copy message" })).toBeDisabled();
    unavailable = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await ready();
    expect(screen.getByLabelText("PO-001-V1")).not.toBeChecked();
    expect(screen.getByLabelText("PO-002-V1")).toBeChecked();
    expect(screen.getByLabelText("Subject")).toHaveValue("Prepared");
    expect(screen.getByLabelText("Message")).toHaveValue("Please confirm.");
    expect(api.mock.calls.filter(([path]) => path.endsWith("/issue-context"))).toHaveLength(6);
    expect(api.mock.calls.every(call => call.length === 1)).toBe(true);
  });
  it("refreshes Today on return and drops a selected PO that no longer belongs to that scope", async () => {
    api.mockImplementation(async (path: string) => path.endsWith("issued-today") ? { pos: [pos[1]] }
      : path.endsWith("email-capability") ? { configured: false } : path.endsWith("/sends") ? { sends: [] } : data(path.split("/").at(-2)!));
    render(<PoSupplierBundle pos={pos} initialPreparation={{ supplierId: "s1", selectedIds: ["PO-001"],
      channel: "email", scope: "today", subject: "Prepared", messageIntroduction: "" }} onPreview={() => {}} />);
    await waitFor(() => {
      expect(screen.getByLabelText("PO-002-V1")).toBeInTheDocument();
      expect(screen.queryByLabelText("PO-001-V1")).not.toBeInTheDocument();
    });
    expect(screen.getByLabelText("PO-002-V1")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Download PDFs" })).toBeDisabled();
  });
  it("refuses malformed navigation presentation instead of treating it as prepared authority", () => {
    expect(readPoSupplierPreparation({ supplierId: "s1", selectedIds: [null], channel: "email", scope: "round", subject: "", messageIntroduction: "" })).toBeUndefined();
    expect(readPoSupplierPreparation({ supplierId: "s1", selectedIds: [], channel: "unknown", scope: "round", subject: "", messageIntroduction: "" })).toBeUndefined();
  });
  it("keeps restored Today preparation blocked through repeated source failures and retains the subset after retry", async () => {
    let unavailable = true;
    api.mockImplementation(async (path: string) => {
      if (path.endsWith("issued-today")) {
        if (unavailable) throw new Error("unavailable");
        return { pos };
      }
      return path.endsWith("email-capability") ? { configured: false } : path.endsWith("/sends") ? { sends: [] } : data(path.split("/").at(-2)!);
    });
    render(<PoSupplierBundle pos={pos} initialPreparation={{ supplierId: "s1", selectedIds: ["PO-002"],
      channel: "email", scope: "today", subject: "Prepared", messageIntroduction: "Please confirm." }} onPreview={() => {}} />);
    await screen.findByText("Evidence could not be loaded");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(api.mock.calls.filter(([path]) => path.endsWith("issued-today"))).toHaveLength(2));
    await waitFor(() => expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled());
    expect(screen.getByRole("button", { name: "Download PDFs" })).toBeDisabled();
    unavailable = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await ready();
    expect(screen.getByLabelText("PO-001-V1")).not.toBeChecked();
    expect(screen.getByLabelText("PO-002-V1")).toBeChecked();
    expect(screen.getByLabelText("Subject")).toHaveValue("Prepared");
    expect(screen.getByLabelText("Message")).toHaveValue("Please confirm.");
    expect(api.mock.calls.every(call => call.length === 1)).toBe(true);
  });
  it("opens the selected independent PO preview", async () => {
    const open = vi.fn();
    render(<PoSupplierBundle pos={pos} onPreview={open} />);
    await ready();
    fireEvent.click(screen.getAllByRole("button", { name: "Open PDF" })[1]);
    expect(open).toHaveBeenCalledWith("PO-002", pos[1]);
  });
  it("loads Today across rounds without mixing it into This round", async () => {
    const today = [{ ...pos[0], id: "PO-today" }];
    api.mockImplementation(async (path: string) => path.endsWith("issued-today") ? { pos: today } : data(path.split("/").at(-2)!));
    render(<PoSupplierBundle pos={pos} onPreview={() => {}} />);
    await ready();
    fireEvent.click(screen.getByRole("combobox", { name: "Purchase orders" }));
    fireEvent.click(await screen.findByRole("option", { name: "Today" }));
    await waitFor(() => expect(screen.getByLabelText("PO No")).toHaveValue("PO-today · V1"));
    fireEvent.click(screen.getByRole("combobox", { name: "Purchase orders" }));
    fireEvent.click(await screen.findByRole("option", { name: "Purchase orders" }));
    await waitFor(() => expect(screen.getByLabelText("PO No")).toHaveValue("PO-001 · V1\nPO-002 · V1"));
  });
  it("blocks preparation when This round cannot be read and retries without a business write", async () => {
    let unavailable = true;
    api.mockImplementation(async (path: string) => {
      if (path.includes("issued-round")) { if (unavailable) throw new Error("unavailable"); return { poIds: ["PO-001"] }; }
      if (path.endsWith("issue-context")) return pos[0];
      if (path.endsWith("/sends")) return { sends: [] };
      if (path.endsWith("email-capability")) return { configured: false };
      return data(path.split("/").at(-2)!);
    });
    render(<PoSupplierBundle pos={[pos[0]]} roundWindow="2026-10-05T10:15" onPreview={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Evidence could not be loaded");
    expect(screen.getByRole("button", { name: "Download PDFs" })).toBeDisabled();
    unavailable = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await ready();
    expect(api.mock.calls.every(call => call.length === 1)).toBe(true);
  });
  it("shows earlier issued POs in the selected round without selecting them for sending", async () => {
    api.mockImplementation(async (path: string) => {
      if (path.includes("issued-round")) return { poIds: ["PO-001", "PO-earlier"] };
      if (path.endsWith("issue-context")) return { ...pos[0], id: path.split("/").at(-2)! };
      return data(path.split("/").at(-2)!);
    });
    render(<PoSupplierBundle pos={[pos[0]]} roundWindow="2026-10-05T10:15" onPreview={() => {}} />);
    await waitFor(() => expect(screen.getByLabelText("PO-earlier-V1")).toBeInTheDocument());
    expect(screen.getByLabelText("PO-earlier-V1")).not.toBeChecked();
    expect(screen.getByLabelText("PO No")).toHaveValue("PO-001 · V1");
  });
  it("does not download or mark sent if rendering fails", async () => {
    renderPdf.mockRejectedValue(new Error("cannot render"));
    render(<PoSupplierBundle pos={pos} onPreview={() => {}} />);
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Download PDFs" }));
    await screen.findByRole("alert");
    expect(zip).not.toHaveBeenCalled();
    expect(api.mock.calls.every(call => call.length === 1)).toBe(true);
  });
});


describe("human-triggered supplier email", () => {
  function configured(outcome: unknown) {
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.endsWith("email-capability")) return { configured: true };
      if (path.endsWith("/email-attempts")) return { attempts: [] };
      if (path.endsWith("/sends")) return { sends: [] };
      if (path.endsWith("supplier-email")) {
        if (outcome instanceof Error) throw outcome;
        return outcome;
      }
      if (init?.method === "POST") return { ok: true };
      return data(path.split("/").at(-2)!);
    });
  }
  it("sends only the selected separate PDF and server contact with editable text", async () => {
    configured({ status: "dispatched", providerId: "email-1", documents: [{ id: "PO-001", version: 1, recorded: true }] });
    render(<PoSupplierBundle pos={pos} onPreview={() => {}} />);
    await ready();
    fireEvent.click(screen.getByLabelText("PO-002-V1"));
    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Carres purchase" } });
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Please arrange delivery." } });
    fireEvent.click(screen.getByRole("button", { name: "Send Email" }));
    await screen.findByText("PO sent to supplier · Email");
    const body = JSON.parse(api.mock.calls.find(call => call[0].endsWith("supplier-email"))![1].body);
    expect(body).toMatchObject({ supplierId: "s1", recipient: "supplier@example.invalid", subject: "Carres purchase", message: "Please arrange delivery." });
    expect(body.documents).toEqual([{ id: "PO-001", version: 1, filename: "PO-001-V1.pdf", content: btoa("%PDF-1.4") }]);
    expect(screen.getByRole("button", { name: "Send Email" })).toBeDisabled();
  });
  it("retries failed evidence only, without another supplier email", async () => {
    configured({ status: "dispatched", providerId: "email-1", documents: [
      { id: "PO-001", version: 1, recorded: true }, { id: "PO-002", version: 1, recorded: false },
    ] });
    render(<PoSupplierBundle pos={pos} onPreview={() => {}} />);
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Send Email" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument());
    const writes = api.mock.calls.filter(call => call[1]?.method === "POST");
    expect(writes.map(call => call[0])).toEqual(["/api/operation/pos/supplier-email", "/api/operation/pos/PO-002/confirm-sent"]);
    expect(JSON.parse(writes[1][1].body)).toMatchObject({ recipient: "supplier@example.invalid", poVersion: 1, channel: "email" });
  });
  it("retains an unknown outcome through reopening and refuses silent resend", async () => {
    configured(new Error("lost response"));
    const first = render(<PoSupplierBundle pos={pos} onPreview={() => {}} />);
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Send Email" }));
    await screen.findByRole("status");
    first.unmount();
    render(<PoSupplierBundle pos={pos} onPreview={() => {}} />);
    await ready();
    expect(screen.getByRole("button", { name: "Send Email" })).toBeDisabled();
    expect(api.mock.calls.filter(call => call[0].endsWith("supplier-email"))).toHaveLength(1);
  });
  it("restores server success after browser storage is cleared without resending", async () => {
    configured({});
    const configuredRead = api.getMockImplementation()!;
    api.mockImplementation(async (path: string, init?: RequestInit) => path.endsWith("/email-attempts")
      ? { attempts: [{ id: "server-attempt", status: "dispatched", providerId: "saved-email", recipient: "supplier@example.invalid",
        documents: [{ id: path.split("/").at(-2), version: 1 }] }] }
      : configuredRead(path, init));
    render(<PoSupplierBundle pos={pos} onPreview={() => {}} />);
    await screen.findByText("PO sent to supplier · Email");
    expect(screen.getByRole("button", { name: "Send Email" })).toBeDisabled();
    expect(api.mock.calls.filter(call => call[0].endsWith("supplier-email"))).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument());
    expect(api.mock.calls.filter(call => call[0].endsWith("confirm-sent"))).toHaveLength(2);
  });
  it("blocks dispatch while server attempt history cannot be read", async () => {
    configured({});
    const configuredRead = api.getMockImplementation()!;
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.endsWith("/email-attempts")) throw new Error("history offline");
      return configuredRead(path, init);
    });
    render(<PoSupplierBundle pos={pos} onPreview={() => {}} />);
    await screen.findAllByRole("alert");
    expect(screen.getByRole("button", { name: "Send Email" })).toBeDisabled();
    expect(api.mock.calls.filter(call => call[0].endsWith("supplier-email"))).toHaveLength(0);
  });
  it("requires an explicit resend choice for a known successful current-version dispatch", async () => {
    configured({ status: "dispatched", providerId: "email-new", documents: pos.slice(0, 2).map(po => ({ id: po.id, version: 1, recorded: true })) });
    const configuredRead = api.getMockImplementation()!;
    api.mockImplementation(async (path: string, init?: RequestInit) => path.endsWith("/sends")
      ? { sends: [{ kind: "confirmed_sent", channel: "email", po_version: 1, sent_at: "2026-10-04T08:00:00Z" }] }
      : configuredRead(path, init));
    render(<PoSupplierBundle pos={pos} onPreview={() => {}} />);
    await screen.findByLabelText("Send again");
    expect(screen.getByRole("button", { name: "Send Email" })).toBeDisabled();
    fireEvent.click(screen.getByLabelText("Send again"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Send Email" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Send Email" }));
    await screen.findByText("PO sent to supplier · Email");
    const input = JSON.parse(api.mock.calls.find(call => call[0].endsWith("supplier-email"))![1].body);
    expect(input.resend).toBe(true);
    expect(input.documents.map((document: { id: string }) => document.id)).toEqual(["PO-001", "PO-002"]);
    expect(screen.getByRole("button", { name: "Send Email" })).toBeDisabled();
  });
  it("clears a local unknown record only after the server reports a definite failed dispatch", async () => {
    sessionStorage.setItem("carres-po-email-attempts:unidentified", JSON.stringify([{ id: "failed-attempt", status: "unknown", recipient: "supplier@example.invalid", documents: [{ id: "PO-001", version: 1, recorded: false }] }]));
    configured({});
    const configuredRead = api.getMockImplementation()!;
    api.mockImplementation(async (path: string, init?: RequestInit) => path.endsWith("/email-attempts")
      ? { attempts: [{ id: "failed-attempt", status: "failed", recipient: "supplier@example.invalid", documents: [{ id: "PO-001", version: 1 }] }] }
      : configuredRead(path, init));
    render(<PoSupplierBundle pos={pos} onPreview={() => {}} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Send Email" })).toBeEnabled());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(api.mock.calls.filter(call => call[0].endsWith("supplier-email"))).toHaveLength(0);
  });
  it("a definite permission refusal leaves no uncertain dispatch record", async () => {
    configured(new ApiError(403, "forbidden", { code: "forbidden" }));
    render(<PoSupplierBundle pos={pos} onPreview={() => {}} />);
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Send Email" }));
    await screen.findByRole("alert");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send Email" })).toBeEnabled();
  });
});
