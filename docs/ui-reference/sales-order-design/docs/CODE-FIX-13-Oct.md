# Fix list for Claude Code — SO Batch Purchase (this round)

THIS ROUND = SO Batch Purchase only: points 1–5 and 8–11. LATER (do not touch now): points 6–7, the Tasks panel, Workspace, task view, notes, + Task — they ship together once final.
 (owner screenshot 13 Oct, erp.carresofficial.com/operation?tab=purchase)

Build from this package only: `Carres Shell.dc.html`, `Carres Table.dc.html`, `Purchasing v3.dc.html`, `purchasing-data.js`, `docs/Carres Layout Standard.md`, `docs/Carres Ops Rules.md`. Open `Purchasing v3.dc.html#batch` next to the live page at 1164 px and match it item by item.

## Data and words
1. Supplier names: "Hookka Industries" and "Ohana" are the same supplier (Ops Rules §4: Ohana, also called Hookka). One supplier = "Ohana" on every screen. The full company name only on the PO PDF.
2. Same supplier, two categories (bedframe 7 days, sofa 14 days) = two rows is correct (one PO per supplier and category), but the row must say the category: "Ohana · Bedframe" / "Ohana · Sofa". Two rows both called "Ohana" is wrong.
3. Item line 1 = model code as in the data ("CODY-K"), line 2 = size ("King"). Not "Cody / Super King".
4. Sub-table heads are sentence case from the Standard: "Item · To buy · Sales order · Order deadline · Supplier delivers to". Not "SO No", "Order By", "Supplier Deliver To".
5. Footer: rows count only ("4 groups"). The "To buy: Mattress 25 pcs · …" line is removed (the Summary has it).

## Layout
6. LATER — Tasks panel is the list style (Layout Standard §0 Tasks): head "Tasks" + "+ Task" + "Log call" + open-in-Workspace; day strip Mon–Fri with counts; To do · Waiting · Done; cards with module icon, title, fact rows (icon · label ⟷ value). The module-icon row and "Nothing assigned to you this week" empty state are not in the Standard. Empty = "Nothing to do today" + the Next day row.
7. LATER — Every task card opens the shared task view (Steps · Route · History · Files · Notes icon), same as Workspace.
8. The ⋮ menu must not cover the Status column; it opens below and to the left of the button, above the table (z-index), and closes on outside click.
9. Sub-rows (items) use the same tick box as group rows (16 px, same colour); a disabled tick box only when the row cannot be bought, with a tooltip saying why.
10. "Split" is a text button in the Standard's button style (grey text button), aligned with the select, not loose text.
11. Row heights 54 (group) and 44 (item) from the Standard; status pill + "n pcs to buy" fully visible.

## Check before showing
Run `carres-check.js` on the live page; every line must PASS.
