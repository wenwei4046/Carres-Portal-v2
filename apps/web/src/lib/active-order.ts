import { create } from "zustand";

/**
 * Tiny shared store for the order currently open in the full-page detail, so the
 * global OperationRightRail can show THAT order's Activity (Jess 2026-06-30:
 * Activity moved off the page into the right rail). Set by OperationOrdersControl
 * when an order opens; cleared on close.
 */
interface ActiveOrderState {
  orderId: string | null;
  set: (orderId: string | null) => void;
}

export const useActiveOrder = create<ActiveOrderState>((set) => ({
  orderId: null,
  set: (orderId) => set({ orderId }),
}));
