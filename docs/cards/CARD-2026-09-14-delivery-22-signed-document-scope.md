# DELIVERY — CARD 22 · A signed document belongs to its own DO

BUILD/DELIVERY convergence · 2026-09-14.

Authority: Delivery MASTER §6.1 binds proof to the event/document it proves; Card 14 distinguishes journey legs; Card 20 owns the Arrived vocabulary. This Card adds no status, writer or business word.

Measured on SO-1362: the intermediate DO-130926-0842 displays the final DO-130926-3223 signed file. The signed-document GET endpoint reads orders.do_file_path without checking orders.do_number. The register, Monitor and DO object make the same assumption.

Use one shared read projection: a document-bound evidence file belongs only to its recorded DO; the legacy order mirror belongs only to orders.do_number. Pick the newest applicable file. A different or unknown document number supplies no file. The signed-url endpoint and displayed proof facts must agree. Keep existing bound files visible and never borrow a sibling’s signature or proof timestamp.

- [x] Shared projection and positive/negative controls
- [x] Signed-document API, register, Monitor and DO object use the same projection
- [x] Intermediate arrival shows no customer signed-paper absence/demand (Card 20 remains the status owner)
- [ ] Green CI, merge, exact-SHA deployment and authenticated SO-1362 proof re-read

No migration, no new file upload, no status/stock/Unit write. Reuse the existing labeled Journey fixture.


Deployment reliability: the preceding production run for `50680e5e` failed when the Purchasing calendar test’s module-level TODAY was captured before MYT midnight and the page rendered after midnight. Freeze Date alone to the fixture instant in that test suite; timers remain real. The 126-test suite passes with a fixed clock. No Purchasing runtime logic changes.

Local validation: shared proof projection 10 tests, signed-document API 36 tests, and seven web suites 359 tests passed (including the 126-test fixed-clock Purchasing suite). Workspace typecheck and lint passed. Full CI and production acceptance remain pending.

Authenticated acceptance of the preceding 9dd3945b deployment also found that Register’s Driver submission cell and filter still demanded customer proof from intermediate arrivals. Apply the same intermediate-leg rule to the cell, search/export and filter; retain recorded photos. The page regression covers both empty and recorded-photo intermediate documents.
