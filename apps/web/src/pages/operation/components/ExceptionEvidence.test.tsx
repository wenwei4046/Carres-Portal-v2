import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";
import {
  ExceptionEvidenceDoors,
  ExceptionEvidenceViewer,
  type EvidenceScope,
} from "./ExceptionEvidence";

/**
 * THE SIX DOORS AND THE ONE VIEWER (owner instruction 2026-09-13 §6).
 *
 * The viewer's five states are asserted in words; the doors' counts are the
 * server's verified numbers or `Not verified`, never a reassuring zero; and
 * a zero exception draws no door at all.
 */

const h = vi.hoisted(() => ({
  response: null as unknown,
  error: null as unknown,
  loading: false,
  asks: [] as unknown[],
}));

vi.mock("@/lib/queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    useReceivingLineEvidence: (id: string, scope: unknown) => {
      h.asks.push({ id, scope });
      return {
        data: h.response,
        error: h.error,
        isLoading: h.loading,
        isError: h.error != null,
        refetch: () => Promise.resolve(),
      };
    },
  };
});

const SCOPE: EvidenceScope = {
  receiptId: "r-1",
  grnNo: "GRN-20260903-1184",
  type: "damaged",
  kind: "photo",
  lines: [
    { lineKey: "l1", name: "Forte · King · Firmness Medium", qty: 1 },
    { lineKey: "l5", name: "Quinn · King", qty: 2 },
  ],
};

function renderViewer(scope: EvidenceScope = SCOPE) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ExceptionEvidenceViewer scope={scope} onClose={() => {}} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.response = null;
  h.error = null;
  h.loading = false;
  h.asks.length = 0;
});

