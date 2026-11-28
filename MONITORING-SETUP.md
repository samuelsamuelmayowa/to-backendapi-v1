# Monitoring registration and OTLP ingestion

> Current developer onboarding: [Node.js Quickstart](MONITORING-NODE-QUICKSTART.md). The deployment diagnosis and migration notes below are historical records, not current developer setup instructions. Do not infer current production state from them or rerun migrations.

**Activation update:** The owner has now applied and verified both migrations in
production. Do not rerun schema SQL. The historical review steps below are an
archive; use `MONITORING-RENDER-ACTIVATION.md` for the current backend release.

## Diagnosis and scope

The active start command is `node api/index.js` (CommonJS). It did not import or
mount `monitoring-api.cjs`. The alternate `routes/monitoring-routes.mjs` was also
unmounted and targets the older `to_monitor_*` prototype. The frontend requests
`/api/monitoring/projects`; its Vercel rewrite already forwards `/api/*` to the
shared Render backend. Vite forwards it to localhost:8000. This was a missing
Express mount, not a new website or missing Vercel proxy.

Read-only requests on November 25, 2026 confirmed **404 HTML from both**:

- `https://to-backendapi-v1-kctb.onrender.com/api/monitoring/projects`
- `https://to-monitoring.vercel.app/api/monitoring/projects`

Applications also had its own client without the existing CSRF token. It now
shares `authRequest` with the original HttpOnly-cookie login flow. Management
uses the existing `requireSession`, verified `authClaims.userId`, trusted origins,
and CSRF middleware. Ingestion uses only a project key and is mounted **before**
the shared 100 KB JSON parser and cookie/CSRF stack, with its own 256 KB limit.
The payment webhook remains before all JSON parsing.

## Supabase review gate — no live migration has been applied

The database owner has confirmed that production contains none of the four
`monitoring_*` tables. Earlier preflight output must not be treated as proof of
the current production schema. Verify the selected project explicitly. Do not
run `migrations/monitoring-schema.sql` or copy/merge the older `to_monitor_*`
prototype rows. The final migration review is in `supabase/MONITORING-MIGRATION-REVIEW.md`.

1. Run `npm run check:monitoring-schema` from the backend.
2. Run the read-only `supabase/monitoring-preflight.sql` in the existing project's
   SQL editor. Review types, constraints, RLS, grants and existing RPC definitions.
3. Review/apply `supabase/migrations/20261124_monitoring_v1.sql` first on the
   isolated test target, then `20261125_monitoring_ingestion.sql`. The files are
   single-use transactions and fail on existing Monitoring object names.
4. Review `supabase/migrations/20261125_monitoring_ingestion.sql`, then approve
   its application in staging. It adds `last_received_at`, retention indexes,
   removes the unused legacy quota RPC without CASCADE, and defines three
   monitoring-only service-role RPCs. It changes no student, quiz or Splunk tables.
5. Verify staging transactions, quota rollback, concurrent key creation, RLS and
   revocation before approving the same migration for production.

The RPCs atomically cap active keys at three, revalidate keys during ingestion,
enforce 600 newly stored spans/project/minute, ignore duplicate trace/span IDs,
and update the project timestamp only after a newly stored HTTP server span.
SHA-256 hashes of 256-bit random secrets are stored; raw secrets are returned
only by key creation. Only the backend service role can access these tables or
functions. There are deliberately no browser/anon/authenticated RLS policies:
Analytics Mongo account IDs are not Supabase `auth.uid()` values. Every API read
or management write also checks the verified owner's ID. Team membership is
planned; the pilot supports personal projects only.

Retention deletes spans older than seven days and quota buckets older than two
hours in bounded batches of 10,000 every minute while Render is running. An
advisory transaction lock prevents overlapping prune jobs. Cleanup resumes after
restarts; this is asynchronous retention, not an exact expiration SLA. If Render
can sleep or the backlog grows faster than cleanup, schedule the same service-only
`monitoring_prune_expired()` RPC in the existing Supabase project after review.

## Environment names

Reuse existing server-only `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`JWT_SECRET`, account `DATABASE_URL`, and current cookie settings. Never place
credentials in `VITE_*`, a URL, the browser bundle, or source control.

`MONITORING_PUBLIC_OTLP_TRACES_URL` is optional and defaults to
`https://to-backendapi-v1-kctb.onrender.com/otlp/v1/traces`. For local onboarding,
set it to `http://localhost:8000/otlp/v1/traces` in the backend environment.
Preserve all existing `FRONTEND_ORIGINS` entries when adding
`https://to-monitoring.vercel.app`. This controls both CORS and trusted origins.

The frontend should normally leave `VITE_MONITORING_API_BASE_URL` unset and use
same-origin `/api/monitoring`, preserving cookie and Vercel-proxy behavior. Its
existing optional `LOCAL_API_URL` controls the Vite proxy, default localhost:8000.
No new secret or second authentication system is required.

## Start and test (PowerShell)

Backend:

```powershell
Set-Location C:\ClientApps\JOINAPPTO\to-backendapi-v1
npm ci
npm run check:monitoring-schema
npm start
```

Frontend in another terminal:

```powershell
Set-Location C:\ClientApps\JOINAPPTO\to-monitoring
npm ci
npm run dev
```

