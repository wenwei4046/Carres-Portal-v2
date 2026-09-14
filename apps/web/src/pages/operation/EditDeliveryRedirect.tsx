/**
 * Edit Delivery is RETIRED (owner ruling 2026-09-13, Delivery MASTER §8.6):
 * the Delivery-owned writes live inside the Monitor row's expanded brief. A
 * saved or pasted `/operation/delivery/edit/:orderId[?leg=]` link lands on
 * that exact row with its brief already unfolded — never on a dead page.
 */
import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { monitorRowHref } from "./delivery-monitor";

export default function EditDeliveryRedirect() {
  const { orderId } = useParams<{ orderId: string }>();
  const [params] = useSearchParams();
  const leg = Number(params.get("leg") ?? "0") || 0;
  const scopeId = leg > 0 ? `${orderId ?? ""}#leg${leg}` : (orderId ?? "");
  return <Navigate to={monitorRowHref(scopeId)} replace />;
}
