import OpsStockListView from "./OpsStockListView";

export default function OperationOpsReady() {
  return (
    <OpsStockListView
      endpoint="/ready"
      kicker="Operation · Carres Klang"
      title="Ready stock"
      blurb="Free units in good condition. Reserve one against a customer ref — the oldest matching unit is picked automatically (FIFO)."
      actions={["reserve"]}
      cacheKey="ready"
    />
  );
}
