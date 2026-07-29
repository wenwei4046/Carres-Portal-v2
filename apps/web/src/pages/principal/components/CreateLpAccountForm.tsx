import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";

/**
 * Principal-side form to create a new operation Partner (LP) account.
 *
 * Calls `POST /api/principal/partners` (Task 19), which atomically creates:
 *   1. delivery_partners row
 *   2. auth.users via service_role admin API
 *   3. app_users { role: 'partner', partner_id: ... }
 *
 * UI conventions match other Principal-side surfaces (`InviteDealerModal`):
 *   - plain HTML inputs styled via Tailwind utility classes (no shadcn
 *     primitives — they don't ship in this repo's `components/` tree)
 *   - error surfaced inline below the form, not via toast (caller decides
 *     toast vs inline once the form is wired into a page)
 *   - submit clears the password field on success but preserves no other
 *     state — the form is meant to live inside a modal that unmounts
 */
export interface CreateLpAccountFormProps {
  onCreated: (partnerId: string) => void;
}

type FormState = {
  companyName: string;
  contactNumber: string;
  address: string;
  password: string;
};

const initial: FormState = {
  companyName: "",
  contactNumber: "",
  address: "",
  password: "",
};

interface CreatePartnerResponse {
  partner_id: string;
  auth_user_id: string;
  email: string;
}

export default function CreateLpAccountForm({
  onCreated,
}: CreateLpAccountFormProps) {
  const [form, setForm] = useState<FormState>(initial);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation<CreatePartnerResponse, Error, FormState>({
    mutationFn: (input) =>
      apiFetch<CreatePartnerResponse>("/api/principal/partners", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (res) => {
      setForm(initial);
      setError(null);
      onCreated(res.partner_id);
    },
    onError: (e) => {
      // ApiError extends Error so `.message` works for both. We surface the
      // server message verbatim — the route emits stable, human-readable
      // strings ("Email already in use", etc.).
      const msg = e instanceof ApiError ? e.message : (e.message || "Failed");
      setError(msg);
    },
  });

  return (
    <form
      className="grid gap-3 max-w-md"
      onSubmit={(e) => {
        e.preventDefault();
        if (create.isPending) return;
        create.mutate(form);
      }}
    >
      <Field
        id="companyName"
        label="Company name"
        value={form.companyName}
        onChange={(v) => setForm({ ...form, companyName: v })}
        required
        minLength={2}
      />
      <Field
        id="contactNumber"
        label="Contact number"
        value={form.contactNumber}
        onChange={(v) => setForm({ ...form, contactNumber: v })}
        required
        minLength={7}
      />
      <Field
        id="address"
        label="Address"
        value={form.address}
        onChange={(v) => setForm({ ...form, address: v })}
        required
        minLength={5}
        textarea
      />
      <Field
        id="password"
        label="Password"
        value={form.password}
        onChange={(v) => setForm({ ...form, password: v })}
        required
        minLength={8}
        type="password"
      />
      {error && (
        <p
          className="text-meta text-red-600"
          role="alert"
        >
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={create.isPending}
          className="btn-primary disabled:opacity-50"
        >
          {create.isPending ? "Creating…" : "Create LP account"}
        </button>
      </div>
    </form>
  );
}

interface FieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  minLength?: number;
  type?: string;
  textarea?: boolean;
}

function Field({
  id,
  label,
  value,
  onChange,
  required,
  minLength,
  type = "text",
  textarea,
}: FieldProps) {
  const inputClass =
    "w-full px-3 py-2.5 border border-base-200 rounded text-body outline-none box-border";
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-label uppercase tracking-wider text-base-500 font-semibold mb-1"
      >
        {label}
      </label>
      {textarea ? (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          minLength={minLength}
          rows={3}
          className={inputClass}
        />
      ) : (
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          minLength={minLength}
          className={inputClass}
        />
      )}
    </div>
  );
}
