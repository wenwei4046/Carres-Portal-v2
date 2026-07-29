import { useState } from "react";
import { toast } from "sonner";
import {
  carresLocationName,
  minDeliveryDateISO,
  staffPinSchema,
  type CreateAccountInput,
  type StaffColorKey,
  type StaffGenderDto,
  type StaffTierDto,
} from "@carres/shared";
import { ApiError } from "@/lib/api";
import CarresNameInput from "@/components/CarresNameInput";
import { useBdCreateAccount } from "@/lib/queries";
import BirthdayWheelField from "@/pages/dealer/pos/date-keyin/BirthdayWheelField";
import { ColorDotPicker, ModalShell, tierLabel } from "@/pages/dealer/staff/staff-ui";

/**
 * BdCreateDealerModal (2026-07-19) — BD opens a NEW dealer account from the
 * POS: the dealership org (company / SSM / PIC / address → default outlet),
 * the dealership-principal LOGIN (email + manual password, PR 219 rules) and
 * the first staff identity + PIN — the same data the HQ create door collects
 * (shared `createAccountInput` zod, one schema two consumers). Server side is
 * /api/bd/accounts → the principal door's handler pinned to role=dealer.
 */

const inputCls =
  "w-full px-3 py-2.5 border border-base-200 rounded text-body bg-white outline-none focus:border-base-700";
const pinCls =
  "w-full px-3 py-2.5 border border-base-200 rounded text-strong tracking-[0.4em] font-mono bg-white outline-none focus:border-base-700";
const btnGhost =
  "px-4 py-[9px] text-body font-semibold text-base-600 rounded hover:bg-base-100 cursor-pointer disabled:opacity-50";
const btnSolid =
  "px-[18px] py-[9px] bg-base-900 text-white text-body font-semibold rounded hover:bg-base-800 cursor-pointer disabled:opacity-50";

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-label font-semibold uppercase tracking-[0.08em] text-base-700">
      {children}
    </span>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-label font-semibold uppercase tracking-[0.1em] text-base-500 border-b border-base-100 pb-1.5 mt-1">
      {children}
    </div>
  );
}

const DEALER_TIERS: StaffTierDto[] = ["principal", "manager", "salesperson"];