describe("ExceptionEvidenceViewer — the five states", () => {
  it("asks for EXACTLY the GRN + line keys + exception + kind, and names every covered line", () => {
    h.response = { receipt_id: "r-1", verified: true, files: [] };
    renderViewer();
    expect(h.asks[0]).toEqual({ id: "r-1", scope: { type: "damaged", kind: "photo", lineKeys: ["l1", "l5"] } });
    expect(screen.getByRole("dialog")).toHaveTextContent("Damaged Photos · GRN-20260903-1184");
    const lines = screen.getByTestId("exception-evidence-lines");
    expect(lines).toHaveTextContent("Forte · King · Firmness Medium (1 damaged)");
    expect(lines).toHaveTextContent("Quinn · King (2 damaged)");
  });

  it("loading", () => {
    h.loading = true;
    renderViewer();
    expect(screen.getByTestId("exception-evidence-loading")).toHaveTextContent("Opening the evidence…");
  });

  it("verified no files — an empty answer the store actually gave", () => {
    h.response = { receipt_id: "r-1", verified: true, files: [] };
    const first = renderViewer();
    expect(screen.getByTestId("exception-evidence-empty")).toHaveTextContent("No photos on file for this exception.");
    first.unmount();
    renderViewer({ ...SCOPE, kind: "video" });
    expect(screen.getByTestId("exception-evidence-empty")).toHaveTextContent("No videos on file for this exception.");
  });

  it("records not verified — the store did not answer, which is not zero", () => {
    h.response = { receipt_id: "r-1", verified: false, files: [] };
    renderViewer();
    expect(screen.getByTestId("exception-evidence-not-verified")).toHaveTextContent("could not be verified");
    expect(screen.queryByTestId("exception-evidence-empty")).not.toBeInTheDocument();
  });

  it("permission denied", () => {
    h.error = new ApiError(403, "forbidden", {});
    renderViewer();
    expect(screen.getByTestId("exception-evidence-denied")).toHaveTextContent("You do not have permission to open this evidence.");
  });

  it("load failure with Try again", () => {
    h.error = new ApiError(500, "boom", {});
    renderViewer();
    expect(screen.getByTestId("exception-evidence-failed")).toHaveTextContent("The evidence could not be opened");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("shows the files it has, names a recorded file the bucket lacks, enlarges a photo and steps through with ‹ › and the arrow keys", () => {
    h.response = {
      receipt_id: "r-1",
      verified: true,
      files: [
        { id: "e1", line_key: "l1", path: "PO-1/a.jpg", kind: "photo", url: "blob:a", status: "ok", source: "posting", added_at: "2026-09-03T02:05:00Z", added_by_name: "Shasha" },
        { id: "e2", line_key: "l1", path: "PO-1/b.jpg", kind: "photo", url: null, status: "missing", source: "posting", added_at: "2026-09-03T02:05:00Z", added_by_name: "Shasha" },
        { id: "e3", line_key: "l5", path: "PO-1/c.jpg", kind: "photo", url: "blob:c", status: "ok", source: "amend", added_at: "2026-09-04T02:05:00Z", added_by_name: "Khor Yee" },
      ],
    };
    renderViewer();
    expect(screen.getAllByTestId("exception-evidence-photo")).toHaveLength(2);
    expect(screen.getByTestId("exception-evidence-missing")).toHaveTextContent("Recorded file is not in storage");
    fireEvent.click(screen.getAllByTestId("exception-evidence-photo")[0]!);
    const big = screen.getByTestId("exception-evidence-enlarged");
    expect(big).toHaveTextContent("1 of 2 · Forte · King · Firmness Medium");
    expect(within(big).getByRole("img")).toHaveAttribute("src", "blob:a");
    fireEvent.click(within(big).getByRole("button", { name: "Next" }));
    expect(screen.getByTestId("exception-evidence-enlarged")).toHaveTextContent("2 of 2 · Quinn · King");
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByTestId("exception-evidence-enlarged")).toHaveTextContent("1 of 2");
    fireEvent.click(screen.getByRole("button", { name: "Back to all files" }));
    expect(screen.queryByTestId("exception-evidence-enlarged")).not.toBeInTheDocument();
  });

  it("a viewer on ONE line does not repeat that line's name on every tile — the tile carries what differs (owner correction 2026-09-14)", () => {
    h.response = {
      receipt_id: "r-1",
      verified: true,
      files: [
        { id: "e1", line_key: "l5", path: "PO-1/c.jpg", kind: "photo", url: "blob:c", status: "ok", source: "posting", added_at: "2026-09-03T02:05:00Z", added_by_name: "Shasha" },
        { id: "e2", line_key: "l5", path: "PO-1/d.jpg", kind: "photo", url: "blob:d", status: "ok", source: "amend", added_at: "2026-09-04T02:05:00Z", added_by_name: "Khor Yee" },
      ],
    };
    renderViewer({ ...SCOPE, lines: [{ lineKey: "l5", name: "Quinn · King", qty: 1 }] });
    /* The `For:` line says WHICH goods, once. */
    expect(screen.getByTestId("exception-evidence-lines")).toHaveTextContent("Quinn · King (1 damaged)");
    const tiles = screen.getAllByTestId("exception-evidence-photo");
    expect(tiles).toHaveLength(2);
    /* …and no tile says it again. */
    for (const tile of tiles) expect(tile).not.toHaveTextContent("Quinn · King");
    expect(tiles[0]!).toHaveTextContent("Thu, 3 Sep · Shasha");
    expect(tiles[1]!).toHaveTextContent("Fri, 4 Sep · Khor Yee");
    /* The enlarged picture follows the same rule. */
    fireEvent.click(tiles[0]!);
    const big = screen.getByTestId("exception-evidence-enlarged");
    expect(big).toHaveTextContent("1 of 2 · Thu, 3 Sep");
    expect(big).not.toHaveTextContent("Quinn · King");
  });

  it("plays a video in a real player and names an unsigned file as not verified", () => {
    h.response = {
      receipt_id: "r-1",
      verified: true,
      files: [
        { id: "v1", line_key: "l1", path: "PO-1/a.mp4", kind: "video", url: "blob:v", status: "ok", source: "posting", added_at: "2026-09-03T02:05:00Z", added_by_name: null },
        { id: "v2", line_key: "l1", path: "PO-1/b.mp4", kind: "video", url: null, status: "unsigned", source: "posting", added_at: "2026-09-03T02:05:00Z", added_by_name: null },
      ],
    };
    renderViewer({ ...SCOPE, kind: "video" });
    const player = within(screen.getByTestId("exception-evidence-video")).getByText((_, el) => el?.tagName === "VIDEO");
    expect(player).toHaveAttribute("src", "blob:v");
    expect(player).toHaveAttribute("controls");
    expect(screen.getByTestId("exception-evidence-unsigned")).toHaveTextContent("File could not be opened — not verified");
  });
});

describe("ExceptionEvidenceDoors", () => {
  const facts = [
    { type: "damaged" as const, lineKey: "l1", sku: "A", qty: 1 },
    { type: "wrong_item" as const, lineKey: "l2", sku: "B", qty: 0 },
    { type: "extra" as const, lineKey: "", sku: "OLD", qty: 2 },
  ];
  const nameOf = (key: string) => `Name of ${key}`;

  it("draws Photos and Videos for a POSITIVE exception with the verified counts, and opens the scoped viewer", () => {
    const onOpen = vi.fn();
    render(
      <ExceptionEvidenceDoors
        receiptId="r-1"
        grnNo="GRN-1"
        type="damaged"
        facts={facts}
        nameOf={nameOf}
        counts={[{ exception_type: "damaged", line_key: "l1", media_kind: "photo", count: 2 }]}
        onOpen={onOpen}
        testId="d"
      />,
    );
    expect(screen.getByTestId("d-damaged-photo")).toHaveTextContent("Photos 2");
    expect(screen.getByTestId("d-damaged-video")).toHaveTextContent("Videos 0");
    fireEvent.click(screen.getByTestId("d-damaged-video"));
    expect(onOpen).toHaveBeenCalledWith({
      receiptId: "r-1",
      grnNo: "GRN-1",
      type: "damaged",
      kind: "video",
      lines: [{ lineKey: "l1", name: "Name of l1", qty: 1 }],
    });
  });

  it("draws nothing for a zero exception, nothing for a line with no identity, and `Not verified` when the store did not answer", () => {
    const { container, rerender } = render(
      <ExceptionEvidenceDoors receiptId="r-1" grnNo="GRN-1" type="wrong_item" facts={facts} nameOf={nameOf} counts={[]} onOpen={() => {}} testId="d" />,
    );
    expect(container).toBeEmptyDOMElement();
    rerender(
      <ExceptionEvidenceDoors receiptId="r-1" grnNo="GRN-1" type="extra" facts={facts} nameOf={nameOf} counts={[]} onOpen={() => {}} testId="d" />,
    );
    expect(container).toBeEmptyDOMElement();
    rerender(
      <ExceptionEvidenceDoors receiptId="r-1" grnNo="GRN-1" type="damaged" facts={facts} nameOf={nameOf} counts={undefined} onOpen={() => {}} testId="d" />,
    );
    expect(screen.getByTestId("d-damaged-photo")).toHaveTextContent("Photos · Not verified");
    expect(screen.getByTestId("d-damaged-photo")).not.toHaveTextContent("0");
  });
});
