// design-standard: not-a-list-page — full-width Claim object content.
import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  carresExecutionLabel, customerResolutionLabel, heldUnitsLine,
  supplierClaimRequestLabel, supplierClaimResponseLabel, supplierClaimTypeLabel,
  type ServiceCaseListResponse,
  type CaseEvidenceListResponse,
  type ServiceCase,
} from "@carres/shared";
import { apiFetch } from "@/lib/api";
import { useOperationSupplierClaimPhotos, type SupplierClaimListRow } from "@/lib/queries";
import { fmtDate } from "@/lib/fmt-date";
import { SectionCard } from "@/components/SectionPanel";
import SectionHeader from "@/components/kit/SectionHeader";
import Button from "@/components/kit/Button";
import Select from "@/components/kit/Select";
import { RecordRanks } from "../SalesOrderLedger";

const absent = "Not recorded";

function ClaimCaseLink({ claim }: { claim: SupplierClaimListRow }) {
  const [editing, setEditing] = useState(false);
  const [caseId, setCaseId] = useState("");
  const qc = useQueryClient();
  const cases = useQuery<ServiceCaseListResponse>({
    queryKey: ["ops", "service-cases", "claim-link"],
    queryFn: () => apiFetch("/api/ops/service-cases?state=ongoing"),
    enabled: editing,
  });
  const link = useMutation({
    mutationFn: () => apiFetch(`/api/ops/service-cases/${caseId}/supplier-claims`, {
      method: "POST", body: JSON.stringify({ claimId: claim.id }),
    }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["operation", "supplier-claims"] }); setEditing(false); },
  });
  const candidates = (cases.data?.items ?? []).filter((row) => row.issueType === claim.claim_type && row.productCategory === claim.product_category && (!row.productSku || row.productSku === claim.sku));
  if (claim.case_id) return <Link className="text-kit-blue-11 underline" to={`/operation?tab=service-notes&case=${encodeURIComponent(claim.case_id)}`}>Open Case</Link>;
  if (claim.status !== "open" || claim.claim_type === "late_delivery") return <p>Case link is not available.</p>;
  return <div className="space-y-2">
    {!editing ? <Button variant="neutral" onClick={() => setEditing(true)}>Link Case</Button> : <>
      <p>Select the existing Case for this same incident. Similar faults on other Units stay separate.</p>
      <Select id={`claim-case-${claim.id}`} label="Case" value={caseId} onValueChange={setCaseId}
        disabled={cases.isLoading || link.isPending}
        options={candidates.map((row) => ({ value: row.id, label: `${row.caseNo} · ${row.customerImpact === "stock_only" ? "Unsold stock" : row.customerName || absent} · ${row.whatHappened || absent}` }))} />
      {cases.isSuccess && candidates.length === 0 && <p>No matching Cases.</p>}
      {cases.isError && <p role="alert">Cases could not be loaded.</p>}
      {link.isError && <p role="alert">{link.error.message}</p>}
      <div className="flex flex-wrap items-center gap-2"><Button variant="neutral" disabled={!caseId || link.isPending} onClick={() => link.mutate()}>Link Case</Button>
      <Button variant="neutral" disabled={link.isPending} onClick={() => setEditing(false)}>Cancel</Button>
      <Link className="text-kit-blue-11 underline" to="/operation?tab=service-notes">Open Cases</Link>
      </div>
    </>}
  </div>;
}

