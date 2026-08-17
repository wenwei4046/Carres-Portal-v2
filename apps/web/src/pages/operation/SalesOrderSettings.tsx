/**
 * SalesOrderSettings — `Sales Order Settings`, the section of the one Settings
 * Workspace that Sales Orders owns (orders/MASTER.md §11, APPROVED / LOCKED
 * 2026-08-11).
 *
 * **`SO Maintenance` is retired**, and this page is deliberately smaller than
 * the name it replaces. The 2026-06-16 plan behind `SO Maintenance` built a
 * second AutoCount-shaped grid over historical orders with a shared column
 * layout. §11 overruled it on both halves: the Register already owns columns
 * and saved views, and owns them PER USER; and no settings surface may become
 * an edit door into historical Sales Orders.
 *
 * §11 names three things this section owns — **Sales Order-controlled option
 * pools · Order Entry fields · payment-method choices** — and all three are
 * the Order Entry config. That is not a coincidence and it is worth writing
 * down, because the obvious-looking alternative is wrong:
 *
 *   0174's `config.options` LOOK like option pools and are NOT ours. Its own
 *   header calls them "display/filter aids"; and reading the catalog, the
 *   `option` columns are `status` (the order state machine, not a pool),
 *   `dealer_name` · `salesperson_name` · `warehouse_name` ·
 *   `delivery_partner_name` · `item_group` (master data owned by Dealers, HR,
 *   Stock, Delivery and Catalog) and `payment_method` (owned right here, by
 *   Order Entry). Curating another module's master data from the Sales Order
 *   settings page would be a second editor for one record — the defect the
 *   architecture's ownership laws exist to stop. So they are NOT here, and
 *   the page says where they live instead.
 *
 * The Sales Order-controlled pools are the ones the Order Entry editor
 * already owns: the choice lists on the custom fields Carres itself authors
 * for the Customer step. Those it may curate, because Sales Orders is where
 * they are asked and answered.
 *
 * **It edits CONFIGURATION, never a Sales Order.** Nothing here reads or
 * writes an existing order, and changing a choice never rewrites what a past
 * order recorded — a saved order keeps the words it was saved with. Changing
 * a customer's goods is the governed edit/amendment lane, and it stays there.
 *
 * Reached only through the global Page Header Settings gear — never a Sales
 * Orders tab, a portal-navigation item, a Work Toolbar button or a `…` item.
 */
import OrderEntryPage from "./OrderEntryPage";

/** Where the option lists that are NOT ours are actually maintained. Naming
 *  the owner is what stops the next chat rebuilding an editor for it here. */
const ELSEWHERE: Array<{ what: string; owner: string }> = [
  { what: "Dealers and showrooms", owner: "Stores" },
  { what: "Salespeople", owner: "HR" },
  { what: "Item groups and products", owner: "Operation Catalog" },
  { what: "Warehouses and locations", owner: "Stock" },
  { what: "Logistics companies", owner: "Delivery" },
];

export default function SalesOrderSettings() {
  return (
    <div className="max-w-[1040px] px-9 py-8 pb-14" data-testid="sales-order-settings">
      <div className="mb-5">
        <div className="kicker">Sales Orders</div>
        <h1 className="text-page font-display mt-1.5 text-base-900">Sales Order Settings</h1>
        <p className="text-body text-base-600 mt-1">
          Configure the options available when creating a Sales Order. Changes apply when the
          order-entry form is next loaded and never rewrite an order that is already saved.
        </p>
      </div>

      <OrderEntryPage embedded />

      <div className="mt-6 rounded-card border border-base-200 bg-white p-5" data-testid="settings-elsewhere">
        <div className="text-strong font-display text-base-900">Not set here</div>
        <p className="text-meta text-base-500 mb-2">
          These lists also appear on a Sales Order, but each one belongs to the module that keeps
          it. Change it there and every screen follows.
        </p>
        <ul className="grid gap-1 sm:grid-cols-2">
          {ELSEWHERE.map((row) => (
            <li key={row.what} className="text-meta text-base-700">
              {row.what} — {row.owner}
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-8 text-meta text-base-500">
        Register columns and saved views are not here either. They belong to you, not to the
        business, so they stay on the Sales Orders register.
      </p>
    </div>
  );
}
