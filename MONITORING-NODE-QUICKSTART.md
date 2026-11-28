# Node.js developer quickstart

This guide describes the current implementation, not the legacy `to_monitor_*` prototype. All four guides use the same project, send-only ingestion key and OTLP/HTTP JSON endpoint. Integration status is maintained in the frontend guide and `docs/node-onboarding-verification.md`; a parser allowlist alone is not production verification.

## Shared setup for all guides

Use a CommonJS application with Node >=22.15 (controlled test runtime 22.23.3). In Workspace > Applications, register a Node.js project and development environment. Create an ingestion key once and save it privately. Only three active keys are allowed; existing raw secrets cannot be recovered. Never use the key for telemetry reads: reads require the signed-in owner's session or verified login bearer token.

Install inside the existing backend (not the React frontend):

```sh
npm install @opentelemetry/api@1.10.0 @opentelemetry/auto-instrumentations-node@0.83.1 @opentelemetry/sdk-node@0.301.2 @opentelemetry/sdk-trace@3.1.1 @opentelemetry/resources@3.1.1 @opentelemetry/exporter-trace-otlp-http@0.301.2
```

Copy `examples/monitoring-node/monitoring-preload.cjs` into the application's backend folder, or download the identical file linked in API Docs. This pinned SDK version uses the `@opentelemetry/sdk-trace` processor package. Do not substitute an older SDK's processor API. The preload selects official instrumentation using the environment, suppresses MongoDB query serialization and MySQL2 statements, then projects safe span metadata before JSON export. It removes all query text/contents, database/collection names, credentials, network addresses, raw errors/stacks, result records, arbitrary attributes, span names, links and resource metadata. No response hooks or enhanced database reporting are enabled. The receiver independently applies its existing fixed-field projection.

Create a private server `.env` (exclude it from Git):

```dotenv
OTEL_SERVICE_NAME=shopping-api
OTEL_TRACES_EXPORTER=otlp
OTEL_EXPORTER_OTLP_TRACES_PROTOCOL=http/json
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=https://to-backendapi-v1-kctb.onrender.com/otlp/v1/traces
OTEL_EXPORTER_OTLP_TRACES_HEADERS=x-to-project-key=YOUR_PROJECT_SECRET
OTEL_METRICS_EXPORTER=none
OTEL_LOGS_EXPORTER=none
OTEL_BSP_MAX_EXPORT_BATCH_SIZE=100
OTEL_BSP_MAX_QUEUE_SIZE=1000
OTEL_NODE_ENABLED_INSTRUMENTATIONS=http,express
```

Use the `ingest_url` supplied by your project's API response if it differs. All database selections keep this same endpoint and `x-to-project-key` header. Replace the placeholder only on the server or in a secret manager, never in public source, browser code, a `VITE_*` variable, a URL or log output. Do not publish screenshots containing it. The SDK exporter explicitly uses HTTP JSON, not its protobuf default. The preload fixes batches at 100, queue at 1000 and export delay at 1000 ms to match ingestion limits; changing batch environment variables does not override those explicit safe values.

Start instrumentation **before** importing Express, drivers or Mongoose:

```sh
node --env-file=.env --require ./monitoring-preload.cjs server.cjs
```

Replace `server.cjs` with the real CommonJS entry file. This replaces `--require @opentelemetry/auto-instrumentations-node/register`; never use both, and do not initialize another SDK. A bare automatic register may capture sensitive dependency attributes before the receiver removes them. ESM applications require separately verified loader setup and are outside this CommonJS guide. When using PowerShell `$env:NAME='value'` variables, omit `--env-file=.env`; shell variables override file values.

## 1. Node.js + Express: HTTP

Use `OTEL_NODE_ENABLED_INSTRUMENTATIONS=http,express`. Existing Express apps need no extra driver. A new disposable demo can install `express@4.22.1`.

Records incoming HTTP SERVER spans with method, normalized route, HTTP status, timestamps, IDs and duration. Express INTERNAL spans are excluded by the safe preload/receiver. In advanced mode, supported HTTP CLIENT spans may also be stored. Logs and metrics are not collected or stored by this configuration.

