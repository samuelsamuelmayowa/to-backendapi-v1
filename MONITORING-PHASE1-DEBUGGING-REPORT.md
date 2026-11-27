# Phase 1 HTTP/MySQL correlation follow-up — November 27, 2026

## Outcome and verification boundary

**The isolated HTTP → MySQL → official OTLP exporter → receiver → PostgreSQL
pipeline passes. Live MAFACONNECT/production is not claimed fixed.**

The user confirmed that no isolated Supabase environment has been verified and
instructed this run to use local package/receiver tests only. Tests never loaded
MAFACONNECT app.js or its .env, connected to its database, sent telemetry to
Render/Supabase, or changed production records. The PostgreSQL probe uses the
existing Supabase migrations and ingestion function, through a small local SQL
adapter; it is not a Supabase/PostgREST stack test.

## Verified findings

1. **The previous connection-status defect is already corrected in this
   checkout.** The original implementation used last_received_at, advanced
   ingestion's all-signal timestamp, to claim fresh HTTP telemetry. The current
   status route instead queries the latest project-scoped HTTP SERVER receipt.
   Database CLIENT activity cannot refresh connected, has_received or
   last_seen_at. Database/all-signal timestamps remain separate. Overview's
   span_count remains SERVER-only. Availability remains unknown.
2. **The current local listener still does not match the explicitly preloaded
   process.** Inspection in this run found port 8000 owned by PID 29676 with no
   explicit preload/env-file flags. PID 24864 had both flags but no listener.
   These are point-in-time local observations, not a production process audit.
   Command-line inspection alone cannot exclude inherited NODE_OPTIONS. No HTTP
   request was sent to either real process, and neither process was restarted.
   Thus receiving controlled requests on the intended live MAFACONNECT process
   remains unverified despite the earlier conflicting backend being stopped.
3. **The onboarding configuration excludes MySQL.** The actual current .env
   allowlist and frontend-generated settings were http,express. An explicit
   allowlist excludes mysql2. The generated guide now includes mysql2; the
   private .env is unchanged. Recent historic MySQL spans therefore cannot be
   attributed to a process using exactly those current disk settings without
   further evidence about its effective environment.
4. **No missing SERVER/exporter/parser defect reproduced with the installed
   packages.** Node 22.23.3, Express 5.2.1, auto-instrumentations-node 0.83.1 and
   sdk-node 0.301.2 exported and stored SERVER and MySQL spans together with HTTP,
   Express and mysql2 enabled. Configuration was set before official preload;
   application/library imports happened afterward. No second SDK was created.
5. **Express INTERNAL parents explain a retained-graph gap, not broken context.**
   MySQL request spans point to Express INTERNAL spans, which Phase 1 deliberately
   excludes. The probe captured only graph metadata at OTLP ingress and verified
   the complete original parent chain to each SERVER. Stored trace IDs and
   parent IDs are preserved; no fabricated direct SERVER parent was introduced.
   Trace Explorer already represents missing parents without inventing spans.

The supplied 535 SERVER / 112 recent MySQL production snapshot was not refreshed
or modified. Startup Sequelize authentication/synchronization can produce DB
spans before listening; isolated startup work reproduces a separate root trace.
That does not prove every production DB span was startup/background work. No
shared production trace IDs means those stored rows do not establish request
causation. Historical exporter errors, effective process environment and the
precise non-listening-process failure remain unavailable.

## Controlled request evidence

The synthetic MySQL protocol server listens only on loopback, returns a constant
test result with a small delay for success, and returns a controlled error for
failure. It is not a real MySQL engine. The client is the application's installed
mysql2 package. The successful request uses its Promise API; startup and failure
also exercise callback operations. Neither test uses customer queries/data.

The repeatable test uses the **frontend-generated configuration** with its
endpoint/key replaced by a loopback receiver and a static dummy key. Other OS
environment inheritance is allowlisted; production OTEL/NODE_OPTIONS settings
are not inherited by the instrumented child.

| Stage | Verified result |
| --- | --- |
| Startup operation | 1 MySQL root, separate from request traces |
| Successful HTTP request | HTTP 200, 1 SERVER and 1 non-error MySQL CLIENT on the same trace |
| Failed HTTP request | HTTP 500, 1 SERVER and 1 error MySQL CLIENT on the same trace |
| Official JSON export | 2 SERVER, 3 CLIENT and 2 INTERNAL spans received |
| Receiver | All export requests returned 200; X-TO-Stored-Spans totals 5 |
| Validation/projection | 2 INTERNAL spans intentionally excluded; 5 supported spans retained |
| Real local ingestion RPC | Existing monitoring_ingest_spans_v2 executed as service_role |
| Persistence | 2 SERVER + 3 CLIENT read back from disposable PostgreSQL, correct project |
| Correlation | Both DB request spans' exported parent chains reach their matching SERVER |
| Privacy | Synthetic private marker absent from stored rows |
| Production traffic | Zero |

No supported request span was lost in that test. Missing INTERNAL parents are
lost at the intentional fixed-field/kind projection, while shared trace IDs
survive. The earlier probe's direct-parent-only check incorrectly treated this
normal retained graph as uncorrelated; its check is now ancestry-aware.

## Exact changes in this follow-up

Frontend:

