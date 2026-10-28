# Code brief — 13 Oct (round 3): Tasks panel + Workspace + SO Batch By sales order

Every file in this package is current. Older Workspace files (Workspace v2, Workspace My Tasks) and the old fix lists were removed — delete them in the repo too. Workspace = Workspace v3.dc.html only.

Build in this order, one PR each, carres-check PASS at 1025 / 1164 / 1440 before showing the owner:

1. SO Batch Purchase · By sales order — rebuild on Carres Table like By supplier (no side scroll). "Use stock" lives in the selection bar (only when ticked items can use warehouse stock), never on the toolbar.
2. Tasks panel (Carres Shell, right side) — date strip Mon–Fri, list cards, one task view (head "[icon] page / record" + ⓘ, fact rows, tabs Steps · Route · History · Files · Notes icon, footer owner), Files tab staged like Order Route (SO PDFs view/download, PO PDF, message sent, proofs), @ notes → 🔔 Mention, + Task dialog, dark toast with Undo. Title row 36.
3. Workspace (Workspace v3.dc.html) — full table when nothing chosen; list + wide task card when a task is chosen; left rail Module counts = toolbar tab count, one plain number per row; "Do it here" side sheet uses the module's own task card (#task=…&embed=1).
4. One task record (Ops Rules §8): Tasks panel, Workspace and Summary read the same record; Done written once for everyone; Waiting returns to To do when its time passes; To do = due today or earlier; "Goods arrived" closes Chase / Check new ETA / Ask for Supplier DO on that PO; "Call customer about delay" stays until the customer is told (closes by itself only if goods arrive on or before the customer date).

Tested in the design on 13 Oct: Place → Send → Chase No reply → Chase New date → Goods arrived; Tasks panel and Workspace showed the same To do / Waiting at every step from step 3. Read docs/Carres Layout Standard.md and docs/Carres Ops Rules.md for every word and size; anything missing in data shows "Not recorded".
