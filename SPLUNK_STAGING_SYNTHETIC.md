# Isolated Splunk training data for staging

Buttercup records are Splunk tutorial material. Splunk's site terms restrict copying and distribution of site content unless specifically permitted or Splunk gives express prior written authorization. The tutorial pages identify the downloadable data but do not grant public redistribution rights. Treat educational/commercial student hosting as uncleared until Splunk's written authorization explicitly covers hosting and redistributing these files to your students. This seeder creates independent, original T.O. Analytics synthetic records instead.

## Safety boundary

The staging seeder only reads `TOA_SPLUNK_STAGING_DATABASE_URL`. It requires a remote MongoDB host, rejects loopback and production-like hostnames, requires the exact hostname to match `TOA_SPLUNK_STAGING_ALLOWED_HOST`, and accepts only the database name `toa_splunk_staging`. It also requires `TOA_SPLUNK_STAGING_CONFIRM=seed-toa-splunk-staging`. It never reads `DATABASE_URL`, never points to the local Buttercup database, and only writes `splunk_lab_datasets` and `splunk_lab_events` for the `toa_*` synthetic indexes. Student-work collections are not modified.

## Stage seeding

Create a separate MongoDB staging database and a database user scoped to that database. On the staging backend, keep `DATABASE_URL` pointed at its isolated application/student-work database and set `SPLUNK_TRAINING_DATABASE_URL` to this dedicated training database. The production app can use the same split so deploying the training records never requires redirecting all Mongo-backed application and student-work models. Configure the following values in the staging backend's private environment:

```text
DATABASE_URL=<existing isolated staging application/student-work database>
SPLUNK_TRAINING_DATABASE_URL=<dedicated MongoDB training database>
```

Configure the following seed-job variables in a protected shell or the staging job environment. Do not commit them or paste credentials into chat:

```powershell
$env:TOA_SPLUNK_STAGING_DATABASE_URL = "<staging MongoDB URL ending in /toa_splunk_staging>"
$env:TOA_SPLUNK_STAGING_ALLOWED_HOST = "<exact hostname from the approved staging MongoDB URL>"
$env:TOA_SPLUNK_STAGING_CONFIRM = "seed-toa-splunk-staging"
```

Then run:

```powershell
cd to-backendapi-v1
npm run seed:splunk-staging-synthetic
npm run test:splunk-student-search
```

The default seed creates **109,880 deterministic records** matching the verified local tutorial dataset counts across four original synthetic indexes: `toa_web` 39,532, `toa_auth` 40,088, `toa_sales` 30,244, and `toa_prices` 16. Writes are batched at 1,000 records per batch. A rerun upserts the same stable event IDs, checks the exact stored counts, and only marks a dataset `ready` after verification. If a count mismatch occurs, that dataset remains hidden as `importing`. MongoDB indexes are created from the existing dataset/event schemas. Verify the catalog shows the expected counts and test:

```spl
index=toa_web | stats count by status | sort -count
index=toa_auth action=failure | stats count by action
index=toa_sales | stats count by VendorID
index=toa_prices | table productId product_name price sale_price
```

The script has automated tests for full counts, synthetic field coverage, SPL statistics, staging target rejection, and idempotent upsert behavior. A staging MongoDB URL and two authorized staging Firebase accounts are still required for a live integration and account-isolation test. **Do not use `toa_web` as a claim that these are Buttercup data**; this is independently generated T.O. Analytics fictional training data.

## Atlas setup and Render connection

Create a dedicated Atlas database named `toa_splunk_staging` for staging. Keep the backend's existing `DATABASE_URL` on its separate staging app/student-work database. Set `SPLUNK_TRAINING_DATABASE_URL` on the staging backend to the same training DB URI. The backend opens that connection read-only for catalog and search and disables automatic index creation. The seed/migration job creates the declared indexes. Use a `read` database role for the backend runtime user and a separate `readWrite` role for the seeding/migration user, both restricted to the training database.

In Atlas, add the Render backend's outbound IP ranges (or an environment-scoped Render dedicated outbound IP) to the Atlas IP access list. Do not use `0.0.0.0/0`. Atlas requires both an IP access-list entry and a database user; its default connections use TLS. Keep the Atlas database URL only in Render's private environment.

## Rights-gated Buttercup migration

No original tutorial records are migrated by the synthetic seeder. If and only if Splunk gives written authorization covering the intended student hosting, set up staging values privately and run the separate streaming migration:

```powershell
$env:DATABASE_URL = "mongodb://127.0.0.1:27017/to_analytics_lab"
$env:TOA_SPLUNK_STAGING_DATABASE_URL = "<approved Atlas staging URI ending /toa_splunk_staging>"
$env:TOA_SPLUNK_STAGING_ALLOWED_HOST = "<exact Atlas hostname>"
$env:TOA_SPLUNK_STAGING_CONFIRM = "seed-toa-splunk-staging"
$env:TOA_BUTTERCUP_RIGHTS_CONFIRMATION = "written-redistribution-authorization-confirmed"
$env:TOA_BUTTERCUP_RIGHTS_REFERENCE = "<private written authorization reference>"
npm run migrate:splunk-approved-to-staging
```

Store connection values in a private environment manager; do not place credentials in shell history, source control, or chat. The migration rejects every source except the isolated local `to_analytics_lab`, requires the rights gate, selects only the four ready Buttercup catalog entries and their matching event records, streams in bounded batches, upserts by `_id`, checks the exact counts, and activates each catalog entry only after verification. It does not drop collections or access application/student collections. The migration command has not been run.

For original records, the expected counts are web 39,532, auth 40,088, sales 30,244, and prices 16. For synthetic records, the same count distribution is present under `toa_*`. Configure `SPLUNK_TRAINING_DATABASE_URL` in the staging backend to match the approved staging target, then run:

```powershell
$env:TOA_SPLUNK_STAGING_DATABASE_URL = "<same approved Atlas staging URI>"
$env:TOA_SPLUNK_STAGING_ALLOWED_HOST = "<exact Atlas hostname>"
$env:TOA_SPLUNK_STAGING_CONFIRM = "seed-toa-splunk-staging"
npm run verify:splunk-staging-data
```

The staging verifier checks catalog/event counts, both compound MongoDB indexes, exact `stats count`, error/auth/sales statistics, price rows, bounded-time results, pagination, and unsupported-SPL errors. Authenticated API and two-account ownership checks still need to be run against the staging deployment.
