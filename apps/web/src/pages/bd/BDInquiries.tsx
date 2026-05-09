import { useState } from "react";
import { toast } from "sonner";
import {
  useBdInquiries,
  useCreateInquiry,
  useUpdateInquiry,
  useConvertInquiry,
  type InquiryKind,
  type InquiryRow,
  type InquiryStage,
} from "@/lib/queries";

/**
 * BDInquiries — Phase 8 Sprint 2 (acceptance §8 #2 + #3).
 *
 * Inquiry list + add form + per-row stage transition + Convert button.
 * "Convert" calls bd_convert_inquiry RPC (migration 0072) which atomically
 * moves stage to 'converted' AND inserts an approvals row of kind=
 * 'new_dealer' for principal review.
 */
const NEXT_STAGE: Partial<Record<InquiryStage, InquiryStage>> = {
  new:       "contacted",
  contacted: "qualified",
  // qualified → use Convert button instead
  // converted / lost: terminal
};

const STAGE_TONE: Record<InquiryStage, string> = {
  new:       "bg-blue-500/10 text-blue-700",
  contacted: "bg-amber-500/15 text-amber-700",
  qualified: "bg-primary/15 text-primary",
  converted: "bg-success/15 text-success",
  lost:      "bg-base-300 text-base-700",
};