Tests and build:

```powershell
Set-Location C:\ClientApps\JOINAPPTO\to-backendapi-v1
npm run test:monitoring
node --test tests/passwordLogin.test.js tests/database.test.js
Set-Location examples\monitoring-node
npm ci --ignore-scripts
Set-Location ..\..
npm run test:monitoring-exporter

Set-Location C:\ClientApps\JOINAPPTO\to-monitoring
node --test tests/authApi.test.js
npm run lint
npm run build
```

The sample uses Node 22.15+ and official auto-instrumentations-node 0.83.1 (lockfile
resolves sdk-node 0.301.2). Its installed exporter-selection code explicitly
supports `http/json`; the default is `http/protobuf`. Set JSON and
`OTEL_BSP_MAX_EXPORT_BATCH_SIZE=100` as shown in Applications and `/docs`.
Protobuf, gRPC, metrics, and logs are unavailable. The existing ESM prototype is
not used. The sample is CommonJS; other module systems need separate loader setup.

## Live workflow after migration approval

1. Sign in at `http://localhost:5173` using an existing Analytics account.
2. Open Applications, create **Shopping API**, choose Node.js and development.
3. Refresh and confirm the application persists. Confirm its owner and ID in
   `monitoring_projects` in Supabase without exporting sensitive account data.
4. Generate a key. Save it only in the sample's private `.env`.
5. Start the official Express example:

```powershell
Set-Location C:\ClientApps\JOINAPPTO\to-backendapi-v1\examples\monitoring-node
Copy-Item .env.example .env
# Edit .env: replace YOUR_PROJECT_SECRET; keep the localhost trace URL for local testing.
npm start
```

In another terminal:

```powershell
Invoke-RestMethod http://localhost:8091/products
```

6. Wait for batch export (normally a few seconds), then click Check connection.
   Only a successful authenticated write of an HTTP SERVER span can show Connected.
7. Confirm `/projects/:id/status` and `/spans` match the verified project's rows.
8. Check a second account cannot list/read/change the project, invalid/revoked
   keys fail, malformed JSON fails, and oversized batches and quota exhaustion fail.
9. Revoke the test key. The example must no longer update the project's status.

## Results and limits of verification

- Published Render and Vercel endpoints both confirmed missing routes (404).
- Production has none of the four Monitoring tables, as confirmed by the owner.
  Verify the exact selected target with the read-only SQL audit before execution.
- 14 Monitoring tests passed, including a **real Express process exporting via
  official OpenTelemetry packages into the real HTTP receiver**, plus the
  authorization, cookie/CSRF, revoked key, malformed payload, limits and quota cases.
  Storage in these tests is explicitly an isolated in-memory Supabase adapter.
- Password-login/database tests passed (8). Frontend client tests and production
  build passed. Lint passed with warnings in existing code; Vite warns about the
  large Swagger-inclusive bundle.
- An additional pre-existing Google mobile authentication test expects 401 for an
  identity the current middleware rejects with 403. That test still fails; its
  authentication behavior was not changed as part of Monitoring.
- **No successful live login → Supabase → browser end-to-end run is claimed.**
  Production migrations/RPCs were not executed. The hardened migrations and
  transaction/RLS behavior have since passed isolated PostgreSQL tests, documented
  in the migration review; a full Supabase/PostgREST run remains pending. No user
  credentials were supplied for interactive login. The
  earlier local account-database DNS problem also remains a possible login blocker.

## Safe deployment order

Nothing has been deployed automatically. Review the read-only SQL audit and the
additive migration, validate on staging, then separately approve production SQL.
Deploy the existing backend on Render using `npm start` / `api/index.js`, preserving
all existing environment settings. Do not create another Render backend. Verify
an unauthenticated GET `/api/monitoring/projects` now returns **401 JSON**, then
perform the authenticated live workflow above. Monitor shared Analytics, quizzes,
Splunk, payment webhook, login and health behavior before proceeding.

Deploy the existing Vercel frontend after backend checks. Keep its existing
`vercel.json` API rewrite before the SPA fallback. No frontend OTLP rewrite is
needed: Node exporters send directly to Render. Verify `/docs`, login, Applications
creation after refresh and status. If application code must be rolled back, roll
back the deploy without deleting monitoring tables or touching Analytics data;
the schema migration is additive.

## Files in this change

Backend: `api/index.js`, `routes/monitoring.js`, `monitoring-api.cjs`,
`otlp-parser.cjs`, `.env.example`, `package.json`,
`supabase/migrations/20261125_monitoring_ingestion.sql`,
`supabase/monitoring-preflight.sql`, `scripts/checkMonitoringSchema.js`,
`tests/parser.test.cjs`, `tests/monitoring.test.js`,
`tests/monitoringExporter.test.js`, `tests/helpers/monitoringFixture.js`, and the
`examples/monitoring-node` package, lockfile, `.env.example`, `.gitignore`, server.

Frontend: `src/lib/authApi.js`, `src/lib/otelSetup.js`,
`src/pages/ApplicationsPanel.jsx`, `src/pages/ApiDocs.jsx`,
`public/openapi.yaml`, `tests/authApi.test.js`.

Earlier database/login changes and any concurrent favicon/branding edits are
preserved; they are not additional Monitoring migrations or deployments.
