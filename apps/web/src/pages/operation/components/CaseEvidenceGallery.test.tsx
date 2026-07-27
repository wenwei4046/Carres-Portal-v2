import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import CaseEvidenceGallery from "./CaseEvidenceGallery";

/**
 * S2's second acceptance, exactly as the card words it: "each file shows its
 * uploader role in the case view."
 *
 * The stamp is the SERVER'S (0289 refuses an entry without it), so the job here
 * is to report it — including for a case that predates S2 and has none.
 */

const apiFetchMock = vi.fn();
vi.mock("@/lib/api", () => ({ apiFetch: (...a: unknown[]) => apiFetchMock(...a) }));
vi.mock("@/lib/case-evidence-upload", () => ({
  uploadCaseEvidence: vi.fn(),
  attachCaseEvidence: vi.fn(),
}));

const EVIDENCE = [
  {
    slot: "overall_photo",
    path: "case/c1/a-overall_photo.jpg",
    kind: "photo",
    at: "2026-07-27T07:14:00Z",
    by: "u-1",
    byRole: "operation",
    url: "https://signed.example/a.jpg",
  },
  {
    slot: "pan_video",
    path: "case/c1/b-pan_video.mp4",
    kind: "video",
    at: "2026-07-27T07:20:00Z",
    by: "u-2",
    byRole: "principal",
    url: "https://signed.example/b.mp4",
  },
];

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

beforeEach(() => {
  apiFetchMock.mockReset();
  apiFetchMock.mockResolvedValue({ evidence: EVIDENCE });
});

describe("CaseEvidenceGallery", () => {
  it("names every file's uploader role and when it was taken", async () => {
    render(wrap(<CaseEvidenceGallery caseId="c1" issueType="colour_uneven" reportedBy="customer" />));

    // Anchored on the stamp, not on a label: the "add a photo" picker lists the
    // same labels, so waiting for one of those would pass while still loading.
    expect(await screen.findByText(/operation ·/)).toBeInTheDocument();
    expect(screen.getByText(/principal ·/)).toBeInTheDocument();
    expect(screen.getAllByText("Photo of the whole item").length).toBeGreaterThan(0);
    // The date law's shape ("27 Jul 26"), plus the time — two photos of the same
    // fault on the same day is the normal case. Matched as a PATTERN, not as the
    // literal date: the stamp renders in the reader's timezone, so asserting
    // "27 Jul" would pass in Kuala Lumpur and fail in a US CI runner.
    expect(screen.getAllByText(/\d{2} [A-Za-z]{3} 26 · \d{2}:\d{2}/)).toHaveLength(2);
  });

  it("counts the files in the heading so the case says how much proof it has", async () => {
    render(wrap(<CaseEvidenceGallery caseId="c1" issueType="damaged" reportedBy="customer" />));
    expect(await screen.findByText("Evidence · 2")).toBeInTheDocument();
  });

  it("renders a video as an icon, not a broken image", async () => {
    render(wrap(<CaseEvidenceGallery caseId="c1" issueType="colour_uneven" reportedBy="customer" />));
    await screen.findByText(/operation ·/);
    // One <img> only — the photo. The video gets an icon.
    expect(screen.getAllByRole("img")).toHaveLength(1);
  });

  it("tells the truth about a case filed before photos were part of it", async () => {
    apiFetchMock.mockResolvedValue({ evidence: [] });
    render(wrap(<CaseEvidenceGallery caseId="c1" issueType={null} reportedBy={null} />));

    // Rule 5 — the empty state teaches instead of saying "no results".
    expect(await screen.findByText(/filed before photos became part of opening one/)).toBeInTheDocument();
  });

  it("still lists a file whose signed url could not be minted", async () => {
    // A ledger that quietly shortens is a ledger that lies about what was taken.
    apiFetchMock.mockResolvedValue({ evidence: [{ ...EVIDENCE[0], url: null }] });
    render(wrap(<CaseEvidenceGallery caseId="c1" issueType="damaged" reportedBy="customer" />));

    expect(await screen.findByText(/operation ·/)).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("offers the case's own checklist slots to add to, and no delete", async () => {
    render(wrap(<CaseEvidenceGallery caseId="c1" issueType="wrong_sku" reportedBy="customer" />));
    await screen.findByText(/operation ·/);

    const picker = screen.getByLabelText("What kind of photo to add") as HTMLSelectElement;
    const options = Array.from(picker.options).map((o) => o.text);
    expect(options).toContain("Photo of the label on the item");
    // ...plus a slot already on file that this issue type never asks for, so a
    // legacy file's slot never becomes un-addable.
    expect(options).toContain("Video of the whole item, 10 to 20 seconds");

    // Evidence is evidence: nothing removes a file.
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /remove|delete/i })).toBeNull();
    });
  });
});
