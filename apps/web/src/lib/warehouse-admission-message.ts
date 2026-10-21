export function warehouseAdmissionMessage(reason:string|null|undefined):string {
 if(reason==='receiving_site_inactive')return 'Your receiving Site or receiving company is not active. Ask Operation to check the setup.';
 if(reason==='individual_required')return 'This shared Warehouse login sends counts to Office. Use your own Warehouse account to confirm receiving.';
 if(reason==='confirmation_not_available')return 'Receiving confirmation is not available yet. Counts still go to Office.';
 return 'Receiving is not available. Ask Operation to check your Warehouse account and Site.';
}
