'use strict';
const express = require('express');
const { randomBytes, createHash } = require('node:crypto');
const { parseOtlpHttpSpans } = require('./otlp-parser.cjs');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hashKey = value => createHash('sha256').update(value).digest('hex');

function errorResponse(res, code, message) { return res.status(code).json({ error: message }); }
function assertSupabase(supabase) {
  if (!supabase || typeof supabase.from !== 'function' || typeof supabase.rpc !== 'function') {
    throw new Error('A trusted server-side Supabase client is required');
  }
}
function publicIngestUrl() {
  return process.env.MONITORING_PUBLIC_OTLP_TRACES_URL || 'https://to-backendapi-v1-kctb.onrender.com/otlp/v1/traces';
}

// Supply resolveUserId(req), which MUST verify the user's existing authentication
// and return its stable user UID. Never read a user ID from a caller-controlled header.
function createManagementRouter({ supabase, resolveUserId }) {
  assertSupabase(supabase);
  if (typeof resolveUserId !== 'function') throw new Error('resolveUserId(req) is mandatory');
  const router = express.Router();
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use(express.json({ limit: '16kb' }));
  router.use(async (req, res, next) => {
    try {
      const userId = await resolveUserId(req);
      if (typeof userId !== 'string' || !userId.trim()) return errorResponse(res, 401, 'Authentication required');
      req.toMonitoringUserId = userId;
      next();
    } catch { return errorResponse(res, 401, 'Authentication required'); }
  });

  async function ownedProject(req, res) {
    if (!UUID.test(req.params.id || '')) { errorResponse(res, 400, 'Invalid project ID'); return null; }
    const { data, error } = await supabase.from('monitoring_projects')
      .select('id,name,runtime,environment,created_at,last_received_at')
      .eq('id', req.params.id).eq('owner_user_id', req.toMonitoringUserId).maybeSingle();
    if (error) throw error;
    if (!data) { errorResponse(res, 404, 'Project not found'); return null; }
    return data;
  }

  router.get('/projects', async (req, res, next) => {
    try {
      const { data, error } = await supabase.from('monitoring_projects')
        .select('id,name,runtime,environment,created_at')
        .eq('owner_user_id', req.toMonitoringUserId).order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return res.json({ projects: (data || []).map(p => ({ ...p, ingest_url: publicIngestUrl() })) });
    } catch (e) { next(e); }
  });

  router.post('/projects', async (req, res, next) => {
    try {
      const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
      const environment = req.body?.environment;
      if (!req.body || Array.isArray(req.body) || Object.keys(req.body).some(key => !['name', 'runtime', 'environment'].includes(key))
          || !name || name.length > 80 || req.body?.runtime !== 'nodejs'
          || !['development','staging','production'].includes(environment)) {
        return errorResponse(res, 400, 'Valid Node.js application name and environment required');
      }
      const { data, error } = await supabase.from('monitoring_projects')
        .insert({ owner_user_id: req.toMonitoringUserId, name, environment, runtime: 'nodejs' })
        .select('id,name,runtime,environment,created_at').single();
      if (error) throw error;
      return res.status(201).json({ project: { ...data, ingest_url: publicIngestUrl() } });
    } catch (e) { next(e); }
  });

  router.post('/projects/:id/keys', async (req, res, next) => {
    try {
      if (!await ownedProject(req, res)) return;
      const secret = `to_live_${randomBytes(32).toString('base64url')}`;
      const { data, error } = await supabase.rpc('monitoring_create_project_key', {
        p_project_id: req.params.id, p_owner_user_id: req.toMonitoringUserId,
        p_key_hash: hashKey(secret), p_key_prefix: secret.slice(0, 16),
      });
      if (error) throw error;
      if (data?.error === 'key_limit') return errorResponse(res, 409, 'Maximum 3 active keys per project; revoke an unused key first');
      if (data?.error === 'not_found') return errorResponse(res, 404, 'Project not found');
      res.set('Cache-Control', 'no-store');
      return res.status(201).json({ secret, key: data }); // Only returned at creation time.
    } catch (e) { next(e); }
  });

  router.get('/projects/:id/keys', async (req, res, next) => {
    try {
      if (!await ownedProject(req, res)) return;
      const { data, error } = await supabase.from('monitoring_project_keys')
        .select('id,key_prefix,created_at,last_used_at,revoked_at')
        .eq('project_id', req.params.id).order('created_at', { ascending:false }).limit(50);
      if (error) throw error;
      return res.json({ keys: data || [] });
    } catch (e) { next(e); }
  });

  router.delete('/projects/:id/keys/:keyId', async (req, res, next) => {
    try {
      if (!await ownedProject(req, res)) return;
      if (!UUID.test(req.params.keyId || '')) return errorResponse(res, 400, 'Invalid key ID');
      const { data, error } = await supabase.from('monitoring_project_keys')
        .update({ revoked_at: new Date().toISOString() })
        .eq('project_id', req.params.id).eq('id', req.params.keyId).is('revoked_at', null)
        .select('id').maybeSingle();
      if (error) throw error;
      if (!data) return errorResponse(res, 404, 'Active key not found');
      return res.status(204).send();
    } catch (e) { next(e); }
  });

  router.get('/projects/:id/status', async (req, res, next) => {
    try {
      const project = await ownedProject(req, res);
      if (!project) return;
      const { count, error: countError } = await supabase.from('monitoring_spans')
        .select('id', { count: 'exact', head: true }).eq('project_id', req.params.id);
      if (countError) throw countError;
      const last = project.last_received_at || null;
      const active = !!last && (Date.now() - new Date(last).getTime()) < 10 * 60 * 1000;
      return res.json({ connected: active, has_received: !!last, last_seen_at: last, span_count: count || 0, retention_days: 7 });
    } catch (e) { next(e); }
  });

  router.get('/projects/:id/spans', async (req, res, next) => {
    try {
      if (!await ownedProject(req, res)) return;
      const n = Number(req.query.limit ?? 50);
      if (!Number.isInteger(n) || n < 1 || n > 100) return errorResponse(res, 400, 'limit must be 1–100');
      const { data, error } = await supabase.from('monitoring_spans')
        .select('id,received_at,started_at,service_name,trace_id,span_id,http_method,http_route,http_status,duration_ms,span_error')
        .eq('project_id', req.params.id).order('received_at', { ascending:false }).limit(n);
      if (error) throw error;
      return res.json({ spans: data || [] });
    } catch (e) { next(e); }
  });

  return router;
}

