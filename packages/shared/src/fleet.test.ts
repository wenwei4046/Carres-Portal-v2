import { describe, expect, it } from "vitest";
import { groupRuns, lorryCapacity, proposeCrew, workingDays, type FleetCrew, type FleetLorry, type FleetStop } from "./fleet";

// Weisiang's decision (Mr Lim, WhatsApp 2026-10-22): Houzs Fleet Day / Lorry Capacity.
const lorry = (id: string, plate: string): FleetLorry => ({ id, plate, vehicleType: "Lorry", capacity: null, active: true });
const person = (id: string, name: string, role: "driver" | "helper", active = true): FleetCrew => ({ id, name, phone: null, role, active });
const stop = (day: string, vehicleId: string | null, so: number, revenue: number, eta: string | null = null): FleetStop => ({
  day, vehicleId, plate: vehicleId ? `P-${vehicleId}` : "typed", orderId: `o${so}`, leg: 0, so, customerName: "C",
  customerPhone: null, customerAddress: null, confirmedTime: null, expectedArrival: eta, revenue,
});

describe("proposeCrew", () => {
  const lorries = [lorry("L1", "AAA 1"), lorry("L2", "BBB 2")];
  const crew = [person("d1", "Ali", "driver"), person("d2", "Bala", "driver"), person("d3", "Zul", "driver", false),
    person("h1", "Chong", "helper"), person("h2", "Dev", "helper")];

  it("brings back each lorry's last crew, skips leave, and never reuses a person", () => {
    const picks = proposeCrew({
      day: "2026-11-03", lorries, crew,
      leave: [{ id: "x", crewId: "h2", fromDate: "2026-11-01", toDate: "2026-11-05", reason: "MC" }],
      confirmed: [],
      history: [
        { day: "2026-11-02", vehicleId: "L2", driverId: "d1", helperId: "h2" },
        { day: "2026-11-01", vehicleId: "L1", driverId: "d1", helperId: "h1" },
      ],
    });
    // L1's last driver Ali is free first; L2's last driver Ali is then taken → Bala.
    expect(picks.get("L1")).toEqual({ driverId: "d1", helperId: "h1", confirmed: false });
    // Dev is on leave and Chong is on L1, so L2 has no helper.
    expect(picks.get("L2")).toEqual({ driverId: "d2", helperId: null, confirmed: false });
  });

  it("keeps a confirmed lorry and does not give its crew to another", () => {
    const picks = proposeCrew({
      day: "2026-11-03", lorries, crew, leave: [], history: [],
      confirmed: [{ day: "2026-11-03", vehicleId: "L2", driverId: "d1", helperId: "h1" }],
    });
    expect(picks.get("L2")).toEqual({ driverId: "d1", helperId: "h1", confirmed: true });
    expect(picks.get("L1")).toEqual({ driverId: "d2", helperId: "h2", confirmed: false });
  });

  it("uses the lorry's Settings template driver when there is no history", () => {
    const picks = proposeCrew({
      day: "2026-11-03", lorries: [lorry("L1", "AAA 1")], crew, leave: [], history: [], confirmed: [],
      templateDriverName: new Map([["L1", " bala "]]),
    });
    expect(picks.get("L1")?.driverId).toBe("d2");
  });
});

describe("groupRuns and lorryCapacity", () => {
  it("groups one run per lorry per day in arrival order, and counts Houzs utilisation", () => {
    const stops = [
      stop("2026-11-02", "L1", 12, 300, "14:00"), stop("2026-11-02", "L1", 11, 200, "10:00"),
      stop("2026-11-03", "L1", 13, 500), stop("2026-11-02", null, 14, 100),
    ];
    const runs = groupRuns(stops);
    expect(runs.map((r) => [r.day, r.vehicleId, r.stops.map((s) => s.so), r.revenue])).toEqual([
      ["2026-11-02", "L1", [11, 12], 500],
      ["2026-11-02", null, [14], 100],
      ["2026-11-03", "L1", [13], 500],
    ]);
    // 2026-11-01 is a Sunday: Mon 2 – Sat 7 = 6 working days.
    expect(workingDays("2026-11-01", "2026-11-07")).toBe(6);
    const [l1, l2] = lorryCapacity("2026-11-01", "2026-11-07", [lorry("L1", "AAA 1"), lorry("L2", "BBB 2")], stops);
    expect(l1).toMatchObject({ trips: 2, stops: 3, revenue: 1000, revenuePerTrip: 500, stopsPerTrip: 1.5 });
    expect(l1.utilisation).toBeCloseTo(2 / 6);
    expect(l2).toMatchObject({ trips: 0, utilisation: 0, revenuePerTrip: null });
  });
});
