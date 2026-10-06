import { useState, type RefObject } from "react";
import Button from "@/components/kit/Button";
import Loading from "@/components/kit/Loading";
import { currentDutyPerson } from "./staff-duties-model";
import DatePicker from "@/components/kit/DatePicker";
import Input from "@/components/kit/Input";
import Select from "@/components/kit/Select";
import DutyActionDialog from "./DutyActionDialog";
import { dutyRefusalSentence } from "./staff-duties-model";
import { fmtDate } from "@/lib/fmt-date";
import { useWorkspaceAssignDutyMutation, useWorkspaceCoverDutyMutation } from "@/lib/queries";
import type { WorkspaceDutiesResponse } from "@/lib/queries";
import type { OpsStaffMember } from "@carres/shared";

/**
 * `Assign holder` (workspace/MASTER.md §4.3).
 *
 * One appended assignment — never an edit, never a delete. The form guides
 * early with the exact §4.4.1 sentences, then the SQL door rechecks every
 * fact: eligibility, overlap and the correction law are the server's. A
 * refusal arrives as a CODE and is printed as the governed §4.4.1 sentence —
 * never the database's own text.
 *
 * The holder list is whatever `/api/operation/staff?duty=` returned for THIS
 * duty. No name is written here: a duty the catalogue scopes to a role gets
 * that role's accounts, and the write door refuses anyone it should.
 *
 * `Effective from` starts EMPTY on purpose. Defaulting a recorded business
 * date to today is a decision nobody made, and it would make
 * `Choose when this assignment starts.` unreachable.
 */

type Duty = WorkspaceDutiesResponse["duties"][number];

export default function AssignHolderForm({
  duty,
  staff,
  open,
  onClose,
  onDone,
  staffLoading = false,
  staffError = false,
  retryStaff,
  returnFocusRef,
}: {
  duty: Duty;
  staff: OpsStaffMember[];
  returnFocusRef?: RefObject<HTMLElement>;
  staffLoading?: boolean;
  staffError?: boolean;
  retryStaff?: () => void;
  open: boolean;
  onClose: () => void;
  /** The governed success sentence, handed up to be announced. */
  onDone: (sentence: string) => void;
}) {
  const [holderId, setHolderId] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState<string | null>(null);
  const [effectiveUntil, setEffectiveUntil] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [refusal, setRefusal] = useState<string | null>(null);
  const assign = useWorkspaceAssignDutyMutation();
  const dated = useWorkspaceCoverDutyMutation();
  const bounded = duty.key === "po_duty" || duty.key === "grn_duty";

  const current = currentDutyPerson(duty);

  function submit() {
    if (assign.isPending || dated.isPending || staffLoading || staffError) return;
    setRefusal(null);
    if (!holderId) return setRefusal("Choose a person.");
    if (!effectiveFrom) return setRefusal("Choose when this assignment starts.");
    if (effectiveUntil && effectiveUntil < effectiveFrom) {
      return setRefusal("Until must be on or after From.");
    }
    if (bounded && !effectiveUntil) return setRefusal("Choose valid assignment dates.");
    if (bounded && !note.trim()) return setRefusal("Write the reason.");
    const done = () => {
      const name = staff.find(person => person.user_id === holderId)?.name ?? "Name not recorded";
      onDone(effectiveUntil ? `${duty.label} assigned to ${name}, ${fmtDate(effectiveFrom)} to ${fmtDate(effectiveUntil)}`
        : `${duty.label} assigned to ${name} from ${fmtDate(effectiveFrom)}`);
      onClose();
    };
    if (effectiveUntil && duty.resolution.normal_user_id && holderId !== duty.resolution.normal_user_id) {
      dated.mutate({ dutyKey: duty.key, actingUserId: holderId, startsOn: effectiveFrom, endsOn: effectiveUntil,
        ...(note.trim() ? { reason: note.trim() } : {}) }, { onSuccess: done });
    } else {
      assign.mutate({ dutyKey: duty.key, holderId, effectiveFrom,
        ...(effectiveUntil ? { effectiveUntil } : {}), ...(note.trim() ? { note: note.trim() } : {}) }, { onSuccess: done });
    }

  }

  return (
    <DutyActionDialog
      open={open}
      returnFocusRef={returnFocusRef}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Assign"
      dutyLabel={duty.label}
      submitLabel="Assign"
      submitTestId="assign-submit"
      pending={assign.isPending || dated.isPending || staffLoading || staffError}
      /* The browser's guiding sentence, else the server's own refusal. */
      error={
        refusal ??
        ((assign.error ?? dated.error)
          ? dutyRefusalSentence(dated.error ? "cover" : "assign", assign.error ?? dated.error, {
              duty: duty.label,
              name: staff.find((s) => s.user_id === holderId)?.name ?? "This person",
            })
          : null)
      }
      onSubmit={submit}
    >
      <p className="text-body">{current ? `Assigned to ${current.name}` : "Not assigned"}</p>
      {staffLoading ? <Loading variant="skeleton" lines={2} label="Loading" /> : staffError ? <div role="alert">
        <p className="text-body">Staff &amp; Duties could not be opened</p>
        <Button onClick={retryStaff}>Try again</Button>
      </div> : <>
      <Select
        id="assign-holder"
        label="Assigned to"
        required
        value={holderId}
        onValueChange={setHolderId}
        placeholder="Choose a person."
        options={staff.map((s) => ({
          value: s.user_id,
          label: s.name ?? s.email,
        }))}
      />
      <DatePicker
        id="assign-effective-from"
        label="From"
        required
        value={effectiveFrom}
        onChange={setEffectiveFrom}
      />
      <DatePicker
        id="assign-effective-until"
        label="Until"
        required={bounded}
        value={effectiveUntil}
        onChange={setEffectiveUntil}
      />
      <Input
        id="assign-note"
        label="Reason"
        required={bounded}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      </>}
    </DutyActionDialog>
  );
}