export default function BDInquiries() {
  const inquiries = useBdInquiries();
  const create = useCreateInquiry({
    onSuccess: () => {
      toast.success("Inquiry added");
      setCompany("");
      setRegion("");
      setContact("");
      setNote("");
    },
    onError: (e) => toast.error(e.message),
  });
  const update = useUpdateInquiry({
    onError: (e) => toast.error(e.message),
  });
  const convert = useConvertInquiry({
    onSuccess: () =>
      toast.success("Converted · new_dealer approval queued for principal"),
    onError: (e) => toast.error(e.message),
  });

  const [kind, setKind] = useState<InquiryKind>("new_dealer");
  const [company, setCompany] = useState("");
  const [region, setRegion] = useState("");
  const [contact, setContact] = useState("");
  const [note, setNote] = useState("");

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!company.trim()) {
      toast.error("Company name required");
      return;
    }
    create.mutate({
      kind,
      company: company.trim(),
      region: region.trim() || null,
      contact: contact.trim() || null,
      note: note.trim() || null,
    });
  }

  const rows = inquiries.data ?? [];

  return (
    <div className="px-9 py-8 space-y-6">
      <header>
        <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">BD · Network</div>
        <h1 className="font-display text-[30px] mt-1.5 mb-1 text-foreground tracking-[-0.02em]">
          Inquiries
        </h1>
        <div className="text-[13px] text-muted-foreground">
          Track new dealer inquiries · convert qualified → new_dealer approval
        </div>
      </header>

      <section data-testid="bd-inquiry-add">
        <h2 className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground mb-2">
          New inquiry
        </h2>
        <form
          onSubmit={handleAdd}
          className="bg-card border border-border rounded-md p-4 grid grid-cols-6 gap-3 items-end"
        >
          <label className="text-[11px] font-medium col-span-1">
            Kind
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as InquiryKind)}
              className="block mt-1 w-full px-2.5 py-1.5 border border-border rounded text-[12.5px] bg-background"
              aria-label="Kind"
            >
              <option value="new_dealer">New dealer</option>
              <option value="expansion">Expansion</option>
              <option value="product">Product</option>
            </select>
          </label>
          <label className="text-[11px] font-medium col-span-1">
            Company
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="ACME Bedding Sdn Bhd"
              className="block mt-1 w-full px-2.5 py-1.5 border border-border rounded text-[12.5px] bg-background"
              aria-label="Company"
            />
          </label>
          <label className="text-[11px] font-medium col-span-1">
            Region
            <input
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="Klang Valley"
              className="block mt-1 w-full px-2.5 py-1.5 border border-border rounded text-[12.5px] bg-background"
              aria-label="Region"
            />
          </label>
          <label className="text-[11px] font-medium col-span-1">
            Contact
            <input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="Mr Tan · 012-345 6789"
              className="block mt-1 w-full px-2.5 py-1.5 border border-border rounded text-[12.5px] bg-background"
              aria-label="Contact"
            />
          </label>
          <label className="text-[11px] font-medium col-span-2">
            Note
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="(optional)"
              className="block mt-1 w-full px-2.5 py-1.5 border border-border rounded text-[12.5px] bg-background"
              aria-label="Note"
            />
          </label>
          <div className="col-span-6 flex justify-end">
            <button
              type="submit"
              disabled={create.isPending}
              className="px-3 py-1.5 bg-primary text-primary-foreground rounded text-[12.5px] font-medium disabled:opacity-50"
            >
              Add inquiry
            </button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground mb-2">
          Pipeline
        </h2>
        <div
          className="bg-card border border-border rounded-md overflow-hidden"
          data-testid="bd-inquiry-list"
        >
          {inquiries.isLoading ? (
            <div className="p-4 text-[12px] text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="p-4 text-[12px] text-muted-foreground">
              No inquiries yet. Add one above.
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left p-3 text-[10px] uppercase tracking-[0.12em] font-bold text-muted-foreground">Kind</th>
                  <th className="text-left p-3 text-[10px] uppercase tracking-[0.12em] font-bold text-muted-foreground">Company</th>
                  <th className="text-left p-3 text-[10px] uppercase tracking-[0.12em] font-bold text-muted-foreground">Region</th>
                  <th className="text-left p-3 text-[10px] uppercase tracking-[0.12em] font-bold text-muted-foreground">Contact</th>
                  <th className="text-left p-3 text-[10px] uppercase tracking-[0.12em] font-bold text-muted-foreground">Stage</th>
                  <th className="text-right p-3 text-[10px] uppercase tracking-[0.12em] font-bold text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Row
                    key={r.id}
                    row={r}
                    onAdvance={() => {
                      const next = NEXT_STAGE[r.stage];
                      if (next) update.mutate({ id: r.id, patch: { stage: next } });
                    }}
                    onConvert={() => convert.mutate(r.id)}
                    onLose={() => update.mutate({ id: r.id, patch: { stage: "lost" } })}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

function Row({
  row,
  onAdvance,
  onConvert,
  onLose,
}: {
  row: InquiryRow;
  onAdvance: () => void;
  onConvert: () => void;
  onLose: () => void;
}) {
  return (
    <tr
      className="border-b border-border last:border-0"
      data-testid={`inquiry-row-${row.id}`}
    >
      <td className="p-3 text-[12px] text-muted-foreground">{row.kind}</td>
      <td className="p-3 text-[13px] font-medium">{row.company}</td>
      <td className="p-3 text-[12px]">{row.region ?? "—"}</td>
      <td className="p-3 text-[12px]">{row.contact ?? "—"}</td>
      <td className="p-3">
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10.5px] font-bold uppercase tracking-[0.12em] ${STAGE_TONE[row.stage]}`}>
          {row.stage}
        </span>
      </td>
      <td className="p-3 text-right">
        <div className="flex justify-end gap-2">
          {NEXT_STAGE[row.stage] && (
            <button
              type="button"
              onClick={onAdvance}
              className="px-2.5 py-1 text-[11px] border border-border rounded hover:bg-accent/30"
            >
              → {NEXT_STAGE[row.stage]}
            </button>
          )}
          {row.stage === "qualified" && (
            <button
              type="button"
              onClick={onConvert}
              className="px-2.5 py-1 text-[11px] bg-primary text-primary-foreground rounded font-medium"
              data-testid={`convert-${row.id}`}
            >
              Convert
            </button>
          )}
          {(row.stage === "new" || row.stage === "contacted" || row.stage === "qualified") && (
            <button
              type="button"
              onClick={onLose}
              className="px-2.5 py-1 text-[11px] border border-border rounded text-muted-foreground hover:bg-destructive/10"
            >
              Lost
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
