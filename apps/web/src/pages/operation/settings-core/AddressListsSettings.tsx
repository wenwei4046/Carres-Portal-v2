/**
 * Settings → Sales Orders → Address lists (0722).
 *
 * Weisiang's decision (Mr Lim, WhatsApp 2026-10-22, relayed by YH 2026-10-23;
 * Jess was not part of it): office staff edit the State, City and Postcode
 * lists, the Houzs SO Maintenance way. The generated national file stays as it
 * is; each change here adds, renames or hides one name on top of it, and every
 * address picker (MYAddressFields, the Sales Order customer card, the dealer
 * State) reads the result through `useAddressLists`. Editors: the Sales Order
 * Settings gate (TEAM-02). Words: COPY-STANDARD "Settings → Address lists".
 */
import { useState } from "react";
import { toast } from "sonner";
import Button from "@/components/kit/Button";
import Input from "@/components/kit/Input";
import Loading from "@/components/kit/Loading";
import PageShell from "@/components/kit/PageShell";
import Select from "@/components/kit/Select";
import type { AddressOverride } from "@/data/malaysia-postcodes";
import {
  useAddressOverrides,
  useCanEditSettings,
  useSaveAddressOverride,
  useSettingsChanges,
} from "@/lib/settings-queries";
import { ChangeList, Notice, Row, Section, W, refusalOf } from "./parts";

type Kind = "add" | "rename" | "hide";
const KINDS = [
  { value: "add", label: "Add" },
  { value: "rename", label: "Rename" },
  { value: "hide", label: "Hide" },
];

const nameOf = (r: { state: string; city: string | null; postcode: string | null }) =>
  [r.state, r.city, r.postcode].filter(Boolean).join(" · ");
const effectOf = (r: AddressOverride) =>
  r.hidden ? "Hidden" : r.rename_to ? `Renamed to ${r.rename_to}` : "Added";

export default function AddressListsSettings() {
  const query = useAddressOverrides();
  const canEdit = useCanEditSettings("sales_orders");
  const changes = useSettingsChanges("sales_orders");
  const save = useSaveAddressOverride();
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [postcode, setPostcode] = useState("");
  const [kind, setKind] = useState<Kind>("add");
  const [renameTo, setRenameTo] = useState("");

  if (query.isError) {
    return (
      <PageShell variant="settings" title="Address lists">
        <div role="alert" className="p-6 text-body">
          <p>{W.loadFailed}</p>
          <Button variant="neutral" onClick={() => void query.refetch()}>{W.tryAgain}</Button>
        </div>
      </PageShell>
    );
  }
  if (!query.data) {
    return <PageShell variant="settings" title="Address lists"><Loading label={W.loading} /></PageShell>;
  }
  const rows = query.data.rows;
  const editable = query.data.stored && canEdit;
  const t = (v: string) => v.trim() || null;
  const gap = !t(state)
    ? "State is required"
    : t(postcode) && !t(city)
      ? "City is required for a postcode"
      : t(postcode) && !/^\d{5}$/.test(postcode.trim())
        ? "A postcode is 5 digits"
        : kind === "rename" && t(postcode)
          ? "A postcode cannot be renamed. Hide it and add the new one"
          : kind === "rename" && !t(renameTo)
            ? "New name is required"
            : null;

  const submit = () => {
    if (gap || save.isPending) return;
    save.mutate(
      {
        state: state.trim(),
        city: t(city),
        postcode: t(postcode),
        renameTo: kind === "rename" ? t(renameTo) : null,
        hidden: kind === "hide",
      },
      {
        onSuccess: () => {
          toast.success("Address lists saved");
          setCity(""); setPostcode(""); setRenameTo("");
        },
        onError: (e) => toast.error(refusalOf(e)),
      },
    );
  };
  const remove = (r: AddressOverride) =>
    save.mutate(
      { state: r.state, city: r.city, postcode: r.postcode, renameTo: null, hidden: false, remove: true },
      { onSuccess: () => toast.success("Address lists saved"), onError: (e) => toast.error(refusalOf(e)) },
    );

  return (
    <PageShell variant="settings" title="Address lists">
      <div className="mx-auto grid w-full max-w-[1100px] gap-5 overflow-auto p-5" data-testid="address-lists-settings">
        {!query.data.stored && <Notice testId="address-lists-not-installed">{W.notInstalled}</Notice>}
        {query.data.stored && !canEdit && <Notice testId="address-lists-read-only">{W.readOnly}</Notice>}

        <Section
          title="List changes"
          lead="Every address picker offers the national list with these changes on top. Orders already saved keep the names they recorded."
          testId="address-lists-rows"
        >
          {rows.length === 0 ? (
            <p className="py-2.5 text-body text-c-secondary">No list changes yet. The pickers offer the national list.</p>
          ) : (
            rows.map((r) => (
              <Row key={nameOf(r)} label={nameOf(r)}>
                <span className="flex items-center justify-between gap-3">
                  <span>{effectOf(r)}</span>
                  {editable && (
                    <Button variant="neutral" disabled={save.isPending} onClick={() => remove(r)}>Remove</Button>
                  )}
                </span>
              </Row>
            ))
          )}
        </Section>

        {editable && (
          <Section
            title="Change a name"
            lead="Leave City and Postcode empty to change a State. Leave Postcode empty to change a City. Use the names as the pickers show them."
            testId="address-lists-form"
          >
            <Row label="State" htmlFor="addr-state"><Input id="addr-state" value={state} onChange={(e) => setState(e.target.value)} /></Row>
            <Row label="City (optional)" htmlFor="addr-city"><Input id="addr-city" value={city} onChange={(e) => setCity(e.target.value)} /></Row>
            <Row label="Postcode (optional)" htmlFor="addr-postcode">
              <Input id="addr-postcode" inputMode="numeric" maxLength={5} value={postcode} onChange={(e) => setPostcode(e.target.value)} />
            </Row>
            <Row label="Change">
              <Select id="addr-kind" value={kind} onValueChange={(v) => setKind(v as Kind)} options={KINDS} />
            </Row>
            {kind === "rename" && (
              <Row label="New name" htmlFor="addr-rename"><Input id="addr-rename" value={renameTo} onChange={(e) => setRenameTo(e.target.value)} /></Row>
            )}
            <Row label="">
              <span className="flex items-center justify-end gap-3">
                {gap && <span className="text-meta text-kit-slate-11">{gap}</span>}
                <Button variant="primary" disabled={!!gap || save.isPending} loading={save.isPending} onClick={submit}>
                  Save change
                </Button>
              </span>
            </Row>
          </Section>
        )}

        <ChangeList
          testId="address-lists-changes"
          changes={(changes.data ?? []).filter((c) => c.what === "address_list")}
          labelOf={() => "Address lists"}
          fieldLabel={(f) => ({ state: "State", city: "City", postcode: "Postcode", rename_to: "Renamed to", hidden: "Hidden" })[f] ?? f}
          valueOf={(_f, v) =>
            v == null ? W.notSet
              : typeof v === "boolean" ? (v ? "Yes" : "No")
              : typeof v === "object" ? `${nameOf(v as AddressOverride)}: ${effectOf(v as AddressOverride)}`
              : String(v)}
        />
      </div>
    </PageShell>
  );
}
