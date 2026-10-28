import type { PurchaseRequestContext } from "@carres/shared";
import { BUILDING_TYPE_OPTIONS } from "@carres/shared";
import Block from "@/components/kit/Block";
import Button from "@/components/kit/Button";
import Input from "@/components/kit/Input";
import Select from "@/components/kit/Select";
import DatePicker from "@/components/kit/DatePicker";

type Recipient = PurchaseRequestContext["recipients"][number];
export function blankPurchaseRecipient(): Recipient {
  return { id: crypto.randomUUID(), company: "", name: "", phone: "", method: "delivery", deliveryDate: "", addressLine1: "", addressLine2: "", city: "", state: "", postcode: "", buildingType: "", floor: "", lift: null, pickupLocationId: null, collectedBy: "" };
}

/** Module facts composed from the existing kit fields; no Stock/Delivery writer. */
export default function PurchaseRequestRecipients({ value, onChange, pickupLocations, earliestDate, disabled = false }: {
  value: Recipient[];
  onChange: (recipients: Recipient[]) => void;
  pickupLocations: ReadonlyArray<{ id: string; name: string }>;
  /** Read from the authoritative plan. Missing setup stays missing. */
  earliestDate: string | null;
  disabled?: boolean;
}) {
  const patch = (id: string, change: Partial<Recipient>) => onChange(value.map((recipient) => recipient.id === id ? { ...recipient, ...change } : recipient));
  return <Block title="Goods recipient" headerSlot={<Button disabled={disabled} onClick={() => onChange([...value, blankPurchaseRecipient()])}>+ Add recipient</Button>}>
    <div className="flex flex-col gap-3">
      {value.map((recipient) => {
        const prefix = `purchase-recipient-${recipient.id}`;
        const field = (key: "company" | "name" | "phone" | "addressLine1" | "addressLine2" | "city" | "state" | "postcode" | "floor" | "collectedBy", label: string, required = true) => <Input id={`${prefix}-${key}`} label={label} required={required} disabled={disabled} value={recipient[key]} onChange={(event) => patch(recipient.id, { [key]: event.target.value })} />;
        return <section key={recipient.id} aria-label={recipient.name || "Goods recipient"} className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {field("company", "Company / organisation", false)}
            {field("name", "Recipient name")}
            {field("phone", "Phone")}
            <Select id={`${prefix}-method`} label="Delivery" disabled={disabled} value={recipient.method} onValueChange={(method) => patch(recipient.id, { method: method as Recipient["method"] })} options={[{ value: "delivery", label: "Delivery" }, { value: "self_pickup", label: "Self pickup" }]} />
            <DatePicker id={`${prefix}-date`} label="Customer Original Delivery Date" required disabled={disabled || earliestDate == null} minDate={earliestDate ?? undefined} error={earliestDate && recipient.deliveryDate && recipient.deliveryDate < earliestDate ? `Choose ${earliestDate} or later` : undefined} value={recipient.deliveryDate || null} onChange={(deliveryDate) => patch(recipient.id, { deliveryDate: deliveryDate ?? "" })} />
          </div>
          {recipient.method === "delivery" ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {field("addressLine1", "Address line 1")}{field("addressLine2", "Address line 2")}
            {field("city", "City")}{field("state", "State")}{field("postcode", "Postcode")}
            <Select id={`${prefix}-building`} label="Building type" required disabled={disabled} value={recipient.buildingType || undefined} onValueChange={(buildingType) => patch(recipient.id, { buildingType })} options={BUILDING_TYPE_OPTIONS.map((option) => ({ value: option, label: option }))} />
            <Input id={`${prefix}-floor`} label="Floor" hint="Ground floor = G" required disabled={disabled} value={recipient.floor} onChange={(event) => patch(recipient.id, { floor: event.target.value })} />
            <Select id={`${prefix}-lift`} label="Lift" required disabled={disabled} value={recipient.lift ?? undefined} onValueChange={(lift) => patch(recipient.id, { lift: lift as Recipient["lift"] })} options={[{ value: "has_lift", label: "Has lift" }, { value: "no_lift", label: "No lift" }]} />
          </div> : <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Select id={`${prefix}-pickup`} label="Pickup location" required disabled={disabled} value={recipient.pickupLocationId ?? undefined} onValueChange={(pickupLocationId) => patch(recipient.id, { pickupLocationId })} options={pickupLocations.map((site) => ({ value: site.id, label: site.name }))} />
            {field("collectedBy", "Collected by")}
          </div>}
          <div><Button variant="ghost" disabled={disabled} onClick={() => onChange(value.filter((person) => person.id !== recipient.id))}>Remove</Button></div>
        </section>;
      })}
    </div>
  </Block>;
}
