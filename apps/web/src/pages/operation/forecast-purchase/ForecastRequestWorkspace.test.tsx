import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ForecastPurchaseSizeRow } from "@carres/shared";
const source=vi.hoisted(()=>({data:null as any,isPending:false,isError:false,refetch:vi.fn()}));
vi.mock("@/lib/queries",()=>({useManualPurchaseRegister:()=>source}));
vi.mock("../OperationManualPurchase",()=>({CreateRequestWorkspace:({contextDraft}:any)=><><pre data-testid="same-owning-workspace">{JSON.stringify(contextDraft.value)}</pre><button onClick={()=>contextDraft.onChange({...contextDraft.value,explanation:"TEST kept draft"})}>TEST edit</button></>}));
import ForecastRequestWorkspace,{forecastRequestContext} from "./ForecastRequestWorkspace";
beforeEach(()=>{source.data={todayIso:"2026-10-18",defaultDestinationId:"TEST-site",destinations:[],suppliers:[],users:[]};source.isPending=false;source.isError=false;});
it("manual stock request uses RS origin with no customer/SO/reason/forecast cap",()=>{
 const draft=forecastRequestContext([],source.data);
 expect(draft).toMatchObject({origin:"stock_request",purpose:"ready_stock",recipients:[],lines:[],reason:null,serviceCaseId:null,stockDeliveryDate:null});
});
it("forecast selection passes full500 to the same owning form and never guesses production/delivery dates",()=>{
 const size={sku:"TEST-SKU",toAsk:500,deliveryDate:"2026-11-30"} as ForecastPurchaseSizeRow;
 render(<ForecastRequestWorkspace selection={[size]} onDone={()=>{}}/>);
 const draft=JSON.parse(screen.getByTestId("same-owning-workspace").textContent!);
 expect(draft).toMatchObject({origin:"forecast_suggestion",purpose:"ready_stock",recipients:[],stockDeliveryDate:null,lines:[{sku:"TEST-SKU",qty:500,recipientNeeds:[],stockProposals:[],allocations:[{qty:500,destinationId:"TEST-site",supplierDeliveryDate:"",recipients:[]}]}]});
});
it("unread setup does not mount a zero/guessed request",()=>{
 source.isError=true;source.data=null;
 render(<ForecastRequestWorkspace selection={[]} onDone={()=>{}}/>);
 expect(screen.queryByTestId("same-owning-workspace")).not.toBeInTheDocument();
 expect(screen.getByText("Could not be loaded")).toBeVisible();
});


it("failed metadata refetch preserves the already-open owning draft",()=>{
 const view=render(<ForecastRequestWorkspace selection={[]} onDone={()=>{}}/>);
 fireEvent.click(screen.getByRole("button",{name:"TEST edit"}));
 source.isError=true;
 view.rerender(<ForecastRequestWorkspace selection={[]} onDone={()=>{}}/>);
 expect(screen.getByTestId("same-owning-workspace")).toHaveTextContent("TEST kept draft");
 expect(screen.getByText("Could not be loaded")).toBeVisible();
});
