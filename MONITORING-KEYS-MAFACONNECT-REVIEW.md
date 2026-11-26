# MAFACONNECT ingestion/key investigation

## Confirmed read-only findings

- The uniquely named MAFACONNECT API project has **three active keys**, zero
  stored HTTP server spans, and no recorded `last_received_at`.
- All three keys are already present in its recent three metadata records. The
  observed issue is not caused by history pagination on this project.
- An in-memory audit of the private MAFACONNECT `.env` confirmed the provided
  JSON exporter settings and a correctly formed key header. A read-only lookup
  confirmed that this configured key is active and belongs to this project.
  No secret or stored hash was printed, copied to another file or committed.
- During inspection, port 8000 had two local listeners: an `app.js` process on
  IPv6 and another Node process on IPv4. **Neither listener had OpenTelemetry
  preload flags.** A separate process had preload flags but no observed listener.
  No health request was sent to these real listeners during the investigation.
- MAFACONNECT is on `develop`. Its `app.js`, `package.json` and lockfile already
  contain local changes; those files were left untouched.

## Root causes and limits of the diagnosis

### Key management UI

The old `choose(id)` cleared `keys` even when the user clicked the currently
selected application. The loading effect depended on the project ID, which had
not changed, so it never reloaded the metadata. A failed creation at the three-key
limit then displayed the API's correct 409 message without refreshing the list.
The connection label interpreted that empty local array as proof that no keys
existed. A failed initial key-list request had the same misleading fallback.

`newSecret` was only the one-time display of a newly created secret; it was never
an inventory of existing credentials. That state must not determine whether an
ingestion key exists or whether telemetry has arrived.

The selected ID was generally used correctly in URLs. The reproducible bug was
same-ID state clearing, with additional stale-response risks around project
switches. The local fix binds both reads to one captured selection and rejects
responses/errors from older selections or superseded requests.

### Missing automatic telemetry

The currently observed health listeners on port 8000 are not the instrumented
process. Requests to those listeners cannot produce automatic spans merely
because a different Node process was launched with the preload argument.
The current package's normal `start` and `dev` scripts also omit instrumentation.

The supplied preload command is correct for this CommonJS application: Node's
`--env-file` loads configuration before `--require` registers instrumentation,
which runs before `app.js` requires Express. No second SDK initializer is needed.

