# Monitoring migration review — November 25, 2026

## Target and approval boundary

The owner confirms the production Supabase database has **none** of the four
`monitoring_*` tables. Both migrations are therefore a fresh, ordered installation.
No production SQL or deployment was executed during this review. The Render
entry point, existing authentication and existing Supabase client are preserved.

There is no local Supabase CLI/Docker installation on this machine. Tests used a
disposable **real PostgreSQL 17.12** cluster with Supabase-style `anon`,
`authenticated` and `service_role` roles, plus an untrusted custom role. This is
not a full Supabase instance or branch. A real Supabase/PostgREST verification is
still required before production approval, especially on a different PG version.

## Final migration files and scope

1. `migrations/20261124_monitoring_v1.sql`: creates exactly four new tables,
   indexes, constraints, RLS and minimal server-role grants in one transaction.
2. `migrations/20261125_monitoring_ingestion.sql`: adds the project receipt
   timestamp and pruning indexes, removes the unused quota RPC, and creates the
   three service-only definer RPCs in one transaction.

Both fail on existing Monitoring object names instead of silently accepting an
incompatible schema. Record them as applied once. Do not rerun files or substitute
`../migrations/monitoring-schema.sql`, which is an unrelated prototype. Failures
must be inspected; never add CASCADE or broaden grants to make a failure disappear.

Only `public.monitoring_projects`, `public.monitoring_project_keys`,
`public.monitoring_spans`, `public.monitoring_ingest_buckets`, their indexes and
the explicitly named Monitoring functions are changed. No Analytics, student,
quiz, Splunk or prototype tables are modified. The unnecessary `pgcrypto`
installation was removed: UUIDs use PostgreSQL's built-in
`pg_catalog.gen_random_uuid()` (PostgreSQL 13+). Neither shared schema privileges,
shared default privileges, role memberships nor existing extensions are changed.

## Function and permission hardening

All three definer functions use `SET search_path = ''`. Relations and record
types are explicitly `public.*`; built-in functions are explicitly `pg_catalog.*`.
This prevents writable `public` objects and temporary relations from shadowing
privileged operations. SQL constructs such as COALESCE and GREATEST are syntax,
not caller-resolved functions.

The function ACL pass strips all default EXECUTE grantees on exactly these three
functions, including custom roles, before granting EXECUTE only to `service_role`.
This occurs in the creation transaction, so PUBLIC access never becomes visible
at commit. Database owners/superusers retain administrative control; server-role
membership remains a trusted administrative boundary.

Table default grants are likewise removed only on the four new tables. The
backend service role receives SELECT, INSERT on the project's owner/name/runtime/
environment columns, and UPDATE only on the key's `revoked_at` column. It cannot
directly insert keys, insert/delete spans, alter hashes, write quota buckets or
delete projects. Those writes happen through the reviewed definer functions.
This matches backend references in `monitoring-api.cjs`.

All four tables have RLS and no browser policies. Anon/authenticated have neither
table grants nor RPC execution. Even when SELECT was temporarily granted in an
isolated test transaction, RLS returned no private project rows and denied inserts.
This architecture does not equate Mongo account IDs with Supabase `auth.uid()`.
Per-user ownership is still enforced by existing verified sessions and explicit
owner filters in Express. A compromised service-role credential is privileged;
the database does not pretend that service_role is an individual developer.

