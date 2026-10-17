import type { PurchaseRequestContext } from "@carres/shared";
import Block from "@/components/kit/Block";
import Button from "@/components/kit/Button";
import Input from "@/components/kit/Input";
import Select from "@/components/kit/Select";
import DatePicker from "@/components/kit/DatePicker";
import { recipientBalance, requestLineBalance, setRecipientQuantity, type RequestLine, type RecipientQuantity } from "./purchase-request-draft";

/** Composed into the existing request workspace when its contextual writer is available.
 * This editor emits proposals only; availability must be rechecked by the owning writer. */
export default function PurchaseRequestAllocations({ line, recipients, destinations, stockOffers, stockRequest, earliestSupplierDate, disabled = false, onChange }: {
  line: RequestLine;
  recipients: PurchaseRequestContext["recipients"];
  destinations: ReadonlyArray<{ id: string; name: string }>;
  stockOffers: ReadonlyArray<{ locationId: string; destinationId: string; name: string; available: number }>;
  stockRequest: boolean;
  earliestSupplierDate: string | null;
  disabled?: boolean;
  onChange: (line: RequestLine) => void;
}) {
  const balance = requestLineBalance(line);
  const qty = (id: string, label: string, value: number, onChange: (value: number) => void, max?: number) => <Input id={id} label={label} type="number" min={0} max={max} step={1} disabled={disabled} error={max != null && value > max ? `Choose ${max} or fewer` : undefined} value={value} onChange={(event) => {
    const next = Number(event.target.value);
    if (Number.isInteger(next) && next >= 0) onChange(next);
  }} />;
  const recipientFields = (key: string, values: RecipientQuantity[], onChange: (values: RecipientQuantity[]) => void) => !stockRequest && <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">{recipients.map((recipient, index) => qty(`${line.id}-${key}-${recipient.id}`, recipient.name || `Recipient ${index + 1}`, values.find((value) => value.recipientId === recipient.id)?.qty ?? 0, (next) => onChange(setRecipientQuantity(values, recipient.id, next)), line.qty))}</div>;
  const patchAllocation = (id: string, change: Partial<RequestLine["allocations"][number]>) => onChange({ ...line, allocations: line.allocations.map((allocation) => allocation.id === id ? { ...allocation, ...change } : allocation) });
  const patchStock = (id: string, change: Partial<RequestLine["stockProposals"][number]>) => onChange({ ...line, stockProposals: line.stockProposals.map((proposal) => proposal.id === id ? { ...proposal, ...change } : proposal) });
  return <Block title={line.sku} note={`Requested ${line.qty} · From stock ${balance.stock} · Allocated ${balance.buy} / To buy ${line.qty - balance.stock} · Unallocated ${balance.left}`}>
    <div className="flex flex-col gap-3">
      {!stockRequest && <>
        <div>Goods recipient</div>
        {recipientFields("need", line.recipientNeeds, (recipientNeeds) => onChange({ ...line, recipientNeeds }))}
        {recipients.map((recipient, index) => <div key={recipient.id}>{recipient.name || `Recipient ${index + 1}`} · Unallocated {recipientBalance(line, recipient.id)}</div>)}
        <div>From stock</div>
        {stockOffers.map((offer) => {
          const proposal = line.stockProposals.find((value) => value.locationId === offer.locationId && value.destinationId === offer.destinationId);
          return <section key={`${offer.locationId}-${offer.destinationId}`} aria-label={`Stock at ${offer.name}`} className="flex flex-col gap-3">
            {qty(`${line.id}-stock-${offer.locationId}-${offer.destinationId}`, `${offer.name} · ${offer.available} available`, proposal?.qty ?? 0, (next) => {
              if (proposal) onChange({ ...line, stockProposals: next === 0 ? line.stockProposals.filter((value) => value.id !== proposal.id) : line.stockProposals.map((value) => value.id === proposal.id ? { ...value, qty: next } : value) });
              else if (next > 0) onChange({ ...line, stockProposals: [...line.stockProposals, { id: crypto.randomUUID(), locationId: offer.locationId, destinationId: offer.destinationId, qty: next, recipients: [] }] });
            }, offer.available)}
            {proposal && recipientFields(`stock-${proposal.id}`, proposal.recipients, (recipients) => patchStock(proposal.id, { recipients }))}
          </section>;
        })}
        {line.stockProposals.filter((proposal) => !stockOffers.some((offer) => offer.locationId === proposal.locationId && offer.destinationId === proposal.destinationId)).map((proposal) => <section key={proposal.id} aria-label="Stock no longer available" className="flex flex-col gap-3">
          <div>Stock no longer available · {proposal.qty} pcs. Remove this allocation and choose available stock or buy the remaining quantity.</div>
          <div><Button variant="ghost" disabled={disabled} onClick={() => onChange({ ...line, stockProposals: line.stockProposals.filter((value) => value.id !== proposal.id) })}>Remove</Button></div>
        </section>)}
      </>}
      <div>To buy</div>
      {line.allocations.map((allocation, index) => <section key={allocation.id} aria-label={`Supplier delivery ${index + 1}`} className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Select id={`${allocation.id}-destination`} label="Supplier Deliver To" required disabled={disabled} value={allocation.destinationId || undefined} onValueChange={(destinationId) => patchAllocation(allocation.id, { destinationId })} options={destinations.map((site) => ({ value: site.id, label: site.name }))} />
          <DatePicker id={`${allocation.id}-date`} label="Supplier Delivery Date" required disabled={disabled || earliestSupplierDate == null} minDate={earliestSupplierDate ?? undefined} error={earliestSupplierDate && allocation.supplierDeliveryDate && allocation.supplierDeliveryDate < earliestSupplierDate ? `Choose ${earliestSupplierDate} or later` : undefined} value={allocation.supplierDeliveryDate || null} onChange={(date) => patchAllocation(allocation.id, { supplierDeliveryDate: date ?? "" })} />
          {qty(`${allocation.id}-qty`, index > 0 ? "Qty to send elsewhere" : "Qty", allocation.qty, (qty) => patchAllocation(allocation.id, { qty }), line.qty)}
        </div>
        {recipientFields(allocation.id, allocation.recipients, (recipients) => patchAllocation(allocation.id, { recipients }))}
        <div><Button variant="ghost" disabled={disabled} onClick={() => onChange({ ...line, allocations: line.allocations.filter((value) => value.id !== allocation.id) })}>Remove</Button></div>
      </section>)}
      <div><Button disabled={disabled} onClick={() => onChange({ ...line, allocations: [...line.allocations, { id: crypto.randomUUID(), destinationId: "", supplierDeliveryDate: "", qty: Math.max(0, balance.left), recipients: [] }] })}>Split delivery</Button></div>
    </div>
  </Block>;
}
