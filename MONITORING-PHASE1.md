# Phase 1 architecture review and implementation plan

Review date: 2026-11-26. Local work only; no production schema or data changes.

## Existing architecture

Render mounts `/otlp/v1/traces` before the shared body/session stack. The receiver accepts JSON (256 KiB), verifies a hashed project key, and delegates atomic key revalidation, deduplication, quota and status updates to `monitoring_ingest_spans`. Management reads require the existing signed session and project ownership. Browser database roles have no table access. Key revocation locks serialize with ingestion. Limits are 100 input spans, 10 resources, 25 scopes/resource, 600 newly stored spans/project/minute, plus 120 HTTP requests/IP/minute per Render process. The latter is not a distributed global rate limiter.

Only HTTP SERVER rows currently survive. CLIENT spans, parent IDs, environment/version, names, exceptions and all unselected attributes are discarded. HTTP attributes support stable and legacy names. HTTP methods are NOT NULL in PostgreSQL, so database spans cannot be added without an additive migration. Existing unique(project,trace,span), project/time and retention indexes are reusable.

Retention invokes the real pruning RPC each minute from the existing Render process. Each call removes at most 10,000 rows older than seven days, across all projects. Multiple processes coordinate with a database advisory lock. Sleeping/stopped Render processes do not run this timer; backlog drainage and scheduler health need operational monitoring.

## Field inventory and privacy contract

| Input | Storage policy |
|---|---|
| Trace/span/parent IDs | Nonzero exact hex, lowercase; project assigned exclusively from key |
| Start/end | Valid nanosecond timestamps; duration 0–24h; start within seven days and at most five minutes ahead in advanced mode |
| Kind | HTTP SERVER, HTTP CLIENT, supported database CLIENT only |
| HTTP method/status | Stable `http.request.method` / `http.response.status_code`, legacy `http.method` / `http.status_code`; fixed methods including `_OTHER`, integer status |
| HTTP route | SERVER template only, bounded safe syntax; numeric/UUID/opaque segments collapsed; client URLs and paths discarded |
| Name | Synthesized from kind, method, or database system/allowlisted operation; never raw span name |
| Service | Bounded identifier; unsafe values replaced with `node-service` |
| Environment | `deployment.environment.name`, legacy `deployment.environment`; only development/staging/production/test, otherwise null |
| Version | Bounded numeric release version, otherwise null |
| Database | `db.system.name` / legacy `db.system`: mysql, postgresql, sqlite, redis, mongodb; fixed operation vocabulary from `db.operation.name` / `db.operation`, otherwise `query` |
| Errors | OTel ERROR or protocol error status; allowlisted exception/error type, other nonempty types collapse to `Error` |
| Everything else | Discard: SQL/query text and parameters, DB names/tables, hostnames, addresses, headers/cookies/tokens, bodies, exception messages/stacks, raw names, arbitrary attributes and events |

Validation caps attributes at 64 per resource/span, key length 128, scalar strings 4096, and events at 16 with the same attribute bounds. Duplicate keys, nested containers and malformed scalar values fail closed in advanced mode. Unknown valid scalars and arrays of at most 32 scalars are validated but never persisted (default SDK resource detectors emit arrays). Limits include unsupported spans so ignored data cannot evade the event budget. No JSONB attribute bag is introduced. An allowlist cannot detect secrets deliberately placed in identifier/template fields; operators must not put secrets in those fields. This is a constrained telemetry contract, not a universal DLP system.

## MAFACONNECT inspection

The actual entry point requires Express first, so official auto-instrumentation must remain preloaded before app.js. Existing normal `start`/`dev` scripts do not preload it. Installed auto-instrumentations-node 0.83.1 supports HTTP, Express and mysql2; installed mysql2 3.x is inside its supported >=1.4.2 <4 range. The supplied `OTEL_NODE_ENABLED_INSTRUMENTATIONS=http,express` excludes mysql2. Adding `mysql2` later is a reviewed configuration change, not a package/SDK replacement. mysql2 0.71.0 emits stable `db.system.name` and query text; it may omit an operation label, in which case Phase 1 stores generic `mysql query`, never derives a label from SQL. Node fetch needs undici instrumentation; HTTP instrumentation covers node:http/https clients. Express INTERNAL spans remain excluded; parent IDs can reference excluded spans, while trace IDs still correlate the retained spans. No .env is copied or disclosed, no actual application startup/Sequelize.sync is executed.

