# Staff PIN Login — dealer/showroom outlet picker + 6-digit PIN staff identity (2026-07-18)

Loo's spec (approved in-conversation 2026-07-18, all four decisions locked):

1. **Email+password is always gate #1** (the store credential). After it: outlet picker
   (only when the dealer has >1 outlet) → staff PIN screen (tap your name/color tile,
   enter 6-digit PIN). PIN identifies the person; every order is attributed to them.
2. **Three tiers** — `principal` (dealer owner; all outlets; creates manager/salesperson/
   co-owner principal), `manager` (outlet-bound; sees the whole outlet's orders; creates
   salespersons for OWN outlet only; cannot create managers), `salesperson` (sees own
   orders only; no user management).
3. **Showroom** = same flow, same store ("Carres KL Showroom" is already a dealers row);
   its top tier is **manager** (no dealer-principal — Carres principal provisions/resets
   its manager from the principal portal).
4. Decisions: migration approved ✅ · PIN = workflow/accountability not an anti-hacker
   boundary ✅ · **forced activation** (next login runs a one-time setup wizard) ✅ ·
   manager/principal MAY attribute an order to another salesperson (代记) ✅; salesperson
   tier is always self.

Design constraints (non-negotiable):
- `create_order`, `orders` schema, existing RLS policies, the auth hook (0004) and
  `apps/api/src/middleware/auth.ts` are **UNTOUCHED**. Orders-route edits are additive.
- Principal on-behalf POS (PrincipalApp mounts `DealerPos` directly with the in-flow
  dealer pick) must keep working with **no staff gate** — internal roles are exempt.
- Don't touch `OrderDetailDrawer.tsx` (pre-golive guardrail).
- No new npm deps (jose already present). No secrets in code (STAFF_SESSION_SECRET is a
  Worker secret; `.dev.vars` local only).

## Data model — migration `0233_staff_pin_login.sql`
(0230 already applied by a parallel session; 0231 claimed by the order-add-product
initiative per memory — re-verify the prod tail again right before applying.)

- `salespersons` + `staff_role` text CHECK principal|manager|salesperson DEFAULT
  'salesperson' + `color` text (STAFF_COLORS key) + `active` boolean DEFAULT true.
  Zero data changes; existing 6 rows become salesperson-tier by default.
- NEW `salesperson_pins` (salesperson_id PK → salespersons CASCADE, pin_hash bcrypt,
  failed_attempts, locked_until, updated_at). RLS enabled, **zero policies** (deny-all;
  service_role bypasses). PIN hash never leaves Postgres.
- `staff_verify_pin(uuid,text) → jsonb` (status ok|bad_pin|locked|no_pin + remaining/
  locked_until; 5 fails → 15-min lock; row-locked; expired lock resets the counter) and
  `staff_set_pin(uuid,text)` (6-digit regex; bcrypt `extensions.crypt`/`gen_salt('bf',10)`
  — pgcrypto lives in the `extensions` schema). Both SECURITY DEFINER, EXECUTE revoked
  from public/authenticated/anon, granted to service_role only, has_function_privilege
  asserted in-migration (0188 lesson).

## Staff token (the per-request staff identity)

- Minted by Hono after PIN verify (or reauth/self-token). jose HS256, secret env
  `STAFF_SESSION_SECRET`, expiry 12h. Payload: `{ sid: uuid|null, did: uuid,
  oid: uuid|null, tier: 'principal'|'manager'|'salesperson' }` (+ std exp/iat).
- Client sends it as header `X-Staff-Token` on every API call. Server verifies signature
  + `did === auth.dealerId`, else treats as absent.
- `sid` is null only for reauth-minted owner-mode tokens (before the owner has a staff row).

## API surface (T2) — new `apps/api/src/routes/staff.ts` + surgical `orders.ts` edits

`activated(dealerId)` := EXISTS row in salesperson_pins joined to that dealer
(adminClient; orders.ts is already on the adminClient allowlist).

- `GET /api/staff` → `{ staff: StaffDto[], activated, selfStaffId, storeKind }`.
  userClient list (RLS scopes dealer; internal principal may pass `?dealerId=`);
  `hasPin` via adminClient IN-query on pins (boolean only); `selfStaffId` = row with
  user_id === auth.id; `storeKind` = 'showroom' if any linked app_users row of that
  dealer has role showroom else 'dealer'.
- `POST /api/staff/verify-pin` {salespersonId, pin} → validate row ∈ caller dealer +
  active via userClient, then adminClient rpc staff_verify_pin → ok: `{ token, staff }`;
  bad_pin → 401 {error:'bad_pin', remaining}; locked → 423 {error:'pin_locked',
  lockedUntil}; no_pin → 409.
- `POST /api/staff/reauth` {password} → server-side password grant against
  `${SUPABASE_URL}/auth/v1/token?grant_type=password` with auth.email → ok: owner-mode
  token (dealer→tier principal, showroom→tier manager, sid=null|linked row) → {token}.
  Used by the setup wizard + "Forgot PIN".
- `POST /api/staff/self-token` — role salesperson only: find row by user_id, mint token
  from its staff_role/outlet; 409 if unlinked.
- `POST /api/staff` create {name, staffRole, outletId?, color?, phone?, pin?} — tier
  rules: principal-tier → any tier (but 'principal' creation blocked for storeKind
  showroom); manager-tier → salesperson only, outlet forced to token.oid; salesperson →
  403. Internal principal JWT with ?dealerId= → treated as principal-tier (showroom cap
  applies). Insert via userClient (RLS covers dealer write); pin via staff_set_pin.