export function ClaimSection({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <SectionCard><SectionHeader title={title} action={action} />
    <div className="px-4 pb-4 text-body text-base-800 space-y-2 break-words">{children}</div>
  </SectionCard>;
}

export function ClaimSource({ claim }: { claim: SupplierClaimListRow }) {
  return <span className="inline-flex flex-wrap gap-3">
    {claim.po_id ? <Link className="text-kit-blue-11 underline" to={`/operation/procurement/${encodeURIComponent(claim.po_id)}`}>{claim.po_id}</Link> : <span>Source not linked</span>}
    {claim.warehouse_receipt_id && <Link className="text-kit-blue-11 underline" to={`/operation?tab=receiving&session=${encodeURIComponent(claim.warehouse_receipt_id)}`}>{claim.grn_no || "Receiving"}</Link>}
  </span>;
}

/** Short inspector: facts and one door, never a mounted editor. */
export function SupplierClaimInspector({ claim, onOpen }: { claim: SupplierClaimListRow; onOpen: () => void }) {
  return <div className="p-4 text-body space-y-2" data-testid="claim-inspector">
    <p>Problem: {supplierClaimTypeLabel(claim.claim_type)}</p>
    {claim.note && <p className="whitespace-pre-wrap">{claim.note}</p>}
    <p>Evidence: {claim.photo_count} photos</p>
    {!!claim.held_unit_codes?.length && <p>Units on hold: {claim.held_unit_codes.join(" · ")}</p>}
    <Button variant="neutral" onClick={onOpen}>Open Claim</Button>
  </div>;
}

/** Read the existing facts without upgrading legacy answers to scoped approvals.
 * The approved Case/intake, instruction and completion writers are dependencies;
 * the old inline customer/stock/close mutations cannot stand in for those doors.
 */
export default function SupplierClaimPanel({ claim }: { claim: SupplierClaimListRow }) {
  const photos = useOperationSupplierClaimPhotos(claim.photo_count ? claim.id : null);
  const parentCase = useQuery<ServiceCase>({
    queryKey: ["ops", "service-cases", claim.case_id],
    queryFn: () => apiFetch(`/api/ops/service-cases/${claim.case_id}`),
    enabled: Boolean(claim.case_id),
  });
  const caseEvidence = useQuery<CaseEvidenceListResponse>({
    queryKey: ["ops", "service-cases", claim.case_id, "evidence"],
    queryFn: () => apiFetch(`/api/ops/service-cases/${claim.case_id}/evidence`),
    enabled: Boolean(claim.case_id),
  });
  const history = [
    { title: "Reported", date: claim.reported_at, actor: claim.reported_by_name, detail: claim.note },
    { title: "What we asked", date: claim.requested_at, actor: null, detail: claim.requested_action ? supplierClaimRequestLabel(claim.requested_action) : null },
    { title: "Supplier Response", date: claim.responded_at, actor: null, detail: claim.supplier_response ? `${supplierClaimResponseLabel(claim.supplier_response)}${claim.supplier_response_note ? ` · ${claim.supplier_response_note}` : ""}` : null },
    { title: "Customer Resolution", date: claim.customer_resolution_at, actor: null, detail: claim.customer_resolution ? customerResolutionLabel(claim.customer_resolution) : null },
    { title: "Carres Execution", date: claim.carres_execution_at, actor: null, detail: claim.carres_execution ? carresExecutionLabel(claim.carres_execution) : null },
    { title: "Closed", date: claim.closed_at, actor: null, detail: claim.close_note },
  ].filter((event) => event.date).sort((a, b) => a.date!.localeCompare(b.date!));

  return <div className="flex flex-col gap-4" data-testid={`claim-panel-${claim.claim_no}`}>
    <ClaimSection title="The Item" action={<ClaimSource claim={claim} />}>
      <p className="font-semibold">{claim.product_description || absent}</p>
      <p>Variant: {claim.product_variant || absent}</p>
      <p className="text-meta text-base-600">SKU: {claim.sku}</p>
      <div className="flex flex-wrap gap-x-6 gap-y-2"><p>Affected Qty: {claim.qty}</p>
      <p>Supplier DO: {claim.do_number || absent}</p></div>
      <p>Unit ID: {claim.service_case_units?.map((u) => u.unit_code).join(" · ") || absent}</p>
      <p>Units on hold: {claim.held_unit_codes?.join(" · ") || absent}</p>
    </ClaimSection>
    <ClaimSection title="Problem">
      <p className="font-semibold">{supplierClaimTypeLabel(claim.claim_type)}</p>
      {claim.note && <p className="whitespace-pre-wrap">{claim.note}</p>}
      <p>Reported: {fmtDate(claim.reported_at)} · {claim.reported_by_name || absent}</p>
      <ClaimCaseLink claim={claim} />
      <p className="text-label font-normal text-base-600">{parentCase.data?.customerImpact === "stock_only" ? "Unsold stock. No customer affected." : parentCase.data?.customerImpact === "customer" ? "Customer affected" : "Customer impact is not recorded."}</p>
    </ClaimSection>
    <ClaimSection title="Evidence">
      {claim.case_id && <div className="space-y-2">
        <p className="font-semibold">Case evidence</p>
        {caseEvidence.isLoading ? <p>Loading evidence…</p> : caseEvidence.isError ? <p role="alert">Evidence could not be loaded.</p> : caseEvidence.data?.evidence.map((file, index) => <p key={file.path}>
          {file.url ? <a className="text-kit-blue-11 underline" href={file.url} target="_blank" rel="noreferrer">Case evidence {index + 1}</a> : <span>Case evidence {index + 1}: unavailable</span>}
        </p>)}
      </div>}
      {!claim.photo_count ? <p>No photos recorded.</p> : photos.isError ? <div role="alert"><p>Evidence could not be loaded.</p><Button variant="neutral" onClick={() => void photos.refetch()}>Try again</Button></div>
        : photos.isLoading ? <p>Loading evidence…</p>
        : <div className="flex flex-wrap gap-3">{photos.data?.photos.map((photo, index) => <div key={photo.path} className="space-y-1">
          {photo.url ? <a href={photo.url} target="_blank" rel="noreferrer" className="text-kit-blue-11 underline">Photo {index + 1}</a> : <span>Photo {index + 1}: unavailable</span>}
          {photo.at && <p className="text-label text-base-600">{fmtDate(photo.at)}</p>}
        </div>)}{!photos.data?.photos.length && <p>Evidence is not available.</p>}</div>}
    </ClaimSection>
    <ClaimSection title="Supplier Response">
      <p>What we asked: {claim.requested_action ? supplierClaimRequestLabel(claim.requested_action) : absent}</p>
      {claim.requested_at && <p className="text-meta text-base-600">{fmtDate(claim.requested_at)}</p>}
      <p>Supplier Response: {claim.supplier_response ? supplierClaimResponseLabel(claim.supplier_response) : absent}</p>
      {claim.supplier_response_note && <p className="whitespace-pre-wrap">{claim.supplier_response_note}</p>}
      {claim.responded_at && <p className="text-meta text-base-600">{fmtDate(claim.responded_at)}</p>}
      <p className="text-label font-normal text-base-600">Supplier instruction and reply recording are not available here yet.</p>
    </ClaimSection>
    <ClaimSection title="Customer Resolution">
      <p>{claim.customer_resolution ? customerResolutionLabel(claim.customer_resolution) : absent}</p>
      {claim.customer_resolution_note && <p>{claim.customer_resolution_note}</p>}
      {claim.case_id && <Link className="text-kit-blue-11 underline" to={`/operation?tab=service-notes&case=${encodeURIComponent(claim.case_id)}`}>Open Case</Link>}
    </ClaimSection>
    <ClaimSection title="Carres Execution">
      <p>{claim.carres_execution ? carresExecutionLabel(claim.carres_execution) : absent}</p>
      {claim.carres_execution_note && <p>{claim.carres_execution_note}</p>}
      <p className="text-label font-normal text-base-600">Approved execution scope is not available.</p>
    </ClaimSection>
    <ClaimSection title="Item Outcome">
      <p>{heldUnitsLine(claim.held_units, claim.hold_reason)}</p>
      <p className="text-label font-normal text-base-600">Physical completion evidence is not available here.</p>
    </ClaimSection>
    <ClaimSection title="Supplier money">
      <p>Finance settlement evidence is not available.</p>
    </ClaimSection>
    <ClaimSection title="Documents">
      <p>Claim Version: {absent}</p><p>Sent to Supplier: {absent}</p>
      <p className="text-label font-normal text-base-600">Each sent claim pack records its frozen version, recipient, channel, actual sent time, actor and proof here when the shared document ledger is connected. Opening WhatsApp, copying or downloading a file does not record a send.</p>
    </ClaimSection>
    <ClaimSection title="History">
      <p className="text-label font-normal text-base-600">Recorded dates only. Full event history is not available.</p>
      {history.map((event, index) => <div key={`${event.title}-${event.date}`} className="flex flex-col gap-1 py-2">
        <RecordRanks index={index} words={{ title: event.title, identity: `${event.actor || "Staff identity not recorded"} · ${fmtDate(event.date!, { time: true })}`, detail: event.detail ? [event.detail] : [] }} />
      </div>)}
    </ClaimSection>
  </div>;
}
