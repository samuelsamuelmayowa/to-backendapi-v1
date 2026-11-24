/*
  EXAMPLE ONLY — MERGE INTO THE EXPRESS APP YOU ALREADY START ON RENDER.
  DO NOT create a new server, replace index.js, or initialize Firebase twice.
  Uses your EXISTING Supabase service-role client and auth verification middleware.

  Requirements: npm install express @supabase/supabase-js (if not already installed).
  These example names are placeholders: use your actual existing files/functions.
*/

const { createManagementRouter, createOtlpIngestRouter } = require('./monitoring-api.cjs');

// In your existing Express initialization code, after initializing `app` and
// your trusted `supabaseAdmin` Supabase client, add these mounts:
function mountMonitoring(app, supabaseAdmin, verifyExistingLogin) {
  // `verifyExistingLogin` MUST cryptographically verify your actual user session
  // or Firebase ID token and put the VERIFIED UID on req.auth.uid.
  app.use('/api/monitoring', verifyExistingLogin, createManagementRouter({
    supabase: supabaseAdmin,
    resolveUserId: async req => req.auth?.uid || null,
  }));

  // OpenTelemetry uses a separate *ingestion-only* key, not a user session.
  // Important: if app.use(express.json()) is global, ensure it allows 256kb for
  // this endpoint or mount the OTLP router before any stricter global JSON parser.
  app.use('/otlp', createOtlpIngestRouter({ supabase: supabaseAdmin }));
}

module.exports = { mountMonitoring };
