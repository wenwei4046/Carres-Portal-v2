# Order detail — record view

`index.html` recreates the order-detail page (`#1153 CR0902`). The Detail
archetype: opened over a list, summaries left, the Items table is the hero.

**Structure:**
- **Order header** — back link, `#1153`, mono `CR0902`, an `On hold` status pill,
  and `customer · region · ordered date`; flag / ⋮ / close icons at the right.
- **3 KPI cards** — Customer·Money / Stock / Logistic. Each states the headline
  number (red when at-risk), a meta line, and (money/logistic) a `Reminder`
  outline + one flame `Chase` button.
- **32 / 68 split** — left column = collapsible summary panels (Customer,
  Balance, Storage, Delivery); right column = **Items ordered** table + the
  **Warehouse stock** reserve table. `To reserve` rows get a warm wash; reserved
  rows show a green pill.

Layout rules: white 12px-radius panels, hairline dividers, `.t4-section` titles,
mono for SKU/PO/phone/dates, `.t-num`-style tabular money, one flame action per
card. Everything else neutral.
