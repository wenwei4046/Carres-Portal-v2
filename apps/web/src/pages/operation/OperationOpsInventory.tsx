import OpsStockListView from "./OpsStockListView";

export default function OperationOpsInventory() {
  return (
    <OpsStockListView
      endpoint="/inventory"
      kicker="Operation · Carres Klang"
      title="Inventory"
      blurb="Master grid of every unit at Carres Klang regardless of status. All actions available — useful when something doesn't fit cleanly in Ready / Reserved / Repair."
      actions={["reserve", "release", "reassign", "takeout", "flag-repair"]}
      cacheKey="inventory"
    />
  );
}