In your development app add or use a harmless route, for example `app.get('/health', (req,res) => res.json({ok:true}))`. Call the actual port:

```sh
curl http://127.0.0.1:8091/health
```

Wait a few seconds, select the project in Applications and Check connection. Then open Trace Explorer, refresh and inspect that HTTP request. Only recently stored HTTP SERVER telemetry establishes HTTP connection status; a key or background dependency call does not.

## 2. Node.js + Express + MySQL2

```sh
npm install mysql2@3.16.0
```

Use `OTEL_NODE_ENABLED_INSTRUMENTATIONS=http,express,mysql2`. The bundled mysql2 instrumentation is 0.71.0. This guide uses the driver's promise API as well as official CLIENT instrumentation; keep your existing connection configuration private.

In a development-only route, execute and await a harmless `SELECT 1` through your existing test connection, then return `{ok:true}`. Call that route with curl. Do not put SQL in span attributes or log it. HTTP SERVER and supported MySQL CLIENT calls can be correlated by their shared Trace ID. A measured CLIENT duration includes client-side waiting/network time; it is not confirmed SQL execution time. SELECT is displayed only when instrumentation explicitly supplies a safe operation; `MySQL query` is an accurate fallback.

If the application uses the older **mysql** package, install `mysql@2.18.1` and select **http,express,mysql**, which uses a separate instrumentation package bundled with auto-instrumentations. `mysql2` instrumentation does not instrument `mysql`. The installed mysql instrumentation documents driver >=2 and <3. Legacy mysql remains Experimental until its own controlled integration test passes. Never enable both unless both drivers are actually used.

## 3. Node.js + Express + MongoDB driver

```sh
npm install mongodb@6.21.0
```

Use `OTEL_NODE_ENABLED_INSTRUMENTATIONS=http,express,mongodb`. Installed MongoDB instrumentation 0.78.0 documents native driver >=3.3 and <8. Pinning one tested version does not certify that entire range.

Use an isolated local MongoDB instance containing only synthetic records. Inside a development route, await `collection.findOne({})`, then return only `{ok:true}`. Never send the found record into telemetry. Keep the connection URI and credentials in private application configuration; they are not part of T.O. exporter configuration. Call the route, wait for export and open its Trace ID in Trace Explorer. Safe MongoDB CLIENT spans should share the HTTP Trace ID. The instrumentation requires active parent context by default; database connection/startup work may produce no spans. An idle connection is not an operation test.

The parser accepts current `db.system.name=mongodb` and `db.operation.name`, and documented legacy `db.system`/`db.operation`. It retains safe IDs, parent ID, start timestamp, duration, service and allowlisted operation/error categories. FIND, INSERT, UPDATE, DELETE, AGGREGATE and COUNT can be displayed when explicitly supplied; unsupported names remain `mongodb query`. It never infers operations from query text. The shared preload removes queries, filters, documents, database/collection names and raw span names before ingestion.

MongoDB is **Experimental** until controlled native-driver ingestion and trace correlation tests pass. Parser support and package installation alone do not make it production-ready. Receiver advanced tracing/schema must already be available; the guide never applies migrations or changes production flags.

## 4. Node.js + Express + Mongoose

```sh
npm install mongoose@8.19.2
```

Use **http,express,mongodb**, not `mongoose,mongodb` for this baseline. Mongoose is an ODM built on the MongoDB native driver. Instrument the underlying driver once to measure database CLIENT calls without duplicating higher-level ODM and lower-level driver spans. The preload explicitly disables `@opentelemetry/instrumentation-mongoose`, even if accidentally listed in the environment. Do not manually register it again.

Installed Mongoose instrumentation 0.71.0 documents Mongoose >=5.9.7 and <10, but this guide does not enable or certify it. Verify the actual nested MongoDB driver version in your lockfile (`npm ls mongoose mongodb`). Do not install a second native driver just to instrument Mongoose's own dependency.

