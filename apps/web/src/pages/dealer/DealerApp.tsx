import { Navigate, Route, Routes } from "react-router-dom";
import DealerPos from "./DealerPos";
import DealerChrome from "./DealerChrome";
import DealerOrders from "./DealerOrders";
import DealerProducts from "./DealerProducts";
import DealerSettings from "./DealerSettings";

/**
 * Dealer router. The `/dealer` index is the full-screen POS order-entry flow
 * ("open door = sell"); Orders / Products / Settings render inside the sidebar
 * chrome via a layout route. The legacy `?new=1` modal wizard is gone — opening
 * the POS is just navigating to `/dealer`.
 */
export default function DealerApp() {
  return (
    <Routes>
      <Route index element={<DealerPos />} />
      <Route element={<DealerChrome />}>
        <Route path="orders" element={<DealerOrders />} />
        <Route path="orders/:id" element={<Navigate to="/dealer/orders" replace />} />
        <Route path="products" element={<DealerProducts />} />
        <Route path="settings" element={<DealerSettings />} />
      </Route>
      <Route path="*" element={<Navigate to="/dealer" replace />} />
    </Routes>
  );
}
