'use strict';

const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { requireSession, requireTrustedOrigin } = require('../middleware/sessionCookie');
const { createManagementRouter, createOtlpIngestRouter } = require('../monitoring-api.cjs');

function monitoringError(error, req, res, next) {
  if (res.headersSent) return next(error);
  const status = error.status || error.statusCode;
  if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Request body exceeds the endpoint size limit' });
  if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON request body' });
  if (status >= 400 && status < 500) return res.status(status).json({ error: error.message });
  // Do not expose SQL, database URLs, or provider error details to the caller.
  const schemaMissing = ['PGRST202', 'PGRST204', 'PGRST205', '42P01', '42703'].includes(error.code);
  res.set('Retry-After', '30');
  return res.status(503).json({ error: schemaMissing
    ? 'Monitoring storage is not ready. The administrator must review and apply the Monitoring migrations.'
    : 'Monitoring storage is temporarily unavailable. Please retry shortly.' });
}

function createMonitoringRoutes({ getSupabase = () => require('../config/supabaseAdmin'), advancedTraces, advancedIngest } = {}) {
  function lazy(factory) {
    let router;
    return (req, res, next) => {
      try { router ||= factory({ supabase: getSupabase(), resolveUserId: request => request.authClaims?.userId, advancedTraces, advancedIngest }); }
      catch (error) { return next(error); }
      return router(req, res, next);
    };
  }
  const management = express.Router();
  management.use(requireTrustedOrigin, requireSession);
  management.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'Too many management requests. Retry shortly.' } }));
  management.use(lazy(createManagementRouter));
  management.use(monitoringError);

  const ingestion = express.Router();
  // Mounted before the shared JSON parser and cookie/CSRF stack: send-only key auth.
  ingestion.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'Too many ingestion requests. Retry shortly.' } }));
  ingestion.use(lazy(createOtlpIngestRouter));
  ingestion.use(monitoringError);
  return { management, ingestion };
}

function startMonitoringRetention(getSupabase = () => require('../config/supabaseAdmin'), { schedule = setInterval, logger = console } = {}) {
  let running = false;
  async function prune() {
    if (running) return;
    running = true;
    try {
      const { error } = await getSupabase().rpc('monitoring_prune_expired');
      if (error) logger.warn('Monitoring retention unavailable; verify the reviewed Monitoring migration.');
    } catch { logger.warn('Monitoring retention storage unavailable.'); }
    finally { running = false; }
  }
  const timer = schedule(prune, 60_000);
  timer.unref();
  return timer;
}

module.exports = { createMonitoringRoutes, monitoringError, startMonitoringRetention };
