# DELIVERY — CARD 22 · A signed document belongs to its own DO

BUILD/DELIVERY convergence · 2026-09-14.

Authority: Delivery MASTER §6.1 binds proof to the event/document it proves; Card 14 distinguishes journey legs; Card 20 owns the Arrived vocabulary. This Card adds no status, writer or business word.

Measured on SO-1362: the intermediate DO-130926-0842 displays the final DO-130926-3223 signed file. The signed-document GET endpoint reads orders.do_file_path without checking orders.do_number. The register, Monitor and DO object make the same assumption.

Use one shared read projection: a document-bound evidence file belongs only to its recorded DO; the legacy order mirror belongs only to orders.do_number. Pick the newest applicable file. A different or unknown document number supplies no file. The signed-url endpoint and displayed proof facts must agree. Keep existing bound files visible and never borrow a sibling’s signature or proof timestamp.

- [x] Shared projection and positive/negative controls
- [x] Signed-document API, register, Monitor and DO object use the same projection
- [x] Intermediate arrival shows no customer signed-paper absence/demand (Card 20 remains the status owner)
- [x] Green CI, merge, exact-SHA deployment and authenticated SO-1362 proof re-read

No migration, no new file upload, no status/stock/Unit write. Reuse the existing labeled Journey fixture.


Deployment reliability: the preceding production run for `50680e5e` failed when the Purchasing calendar test’s module-level TODAY was captured before MYT midnight and the page rendered after midnight. Freeze Date alone to the fixture instant in that test suite; timers remain real. The 126-test suite passes with a fixed clock. No Purchasing runtime logic changes.

Local validation: shared proof projection 10 tests, signed-document API 36 tests, and seven web suites 359 tests passed (including the 126-test fixed-clock Purchasing suite). Workspace typecheck and lint passed. Full CI and production acceptance subsequently passed as recorded below.

Authenticated acceptance of the preceding 9dd3945b deployment also found that Register’s Driver submission cell and filter still demanded customer proof from intermediate arrivals. Apply the same intermediate-leg rule to the cell, search/export and filter; retain recorded photos. The page regression covers both empty and recorded-photo intermediate documents.

## Production closure · 2026-09-14 01:26 MYT

PR #1295 merged as `12d1a264bcf17cd9c813f739dfd9d446c6813023`. The implementation head passed full CI (11,185 tests); after reconciling the concurrently merged closure docs, the final PR head `69df36d1` also passed full CI run `34770326900` (shared 3,303 + API 3,253 + web 4,645 = 11,201 passed, 7 optional integration tests skipped). GitHub’s `--auto` command merged immediately while that final rerun was still running; no claim is made that the final rerun preceded the merge. Deployment run `34770334192` independently repeated the complete required checks on the deployed SHA and succeeded before publishing. All five surfaces — both Pages projects, both canonical domains and API Worker — converged exactly to `12d1a264bcf17cd9c813f739dfd9d446c6813023`.

Authenticated Operation API acceptance on SO-1362: intermediate DO-130926-0842 signed-document GET returns `{url:null,uploadedAt:null}`; final DO-130926-3223 returns its own signed URL and timestamp, and fetching that URL succeeds with nonempty `image/png` content. Signed URLs and access tokens are not copied into this record. SO-number resolution still returns the exact order UUID. Both retired warehouse routes return 410 `warehouse_pick_retired`; allocation JSON and order identity/status/stage/warehouse/delivered_at/do_number remain identical before and after.

Authenticated browser acceptance: intermediate DO header/history/Evidence remains Arrived, its Warehouse is Carres Klang Warehouse, and Evidence has neither a borrowed Signed Delivery Order nor customer signed-paper attach/review demands. The SO-scoped Register lists two documents: final DO Delivered with its signed-file button and its truthful missing-photo fact; intermediate DO Arrived / JB transit warehouse with an empty Driver submission cell. The primary queues count Upload delivery photo 1, Upload signed Delivery Order 0, Check delivery proof 0 and Record delivery result 0 — only the final customer document owes the missing photo. Existing-photo preservation and sibling timestamp isolation are covered by automated positive/negative tests; no new production evidence was uploaded merely to manufacture that state.

No business record, Unit, status, stock total or signature was changed in this acceptance. The remaining dealer POS staff-PIN login requirement belongs to Card 18, and the unperformed exact-width/full scenario walks remain explicitly named in MASTER rather than promoted by this Card’s closure.
