/**
 * Add or edit a party — someone who owes Carres money or lends it, and is not
 * a customer or a supplier: a sister company, a lender, a director.
 */
import { useState } from "react";
import { financePartyInput, type FinancePartyKind, type OtherDebtorPartyRow } from "@carres/shared/other-money-in";
import Button from "@/components/kit/Button";
import Checkbox from "@/components/kit/Checkbox";
import Input from "@/components/kit/Input";
import Modal from "@/components/kit/Modal";
import Select from "@/components/kit/Select";
import Textarea from "@/components/kit/Textarea";
import { toast } from "sonner";
import { useSaveParty } from "./api";

const KIND_OPTIONS = [
  { value: "company", label: "Company" },
  { value: "person", label: "Person" },
];

export default function PartyModal({
  open,
  party,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** null = a new party. */
  party: OtherDebtorPartyRow | null;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const save = useSaveParty();
  const [name, setName] = useState(party?.name ?? "");
  const [kind, setKind] = useState<FinancePartyKind>(party?.kind ?? "company");
  const [registrationNo, setRegistrationNo] = useState(party?.registration_no ?? "");
  const [phone, setPhone] = useState(party?.phone ?? "");
  const [email, setEmail] = useState(party?.email ?? "");
  const [address, setAddress] = useState(party?.address ?? "");
  const [notes, setNotes] = useState(party?.notes ?? "");
  const [active, setActive] = useState(party?.is_active ?? true);
  const [nameError, setNameError] = useState<string | undefined>();
  const [refusal, setRefusal] = useState<string | null>(null);

  const submit = () => {
    setRefusal(null);
    const orNull = (s: string) => (s.trim() ? s.trim() : null);
    const input = {
      name,
      kind,
      registration_no: orNull(registrationNo),
      phone: orNull(phone),
      email: orNull(email),
      address: orNull(address),
      notes: orNull(notes),
    };
    const parsed = financePartyInput.safeParse(input);
    if (!parsed.success) {
      setNameError(parsed.error.issues.find((i) => i.path[0] === "name")?.message);
      setRefusal(parsed.error.issues.find((i) => i.path[0] !== "name")?.message ?? null);
      return;
    }
    setNameError(undefined);
    save.mutate(
      party ? { id: party.party_id, input: { ...parsed.data, is_active: active } } : { id: null, input: parsed.data },
      {
        onSuccess: (res) => {
          toast.success(party ? "Party saved." : "Party added.");
          onSaved?.(res.id);
          onClose();
        },
        onError: (e) => setRefusal(e.message),
      },
    );
  };

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={party ? "Edit party" : "New party"}
      description="Someone who owes Carres money, or lends it, and is not a customer or a supplier."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Back
          </Button>
          <Button variant="primary" loading={save.isPending} onClick={submit}>
            Save party
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3" data-testid="party-form">
        <Input
          id="party-name"
          label="Name"
          required
          maxLength={200}
          value={name}
          error={nameError}
          onChange={(e) => setName(e.target.value)}
        />
        <Select
          id="party-kind"
          label="Company or person"
          value={kind}
          onValueChange={(v) => setKind(v as FinancePartyKind)}
          options={KIND_OPTIONS}
        />
        <Input
          id="party-registration"
          label="SSM or IC number"
          maxLength={60}
          value={registrationNo}
          onChange={(e) => setRegistrationNo(e.target.value)}
        />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Input id="party-phone" label="Phone" type="tel" maxLength={40} value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Input id="party-email" label="Email" type="email" maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <Textarea id="party-address" label="Address" rows={2} maxLength={500} value={address} onChange={(e) => setAddress(e.target.value)} />
        <Textarea id="party-notes" label="Notes" rows={2} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        {party && (
          <Checkbox
            id="party-active"
            label="Active — can be chosen on a new invoice or receipt"
            checked={active}
            onCheckedChange={setActive}
          />
        )}
        {refusal && (
          <p role="alert" className="text-body text-kit-red-11">
            {refusal}
          </p>
        )}
      </div>
    </Modal>
  );
}
