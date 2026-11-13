# Splunk Studio synthetic training data in Supabase

This integration uses two dedicated `public` tables for original synthetic `toa_*` training data. It does not copy Buttercup data, student accounts, search history, saved searches, dashboards, alerts, mission progress, or any other application collection/table.

## 1. Create the isolated tables

In the Supabase project SQL Editor, review and run [`../supabase/migrations/20261113_create_splunk_training_store.sql`](../supabase/migrations/20261113_create_splunk_training_store.sql). It creates only `splunk_lab_datasets` and `splunk_lab_events`, enables RLS, and grants access to `service_role` only. Never put the service-role key in frontend variables or browser code.

## 2. Configure the backend

Keep the existing application `DATABASE_URL` unchanged. Configure the backend environment with:

```text
SPLUNK_TRAINING_STORE=supabase
SUPABASE_URL=<your Supabase project URL>
SUPABASE_SERVICE_ROLE_KEY=<your Supabase service-role key>
```

The training catalog and event search use the Supabase tables. MongoDB continues to hold the existing application data and student search history. The API routes remain behind the existing verified Firebase student middleware.

## 3. Seed and verify

From the backend repository, after applying the SQL and configuring the backend environment:

```powershell
npm run seed:splunk-supabase-synthetic
npm run verify:splunk-supabase-data
```

The seed uses deterministic 24-character event IDs and upserts in batches, so rerunning it does not duplicate records. It loads 39,532 `toa_web`, 40,088 `toa_auth`, 30,244 `toa_sales`, and 16 `toa_prices` events (109,880 total). The verifier checks catalog metadata, stored counts, SPL counts, All Time behavior, pagination, historical time filtering, and unsupported-command errors.

Do not enable `SPLUNK_TRAINING_STORE=supabase` on the hosted backend until the migration has been applied and the verification script passes. The seed and verification scripts use the Supabase service role from the backend environment; do not paste credentials into chat or commit them.
