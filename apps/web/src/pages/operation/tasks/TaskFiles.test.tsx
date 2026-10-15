import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TaskFiles from "./TaskFiles";
import type { TaskFile } from "./task-view";

vi.mock("@/components/kit/PdfPreview", () => ({ default: ({ src, title }: { src: string; title: string }) => <section aria-label={title} data-src={src}>TEST painted document</section> }));
const createUrl = vi.fn(() => "blob:test-document");
const revokeUrl = vi.fn();
const pdf = () => new Blob(["TEST document"], { type: "application/pdf" });
const file = (key: string, load: TaskFile["load"]): TaskFile => ({ key, name: `${key}.pdf`, detail: "Sales Order", load });
const mount = (files: TaskFile[]) => render(<TaskFiles stages={[{ key: "sales-order", title: "Sales Order", files }]} />);

beforeEach(() => {
  createUrl.mockClear(); revokeUrl.mockClear();
  vi.stubGlobal("URL", class extends URL {
    static createObjectURL = createUrl;
    static revokeObjectURL = revokeUrl;
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Task Files source-read retry", () => {
  it("loads only on request and retries the same source after failure", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("read failed")).mockResolvedValueOnce(pdf());
    mount([file("SO-TEST-A", load)]);
    expect(load).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "View SO-TEST-A.pdf" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This file could not be opened");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("region", { name: "SO-TEST-A.pdf" })).toHaveAttribute("data-src", "blob:test-document");
    expect(load).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps a second failed read retryable and never paints a false success", async () => {
    const load = vi.fn().mockRejectedValue(new Error("still unavailable"));
    mount([file("SO-TEST-A", load)]);
    fireEvent.click(screen.getByRole("button", { name: "View SO-TEST-A.pdf" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("alert")).toHaveTextContent("This file could not be opened");
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
    expect(createUrl).not.toHaveBeenCalled();
  });

  it("a closed file's late answer cannot replace the next file", async () => {
    let answer!: (value: Blob) => void;
    const old = vi.fn(() => new Promise<Blob>((resolve) => { answer = resolve; }));
    const next = vi.fn().mockResolvedValue(pdf());
    mount([file("SO-TEST-A", old), file("SO-TEST-B", next)]);
    fireEvent.click(screen.getByRole("button", { name: "View SO-TEST-A.pdf" }));
    await waitFor(() => expect(old).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: /^Close$/ }));
    fireEvent.click(screen.getByRole("button", { name: "View SO-TEST-B.pdf" }));
    await screen.findByRole("region", { name: "SO-TEST-B.pdf" });
    await act(async () => answer(pdf()));
    expect(createUrl).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog", { name: "SO-TEST-B.pdf" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "SO-TEST-A.pdf" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Close$/ }));
    expect(revokeUrl).toHaveBeenCalledWith("blob:test-document");
  });
});
