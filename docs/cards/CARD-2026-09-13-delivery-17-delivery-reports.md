# DELIVERY — CARD 17 · Central Delivery reports

> Module **DELIVERY** · Card **17** · authored 2026-09-13 under the BUILD/DELIVERY takeover of the
> owner-approved Delivery Blueprint (PR #1255, #1256). Steps use checkbox syntax for tracking.

**Goal:** Build `Reports → Delivery` with the §12 catalogue, every measure naming its source fact, date basis and coverage, drilling to its records, and withholding rates with too few records.

**Authority:** `docs/delivery/MASTER.md` §12 · `docs/payment/MASTER.md` Reports grammar · `docs/ui/MASTER.md` Register Template. The approved MASTER decides the design; this Card adds no design of its own.

**Dependencies:** Cards 11, 13.

**Runtime readers and writers affected:** Readers: arrangements, contact records, attempts, proof reviews, handover events, partners; writers: none.

**Migrations required:** none.

**Production acceptance surface:** Production `Reports → Delivery` renders the ten listings from real rows with exclusions stated on screen and Excel export.

## Global constraints

- Reuse existing Carres components, arithmetics and write doors; no duplicate quantity, owner, duty, date, payment or stock truth.
- Every visible word comes from `docs/COPY-STANDARD.md`; dates through `fmtDate`; no em dash joins a Delivery Work sentence.
- No `New DO`, `Issue`, `Release` or `Approve` control; no new payment exception or COD door; no Delivery-local roster; no Operations Superuser fallback.
- Loading, error, empty and no-results states, keyboard and focus, responsive behaviour, permissions and proxy-recording boundaries are tested.
- A Card is complete only after PR merge, exact-SHA deployment and authenticated production verification with the resulting records re-read.

## Tasks

- [x] Report reads on the shared arithmetics; the ten listings — `delivery-report.ts` (the ten listing arithmetics over `buildDoRegisterRow` rows and `buildDeliveryMonitorCards` cards; `rateWord` withholds below 5; `Not available` for an absent read) · `OperationDeliveryReport.tsx` mounted as `?tab=delivery-report` with the Delivery destination header · the arrangements read now carries `cannotDeliver` (0417 events) for the partner measure
- [x] Export; every row a door — one Excel sheet per listing from the same reads; rows open the Delivery Order object, the Monitor row (`open=`), the Monitor day (`date=`), the Monitor partner filter (`logistics=`) or the Inbound arrival (`arrival-source`)
- [x] Tests, typecheck, design guard — `delivery-report.test.ts` (14) + `OperationDeliveryReport.test.tsx` (6) green · api test for the `cannotDeliver` read · tsc ×3 clean · `pnpm --filter web lint` clean
- [x] PR → merge → deploy → authenticated production verification — PR #1277 squash-merged `a2bc7d53232c87b13e6b6bd488b3ca5d3d2243c1` after a merge of the Card 15/16 main into the branch and a green full run; deploy converged (`erp` `__carres_deploy.json` `builtAt 2026-09-13T13:43:41Z` + Worker `/health` both report that SHA); walked as operation@carres.com at `/operation?tab=delivery-report` (`Reports · Delivery — Carres`, ModuleHeader `REPORTS · DELIVERY` · `Delivery` · `Export Excel` · `Month Sep 2026`). All ten listings drew from the live rows with their source and exclusion sentences: `Delivery Commitment Performance` 1 delivery — DO-130926-3223 `Requested Fri, 18 Sep · Delivered Sun, 13 Sep · Kept the requested date`, `Rate withheld · fewer than 5 records`, the leg-1 warehouse trip excluded as stated · `First Delivery Success` 1 first visit — DO-130926-3223 `Sun, 13 Sep · AL · Delivered on the first visit` · `Failed Delivery Analysis` `No delivery failed this month.` · `Logistics Partner Performance` AL `1 trip · 1 delivered · 0 failed · Cannot Deliver 0`, NETS the same, both rates withheld · `Warehouse Performance` 3 handovers — DO-130926-3223 `Ready Sun, 13 Sep · Handed over Sun, 13 Sep · Received by logistics Sun, 13 Sep`, DO-130926-0842, DO-170826-5050 (`Ready · not handed over`) · `Delivery Proof Control` 1 `Not reviewed yet` — DO-130926-3223 `Delivered Sun, 13 Sep · Delivery photo missing` · `Schedule and Capacity` `6 deliveries confirmed across 4 days · busiest 2026-09-15 with 3` (Fri 4 Sep NETS 1 · Tue 15 Sep NETS 3 booked · Thu 17 Sep AL 1 · Wed 30 Sep NETS 1) · `Customer Contact Performance` `5 contacts · 5 confirmed · 4 recorded on behalf of a partner` + today's fact `Contact deadline passed today 70` · `Return-to-Warehouse Control` `No goods came back this month.` · `Exception Ageing` 1 over 7 days — SO-1327 `Overdue since Thu, 27 Aug · HOUZS 17 days`. Every row is a door (`/operation/delivery-orders/{id}`, Monitor `open=`/`date=`/`logistics=`); `Export Excel` enabled (the download itself was not triggered from the walk). 🟡 `Logistics Partner Performance` counts NETS's leg-1 arrival at the JB transit warehouse as `1 delivered` — the partner listing reads every attempt result by partner and does not apply the last-leg exclusion the Commitment and First Delivery listings state; the Card 14 intermediate-leg `Delivered` wording note, recorded in the Delivery MASTER §16.
