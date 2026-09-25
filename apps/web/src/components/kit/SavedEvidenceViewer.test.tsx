import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import SavedEvidenceViewer, { type SavedEvidenceFile } from "./SavedEvidenceViewer";

async function click(element: HTMLElement) {
  element.focus();
  fireEvent.click(element);
  await act(async () => {});
}

const files: SavedEvidenceFile[] = [
  { id: "a", kind: "photo", url: "https://example.test/a.png", context: "GRN-1 · Arrival evidence", unitCodes: ["U1-000-001"] },
  { id: "b", kind: "photo", url: null, context: "GRN-2 · Arrival evidence", unitCodes: ["U1-000-002"] },
  { id: "v", kind: "video", url: "https://example.test/v.mp4", context: "GRN-3 · Arrival evidence" },
];
function Harness({ retry = vi.fn(async () => null) }: { retry?: (id: string) => Promise<string | null> }) {
  const [active, setActive] = useState<string | null>(null);
  return <><button onClick={() => setActive("a")}>Open evidence</button>
    <SavedEvidenceViewer files={files} activeId={active} onClose={() => setActive(null)} onRetry={retry} /></>;
}

describe("saved evidence viewer", () => {
  it("keeps source and Unit visible, enlarges and resets, and returns focus after Escape", async () => {
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open evidence" });
    await click(opener);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("GRN-1 · Arrival evidence")).toBeVisible();
    expect(within(dialog).getByText("U1-000-001")).toBeVisible();
    expect(within(dialog).getByRole("status")).toHaveTextContent("Loading");
    const photo = within(dialog).getByRole("img", { name: "Photo 1" });
    fireEvent.load(photo);
    await click(within(dialog).getByRole("button", { name: "Zoom in" }));
    expect(photo.style.transform).toContain("scale(1.5)");
    const region = within(dialog).getByRole("region", { name: "Photo 1" });
    vi.spyOn(region, "getBoundingClientRect").mockReturnValue({ width: 200, height: 100 } as DOMRect);
    fireEvent.keyDown(region, { key: "ArrowRight" });
    expect(photo.style.transform).toContain("translate(-32px, 0px)");
    fireEvent.keyDown(region, { key: "ArrowRight" });
    expect(photo.style.transform).toContain("translate(-50px, 0px)");
    await click(within(dialog).getByRole("button", { name: "Reset" }));
    expect(photo.style.transform).toContain("scale(1)");
    fireEvent.keyDown(document.activeElement ?? document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
  });

  it("retains unreadable files, refreshes through the owning reader, and preserves each file's context", async () => {
    const retry = vi.fn(async () => "https://example.test/refreshed.png");
    render(<Harness retry={retry} />);
    await click(screen.getByRole("button", { name: "Open evidence" }));
    await click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Photo 2 could not be loaded");
    expect(screen.getByText("U1-000-002")).toBeVisible();
    expect(screen.queryByText("U1-000-001")).not.toBeInTheDocument();
    await click(screen.getByRole("button", { name: "Try again" }));
    const photo = await screen.findByRole("img", { name: "Photo 2" });
    expect(retry).toHaveBeenCalledWith("b");
    expect(photo).toHaveAttribute("src", "https://example.test/refreshed.png");
    fireEvent.error(photo);
    expect(screen.getByRole("alert")).toHaveTextContent("Photo 2 could not be loaded");
  });

  it("unmounts an expired media URL while refreshing so its error cannot defeat the new URL", async () => {
    let finish!: (url: string | null) => void;
    render(<Harness retry={() => new Promise((resolve) => { finish = resolve; })} />);
    await click(screen.getByRole("button", { name: "Open evidence" }));
    fireEvent.error(screen.getByRole("img", { name: "Photo 1" }));
    await click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
    await act(async () => finish("https://example.test/fresh.png"));
    const photo = screen.getByRole("img", { name: "Photo 1" });
    expect(photo).toHaveAttribute("src", "https://example.test/fresh.png");
    fireEvent.load(photo);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeEnabled();
  });

  it("returns keyboard focus from native fullscreen controls so Escape closes the viewer", async () => {
    let fullscreenElement: Element | null = null;
    const original = Object.getOwnPropertyDescriptor(document, "fullscreenElement");
    Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => fullscreenElement });
    try {
      render(<Harness />);
      const opener = screen.getByRole("button", { name: "Open evidence" });
      await click(opener);
      await click(screen.getByRole("button", { name: "Next" }));
      await click(screen.getByRole("button", { name: "Next" }));
      fullscreenElement = screen.getByLabelText("Video 3", { selector: "video" });
      fireEvent(document, new Event("fullscreenchange"));
      fullscreenElement = null;
      fireEvent(document, new Event("fullscreenchange"));
      await waitFor(() => expect(document.activeElement).toHaveAttribute("data-kit", "saved-evidence-viewer"));
      fireEvent.keyDown(document.activeElement!, { key: "Escape" });
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(opener).toHaveFocus();
    } finally {
      if (original) Object.defineProperty(document, "fullscreenElement", original);
      else Reflect.deleteProperty(document, "fullscreenElement");
    }
  });

  it("cannot replace another file with a late retry, and video keeps native playback controls without photo zoom", async () => {
    let finish!: (url: string | null) => void;
    render(<Harness retry={() => new Promise((resolve) => { finish = resolve; })} />);
    await click(screen.getByRole("button", { name: "Open evidence" }));
    await click(screen.getByRole("button", { name: "Next" }));
    await click(screen.getByRole("button", { name: "Try again" }));
    await click(screen.getByRole("button", { name: "Next" }));
    await act(async () => finish("https://example.test/stale.png"));
    const video = screen.getByLabelText("Video 3", { selector: "video" });
    expect(video).toHaveAttribute("src", "https://example.test/v.mp4");
    expect(video).toHaveAttribute("controls");
    expect(screen.queryByRole("button", { name: "Zoom in" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    fireEvent.loadedMetadata(video);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
