# Database performance and Learn Monitoring review

Local implementation only. No production requests, schema execution, deployment, service restart or configuration change performed.

## Stage 1: summary, naming and contextual education

Files: frontend `src/lib/databaseInsights.js`, `src/pages/DatabaseInsights.jsx`, `src/pages/TraceExplorer.jsx`, `src/pages/Overview.jsx`, `src/pages/ApplicationsPanel.jsx`, `src/pages/TraceExplorer.css`.

Completed: evidence-based HTTP summary; explicitly allowlisted operation names with MySQL query fallback; slow database call highlight and local slow-only filter; compact native expandable help in Overview, Applications and Trace Explorer. Existing parser already recognizes current db.system.name/db.operation.name and legacy db.system/db.operation. No SQL parsing or ingestion changes. Reference: https://opentelemetry.io/docs/specs/semconv/db/database-spans/ .

Tests: frontend threshold, safe naming, unknown outcome and server-rendered explanation tests; existing parser tests reject private SQL/attributes. No schema change. Privacy: local preferences contain only numerical thresholds and project IDs. Rollback: revert frontend additions; original details remain intact.

## Stage 2: timeline, count warnings and recorded errors

Files: frontend databaseInsights helpers/component and traceExplorerRender tests.

Completed: select a returned HTTP SERVER request; correlate supported database CLIENT spans only by Trace ID; one shared timestamp scale includes spans before/after HTTP boundaries, separate rows show overlaps, expandable safe metadata, missing parent notices, configurable count warning and supported 403/304 tips. Raw span hierarchy remains below. Native summary controls work with keyboard; timeline bars have text alternatives; mobile CSS limits educational panel width.

Unknown outcomes are never labeled success. Timeout and connection categories use explicit safe values; other recorded errors map to a generic database operation failure. Multiple HTTP SERVER spans in one trace create attribution ambiguity; the UI explains it. Counts are recorded trace-correlated operations, not complete request query counts. Duration includes client waiting/network time and overlapping calls are never added to claim causation. Span starts have the existing millisecond storage precision.

Tests: correlation excludes startup traces, unsupported systems and INTERNAL spans; threshold equality; overlap/outside-window positions; existing missing-parent tests; expandable explanation and timeline markup. No browser-level keyboard/mobile visual QA was performed; automated checks verify markup and responsive stylesheet only. No schema change. Rollback: revert RequestInsights integration, preserving original span details and ingestion.

## Stage 3: scoped backend statistics and thresholds

Files: backend `database-insights.cjs`, `monitoring-api.cjs`, `tests/databaseInsights.test.cjs`, `tests/helpers/monitoringFixture.js`, existing package test command; frontend DatabaseInsights component and Workspace navigation.

Completed: authorized project ownership check before query; CLIENT/database filters, exact safe service/system filters, 1h/24h/7d start-time ranges; newest up to 1000 stored operations, computed on backend independently of Explorer. Mean and linearly interpolated P50/P95/P99, duration sample size, operation/error/slow counts, unknown outcome count, hourly mean trend, empty/error/loading and cap warnings. Unflagged outcomes remain unknown; recorded error rate is a lower bound. Small samples below 100 warn about percentile reliability; P99 can remain unstable above that count. Gaps in the trend mean no returned data, never zero latency. Sampling and seven-day retention apply.

Not complete-history metrics: statistics intentionally describe a bounded newest-first subset, with possible truncation at 1000; no new metrics pipeline. Supabase deployments with a row cap below 1000 require matching the application cap before rollout; otherwise truncation cannot be reliably inferred. Filters are executed in storage, and only three safe fields leave storage for aggregation. Response and memory are bounded. The proposed partial index below should be reviewed before enabling this feature at scale; no query-plan claim has been validated against production.

Thresholds: browser-only per-project 500 ms/10-operation starting defaults, adjustable in trace details. Insights has its own explicitly labeled per-view slow threshold. No shared durable settings exist in the inspected project routes/schema. Durable settings are proposed below, not implemented or applied. Browser settings do not synchronize devices and can be unavailable when storage is disabled.

Backend rollout: MONITORING_ADVANCED_TRACES_ENABLED=true and MONITORING_DATABASE_INSIGHTS_ENABLED=true required for the insights endpoint. Frontend: VITE_MONITORING_DATABASE_INSIGHTS_ENABLED=true exposes navigation at build time. No flags changed. Deploy only after explicit approval, schema/index review and staging load verification. Roll back backend flag to false and rebuild frontend with its flag false; ingestion and HTTP-only activity/Overview counting remain unchanged. No destructive rollback migration needed.

Tests: isolated in-memory storage fixtures exercise authentication, cross-owner denial, project/system/time filters, cap, rollout flag, empty samples and numerical calculation. Existing monitoring tests cover privacy, quotas, correlation and retention. These mocks do not verify PostgreSQL plans/RLS. New tests are included in npm run test:monitoring.

## Stage 4: Learn Monitoring

Files: frontend `src/pages/LearnMonitoring.jsx`, Workspace navigation and render tests.

Completed: searchable 30-topic glossary covering HTTP/methods/status codes/cache/routes; monitoring, logs/metrics/traces/OTel/IDs/kinds/parents/durations/sampling/retention; supported databases, latency/timeouts/connections/indexes/N+1; latency/throughput/percentiles/error rates/bottlenecks/thresholds/investigation/correlation. Every entry includes meaning, importance, example and investigation advice. Native expandable content keeps education optional. This is separate from the student portal.

Tests: rendered search control, glossary topics, explanatory content and accessible labels. No schema change. Rollback: remove navigation/help imports and components.

## Validation record

- Frontend suite: 40 passed at last full run; production Vite build passed, with existing large-chunk warning.
- Lint: no errors; existing AuthContext/App warnings and a new state-in-effect advisory in the data-fetching view.
- Backend monitoring/insights/retention/exporter run: 33 passed, 1 failed, 1 skipped. Failure: official exporter sample startup timed out after 30 seconds. Skipped: port-ownership integration requires MONITORING_TEST_APPLICATION_DIR. Core endpoint/parser/correlation/retention tests passed with localhost permissions; sandbox-only runs failed with EACCES before that retry.
- Final core regression run: 32/32 passed. Isolated exporter retry also timed out at sample startup.
- Backend syntax checks passed. No backend production build script exists.
- Existing migration/RLS/retention validations on disposable PostgreSQL 17.12: 16 passed; no production connection loaded. Proposed new schema/index changes were not executed.
- No production database/migration tests or service restarts used. Final rerun results are reported in chat if they differ from this snapshot.

## Schema proposals (approval required, not applied)

Performance index candidate: `CREATE INDEX monitoring_spans_database_time_idx ON public.monitoring_spans(project_id, started_at DESC) WHERE span_kind = 'CLIENT' AND db_system IS NOT NULL;` Review index size, deployment lock strategy and EXPLAIN on isolated representative data before approval. This avoids sorting/scanning all project spans for the new bounded reads. Existing project/received-time and trace indexes remain intact.

Optional durable threshold design: a `monitoring_project_performance_settings` table with project_id primary key referencing monitoring_projects ON DELETE CASCADE, slow_database_ms integer CHECK 1..86400000 default 500, operation_warning_count integer CHECK 1..100000 default 10, updated_at timestamptz. RLS should deny direct anonymous reads/writes and restrict access to authenticated owners according to the existing identity mapping; management API must reuse ownedProject and service-role boundary. An eventual migration must include grants, owner-isolation tests and rollback design for approval before execution. No table, RPC, policy or settings-write endpoint was added in this phase.
