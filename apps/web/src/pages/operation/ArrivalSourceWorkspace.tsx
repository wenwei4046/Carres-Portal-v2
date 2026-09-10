import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ARRIVAL_SOURCE_TYPES,
  COLLECTION_CONDITIONS,
  inboundArrivals,
  arrivalSourceCreateInput,
  arrivalReceivingInput,
  arrivalHandoverDifferences,
  type ArrivalSource,
} from "@carres/shared";
import { apiFetch } from "@/lib/api";
import { useReceivingDuty } from "@/lib/queries";
import { fmtDate } from "@/lib/fmt-date";
import { fieldCls, fieldAreaCls } from "@/components/Field";
import DOFileUploadField from "@/components/DOFileUploadField";
import ModuleHeader from "./components/ModuleHeader";
type Unit = {
  id: string;
  unit_code: string;
  sku: string;
  status: string;
  qty: number;
  warehouse_id: string;
  reserved_ref: string | null;
};
type Options = {
  sites: { id: string; name: string }[];
  parties: { id: string; name: string; kind: string }[];
  units: Unit[];
  limit: number;
  caseEvidence?: Array<{
    path: string;
    slot: string;
    kind: string;
    at: string;
  }>;
};
type Receipt = {
  id: string;
  grn_no: string;
  status: string;
  posted_at: string;
  goods_received_at: string;
  do_number: string;
  do_file_path: string;
  unit_results: {
    stock_item_id: string;
    unit_code: string;
    outcome: string;
    issue_kind: string | null;
  }[];
};
type Detail = {
  source: ArrivalSource;
  units: {
    source_id: string;
    stock_item_id: string;
    replaces_item_id: string | null;
    unit: Unit;
  }[];
  receipts: Receipt[];
  events: {
    id: string;
    kind: string;
    occurred_at: string;
    person: string | null;
    evidence: string | null;
    unit_ids: string[];
  }[];
};
const actionCls =
  "rounded-control border border-kit-slate-5 px-3 py-1 text-body disabled:opacity-50";