Connect only to a synthetic disposable database, then execute `await Model.findOne({}).lean().exec()` inside a development HTTP route. Return `{ok:true}`, not the record. Open that request's trace and expect driver-level MongoDB CLIENT work correlated by Trace ID. This baseline does not capture validation, population or other ODM-only work as separate spans. Mongoose remains Experimental until the separate controlled Mongoose scenario passes; native-driver verification alone is insufficient.

## Trace retrieval and interpretation

The workspace uses the existing HttpOnly session. Scripts may use `Authorization: Bearer YOUR_LOGIN_TOKEN` to call:

- `GET /api/monitoring/projects/PROJECT_ID/status`: HTTP activity, separate database activity, retained HTTP SERVER count and seven-day retention. Availability remains unknown.
- `GET /api/monitoring/projects/PROJECT_ID/spans?limit=100`: latest HTTP SERVER spans ordered by receipt. Default limit is 50; allowed range 1..100.
- `GET /api/monitoring/projects/PROJECT_ID/spans?trace_id=LOWERCASE_NONZERO_32_HEX_TRACE_ID&limit=100`: enabled advanced read capability only; returns available SERVER/CLIENT spans ordered by start time, scoped to the owned project. `possibly_truncated` warns at the cap. No pagination or complete-trace guarantee exists.

A shared Trace ID is correlation, not a fabricated direct parent relationship. Parent IDs may refer to omitted INTERNAL spans. Sampling, exclusions, response limits and retention can leave gaps. Unflagged database status is Unknown, not proven Success. Overlapping database durations must not be added to claim request time caused by the database.

## Limits, transport and troubleshooting

Only OTLP/HTTP **application/json** traces are accepted. Protobuf and gRPC are unsupported. `/otlp/v1/logs` and `/otlp/v1/metrics` return 501. Request limit: 256 KB decompressed, 100 total input spans; project quota: 600 newly stored spans/minute; ingestion and management rate limits: 120 requests/IP/minute each. Duplicate project/trace/span IDs are ignored. Advanced payload validation also bounds resources, scopes, attributes, events and timestamps. See OpenAPI for details. Retention prunes received spans older than seven days asynchronously in bounded minute jobs, not exact immediate expiration.

- **EADDRINUSE / wrong process:** choose a free development port or stop only your own process. Confirm the request reaches the newly instrumented app. Never restart production for a guide.
- **Missing instrumentation:** install the pinned packages in the backend, match `mysql` vs `mysql2`, preload before imports, and check `npm ls`. Unlisted drivers/frameworks are not certified.
- **Missing database spans:** await a real operation inside the HTTP handler; check driver versions and receiver advanced capability. Background operations need not share a request trace; do not invent correlation.
- **401:** missing, malformed, revoked or wrong project ingestion key. Use user authentication for reads. **403** on management: refresh cookie session/CSRF and verify trusted origin.
- **400:** malformed OTLP, IDs, duplicate/excess attributes or invalid timestamps. Advanced start times must be within seven days, end within five future minutes and duration <=24 hours. **413:** reduce body/batch size. **415:** use http/json. **429:** respect Retry-After and reduce throughput. **503:** administrator must check storage/schema availability; no provider details are exposed.
- A **200 `{}`** ingestion response can store zero eligible/new spans. `X-TO-Stored-Spans` counts new stored rows, including advanced database calls; it does not establish an HTTP connection by itself.

Do not capture raw SQL, MongoDB query/filter/document contents, credentials, private identifiers, records or stack traces. Never turn on enhanced database reporting to diagnose missing telemetry. Logs/metrics pipelines and other Node frameworks remain Planned.

## Maintainer verification (isolated only)

```powershell
npm ci --prefix tools/monitoring-integration-tests
node --test tools/monitoring-integration-tests/integrations.test.cjs
```

The harness builds a clean environment, generates a test-only key, starts an isolated receiver and disposable loopback MongoDB 7.0.24, and runs the documented privacy preload with HTTP, MySQL2 protocol fixture, native MongoDB and Mongoose separately. It never loads .env or the reference app entry point, and accepts no production URI/key. The MongoDB binary is downloaded into an ignored test cache. Test receiver storage is isolated in memory; existing disposable PostgreSQL tests separately verify the storage boundary. No database migrations are applied by this onboarding test.
