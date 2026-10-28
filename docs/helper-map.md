# Carres Helper Map

This page lists the house helpers you meet most often in this repo. Each entry says what the helper does, where it lives, its shape, a Python version of the same idea, one real use, and the test that covers it. Every file:line link was checked against `main` at `6f2f63c08` on 1 Oct 2026. A "used in N files" count is the number of non-test files that contain the name, from `git grep -l -E '\bname\b' -- <app> ':!*.test.ts' ':!*.test.tsx'`.

To find every use of a helper in VS Code, put the cursor on its name and press Shift+F12. To jump to where it is defined, press F12.

## One click, end to end: Import file on Card settlement

1. [kit Button](#kit-button) onClick opens the file picker, then calls the mutation.
2. [useMutation](#usemutation--invalidatequeries) runs its mutationFn.
3. [apiFetch](#apifetch) sends POST /api/finance/card-settlement/import with your login token.
4. [Hono router](#hono-router--apiroute) finds the route mounted at /finance/card-settlement.
5. [requireFinance](#requirefinance-and-requirehr-requireoperation) lets Finance and Principal through, 403 for anyone else.
6. [parseJsonBody](#parsejsonbody) checks the body against a zod schema, 422 if it's wrong.
7. [userClient().rpc](#userclientrpc) calls the SQL function as you, so RLS applies.
8. [fail / mapPgError](#fail--mappgerror) turns a SQL error code into the right HTTP status.
9. [invalidateQueries](#usemutation--invalidatequeries) marks the cached list as stale.
10. [useQuery](#usequery--qk) fetches the list again, and [DataGrid](#datagrid--datagridcolumn) redraws it with [rm](#rm-fmtmoney) and [fmtDate](#fmtdate).

## Browser (apps/web)

### apiFetch

Used in 119 files.

The one way the browser talks to our API. It adds your login token, turns the reply into JSON, and throws an `ApiError` when the status isn't 2xx.

**Where:** [apps/web/src/lib/api.ts:41](../apps/web/src/lib/api.ts#L41). `ApiError` at [:8](../apps/web/src/lib/api.ts#L8).

**Shape:**

```ts
apiFetch<T = unknown>(path: string, init?: RequestInit): Promise<T>
```

**Python:**

```python
def api_fetch(path, method="GET", json=None) -> dict:
    r = session.request(method, BASE + path, json=json,
                        headers={"Authorization": f"Bearer {token}"})
    if not r.ok:
        raise ApiError(r.status_code, r.json().get("message"))
    return r.json()
```

**Real use:** [pages/finance/card-settlement/api.ts:15](../apps/web/src/pages/finance/card-settlement/api.ts#L15) and [:28](../apps/web/src/pages/finance/card-settlement/api.ts#L28).

```ts
apiFetch<CardSettlementReview>(BASE)                  // GET
apiFetch(`${BASE}/import`, { method: "POST", body: JSON.stringify(v) })
```

**Test:** [apps/web/src/lib/api.staff.test.ts](../apps/web/src/lib/api.staff.test.ts)

### useQuery + qk

TanStack Query (library). Keys in `queries.ts`.

Reads data and keeps a cached copy under a key. Any screen asking for the same key shares that copy. `qk` is the house list of keys, so two pages never spell the same key two ways.

**Where:** [apps/web/src/lib/queries.ts:341](../apps/web/src/lib/queries.ts#L341) (`qk`). Each page's own `api.ts`.

**Shape:**

```ts
useQuery({ queryKey: readonly unknown[], queryFn: () => Promise<T> })
  → { data, isLoading, isError, refetch }
```

**Python:**

```python
cache: dict[tuple, object] = {}
def use_query(key: tuple, fetch):
    if key not in cache:
        cache[key] = fetch()
    return cache[key]
```

**Real use:** [pages/finance/card-settlement/api.ts:15](../apps/web/src/pages/finance/card-settlement/api.ts#L15), where `ROOT = ["finance", "card-settlement"]`.

```ts
useQuery({ queryKey: [...ROOT, "review"],
           queryFn: () => apiFetch<CardSettlementReview>(BASE) })
```

**Test:** Library, no house test. Page tests mock apiFetch and check the rendered rows.

### useMutation + invalidateQueries

`invalidateQueries` used in 58 files.

Does a write, then tells the cache which keys are now old. Invalidating a short key clears every longer key that starts with it, so `["finance"]` refreshes every finance screen at once.

**Where:** [pages/finance/card-settlement/api.ts:18](../apps/web/src/pages/finance/card-settlement/api.ts#L18) (the `useReviewMutation` wrapper).

**Shape:**

```ts
useMutation({ mutationFn: (vars) => Promise<T>,
              onSuccess: () => qc.invalidateQueries({ queryKey }) })
  → { mutate(vars, { onSuccess, onError }), isPending }
```

**Python:**

```python
def mutate(vars):
    result = post(vars)
    for key in list(cache):
        if key[:len(ROOT)] == ROOT:   # prefix match
            del cache[key]
    return result
```

**Real use:** [card-settlement/api.ts:20-22](../apps/web/src/pages/finance/card-settlement/api.ts#L20-L22).

```ts
useMutation({ mutationFn: fn,
  onSuccess: () => qc.invalidateQueries({ queryKey: ROOT }) })
```

**Test:** Library. [CardSettlementPage.test.tsx](../apps/web/src/pages/finance/card-settlement/CardSettlementPage.test.tsx) checks the toast after a click.

### toast (sonner)

Imported in 132 files.

The small message in the corner after an action. `toast.success` for done, `toast.error` for refused. The words come from the caller or `TOAST` in `toast-copy.ts`, never from the toast itself.

**Where:** library `sonner`. Words: [apps/web/src/lib/toast-copy.ts:15](../apps/web/src/lib/toast-copy.ts#L15). Kit wrapper `notify()` at [kit/Toast.tsx:63](../apps/web/src/components/kit/Toast.tsx#L63).

**Shape:**

```ts
toast.success(message: string) · toast.error(message: string)
```

**Python:**

```python
messages.success(request, "Row 3 matched.")   # Django
```

**Real use:** [CardSettlementPage.tsx:171](../apps/web/src/pages/finance/card-settlement/CardSettlementPage.tsx#L171) and [:174](../apps/web/src/pages/finance/card-settlement/CardSettlementPage.tsx#L174).

```ts
onSuccess: () => { toast.success(paymentId ? `Row ${row.line_no} matched.` : `Row ${row.line_no} is open again.`); ... },
onError:   (e) => toast.error(e.message),
```

**Test:** [apps/web/src/lib/toast-copy.test.ts](../apps/web/src/lib/toast-copy.test.ts)

### fmtDate

Used in 144 files.

The only way to print a date on screen. "2026-09-17" becomes "Thu, 17 Sep". Empty input gives an empty string. Pass `year: "always"` for printed documents only.

**Where:** [apps/web/src/lib/fmt-date.ts:116](../apps/web/src/lib/fmt-date.ts#L116). `fmtMonth` at [:143](../apps/web/src/lib/fmt-date.ts#L143). `appTodayIso` at [:194](../apps/web/src/lib/fmt-date.ts#L194).

**Shape:**

```ts
fmtDate(iso: string | null | undefined,
        opts?: { time?: boolean; year?: YearMode; timeOnly?: boolean }): string
```

**Python:**

```python
def fmt_date(iso: str | None) -> str:
    if not iso: return ""
    return date.fromisoformat(iso[:10]).strftime("%a, %-d %b")
```

**Real use:** [CardSettlementPage.tsx:77](../apps/web/src/pages/finance/card-settlement/CardSettlementPage.tsx#L77).

```ts
const paidOut = (d) => (d.payout_date ? fmtDate(d.payout_date) : "Not in the file");
```

**Test:** [apps/web/src/lib/fmt-date.test.ts](../apps/web/src/lib/fmt-date.test.ts)

### rm (fmtMoney)

`rm(` used in 57 files.

Prints money: 1200 becomes "RM 1,200.00". `rm` is just another name for the shared `fmtMoney`, so web and PDFs print money the same way.

**Where:** [apps/web/src/lib/format-currency.ts:14](../apps/web/src/lib/format-currency.ts#L14) → [packages/shared/src/money-format.ts:39](../packages/shared/src/money-format.ts#L39)

**Shape:**

```ts
rm(n: number): string
```

**Python:**

```python
def rm(n: float) -> str:
    return f"RM {n:,.2f}"
```

**Real use:** [CardSettlementPage.tsx:142](../apps/web/src/pages/finance/card-settlement/CardSettlementPage.tsx#L142), the Sales total / Fee / Paid into bank columns.

```ts
accessor: (d) => rm(v(d))
```

**Test:** [packages/shared/src/money-format.test.ts](../packages/shared/src/money-format.test.ts)

### num · cents · money

Finance payables helpers.

Postgres sends numbers as either a number or a string. `num` reads either and gives `null` for blank or junk. `cents` rounds to 2 places. `money` is `num` then `rm`, and prints blank for a missing figure, never RM 0.00. The AP ageing slice uses these.

**Where:** [pages/finance/payables/payables-words.ts:79](../apps/web/src/pages/finance/payables/payables-words.ts#L79). `money` at [:86](../apps/web/src/pages/finance/payables/payables-words.ts#L86). `cents` at [:92](../apps/web/src/pages/finance/payables/payables-words.ts#L92).

**Shape:**

```ts
num(v: number | string | null | undefined): number | null
cents(n: number): number
```

**Python:**

```python
def num(v) -> float | None:
    if v in (None, ""): return None
    try: n = float(v)
    except ValueError: return None
    return n if math.isfinite(n) else None

def cents(n: float) -> float:
    return round(n * 100) / 100
```

**Real use:** [payables-words.ts:87-88](../apps/web/src/pages/finance/payables/payables-words.ts#L87-L88), inside `money()`.

```ts
const n = num(v);
return n === null ? "" : rm(n);
```

**Test:** No test of its own. [Payables.test.tsx](../apps/web/src/pages/finance/payables/Payables.test.tsx) covers it through the page.

### DataGrid + DataGridColumn

`<DataGrid` used in 33 files.

The house table: sort, filter, search, group, Excel export and saved column widths, all built in. You give it rows and a list of columns. Each column says how to show one cell (`accessor`), and optionally how to sort, filter and export it.

**Where:** [components/register/DataGrid.tsx:86](../apps/web/src/components/register/DataGrid.tsx#L86) (column type), [:721](../apps/web/src/components/register/DataGrid.tsx#L721) (`DataGridInner`), [:3895](../apps/web/src/components/register/DataGrid.tsx#L3895) (export).

**Shape:**

```ts
type DataGridColumn<T> = { key: string; label: string;
  accessor: (row: T) => ReactNode; width?: number; align?: "left" | "right";
  sortFn?; exportValue?; ... }
<DataGrid rows={T[]} columns={DataGridColumn<T>[]} rowKey={(r) => string} />
```

**Python:**

```python
df = pd.DataFrame(rows)
df["Sales total"] = df["gross"].map(rm)   # one column = one accessor
df.sort_values("day_date")
```

**Real use:** [CardSettlementPage.tsx:142](../apps/web/src/pages/finance/card-settlement/CardSettlementPage.tsx#L142), rendered at [:199](../apps/web/src/pages/finance/card-settlement/CardSettlementPage.tsx#L199).

```ts
{ key: k, label: { gross: "Sales total", fee: "Fee", net: "Paid into bank" }[k], width: 130, align: "right",
  accessor: (d) => rm(v(d)), numberValue: v, exportValue: v }
```

**Test:** No test of its own. [kit/grid-powers.test.tsx](../apps/web/src/components/kit/grid-powers.test.tsx) and each page's test cover it.

### kit Button

`<Button` used in 94 files.

The only button. Pick a `variant` (primary, neutral, ghost, danger) and a `size`. `loading` shows a spinner and blocks double clicks.

**Where:** [components/kit/Button.tsx:49](../apps/web/src/components/kit/Button.tsx#L49). See also [docs/02-components.md](02-components.md).

**Shape:**

```tsx
<Button variant? size? shape?="control"|"pill" icon? loading? onClick>words</Button>
```

**Python:**

```python
st.button("Take off", type="secondary", disabled=busy)   # Streamlit
```

**Real use:** [CardSettlementPage.tsx:334](../apps/web/src/pages/finance/card-settlement/CardSettlementPage.tsx#L334). The Import file button in the click trail is at [:227](../apps/web/src/pages/finance/card-settlement/CardSettlementPage.tsx#L227).

```tsx
<Button variant="ghost" size="sm" loading={busy} onClick={() => onTakeOff(r)}>
```

**Test:** [components/kit/kit.test.tsx](../apps/web/src/components/kit/kit.test.tsx), [kit-behaviour.test.tsx](../apps/web/src/components/kit/kit-behaviour.test.tsx)

### kit Modal

`<Modal` used in 60 files.

A dialog on top of the page. The parent owns whether it is open (`open` + `onOpenChange`). The `footer` holds the buttons, with only one primary.

**Where:** [components/kit/Modal.tsx:22](../apps/web/src/components/kit/Modal.tsx#L22)

**Shape:**

```tsx
<Modal open onOpenChange={(o) => …} title description? footer? width?="wide"|"viewer">
```

**Python:**

```python
@st.dialog("Adjust match")
def adjust(row): ...
```

**Real use:** [CardSettlementPage.tsx:37](../apps/web/src/pages/finance/card-settlement/CardSettlementPage.tsx#L37), the Adjust match dialog.

```ts
import Modal from "@/components/kit/Modal";
```

**Test:** [components/kit/kit.test.tsx](../apps/web/src/components/kit/kit.test.tsx), [dialog-container.test.tsx](../apps/web/src/components/kit/dialog-container.test.tsx)

### kit StatusPill

`<StatusPill` used in 19 files.

A coloured status word. `tone` picks the colour by meaning (success, warning, danger…). The word itself comes from COPY-STANDARD.

**Where:** [components/kit/StatusPill.tsx:31](../apps/web/src/components/kit/StatusPill.tsx#L31)

**Shape:**

```tsx
<StatusPill tone={OrderActionTone} icon?>word</StatusPill>
```

**Python:**

```python
st.badge("Approved", color="green")
```

**Real use:** [CardSettlementPage.tsx:39](../apps/web/src/pages/finance/card-settlement/CardSettlementPage.tsx#L39), the day status column.

```ts
import StatusPill from "@/components/kit/StatusPill";
```

**Test:** [components/kit/kit.test.tsx](../apps/web/src/components/kit/kit.test.tsx)

## Worker (apps/api)

### Hono router + api.route

One router per route file.

A route file makes its own small router and adds URLs to it. `index.ts` mounts each router under a prefix. `AppEnv` tells TypeScript what `c.env` (secrets) and `c.var` (the logged-in user) hold.

**Where:** [apps/api/src/index.ts:309](../apps/api/src/index.ts#L309). `AppEnv` at [apps/api/src/types.ts:47](../apps/api/src/types.ts#L47).

**Shape:**

```ts
const r = new Hono<AppEnv>();
r.post(path, ...middleware, async (c) => c.json(body, status));
api.route(prefix, r);
```

**Python:**

```python
router = APIRouter()                          # FastAPI
@router.post("/import", dependencies=[Depends(require_finance)])
async def import_file(body: ImportInput): ...
app.include_router(router, prefix="/finance/card-settlement")
```

**Real use:** [routes/finance/card-settlement.ts:73](../apps/api/src/routes/finance/card-settlement.ts#L73) and [index.ts:309](../apps/api/src/index.ts#L309).

```ts
financeCardSettlementRouter.post("/import", requireFinance, async (c) => { … })
api.route("/finance/card-settlement", financeCardSettlementRouter);
```

**Test:** Each route has its own, e.g. [routes/finance/card-settlement.test.ts](../apps/api/src/routes/finance/card-settlement.test.ts)

### requireFinance (and requireHr, requireOperation…)

Used in 13 files.

A gate that runs before the handler. Finance or Principal get through. Anyone else gets a 403 and the handler never runs. The SQL function checks the role again, so the gate is not the only lock.

**Where:** [apps/api/src/lib/auth-guards.ts:71](../apps/api/src/lib/auth-guards.ts#L71). Siblings at [:43](../apps/api/src/lib/auth-guards.ts#L43), [:56](../apps/api/src/lib/auth-guards.ts#L56), [:86](../apps/api/src/lib/auth-guards.ts#L86), [:100](../apps/api/src/lib/auth-guards.ts#L100), [:123](../apps/api/src/lib/auth-guards.ts#L123).

**Shape:**

```ts
requireFinance: MiddlewareHandler<AppEnv> = async (c, next) => { …; await next(); }
```

**Python:**

```python
def require_finance(user = Depends(current_user)):
    if user.role not in ("finance", "principal"):
        raise HTTPException(403, "Finance or Principal only")
```

**Real use:** [routes/finance/card-settlement.ts:54](../apps/api/src/routes/finance/card-settlement.ts#L54).

```ts
financeCardSettlementRouter.get("/", requireFinance, async (c) => { … })
```

**Test:** No test of its own. [routes/finance/payments.test.ts](../apps/api/src/routes/finance/payments.test.ts) and [test/finance-approver-role.integration.test.ts](../apps/api/src/test/finance-approver-role.integration.test.ts) hit it.

### parseJsonBody

Used in 43 files.

Reads the request body and checks it against a zod schema. It never throws. It gives back either `{ ok: true, data }` or `{ ok: false, status: 422, body }`, so the route can return early.

**Where:** [apps/api/src/lib/route-helpers.ts:102](../apps/api/src/lib/route-helpers.ts#L102). `parseBody` (the throwing twin) at [:169](../apps/api/src/lib/route-helpers.ts#L169).

**Shape:**

```ts
parseJsonBody<S extends ZodTypeAny>(c, schema: S)
  → Promise<{ ok: true; data: z.infer<S> } | { ok: false; status: 422; body }>
```

**Python:**

```python
try:
    data = ImportInput.model_validate(await request.json())   # pydantic
except ValidationError as e:
    return JSONResponse({"message": e.errors()[0]["msg"]}, 422)
```

**Real use:** [routes/finance/card-settlement.ts:74](../apps/api/src/routes/finance/card-settlement.ts#L74).

```ts
const body = await parseJsonBody(c, importInput);
if (!body.ok) return c.json(body.body, body.status);
```

**Test:** [apps/api/src/lib/route-helpers.test.ts](../apps/api/src/lib/route-helpers.test.ts)

### userClient(...).rpc

Used in 123 files.

A Supabase connection that acts as the logged-in person, using their token. RLS and the role checks inside SQL all apply. `.rpc(name, args)` calls a SQL function. `adminClient` skips RLS and is only for cron and admin routes.

**Where:** [apps/api/src/lib/supabase.ts:4](../apps/api/src/lib/supabase.ts#L4). `adminClient` at [:14](../apps/api/src/lib/supabase.ts#L14).

**Shape:**

```ts
userClient(env: Bindings, jwt: string): SupabaseClient
  .rpc(fn: string, args?) → Promise<{ data, error }>
```

**Python:**

```python
sb = create_client(URL, ANON_KEY)
sb.postgrest.auth(jwt)
res = sb.rpc("card_settlement_review").execute()
```

**Real use:** [routes/finance/card-settlement.ts:55-56](../apps/api/src/routes/finance/card-settlement.ts#L55-L56).

```ts
const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("card_settlement_review");
if (error) return fail(c, error);
```

**Test:** No test of its own. Route tests mock it.

### fail · mapPgError

`fail(` used in 57 files. `mapPgError` used in 47 files.

Turns a Postgres error code into the right HTTP answer. 42501 (no permission) → 403, P0002 (not found) → 404, 23505 (value already used) → 409, P0001 (a business rule refused) → 422, anything else → 500. `fail` is `mapPgError` plus `c.json`.

**Where:** [apps/api/src/lib/route-helpers.ts:28](../apps/api/src/lib/route-helpers.ts#L28). `fail` at [:93](../apps/api/src/lib/route-helpers.ts#L93).

**Shape:**

```ts
mapPgError(error: { code?; message?; details? }) → { status, body }
fail(c, error) → Response
```

**Python:**

```python
STATUS = {"42501": 403, "42P01": 404, "P0002": 404, "23505": 409,
          "22023": 422, "P0001": 422, "40001": 409}
def fail(err):
    return JSONResponse({"message": err.message},
                        STATUS.get(err.code, 500))
```

**Real use:** [routes/finance/card-settlement.ts:56](../apps/api/src/routes/finance/card-settlement.ts#L56). This file keeps a local `fail` at [:47](../apps/api/src/routes/finance/card-settlement.ts#L47) that wraps `mapPgError`.

```ts
if (error) return fail(c, error);
```

**Test:** [apps/api/src/lib/route-helpers.test.ts](../apps/api/src/lib/route-helpers.test.ts)

### todayIsoMYT

Used in 29 files.

Today's date in Malaysia, as "2026-09-29". The Worker's clock is UTC, which is 8 hours behind. Before 8am in KL, UTC still says yesterday. This is the fix behind the AR receipt date bug.

**Where:** [apps/api/src/lib/today.ts:4](../apps/api/src/lib/today.ts#L4). Browser twin `appTodayIso` at [fmt-date.ts:194](../apps/web/src/lib/fmt-date.ts#L194).

**Shape:**

```ts
todayIsoMYT(): string
```

**Python:**

```python
datetime.now(ZoneInfo("Asia/Kuala_Lumpur")).date().isoformat()
```

**Real use:** the whole body, [today.ts:5](../apps/api/src/lib/today.ts#L5).

```ts
new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10)
```

**Test:** No test of its own. [delivery-order-issue.test.ts](../apps/api/src/lib/delivery-order-issue.test.ts) uses it.

## Tests (apps/web, *.test.tsx)

### show (a test file's own helper)

Not a keyword. Written at the top of each test file.

Not built in. It is a plain function the test file writes for itself, a few lines above the tests. It draws the page at one URL, inside the two wrappers every page needs: [QueryClientProvider](#queryclientprovider--queryclient) and [MemoryRouter](#memoryrouter--routes--route). Other test files call the same thing `renderPage` or `mount`. When you see a bare name called in a test, look at the top of that file first.

**Where:** [pages/finance/other-money-in/OtherDebtorsPage.test.tsx:45](../apps/web/src/pages/finance/other-money-in/OtherDebtorsPage.test.tsx#L45)

**Shape:**

```ts
function show(at: string)   // at = the URL to open the page on
  → what render() gives back
```

**Python:**

```python
@pytest.fixture
def show(client):                    # a fixture you wrote, not pytest's
    return lambda url: client.get(url)
```

**Real use:** [OtherDebtorsPage.test.tsx:111](../apps/web/src/pages/finance/other-money-in/OtherDebtorsPage.test.tsx#L111).

```ts
show("/finance/other-debtors?invoice=new");
await screen.findByTestId("other-debtor-invoice-form");
```

**Test:** It is test code itself. All 12 tests in that file start with it.

### QueryClientProvider + QueryClient

In 143 test files. The app's own one is in `main.tsx`.

The cache that [useQuery](#usequery--qk) reads from has to be handed to the page from above. This wrapper does that. The real app has one at `main.tsx:17`. A test makes a fresh, empty one each time, so one test's data never leaks into the next. `retry: false` makes a failed fetch fail at once, not after three tries.

**Where:** library `@tanstack/react-query`. App: [apps/web/src/main.tsx:17](../apps/web/src/main.tsx#L17).

**Shape:**

```tsx
const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
<QueryClientProvider client={qc}> …page… </QueryClientProvider>
```

**Python:**

```python
@pytest.fixture
def cache():            # a new empty dict for every test
    return {}
```

**Real use:** [OtherDebtorsPage.test.tsx:46-48](../apps/web/src/pages/finance/other-money-in/OtherDebtorsPage.test.tsx#L46-L48).

```tsx
const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
return render(<QueryClientProvider client={qc}> … </QueryClientProvider>);
```

**Test:** Library. Leave it out and useQuery throws "No QueryClient set".

### MemoryRouter + Routes + Route

In 107 test files.

A pretend address bar. The real app uses `BrowserRouter`, which reads the browser's URL. A test has no browser, so MemoryRouter keeps the URL in memory, and `initialEntries` says which URL the page opens on. `Routes` and `Route` then pick what to draw for that URL, the same as in the app. A `path="*"` route catches "the page sent me somewhere else", so the test can read where.

**Where:** library `react-router-dom`. App twin `BrowserRouter` at [apps/web/src/main.tsx:18](../apps/web/src/main.tsx#L18).

**Shape:**

```tsx
<MemoryRouter initialEntries={[url]}>
  <Routes><Route path="/finance/x" element={<Page />} /></Routes>
</MemoryRouter>
```

**Python:**

```python
client = TestClient(app)          # FastAPI: no real server
client.get("/finance/other-debtors?invoice=new")
```

**Real use:** [OtherDebtorsPage.test.tsx:49-54](../apps/web/src/pages/finance/other-money-in/OtherDebtorsPage.test.tsx#L49-L54). `Where` prints the URL the page moved to.

```tsx
<MemoryRouter initialEntries={[at]}>
  <Routes>
    <Route path="/finance/other-debtors" element={<OtherDebtorsPage />} />
    <Route path="*" element={<Where />} />
  </Routes>
</MemoryRouter>
```

**Test:** Library. Leave it out and useSearchParams throws "may be used only in the context of a Router".

## Shared (packages/shared)

### zod schemas in @carres/shared

353 exported `z.` schemas in `packages/shared/src/schemas`.

One schema describes a request or a row. The API checks bodies with it (through parseJsonBody), and the browser uses its type, so both sides agree on the shape. `z.infer` turns a schema into a TypeScript type.

**Where:** `packages/shared/src/schemas/*.ts`, e.g. [schemas/finance-ap.ts:31](../packages/shared/src/schemas/finance-ap.ts#L31) (`setTermsDaysInput`). Not every type there is a schema: `ApBillOutstandingRow` at [:378](../packages/shared/src/schemas/finance-ap.ts#L378), the AP ageing input, is a plain TypeScript interface.

**Shape:**

```ts
export const x = z.object({ amount: z.number().positive(), note: z.string().optional() });
export type X = z.infer<typeof x>;
```

**Python:**

```python
class X(BaseModel):
    amount: PositiveFloat
    note: str | None = None
```

**Real use:** [card-settlement.ts:74](../apps/api/src/routes/finance/card-settlement.ts#L74). `importInput` is a zod schema kept in the route file itself, at [:27](../apps/api/src/routes/finance/card-settlement.ts#L27). Shared schemas are passed the same way.

```ts
const body = await parseJsonBody(c, importInput);
```

**Test:** Next to each schema, e.g. `packages/shared/src/schemas/*.test.ts`.
