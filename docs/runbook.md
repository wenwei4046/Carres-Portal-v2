# Phase 9 Go-Live Runbook

> Cutover playbook for promoting staging Supabase (`kfprgpjpaffedghytstl`) to production, deploying Cloudflare Workers + Pages, and onboarding Day 1 alpha users for all 9 roles.
>
> Decisions locked 2026-05-09 with Loo:
> - **Q1** Supabase strategy: **B (promote staging)** — cleanup demo + test data, keep RLS / triggers / RPCs / migrations untouched
> - **Q2** Domain: **Cloudflare *.pages.dev URL on Day 1**, custom domain deferred
> - **Q3** Secret rotation: **Day 1 cutover** — new service_role + JWT secret
> - **Q4** Alpha users: **Day 1 全 9 角色** (with `principal@carres.com / 111` kept as known-risk per §17)
> - **Demo master data** strategy: **Clean slate** — wipe demo dealers/suppliers/etc., reseed with real Carres data via `scripts/production-master-data.sql`

---

## ✅ Pre-flight (already done)

- [x] All 9 phase tags pushed (`phase-0-complete` through `phase-8-complete`)
- [x] Build passes (`pnpm --filter web build` clean as of commit `a9beddb`)
- [x] Tests pass (1052 unit / 35 E2E green as of `4f63592`)
- [x] No hardcoded localhost references in shipped code
- [x] `scripts/phase-9-cleanup.sql` written (deletes test + demo data)
- [x] `scripts/production-master-data.sql.template` written (Loo fills offline)
- [x] Wrangler config + `.dev.vars.example` documented

---

## Day 1 — Cutover (estimated 2-4 hours)

### Step 1 — Backup the staging Supabase project

Loo:
1. Open Supabase Dashboard → project `kfprgpjpaffedghytstl` → **Database** → **Backups**
2. Click **"Create backup now"** (Pro tier required — upgrade if not already)
3. Note the timestamp + backup ID. **Keep the dashboard tab open until end of Day 1.** This is your safety net for the next 24 hours.

If anything blows up Day 1, the rollback is "restore from this backup". You'll lose Day 1 real activity but be back to clean staging state.

---

### Step 2 — Apply `phase-9-cleanup.sql`

⚠️ **DESTRUCTIVE — REQUIRES Loo's verbal "go ahead" in current conversation per CLAUDE.md §14 #1.**

Once Loo confirms:
```bash
supabase db query --linked --file scripts/phase-9-cleanup.sql
```

The script wraps everything in a `BEGIN...COMMIT` transaction with a sanity-check `DO $$ ... $$` at the end. If anything is left behind, it ROLLBACKs.

**Expected output** (counts of zero on the sanity blocks; transaction commits successfully).

---

### Step 3 — Apply `production-master-data.sql`

**Loo first**: copy the `.template` file to `scripts/production-master-data.sql` (drop `.template`), then **fill in every `[FILL_IN_*]` placeholder** with real Carres data.

Day 1 minimum:
- 1 real dealer + 1 outlet + 1 salesperson
- 1 supplier
- 1 delivery_partner (3PL)
- 1 warehouse
- 1 showroom dealer

Add more later via the PrincipalAccounts UI. Don't block go-live trying to type in the full network.

Then:
```bash
supabase db query --linked --file scripts/production-master-data.sql
```

---

### Step 4 — Rotate Supabase secrets

Loo:
1. Supabase Dashboard → project → **Settings** → **API**
2. Click **"Reset service_role key"** → confirm. The old key is now invalidated.
3. Copy the new `service_role` key. **Don't paste into chat.** Save in your password manager.
4. Click **"Reset JWT secret"** if available (or use legacy ES256 — let Claude verify which one this project uses)
5. Note the new JWT secret too.

These two secrets get pushed to Workers in Step 5.

---

### Step 5 — Configure + deploy Cloudflare Workers (API)

Wrangler config: `apps/api/wrangler.toml` currently has no `[env.production]` block. Loo OR Claude adds it:

```toml
[env.production]
name = "carres-portal-v2-api"

[[env.production.routes]]
# Optional — leave empty for now to use the default *.workers.dev URL.
# pattern = "api.your-domain.com/*"
# zone_id = "..."

[env.production.observability]
enabled = true
```

