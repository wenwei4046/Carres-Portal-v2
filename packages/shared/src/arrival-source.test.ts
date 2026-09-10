import { describe, it, expect } from "vitest";
import {
  arrivalSourceCreateInput,
  arrivalReceivingInput,
  COLLECTION_CONDITIONS,
  arrivalHandoverDifferences,
} from "./arrival-source";
const id = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const case_approval = {
  approved: true,
  note: "Remedy reviewed",
  evidence_paths: ["case/photo.jpg"],
  photo_date: "2026-09-05",
  condition_required: true,
  passed_conditions: COLLECTION_CONDITIONS.map(([key]) => key),
};
const source = {
  id,
  kind: "transfer",
  claim_id: null,
  case_id: null,
  from_site_id: id,
  to_site_id: other,
  party_id: id,
  expected_date: "2026-09-12",
  collection_date: "2026-09-11",
  unit_ids: [id],
  reason: "Display request",
};
describe("arrival source boundaries", () => {
  it("requires real, distinct Sites and exact unique Units", () => {
    expect(arrivalSourceCreateInput.safeParse(source).success).toBe(true);
    expect(
      arrivalSourceCreateInput.safeParse({ ...source, to_site_id: id }).success,
    ).toBe(false);
    expect(
      arrivalSourceCreateInput.safeParse({ ...source, unit_ids: [id, id] })
        .success,
    ).toBe(false);
  });
  it.each(["supplier-replacement", "repair-return"])(
    "%s keeps its claim lineage",
    (kind) => {
      expect(
        arrivalSourceCreateInput.safeParse({ ...source, kind }).success,
      ).toBe(false);
      expect(
        arrivalSourceCreateInput.safeParse({ ...source, kind, claim_id: id })
          .success,
      ).toBe(true);
    },
  );
  it.each(["customer-return", "failed-delivery-return"])(
    "%s keeps its case lineage",
    (kind) => {
      expect(
        arrivalSourceCreateInput.safeParse({ ...source, kind }).success,
      ).toBe(false);
      expect(
        arrivalSourceCreateInput.safeParse({
          ...source,
          kind,
          case_id: id,
          case_approval,
        }).success,
      ).toBe(true);
    },
  );
  it("requires explicit Case approval and all applicable checks", () => {
    const input = { ...source, kind: "customer-return", case_id: id };
    expect(arrivalSourceCreateInput.safeParse(input).success).toBe(false);
    expect(
      arrivalSourceCreateInput.safeParse({
        ...input,
        case_approval: { ...case_approval, passed_conditions: [] },
      }).success,
    ).toBe(false);
  });
  it("compares exact handover sets without inventing movement for untouched Units", () => {
    expect(
      arrivalHandoverDifferences(
        [
          { id, outcome: "received" },
          { id: other, outcome: "not_received" },
        ],
        [{ kind: "collected", unit_ids: [id] }],
      ),
    ).toEqual([{ unitId: id, originMissing: false, carrierMissing: true }]);
  });
  it("refuses invented dates", () =>
    expect(
      arrivalSourceCreateInput.safeParse({
        ...source,
        expected_date: "2026-02-30",
      }).success,
    ).toBe(false));
  it("receives named Units, pairs issue evidence and refuses duplicate scans", () => {
    const receipt = {
      key: id,
      goods_received_at: "2026-09-12",
      actual_site_id: id,
      holder_party_id: id,
      handover_person: "Recorded collector",
      do_number: "DO-12",
      do_file_path: "proof/file.pdf",
      note: "",
      units: [
        {
          stock_item_id: id,
          outcome: "received_with_issue",
          issue_kind: "damaged",
          note: "Torn cover",
        },
      ],
    };
    expect(arrivalReceivingInput.safeParse(receipt).success).toBe(true);
    expect(
      arrivalReceivingInput.safeParse({
        ...receipt,
        units: [
          { ...receipt.units[0], outcome: "not_received", issue_kind: null },
        ],
      }).success,
    ).toBe(false);
    expect(
      arrivalReceivingInput.safeParse({ ...receipt, do_number: "A" }).success,
    ).toBe(false);
    expect(
      arrivalReceivingInput.safeParse({
        ...receipt,
        units: [...receipt.units, ...receipt.units],
      }).success,
    ).toBe(false);
    expect(
      arrivalReceivingInput.safeParse({
        ...receipt,
        units: [{ ...receipt.units[0], issue_kind: null }],
      }).success,
    ).toBe(false);
  });
});
