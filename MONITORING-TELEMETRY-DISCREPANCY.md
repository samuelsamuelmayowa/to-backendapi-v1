# T.O. telemetry discrepancy investigation — November 27, 2026

## Findings and confidence

The supplied production snapshot has 535 historical HTTP SERVER spans (latest
November 26, 18:46 UTC), 112 recent MySQL CLIENT spans (latest November 27,
10:13 UTC), and no shared HTTP/MySQL trace IDs. These are supplied observations,
not a new production database audit performed by this change.

**Confirmed receiver/status defect:** advanced ingestion updates
`monitoring_projects.last_received_at` whenever any eligible span is stored.
The status route counted SERVER spans but used that all-signal timestamp for
`connected`. Database activity therefore refreshed a claim about HTTP serving.
Trace Explorer's default query filters SERVER spans and orders by receipt; it
continues to show historical rows by design. Those rows are not evidence of fresh
HTTP traffic.

**Confirmed local startup mismatch:** sanitized process inspection found port
8000 owned by PID 27388, an app.js process without explicit OTel preload or
env-file arguments. PID 26212 had both arguments but did not own that listener.
This snapshot is local, not a remote production process inspection. An inherited
NODE_OPTIONS or programmatic initialization cannot be inferred from command-line
flags alone; the inspected app has no SDK registration and its current .env has
NODE_OPTIONS unset. No requests were sent to either real application process.

The existing npm `start`/`dev` commands and PM2 configuration do not register OTel.
Current .env enables `http,express`, no disabled-instrumentation list or explicit
sampler, OTLP JSON, and a batch size of 100. A process actually using only those
instrumentations would not emit mysql2 spans. Historical/running settings can
differ from current disk settings. The original startup path requires Express
before loading dotenv, so putting SDK registration after those imports would
also be too late; configuration must load before preload, then app.js.

Sequelize authentication is performed both by db.js and the startup block before
app.listen. The inspected startup source also contains a sync call. Such work
can emit database spans without serving any HTTP requests. A second instrumented
process failing to bind an occupied port is consistent with the snapshot, but
no captured bind error proves that exact failure. Startup/background traffic is
the supported explanation for uncorrelated DB spans, not a proven attribution
of each of the 112 production spans. Missing parents can also result from
filtered INTERNAL spans, sampling, rejected batches, or incomplete collection.
No missing parent is presented as proof that a span is a startup operation.

## Controlled verification

No MAFACONNECT app.js, dotenv, real database, production exporter destination,
or real ingestion key was loaded into test children. The probe uses an allowlist
of inherited OS variables, an ephemeral loopback receiver, a dummy key and fake
storage. Its MySQL fault server immediately closes local test sockets; it is
not a database. Only aggregate results are printed.

Installed packages: Node 22.23.3, Express 5.2.1, auto-instrumentations-node
0.83.1, sdk-node 0.301.2. Official preload with default resource detectors
exported compatible JSON into the actual parser/receiver:

- HTTP dependency probe: two SERVER spans and one correlated HTTP CLIENT span.
- MySQL probe: one startup root MySQL span, one HTTP SERVER span, one MySQL child
  with the SERVER trace ID and parent span ID. Fixed-field projection excluded
  the synthetic sensitive marker.

Official registration source starts the SDK before application imports. Its
diagnostic logger is disabled after initial setup when OTEL_LOG_LEVEL is set;
absence of console export errors is therefore not success evidence. Probes
verify stored rows rather than relying on that message.

Receiver review: JSON only; 256 KB, 100 input spans, bounded resources/scopes,
strict IDs/timing/attributes in advanced mode, fixed allowlisted projection.
HTTP method presence and SERVER kind determine HTTP eligibility. Legacy/current
HTTP semantic attributes and enum names are supported. No reproducible HTTP
parsing/exporter compatibility defect was found, so validation was not loosened.

The v2 RPC rechecks keys, serializes per-project quota updates, deduplicates,
and rolls back the batch if the 600 newly stored spans/minute quota is exceeded.
Database spans share that budget; a saturated project can reject an HTTP batch
with 429/Retry-After. Invalid mixed batches can fail before storage as well.
There is no production exporter/receiver response history here proving either
condition occurred. Existing counts alone cannot establish quota rejection.
No quota policy or production schema was changed.

## Changes

