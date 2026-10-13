/**
 * The window of one money account, opened from Chart of accounts (0692: the
 * chart is the one place that marks a money account; Chew 2026-10-13,
 * 「对，做」). Adding: its name and kind (bank, or card and online holding);
 * the database picks the number under the money accounts heading unless
 * Finance types one (0577), and marks it SBK or HLD on the chart. Editing: its
 * name, Active (gl_accounts.money_in_use: out of use is refused while money is
 * in it or a payment method lands money in it, 0515, 0523) and its number.
 *
 * Words: every label is an existing COPY-STANDARD word (Money account, Name,
 * Kind, Active, Number, Save, Cancel, and the kind words).
 *
 * An opened account's number changes here too (YH, 24 Sep 2026), through the
 * chart's own door: the same request the Chart of accounts form sends
 * (useSaveAccount, gl_account_update). There is no second renumber.
 */
import { useState } from "react";
import { LEDGER_ACCOUNT_CODE_MESSAGE } from "@carres/shared/finance-ledger";
import { MONEY_ACCOUNT_KIND_WORD, type MoneyAccountRow } from "@carres/shared/money-accounts";
import { ledgerAccountCodeInput } from "@carres/shared/schemas/finance";
import Button from "@/components/kit/Button";
import Checkbox from "@/components/kit/Checkbox";
import Input from "@/components/kit/Input";
import Modal from "@/components/kit/Modal";
import Select from "@/components/kit/Select";
import { FieldError } from "@/components/kit/FieldFrame";
import { useSaveAccount, useSaveMoneyAccount } from "./api";

const KIND_OPTIONS = [
  { value: "BANK", label: MONEY_ACCOUNT_KIND_WORD.BANK },
  { value: "HOLDING", label: MONEY_ACCOUNT_KIND_WORD.HOLDING },
];

/** The tag a chart refusal carries (0550, forwarded by the API as `code`). */
const refusalTag = (e: unknown): unknown => {
  const body = (e as { body?: unknown } | null)?.body;
  return body && typeof body === "object" ? (body as { code?: unknown }).code : undefined;
};

/* The chart's refusals that are about the number, shown under the Number
   field. Every other one (a name, an account gone, a server break) goes to
   the foot, so the field is never blamed for what it did not cause. */
const NUMBER_REFUSALS = new Set(["code_shape", "code_exists", "not_finance"]);

export default function MoneyAccountModal({ account, onClose }: { account: MoneyAccountRow | null; onClose: () => void }) {
  const save = useSaveMoneyAccount();
  const renumber = useSaveAccount();
  const [name, setName] = useState(account?.name ?? "");
  const [kind, setKind] = useState<"BANK" | "HOLDING">("BANK");
  const [active, setActive] = useState(account?.is_active ?? true);
  /* Adding (0577): blank = the next free number under the heading. When every
     number is used the database asks for one, and this field is where it goes.
     Editing: the account's own number; a different one renumbers it, and a
     blank one keeps it. */
  const [code, setCode] = useState(account?.code ?? "");
  const [refusal, setRefusal] = useState<string | null>(null);
  /* A refusal about the number, shown under the Number field. */
  const [numberRefusal, setNumberRefusal] = useState<string | null>(null);
  const trimmed = name.trim();

  /* A blank name cannot be sent (Save stays disabled) and the input stops at
     60 characters, so the only refusals left are the database's own. */
  const submit = () => {
    setRefusal(null);
    setNumberRefusal(null);
    if (!account) {
      save.mutate(
        { code: null, input: code.trim() ? { name: trimmed, kind, code: code.trim().toUpperCase() } : { name: trimmed, kind } },
        { onSuccess: onClose, onError: (e) => setRefusal(e.message) },
      );
      return;
    }
    // A blank number keeps the account's own. Otherwise the chart form's
    // shape check and sentence, so a wrong number is refused under the field
    // before anything is sent. 310-a000 goes up as 310-A000.
    const shaped = code.trim() ? ledgerAccountCodeInput.safeParse(code) : { success: true as const, data: account.code };
    if (!shaped.success) {
      setNumberRefusal(LEDGER_ACCOUNT_CODE_MESSAGE);
      return;
    }
    const input = { name: trimmed, is_active: active };
    if (shaped.data === account.code) {
      save.mutate({ code: account.code, input }, { onSuccess: onClose, onError: (e) => setRefusal(e.message) });
      return;
    }
    void renumberAccount(account, input, shaped.data);
  };

  /* A new number. The name and the number go through the chart's door in one
     request: gl_account_update (0570) saves both in one transaction, checks the
     name against the whole chart (the money account's door checks it only
     against other money accounts), and every record follows the number
     (ON UPDATE CASCADE). A name or number it refuses is never saved.
     Only when Active changed too is the money account's door asked first, with
     the OLD name, so that a refusal there (money still in the account) comes
     before the number is touched. If the chart's door then refuses, Active
     stays saved and the sentence says why the name or number did not change. */
  const renumberAccount = async (a: MoneyAccountRow, input: { name: string; is_active: boolean }, newCode: string) => {
    if (input.is_active !== a.is_active) {
      try {
        await save.mutateAsync({ code: a.code, input: { name: a.name, is_active: input.is_active } });
      } catch (e) {
        setRefusal((e as Error).message);
        return;
      }
    }
    try {
      await renumber.mutateAsync({ code: a.code, name: input.name, newCode });
    } catch (e) {
      const tag = refusalTag(e);
      if (typeof tag === "string" && NUMBER_REFUSALS.has(tag)) setNumberRefusal((e as Error).message);
      else setRefusal((e as Error).message);
      return;
    }
    onClose();
  };

  return (
    <Modal
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={account ? "Money account" : "Add a money account"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={save.isPending || renumber.isPending}
            disabled={!trimmed}
            onClick={submit}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3" data-testid="money-account-form">
        <Input id="money-account-name" label="Name" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        {account ? (
          <Checkbox id="money-account-active" label="Active" checked={active} onCheckedChange={setActive} />
        ) : (
          <Select
            id="money-account-kind"
            label="Kind"
            value={kind}
            onValueChange={(v) => setKind(v as "BANK" | "HOLDING")}
            options={KIND_OPTIONS}
          />
        )}
        {/* PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md): the hint is
            0577's, adding only; the field on an opened account is 24 Sep's. */}
        <Input
          id="money-account-code"
          label="Number"
          hint={account ? undefined : "Leave blank to use the next free number."}
          error={numberRefusal ?? undefined}
          maxLength={8}
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        {refusal && (
          <FieldError>
            {refusal}
          </FieldError>
        )}
      </div>
    </Modal>
  );
}

