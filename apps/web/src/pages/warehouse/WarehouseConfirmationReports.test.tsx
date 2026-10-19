import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { WarehouseReportSnapshot } from "./WarehouseConfirmationReports";
import type { WarehouseConfirmationHistoryRow } from "@/lib/warehouse-confirmation";
afterEach(cleanup);
const stockId="00000000-0000-4000-8000-000000000301";
const lineId="00000000-0000-4000-8000-000000000302";
const event:WarehouseConfirmationHistoryRow={id:"event",receipt_id:"receipt",event:"submitted",event_at:"2026-10-19T12:00:00Z",actor_name:"TEST Confirmer",line_labels:{[lineId]:"TEST SOURCE SKU"},unit_labels:{[stockId]:"U1-000-301"},payload:{report:{arrival_source_id:"00000000-0000-4000-8000-000000000303",arrival_units:[{stock_item_id:stockId,outcome:null,issue_kind:null,note:null}],lines:[{id:lineId,received_now:null,damaged_qty:null,wrong_item_qty:null}],extra_lines:[{sku:"TEST UNKNOWN EXTRA",qty:null}]}}};
describe("Warehouse history preserves each physical report",()=>{
 it("shows unknown quantities and the source's real Unit label without fabricating zero or an identity",()=>{
  render(<WarehouseReportSnapshot event={event}/>);
  const quantities=screen.getByRole("table",{name:"Recorded quantities"});
  expect(within(quantities).getAllByText("Not recorded")).toHaveLength(3);
  expect(within(quantities).queryByText("0")).not.toBeInTheDocument();
  const units=screen.getByRole("table",{name:"Recorded Unit results"});
  expect(within(units).getByText("U1-000-301")).toBeInTheDocument();
  expect(screen.queryByText(stockId)).not.toBeInTheDocument();
  expect(within(screen.getByRole("table",{name:"Recorded Extra"})).getByText("TEST UNKNOWN EXTRA")).toBeInTheDocument();
 });
});
