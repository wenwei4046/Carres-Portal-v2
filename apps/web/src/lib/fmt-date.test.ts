import { describe, expect, it } from "vitest";
import { fmtDate, fmtDateShort } from "./fmt-date";

describe("Carres date formatting", () => {
  it("renders timestamps in Kuala Lumpur time regardless of the runner timezone", () => {
    expect(fmtDate("2026-04-16T03:00:00Z", { time: true })).toBe(
      "Thu, 16 Apr 26 11:00",
    );
    expect(fmtDateShort("2026-04-16T17:00:00Z")).toBe("17 Apr 26");
  });

  it("keeps a bare business date on the written calendar day", () => {
    expect(fmtDate("2026-04-16")).toBe("Thu, 16 Apr 26");
    expect(fmtDateShort("2026-04-16")).toBe("16 Apr 26");
  });

  it("keeps the empty and invalid fallbacks", () => {
    expect(fmtDate(null)).toBe("—");
    expect(fmtDate("not-a-date")).toBe("—");
  });
});
