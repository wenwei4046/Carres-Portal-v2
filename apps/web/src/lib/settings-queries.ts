/**
 * Settings → Company · Office · Settings editors — the reads and saves
 * (API `routes/operation/settings-core.ts`, storage 0668 + 0669). Kept out of
 * the giant `queries.ts` so each Settings section owns its own small file.
 *
 * `useOfficeCalendar()` is also THE web reader of the Office calendar for
 * every Office-based date the browser computes (Payment Monitor, Order Route,
 * Work): it returns the shared `OfficeCalendar` shape with the owner defaults
 * while loading or when the storage is not installed.
 */
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DEFAULT_OFFICE_CALENDAR,
  companyProfileResponseSchema,
  officeCalendarOf,
  officeCalendarResponseSchema,
  settingsEditorsResponseSchema,
  type CompanyProfileSaveInput,
  type OfficeCalendar,
  type OfficeCalendarValues,
  type OfficeHolidaysSaveInput,
  type SettingsChange,
  type SettingsEditorSection,
} from "@carres/shared";
import { apiFetch } from "./api";
import { MY_ADDRESS, applyAddressOverrides, type AddressOverride } from "@/data/malaysia-postcodes";

/** The change record of a Settings section without its own history (SET-01). */
export function useSettingsChanges(section: "sales_orders" | "issue_tracker") {
  return useQuery({
    queryKey: ["settings", "changes", section] as const,
    queryFn: async () => (await apiFetch<{ changes: SettingsChange[] }>(`/api/operation/settings/changes/${section}`)).changes,
    staleTime: 30_000,
  });
}

/** May the signed-in person change this Settings section? (TEAM-02) —
 *  false while loading, so no Edit flashes for a reader. */
export function useCanEditSettings(section: SettingsEditorSection): boolean {
  const q = useQuery({
    queryKey: ["settings", "can-edit", section] as const,
    queryFn: () => apiFetch<{ canEdit: boolean }>(`/api/operation/settings/can-edit/${section}`),
    staleTime: 60_000,
  });
  return q.data?.canEdit === true;
}

export const settingsKeys = {
  company: ["settings", "company"] as const,
  companyIdentity: ["settings", "company-identity"] as const,
  office: ["settings", "office"] as const,
  editors: ["settings", "editors"] as const,
};

export function useCompanySettings() {
  return useQuery({
    queryKey: settingsKeys.company,
    queryFn: async () => companyProfileResponseSchema.parse(await apiFetch<unknown>("/api/operation/settings/company")),
    staleTime: 30_000,
  });
}

export function useSaveCompanySettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CompanyProfileSaveInput) =>
      apiFetch<unknown>("/api/operation/settings/company", { method: "PUT", body: JSON.stringify(input) }),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: settingsKeys.company });
      void client.invalidateQueries({ queryKey: settingsKeys.companyIdentity });
    },
  });
}

export function useOfficeSettings() {
  return useQuery({
    queryKey: settingsKeys.office,
    queryFn: async () => officeCalendarResponseSchema.parse(await apiFetch<unknown>("/api/operation/settings/office")),
    staleTime: 60_000,
  });
}

/** The Office calendar every Office-based browser date reads (owner defaults until loaded). */
export function useOfficeCalendar(): OfficeCalendar {
  const q = useOfficeSettings();
  if (!q.data || !q.data.stored) return DEFAULT_OFFICE_CALENDAR;
  return officeCalendarOf(q.data.values, q.data.holidays.map((h) => ({ holiday_date: h.date, name: h.name })));
}

export function useSaveOfficeCalendar() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { values: OfficeCalendarValues; revision: number; reason?: string }) =>
      apiFetch<unknown>("/api/operation/settings/office", { method: "PUT", body: JSON.stringify(input) }),
    onSettled: () => { void client.invalidateQueries({ queryKey: settingsKeys.office }); },
  });
}

export function useSaveOfficeHolidays() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: OfficeHolidaysSaveInput) =>
      apiFetch<unknown>("/api/operation/settings/office/holidays", { method: "PUT", body: JSON.stringify(input) }),
    onSettled: () => { void client.invalidateQueries({ queryKey: settingsKeys.office }); },
  });
}

export function useSettingsEditors() {
  return useQuery({
    queryKey: settingsKeys.editors,
    queryFn: async () => settingsEditorsResponseSchema.parse(await apiFetch<unknown>("/api/operation/settings/editors")),
    staleTime: 30_000,
  });
}

export function useSettingsEditorDoor(kind: "grant" | "revoke") {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { section: SettingsEditorSection; userId: string }) =>
      apiFetch<unknown>(`/api/operation/settings/editors/${kind}`, { method: "POST", body: JSON.stringify(input) }),
    onSettled: () => { void client.invalidateQueries({ queryKey: settingsKeys.editors }); },
  });
}

/**
 * Settings → Address lists (0722) — Weisiang's decision (Mr Lim, WhatsApp
 * 2026-10-22; Jess was not part of it): the State · City · Postcode lists every
 * address picker offers are the generated national file with the office's
 * changes on top. While loading, or before 0722, the national file alone.
 */
const addressListsKey = ["address-lists"] as const;

export function useAddressOverrides() {
  return useQuery({
    queryKey: addressListsKey,
    queryFn: () => apiFetch<{ stored: boolean; rows: AddressOverride[] }>("/api/address-lists"),
    staleTime: 5 * 60_000,
  });
}

export function useAddressLists() {
  const rows = useAddressOverrides().data?.rows;
  return useMemo(() => {
    const map = rows?.length ? applyAddressOverrides(MY_ADDRESS, rows) : MY_ADDRESS;
    return {
      states: Object.keys(map).sort(),
      cities: (state: string | null) => (state && map[state] ? Object.keys(map[state]).sort() : []),
      postcodes: (state: string | null, city: string | null) =>
        state && city && map[state]?.[city] ? [...new Set(map[state][city])].sort() : [],
    };
  }, [rows]);
}

export function useSaveAddressOverride() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { state: string; city: string | null; postcode: string | null; renameTo: string | null; hidden: boolean; remove?: boolean }) =>
      apiFetch<unknown>("/api/operation/settings/address-lists", { method: "PUT", body: JSON.stringify(input) }),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: addressListsKey });
      void client.invalidateQueries({ queryKey: ["settings", "changes", "sales_orders"] });
    },
  });
}
