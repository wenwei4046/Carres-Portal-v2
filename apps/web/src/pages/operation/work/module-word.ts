import type { OperationWorkModule } from "@carres/shared";

/** The Work module words, one spelling for the summary and the audit section. */
export const WORK_MODULE_WORD: Record<OperationWorkModule, string> = {
  orders: "Sales Orders",
  purchasing: "Purchasing",
  receiving: "Receiving",
  delivery: "Delivery",
  payment: "Payment",
  issue_tracker: "Issue Tracker",
};