function createOtlpIngestRouter({ supabase }) {
  assertSupabase(supabase);
  const router = express.Router();
  router.post('/v1/traces', express.json({ type: 'application/json', limit: '256kb' }), async (req, res, next) => {
    try {
      if (!req.is('application/json')) return errorResponse(res, 415, 'Only OTLP/HTTP JSON supported in v1');
      const secret = req.get('x-to-project-key') || '';
      if (!/^to_live_[A-Za-z0-9_-]{40,80}$/.test(secret)) {
        return errorResponse(res, 401, 'Invalid project ingestion key');
      }
      const { data: key, error: keyError } = await supabase.from('monitoring_project_keys')
        .select('id,project_id').eq('key_hash', hashKey(secret)).is('revoked_at', null).maybeSingle();
      if (keyError) throw keyError;
      if (!key) return errorResponse(res, 401, 'Invalid project ingestion key');
      const spans = parseOtlpHttpSpans(req.body, key.project_id);
      // Revalidate the key, enforce quota, persist spans, and update project status
      // in one transaction. Client-supplied project IDs are never trusted.
      const { data, error } = await supabase.rpc('monitoring_ingest_spans', {
        p_key_hash: hashKey(secret), p_spans: spans,
      });
      if (error) throw error;
      if (data?.error === 'invalid_key') return errorResponse(res, 401, 'Invalid project ingestion key');
      if (data?.error === 'quota_exceeded') {
        res.set('Retry-After', '60');
        return errorResponse(res, 429, 'Project trace quota exceeded');
      }
      res.set('X-TO-Stored-Spans', String(data?.stored || 0));
      // Valid OTLP/JSON success response. 0 stored means no qualifying HTTP SERVER spans.
      return res.status(200).json({});
    } catch (e) {
      if (e.status) return errorResponse(res, e.status, e.message);
      next(e);
    }
  });
  // Explicitly reject unsupported signals, rather than suggesting they are stored.
  for (const signal of ['logs', 'metrics']) {
    router.post(`/v1/${signal}`, (req, res) => errorResponse(res, 501, `${signal} ingestion not enabled in v1`));
  }
  return router;
}
module.exports = { createManagementRouter, createOtlpIngestRouter };