## Capacity and query impact

Reuse monitoring_spans with eight nullable/defaulted bounded fields, nullable HTTP method for DB rows, explicit cross-field constraints, and an index on (project_id,trace_id,started_at). No shared Analytics/student/quiz/Splunk objects change. A separate v2 RPC preserves the old ingestion contract. No arbitrary payload storage. Expected additional row/index footprint is approximately 150–350 bytes/span (planning estimate; measure pg_total_relation_size in isolated PostgreSQL before rollout). At 600 spans/minute sustained, one project can store 6,048,000 spans/seven days, roughly 3–7 GB including existing columns/indexes depending on actual row width and index bloat. This is an upper bound, not a capacity guarantee. Dependencies share the unchanged 600 budget: with 1 server + 4 dependencies, only ~120 complete requests/minute fit. Quota rejects the entire batch transaction, never partially accepts it. SDK sampling, queue drops and rejected batches can leave incomplete traces.

Seven-day pruning capacity is 14.4 million rows/day at one tick/minute; more than ~16 saturated projects can outpace it. Existing quotas bound per-project growth but do not provide a workspace/global byte cap. Review Supabase plan capacity, connection/load budgets and retention backlog before enabling broadly. New trace reads use project+trace index and return <=100 spans; responses explicitly signal possible truncation. Existing overview/status span counts remain HTTP-server-only for compatibility; dependency counts are not relabeled as HTTP requests. No joins or queries against Analytics tables.

## Implementation plan (written before code changes)

1. Keep the original parser/RPC as the default. Add strict advanced parser with fixed fields and stable/legacy mappings.
2. Draft a transactional Monitoring-only additive migration and v2 RPC with existing quota/key locks, grants, dedup and retention. Do not apply it to production. Enable only via explicit MONITORING_ADVANCED_TRACES_ENABLED=true after reviewed migration.
3. Gate advanced reads and ingestion consistently; add authenticated project-scoped trace filtering and bounded results. Missing schema fails with existing sanitized 503; never silently lose advanced fields.
4. Test parser privacy/bounds/correlation, HTTP authentication/revocation/quota behavior, default-mode regression, and SQL against an isolated local PostgreSQL if available. Use a controlled official-instrumented HTTP app to prove an outbound CLIENT shares the SERVER trace; no production destination/credentials.
5. Run backend regression suite. Record exact outcomes and remaining rollout gates below.

Semantic references: https://opentelemetry.io/docs/specs/semconv/http/http-spans/ and https://opentelemetry.io/docs/specs/semconv/db/database-spans/ . These specify CLIENT dependencies, current field names and HTTP client 4xx error behavior. Installed mysql2 instrumentation README/source is the version-specific compatibility reference.

## Implementation and verification results

Implemented the fixed-column parser, gated receiver/read path, separate v2 RPC migration, trace index, project-scoped correlation query, and tests. Original migrations are unchanged. Public OpenAPI documents optional advanced fields/query. No new SDK, service, explorer or dashboard was added.

- Final complete backend suite: **124 passed, zero failures/cancellations**, including authentication, Analytics, Splunk and Monitoring. An earlier full run had an unrelated Jobs test timeout; the Jobs-only retry and final full run both passed.
- Backend syntax checks: **15 files passed**, without starting providers/schedulers.
- Disposable **PostgreSQL 17.12: 16 tests passed** (15 subtests plus parent), covering original and additive migration rollback, RLS/default-grant cleanup, ownership, constraints, old RPC compatibility, mixed-span concurrent quota rollback, revocation locks, retention and unchanged Analytics/student/quiz/Splunk canaries. This models Supabase roles; it is not a complete local Supabase/PostgREST stack.
- Controlled official-package export: Node 22.23.3, Express 5.2.1, auto-instrumentations 0.83.1, SDK 0.301.2; **two SERVER spans and one CLIENT span**, matching trace/direct parent, private URL marker absent, correct isolated project, zero production requests/database connections. Both env-only and default resource detector modes passed. One earlier default-detector child startup timed out and passed on retry.
- A mixed HTTP/DB pair averaged **215 bytes per heap tuple**, excluding indexes/TOAST/bloat. EXPLAIN with sequential scans disabled confirms the trace index supports project+trace+start lookup; this is not a production load benchmark.