Then secrets:
```bash
cd apps/api
wrangler secret put SUPABASE_URL --env production
wrangler secret put SUPABASE_ANON_KEY --env production
wrangler secret put SUPABASE_SERVICE_ROLE_KEY --env production
wrangler secret put SUPABASE_JWT_SECRET --env production
```

Deploy:
```bash
wrangler deploy --env production
```

Wrangler prints the deployed URL, e.g.:
```
https://carres-portal-v2-api.your-subdomain.workers.dev
```

**Save this URL — Pages env var depends on it.**

---

### Step 6 — Deploy Cloudflare Pages (Web)

In Cloudflare Dashboard:
1. **Pages** → **"Create project"** → **"Connect to Git"** → select `wenwei4046/Carres-Portal-v2`
2. Build configuration:
   - Production branch: `main`
   - Framework preset: **None** (custom)
   - Build command: `pnpm install && pnpm --filter web build`
   - Build output directory: `apps/web/dist`
   - Root directory: `/`
3. Environment variables (Production scope):
   ```
   NODE_VERSION         = 20
   VITE_SUPABASE_URL    = https://kfprgpjpaffedghytstl.supabase.co
   VITE_SUPABASE_ANON_KEY = <copy from staging Supabase API settings>
   VITE_API_BASE_URL    = https://carres-portal-v2-api.your-subdomain.workers.dev   ← from Step 5
   ```
4. **Save and Deploy**.

Watch the build log. First deploy usually takes 3-5 minutes (cold pnpm install). Subsequent deploys: ~1 minute.

After deploy: CF assigns a URL like `https://carres-portal-v2.pages.dev`. Note it.

---

### Step 7 — Smoke-test the prod URL

Loo opens the `*.pages.dev` URL in a fresh browser (incognito):
- [ ] Page loads, no white screen
- [ ] DevTools → Console: no red errors
- [ ] DevTools → Network: no 5xx requests, all 2xx/3xx
- [ ] Login as `principal@carres.com / 111` (the surviving demo account)
- [ ] Lands on principal dashboard, shows empty Approvals queue + empty Dealers list (because cleanup wiped everything)
- [ ] No console errors

If any step fails → STOP and tell Claude the exact error. Don't proceed to user creation until smoke-test is green.

---

### Step 8 — Create Day 1 alpha users (all 9 roles)

Loo, while logged in as principal:

For each role below, go to **Principal → Accounts → "+ Create user"** and fill the form:

