import { describe, expect, it } from "vitest";
import {
  HOLIDAY_AVAILABILITIES,
  resolveWarehouseSchedule,
  scheduleCellWord,
  warehouseImportHolidayCalendarInput,
  warehouseSaveSpecialDateInput,
  warehouseSetWorkingHoursInput,
  type WarehouseHolidayAvailability,
  type WarehouseScheduleInput,
  type WarehouseWorkingHourRow,
} from "./warehouse-settings";

/* 2026-09-16 is a WEDNESDAY, and Malaysia Day. Every fixture below uses it, so
   a change in the ladder cannot be hidden by a change of date. */
const WED = "2026-09-16";

const SITE = "11111111-1111-1111-1111-111111111111";

function hours(rows: Partial<WarehouseWorkingHourRow>[]): WarehouseWorkingHourRow[] {
  return rows.map((r) => ({
    weekday: 3,
    activity: "receiving",
    closed: false,
    opensAt: "09:00",
    closesAt: "17:00",
    ...r,
  })) as WarehouseWorkingHourRow[];
}

function input(over: Partial<WarehouseScheduleInput> = {}): WarehouseScheduleInput {
  return {
    date: WED,
    siteStatus: "active",
    workingHours: [],
    specialDates: [],
    holidayPolicy: null,
    holidayDates: [],
    ...over,
  };
}

const NORMAL_WEEK = hours([
  { weekday: 3, activity: "receiving", opensAt: "09:00", closesAt: "17:00" },
  { weekday: 3, activity: "collection", opensAt: "10:00", closesAt: "16:00" },
]);

const FOLLOWING_POLICY = (
  availability: WarehouseHolidayAvailability,
  over: Record<string, unknown> = {},
) => ({
  followPublicHolidays: true,
  country: "Malaysia",
  state: "Selangor",
  observeReplacement: false,
  defaultAvailability: availability,
  specialOpensAt: null,
  specialClosesAt: null,
  ...over,
});

const MALAYSIA_DAY = [{ onDate: WED, name: "Malaysia Day", observed: false }];

// ---------------------------------------------------------------------------
// 3 · unconfigured states — absent is NOT closed and NOT zero
// ---------------------------------------------------------------------------

describe("an unconfigured warehouse says so", () => {
  it("resolves `Not configured` when no weekly hour exists — never `Closed`", () => {
    const r = resolveWarehouseSchedule(input());
    expect(r.reason).toBe("Not configured");
    expect(r.receiving.availability).toBe("not_configured");
    expect(r.collection.availability).toBe("not_configured");
    expect(scheduleCellWord(r.receiving)).toBe("Not configured");
  });

  it("does NOT assume Sunday is closed", () => {
    // 2026-09-20 is a Sunday. Nothing is configured for it, so nothing is claimed.
    const r = resolveWarehouseSchedule(input({ date: "2026-09-20" }));
    expect(r.receiving.availability).toBe("not_configured");
    expect(r.collection.availability).toBe("not_configured");
  });
});

// ---------------------------------------------------------------------------
// 6 · Receiving and Collection are SEPARATE
// ---------------------------------------------------------------------------

describe("Receiving and Collection hours are separate", () => {
  it("keeps different windows on the same day", () => {
    const r = resolveWarehouseSchedule(input({ workingHours: NORMAL_WEEK }));
    expect(r.reason).toBe("Normal working hours");
    expect(scheduleCellWord(r.receiving)).toBe("09:00–17:00");
    expect(scheduleCellWord(r.collection)).toBe("10:00–16:00");
  });

  it("closes Receiving only, leaving Collection open", () => {
    const r = resolveWarehouseSchedule(
      input({
        workingHours: hours([
          { weekday: 3, activity: "receiving", closed: true, opensAt: null, closesAt: null },
          { weekday: 3, activity: "collection", opensAt: "10:00", closesAt: "16:00" },
        ]),
      }),
    );
    expect(scheduleCellWord(r.receiving)).toBe("Closed");
    expect(scheduleCellWord(r.collection)).toBe("10:00–16:00");
  });

  it("closes Collection only, leaving Receiving open", () => {
    const r = resolveWarehouseSchedule(
      input({
        workingHours: hours([
          { weekday: 3, activity: "receiving", opensAt: "09:00", closesAt: "17:00" },
          { weekday: 3, activity: "collection", closed: true, opensAt: null, closesAt: null },
        ]),
      }),
    );
    expect(scheduleCellWord(r.receiving)).toBe("09:00–17:00");
    expect(scheduleCellWord(r.collection)).toBe("Closed");
  });

  it("closes both when both are recorded closed", () => {
    const r = resolveWarehouseSchedule(
      input({
        workingHours: hours([
          { weekday: 3, activity: "receiving", closed: true, opensAt: null, closesAt: null },
          { weekday: 3, activity: "collection", closed: true, opensAt: null, closesAt: null },
        ]),
      }),
    );
    expect(r.receiving.availability).toBe("closed");
    expect(r.collection.availability).toBe("closed");
  });
});