### Safe reproduction

From the existing backend directory; these commands do not load .env or contact production:

```powershell
npm run check:backend
npm run test:backend
node --test tools/monitoring-db-tests/migrations.test.cjs
node tools/probeInstalledMonitoring.cjs C:\ExternalProject\MConnect\api --dependencies --default-detectors
```

The probe resolves installed packages only, never app.js, .env or Sequelize. It uses static dummy credentials and in-memory storage. The migration test creates/stops its own localhost cluster and retains its ignored data directory for inspection.

### Reviewed activation order — not executed

1. Review migration, capacity and retention budgets, current constraints/row count, and representative-volume results on an isolated Supabase branch. Local PostgreSQL tests do not replace the environment-specific Supabase/PostgREST schema-cache gate.
2. Ship compatible code with `MONITORING_ADVANCED_TRACES_ENABLED` unset/false. Existing server ingestion still uses the old parser/RPC. Do not rerun the original migrations.
3. With explicit approval, apply only `20261126_monitoring_dependencies.sql`. It is transactional and fails closed on rerun/drift. ALTER constraints and non-concurrent index creation scan/lock the table: review a low-traffic window. Lock timeout is 5s, statement timeout 60s; large tables need a separately reviewed online migration plan.
4. Verify schema/grants/cache, then deliberately enable `MONITORING_ADVANCED_TRACES_ENABLED=true` and restart Render. Set `MONITORING_ADVANCED_TRACES_INGEST_ENABLED=false` to validate advanced reads before collecting dependencies; otherwise advanced collection defaults enabled with the main flag.
5. Preserve the working official preload command. Add `mysql2` to `OTEL_NODE_ENABLED_INSTRUMENTATIONS` only after review if MySQL spans are desired; add `undici` for Node fetch where applicable. Keep logs/metrics exporters none and the working JSON endpoint/header unchanged. Keep export batches <=100, review SDK attribute/event limits against the receiver, and monitor whole-batch 400/413/429/503 failures and SDK queue drops. Do not enable every instrumentation indiscriminately.
6. With approval to write test telemetry, make one controlled request with an outbound call. Find its server trace in authenticated `GET /api/monitoring/projects/{id}/spans`, then query the same path with `?trace_id=<id>&limit=100`. Confirm dependency trace IDs match. Parent IDs may reference excluded INTERNAL spans. Reads are capped at 100; `possibly_truncated` is conservative, not a complete-trace guarantee. Never print the ingestion secret or record request contents.

### Rollback and unsupported scope

After advanced rows exist, keep the main feature flag true for accurate server-only counts/advanced reads, but set `MONITORING_ADVANCED_TRACES_INGEST_ENABLED=false` and restart Render to restore original server-only collection. Keep the additive schema/data and pruning. Do not drop columns/functions or revert all code while dependency rows remain: old reads would count dependencies as HTTP spans. A destructive downgrade requires a separately reviewed export/cleanup plan.

Unsupported: logs, metrics, protobuf/gRPC, arbitrary attribute bags/custom spans, Express INTERNAL spans, messaging/producer/consumer spans, database systems outside the documented five, raw SQL/URLs/hosts/database/table names, bodies/headers/messages/stacks, nonnumeric service versions, waterfall UI, sampling control/complete traces, pagination beyond 100, global storage quota, distributed IP throttling and independent always-on retention scheduling. DB spans were verified using synthetic OTLP and real PostgreSQL storage; no customer MySQL query was executed. More specific DB labels require an official instrumentation to emit an allowlisted operation; SQL text is never parsed.

No MAFACONNECT files or production records/keys/schema/processes were changed. No commit, push or deployment was performed.
