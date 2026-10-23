// design-standard: not-a-list-page — this is a central Settings editor, not a Register.
/**
 * Settings → Service (migration 0711). Weisiang's decision (Mr Lim, WhatsApp
 * 2026-10-22): Houzs Service Maintenance inside Carres — the default case
 * owner (used until the Sales Order PIC picks one) and the Case Type and Stage
 * pick lists staff choose from on a case. Everyone in the office reads; the
 * owner or a person named for Service in Settings editors changes it.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useCanEditSettings } from "@/lib/settings-queries";
import Button from "@/components/kit/Button";
import Checkbox from "@/components/kit/Checkbox";
import Input from "@/components/kit/Input";
import PageShell from "@/components/kit/PageShell";
import Select from "@/components/kit/Select";
import { W } from "./settings-core/parts";

type PickItem = { id: string; label: string; active: boolean; isClosed: boolean };
type ServiceSettingsRead = { defaultOwnerUserId: string | null; types: PickItem[]; statuses: PickItem[] };
const KEY = ["ops", "service-cases", "settings"] as const;

export default function ServiceSettings() {
  const qc = useQueryClient();
  const canEdit = useCanEditSettings("service");
  const q = useQuery<ServiceSettingsRead>({ queryKey: KEY, queryFn: () => apiFetch("/api/ops/service-cases/settings") });
  const staffQ = useQuery<{ staff?: Array<{ user_id: string; name: string | null }> }>({
    queryKey: ["operation", "staff"],
    queryFn: () => apiFetch("/api/operation/staff"),
    staleTime: 60_000,
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: KEY });
    qc.invalidateQueries({ queryKey: ["ops", "service-cases", "config"] });
  };
  const owner = useMutation({
    mutationFn: (defaultOwnerUserId: string) =>
      apiFetch("/api/ops/service-cases/settings", { method: "PATCH", body: JSON.stringify({ defaultOwnerUserId }) }),
    onSuccess: refresh,
  });
  const staff = staffQ.data?.staff ?? [];

  return (
    <PageShell variant="settings" title="Service Settings">
      <div className="mx-auto grid w-full max-w-4xl gap-5 overflow-auto rounded-card border border-kit-slate-5 bg-white p-5">
        {q.isError && <p role="alert" className="text-body">{W.loadFailed}</p>}
        {!canEdit && <p className="text-meta text-kit-slate-11">{W.readOnly}</p>}
        <section className="grid gap-2">
          <h2 className="text-strong">Default case owner</h2>
          <p className="text-body text-kit-slate-11">A new case goes to this person until the sales order PIC picks the case owner.</p>
          <div className="max-w-sm">
            <Select
              id="service-default-owner"
              disabled={!canEdit}
              value={q.data?.defaultOwnerUserId ?? undefined}
              onValueChange={(v) => owner.mutate(v)}
              placeholder={W.notSet}
              options={staff.map((p) => ({ value: p.user_id, label: p.name ?? "" }))}
            />
          </div>
        </section>
        <PickList list="statuses" title="Stages" help="The stages staff pick on a case. A stage that closes the case cannot be added here." items={q.data?.statuses ?? []} canEdit={canEdit} onChanged={refresh} />
        <PickList list="types" title="Case types" help="The case types staff pick on a case." items={q.data?.types ?? []} canEdit={canEdit} onChanged={refresh} />
      </div>
    </PageShell>
  );
}

function PickList({ list, title, help, items, canEdit, onChanged }: {
  list: "types" | "statuses";
  title: string;
  help: string;
  items: PickItem[];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [label, setLabel] = useState("");
  const add = useMutation({
    mutationFn: () => apiFetch(`/api/ops/service-cases/settings/${list}`, { method: "POST", body: JSON.stringify({ label }) }),
    onSuccess: () => { setLabel(""); onChanged(); },
  });
  const edit = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { label?: string; active?: boolean } }) =>
      apiFetch(`/api/ops/service-cases/settings/${list}/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: onChanged,
  });
  return (
    <section className="grid gap-2" data-testid={`service-pick-${list}`}>
      <h2 className="text-strong">{title}</h2>
      <p className="text-body text-kit-slate-11">{help}</p>
      <ul className="grid gap-2">
        {items.map((it) => (
          <li key={it.id} className="flex items-center gap-3">
            <div className="flex-1">
              <Input
                id={`service-${list}-${it.id}`}
                aria-label={title}
                defaultValue={it.label}
                disabled={!canEdit}
                onBlur={(e) => {
                  const next = e.target.value.trim();
                  if (next && next !== it.label) edit.mutate({ id: it.id, body: { label: next } });
                }}
              />
            </div>
            <Checkbox
              id={`service-${list}-${it.id}-active`}
              label="In use"
              checked={it.active}
              disabled={!canEdit}
              onCheckedChange={(active) => edit.mutate({ id: it.id, body: { active } })}
            />
          </li>
        ))}
      </ul>
      {canEdit && (
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Input id={`service-${list}-new`} label={`New ${title.toLowerCase().replace(/s$/, "")}`} value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <Button variant="primary" disabled={!label.trim()} loading={add.isPending} onClick={() => add.mutate()}>Add</Button>
        </div>
      )}
    </section>
  );
}