export default function ArrivalSourceWorkspace({
  receiving = false,
  sourceId,
  outbound = false,
}: {
  sourceId?: string;
  outbound?: boolean;
  receiving?: boolean;
}) {
  const [params] = useSearchParams();
  const id = sourceId ?? params.get("arrival");
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ModuleHeader
        testId="arrival-header"
        word={receiving ? "Receiving" : "Warehouse"}
        page={
          receiving
            ? undefined
            : outbound
              ? "Outbound"
              : "Transfer / Return / Repair"
        }
        docTitle="Carres · Arrival"
      />
      <div className="min-h-0 flex-1 overflow-auto p-4 md:p-6">
        {id ? (
          <ArrivalDetail
            key={id}
            id={id}
            receiving={receiving}
            outbound={outbound}
          />
        ) : (
          <CreateArrival />
        )}
      </div>
    </div>
  );
}
function useOptions(
  claim: string | null = null,
  caseId: string | null = null,
  search = "",
) {
  const p = new URLSearchParams();
  if (claim) p.set("claim", claim);
  if (caseId) p.set("case", caseId);
  if (search) p.set("q", search);
  return useQuery({
    queryKey: ["arrival-options", claim, caseId, search],
    queryFn: () =>
      apiFetch<Options>(`/api/operation/arrival-sources/options?${p}`),
  });
}
function CreateArrival() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const kind = params.get("kind") ?? "transfer",
    claim = params.get("claim"),
    caseId = params.get("case");
  const [search, setSearch] = useState("");
  const q = useOptions(claim, caseId, search);
  const [selected, setSelected] = useState<Unit[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [party, setParty] = useState("");
  const [date, setDate] = useState("");
  const [collection, setCollection] = useState("");
  const [reason, setReason] = useState("");
  const [ref, setRef] = useState("");
  const [approved, setApproved] = useState(false);
  const [approvalNote, setApprovalNote] = useState("");
  const [evidencePaths, setEvidencePaths] = useState<string[]>([]);
  const [photoDate, setPhotoDate] = useState("");
  const [conditionRequired, setConditionRequired] = useState("");
  const [passedConditions, setPassedConditions] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [key] = useState(() => crypto.randomUUID());
  const save = useMutation({
    mutationFn: (input: unknown) =>
      apiFetch<ArrivalSource>("/api/operation/arrival-sources", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (s) => navigate(`/operation?tab=arrival-source&arrival=${s.id}`),
  });
  const label =
    ARRIVAL_SOURCE_TYPES.find(([k]) => k === kind)?.[1] ?? "Arrival";
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link
        to={
          claim
            ? `/operation?tab=claims&claim=${claim}`
            : caseId
              ? `/operation?tab=service-notes&case=${caseId}`
              : "/operation?tab=stock-onhand"
        }
        className="text-kit-blue-11"
      >
        Back to source
      </Link>
      <h1 className="text-page">{label}</h1>
      <p className="text-body">
        Choose the exact Units, destination and recorded dates. Saving plans the
        work; actual handover and Receiving record what moved.
      </p>
      {q.isLoading ? (
        <p role="status">Loading source details…</p>
      ) : q.error ? (
        <div role="alert">
          {q.error.message}{" "}
          <button className={actionCls} onClick={() => q.refetch()}>
            Retry
          </button>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError("");
            const p = arrivalSourceCreateInput.safeParse({
              id: key,
              kind,
              claim_id: claim,
              case_id: caseId,
              ...(caseId
                ? {
                    case_approval: {
                      approved,
                      note: approvalNote,
                      evidence_paths: evidencePaths,
                      photo_date: photoDate,
                      condition_required:
                        conditionRequired === ""
                          ? null
                          : conditionRequired === "yes",
                      passed_conditions: passedConditions,
                    },
                  }
                : {}),
              from_site_id: from || null,
              to_site_id: to,
              party_id: party,
              expected_date: date,
              collection_date: collection || null,
              reason,
              unit_ids: selected.map((u) => u.id),
              sales_order_ref: ref || null,
            });
            if (!p.success) {
              setError(p.error.issues[0].message);
              return;
            }
            save.mutate(p.data);
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              From
              <select
                aria-label="From Site"
                className={fieldCls}
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              >
                <option value="">Choose Site</option>
                {q.data?.sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Destination
              <select
                aria-label="Destination Site"
                className={fieldCls}
                required
                value={to}
                onChange={(e) => setTo(e.target.value)}
              >
                <option value="">Choose Site</option>
                {q.data?.sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Delivery / repair party
              <select
                className={fieldCls}
                required
                value={party}
                onChange={(e) => setParty(e.target.value)}
              >
                <option value="">Choose party</option>
                {q.data?.parties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Collection date
              <input
                className={fieldCls}
                type="date"
                value={collection}
                onChange={(e) => setCollection(e.target.value)}
              />
            </label>
            <label>
              Expected arrival
              <input
                className={fieldCls}
                required
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            {kind === "transfer" && (
              <label>
                Sales Order reference
                <input
                  className={fieldCls}
                  value={ref}
                  onChange={(e) => setRef(e.target.value)}
                />
              </label>
            )}
          </div>
          <label className="block">
            Reason
            <textarea
              className={fieldAreaCls}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <label className="block">
            Find Unit
            <input
              className={fieldCls}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <p className="text-meta">
            {selected.length} Units selected. Showing up to {q.data?.limit}{" "}
            matches; search by Unit ID to narrow the list.
          </p>
          <div className="max-h-64 overflow-auto divide-y divide-kit-slate-5">
            {q.data?.units.map((u) => (
              <label
                key={u.id}
                className="flex items-center gap-3 py-2 text-body"
              >
                <input
                  type="checkbox"
                  checked={selected.some((s) => s.id === u.id)}
                  onChange={(e) =>
                    setSelected((prev) =>
                      e.target.checked
                        ? [...prev, u]
                        : prev.filter((s) => s.id !== u.id),
                    )
                  }
                />
                {u.unit_code} · {u.sku}
                {u.reserved_ref ? ` · ${u.reserved_ref}` : ""}
              </label>
            ))}
          </div>
          {!q.data?.units.length && <p>No matching Units.</p>}
          {kind === "supplier-replacement" && (
            <p className="text-body">
              Select the defective Units. The replacement receives new Unit IDs;
              these original Units keep their history.
            </p>
          )}
          {caseId && (
            <section className="space-y-3 border-t border-kit-slate-5 pt-4">
              <h2 className="text-strong">Case approval</h2>
              <p className="text-body">
                Review the approved remedy and applicable policy before booking
                physical work. Customer requests alone do not authorise
                collection.
              </p>
              <label className="block">
                Approval reason
                <textarea
                  required
                  className={fieldAreaCls}
                  value={approvalNote}
                  onChange={(e) => setApprovalNote(e.target.value)}
                />
              </label>
              <label className="block">
                Evidence date
                <input
                  required
                  type="date"
                  className={fieldCls}
                  value={photoDate}
                  onChange={(e) => setPhotoDate(e.target.value)}
                />
              </label>
              <label className="block">
                Condition review required by the remedy
                <select
                  required
                  className={fieldCls}
                  value={conditionRequired}
                  onChange={(e) => setConditionRequired(e.target.value)}
                >
                  <option value="">Choose the applicable policy</option>
                  <option value="yes">Condition-dependent collection</option>
                  <option value="no">
                    No condition-dependent collection under this remedy
                  </option>
                </select>
              </label>
              <p className="text-body">Case evidence used for this approval</p>
              {!q.data?.caseEvidence?.length && (
                <p role="alert">Add the approval evidence to the Case first.</p>
              )}
              {q.data?.caseEvidence?.map((file) => (
                <label className="flex gap-3 text-body" key={file.path}>
                  <input
                    type="checkbox"
                    checked={evidencePaths.includes(file.path)}
                    onChange={(e) =>
                      setEvidencePaths((p) =>
                        e.target.checked
                          ? [...p, file.path]
                          : p.filter((v) => v !== file.path),
                      )
                    }
                  />
                  {file.slot} · {file.kind} · {fmtDate(file.at)}
                </label>
              ))}
              {conditionRequired === "yes" && (
                <>
                  <p className="text-body">
                    Review current photos of every surface, side, label and
                    packaging before approval.
                  </p>
                  {COLLECTION_CONDITIONS.map(([key, label]) => (
                    <label className="flex gap-3 text-body" key={key}>
                      <input
                        type="checkbox"
                        checked={passedConditions.includes(key)}
                        onChange={(e) =>
                          setPassedConditions((p) =>
                            e.target.checked
                              ? [...p, key]
                              : p.filter((v) => v !== key),
                          )
                        }
                      />
                      {label}
                    </label>
                  ))}
                </>
              )}
              <label className="flex gap-3 text-body">
                <input
                  type="checkbox"
                  checked={approved}
                  onChange={(e) => setApproved(e.target.checked)}
                />
                I approve this physical instruction based on the Case evidence
                and applicable policy.
              </label>
            </section>
          )}
          {(error || save.error) && (
            <p role="alert" className="text-danger">
              {error || save.error?.message}
            </p>
          )}
          <button
            className={actionCls}
            disabled={save.isPending || !selected.length}
          >
            {save.isPending
              ? "Saving…"
              : caseId
                ? "Approve physical work"
                : "Save arrival work"}
          </button>
        </form>
      )}
    </div>
  );
}
function ArrivalDetail({
  id,
  receiving,
  outbound,
}: {
  id: string;
  receiving: boolean;
  outbound: boolean;
}) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["arrival-source", id],
    queryFn: () => apiFetch<Detail>(`/api/operation/arrival-sources/${id}`),
    staleTime: 0,
  });
  const options = useOptions();
  const row = useMemo(
    () =>
      q.data && options.data
        ? inboundArrivals({
            pos: [],
            suppliers: [],
            destinations: [],
            sites: options.data.sites,
            parties: options.data.parties,
            arrivalSources: [q.data.source],
            sourceEvents: q.data.events.map((e) => ({ ...e, source_id: id })),
            sourceUnits: q.data.units,
            units: q.data.units.map((u) => ({ ...u.unit, po_no: null })),
            receipts: q.data.receipts.map((r) => ({
              ...r,
              po_id: null,
              arrival_source_id: id,
            })),
            results: q.data.receipts.flatMap((r) =>
              r.unit_results.map((u) => ({ ...u, receipt_id: r.id })),
            ),
          })[0]
        : null,
    [q.data, options.data, id],
  );
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["arrival-source", id] }),
      qc.invalidateQueries({ queryKey: ["operation", "warehouse-inbound"] }),
      qc.invalidateQueries({ queryKey: ["operation", "warehouse-receipts"] }),
    ]);
  };
  if (q.isLoading || options.isLoading)
    return <p role="status">Loading arrival…</p>;
  if (q.error || options.error)
    return (
      <div role="alert">
        {q.error?.message || options.error?.message}
        <button
          className={actionCls}
          onClick={() => {
            q.refetch();
            options.refetch();
          }}
        >
          Retry
        </button>
      </div>
    );
  if (!q.data || !options.data) return <p>Source not found.</p>;
  const d = q.data;
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap gap-4">
        <Link
          className="text-kit-blue-11"
          to="/operation?tab=warehouse-inbound"
        >
          Back to Inbound
        </Link>
        {d.source.claim_id && (
          <Link
            className="text-kit-blue-11"
            to={`/operation?tab=claims&claim=${d.source.claim_id}`}
          >
            Supplier Claim
          </Link>
        )}
        {d.source.case_id && (
          <Link
            className="text-kit-blue-11"
            to={`/operation?tab=service-notes&case=${d.source.case_id}`}
          >
            Service Case
          </Link>
        )}
      </div>
      <h1 className="text-page">
        {d.source.source_no} ·{" "}
        {ARRIVAL_SOURCE_TYPES.find(([k]) => k === d.source.kind)?.[1]}
      </h1>
      <p className="text-body">
        {row?.party ?? "Party not recorded"} ·{" "}
        {options.data.sites.find((s) => s.id === d.source.to_site_id)?.name} ·
        Expected {fmtDate(d.source.expected_date)}
      </p>
      <p className="text-body">{d.source.reason}</p>
      {d.source.cancelled_at ? (
        <p>Cancelled</p>
      ) : (
        <>
          <p className="text-body">
            Expected {row?.expected} · Received {row?.received} · Not yet
            received {row?.remaining} · With issue {row?.issues}
          </p>
          <div className="divide-y divide-kit-slate-5">
            {row?.units.map((u) => (
              <div key={u.id} className="flex flex-wrap gap-3 py-2 text-body">
                <Link
                  className="text-kit-blue-11"
                  to={`/operation/stock/unit/${u.code}`}
                >
                  {u.code}
                </Link>
                <span>
                  {u.outcome === "received_with_issue"
                    ? "Received with issue"
                    : u.outcome === "received"
                      ? "Received"
                      : "Not received"}
                </span>
                {u.issue && (
                  <span>
                    {u.issue === "damaged" ? "Damaged" : "Wrong item"}
                  </span>
                )}
              </div>
            ))}
          </div>
          {receiving ? (
            <ReceiveArrival
              id={id}
              detail={d}
              options={options.data}
              pending={
                row?.units
                  .filter(
                    (u) =>
                      u.outcome !== "received" &&
                      u.outcome !== "received_with_issue",
                  )
                  .map((u) => u.id) ?? []
              }
              onSaved={refresh}
            />
          ) : (
            <>
              <Link
                className="text-kit-blue-11"
                to={`/operation?tab=receiving&arrival=${id}`}
              >
                Open Receiving
              </Link>
              {outbound ? (
                <HandoverArrival
                  id={id}
                  detail={d}
                  options={options.data}
                  onSaved={refresh}
                />
              ) : (
                <Link
                  className="text-kit-blue-11"
                  to={`/operation?tab=warehouse-outbound&arrival=${id}`}
                >
                  Open Outbound
                </Link>
              )}
              <ChangeArrival id={id} source={d.source} onSaved={refresh} />
            </>
          )}
        </>
      )}
      {row &&
        (d.source.kind === "transfer" || d.source.kind === "repair-return") &&
        arrivalHandoverDifferences(row.units, d.events).map((g) => (
          <p key={g.unitId} className="text-body">
            {row.units.find((u) => u.id === g.unitId)?.code} · Needs checking:{" "}
            {g.originMissing
              ? "origin handover not recorded"
              : "delivery party receipt not recorded"}
          </p>
        ))}
      <h2 className="text-strong">Receiving records</h2>
      {!d.receipts.length && (
        <p className="text-body">No Receiving recorded.</p>
      )}
      {d.receipts.map((r) => (
        <div key={r.id} className="border-t border-kit-slate-5 py-3">
          <p>
            {r.grn_no} · {fmtDate(r.goods_received_at)} ·{" "}
            {r.status === "voided" ? "Cancelled" : "Valid"}
          </p>
          <p className="text-meta">{r.do_number}</p>
          <ReceiptActions
            sourceId={id}
            receipt={r}
            allowVoid={receiving}
            onSaved={refresh}
          />
          {r.unit_results.map((u) => (
            <p className="text-meta" key={u.stock_item_id}>
              {u.unit_code} · {u.outcome.replaceAll("_", " ")}
              {u.issue_kind ? ` · ${u.issue_kind.replaceAll("_", " ")}` : ""}
            </p>
          ))}
        </div>
      ))}
      <h2 className="text-strong">History</h2>
      {d.events.map((e) => (
        <div key={e.id} className="border-t border-kit-slate-5 py-2 text-body">
          <p>
            {fmtDate(e.occurred_at)} · {e.kind.replaceAll("_", " ")} {e.person}
          </p>
          {e.evidence && <p>{e.evidence}</p>}
          <p className="text-meta">
            {e.unit_ids
              .map(
                (uid) =>
                  d.units.find((u) => u.stock_item_id === uid)?.unit
                    .unit_code ?? uid,
              )
              .join(" · ")}
          </p>
        </div>
      ))}
    </div>
  );
}
function ReceiveArrival({
  id,
  detail,
  options,
  pending,
  onSaved,
}: {
  id: string;
  detail: Detail;
  options: Options;
  pending: string[];
  onSaved: () => Promise<void>;
}) {
  const duty = useReceivingDuty();
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [date, setDate] = useState("");
  const [site, setSite] = useState("");
  const [holder, setHolder] = useState("");
  const [person, setPerson] = useState("");
  const [doNo, setDoNo] = useState("");
  const [proof, setProof] = useState("");
  const [note, setNote] = useState("");
  const [outcomes, setOutcomes] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const save = useMutation({
    mutationFn: (input: unknown) =>
      apiFetch(`/api/operation/warehouse-receipts/arrival/${id}`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      setKey(crypto.randomUUID());
      setOutcomes({});
      setDoNo("");
      setProof("");
      await onSaved();
    },
  });
  if (!pending.length) return <p>All listed Units received.</p>;
  return (
    <form
      className="space-y-4 border-t border-kit-slate-5 pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        const input = {
          key,
          goods_received_at: date,
          actual_site_id: site,
          holder_party_id: holder,
          handover_person: person,
          do_number: doNo,
          do_file_path: proof,
          note,
          units: pending.map((uid) => ({
            stock_item_id: uid,
            outcome:
              outcomes[uid] === "damaged" || outcomes[uid] === "wrong_item"
                ? "received_with_issue"
                : (outcomes[uid] ?? "not_received"),
            issue_kind:
              outcomes[uid] === "damaged" || outcomes[uid] === "wrong_item"
                ? outcomes[uid]
                : null,
            note: "",
          })),
        };
        const p = arrivalReceivingInput.safeParse(input);
        if (!p.success) {
          setError(p.error.issues[0].message);
          return;
        }
        save.mutate(p.data);
      }}
    >
      <h2 className="text-strong">Receiving</h2>
      <p className="text-body">
        Record the actual arrival. Returned and repaired Units stay held for
        inspection.
      </p>
      {duty.isLoading ? (
        <p>Checking GRN Duty…</p>
      ) : (
        !duty.data?.allowed && (
          <p role="alert">
            {duty.error?.message ??
              "Only GRN Duty, its cover or Operations Superuser can save Receiving."}
          </p>
        )
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          Goods received on
          <input
            required
            type="date"
            className={fieldCls}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label>
          Actual Site
          <select
            required
            className={fieldCls}
            value={site}
            onChange={(e) => setSite(e.target.value)}
          >
            <option value="">Choose Site</option>
            {options.sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Receiving party
          <select
            required
            className={fieldCls}
            value={holder}
            onChange={(e) => setHolder(e.target.value)}
          >
            <option value="">Choose party</option>
            {options.parties
              .filter((p) => p.kind !== "delivery_operator")
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Handover person
          <input
            required
            className={fieldCls}
            value={person}
            onChange={(e) => setPerson(e.target.value)}
          />
        </label>
        <label>
          Handover document number
          <input
            required
            className={fieldCls}
            value={doNo}
            onChange={(e) => setDoNo(e.target.value)}
          />
        </label>
      </div>
      <DOFileUploadField
        key={key}
        poId=""
        arrivalSourceId={id}
        doNumber={doNo}
        onUploaded={setProof}
      />
      {pending.map((uid) => (
        <label className="grid gap-2 sm:grid-cols-2" key={uid}>
          {detail.units.find((u) => u.stock_item_id === uid)?.unit.unit_code}
          <select
            aria-label={`Result ${detail.units.find((u) => u.stock_item_id === uid)?.unit.unit_code}`}
            className={fieldCls}
            value={outcomes[uid] ?? "not_received"}
            onChange={(e) =>
              setOutcomes((p) => ({ ...p, [uid]: e.target.value }))
            }
          >
            <option value="not_received">Not received</option>
            <option value="received">Received</option>
            <option value="damaged">Received with issue · Damaged</option>
            <option value="wrong_item">Received with issue · Wrong item</option>
          </select>
        </label>
      ))}
      <label className="block">
        Note
        <textarea
          className={fieldAreaCls}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      {(error || save.error) && (
        <p role="alert">{error || save.error?.message}</p>
      )}
      <button
        className={actionCls}
        disabled={!duty.data?.allowed || save.isPending || !proof}
      >
        {save.isPending ? "Saving…" : "Save Receiving"}
      </button>
    </form>
  );
}
function HandoverArrival({
  id,
  detail,
  options,
  onSaved,
}: {
  id: string;
  detail: Detail;
  options: Options;
  onSaved: () => Promise<void>;
}) {
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [kind, setKind] = useState("collected");
  const [units, setUnits] = useState<string[]>([]);
  const [party, setParty] = useState("");
  const [person, setPerson] = useState("");
  const [date, setDate] = useState("");
  const [evidence, setEvidence] = useState("");
  const [checks, setChecks] = useState<string[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const m = useMutation({
    mutationFn: () =>
      apiFetch(`/api/operation/arrival-sources/${id}/handover`, {
        method: "POST",
        body: JSON.stringify({
          key,
          kind,
          unit_ids: units,
          party_id: party,
          person,
          occurred_at: new Date(date).toISOString(),
          evidence,
          ...(detail.source.case_approval?.condition_required
            ? {
                collection_review: {
                  passed_conditions: checks,
                  evidence_paths: photos,
                },
              }
            : {}),
        }),
      }),
    onSuccess: async () => {
      setKey(crypto.randomUUID());
      setUnits([]);
      await onSaved();
    },
  });
  return (
    <form
      className="space-y-3 border-t border-kit-slate-5 pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
    >
      <h2 className="text-strong">Record handover</h2>
      <select
        aria-label="Handover event"
        className={fieldCls}
        value={kind}
        onChange={(e) => setKind(e.target.value)}
      >
        <option value="collected">Collected from origin</option>
        <option value="carrier_received">Delivery party received</option>
        {detail.source.case_approval?.condition_required && (
          <option value="collection_refused">
            Do not collect — condition failed
          </option>
        )}
      </select>
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          Actual date and time
          <input
            required
            className={fieldCls}
            type="datetime-local"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label>
          Actual party
          <select
            required
            className={fieldCls}
            value={party}
            onChange={(e) => setParty(e.target.value)}
          >
            <option value="">Choose party</option>
            {options.parties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Person
          <input
            required
            className={fieldCls}
            value={person}
            onChange={(e) => setPerson(e.target.value)}
          />
        </label>
        <label>
          Evidence
          <textarea
            required
            className={fieldAreaCls}
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
          />
        </label>
      </div>
      {detail.units.map((u) => (
        <label key={u.stock_item_id} className="flex gap-3 text-body">
          <input
            type="checkbox"
            checked={units.includes(u.stock_item_id)}
            onChange={(e) =>
              setUnits((p) =>
                e.target.checked
                  ? [...p, u.stock_item_id]
                  : p.filter((i) => i !== u.stock_item_id),
              )
            }
          />
          {u.unit.unit_code}
        </label>
      ))}
      {detail.source.case_approval?.condition_required &&
        kind !== "carrier_received" && (
          <section className="space-y-2">
            <h3 className="text-strong">Doorstep check before loading</h3>
            <p className="text-body">
              Check every selected Unit. Record photos before loading. If a
              condition fails, choose Do not collect; the Units stay with their
              current holder.
            </p>
            {COLLECTION_CONDITIONS.map(([key, label]) => (
              <label className="flex gap-3 text-body" key={key}>
                <input
                  type="checkbox"
                  checked={checks.includes(key)}
                  onChange={(e) =>
                    setChecks((p) =>
                      e.target.checked
                        ? [...p, key]
                        : p.filter((v) => v !== key),
                    )
                  }
                />
                {label}
              </label>
            ))}
            <DOFileUploadField
              imageOnly
              poId=""
              arrivalSourceId={id}
              doNumber={evidence}
              onUploaded={(path) => setPhotos((p) => [...p, path])}
            />
            <p className="text-meta">
              {photos.length} doorstep photos attached
            </p>
          </section>
        )}
      {m.error && <p role="alert">{m.error.message}</p>}
      <button className={actionCls} disabled={m.isPending || !units.length}>
        {m.isPending ? "Saving…" : "Save handover"}
      </button>
    </form>
  );
}
function ChangeArrival({
  id,
  source,
  onSaved,
}: {
  id: string;
  source: ArrivalSource;
  onSaved: () => Promise<void>;
}) {
  const [date, setDate] = useState(source.expected_date);
  const [collection, setCollection] = useState(source.collection_date ?? "");
  const [reason, setReason] = useState("");
  const m = useMutation({
    mutationFn: (cancel: boolean) =>
      apiFetch(
        `/api/operation/arrival-sources/${id}/${cancel ? "cancel" : "dates"}`,
        {
          method: "POST",
          body: JSON.stringify(
            cancel
              ? { reason }
              : {
                  reason,
                  expected_date: date,
                  collection_date: collection || null,
                },
          ),
        },
      ),
    onSuccess: onSaved,
  });
  return (
    <form
      className="space-y-3 border-t border-kit-slate-5 pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate(false);
      }}
    >
      <h2 className="text-strong">Change planned dates</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          Collection date
          <input
            className={fieldCls}
            type="date"
            value={collection}
            onChange={(e) => setCollection(e.target.value)}
          />
        </label>
        <label>
          Expected arrival
          <input
            required
            className={fieldCls}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
      </div>
      <label className="block">
        Reason
        <textarea
          required
          className={fieldAreaCls}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      {m.error && <p role="alert">{m.error.message}</p>}
      <div className="flex gap-3">
        <button disabled={m.isPending} className={actionCls}>
          Save dates
        </button>
        <button
          type="button"
          disabled={!reason.trim() || m.isPending}
          className={actionCls}
          onClick={() => m.mutate(true)}
        >
          Cancel before collection
        </button>
      </div>
    </form>
  );
}

function ReceiptActions({
  sourceId,
  receipt,
  allowVoid,
  onSaved,
}: {
  sourceId: string;
  receipt: Receipt;
  allowVoid: boolean;
  onSaved: () => Promise<void>;
}) {
  const duty = useReceivingDuty();
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);
  const [proofUrl, setProofUrl] = useState("");
  const proof = useMutation({
    mutationFn: () =>
      apiFetch<{ url: string }>(
        `/api/operation/arrival-sources/${sourceId}/proof?path=${encodeURIComponent(receipt.do_file_path)}`,
      ),
    onSuccess: (r) => setProofUrl(r.url),
  });
  const cancel = useMutation({
    mutationFn: () =>
      apiFetch(
        `/api/operation/warehouse-receipts/arrival-receipts/${receipt.id}/void`,
        { method: "POST", body: JSON.stringify({ reason }) },
      ),
    onSuccess: async () => {
      setOpen(false);
      await onSaved();
    },
  });
  return (
    <div className="space-y-2 py-2">
      <div className="flex flex-wrap gap-3">
        {proofUrl ? (
          <a
            className="text-kit-blue-11"
            href={proofUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open handover proof
          </a>
        ) : (
          <button
            className={actionCls}
            disabled={proof.isPending}
            onClick={() => proof.mutate()}
          >
            View handover proof
          </button>
        )}
        {allowVoid && receipt.status === "posted" && (
          <button
            className={actionCls}
            disabled={!duty.data?.allowed}
            onClick={() => setOpen((v) => !v)}
          >
            Cancel Receiving
          </button>
        )}
      </div>
      {open && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            cancel.mutate();
          }}
        >
          <p className="text-body">
            Cancellation restores only these Units to their recorded state
            before Receiving. A Unit changed afterward must be corrected through
            its later record first.
          </p>
          <label>
            Reason
            <textarea
              required
              className={fieldAreaCls}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button
            className={actionCls}
            disabled={cancel.isPending || !reason.trim()}
          >
            Cancel this Receiving
          </button>
        </form>
      )}
      {(proof.error || cancel.error) && (
        <p role="alert">{proof.error?.message || cancel.error?.message}</p>
      )}
    </div>
  );
}