// ---------------------------------------------------------------------------
// 5 · working-hour validation
// ---------------------------------------------------------------------------

describe("working-hour validation", () => {
  it("refuses a closing time that is not later than the opening time", () => {
    const bad = warehouseSetWorkingHoursInput.safeParse({
      siteId: SITE,
      rows: [
        { weekday: 3, activity: "receiving", closed: false, opensAt: "17:00", closesAt: "09:00" },
      ],
    });
    expect(bad.success).toBe(false);
  });

  it("refuses an equal opening and closing time", () => {
    const bad = warehouseSetWorkingHoursInput.safeParse({
      siteId: SITE,
      rows: [
        { weekday: 3, activity: "receiving", closed: false, opensAt: "09:00", closesAt: "09:00" },
      ],
    });
    expect(bad.success).toBe(false);
  });

  it("refuses an open day with only one time", () => {
    const bad = warehouseSetWorkingHoursInput.safeParse({
      siteId: SITE,
      rows: [{ weekday: 3, activity: "receiving", closed: false, opensAt: "09:00" }],
    });
    expect(bad.success).toBe(false);
  });

  it("accepts a closed day with no times at all", () => {
    const ok = warehouseSetWorkingHoursInput.safeParse({
      siteId: SITE,
      rows: [{ weekday: 0, activity: "collection", closed: true }],
    });
    expect(ok.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 7 · a Special Date needs a reason
// ---------------------------------------------------------------------------

describe("a Special Date carries a required reason", () => {
  it("refuses an empty reason", () => {
    const bad = warehouseSaveSpecialDateInput.safeParse({
      siteId: SITE,
      onDate: WED,
      kind: "closed_all_day",
      reason: "   ",
    });
    expect(bad.success).toBe(false);
  });

  it("refuses special hours without both times", () => {
    const bad = warehouseSaveSpecialDateInput.safeParse({
      siteId: SITE,
      onDate: WED,
      kind: "special_receiving_hours",
      opensAt: "09:00",
      reason: "Stock take morning only",
    });
    expect(bad.success).toBe(false);
  });

  it("accepts a closure with a reason", () => {
    const ok = warehouseSaveSpecialDateInput.safeParse({
      siteId: SITE,
      onDate: WED,
      kind: "closed_all_day",
      reason: "Annual stock take",
    });
    expect(ok.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 13 · SCHEDULE PRECEDENCE
//      Special Date → Company closure → public holiday → normal week
// ---------------------------------------------------------------------------

describe("schedule precedence", () => {
  it("a Special Date beats a company closure, a public holiday and the week", () => {
    const r = resolveWarehouseSchedule(
      input({
        siteStatus: "closed",
        workingHours: NORMAL_WEEK,
        specialDates: [
          {
            onDate: WED,
            kind: "special_receiving_hours",
            opensAt: "08:00",
            closesAt: "11:00",
          },
        ],
        holidayPolicy: FOLLOWING_POLICY("closed"),
        holidayDates: MALAYSIA_DAY,
      }),
    );
    expect(r.reason).toBe("Special hours");
    expect(scheduleCellWord(r.receiving)).toBe("08:00–11:00");
  });

  it("a company closure beats a public holiday and the week", () => {
    const r = resolveWarehouseSchedule(
      input({
        siteStatus: "closed",
        workingHours: NORMAL_WEEK,
        holidayPolicy: FOLLOWING_POLICY("normal"),
        holidayDates: MALAYSIA_DAY,
      }),
    );
    expect(r.reason).toBe("Company closure");
    expect(r.receiving.availability).toBe("closed");
    expect(r.collection.availability).toBe("closed");
  });

  it("a public holiday beats the normal week", () => {
    const r = resolveWarehouseSchedule(
      input({
        workingHours: NORMAL_WEEK,
        holidayPolicy: FOLLOWING_POLICY("closed"),
        holidayDates: MALAYSIA_DAY,
      }),
    );
    expect(r.reason).toBe("Selangor public holiday");
    expect(r.receiving.availability).toBe("closed");
  });

  it("the normal week applies when nothing above it does", () => {
    const r = resolveWarehouseSchedule(
      input({
        workingHours: NORMAL_WEEK,
        holidayPolicy: FOLLOWING_POLICY("closed"),
        holidayDates: [{ onDate: "2026-12-25", name: "Christmas Day", observed: false }],
      }),
    );
    expect(r.reason).toBe("Normal working hours");
    expect(scheduleCellWord(r.receiving)).toBe("09:00–17:00");
  });

  it("an UNSAVED policy changes nothing, even on a holiday date", () => {
    const r = resolveWarehouseSchedule(
      input({ workingHours: NORMAL_WEEK, holidayPolicy: null, holidayDates: MALAYSIA_DAY }),
    );
    expect(r.reason).toBe("Normal working hours");
  });

  it("a policy that is saved but NOT followed changes nothing", () => {
    const r = resolveWarehouseSchedule(
      input({
        workingHours: NORMAL_WEEK,
        holidayPolicy: FOLLOWING_POLICY("closed", { followPublicHolidays: false }),
        holidayDates: MALAYSIA_DAY,
      }),
    );
    expect(r.reason).toBe("Normal working hours");
  });

  it("a Special Date closing all day closes both activities", () => {
    const r = resolveWarehouseSchedule(
      input({
        workingHours: NORMAL_WEEK,
        specialDates: [{ onDate: WED, kind: "closed_all_day", opensAt: null, closesAt: null }],
      }),
    );
    expect(r.reason).toBe("Special hours");
    expect(r.receiving.availability).toBe("closed");
    expect(r.collection.availability).toBe("closed");
  });

  it("a Special Date on ANOTHER day does not touch this one", () => {
    const r = resolveWarehouseSchedule(
      input({
        workingHours: NORMAL_WEEK,
        specialDates: [
          { onDate: "2026-09-17", kind: "closed_all_day", opensAt: null, closesAt: null },
        ],
      }),
    );
    expect(r.reason).toBe("Normal working hours");
  });
});

// ---------------------------------------------------------------------------
// 12 · every public-holiday availability option
// ---------------------------------------------------------------------------

describe("every public-holiday availability option", () => {
  const on = (availability: WarehouseHolidayAvailability, over: Record<string, unknown> = {}) =>
    resolveWarehouseSchedule(
      input({
        workingHours: NORMAL_WEEK,
        holidayPolicy: FOLLOWING_POLICY(availability, over),
        holidayDates: MALAYSIA_DAY,
      }),
    );

  it("covers the five options the card names, and no sixth", () => {
    expect([...HOLIDAY_AVAILABILITIES]).toEqual([
      "closed",
      "receiving_only",
      "collection_only",
      "normal",
      "special",
    ]);
  });

  it("`Closed` shuts both", () => {
    const r = on("closed");
    expect(r.receiving.availability).toBe("closed");
    expect(r.collection.availability).toBe("closed");
  });

  it("`Receiving only` keeps the week's receiving window and shuts collection", () => {
    const r = on("receiving_only");
    expect(scheduleCellWord(r.receiving)).toBe("09:00–17:00");
    expect(r.collection.availability).toBe("closed");
  });

  it("`Collection only` keeps the week's collection window and shuts receiving", () => {
    const r = on("collection_only");
    expect(r.receiving.availability).toBe("closed");
    expect(scheduleCellWord(r.collection)).toBe("10:00–16:00");
  });

  it("`Normal working hours` leaves the week alone", () => {
    const r = on("normal");
    expect(scheduleCellWord(r.receiving)).toBe("09:00–17:00");
    expect(scheduleCellWord(r.collection)).toBe("10:00–16:00");
  });

  it("`Special hours` applies the policy's own window to both", () => {
    const r = on("special", { specialOpensAt: "10:00", specialClosesAt: "13:00" });
    expect(scheduleCellWord(r.receiving)).toBe("10:00–13:00");
    expect(scheduleCellWord(r.collection)).toBe("10:00–13:00");
  });

  it("names the state in the reason, so the operator sees WHY", () => {
    expect(on("closed").reason).toBe("Selangor public holiday");
  });
});

// ---------------------------------------------------------------------------
// 11 · observed / replacement holidays
// ---------------------------------------------------------------------------

describe("observed and replacement holidays", () => {
  const observed = [{ onDate: WED, name: "Malaysia Day (observed)", observed: true }];

  it("is IGNORED while the policy does not follow replacement days", () => {
    const r = resolveWarehouseSchedule(
      input({
        workingHours: NORMAL_WEEK,
        holidayPolicy: FOLLOWING_POLICY("closed", { observeReplacement: false }),
        holidayDates: observed,
      }),
    );
    expect(r.reason).toBe("Normal working hours");
  });

  it("is APPLIED once the policy follows replacement days", () => {
    const r = resolveWarehouseSchedule(
      input({
        workingHours: NORMAL_WEEK,
        holidayPolicy: FOLLOWING_POLICY("closed", { observeReplacement: true }),
        holidayDates: observed,
      }),
    );
    expect(r.reason).toBe("Selangor public holiday");
    expect(r.receiving.availability).toBe("closed");
  });

  it("a gazetted (non-observed) date applies either way", () => {
    for (const observeReplacement of [false, true]) {
      const r = resolveWarehouseSchedule(
        input({
          workingHours: NORMAL_WEEK,
          holidayPolicy: FOLLOWING_POLICY("closed", { observeReplacement }),
          holidayDates: MALAYSIA_DAY,
        }),
      );
      expect(r.reason).toBe("Selangor public holiday");
    }
  });
});

// ---------------------------------------------------------------------------
// 10 · the calendar is scoped to Malaysia and Selangor
// ---------------------------------------------------------------------------

describe("Malaysia and Selangor calendar scoping", () => {
  it("a Selangor policy reads the state in its reason, not the country", () => {
    const r = resolveWarehouseSchedule(
      input({
        workingHours: NORMAL_WEEK,
        holidayPolicy: FOLLOWING_POLICY("closed"),
        holidayDates: MALAYSIA_DAY,
      }),
    );
    expect(r.reason).toBe("Selangor public holiday");
  });

  it("falls back to the country when no state is recorded", () => {
    const r = resolveWarehouseSchedule(
      input({
        workingHours: NORMAL_WEEK,
        holidayPolicy: FOLLOWING_POLICY("closed", { state: null }),
        holidayDates: MALAYSIA_DAY,
      }),
    );
    expect(r.reason).toBe("Malaysia public holiday");
  });
});

// ---------------------------------------------------------------------------
// 20 · nothing is imported without a named, verified source
// ---------------------------------------------------------------------------

describe("a holiday calendar cannot be imported without its provenance", () => {
  const base = {
    country: "Malaysia",
    state: "Selangor",
    sourceName: "Jabatan Perpaduan Negara dan Integrasi Nasional",
    sourceReference: "Warta Kerajaan Selangor 2027",
    verifiedAt: "2026-09-09T00:00:00.000Z",
    dates: [{ date: "2027-01-01", name: "New Year's Day", observed: false }],
  };

  it("accepts an import that names its source, reference and verification", () => {
    expect(warehouseImportHolidayCalendarInput.safeParse(base).success).toBe(true);
  });

  it("refuses one with no source name", () => {
    expect(
      warehouseImportHolidayCalendarInput.safeParse({ ...base, sourceName: " " }).success,
    ).toBe(false);
  });

  it("refuses one with no source reference", () => {
    expect(
      warehouseImportHolidayCalendarInput.safeParse({ ...base, sourceReference: "" }).success,
    ).toBe(false);
  });

  it("refuses one with no dates — an empty import is not a calendar", () => {
    expect(warehouseImportHolidayCalendarInput.safeParse({ ...base, dates: [] }).success).toBe(
      false,
    );
  });
});