export default function BdCreateDealerModal({ onClose }: { onClose: () => void }) {
  // Dealership
  const [companyName, setCompanyName] = useState("");
  const [ssmCode, setSsmCode] = useState("");
  const [region, setRegion] = useState("");
  const [address, setAddress] = useState("");
  const [outletName, setOutletName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  // Login
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  // First staff + PIN
  const [stName, setStName] = useState("");
  const [stRole, setStRole] = useState<StaffTierDto>("principal");
  const [stEmail, setStEmail] = useState("");
  const [stBirthday, setStBirthday] = useState("");
  const [stGender, setStGender] = useState<StaffGenderDto | "">("");
  const [stPhone, setStPhone] = useState("");
  const [stColor, setStColor] = useState<StaffColorKey>("flame");
  const [stPin, setStPin] = useState("");
  const [stPin2, setStPin2] = useState("");

  const create = useBdCreateAccount();

  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 6);
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const orgOk =
    companyName.trim().length >= 1 &&
    ssmCode.trim().length >= 6 &&
    address.trim().length >= 5 &&
    contactName.trim().length >= 2 &&
    contactPhone.trim().length >= 7;
  const loginOk =
    ownerName.trim().length >= 1 &&
    emailRe.test(email.trim()) &&
    password.length >= 8 &&
    password === password2;
  const staffOk =
    stName.trim().length >= 2 &&
    emailRe.test(stEmail.trim()) &&
    stBirthday.length > 0 &&
    stGender !== "" &&
    staffPinSchema.safeParse(stPin).success &&
    stPin === stPin2;
  const valid = orgOk && loginOk && staffOk;

  function submit() {
    // Local snapshot so the ""-guard narrows to male|female for the payload.
    const gender = stGender;
    if (!valid || create.isPending || gender === "") return;
    const input: CreateAccountInput = {
      name: ownerName.trim(),
      email: email.trim().toLowerCase(),
      role: "dealer",
      companyName: companyName.trim(),
      region: region.trim() || undefined,
      // Location names carry the fixed Carres prefix (Loo 2026-07-25); blank
      // still falls back to the company name server-side.
      outletName: carresLocationName(outletName) || undefined,
      address: address.trim(),
      ssmCode: ssmCode.trim(),
      contactName: contactName.trim(),
      contactPhone: contactPhone.trim(),
      tempPassword: password,
      initialStaff: {
        name: stName.trim(),
        staffRole: stRole,
        pin: stPin,
        email: stEmail.trim().toLowerCase(),
        birthday: stBirthday,
        gender,
        phone: stPhone.trim() || undefined,
        color: stColor,
      },
    };
    create.mutate(input, {
      onSuccess: () => {
        toast.success(`Dealer account created — ${companyName.trim()} can sign in now`);
        onClose();
      },
      onError: (e) =>
        toast.error(e instanceof ApiError ? e.message : "Could not create the dealer account"),
    });
  }

  return (
    <ModalShell
      wide
      title="New dealer account"
      subtitle="Opens the dealership: company profile, the store login (dealership principal), and its first staff sign-in PIN — same as the HQ door."
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} disabled={create.isPending} className={btnGhost}>
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!valid || create.isPending}
            className={btnSolid}
            data-testid="bd-create-dealer-save"
          >
            {create.isPending ? "Creating…" : "Create dealer account"}
          </button>
        </>
      }
    >
      <SectionTitle>Dealership</SectionTitle>
      <label className="flex flex-col gap-1.5">
        <Label>Company name</Label>
        <input
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          data-testid="bd-cd-company"
          autoFocus
          className={inputCls}
          placeholder="e.g. Dream Living Sdn Bhd"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <Label>SSM number</Label>
          <input
            value={ssmCode}
            onChange={(e) => setSsmCode(e.target.value)}
            data-testid="bd-cd-ssm"
            className={inputCls}
            placeholder="e.g. 202501012345"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <Label>Region (optional)</Label>
          <input
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className={inputCls}
            placeholder="e.g. Klang Valley"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1.5">
        <Label>Business address</Label>
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          data-testid="bd-cd-address"
          className={inputCls}
          placeholder="Prints on Sales Order PDFs"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <Label>PIC name</Label>
          <input
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            data-testid="bd-cd-pic"
            className={inputCls}
            placeholder="Person in charge"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <Label>PIC phone</Label>
          <input
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            data-testid="bd-cd-pic-phone"
            className={inputCls}
            placeholder="012-3456789"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1.5">
        <Label>First outlet name (optional)</Label>
        <CarresNameInput
          value={outletName}
          onChange={setOutletName}
          placeholder="e.g. Mont Kiara"
        />
        <span className="text-label text-base-500">
          {outletName.trim()
            ? `Saved as "${carresLocationName(outletName) || "Carres …"}"`
            : "Blank falls back to the company name"}
        </span>
      </label>

      <SectionTitle>Store login (dealership principal)</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <Label>Owner name</Label>
          <input
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
            data-testid="bd-cd-owner"
            className={inputCls}
            placeholder="Account holder"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <Label>Login email</Label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            data-testid="bd-cd-email"
            className={inputCls}
            placeholder="owner@dealer.com"
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <Label>Password (min 8)</Label>
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            data-testid="bd-cd-password"
            className={inputCls}
            placeholder="••••••••"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <Label>Confirm password</Label>
          <input
            type="password"
            autoComplete="new-password"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            data-testid="bd-cd-password2"
            className={inputCls}
            placeholder="••••••••"
          />
        </label>
      </div>
      {password2.length >= 8 && password !== password2 && (
        <div className="text-meta text-destructive">Passwords don&apos;t match.</div>
      )}

      <SectionTitle>First staff &amp; PIN</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <Label>Staff name</Label>
          <input
            value={stName}
            onChange={(e) => setStName(e.target.value)}
            data-testid="bd-cd-staff-name"
            className={inputCls}
            placeholder="e.g. Aisha Rahman"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <Label>Role</Label>
          <select
            value={stRole}
            onChange={(e) => setStRole(e.target.value as StaffTierDto)}
            data-testid="bd-cd-staff-role"
            className={inputCls}
          >
            {DEALER_TIERS.map((t) => (
              <option key={t} value={t}>
                {tierLabel(t, "dealer")}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1.5">
        <Label>Staff email</Label>
        <input
          type="email"
          value={stEmail}
          onChange={(e) => setStEmail(e.target.value)}
          data-testid="bd-cd-staff-email"
          className={inputCls}
          placeholder="aisha@store.com"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>Birthday</Label>
          <BirthdayWheelField
            value={stBirthday}
            todayIso={minDeliveryDateISO(0)}
            onChange={setStBirthday}
            testId="bd-cd-staff-birthday"
          />
        </div>
        <label className="flex flex-col gap-1.5">
          <Label>Gender</Label>
          <select
            value={stGender}
            onChange={(e) => setStGender(e.target.value as StaffGenderDto | "")}
            data-testid="bd-cd-staff-gender"
            className={inputCls}
          >
            <option value="">— select —</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1.5">
        <Label>Staff phone (optional)</Label>
        <input
          value={stPhone}
          onChange={(e) => setStPhone(e.target.value)}
          className={inputCls}
          placeholder="012-3456789"
        />
      </label>
      <div className="flex flex-col gap-1.5">
        <Label>Avatar colour</Label>
        <ColorDotPicker value={stColor} onChange={setStColor} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <Label>6-digit PIN</Label>
          <input
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            value={stPin}
            onChange={(e) => setStPin(digits(e.target.value))}
            data-testid="bd-cd-staff-pin"
            className={pinCls}
            placeholder="••••••"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <Label>Confirm PIN</Label>
          <input
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            value={stPin2}
            onChange={(e) => setStPin2(digits(e.target.value))}
            data-testid="bd-cd-staff-pin2"
            className={pinCls}
            placeholder="••••••"
          />
        </label>
      </div>
      {stPin2.length === 6 && stPin !== stPin2 && (
        <div className="text-meta text-destructive">PINs don&apos;t match.</div>
      )}

      {create.isError && (
        <div className="text-meta text-destructive" data-testid="bd-cd-error">
          {create.error?.message ?? "Could not create the dealer account"}
        </div>
      )}
    </ModalShell>
  );
}