The installed versions are Node 22.23.3, Express **5.2.1** (resolved by the
package's range), auto-instrumentations-node 0.83.1 and sdk-node 0.301.2. Two isolated
experiments used those actual installed packages and produced an authenticated,
valid HTTP SERVER span for `/`, accepted by the actual receiver/parser into a
fake local store. One used restricted resource detection; the other used the
SDK's default detectors. Both used a static dummy credential, no `.env`, no
application `app.js`, no MySQL/Supabase connection and no production destination.

This verifies package/JSON/parser compatibility. It does not prove every past
MAFACONNECT export attempt succeeded, nor capture historic terminal errors or
verify the real Node HTTPS/TLS path to Render. No production span was sent to
manufacture a successful live test. The exact reason the separate preloaded
process was not listening is not established from its unavailable terminal logs;
a bind/startup failure is a possibility, not a confirmed captured error.

The installed preload source also disables the diagnostic logger after its
initial instrumentation/resource-detector setup. Therefore absence of console
diagnostics alone must not be treated as proof that exporting works.

### Empty OTLP HTTP 200

`{"resourceSpans":[]}` is a valid empty batch. A valid project key can authenticate
it and receive HTTP 200 with `X-TO-Stored-Spans: 0`. It contains no HTTP SERVER
span, so it must not update the project's receipt timestamp or mark it connected.
The key's last-use metadata can still change; key usage is not trace receipt.

Eligible spans need server kind, nonzero hex trace/span IDs, string nanosecond
timestamps, and an approved `http.request.method` or `http.method` attribute.
Non-server/non-HTTP spans are ignored. Protobuf is rejected with 415. Connection
means at least one real eligible span was stored in the last 10 minutes.

## Local fixes prepared

Frontend:

- Project-scoped read controller with independent metadata/status loading and
  error states; same-project selection preserves metadata and one-time display.
- Explicit “No newly generated secret currently displayed” wording, separate
  from confirmed zero active keys and from unknown/failed metadata.
- Active key prefix, creation timestamp, last-used timestamp and revoke action.
  Revocation requires a second explicit confirmation in the UI.
- The generation action is disabled at the three-key cap and while inventory is
  unknown. Failed user-initiated creation refreshes metadata via GET, never by
  retrying POST. Reads/polling/selection never create or revoke keys.
- Connection text uses actual key metadata and stored-span status; an empty list
  from an error is never interpreted as zero keys. Unknown span count is shown
  as unavailable, not invented zero.
- Stale requests cannot expose another selection's secret, keys, status or errors.

Backend:

- The existing authenticated key-list read now returns active metadata plus
  recent history, deduplicated, and an exact project-scoped `active_count` and
  `max_active_keys: 3`. This also prevents older active keys from being hidden by
  a large number of newer revoked records.
- Only metadata columns are selected for listing. Ownership checks, key hashing,
  creation/revocation endpoints, limits, ingestion authentication and schema are
  unchanged. No old secret or hash is returned.

These edits are local only and require normal review before any deployment.
No MAFACONNECT source, private environment file or production record was changed.

## Proposed MAFACONNECT runtime fix — requires owner review

First identify the actual intended listener; do not kill every Node process or
stop the other local backend. With approval, stop/restart the appropriate plain
MAFACONNECT process, or choose an unused local test port and target that port.
Use the existing preload command rather than ordinary `nodemon app.js`:

```powershell
Set-Location C:\ExternalProject\MConnect\api
node --env-file=.env --require @opentelemetry/auto-instrumentations-node/register app.js
```

A minimal **proposed**, unapplied package-script addition is:

```json
"start:otel": "node --env-file=.env --require @opentelemetry/auto-instrumentations-node/register app.js"
```

Keep the existing start/dev scripts intact until reviewed. Confirm the listener's
PID and preload flags match the process you started, then target that exact local
port and allow batch export to finish. A live request would insert production
telemetry and requires the owner's approval; it was not performed here.

Also note that the current `app.js` invokes Sequelize `sync({alter:false,
force:false})` during startup. Even that existing call may create missing tables.
For that reason the agent did not start the real application or its database
initializers, and made no claim that an automatic restart is database-neutral.
Review the existing startup behavior before approving an agent-run restart.

The configured existing key is valid: **no new key or revocation is needed** to
perform a future approved trace test. If the private secret were lost later,
replacement/revocation would require a separate explicit decision.

## Focused verification

- Frontend: **22 tests passed**, including same-project reselection, key metadata
  rendering, loading/failure/unknown states, stale-selection rejection and no
  hash/secret disclosure. Build passed; lint passed with existing warnings.
- Backend: **18 tests passed**, including project isolation, three-key limit,
  revoked keys, old active metadata beyond 50 revoked entries, valid empty batch
  without connection, ingestion validation and official sample export.
- Actual MAFACONNECT-installed package probes: both stored one HTTP SERVER span
  for `/` under the correct **local test project**, with no production writes.

Reproduce local checks:

```powershell
Set-Location C:\ClientApps\JOINAPPTO\to-monitoring
npm test
npm run build
npm run lint

Set-Location C:\ClientApps\JOINAPPTO\to-backendapi-v1
node --test tests/monitoring.test.js tests/parser.test.cjs tests/monitoringExporter.test.js
node tools/probeInstalledMonitoring.cjs C:\ExternalProject\MConnect\api --default-detectors
```

The probe never imports the real entry point or private `.env`, accepts no remote
collector URL, and uses only a localhost receiver/static dummy credential.
