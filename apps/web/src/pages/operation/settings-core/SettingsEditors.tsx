// design-standard: not-a-list-page — this is a central Settings editor, not a Register.
/**
 * Settings → Team and access → Settings editors (Carres Settings List TEAM-02 ·
 * SET-01, owner confirmed 9 Oct 2026; storage 0668).
 *
 * The owner (Jess) edits every Settings section and may name a person for one section;
 * that person edits that section's configuration and nothing else — never a
 * money approval, a Duty or ordinary work. No grant is made by the system.
 * Removing a person keeps the record (who removed, when).
 */
import { useState } from "react";
import { toast } from "sonner";
import { SETTINGS_EDITOR_SECTIONS, type SettingsEditorSection } from "@carres/shared";
import Button from "@/components/kit/Button";
import Loading from "@/components/kit/Loading";
import PageShell from "@/components/kit/PageShell";
import Select from "@/components/kit/Select";
import { fmtDate } from "@/lib/fmt-date";
import { useSettingsEditorDoor, useSettingsEditors } from "@/lib/settings-queries";
import { Notice, Section, W, refusalOf } from "./parts";

export const SECTION_LABEL: Record<SettingsEditorSection, string> = {
  company: "Company",
  office: "Office",
  staff_duties: "Staff & Duties",
  sales_orders: "Sales Orders",
  purchasing: "Purchasing",
  payment: "Payment",
  warehouse: "Warehouse",
  delivery: "Delivery",
  issue_tracker: "Issue Tracker",
};

export default function SettingsEditors() {
  const query = useSettingsEditors();
  const grant = useSettingsEditorDoor("grant");
  const revoke = useSettingsEditorDoor("revoke");
  const [adding, setAdding] = useState<SettingsEditorSection | null>(null);
  const [person, setPerson] = useState<string | undefined>(undefined);

  if (query.isError) {
    return (
      <PageShell variant="settings" title="Settings editors">
        <div role="alert" className="p-6 text-body">
          <p>{W.loadFailed}</p>
          <Button variant="neutral" onClick={() => void query.refetch()}>{W.tryAgain}</Button>
        </div>
      </PageShell>
    );
  }
  if (!query.data) {
    return <PageShell variant="settings" title="Settings editors"><Loading label={W.loading} /></PageShell>;
  }
  const data = query.data;
  const manage = data.stored && data.canManage;
  const live = data.grants.filter((g) => g.revokedAt == null);
  const past = data.grants.filter((g) => g.revokedAt != null);

  const add = (section: SettingsEditorSection) => {
    if (!person) return;
    grant.mutate({ section, userId: person }, {
      onSuccess: () => { toast.success(`${SECTION_LABEL[section]} editor added`); setAdding(null); setPerson(undefined); },
      onError: (e) => toast.error(refusalOf(e)),
    });
  };
  const remove = (section: SettingsEditorSection, userId: string, name: string | null) => {
    revoke.mutate({ section, userId }, {
      onSuccess: () => toast.success(`${name ?? "The person"} no longer edits ${SECTION_LABEL[section]}`),
      onError: (e) => toast.error(refusalOf(e)),
    });
  };

  return (
    <PageShell variant="settings" title="Settings editors">
      <div className="mx-auto grid w-full max-w-4xl gap-5 overflow-auto p-5" data-testid="settings-editors">
        {!data.stored && <Notice testId="settings-editors-not-installed">{W.notInstalled}</Notice>}
        {data.stored && !data.canManage && (
          <Notice testId="settings-editors-read-only">You can read this page. Only the owner names Settings editors.</Notice>
        )}
        <Section
          title="Who may change each section"
          lead="The owner may change every section. A person named here may change that section's settings only. It gives no approval, no Duty and no money rights."
          testId="settings-editors-sections"
        >
          <ul className="divide-y divide-kit-slate-4">
            {SETTINGS_EDITOR_SECTIONS.map((section) => {
              const here = live.filter((g) => g.section === section);
              const taken = new Set(here.map((g) => g.userId));
              const choices = data.people.filter((p) => !taken.has(p.id));
              return (
                <li key={section} className="grid grid-cols-1 gap-2 py-2 md:grid-cols-[180px_minmax(0,1fr)]" data-testid={`settings-editors-${section}`}>
                  <span className="text-body font-medium text-kit-slate-12">{SECTION_LABEL[section]}</span>
                  <div className="grid gap-1.5">
                    {data.owners.map((name) => (
                      <p key={name} className="text-body text-kit-slate-11">{name} · owner</p>
                    ))}
                    {here.map((g) => (
                      <div key={g.id} className="flex flex-wrap items-center gap-2 text-body">
                        <span className="text-kit-slate-12">{g.userName ?? "Name not recorded"}</span>
                        <span className="text-meta text-kit-slate-11">
                          named by {g.grantedByName ?? "Name not recorded"} · {fmtDate(g.grantedAt)}
                        </span>
                        {manage && (
                          <Button variant="ghost" loading={revoke.isPending}
                            aria-label={`Remove ${g.userName ?? "this person"} from ${SECTION_LABEL[section]}`}
                            onClick={() => remove(section, g.userId, g.userName)}>Remove</Button>
                        )}
                      </div>
                    ))}
                    {manage && adding !== section && choices.length > 0 && (
                      <div>
                        <Button variant="neutral" onClick={() => { setAdding(section); setPerson(undefined); }}>Add person</Button>
                      </div>
                    )}
                    {manage && adding === section && (
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="min-w-[220px]">
                          <Select
                            id={`settings-editor-person-${section}`}
                            label="Person"
                            value={person}
                            onValueChange={setPerson}
                            options={choices.map((p) => ({ value: p.id, label: p.name }))}
                          />
                        </div>
                        <Button variant="primary" disabled={!person} loading={grant.isPending} onClick={() => add(section)}>
                          {W.saveChanges}
                        </Button>
                        <Button variant="neutral" onClick={() => { setAdding(null); setPerson(undefined); }}>{W.cancel}</Button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>
        <Section title={W.changes} testId="settings-editors-history">
          {past.length === 0 && live.length === 0 ? (
            <p className="text-body text-kit-slate-11">{W.noChanges}</p>
          ) : (
            <ul className="divide-y divide-kit-slate-4">
              {data.grants.map((g) => (
                <li key={g.id} className="py-1.5 text-body">
                  <span className="font-medium text-kit-slate-12">{g.userName ?? "Name not recorded"} · {SECTION_LABEL[g.section]}</span>
                  <span className="ml-2 text-meta text-kit-slate-11">
                    named by {g.grantedByName ?? "Name not recorded"} on {fmtDate(g.grantedAt)}
                    {g.revokedAt ? ` · removed by ${g.revokedByName ?? "Name not recorded"} on ${fmtDate(g.revokedAt)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </PageShell>
  );
}
