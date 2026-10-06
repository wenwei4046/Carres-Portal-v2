/**
 * Edit a supplier's finance details — Finance's own tax and bank record beside
 * Purchasing's supplier (migration 0636; Chew 2026-10-03, Finance MASTER §3.2).
 * The supplier's name and kind are Purchasing's and are only shown here.
 */
import { useState } from "react";
import { toast } from "sonner";
import { supplierFinanceInput, type SupplierFinanceRow } from "@carres/shared/schemas/finance-ap";
import Button from "@/components/kit/Button";
import { FieldError } from "@/components/kit/FieldFrame";
import Input from "@/components/kit/Input";
import Modal from "@/components/kit/Modal";
import { useSaveSupplierFinance } from "@/lib/payables-queries";
import { creditorKindWord } from "./payables-words";

type Field = "taxNo" | "registrationNo" | "bankName" | "bankAccountNo" | "bankAccountHolder";

export default function SupplierFinanceModal({
  supplier,
  onClose,
}: {
  supplier: SupplierFinanceRow;
  onClose: () => void;
}) {
  const save = useSaveSupplierFinance();
  const [taxNo, setTaxNo] = useState(supplier.tax_no ?? "");
  const [registrationNo, setRegistrationNo] = useState(supplier.registration_no ?? "");
  const [bankName, setBankName] = useState(supplier.bank_name ?? "");
  const [bankAccountNo, setBankAccountNo] = useState(supplier.bank_account_no ?? "");
  const [bankAccountHolder, setBankAccountHolder] = useState(supplier.bank_account_holder ?? "");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [refusal, setRefusal] = useState<string | null>(null);

  const submit = () => {
    setRefusal(null);
    const input = { taxNo, registrationNo, bankName, bankAccountNo, bankAccountHolder };
    const parsed = supplierFinanceInput.safeParse(input);
    if (!parsed.success) {
      const next: Partial<Record<Field, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as Field | undefined;
        if (field && !next[field]) next[field] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    save.mutate(
      { supplierId: supplier.supplier_id, input },
      {
        onSuccess: () => {
          toast.success("Details saved.");
          onClose();
        },
        onError: (e) => setRefusal(e.message),
      },
    );
  };

  return (
    <Modal
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title="Edit details"
      description={`${supplier.name} · ${creditorKindWord(supplier.kind)}. Finance's own details; the supplier stays Purchasing's.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Back
          </Button>
          <Button variant="primary" loading={save.isPending} onClick={submit}>
            Save details
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3" data-testid="supplier-finance-form">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Input
            id="supplier-finance-tax"
            label="Tax No"
            maxLength={40}
            value={taxNo}
            error={errors.taxNo}
            onChange={(e) => setTaxNo(e.target.value)}
          />
          <Input
            id="supplier-finance-registration"
            label="Registration No"
            maxLength={60}
            value={registrationNo}
            error={errors.registrationNo}
            onChange={(e) => setRegistrationNo(e.target.value)}
          />
        </div>
        <Input
          id="supplier-finance-bank"
          label="Bank"
          maxLength={100}
          value={bankName}
          error={errors.bankName}
          onChange={(e) => setBankName(e.target.value)}
        />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Input
            id="supplier-finance-account"
            label="Account No"
            inputMode="numeric"
            maxLength={40}
            value={bankAccountNo}
            error={errors.bankAccountNo}
            onChange={(e) => setBankAccountNo(e.target.value)}
          />
          <Input
            id="supplier-finance-holder"
            label="Account holder"
            maxLength={200}
            value={bankAccountHolder}
            error={errors.bankAccountHolder}
            onChange={(e) => setBankAccountHolder(e.target.value)}
          />
        </div>
        {refusal && <FieldError>{refusal}</FieldError>}
      </div>
    </Modal>
  );
}
