import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/lib/api";
import { qk } from "@/lib/queries";

/**
 * PartnerFleet — Phase 7 Sprint 3.
 *
 * Vehicle/driver registry for the LP. RLS scopes per partner_id; the API
 * just trusts the JWT and writes server-side partner_id.
 *
 * UX: simple table with inline add row + per-row delete. Edit is a future
 * polish (low value — partners can delete + re-add).
 */
interface FleetRow {
  id:            string;
  partner_id:    string;
  plate:         string;
  vehicle_type:  string;
  capacity:      string | null;
  driver_name:   string | null;
  driver_phone:  string | null;
  created_at:    string;
}

interface FleetCreateInput {
  plate:        string;
  vehicleType:  string;
  capacity?:    string | null;
  driverName?:  string | null;
  driverPhone?: string | null;
}

export default function PartnerFleet() {
  const qc = useQueryClient();
  const fleet = useQuery<FleetRow[], ApiError>({
    queryKey: ["partner", "fleet"],
    queryFn: () => apiFetch<FleetRow[]>("/api/partner/fleet"),
  });

  const [plate, setPlate] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [capacity, setCapacity] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");

  const create = useMutation<FleetRow, ApiError, FleetCreateInput>({
    mutationFn: (input) =>
      apiFetch<FleetRow>("/api/partner/fleet", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      toast.success("Vehicle added");
      setPlate("");
      setVehicleType("");
      setCapacity("");
      setDriverName("");
      setDriverPhone("");
      qc.invalidateQueries({ queryKey: ["partner", "fleet"] });
    },
    onError: (err) => toast.error(err.message),
  });

  const remove = useMutation<unknown, ApiError, string>({
    mutationFn: (id) =>
      apiFetch(`/api/partner/fleet/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Vehicle removed");
      qc.invalidateQueries({ queryKey: ["partner", "fleet"] });
    },
    onError: (err) => toast.error(err.message),
  });

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!plate.trim() || !vehicleType.trim()) {
      toast.error("Plate and vehicle type required");
      return;
    }
    create.mutate({
      plate: plate.trim(),
      vehicleType: vehicleType.trim(),
      capacity: capacity.trim() || null,
      driverName: driverName.trim() || null,
      driverPhone: driverPhone.trim() || null,
    });
  }

  return (
    <div className="px-9 py-8 pb-14 space-y-6">
      <div>
        <div className="kicker">LP · Fleet</div>
        <h1 className="font-display text-[30px] leading-[1.05] mt-1.5 tracking-tight font-semibold">
          Fleet
        </h1>
      </div>

      <section data-testid="partner-fleet-add">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.18em] text-base-700 mb-2">
          Add vehicle
        </h2>
        <form
          onSubmit={handleAdd}
          className="bg-white border border-base-200 rounded-md p-4 grid grid-cols-5 gap-3"
        >
          <input
            placeholder="Plate (e.g. WPB 1234)"
            value={plate}
            onChange={(e) => setPlate(e.target.value)}
            className="px-2.5 py-1.5 border border-border rounded text-[12.5px] bg-background"
            aria-label="Plate"
          />
          <input
            placeholder="Vehicle type"
            value={vehicleType}
            onChange={(e) => setVehicleType(e.target.value)}
            className="px-2.5 py-1.5 border border-border rounded text-[12.5px] bg-background"
            aria-label="Vehicle type"
          />
          <input
            placeholder="Capacity (optional)"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            className="px-2.5 py-1.5 border border-border rounded text-[12.5px] bg-background"
            aria-label="Capacity"
          />
          <input
            placeholder="Driver name"
            value={driverName}
            onChange={(e) => setDriverName(e.target.value)}
            className="px-2.5 py-1.5 border border-border rounded text-[12.5px] bg-background"
            aria-label="Driver name"
          />
          <div className="flex gap-2">
            <input
              placeholder="Driver phone"
              value={driverPhone}
              onChange={(e) => setDriverPhone(e.target.value)}
              className="flex-1 px-2.5 py-1.5 border border-border rounded text-[12.5px] bg-background"
              aria-label="Driver phone"
            />
            <button
              type="submit"
              disabled={create.isPending}
              className="px-3 py-1.5 bg-primary text-primary-foreground rounded text-[12.5px] font-medium disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.18em] text-base-700 mb-2">
          Vehicles
        </h2>
        <div
          className="bg-white border border-base-200 rounded-md overflow-hidden"
          data-testid="partner-fleet-list"
        >
          {fleet.isLoading ? (
            <div className="p-4 text-[12px] text-base-500">Loading…</div>
          ) : (fleet.data ?? []).length === 0 ? (
            <div className="p-4 text-[12px] text-base-500">
              No vehicles yet. Add one above.
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-base-200 bg-base-50">
                  <th className="text-left p-3 text-[11px] uppercase tracking-[0.18em] font-semibold text-base-600">
                    Plate
                  </th>
                  <th className="text-left p-3 text-[11px] uppercase tracking-[0.18em] font-semibold text-base-600">
                    Type
                  </th>
                  <th className="text-left p-3 text-[11px] uppercase tracking-[0.18em] font-semibold text-base-600">
                    Capacity
                  </th>
                  <th className="text-left p-3 text-[11px] uppercase tracking-[0.18em] font-semibold text-base-600">
                    Driver
                  </th>
                  <th className="text-left p-3 text-[11px] uppercase tracking-[0.18em] font-semibold text-base-600">
                    Phone
                  </th>
                  <th className="text-right p-3 text-[11px] uppercase tracking-[0.18em] font-semibold text-base-600">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {(fleet.data ?? []).map((v) => (
                  <tr
                    key={v.id}
                    className="border-b border-base-200 last:border-0"
                    data-testid={`fleet-row-${v.id}`}
                  >
                    <td className="p-3 text-[13px] font-mono font-medium text-base-900">
                      {v.plate}
                    </td>
                    <td className="p-3 text-[13px] text-base-700">{v.vehicle_type}</td>
                    <td className="p-3 text-[13px] text-base-700">{v.capacity ?? "—"}</td>
                    <td className="p-3 text-[13px] text-base-700">{v.driver_name ?? "—"}</td>
                    <td className="p-3 text-[12px] text-base-600">{v.driver_phone ?? "—"}</td>
                    <td className="p-3 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Remove ${v.plate}?`)) remove.mutate(v.id);
                        }}
                        disabled={remove.isPending}
                        className="px-2.5 py-1 text-[11px] border border-border rounded hover:bg-destructive/10 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

// Re-use qk constant (kept for type narrowing if other code uses fleet key).
export const PARTNER_FLEET_QK = qk.partner;
