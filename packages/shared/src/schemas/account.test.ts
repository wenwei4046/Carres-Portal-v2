import { describe, it, expect } from "vitest";
import {
  emailChangeRequestFromRow,
  submitEmailChangeInputSchema,
  decideEmailChangeInputSchema,
  type EmailChangeRequestRow,
} from "./account";

const ROW: EmailChangeRequestRow = {
  id: "00000000-0000-0000-0000-00000000ac01",
  user_id: "00000000-0000-0000-0000-00000000aa01",
  dealer_id: "00000000-0000-0000-0000-000000000d01",
  current_email: "store@carres.com",
  requested_email: "new@carres.com",
  status: "pending",
  requested_by_staff_id: null,
  requested_by_name: "Tan Qu Qu",
  decision_note: null,
  decided_by: null,
  decided_at: null,
  created_at: "2026-07-19T00:00:00Z",
};

describe("emailChangeRequestFromRow", () => {
  it("maps snake_case → camelCase", () => {
    const dto = emailChangeRequestFromRow(ROW);
    expect(dto).toMatchObject({
      id: ROW.id,
      userId: ROW.user_id,
      dealerId: ROW.dealer_id,
      currentEmail: "store@carres.com",
      requestedEmail: "new@carres.com",
      status: "pending",
      requestedByName: "Tan Qu Qu",
      decisionNote: null,
      decidedAt: null,
      createdAt: ROW.created_at,
      dealerName: null,
    });
  });

  it("carries the dealers(name) join into dealerName", () => {
    const dto = emailChangeRequestFromRow({ ...ROW, dealers: { name: "Litte Mattress" } });
    expect(dto.dealerName).toBe("Litte Mattress");
  });

  it("rejects an unknown status", () => {
    expect(() => emailChangeRequestFromRow({ ...ROW, status: "weird" })).toThrow();
  });
});

describe("submitEmailChangeInputSchema", () => {
  it("trims + lowercases the email", () => {
    const parsed = submitEmailChangeInputSchema.parse({
      newEmail: "  New@Store.COM ",
      password: "pw",
    });
    expect(parsed.newEmail).toBe("new@store.com");
  });

  it("rejects a non-email and an empty password", () => {
    expect(submitEmailChangeInputSchema.safeParse({ newEmail: "nope", password: "pw" }).success).toBe(false);
    expect(submitEmailChangeInputSchema.safeParse({ newEmail: "a@b.co", password: "" }).success).toBe(false);
  });
});

describe("decideEmailChangeInputSchema", () => {
  it("accepts an empty body and trims the note", () => {
    expect(decideEmailChangeInputSchema.parse({})).toEqual({});
    expect(decideEmailChangeInputSchema.parse({ note: "  too long  " }).note).toBe("too long");
  });
});
