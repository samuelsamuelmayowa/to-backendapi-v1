// INTEGRATION GUIDE — illustrative insertion into YOUR EXISTING backend.
// Do not run by itself: this requires your verified auth middleware and PostgreSQL pool.
//
// import express from 'express'
// import pg from 'pg'
// import { createMonitoringWorkspaceRoutes, createOtlpJsonIngestRoutes } from './monitoring-routes.mjs'
// const app = express()
// const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
//
// // Use YOUR EXISTING backend middleware to verify login before this point.
// // The verified user ID must come from a real session/JWT, not a request body.
// function monitoringAuth(req, res, next) {
//   // Example only: req.user must already have been populated by real auth middleware.
//   if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' })
//   req.monitoringUserId = req.user.id
//   next()
// }
//
// app.use('/api/monitoring', existingSessionMiddleware, monitoringAuth, createMonitoringWorkspaceRoutes(pool))
// app.use('/otlp', createOtlpJsonIngestRoutes(pool))
//
// // Set MONITORING_PUBLIC_OTLP_TRACES_URL to the real public HTTPS address:
// // https://YOUR-BACKEND-HOST/otlp/v1/traces
//
// // On Vercel, proxy /api/monitoring/* to the real backend or configure
// // VITE_MONITORING_API_BASE_URL to its HTTPS URL with appropriate CORS.
