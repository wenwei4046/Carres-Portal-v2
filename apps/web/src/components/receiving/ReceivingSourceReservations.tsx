import {receivingSourceReservationResults as results} from '@carres/shared';
import {useWarehouseConfirmationHistory} from '@/lib/warehouse-confirmation';
import DocumentTable from '@/components/kit/DocumentTable';
import {DocSection} from '@/pages/operation/components/workspace-doc';
import Button from '@/components/kit/Button';
/** Only the canonical posted event states the reservation outcome. No guessed SO or local completion. */
export function ReceivingSourceReservations({value}:{value:unknown}){
 if(value===undefined||value===null)return null;
 const parsed=results.safeParse(value);
 if(!parsed.success)return <p role="alert">Stock reservation results could not be loaded.</p>;
 if(!parsed.data.length)return null;
 return <DocSection title="Stock reservation"><DocumentTable label="Stock reservation" columns={[{key:'unit',label:'Unit ID'},{key:'result',label:'Result'}]} rows={parsed.data.map(row=>({key:row.unit_code,cells:{unit:row.unit_code,result:row.result==='source_reserved'?'Reserved for original Sales Order':row.result==='existing_binding_preserved'?'Existing reservation kept':'Source needs checking'}}))}/></DocSection>;
}
export default function WarehouseReceiptReservationHistory({receiptId}:{receiptId:string}){
 const history=useWarehouseConfirmationHistory(receiptId);
 if(history.isPending)return <p role="status">Loading…</p>;
 if(history.isError)return <div role="alert">Stock reservation results could not be loaded.<Button onClick={()=>void history.refetch()}>Try again</Button></div>;
 if(!Array.isArray(history.data?.events))return <p role="alert">Stock reservation results could not be loaded.</p>;
 return <>{history.data.events.filter(e=>e.event==='posted').map(e=><ReceivingSourceReservations key={e.id} value={e.payload.source_reservations}/>)}</>;
}
