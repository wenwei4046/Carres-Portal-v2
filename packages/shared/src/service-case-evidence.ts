/**
 * Service Case evidence checklists (S2, service-case execution queue —
 * Jess 2026-07-27). **No evidence, no service case.**
 *
 * S1 made the intake a set of closed questions. S2 makes the ANSWER to question
 * 3 ("what is wrong") decide what must be photographed before the case may be
 * filed at all. The checklist is shown as a tick-list with plain instructions,
 * because the instruction IS the training: a new hire who has never handled a
 * colour complaint still knows to film left-to-right, slowly, in daylight.
 *
 * Same law as T4's delivery reasons and S1's intake lists: ONE shared constant,
 * NOT a config table. `slot` keys are what gets STORED, so labels and
 * instructions can be reworded without re-tagging a single filed case, and S5
 * can later count "cases with no close-up" in one pass.
 *
 * Two structures, on purpose:
 *   - CASE_EVIDENCE_SLOTS       — the global registry of WHAT a piece of
 *                                 evidence is (label, photo vs video, the
 *                                 default instruction). Global so "close-up"
 *                                 means the same thing on a sofa and a mattress.
 *   - CASE_EVIDENCE_BY_ISSUE    — per issue type: which slots, how many, and
 *                                 whether it blocks submission. An issue may
 *                                 override the instruction where the reason to
 *                                 take the photo differs (a close-up of missing
 *                                 parts is aimed at an empty space, not damage).
 *
 * ── The card's checklist, and the one place it cannot be followed literally ──
 *
 * The card's worked example is Colour uneven → customer WhatsApp screenshot ·
 * overall photo · close-up x2 · SKU label · 10-20s video. That is implemented
 * verbatim. But a screenshot of the CUSTOMER'S message cannot exist when the
 * WAREHOUSE found the problem before it ever shipped — and a required item that
 * cannot be produced does not stop a bad case, it teaches staff to upload a junk
 * photo to get past the gate. So an item may name the `reporters` it applies to,
 * and the customer-message slot only applies when question 1 said "Customer".
 * Every other required item applies to every reporter.
 */
import type { CaseIssueKey, CaseReporterKey } from "./service-case-intake";

// ── What a piece of evidence IS ──────────────────────────────────────────────

export type CaseEvidenceKind = "photo" | "video";

export type CaseEvidenceSlotKey =
  | "overall_photo"
  | "closeup_photo"
  | "sku_label_photo"
  | "packaging_photo"
  | "measurement_photo"
  | "customer_message"
  | "pan_video";

export interface CaseEvidenceSlot {
  key: CaseEvidenceSlotKey;
  label: string;
  kind: CaseEvidenceKind;
  /** How to take it. Plain words, imperative, ≤ 2 short sentences. */
  instruction: string;
}

export const CASE_EVIDENCE_SLOTS = [
  {
    key: "overall_photo",
    label: "Photo of the whole item",
    kind: "photo",
    instruction: "Stand back so the whole item fits in one photo.",
  },
  {
    key: "closeup_photo",
    label: "Close-up of the problem",
    kind: "photo",
    instruction: "Get close enough that the problem is obvious without explaining it.",
  },
  {
    key: "sku_label_photo",
    label: "Photo of the label on the item",
    kind: "photo",
    instruction: "The sticker on the item or its box. The code must be readable.",
  },
  {
    key: "packaging_photo",
    label: "Photo of the box it came in",
    kind: "photo",
    instruction: "Show whether the box is torn or wet. This decides who pays.",
  },
  {
    key: "measurement_photo",
    label: "Photo with a measuring tape",
    kind: "photo",
    instruction: "Lay the tape on the item so the size can be read in the photo.",
  },
  {
    key: "customer_message",
    label: "Screenshot of the customer's message",
    kind: "photo",
    instruction: "The WhatsApp chat where the customer told us about it.",
  },
  {
    key: "pan_video",
    label: "Video of the whole item, 10 to 20 seconds",
    kind: "video",
    instruction: "Film slowly from left to right in daylight. Do not stop halfway.",
  },
] as const satisfies readonly CaseEvidenceSlot[];

export const CASE_EVIDENCE_SLOT_KEYS = CASE_EVIDENCE_SLOTS.map((s) => s.key) as [
  CaseEvidenceSlotKey,
  ...CaseEvidenceSlotKey[],
];

export function caseEvidenceSlot(key: string | null | undefined): CaseEvidenceSlot | null {
  if (!key) return null;
  return CASE_EVIDENCE_SLOTS.find((s) => s.key === key) ?? null;
}

/** Stored slot key → display label. An unknown key displays as itself rather
 *  than vanishing, so a file filed under a retired slot is still visible. */
export function caseEvidenceSlotLabel(key: string | null | undefined): string {
  if (!key) return "—";
  return caseEvidenceSlot(key)?.label ?? key;
}

