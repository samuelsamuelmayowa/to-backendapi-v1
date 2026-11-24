import express from 'express'
import { randomBytes, randomUUID, createHash } from 'node:crypto'

const hashKey = (secret) => createHash('sha256').update(secret).digest('hex')
const validUuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)

function publicUrl() {
  return process.env.MONITORING_PUBLIC_OTLP_TRACES_URL || null
}

// Mounted behind your EXISTING session/JWT authentication middleware.
// That middleware must set req.monitoringUserId to a verified user ID.
export function createMonitoringWorkspaceRoutes(pool) {
  const router = express.Router()
  router.use(express.json({ limit: '24kb' }))
  router.use((req, res, next) => {
    if (!req.monitoringUserId || typeof req.monitoringUserId !== 'string') {
      return res.status(401).json({ error: 'Sign in to continue' })
    }
    next()
  })

  async function ownedProject(req, res) {
    if (!validUuid(req.params.id)) { res.status(400).json({ error: 'Invalid project ID' }); return null }
    const { rows } = await pool.query('SELECT id, name, environment FROM to_monitor_projects WHERE id = $1 AND owner_user_id = $2', [req.params.id, req.monitoringUserId])
    if (!rows[0]) { res.status(404).json({ error: 'Application not found' }); return null }
    return rows[0]
  }

  router.get('/projects', async (req, res, next) => {
    try {
      const { rows } = await pool.query('SELECT id, name, runtime, environment, created_at FROM to_monitor_projects WHERE owner_user_id=$1 ORDER BY created_at DESC', [req.monitoringUserId])
      res.json({ projects: rows.map(project => ({ ...project, ingest_url: publicUrl() })) })
    } catch (error) { next(error) }
  })

  router.post('/projects', async (req, res, next) => {
    try {
      const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
      const environment = req.body?.environment
      if (!name || name.length > 80 || req.body?.runtime !== 'nodejs' || !['development', 'staging', 'production'].includes(environment)) {
        return res.status(400).json({ error: 'Provide a valid Node.js application name and environment' })
      }
      const id = randomUUID()
      const { rows } = await pool.query(
        'INSERT INTO to_monitor_projects(id, owner_user_id, name, runtime, environment) VALUES ($1,$2,$3,$4,$5) RETURNING id,name,runtime,environment,created_at',
        [id, req.monitoringUserId, name, 'nodejs', environment],
      )
      res.status(201).json({ project: { ...rows[0], ingest_url: publicUrl() } })
    } catch (error) { next(error) }
  })

  router.post('/projects/:id/keys', async (req, res, next) => {
    try {
      if (!await ownedProject(req, res)) return
      const secret = `to_live_${randomBytes(32).toString('base64url')}`
      await pool.query('INSERT INTO to_monitor_keys (id,project_id,key_hash) VALUES ($1,$2,$3)', [randomUUID(), req.params.id, hashKey(secret)])
      res.status(201).json({ secret }) // One-time display; NEVER return it again.
    } catch (error) { next(error) }
  })

  router.get('/projects/:id/status', async (req, res, next) => {
    try {
      if (!await ownedProject(req, res)) return
      const { rows } = await pool.query('SELECT max(received_at) AS last_seen_at, count(*)::int AS span_count FROM to_monitor_spans WHERE project_id=$1', [req.params.id])
      res.json({ connected: Number(rows[0].span_count) > 0, last_seen_at: rows[0].last_seen_at, span_count: rows[0].span_count })
    } catch (error) { next(error) }
  })

  // Protected read example for the future private monitoring dashboard / Studio.
  router.get('/projects/:id/spans', async (req, res, next) => {
    try {
      if (!await ownedProject(req, res)) return
      const { rows } = await pool.query('SELECT received_at,service_name,operation,http_method,http_route,http_status,duration_ms FROM to_monitor_spans WHERE project_id=$1 ORDER BY received_at DESC LIMIT 100', [req.params.id])
      res.json({ spans: rows })
    } catch (error) { next(error) }
  })
  return router
}

// First-milestone OTLP/HTTP-JSON receiver; mount at /otlp to expose /otlp/v1/traces.
// This is NOT a replacement for a hardened OpenTelemetry Collector gateway.
export function createOtlpJsonIngestRoutes(pool) {
  const router = express.Router()
  router.post('/v1/traces', express.json({ limit: '1mb', type: 'application/json' }), async (req, res, next) => {
    try {
      if (!req.is('application/json')) return res.status(415).json({ error: 'Use OTLP http/json' })
      const secret = req.get('x-to-project-key') || ''
      if (!secret.startsWith('to_live_') || secret.length > 120) return res.status(401).json({ error: 'Invalid ingestion key' })
      const { rows: keys } = await pool.query('SELECT project_id FROM to_monitor_keys WHERE key_hash=$1 AND revoked_at IS NULL', [hashKey(secret)])
      if (!keys[0]) return res.status(401).json({ error: 'Invalid ingestion key' })
      const resourceSpans = req.body?.resourceSpans
      if (!Array.isArray(resourceSpans)) return res.status(400).json({ error: 'Expected OTLP resourceSpans' })
      let count = 0
      // Strict size bound and store only a small set of fields for this first milestone.
      for (const resource of resourceSpans) {
        const attributes = Object.fromEntries((resource.resource?.attributes || []).map(a => [a.key, a.value]))
        const service = String(attributes['service.name']?.stringValue || 'node-service').slice(0, 100)
        for (const scope of resource.scopeSpans || []) {
          for (const span of scope.spans || []) {
            if (++count > 250) return res.status(413).json({ error: 'Too many spans in one request' })
            const spanAttrs = Object.fromEntries((span.attributes || []).map(a => [a.key, a.value]))
            const method = spanAttrs['http.request.method']?.stringValue || spanAttrs['http.method']?.stringValue || null
            const route = spanAttrs['http.route']?.stringValue || null
            const statusRaw = spanAttrs['http.response.status_code']?.intValue ?? spanAttrs['http.status_code']?.intValue
            const status = statusRaw === undefined ? null : Number(statusRaw)
            let duration = null
            try {
              const nanos = BigInt(span.endTimeUnixNano) - BigInt(span.startTimeUnixNano)
              if (nanos >= 0n) duration = Number(nanos) / 1e6
            } catch { /* incomplete timing */ }
            await pool.query(`INSERT INTO to_monitor_spans(id,project_id,service_name,operation,trace_id,span_id,http_method,http_route,http_status,duration_ms)
                              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [
              randomUUID(), keys[0].project_id, service, String(span.name || 'operation').slice(0,180),
              String(span.traceId || '').slice(0,128), String(span.spanId || '').slice(0,64),
              method ? String(method).slice(0,20) : null, route ? String(route).slice(0,180) : null,
              Number.isInteger(status) && status >= 100 && status <= 599 ? status : null,
              Number.isFinite(duration) && duration < 3.6e6 ? duration : null,
            ])
          }
        }
      }
      return res.status(200).json({ partialSuccess: {} })
    } catch (error) { next(error) }
  })
  return router
}
