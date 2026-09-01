import ReorderStockCard from "./components/ReorderStockCard";

/**
 * Stock-owned master data. Buying work stays in Purchasing; this page only
 * changes the governed numbers that the replenishment readers consume.
 */
export default function StockSettings() {
  return (
    <div className="max-w-[1040px] px-9 py-8 pb-14" data-testid="stock-settings">
      <h1 className="text-page text-base-900">Inventory Settings</h1>
      <p className="mt-1 text-body text-base-600">
        Set the inventory levels and supplier lead time used by Purchasing.
      </p>
      <div className="mt-6">
        <ReorderStockCard settingsOnly />
      </div>
    </div>
  );
}
