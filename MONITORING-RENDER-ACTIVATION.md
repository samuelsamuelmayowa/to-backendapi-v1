# Existing Render backend — Monitoring activation

## Readiness verdict

The backend code is prepared for a reviewed release of the **existing** service.
Production activation is still pending a Git release and manual Render deployment,
plus verification of the actual Render runtime environment. No backend, database,
production schema change or deployment was created by this task.

The owner confirms that both SQL migrations are already applied and that the
four tables, three functions, RLS and EXECUTE permissions passed production
verification. **Do not run migration commands or configure a pre-deploy migration.**

The configured checkout's Supabase client passed read-only HEAD checks for all
four table schemas. This confirms that this client can access the expected
relations; it does not prove that Render has the same environment values. The
dashboard/runtime environment is unavailable from this checkout: no Render API
credential or authenticated dashboard session was used. Never substitute local
`.env` presence checks for a Render configuration check.

## Verified routing and compatibility

- `package.json` starts `node api/index.js`; this is the actual CommonJS entry.
- `/api/payment/webhook` remains before all JSON parsing, preserving raw signatures.
- `/otlp` is mounted before the shared parser and cookie/CSRF stack. Its JSON body
  limit is 256 KB, independent of the existing shared parser's 100 KB default.
- `/api/monitoring` has a local 16 KB management parser, then existing cookie,
  CORS, CSRF, trusted-origin and session verification. Identity comes from the
  existing signed `userId`, not a second login or caller-controlled owner header.
- Existing Analytics, Studio, quizzes, jobs, market, options, payment and other
  mounts remain in place. The bootstrap test executes the actual entry source
  with isolated providers and legacy-handler probes. Separate regression files
  exercise existing service implementations. This is not a claim that every
  authenticated production flow has been exercised.
- The Monitoring route factory lazily loads `config/supabaseAdmin.js`, the same
  client already used by the shared backend. All storage names are
  `monitoring_projects`, `monitoring_project_keys`, `monitoring_spans`, and
  `monitoring_ingest_buckets`; the old `to_monitor_*` prototype is not used.
- RPC callers use exactly `monitoring_create_project_key`,
  `monitoring_ingest_spans`, and `monitoring_prune_expired`. No caller uses the
  removed standalone quota function.
- The actual entry point binds Render's `PORT` on `0.0.0.0`. `.node-version`
  selects the tested Node 22.23.3 runtime. Existing explicit Render Node settings
  can override this file; confirm the effective runtime in the build log.

## Small fixes made during activation review

- Corrected the Google test to expect 403 for a cryptographically verified token
  with an unverified email, non-Google provider or missing email. Missing/invalid
  tokens remain 401. Production Firebase verification behavior was not changed.
- Updated a stale jobs HTTP test to exercise the router's actual default-export
  factory and current feed API. No jobs runtime route was rewritten.
- Fixed WebSocket test message buffering/disconnect synchronization and bounded
  test runs. The real exporter is still required to store a real HTTP server span.
- Added `middleware/requestCookies.js`, retaining the existing legacy cookie
  adapter but removing its request-owned polling listener on response finish or
  disconnect. This fixes leaked timers without changing cookie-writing behavior.
- Removed the earlier global Mongoose buffering override so unrelated Analytics
  and Studio models retain their previous defaults. Authentication still waits
  for database readiness through its dedicated existing readiness middleware.

## Runtime environment check — names only

In the **existing Render service's Shell**, once the release containing the
checker is available, run:

```sh
npm run check:monitoring-env
npm run check:monitoring-schema
```

The first command reads only the process environment, prints names and PASS/FAIL,
and does not print secret values. It does not load `.env` unless `--local` is
explicitly supplied. The schema checker only sends read-only HEAD requests; it
does not read rows, call mutation/pruning RPCs, or change the database.

Before approving deployment, check the following **names** in the Render
dashboard, retaining every existing shared-service environment setting:

| Name | Required verification |
| --- | --- |
| `SUPABASE_URL` | Existing production project with the applied Monitoring tables |
| `SUPABASE_SERVICE_ROLE_KEY` | Existing server-only credential for that same project |
| `DATABASE_URL` | Existing account Mongo database, reachable from Render |
| `JWT_SECRET` | Existing login secret; do not rotate it during activation |
| `FRONTEND_ORIGINS` | Include `https://to-monitoring.vercel.app`; preserve all existing entries |
| `MONITORING_PUBLIC_OTLP_TRACES_URL` | Optional; absence uses the correct Render `/otlp/v1/traces` URL. If configured, it must not point at localhost or a placeholder |
| `NODE_ENV` | Production mode |
| `PORT` | Use Render's supplied service port, not a fixed local-development override |
| `GOOGLE_APPLICATION_CREDENTIALS` | Existing readable Firebase service-account secret file for `firebase.js` application-default credentials; do not commit the file |
| `SESSION_COOKIE_SAME_SITE` | Preserve the production-compatible setting; the default is `none` in production |
| `SESSION_COOKIE_SECURE` | Production cookies are secure; do not disable production mode |
| `OPENAI_API_KEY`, `STRIPE_SECRET_KEY` | Preserve these existing shared-startup credentials; constructors are evaluated by the entry point |
| Existing provider, Stripe webhook, Firebase, Studio storage and scheduler names | Preserve unchanged; Monitoring does not replace their settings |

The local audit found the core database/login names present, but lacked the
production origin list, production-mode setting and a configured Firebase secret
file. Those are **local findings**, not evidence that Render is missing them.
Actual Render settings remain a verification gate. Do not print them in logs,
screenshots, Git, terminal history or this chat.

## Ingestion and retention checks

The receiver accepts OTLP/HTTP JSON traces only. Protobuf returns 415; logs and
metrics return 501. Project keys are send-only; signed user sessions are required
for management/read endpoints. The SQL function revalidates revocation, derives
project ownership from the key and atomically enforces 600 newly stored HTTP
SERVER spans/project/minute. Duplicate IDs do not advance connection status.

There is also a 120 requests/IP/minute HTTP limit (including invalid keys), a
100-input-span limit and a 256 KB decompressed body limit. The actual 121st-request
test returns 429 with Retry-After. Management has a separate 120-request limiter.
Its process-local counter resets on restart; the database quota is the shared
durable per-project protection across instances.

The official Node sample uses `http/json`, a 100-span batch maximum and the
actual Render endpoint. Its dependency lockfile was tested with the real SDK.
Do not rely on the SDK's default protobuf exporter.

`api/index.js` starts the retention timer after server startup. It invokes the
existing Supabase client's `monitoring_prune_expired` RPC every minute, skips
overlapping calls and clears the timer on server close. Previously tested SQL
uses an advisory lock and bounded deletion batches for seven-day spans and
two-hour quota buckets. Retention does not run while a sleeping Render service
is stopped; watch backlog and warnings rather than promising exact expiration.

## Verification results

- Final full maintained backend suite: **113 passed, 0 failed, 0 skipped**.
  Includes Analytics/Studio services, Google/password auth, actual-entry bootstrap,
  IP rate limiting, key authorization, parser limits, cookie cleanup, retention
  scheduling and the official instrumented Express exporter. The environment
  audit tests were also rechecked after its final startup-credential additions.
- `check:backend`: 14 runtime/helper files passed syntax checks without execution.
- `npm ls --omit=dev --depth=0` passed; `npm ci --dry-run --omit=dev
  --ignore-scripts --no-audit --no-fund` passed. This checks the production lockfile;
  it is not a claim of a new provider-connected production startup.
- Read-only HEAD requests confirmed the configured client's four table schemas.
- Live Render baseline: health 200, session 200, protected Studio bootstrap 401,
  Monitoring projects 404 HTML. The Monitoring code has not been activated there.
- The public Vercel bundle uses `/api/monitoring` through the same authenticated
  helper that carries CSRF. Its existing proxy targets the intended Render service.
