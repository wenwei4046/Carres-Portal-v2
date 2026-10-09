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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DEFAULT_OFFICE_CALENDAR,
  VERIFIED_COMPANY_PROFILE,
  companyProfileResponseSchema,
  officeCalendarOf,
  officeCalendarResponseSchema,
  settingsEditorsResponseSchema,
  type CompanyProfileSaveInput,
  type CompanyProfileValues,
  type OfficeCalendar,
  type OfficeCalendarValues,
  type OfficeHolidaysSaveInput,
  type SettingsEditorSection,
} from "@carres/shared";
import { apiFetch } from "./api";

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

/** The company identity printed on documents — any signed-in account. */
export function useCompanyIdentity() {
  return useQuery({
    queryKey: settingsKeys.companyIdentity,
    queryFn: async () => {
      const body = await apiFetch<{ stored: boolean; values: CompanyProfileValues }>("/api/company-profile");
      return body.values;
    },
    staleTime: 5 * 60_000,
    placeholderData: VERIFIED_COMPANY_PROFILE,
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
