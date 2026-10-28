import { useState } from "react";
import type { ForecastPurchaseSizeRow, PurchaseRequestContext } from "@carres/shared";
import { useManualPurchaseRegister, type ManualPurchaseRegisterPayload } from "@/lib/queries";
import { CreateRequestWorkspace } from "../OperationManualPurchase";
import EmptyState from "@/components/kit/EmptyState";
import Loading from "@/components/kit/Loading";
import Button from "@/components/kit/Button";

/** State/entry adapter only. All fields, Catalog, planning, Review, actual
 * write, request identity and retry remain the existing owning Workspace. */
export function forecastRequestContext(selection:readonly ForecastPurchaseSizeRow[],metadata:Pick<ManualPurchaseRegisterPayload,"todayIso"|"defaultDestinationId">):PurchaseRequestContext {
 return {version:1,origin:selection.length?"forecast_suggestion":"stock_request",purpose:"ready_stock",proceedDate:metadata.todayIso??"",stockDeliveryDate:null,serviceCaseId:null,reason:null,companyPersonName:"",projectReference:"",explanation:"",forecastChangeReason:"",recipients:[],lines:selection.map(size=>({
  id:crypto.randomUUID(),sku:size.sku,qty:size.toAsk,attrs:null,recipientNeeds:[],stockProposals:[],
  allocations:metadata.defaultDestinationId?[{id:crypto.randomUUID(),destinationId:metadata.defaultDestinationId,supplierDeliveryDate:"",qty:size.toAsk,recipients:[]}]:[],
 }))};
}
export default function ForecastRequestWorkspace({selection,onDone}:{selection:readonly ForecastPurchaseSizeRow[];onDone:(id?:string)=>void}) {
 const source=useManualPurchaseRegister();
 if(source.isPending&&!source.data)return <Loading variant="skeleton" label="Loading"/>;
 if(!source.data?.todayIso)return <EmptyState title="Could not be loaded" action={<Button onClick={()=>void source.refetch()}>Try again</Button>}/>;
 return <>{source.isError?<EmptyState title="Could not be loaded" action={<Button onClick={()=>void source.refetch()}>Try again</Button>}/>:null}<LoadedForecastRequest selection={selection} metadata={source.data} onDone={onDone}/></>;
}
function LoadedForecastRequest({selection,metadata,onDone}:{selection:readonly ForecastPurchaseSizeRow[];metadata:ManualPurchaseRegisterPayload;onDone:(id?:string)=>void}) {
 const [value,setValue]=useState(()=>forecastRequestContext(selection,metadata));
 return <CreateRequestWorkspace editId={null} destinations={metadata.destinations} defaultDestinationId={metadata.defaultDestinationId??null} supplierCollections={metadata.supplierCollections??[]} suppliers={metadata.suppliers} staff={metadata.users} minDeliveryDays={metadata.minDeliveryDays??0} todayIso={metadata.todayIso??null} onDone={onDone} contextDraft={{value,onChange:setValue,pickupLocations:metadata.destinations}}/>;
}
