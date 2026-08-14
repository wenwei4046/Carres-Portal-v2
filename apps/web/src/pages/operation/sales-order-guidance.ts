export interface SalesOrderGuidance {
  problem: string;
  action: string;
  why: string;
  owner: string;
  contact: string;
  ask: string;
  use: string;
  record: string;
  next: string;
}

export function missingDeliveryDateGuidance(input: {
  so: number;
  customer: string;
  salesperson?: string | null;
  phone?: string | null;
}): SalesOrderGuidance {
  const owner = input.salesperson?.trim() || "Sales";
  const phone = input.phone?.trim() || "Phone not recorded";
  return {
    problem: "No delivery date",
    action: `${owner} · Confirm the date with ${input.customer} · Record the agreed date`,
    why: "The customer delivery commitment is not recorded.",
    owner,
    contact: `${input.customer} · ${phone}`,
    ask: "Ask which delivery date the customer agrees to.",
    use: "Use the customer delivery confirmation message.",
    record: "Record the agreed Customer Delivery date.",
    next: "Delivery can plan from the recorded customer date.",
  };
}