| Role | Email | Display name | Linked entity |
|---|---|---|---|
| `principal` | (already exists) | — | — |
| `finance` | [Loo's finance email] | [name] | none |
| `logistics` | [Loo's logistics email] | [name] | none |
| `bd` | [Loo's BD email] | [name] | none |
| `dealer` | [first dealer's email] | [name] | dealer dropdown → first real dealer |
| `salesperson` | [salesperson email] | [name] | dealer + outlet dropdowns |
| `supplier` | [supplier contact email] | [name] | supplier dropdown |
| `partner` | [partner contact email] | [name] | partner dropdown |
| `showroom` | [showroom email] | [name] | dealer dropdown → showroom dealer |

Each user gets an auto-generated password shown ONCE on the success modal. Copy each immediately and send via secure channel (signal/whatsapp/whatever).

---

### Step 9 — Manual smoke per role

Loo asks each alpha user to log in and verify their landing page works. Specifically:

- **dealer**: Dashboard loads, "+ New Order" button visible, Products catalog browseable
- **salesperson**: Dashboard scoped to their outlet only
- **finance**: Dashboard shows AR aging widget, can drill into Invoices page
- **logistics**: Kanban renders all 6 stage columns (empty)
- **supplier**: Sees Coverage callout matching their `cat_covered`
- **partner**: Pickups page loads (empty)
- **bd**: Inquiries pipeline loads (empty)
- **showroom**: Dealer-style dashboard, sees "channel: showroom" badge
- **principal**: Already verified in Step 7

Any 500, blank page, or RLS leak (seeing OTHER tenant's data) → Loo files in conversation, Claude root-causes, hot-fix via PR.

---

### Step 10 — 24h standby monitoring

Loo keeps a tab open on:
1. **Cloudflare Dashboard → Workers → carres-portal-v2-api → Logs** (live tail). Watch for 5xx spikes.
2. **Cloudflare Dashboard → Pages → carres-portal-v2 → Functions → Real-time logs**.
3. **Supabase Dashboard → Logs Explorer** with filter `severity = ERROR`.

If any sustained error rate >1% over 5 min → Pause. Decide whether to rollback (Step 11) or hot-fix.

---

## Day 2-4 — Stabilization

### Day 2: Real-order dry run

Loo or finance team places **one real test order** through the full lifecycle:
- Dealer creates order
- Logistics confirms + dispatches
- Partner uploads POD
- Finance receives payment + issues invoice

All steps should land in DB cleanly with the right status transitions. If any step fails → fix before opening to wider alpha.

### Day 3-4: Hotfix loop

Triage any alpha user reports. Each fix is:
1. Branch from `main`
2. Fix + add regression test
3. PR → merge → CF Pages auto-deploys
4. Notify alpha user

---

## Day 5+ — Old system retirement

### Archive HV Portal (the old Carres Portal)
- [ ] Old Cloudflare Pages deployment: delete
- [ ] Old Cloudflare Workers: delete
- [ ] Old GitHub repo: settings → Archive (read-only mode)
- [ ] Old Supabase project: leave running for 2 weeks, then archive (settings → Pause project)

### Custom domain (optional, when Loo decides)
- Pick domain (e.g. `portal.carres.com.my`)
- DNS: add CNAME pointing to `carres-portal-v2.pages.dev`
- TTL: 300 seconds during cutover, raise to 3600 after stable
- Cloudflare Pages → project → Custom domains → Add → verify
- Update `VITE_API_BASE_URL` env var to match the API's custom domain too (if also rebinding API)

---

## 🧯 Rollback Procedure

### Scenario A: Cleanup or master data SQL broke something

Within minutes:
- Loo opens Supabase Dashboard → Backups → restore from the snapshot taken in Step 1
- Reverts to clean staging state (loses any Day 1 real activity since cleanup)
- Communicate with alpha users that Day 1 needs to restart

### Scenario B: Worker or Pages deploy is broken

- Cloudflare Dashboard → Workers (or Pages) → Deployments → "Promote" the previous deployment
- DB is untouched, no data loss
- Investigate the broken deploy offline, hot-fix, redeploy

### Scenario C: Auth / login broken (rare, usually JWT secret mismatch)

- Check Workers env: `wrangler secret list --env production`
- Check Pages env: dashboard → project → Environment variables
- Confirm `SUPABASE_JWT_SECRET` matches Supabase Dashboard → API → JWT settings
- If mismatch: `wrangler secret put SUPABASE_JWT_SECRET --env production`, redeploy

---

## Known Risks (signed off by Loo)

| Risk | Sign-off | Mitigation |
|---|---|---|
| `principal@carres.com` keeps password `'111'` in prod | Loo, 2026-05-09 | Documented in §17 known-risk; if attempted brute-force detected, Loo rotates immediately via `update auth.users set encrypted_password = crypt('<new>', gen_salt('bf')) where email='principal@carres.com'` |
| Demo product catalog (SKUs / models / fabrics) NOT wiped | Loo, 2026-05-09 | Carres-branded SKUs assumed real; if any prove fictional, run uncomment-block at bottom of `phase-9-cleanup.sql` |
| Workers cold-start latency on first request after idle period | Master plan §8 risk register | Phase 1 baseline confirmed acceptable; observe Day 1 + 2 |

---

## Post-Go-Live Cleanup (Week 2)

- [ ] Drop `*.pages.dev` deployment if Loo binds custom domain
- [ ] Remove `principal@carres.com` demo account once Loo's real `chairman@carres.com.my` (or similar) is created and tested
- [ ] Rotate `principal@carres.com` password to a strong one (eliminates the §17 known-risk)
- [ ] Old Carres-Portal repo → archived
- [ ] Old Supabase project → paused
- [ ] Update §17 with actual Phase 9 timeline + lessons learned (`docs/phase-9-reflection.md`)

---

> **Done state**: 9 alpha users using prod, one real order traced through full lifecycle, 0 critical bugs in 24h, old system retired, monitoring dashboard quiet.