- Actual Render secrets/settings and an authenticated production
  login → project → key → trace workflow remain unverified. Perform the checks
  below after explicit release approval. Production schema was not changed.

## Git release — manual commands only

Verified repository: `https://github.com/samuelsamuelmayowa/to-backendapi-v1.git`,
current local branch `main`. Runtime work is not yet committed or pushed by this
task. Preserve other uncommitted work and inspect staged changes carefully.

1. In Render, first confirm the linked repository/branch and set **Auto-Deploy to
   Off**. Saving environment/build settings can offer a deploy action: do not
   choose it until release approval. Do not create another service.
2. Prepare a review branch and stage these explicit runtime/test artifacts:

```powershell
Set-Location C:\ClientApps\JOINAPPTO\to-backendapi-v1
git status --short
git switch -c activate-monitoring-20261125
$monitoringReleaseFiles = @(
  '.node-version', '.env.example', 'package.json', 'package-lock.json',
  'api/index.js', 'monitoring-api.cjs', 'otlp-parser.cjs',
  'routes/monitoring.js', 'routes/auth.js', 'services/database.js',
  'middleware/requestCookies.js',
  'scripts/checkBackend.js', 'scripts/checkMonitoringEnvironment.js',
  'scripts/checkMonitoringSchema.js', 'scripts/runBackendTests.js',
  'tests/googleMobile.test.js', 'tests/jobsApi.test.js',
  'tests/realtimeMarketData.test.js', 'tests/parser.test.cjs',
  'tests/database.test.js', 'tests/monitoring.test.js',
  'tests/monitoringBootstrap.test.js', 'tests/monitoringEnvironment.test.js',
  'tests/monitoringExporter.test.js', 'tests/monitoringRetention.test.js',
  'tests/requestCookies.test.js', 'tests/helpers/monitoringFixture.js',
  'examples/monitoring-node', 'MONITORING-RENDER-ACTIVATION.md'
)
git add -- $monitoringReleaseFiles
git diff --cached --check
git diff --cached --stat
git diff --cached
git commit -m "Activate Monitoring routes in the existing Render backend"
git push -u origin activate-monitoring-20261125
```

The already-applied migration files and prior migration-review/test-tool files can
be recorded in a separate reviewed history commit; they are not required to run
again during deployment. Never use `git add .` to scoop up credentials or local
database clusters. The example's `.env` and `node_modules` are ignored.

3. Open/review a PR into the service's actual linked production branch (verify it
   is `main`; do not assume). Merge only after tests and release approval, with
   Render Auto-Deploy still Off. Do not force-push or discard pending work.
4. Fetch and record the exact merged commit to deploy:

```powershell
git fetch origin
git log -1 --format="%H %s" origin/main
```

Use the resulting reviewed SHA in Render's **Manual Deploy → Deploy a specific
commit**. These instructions do not execute a push, merge or deployment for you.

## Existing Render service settings

- Repository: the existing backend repository above, not the frontend repository.
- Root Directory: repository root (blank/`.` for this single-backend Git repo).
- Runtime: Node, effective Node 22 as pinned/tested.
- Build Command: `npm ci --omit=dev && npm run check:backend`.
- Start Command: `npm start` (runs `node api/index.js`).
- Pre-Deploy Command: no migration/seed command. Both schemas are already applied.
- Keep the existing instance, region, domain and environment groups.
- Keep the existing health-check path; `/api/health` currently returns 200. Do not
  use the authenticated Monitoring list endpoint as Render's health check.

There is no transpilation/production `build` script: this is CommonJS source.
`check:backend` syntax-checks relevant runtime files without importing the app,
starting timers, contacting providers or touching databases. Runtime dependencies
match the lockfile (`npm ls --omit=dev --depth=0` passed). The executable bootstrap
test verifies the actual entry file with isolated external providers; a full
production-credential startup has intentionally not been launched locally.