// ── Which evidence each issue type demands ───────────────────────────────────

export interface CaseEvidenceRule {
  slot: CaseEvidenceSlotKey;
  /** How many files this slot needs. 1 unless the checklist asks for more. */
  minCount?: number;
  /** Blocks submission. `false` = helpful but not always obtainable. */
  required: boolean;
  /** Overrides the slot's default instruction where the REASON differs. */
  instruction?: string;
  /** Only asked when question 1 named one of these. Absent = every reporter. */
  reporters?: readonly CaseReporterKey[];
}

/**
 * The customer's own message. Only exists when the CUSTOMER reported it — the
 * warehouse finding a fault before dispatch has no chat to screenshot. Declared
 * once and reused so the rule cannot drift between issue types.
 */
const CUSTOMER_MESSAGE: CaseEvidenceRule = {
  slot: "customer_message",
  required: true,
  reporters: ["customer"],
};

/**
 * The carton is OPTIONAL wherever it appears, and deliberately so: it is the
 * best evidence of carrier-vs-supplier fault, but a complaint raised weeks after
 * delivery has no box left to photograph. Requiring it would make the honest
 * answer impossible and the dishonest one (any photo, to get past the gate) the
 * only way through. The instruction says why it helps instead.
 */
const PACKAGING_OPTIONAL: CaseEvidenceRule = {
  slot: "packaging_photo",
  required: false,
};

export const CASE_EVIDENCE_BY_ISSUE: Record<CaseIssueKey, readonly CaseEvidenceRule[]> = {
  // The wrong item arrived: the label proves it, the whole-item photo shows what
  // came instead.
  wrong_sku: [
    { slot: "sku_label_photo", required: true },
    { slot: "overall_photo", required: true },
    CUSTOMER_MESSAGE,
  ],

  // Something is not in the box. The close-up is aimed at an EMPTY SPACE, which
  // is not obvious, so the instruction is overridden.
  missing_parts: [
    { slot: "overall_photo", required: true },
    {
      slot: "closeup_photo",
      required: true,
      instruction: "Point the camera at the spot where the missing part belongs.",
    },
    {
      ...PACKAGING_OPTIONAL,
      instruction: "Show the box and any parts list printed on it. It tells us what was packed.",
    },
    CUSTOMER_MESSAGE,
  ],

  // Right model, wrong size or build. Nothing settles a size argument except a
  // tape in the photo.
  wrong_spec: [
    { slot: "sku_label_photo", required: true },
    { slot: "measurement_photo", required: true },
    { slot: "overall_photo", required: true },
    CUSTOMER_MESSAGE,
  ],

  wrong_colour: [
    {
      slot: "overall_photo",
      required: true,
      instruction: "Take it in daylight. Indoor lights change the colour.",
    },
    { slot: "closeup_photo", required: true },
    { slot: "sku_label_photo", required: true },
    CUSTOMER_MESSAGE,
  ],

  // The card's worked example, verbatim: customer screenshot · overall · close-up
  // x2 · SKU label · 10-20s video.
  colour_uneven: [
    CUSTOMER_MESSAGE,
    {
      slot: "overall_photo",
      required: true,
      instruction: "Take it in daylight. Indoor lights change the colour.",
    },
    {
      slot: "closeup_photo",
      minCount: 2,
      required: true,
      instruction: "Two close-ups: one on the lighter part, one on the darker part.",
    },
    { slot: "sku_label_photo", required: true },
    { slot: "pan_video", required: true },
  ],

  damaged: [
    { slot: "overall_photo", required: true },
    {
      slot: "closeup_photo",
      minCount: 2,
      required: true,
      instruction: "Two close-ups of the damage, from two different angles.",
    },
    { slot: "sku_label_photo", required: true },
    PACKAGING_OPTIONAL,
    CUSTOMER_MESSAGE,
  ],

  // "Other" is the escape hatch, so it asks for the least — but never nothing.
  // A case nobody can see is a case nobody can act on.
  other: [
    { slot: "overall_photo", required: true },
    { slot: "closeup_photo", required: false },
    CUSTOMER_MESSAGE,
  ],
};

// ── The resolved checklist ───────────────────────────────────────────────────

/** One tick-list line, everything the screen needs, nothing to look up. */
export interface CaseEvidenceRequirement {
  slot: CaseEvidenceSlotKey;
  label: string;
  kind: CaseEvidenceKind;
  instruction: string;
  minCount: number;
  required: boolean;
}

/**
 * THE checklist — the one function the wizard's tick-list, its Submit button and
 * the server-side gate all ask, so they cannot disagree about what "enough
 * evidence" means.
 *
 * An unknown / unanswered issue type returns an EMPTY checklist rather than a
 * guessed one: a case filed before S2 existed (or through the edit modal, which
 * asks no issue question) must not become unreadable or unsavable.
 */
