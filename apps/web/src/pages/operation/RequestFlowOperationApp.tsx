import Loading from "@/components/kit/Loading";
import OperationApp from "./OperationApp";
import { usePurchaseRequestRelease } from "@/lib/queries";

/** Application root follows the governed DB release; no browser/env opt-in. */
export default function RequestFlowOperationApp() {
 const release=usePurchaseRequestRelease();
 if(release.isPending)return <Loading/>;
 // Refetch failure must not replace an open request with the legacy form.
 // Every actual write still rechecks the authoritative SQL admission.
 return <OperationApp purchaseRequestContext={release.data?.requestFlow===true}/>;
}