References: [Supabase function security](https://supabase.com/docs/guides/database/functions),
[PostgreSQL definer safety](https://www.postgresql.org/docs/17/sql-createfunction.html),
and [Supabase column privileges](https://supabase.com/docs/guides/database/postgres/column-level-security).

## Quotas, ownership and revocation

Repository searches found **no backend caller** of
`monitoring_claim_ingest_quota(uuid,integer,integer)`. It is no longer created by
the baseline. Migration 2 drops an older copy with the exact signature and no
CASCADE. An unexpected dependency aborts and rolls back migration 2; this behavior
is tested. The only quota writer is now the ingestion transaction.

Key creation checks the verified owner's ID, locks the project and allows at most
three active keys, including concurrent requests. Hashes must be 64 lowercase
hex characters; prefixes must match the backend's 16-character format. Secrets
are still hashed in Node and returned only once; SQL never receives the raw secret.

Ingestion locks and revalidates the active key, then locks its project. The
project ID always comes from that key; an extra payload project ID is ignored.
Only new unique `(project_id,trace_id,span_id)` rows consume the fixed 600-span
minute quota. Input batches are bounded to 100 spans / 256 KB at the SQL boundary
as well as the existing HTTP limits. The quota has no caller-supplied maximum.

The wall-clock timestamp is taken **after** lock waits, so a transaction started
before a minute boundary cannot charge a stale minute after a long wait. The
subtransaction rolls back spans, quota, project timestamp and key-use timestamp
when quota fails. Empty batches and duplicates never advance project connection
status. An outer transaction rollback also undoes all four kinds of writes.

Revocation and ingestion serialize on the key row: revocation committed first
rejects the waiting ingestion. An ingestion already holding the lock commits
before a waiting revocation; every subsequent ingestion is then rejected. The
suite tests both orderings rather than claiming revocation cancels committed work.

Database constraints reject blank owners/names, invalid runtimes/environments,
malformed/zero trace IDs, non-HTTP methods, query/fragment/control characters in
routes, oversized names/routes, invalid status/duration values, non-finite start
times, orphan keys and quota counts outside 1–600. The parser now also drops unsafe
route attributes before they can become database constraint failures.

## Retention invocation

`api/index.js` calls `startMonitoringRetention()` after starting the existing
server and clears its interval on server close. In `routes/monitoring.js`, the
60-second callback invokes the existing Supabase client's
`rpc('monitoring_prune_expired')`. A running flag skips overlaps and a finally
block allows retry after an error. The timer is unref'd; it is not a separate
backend or a new external scheduler.

The pruning function uses a fixed transaction advisory lock, skips locked rows,
and deletes at most 10,000 expired spans and 10,000 expired quota buckets per run.
Seven-day spans and two-hour buckets are the only deletion targets. The test
invokes the **actual scheduler callback against the actual SQL pruning function**
and verifies two ticks remove 10,001 expired spans while preserving a fresh span.
It also tests contention on the advisory lock and retention failure recovery.

Retention runs only while Render is running. If Render sleeps, cleanup resumes
when it wakes; this is asynchronous retention, not an exact expiration guarantee.
Monitor backlog and errors. Do not add pg_cron or an external job without review.

## Tests and reproduction

From `C:\ClientApps\JOINAPPTO\to-backendapi-v1`:

```powershell
npm ci --prefix tools/monitoring-db-tests
npm run test:monitoring-migrations
npm run test:monitoring-retention
node --test tests/parser.test.cjs tests/monitoring.test.js tests/monitoringRetention.test.js tests/passwordLogin.test.js tests/database.test.js
```

The pinned test-only PostgreSQL runtime and client live in
`tools/monitoring-db-tests/package.json` and its lockfile; production dependencies
are unchanged. The runner never reads `.env`, never accepts a remote URL, listens
only on `127.0.0.1`, uses a generated test password, and stops the server afterward.
Generated clusters remain in the ignored `.data/` directory for inspection. It
creates no Windows service, Docker container or host user. On Windows the package's
optional symlink manifest is empty; no extra install script was required here.

Database suite: **14 scenarios passed** (15 TAP tests including the parent):

- Both complete migrations and injected failure rollback at each commit boundary.
- Safe refusal to drop a quota RPC with unexpected dependent objects.
- Empty definer paths and cleanup of dangerous PUBLIC/custom default grants.
- Actual EXECUTE/table denials, RLS read isolation and RLS write denial.
- Project ownership and a 10-client race yielding exactly three active keys.
- Caller search-path, public-function and temporary-table hijacking attempts.
- Key scoping, duplicates, empty batches and privacy field filtering.
- Invalid batches/constraints and complete malformed-batch rollback.
- A 12-client, two-key quota race and quota rejection without partial writes.
- An eight-client duplicate race charging only one span.
- Both revocation/ingestion lock orderings and caller transaction rollback.
- Actual scheduler-to-SQL pruning, advisory contention and deletion batch limits.
- Fail-closed migration reruns and unchanged shared application canaries,
  extension metadata and shared default privileges.

Additional HTTP/parser/scheduler/authentication regression suite: **23 tests passed**.
The HTTP storage adapter is explicitly in-memory; concurrency and SQL assertions
above run against real PostgreSQL. No successful full Supabase/PostgREST test is
claimed. Prior Google-auth expectations are outside these migration changes.

## Safe production execution order

1. **Complete the remaining Supabase gate first.** Use a disposable local Supabase
   installation or a dedicated isolated branch, never production. Apply these
   exact files in order and verify server-role project creation/revocation and
   all three RPCs through its Data API, plus anon/authenticated denial. Verify the
   project's PostgREST schema exposure, actor/default privileges and PG version.
2. Have an operator verify the exact production project and run the read-only
   `monitoring-preflight.sql`. The four new table names and three RPC names must
   be absent. Inspect any old quota RPC dependencies. If this differs from the
   owner's stated fresh baseline, stop and review; don't bypass the guards.
3. Take the normal approved backup/restore checkpoint. Review the file contents
   and test results. Use the existing database owner/admin role; the scripts do
   not grant service_role DDL rights or install extensions.
4. Execute **20261124_monitoring_v1.sql first**, then
   **20261125_monitoring_ingestion.sql**, each as its own full transaction. Use
   Supabase's SQL editor or psql with `ON_ERROR_STOP=1`; do not wrap files in
   another transaction, run fragments independently, or push every migration in
   the repository. Lock waits over 5 seconds / statements over 60 seconds fail
   rather than indefinitely blocking the shared database.
5. If using psql, configure a connection service named `monitoring-approved`
   locally rather than placing a password in a command:

```powershell
psql 'service=monitoring-approved' -X -v ON_ERROR_STOP=1 -f supabase/migrations/20261124_monitoring_v1.sql
# Continue only if the first command succeeded and its results were reviewed.
psql 'service=monitoring-approved' -X -v ON_ERROR_STOP=1 -f supabase/migrations/20261125_monitoring_ingestion.sql
```

6. Rerun the read-only audit. Confirm four RLS-enabled tables, exactly the three
   expected RPCs, empty definer paths, service-role-only EXECUTE and narrow column
   grants. Allow Supabase to refresh its schema cache; if necessary, use the
   separately approved `NOTIFY pgrst, 'reload schema'` described by
   [PostgREST](https://docs.postgrest.org/en/stable/references/schema_cache.html).
7. Only after separate deployment approval, release the existing Render backend
   and verify registration, key generation, real OTLP writes/status and pruning.
   Preserve existing authentication, Supabase settings and Vercel API rewrites.
   Check existing Analytics, student, quiz, Splunk and payment flows before release
   sign-off. No automatic deployment was performed by this review.

## Failure and rollback behavior

An error within either file rolls back that entire file; earlier committed files
remain committed. With psql `ON_ERROR_STOP=1`, a failed connection exits and its
open transaction is rolled back. If manually testing in an interactive session,
issue ROLLBACK before retrying. Diagnose the failure before rerunning a file.

If migration 2 fails, migration 1's empty tables and RLS stay in place. Leave the
backend release pending and repair migration 2; **do not rerun migration 1**. If
the baseline has already been applied anywhere, keep its applied history intact
and use a separately reviewed forward migration for that target rather than
pretending the edited baseline will run again.

After successful production commits, rolling back a backend deployment does not
require deleting schema or data. Prefer leaving the Monitoring objects in place
and issuing a reviewed forward fix. Do not publish a destructive automatic down
migration: dropping these tables would permanently discard telemetry and keys.
Any requested database removal must be separately reviewed, backed up, limited
to Monitoring objects and performed without CASCADE into shared services.
