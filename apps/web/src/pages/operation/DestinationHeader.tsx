import type { ReactNode } from "react";
import ModuleHeader from "./components/ModuleHeader";

/**
 * The reference destination's one identity band.
 *
 * Sales Orders is a destination, not a one-tab module. `ModuleHeader` already
 * owns the governed 44px geometry and the genuine global utilities, so this
 * composition supplies only the destination identity. No duplicate tab or
 * second title is rendered underneath it.
 */
export default function DestinationHeader({ right }: { right?: ReactNode }) {
  return (
    <ModuleHeader
      testId="sales-orders-destination-header"
      word="Sales Orders"
      docTitle="Sales Orders — Carres"
      destinationHeader
      right={right}
    />
  );
}
