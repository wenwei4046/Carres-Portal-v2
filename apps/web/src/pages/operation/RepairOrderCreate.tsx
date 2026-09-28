// design-standard: not-a-list-page — the Create Repair Order FORM.
/**
 * ⭐ CREATE REPAIR ORDER — `docs/purchasing/MASTER.md` §9.7 "Create Repair
 * Order — owner approved 2026-09-28":
 *
 * ```
 * Create Repair Order                                   [Cancel] [Save repair order]
 * 1 Goods      Choose where the goods are now: Carres Klang | Showroom | Dealer
 *              [Add Units] → Tick the Unit ID on each item to send for repair
 *              per Unit: What did you see? · Photo · What happened, in one sentence ·
 *                        Repair Requirement
 * 2 Repair     Supplier · Cost Responsibility · Price (optional) · Repair Quotation (optional,
 *              photo or PDF: the upload slot admits PDF for this purpose only)
 * 3 Locations  Supplier Pickup Location (from the Unit) · Supplier Return Location
 * ```
 *
 * Only real Units can be ticked; a refused Unit says why ON THE ROW, in the
 * database's own words (`repair_order_eligible_units`). A Claim-origin RO
 * arrives with its Claim photos linked BY REFERENCE — nothing re-uploaded.
 * `Save repair order` mints RO No and opens the object, where `Issue repair
 * order` sends it. System-filled values wear the grey automatic box.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  REPAIR_COST_RESPONSIBILITIES,
  REPAIR_COST_RESPONSIBILITY_LABEL,
  REPAIR_PROBLEM_CHOICES,
  klDate,
  type RepairCostResponsibility,
  type RepairOrderEligibleUnit,
  type RepairOrderEvidenceFile,
  type RepairProblem,
} from "@carres/shared";
import { ApiError, apiFetch } from "@/lib/api";
import {
  useOperationSupplierClaimPhotos,
  useOperationSupplierClaims,
  useRepairOrderEligibleUnits,
  useRepairOrderOptions,
} from "@/lib/queries";
import { fmtDate } from "@/lib/fmt-date";
import Block from "@/components/kit/Block";
import Button from "@/components/kit/Button";
import Checkbox from "@/components/kit/Checkbox";
import Drawer from "@/components/kit/Drawer";
import Input from "@/components/kit/Input";
import SearchInput from "@/components/kit/SearchInput";
import Select from "@/components/kit/Select";
import Textarea from "@/components/kit/Textarea";
import EvidenceUploadField from "@/components/EvidenceUploadField";
import PurchasingTabs from "./PurchasingTabs";
import { Fact } from "./SalesOrderWorkspace";

type UnitDraft = {
  unit: RepairOrderEligibleUnit;
  problem: RepairProblem | null;
  note: string;
  requirement: string;
  evidence: RepairOrderEvidenceFile[];
};
type Upload = { path: string; kind: "photo" | "video" };

const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;
const VIDEO_MIMES = ["video/mp4", "video/quicktime"] as const;
const PDF_MIMES = ["application/pdf"] as const;

export function repairOrderDraftReady(units: readonly UnitDraft[], supplier: string, site: string | null, returnSite: string) {
  return (
    units.length > 0 &&
    Boolean(supplier) &&
    Boolean(site) &&
    Boolean(returnSite) &&
    units.every((u) => u.problem && u.note.trim().length >= 3 && u.requirement.trim().length > 0)
  );
}

export default function RepairOrderCreate({ claimId }: { claimId: string | null }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const options = useRepairOrderOptions();
  const claims = useOperationSupplierClaims("all", { enabled: Boolean(claimId) });
  const claim = claimId ? claims.data?.claims.find((c) => c.id === claimId) ?? null : null;
  const claimPhotos = useOperationSupplierClaimPhotos(claimId);

  const [site, setSite] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [units, setUnits] = useState<UnitDraft[]>([]);
  const [supplier, setSupplier] = useState("");
  const [cost, setCost] = useState<RepairCostResponsibility>("not_decided");
  const [price, setPrice] = useState("");
  const [returnSite, setReturnSite] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const [quotation, setQuotation] = useState<{ path: string; kind: string }[]>([]);
  // The upload slot's folder before the RO exists: one per create page.
  const [quoteScope] = useState(() => crypto.randomUUID());
  const request = useRef<{ key: string; id: string } | null>(null);

  // A Claim-origin RO defaults its Supplier to the Claim's; it may differ.
  useEffect(() => {
    if (claim && !supplier) setSupplier(claim.supplier_id);
  }, [claim, supplier]);
  useEffect(() => {
    if (site && !returnSite) setReturnSite(site);
  }, [site, returnSite]);

  const carresSites = (options.data?.sites ?? []).filter((s) => s.carres);
  const siteName = (id: string | null) => options.data?.sites.find((s) => s.id === id)?.name ?? null;

  const save = useMutation({
    mutationFn: (body: object) =>
      apiFetch<{ id: string; ro_no: string }>("/api/operation/repair-orders", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (out) => {
      void qc.invalidateQueries({ queryKey: ["operation", "repair-orders"] });
      navigate(`/operation?tab=repair-orders&ro=${encodeURIComponent(out.ro_no)}`);
    },
    onError: (error) => setFailure(error instanceof ApiError ? error.message : "Not saved · Try again"),
  });

  const ready = repairOrderDraftReady(units, supplier, site, returnSite) && !save.isPending;
  const submit = () => {
    if (!ready || !site) return;
    const body = {
      supplier_id: supplier,
      supplier_claim_id: claimId,
      cost_responsibility: cost,
      price: price.trim() === "" ? null : Number(price),
      quotation_path: quotation[0]?.path ?? null,
      pickup_site_id: site,
      return_site_id: returnSite,
      units: units.map((u) => ({
        stock_item_id: u.unit.id,
        problem: u.problem,
        problem_note: u.note.trim(),
        repair_requirement: u.requirement.trim(),
        evidence: u.evidence,
      })),
    };
    // One request id per set of answers: a retry cannot mint a second RO.
    const key = JSON.stringify(body);
    if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() };
    setFailure(null);
    save.mutate({ request_id: request.current.id, ...body });
  };

  const addUnits = (picked: RepairOrderEligibleUnit[]) => {
    const claimEvidence: RepairOrderEvidenceFile[] = (claimPhotos.data?.photos ?? []).map((p) => ({ path: p.path, kind: "photo", source: "claim" }));
    setUnits((prev) => [
      ...prev,
      ...picked
        .filter((u) => !prev.some((p) => p.unit.id === u.id))
        .map((unit) => ({ unit, problem: null, note: claim?.note ?? "", requirement: "", evidence: claimEvidence })),
    ]);
    setDrawer(false);
  };
  const patch = (id: string, change: Partial<UnitDraft>) =>
    setUnits((prev) => prev.map((u) => (u.unit.id === id ? { ...u, ...change } : u)));

  const sign = (unitId: string) => async (file: File) =>
    apiFetch<{ token: string; path: string }>("/api/ops/issues/evidence/upload-url", {
      method: "POST",
      body: JSON.stringify({ mimeType: file.type, scope: { kind: "unit", id: unitId } }),
    });

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="repair-order-create">
      <PurchasingTabs />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-3 p-4">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-page text-kit-slate-12">Create Repair Order</h1>
            <div className="flex gap-2">
              <Button variant="neutral" onClick={() => navigate("/operation?tab=repair-orders")} disabled={save.isPending}>Cancel</Button>
              <Button variant="primary" disabled={!ready} loading={save.isPending} onClick={submit} data-testid="repair-order-save">Save repair order</Button>
            </div>
          </header>
          {failure ? (
            <p role="alert" className="rounded-control border border-kit-red-9 bg-kit-red-3 px-3 py-2 text-body text-kit-red-11" data-testid="repair-order-refusal">{failure}</p>
          ) : null}

          {/* 1 · GOODS */}
          <Block title="Goods" subtitle="Choose where the goods are now">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Choose where the goods are now">
              {carresSites.map((s) => (
                <Button
                  key={s.id}
                  variant={site === s.id ? "primary" : "neutral"}
                  aria-pressed={site === s.id}
                  onClick={() => {
                    /* The goods are where they are: another Site means other
                       Units, so the ones picked here come off the list. */
                    if (site !== s.id) {
                      setUnits([]);
                      setReturnSite("");
                    }
                    setSite(s.id);
                  }}
                >
                  {s.name}
                </Button>
              ))}
              {/* A Dealer is not a Carres Site (§7.4a). */}
              <Button variant="neutral" disabled title="Not available yet">Dealer</Button>
              <span className="self-center text-meta text-kit-slate-11">Not available yet</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="neutral" icon="add" disabled={!site} onClick={() => setDrawer(true)} data-testid="repair-order-add-units">Add Units</Button>
              {units.length === 0 ? <span className="text-body text-kit-slate-11">Click Add Units</span> : null}
            </div>
            {units.map((u) => (
              <section key={u.unit.id} className="rounded-control border border-kit-slate-5 p-3" data-testid={`repair-order-unit-${u.unit.unit_id}`}>
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-strong text-kit-slate-12">{u.unit.unit_id}</p>
                  <p className="text-meta text-kit-slate-11">{[u.unit.po_no, u.unit.item ?? u.unit.sku].filter(Boolean).join(" · ")}</p>
                  <Button variant="ghost" size="sm" onClick={() => setUnits((prev) => prev.filter((p) => p.unit.id !== u.unit.id))}>Remove</Button>
                </div>
                <div className="grid gap-3">
                  <div>
                    <h3 className="mb-2 text-label text-kit-slate-11">What did you see?</h3>
                    <div className="grid grid-cols-3 gap-2" role="group" aria-label="What did you see?">
                      {REPAIR_PROBLEM_CHOICES.map((c) => (
                        <Button key={c.value} variant={u.problem === c.value ? "primary" : "neutral"} aria-pressed={u.problem === c.value} onClick={() => patch(u.unit.id, { problem: c.value })}>
                          {c.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h3 className="mb-2 text-label text-kit-slate-11">Photo</h3>
                    {u.evidence.some((e) => e.source === "claim") ? (
                      <p className="mb-2 text-meta text-kit-slate-11">{`Photos ${u.evidence.filter((e) => e.source === "claim").length}`}</p>
                    ) : null}
                    <EvidenceUploadField<Upload>
                      entries={u.evidence.filter((e) => e.source === "unit").map((e) => ({ path: e.path, kind: e.kind }))}
                      onChange={(entries) =>
                        patch(u.unit.id, {
                          evidence: [
                            ...u.evidence.filter((e) => e.source === "claim"),
                            ...entries.map((e) => ({ path: e.path, kind: e.kind, source: "unit" as const })),
                          ],
                        })
                      }
                      sign={sign(u.unit.id)}
                      bucket="issue-evidence"
                      imageMimes={IMAGE_MIMES}
                      videoMimes={VIDEO_MIMES}
                      imageMaxBytes={10 * 1024 * 1024}
                      videoMaxBytes={20 * 1024 * 1024}
                      maxFiles={6}
                      ariaLabel={`Photo of ${u.unit.unit_id}`}
                      disabled={save.isPending}
                    />
                  </div>
                  <Textarea id={`ro-note-${u.unit.id}`} label="What happened, in one sentence" rows={2} maxLength={300} value={u.note} onChange={(e) => patch(u.unit.id, { note: e.target.value })} />
                  <Textarea id={`ro-req-${u.unit.id}`} label="Repair Requirement" rows={2} maxLength={500} value={u.requirement} onChange={(e) => patch(u.unit.id, { requirement: e.target.value })} />
                </div>
              </section>
            ))}
          </Block>

          {/* 2 · REPAIR */}
          <Block title="Repair order">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Select id="ro-supplier" label="Supplier" value={supplier} onValueChange={setSupplier} placeholder="Supplier"
                options={(options.data?.suppliers ?? []).map((s) => ({ value: s.id, label: s.name }))} />
              <Select id="ro-cost" label="Cost Responsibility" value={cost} onValueChange={(v) => setCost(v as RepairCostResponsibility)}
                options={REPAIR_COST_RESPONSIBILITIES.map((v) => ({ value: v, label: REPAIR_COST_RESPONSIBILITY_LABEL[v] }))} />
              {/* Optional. Empty is unknown — it prints `Not recorded`, never RM0. */}
              <Input id="ro-price" type="number" label="Price" hint="Optional" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
              <div>
                <h3 className="mb-2 text-label text-kit-slate-11">Repair Quotation</h3>
                <EvidenceUploadField<{ path: string; kind: string }>
                  entries={quotation}
                  onChange={setQuotation}
                  sign={(file) => apiFetch<{ token: string; path: string }>("/api/ops/issues/evidence/upload-url", {
                    method: "POST", body: JSON.stringify({ mimeType: file.type, scope: { kind: "repair_quotation", id: quoteScope } }),
                  })}
                  bucket="issue-evidence"
                  imageMimes={IMAGE_MIMES}
                  videoMimes={[]}
                  pdfMimes={PDF_MIMES}
                  imageMaxBytes={10 * 1024 * 1024}
                  videoMaxBytes={0}
                  pdfMaxBytes={20 * 1024 * 1024}
                  maxFiles={1}
                  ariaLabel="Repair Quotation"
                  disabled={save.isPending}
                />
              </div>
            </div>
          </Block>

          {/* 3 · LOCATIONS */}
          <Block title="Locations">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Fact idPrefix="ro-create" label="RO Doc Date" value={fmtDate(klDate(new Date().toISOString()))} own={false} framed automatic />
              <Fact idPrefix="ro-create" label="Supplier Pickup Location" value={siteName(site) ?? "Choose where the goods are now"} own={false} framed automatic />
              <Select id="ro-return" label="Supplier Return Location" value={returnSite} onValueChange={setReturnSite}
                options={(options.data?.sites ?? []).map((s) => ({ value: s.id, label: s.name }))} />
            </div>
          </Block>
        </div>
      </div>

      <AddUnitsDrawer open={drawer} onClose={() => setDrawer(false)} site={site} claimId={claimId} already={units.map((u) => u.unit.id)} onAdd={addUnits} />
    </div>
  );
}

/** Tick the Unit ID on each item to send for repair. A refused Unit cannot
 *  be ticked and prints why on its own row. */
export function AddUnitsDrawer({ open, onClose, site, claimId, already, onAdd }: {
  open: boolean; onClose: () => void; site: string | null; claimId: string | null; already: readonly string[];
  onAdd: (units: RepairOrderEligibleUnit[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const list = useRepairOrderEligibleUnits(open ? site : null, claimId, search);
  const rows = useMemo(() => (list.data?.units ?? []).filter((u) => !already.includes(u.id)), [list.data, already]);
  return (
    <Drawer
      open={open}
      onOpenChange={(v) => { if (!v) onClose(); }}
      title="Add Units"
      description="Tick the Unit ID on each item to send for repair"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="neutral" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={picked.length === 0} onClick={() => { onAdd(rows.filter((r) => picked.includes(r.id))); setPicked([]); }} data-testid="repair-order-add-picked">
            Add Units
          </Button>
        </div>
      }
    >
      <div className="grid gap-3" data-testid="repair-order-units-drawer">
        <SearchInput id="ro-find-unit" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find Unit" />
        {list.isLoading ? <p role="status" className="text-body text-kit-slate-11">Loading…</p> : null}
        {list.isError ? (
          <div role="alert" className="flex items-center gap-2 text-body">
            <span>Units could not be loaded</span>
            <Button variant="neutral" onClick={() => void list.refetch()}>Try again</Button>
          </div>
        ) : null}
        <ul className="flex flex-col divide-y divide-kit-slate-5">
          {rows.map((u) => (
            <li key={u.id} className="flex items-start gap-2 py-2" data-testid={`repair-order-eligible-${u.unit_id}`}>
              <Checkbox
                id={`ro-pick-${u.id}`}
                ariaLabel={u.unit_id}
                checked={picked.includes(u.id)}
                disabled={Boolean(u.refusal)}
                onCheckedChange={(v) => setPicked((p) => (v ? [...p, u.id] : p.filter((x) => x !== u.id)))}
              />
              <div className="min-w-0">
                <p className="text-body font-semibold text-kit-slate-12">{u.unit_id}</p>
                <p className="text-meta text-kit-slate-11">{[u.po_no, u.item ?? u.sku, u.display ? "Display" : null].filter(Boolean).join(" · ")}</p>
                {u.refusal ? <p className="text-meta text-kit-red-11" data-testid={`repair-order-refusal-${u.unit_id}`}>{u.refusal}</p> : null}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Drawer>
  );
}