- `PATCH /api/staff/:id` {name?, color?, outletId?, staffRole?, active?} — principal-tier:
  all fields; manager-tier: name/color/active on own-outlet salespersons only;
  tier/outlet changes principal-only. Deactivation replaces the legacy hard DELETE
  (orders.salesperson_id FK is NO ACTION — hard delete of a referenced row errors; leave
  the old /api/salespersons routes untouched for compat but the new UI stops using DELETE).
- `POST /api/staff/:id/pin` {pin} — principal: anyone in dealer; manager: own-outlet
  salespersons + self; salesperson: self only.

**orders.ts enforcement** (only for auth.role ∈ dealer|showroom|salesperson; internal
roles exempt; activated==false && no token → EXACTLY today's behavior):
- activated && no valid token → 403 `{error:'staff_session_required'}` on GET /api/orders,
  GET /api/orders/:id, POST /api/orders (+ dealer-reachable order mutations if surgical).
- tier salesperson → GET list forced `.eq('salesperson_id', sid)`; detail 404 unless
  row.salesperson_id===sid; POST overwrites salespersonId=sid and outletId=token.oid??body.
- tier manager → GET list forced `.or(outlet_id.eq.<oid>,outlet_id.is.null)` (legacy/
  AutoCount rows have null outlet); detail same predicate; POST: salespersonId must be an
  active staff of the dealer whose outlet is token.oid or null; outletId forced token.oid.
- tier principal → no narrowing; POST salespersonId must belong to the dealer (validated
  when a token is present; dormant path byte-identical).
- Salesperson-role JWT with a token behaves per its row tier. Env: add
  `STAFF_SESSION_SECRET` to Bindings + test env.

## Web surface (T3)

- `lib/staff.ts` — Zustand + sessionStorage: {token, staff{sid,tier,name,color,outletId},
  sessionOutletId}; the central API fetcher attaches X-Staff-Token when present; on a
  403 staff_session_required response clear token (forces re-PIN).
- `StaffGate` wraps DealerApp's routes (dealer/showroom/salesperson roles only):
  - role salesperson → auto self-token; 409 → non-blocking notice, today's behavior.
  - !activated → **forced SetupWizard**: password confirm (reauth) → create own identity
    (dealer→principal, showroom→manager; name/color/6-digit PIN twice) → optional step:
    set tier+PIN for existing salesperson rows (skippable) → done → PIN screen.
  - activated → outlet picker (only if >1 outlet; else auto) → `PinScreen`: staff tiles
    (color avatar initials + name + tier label; active only; PIN-less tiles disabled
    "未设 PIN"; outlet-filtered: outlet match OR outlet null OR principal tier) → keypad
    (REUSE the PinGate keypad/CSS `.pin-gate*` from OrderStatusPage — extract a shared
    subcomponent; keep OrderStatusPage tests green) → verify → store token → app.
  - "Forgot PIN?" on PinScreen → password reauth → owner-mode token (lands in Settings
    staff section to reset PINs).
  - Top bar (DealerPos header + DealerChrome header): current-staff chip (avatar color +
    name) + "换人 Switch" → clear token → PinScreen. Session outlet chip too.
- `CustomerStep`: with staff session — outlet select prefilled+locked to sessionOutletId
  (locked for manager/salesperson; principal free); salesperson select: salesperson tier
  locked to self; manager/principal pick among active staff of the outlet (代记), default
  self (owner-mode sid=null → must pick). Dormant stores: unchanged.
- `DealerSettings` staff section: tier badges, color picker (STAFF_COLORS dots),
  Set/Reset PIN modal, Add staff modal (tier options per current tier + storeKind),
  deactivate toggle replaces delete. Hidden entirely for salesperson tier; manager sees
  own outlet only. Outlets section: principal tier only.
- `PrincipalAccounts`: per dealer/showroom row → "Staff" drawer (GET /api/staff?dealerId=)
  list/create/reset-PIN; tier options respect storeKind (showroom caps at manager).
- `OrderStatusPage`: staff token present → skip the legacy "111111" PinGate (identity
  already proven); salesperson tier hides the per-person compare chips (server scopes
  data anyway). No token (e.g. principal on-behalf) → legacy gate unchanged.
- UI: PIN/outlet/wizard screens follow the POS look (pos-prototype.css tokens, like the
  existing PinGate); Settings/principal surfaces follow UI-KIT v4. Run
  `pnpm --filter @carres/web lint` + `run check:v4`.

## Acceptance (from the approved plan)

1. Store with staff+PINs: login → (outlet) → tap person → PIN → top bar shows them;
   salesperson sees only own orders; manager sees outlet; orders stamp the PIN identity.
2. Not-yet-set-up store: next login is forced through the setup wizard once, then #1.
3. Showroom: same, capped at manager; Loo provisions/resets from principal portal.
4. Principal on-behalf POS untouched; AutoCount/legacy orders (null outlet) stay visible
   to manager+; existing test suites stay green; `create_order` diff = zero lines.

## Test expectations

- shared: staff schema unit tests (tier enum, pin regex, token payload, colors).
- api: verify-pin ok/bad/locked/no_pin; reauth ok/bad; self-token linked/unlinked; create
  tier matrix (manager→manager 403, cross-outlet 403, showroom principal 403); set-pin
  scopes; orders GET forced filters per tier; POST salespersonId overwrite; 403 when
  activated w/o token; internal exempt; dormant byte-identical.
- web: StaffGate branch states; PinScreen verify + lockout + disabled tiles; wizard happy
  path; CustomerStep locking; Settings tier gating; OrderStatusPage gate switch.
