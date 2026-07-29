import { CARRES_NAME_PREFIX } from "@carres/shared";

/**
 * Location-name input with the fixed brand prefix (Loo 2026-07-25): every new
 * outlet / showroom is "Carres <location>" — the prefix is a locked segment in
 * the field and the user types only the location part. The value held by the
 * caller is the LOCATION ONLY; compose the stored name with
 * `carresLocationName()` at submit.
 */
export default function CarresNameInput({
  value,
  onChange,
  placeholder,
  autoFocus,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  testId?: string;
}) {
  return (
    <div className="flex items-stretch w-full border border-base-200 rounded bg-white overflow-hidden focus-within:border-base-700">
      <span className="flex items-center px-3 text-body font-semibold text-base-500 bg-base-50 border-r border-base-200 select-none">
        {CARRES_NAME_PREFIX}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        data-testid={testId}
        className="flex-1 min-w-0 px-3 py-2.5 text-body bg-transparent outline-none"
      />
    </div>
  );
}