- src/lib/otelSetup.js: generated allowlist becomes http,express,mysql2.
- src/pages/ApplicationsPanel.jsx: explains enabling the three together,
  advanced dependency storage, and why DB-only activity is not HTTP connection.

Backend/test tooling:

- tests/helpers/monitoringFixture.js: optional local storage adapter and export
  observation hook, preserving the existing default in-memory fixtures.
- tests/monitoringActivity.test.cjs: regression for SERVER → excluded Express
  INTERNAL → MySQL CLIENT; preserves IDs, checks exact trace read, and verifies a
  malformed mixed batch stores no partial HTTP rows.
- tools/monitoring-node-probe-app.cjs: synthetic successful/error MySQL protocol
  replies, Promise/callback client operations, separate startup work and an HTTP
  failure route. No MAFACONNECT business routes were changed.
- tools/probeInstalledMonitoring.cjs: observes aggregate OTLP receipt results,
  validates full exported ancestry, can use actual frontend setup and disposable
  PostgreSQL. It no longer requires MySQL's immediate parent to be the SERVER.
- tools/monitoring-db-tests/probeStorage.cjs: fresh localhost PostgreSQL cluster,
  existing migrations, actual key lookup/RPC, read-after-write persistence check.
  Only the fixture seed uses local admin; receiver permissions are unchanged.
- tools/monitoring-db-tests/correlation.test.cjs and package.json: explicit,
  repeatable integration regression. Requires an installed-package directory;
  without it the test reports skipped rather than claiming success.
- examples/monitoring-node/.env.monitoring-test.example: review-only local
  configuration with a dummy key, no production credentials and no remote URLs.
  The runner generates equivalent settings with ephemeral ports.

No production receiver validation, quota, schema or authentication changes were
necessary in this follow-up. The prior status fix and separate HTTP/database UI
remain intact. No MAFACONNECT files, private environment, business logic or
running processes were changed by this follow-up. T.O. Analytics and Splunk
Studio code were not edited.

## Tests

- Full backend regression suite: 127 passed, 0 failed.
- Frontend regression suite: 36 passed, 0 failed; production build passed.
- Existing disposable PostgreSQL migration suite: 16 passed, 0 failed, including
  mixed-span quota contention/rollback, malformed rows, revocation, privileges,
  project scoping and shared Analytics/Splunk canaries.
- Official success/failure/background correlation integration: 1 passed,
  0 failed, 0 skipped; all five expected spans persisted and correlated.
- Build advisory: existing large JavaScript chunk warning; no build failure.

The full backend suite includes existing Analytics/Options/Splunk regressions.
The activity tests cover DB-only freshness, historic HTTP with fresh DB/outbound
HTTP, HTTP-only counts, empty/duplicate/quota-rejected batches, future receipts,
authentication/CSRF, cross-owner denial and the newly retained-graph scenario.

Reproduce the integration test from the backend directory in PowerShell:

    $env:MONITORING_TEST_APPLICATION_DIR='C:\ExternalProject\MConnect\api'
    npm run test:monitoring-correlation

Only installed library packages are read from that directory. Do not substitute
production credentials or source the application's .env. The test requires the
existing tools/monitoring-db-tests dependencies. Disposable data remains under
that tool's ignored .data directory for inspection; test clusters stop on exit.

## Deployment and rollback for review

1. Review this follow-up and the previous status fix together. No push/deploy,
   migration or production write has been performed.
2. Provision/verify a dedicated development application database and Supabase
   project before any live app-to-Supabase test. The example file is a review
   template, not a complete safe configuration for app.js: it intentionally has
   no MAFACONNECT database credentials. Do not point real app.js at it until all
   application dependencies and startup DB behavior have been reviewed.
3. Resolve ownership of port 8000 in a controlled maintenance step. Use one
   intended process, configuration loaded before the OTel preload, and preload
   before app.js imports HTTP/Express/mysql2. Prior opt-in start:monitoring and
   ecosystem.monitoring.config.cjs files remain available for review; this run
   does not select or execute them. Verify ownership again after replacement.
4. In the isolated deployment explicitly enable http,express,mysql2 and advanced
   receiver dependency ingestion. Keep http/json, export batches <=100 and the
   existing project key/tenant boundaries. DB spans share the existing 600 stored
   spans/project/minute budget; inspect actual 400/413/415/429/503 responses and
   SDK drops. Do not bypass validation or raise quotas to hide failures.
5. Send one approved, read-only database-backed development request. Verify
   actual HTTP receipt, exporter response, SERVER and MySQL rows in that test
   Supabase project, shared trace ID, real parent context and failure/duration
   fields. Background DB-only traffic must not refresh HTTP connected status.
   Retained INTERNAL parent gaps are expected; do not rewrite parent IDs.
6. Release the already-reviewed status backend before/with the frontend so the
   old all-signal semantics cannot mislabel database activity. Confirm Overview
   counts remain HTTP SERVER-only, separate timestamps remain visible, and
   availability stays unknown. Production rollout requires separate review and
   the isolated acceptance test above; it has not been authorized/performed here.

Rollback: revert the frontend guide change if necessary and restore the prior
reviewed startup selection in a controlled restart. No schema/data rollback is
needed. Keep the corrected HTTP-only status semantics: reverting that fix would
restore the known database-only false positive. The added test tooling does not
run in production or alter other application features.