export function caseEvidenceChecklist(
  issueType: CaseIssueKey | null | undefined,
  reportedBy: CaseReporterKey | null | undefined,
): CaseEvidenceRequirement[] {
  if (!issueType) return [];
  const rules = CASE_EVIDENCE_BY_ISSUE[issueType];
  if (!rules) return [];

  return rules
    .filter((r) => !r.reporters || (!!reportedBy && r.reporters.includes(reportedBy)))
    .map((r) => {
      const slot = caseEvidenceSlot(r.slot);
      return {
        slot: r.slot,
        label: slot?.label ?? r.slot,
        kind: slot?.kind ?? "photo",
        instruction: r.instruction ?? slot?.instruction ?? "",
        minCount: r.minCount ?? 1,
        required: r.required,
      };
    });
}

/** What has been uploaded so far — only the slot matters for counting. */
export interface CaseEvidenceFile {
  slot: string;
}

/** One unmet REQUIRED line, in the words the operator will read. */
export interface CaseEvidenceGap {
  slot: CaseEvidenceSlotKey;
  label: string;
  need: number;
  have: number;
}

export function caseEvidenceGaps(
  issueType: CaseIssueKey | null | undefined,
  reportedBy: CaseReporterKey | null | undefined,
  files: readonly CaseEvidenceFile[],
): CaseEvidenceGap[] {
  return caseEvidenceChecklist(issueType, reportedBy)
    .filter((r) => r.required)
    .map((r) => {
      const have = files.filter((f) => f.slot === r.slot).length;
      return { slot: r.slot, label: r.label, need: r.minCount, have };
    })
    .filter((g) => g.have < g.need);
}

/**
 * May this case be filed? The whole of "no evidence, no case" in one call — the
 * disabled Submit button and the server's refusal are the same answer, so a
 * client that skips the button cannot skip the rule.
 */
export function caseEvidenceComplete(
  issueType: CaseIssueKey | null | undefined,
  reportedBy: CaseReporterKey | null | undefined,
  files: readonly CaseEvidenceFile[],
): boolean {
  return caseEvidenceGaps(issueType, reportedBy, files).length === 0;
}

/** Plain-words summary of what is still missing, for the button's own tooltip
 *  and the server's refusal message (rule 6: errors give the fix). */
export function caseEvidenceGapMessage(gaps: readonly CaseEvidenceGap[]): string {
  if (gaps.length === 0) return "";
  return gaps
    .map((g) => (g.need > 1 ? `${g.label} (${g.have} of ${g.need})` : g.label))
    .join(" · ");
}

// ── Files ────────────────────────────────────────────────────────────────────

export const CASE_EVIDENCE_BUCKET = "service-case-evidence";

/** Videos are big; a 20-second phone clip is tens of megabytes and cannot be
 *  re-encoded in the browser the way a photo can. The bucket cap (0287) is the
 *  real limit — this mirrors it so the browser can refuse in plain words
 *  instead of surfacing a storage error. */
export const CASE_EVIDENCE_MAX_BYTES = 25 * 1024 * 1024;

export const CASE_EVIDENCE_PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const CASE_EVIDENCE_VIDEO_MIME_TYPES = ["video/mp4", "video/quicktime"] as const;

export type CaseEvidenceMimeType =
  | (typeof CASE_EVIDENCE_PHOTO_MIME_TYPES)[number]
  | (typeof CASE_EVIDENCE_VIDEO_MIME_TYPES)[number];

export const CASE_EVIDENCE_MIME_TYPES = [
  ...CASE_EVIDENCE_PHOTO_MIME_TYPES,
  ...CASE_EVIDENCE_VIDEO_MIME_TYPES,
] as [CaseEvidenceMimeType, ...CaseEvidenceMimeType[]];

/** What the file picker should accept for a given tick-list line. */
export function caseEvidenceAccept(kind: CaseEvidenceKind): string {
  return (kind === "video" ? CASE_EVIDENCE_VIDEO_MIME_TYPES : CASE_EVIDENCE_PHOTO_MIME_TYPES).join(",");
}

/** Does this mime type belong in this slot? A photo filed as the video evidence
 *  would satisfy the count while proving nothing the video was asked for. */
export function caseEvidenceMimeFits(kind: CaseEvidenceKind, mimeType: string): boolean {
  return kind === "video"
    ? (CASE_EVIDENCE_VIDEO_MIME_TYPES as readonly string[]).includes(mimeType)
    : (CASE_EVIDENCE_PHOTO_MIME_TYPES as readonly string[]).includes(mimeType);
}

export function caseEvidenceExtension(mimeType: string): string {
  switch (mimeType) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "video/mp4":
      return "mp4";
    case "video/quicktime":
      return "mov";
    default:
      return "jpg";
  }
}
