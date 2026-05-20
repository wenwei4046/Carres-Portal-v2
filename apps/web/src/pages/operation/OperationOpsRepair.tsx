import OpsStockListView from "./OpsStockListView";

export default function OperationOpsRepair() {
  return (
    <OpsStockListView
      endpoint="/repair"
      kicker="Operation · Carres Klang"
      title="Repair / return queue"
      blurb="Units flagged for repair, or in old / damaged condition. Unflag when fixed, or takeout if written off."
      actions={["flag-repair", "takeout"]}
      cacheKey="repair"
    />
  );
}
