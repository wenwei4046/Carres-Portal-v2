import OpsStockListView from "./OpsStockListView";

export default function OperationOpsReserved() {
  return (
    <OpsStockListView
      endpoint="/reserved"
      kicker="Operation · Carres Klang"
      title="Reserved stock"
      blurb="Units held against a customer ref. Release (back to free), reassign (swap to a different ref — old ref kept in history), or takeout (mark sold + record stock movement)."
      actions={["release", "reassign", "takeout", "flag-repair"]}
      cacheKey="reserved"
    />
  );
}
