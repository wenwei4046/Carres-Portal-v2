# SO Batch Purchase — fix for 13 Oct (round 2)

Scope: SO Batch Purchase only. Do not touch the Tasks panel.

1. Remove "Match Ready Stock" from the toolbar (never agreed).
2. Remove the "Cards" view.
3. One view button "By supplier ▾" as in Purchasing v3.dc.html#batch. Menu: GROUP BY = By supplier · By sales order · By category · By order deadline; SHOW COLUMNS FOR = modules. Build By category and By order deadline from branch build/so-batch-rest, matching the design file.
4. purchasing-data.js in this package has TEST WhatsApp links — safe for the public repo. Add the design files to the repo.

Check: open the live page at 1164 wide next to Purchasing v3.dc.html#batch, match item by item, run carres-check.js — all PASS before showing the owner.