- Status now derives HTTP freshness from the newest project-scoped HTTP SERVER
  row's received_at, independently of database and all-signal receipt timestamps.
  Existing connected/has_received/last_seen_at fields consistently describe HTTP.
- Additional fields: http_active, http_last_seen_at, database_active,
  database_last_seen_at, telemetry_last_seen_at, activity_window_seconds (600),
  availability (unknown). Receipt is not an uptime probe. Historical spans
  arriving now mean fresh receipt, not proof the request happened now.
- Applications distinguishes HTTP receipt, DB receipt and unmeasured availability.
  Overview keeps HTTP counts and uses precise HTTP wording.
- MAFACONNECT has additive start:monitoring/dev:monitoring npm scripts and a
  separate ecosystem.monitoring.config.cjs opt-in PM2 configuration. They load
  .env before official preload and app.js. Existing startup scripts and app.js
  were not edited by this work. Existing uncommitted app/package/lockfile changes
  were preserved. No process was started/stopped/restarted.
- The preparation helper is explicit and idempotent; it never deploys or runs
  application code. It refuses conflicting existing monitoring entries.

Authentication, CSRF, project ownership checks, key validation/revocation,
sensitive-data projection, ingestion transactions and retention are unchanged.
No new tables, columns, migration, credentials or active availability probes.

## Regression checks

Backend: 28 tests passed across parser, management/ingestion, advanced telemetry,
activity regression and official exporter suites. These cover DB-only activity,
stale HTTP plus recent DB/outbound HTTP, HTTP-only counts, newest receipt ordering,
future receipts, empty/duplicate/rejected batches, auth/CSRF/tenant isolation,
revocation, validation and quotas. Storage adapters simulate the RPC; this run
does not claim PostgreSQL transaction/RLS integration verification.

Frontend: full suite and production build passed; an additional Overview
regression uses the supplied 535 historic HTTP spans with fresh DB activity.
The build emits its existing large-chunk advisory.

Reproduce installed-package probes from the backend directory:

    node tools/probeInstalledMonitoring.cjs C:\ExternalProject\MConnect\api --dependencies --default-detectors
    node tools/probeInstalledMonitoring.cjs C:\ExternalProject\MConnect\api --mysql --default-detectors

## Reviewed rollout and acceptance

1. Review backend/frontend diffs and the additive MAFACONNECT files separately
   from pre-existing MAFACONNECT edits. No push/deployment has been performed.
2. Release the backend status fix before or alongside the frontend. No schema
   change is needed. Retain the existing advanced-read flag where already enabled.
   Expect stale HTTP plus recent MySQL to show HTTP disconnected while the HTTP
   count remains 535 unless new HTTP rows arrive or retention removes old rows.
3. In development/staging, arrange exactly one intended listener. An operator
   should replace the old listener in a reviewed maintenance step, rather than
   starting a competing process. Use `npm run start:monitoring`, or review/select
   ecosystem.monitoring.config.cjs with the same PM2 application identity. Verify
   the deployed Node supports --env-file and the interpreter/cwd match the host.
   Do not start the normal and instrumented configurations concurrently.
4. For request/DB correlation, explicitly enable http,express,mysql2 in the private
   deployment configuration; current disk settings enable only http,express.
   Keep HTTP JSON and batches <=100. Never paste keys or private environment into
   console output or tickets. Do not add a second SDK initializer.
5. Use a known safe staging HTTP route. Wait for export and check actual receiver
   responses and stored HTTP rows. Verify trace IDs include request-associated DB
   children when the chosen route performs DB work. Startup DB roots should remain
   separate. Capture only sanitized status/counts, no attributes/SQL/credentials.
6. Confirm HTTP status becomes connected only after stored SERVER telemetry;
   DB-only traffic must not refresh it after 10 minutes. Confirm Overview count,
   Trace Explorer, cross-tenant denial and availability=unknown. Check 400/413/415/
   429/503 response counts before blaming instrumentation for missing batches.
7. After staging acceptance, schedule the same reviewed process replacement in
   production. Do not alter authentication, database startup behavior or schema.
   Independent availability monitoring needs a separate reviewed requirement.

Rollback: restore the previous startup selection in a controlled restart and
revert the frontend/backend code releases if required. No data rollback or schema
rollback is needed. Reverting the status fix would restore the known false-positive
connection behavior; prefer keeping it while investigating instrumentation.
