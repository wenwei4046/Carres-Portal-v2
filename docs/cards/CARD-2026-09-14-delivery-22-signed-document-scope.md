# DELIVERY — CARD 22 · A signed document belongs to its own DO

BUILD/DELIVERY convergence · 2026-09-14.

Authority: Delivery MASTER §6.1 binds proof to the event/document it proves; Card 14 distinguishes journey legs; Card 20 owns the Arrived vocabulary. This Card adds no status, writer or business word.

Measured on SO-1362: the intermediate DO-130926-0842 displays the final DO-130926-3223 signed file. The signed-document GET endpoint reads orders.do_file_path without checking orders.do_number. The register, Monitor and DO object make the same assumption.

Use one shared read projection: a document-bound evidence file belongs only to its recorded DO; the legacy order mirror belongs only to orders.do_number. Pick the newest applicable file. A different or unknown document number supplies no file. The signed-url endpoint and displayed proof facts must agree. Keep existing bound files visible and never borrow a sibling’s signature or proof timestamp.

- [ ] Shared projection and positive/negative controls
- [ ] Signed-document API, register, Monitor and DO object use the same projection
- [ ] Intermediate arrival shows no customer signed-paper absence/demand (Card 20 remains the status owner)
- [ ] Green CI, merge, exact-SHA deployment and authenticated SO-1362 proof re-read

No migration, no new file upload, no status/stock/Unit write. Reuse the existing labeled Journey fixture.
