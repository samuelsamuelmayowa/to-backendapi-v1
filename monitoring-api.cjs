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
  return process.env.MONITORING_PUBLIC_OTLP_TRACES_URL || null;
}

// Supply resolveUserId(req), which MUST verify the user's existing authentication
// and return its stable user UID. Never read a user ID from a caller-controlled header.
function createManagementRouter({ supabase, resolveUserId }) {
  assertSupabase(supabase);
  if (typeof resolveUserId !== 'function') throw new Error('resolveUserId(req) is mandatory');
  const router = express.Router();
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
      .select('id,name,runtime,environment,created_at')
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
      const environment = req.body?.environment || 'development';
      if (!name || name.length > 80 || req.body?.runtime !== 'nodejs'
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
      const { data: active, error: keyError } = await supabase.from('monitoring_project_keys')
        .select('id').eq('project_id', req.params.id).is('revoked_at', null).limit(4);
      if (keyError) throw keyError;
      if ((active || []).length >= 3) return errorResponse(res, 409, 'Maximum 3 active keys per project');
      const secret = `to_live_${randomBytes(32).toString('base64url')}`;
      const { data, error } = await supabase.from('monitoring_project_keys')
        .insert({ project_id: req.params.id, key_hash: hashKey(secret), key_prefix: secret.slice(0, 16) })
        .select('id,key_prefix,created_at').single();
      if (error) throw error;
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
      if (!await ownedProject(req, res)) return;
      const { count, error: countError } = await supabase.from('monitoring_spans')
        .select('id', { count: 'exact', head: true }).eq('project_id', req.params.id);
      if (countError) throw countError;
      const { data: recent, error } = await supabase.from('monitoring_spans')
        .select('received_at').eq('project_id', req.params.id)
        .order('received_at', { ascending:false }).limit(1).maybeSingle();
      if (error) throw error;
      const last = recent?.received_at || null;
      const active = !!last && (Date.now() - new Date(last).getTime()) < 10 * 60 * 1000;
      return res.json({ connected: active, has_received: !!last, last_seen_at: last, span_count: count || 0 });
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
      if (spans.length) {
        // Atomic quota protects the shared T.O. Analytics DB from one overactive project.
        const { data: withinQuota, error: quotaError } = await supabase.rpc('monitoring_claim_ingest_quota', {
          p_project_id: key.project_id,
          p_count: spans.length,
          p_max_per_minute: 600,
        });
        if (quotaError) throw quotaError;
        if (!withinQuota) {
          res.set('Retry-After', '60');
          return errorResponse(res, 429, 'Project trace quota exceeded');
        }
        const { error } = await supabase.from('monitoring_spans')
          .upsert(spans, { onConflict: 'project_id,trace_id,span_id', ignoreDuplicates: true });
        if (error) throw error;
        const { error: touchError } = await supabase.from('monitoring_project_keys')
          .update({ last_used_at: new Date().toISOString() }).eq('id', key.id);
        if (touchError) {
          // The traces were already persisted; don't turn a committed write into a retriable 5xx.
          console.warn('[T.O. Monitoring] key last_used_at update failed:', touchError.message);
        }
      }
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