Official references: [Render deploy controls](https://render.com/docs/deploys),
[Node version selection](https://render.com/docs/node-version), and
[web service port binding](https://render.com/docs/web-services#port-binding).

## Tests before approving the release

```powershell
Set-Location C:\ClientApps\JOINAPPTO\to-backendapi-v1
npm ci
npm ci --prefix examples/monitoring-node --ignore-scripts
npm run check:backend
npm run test:backend
```

This runs all maintained `tests/*.test.js` and `tests/*.test.cjs` files, including
the real OpenTelemetry sample, serially with bounded timeouts. The old ad-hoc
`smoke-test.js` prototype is not a maintained test and is excluded. No test loads
production `.env` to create records or prune production storage. SQL migrations
are not rerun by this release test command.

## Safe post-deployment tests

Start with unauthenticated read-only checks:

```powershell
$monitoringApi = 'https://to-backendapi-v1-kctb.onrender.com'
curl.exe -i "$monitoringApi/api/health"
curl.exe -i "$monitoringApi/api/session"
curl.exe -i "$monitoringApi/api/monitoring/projects"
curl.exe -i "$monitoringApi/api/splunk-lab/student/bootstrap"
```

Expected: health 200 JSON, session 200 JSON with unauthenticated state, Monitoring
401 JSON (not 404 HTML), and protected Studio bootstrap 401 JSON. Before release,
these were 200 / 200 / **404** / 401 respectively. A health 200 alone does not
prove Monitoring, MongoDB or Supabase is ready.

Then use a dedicated test account through the existing Monitoring site:

1. Sign in with password and separately with Google. Confirm refresh keeps the
   HttpOnly session; do not extract or paste cookies/login tokens into chat.
2. Open Applications. List must succeed, then create **Shopping API Activation**,
   Node.js, development. Confirm HTTP 201 and persistence after browser refresh.
   The site already uses the existing same-origin Vercel `/api` rewrite and the
   shared CSRF client. Do not disable CSRF to work around a 403.
3. Generate one test ingestion key (201). Save the one-time secret only in the
   sample's private `.env`; never screenshot, log or commit it. Key-list responses
   must contain metadata only. Status must initially remain Not connected/Waiting.
4. In `examples/monitoring-node`, install the locked dependencies, copy
   `.env.example` to `.env`, set that one-time key and change the trace endpoint
   to `https://to-backendapi-v1-kctb.onrender.com/otlp/v1/traces`. Keep JSON and the
   100-span batch setting. Run `npm start`, then in another terminal run:

```powershell
Invoke-RestMethod http://localhost:8091/products
```

5. Wait a few seconds for export and click Check connection. Confirm actual
   `/status` has `connected: true`, a recent `last_seen_at` and a positive stored
   span count. Confirm `/spans` shows the sample service and `/products` under
   this project. A 200 OTLP response by itself can contain zero eligible spans.
6. Sign in as a second dedicated test account: the project must not appear in its
   list, and reading/changing the known project ID must return 404. Anonymous
   management access must remain 401. A browser write without CSRF must be 403.
7. Revoke only the test key via Applications (204). Generate another sample HTTP
   request: exports with that revoked key must fail 401 and must not advance
   the project timestamp. A random ingestion key must also return 401.
8. Test malformed JSON/unsupported protobuf only with the dedicated test setup;
   expect 400/415. Do **not** flood production to prove 429, saturate a quota,
   seed expired rows, call the pruning RPC manually or touch real customer keys.
   Those behaviors are covered by isolated tests.
9. Check Render logs for startup/database errors and retention warnings. The
   60-second scheduler must remain running without repeated storage errors.
   Verify expiry as normal telemetry ages; do not change production timestamps
   or schema just to manufacture a retention test.
10. Check existing Analytics sign-in, a permitted quiz/student read, Studio
    bootstrap/search and other normal read flows with the existing test accounts.
    Avoid test payments/emails or production seed/import commands. Stop the
    sample and keep/revoke its test key according to your operational policy.

If a release fails, roll back the **Render code deployment** to the previous good
commit. Leave the verified production Monitoring schema intact; do not rerun or
drop migrations. If environment checks fail, repair the relevant existing service
setting through the normal reviewed change process before retrying activation.
