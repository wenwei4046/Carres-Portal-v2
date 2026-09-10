# Delivery Controlled Convergence Implementation Plan

> Execution dependency: ERP Master Page Control authority commit `34630b18a91a409adfbd152cfecbc175d33ea4b4` and audit proposal commit `744193d99da8ee82604a1f68a217cbfb52c6203c` are not ancestors of `origin/main` at the starting SHA `cfc334f194781468fc35dc333603a9f6af916c69`. This build depends on those separately integrated authority commits and must not duplicate their documentation changes.

**Goal:** Let staff enter the exact Delivery scope or Delivery Order from Work, carry the existing governed handover and result actions on that object, and keep the Delivery workspace usable below 1280px without creating another owner or writer.

**Boundaries:** Delivery writes only arrangements, Delivery Orders, handover events, delivery attempts and delivery evidence. Sales Order, Stock, Purchasing/Receiving and Payments facts remain read-only links. My Work/Team Work remains the only complete queue.

## Task 1: Exact Work doors

- Add behavior tests in `apps/web/src/pages/operation/OperationWork.test.tsx` for Delivery arrangement actions and DO-backed result actions.
- Extend the composed work row with the existing active DO number.
- Route arrangement actions to `/operation/delivery/edit/:orderId` and DO-backed execution actions to `/operation/delivery-orders/:doNumber`; retain actions owned by other modules on their existing governed object.
- Deep-link delivery-photo and loan-collection Work rows to the exact existing Sales Order drawer writer at `/operation/old-orders?order=:orderId`; the photo remains Delivery evidence and loan custody remains Stock-owned. The read-only Order Route stays available from Delivery surfaces, but a Work row must never land on a projection that cannot complete its named action.
- Keep the Delivery register, Delivery Orders register, arrangement and DO object linked to the exact source Sales Order and its `?route=1` Order Route projection without copying either owner's facts or writers.
- Run the focused Work tests and typecheck the affected package.

## Task 2: Delivery Order work surface

- Add failing object-page tests proving the next warehouse/logistics handover action is reachable from the DO object and completed trips expose no further handover writer.
- Mount the existing `WarehouseHandoverBlock`, which already uses the single governed `delivery_handover_record` writer and existing proof upload door.
- Add failing tests for a top-level `Record Delivery Result` door on an eligible DO and no result action on cancelled/resulted documents.
- Reuse the existing governed success writer and `delivery_attempt_record` endpoint; do not add a second attempt or stock writer.
- Keep the result door off split Delivery Orders: both existing result writers are order-scoped and cannot safely identify a DO/trip scope yet. Record this exact API/RPC seam rather than touching another trip's Units.
- Refresh the DO detail after successful writes and retain its append-only History.

## Task 3: Delivery register reachability and calendar

- Add failing tests that DO work without an issued document opens the exact Delivery arrangement and that the near-term rail excludes Sunday.
- Keep completed and active DO work on the exact Delivery Order object; fall back to the exact Delivery arrangement only before a DO exists.
- Keep counts derived from the same visible row arithmetic.

## Task 4: Narrow-width behavior

- Add a component-level behavior test for the `Show filters` control.
- Below 1280px hide the local Delivery rail behind that control while preserving grid horizontal scroll and all toolbar actions.
- Verify the shared shell's existing menu control remains reachable; do not add local chrome.

## Task 5: Verification and handoff

- Run focused tests after every red/green cycle, then the complete Web suite, relevant API/shared suites, typecheck and design/copy guards.
- Inspect the final diff against both authority commits and confirm no dictionary or UI MASTER duplication.
- Perform authenticated desktop and sub-1280 production-equivalent browser walks against governed data without writing sample records.
- Record commit SHA, PR dependency, and any unverified real-role Partner seam. Do not claim merged/deployed/production complete before ancestry, deploy SHA and real-role proof exist.
