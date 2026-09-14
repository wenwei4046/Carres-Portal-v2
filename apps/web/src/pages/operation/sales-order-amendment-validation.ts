import { ORDER_ENTRY_TABS, resolveFormTab, type FormFieldsConfig, type OrderEntryTab } from "@carres/shared";

// Map the existing controls to their owning form-schema fields. Address line 2
// is intentionally absent: the address rule requires line 1 and the cascade.
const FIELDS = {
  customer_name: ["customer", "name", "Full name"],
  customer_phone: ["customer", "phone", "Phone"],
  customer_email: ["customer", "email", "Email"],
  customer_race: ["customer", "race", "Race"],
  customer_gender: ["customer", "gender", "Gender"],
  customer_birthday: ["customer", "birthday", "Birthday"],
  emergency_name: ["emergency", "emergency", "Name"],
  emergency_phone: ["emergency", "emergency", "Phone"],
  emergency_relationship: ["emergency", "emergency", "Relationship"],
  customer_address_line1: ["address", "address", "Address line 1"],
  customer_address_state: ["address", "address", "State"],
  customer_address_city: ["address", "address", "City"],
  customer_address_postcode: ["address", "address", "Postcode"],
  building_type: ["address", "address", "Building type"],
  customer_billing: ["address", "billing", "Billing address"],
  proceed_date: ["target", "proceedDate", "Proceed date"],
  delivery_floor: ["target", "stairCarry", "Floor"],
  delivery_stair_items: ["target", "stairCarry", "Items needing stair carry"],
  delivery_has_lift: ["target", "stairCarry", "Lift available?"],
} as const satisfies Record<string, readonly [OrderEntryTab, string, string]>;

export type AmendmentField = keyof typeof FIELDS;
type AmendmentValues = Partial<Record<AmendmentField, string | number | boolean | null>> & {
  customer_address_unknown: boolean;
  customer_billing_same: boolean;
  custom: Record<string, string>;
};

const empty = (value: unknown) => value == null || (typeof value === "string" && !value.trim());

/** Required indicators and blank-field errors share the existing resolved
 * schema. Other validation stays in the workspace's existing validateDraft. */
export function amendmentValidation(values: AmendmentValues, config: FormFieldsConfig | null) {
  const required = {} as Record<AmendmentField, boolean>;
  const errors: Partial<Record<AmendmentField, string>> = {};
  const customErrors: Record<string, string> = {};
  for (const key of Object.keys(FIELDS) as AmendmentField[]) {
    const [tab, builtin, label] = FIELDS[key];
    const field = resolveFormTab(config, tab).builtins[builtin];
    const exempt = (builtin === "address" && values.customer_address_unknown)
      || (builtin === "billing" && values.customer_billing_same);
    required[key] = Boolean(field?.required && !exempt);
    // The existing stair-count control displays a saved null as 0 without
    // writing that default back to the order.
    const value = key === "delivery_stair_items" ? values[key] ?? 0 : values[key];
    if (required[key] && empty(value)) errors[key] = `${label} — required`;
  }
  for (const tab of ORDER_ENTRY_TABS) {
    for (const field of resolveFormTab(config, tab).custom) {
      if (field.required && empty(values.custom[field.key])) customErrors[field.key] = `${field.label} — required`;
    }
  }
  return { required, errors, customErrors };
}
