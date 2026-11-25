'use strict';
// Prints names and booleans only. Never prints credential values, paths or URLs.
// Default: inspect current runtime (Render Shell). --local explicitly loads .env.
const fs = require('node:fs');
const path = require('node:path');
const EXPECTED_OTLP = 'https://to-backendapi-v1-kctb.onrender.com/otlp/v1/traces';
const MONITORING_ORIGIN = 'https://to-monitoring.vercel.app';

function inspectEnvironment(env = process.env, fileExists = fs.existsSync) {
  const required = ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','DATABASE_URL','JWT_SECRET',
    'OPENAI_API_KEY','STRIPE_SECRET_KEY']; // Existing eager constructors in the shared entry point.
  const checks = required.map(name => ({ name, passed: Boolean(env[name]?.trim()), required: true }));
  let supabaseHttps = false;
  try { supabaseHttps = new URL(env.SUPABASE_URL).protocol === 'https:'; } catch {}
  checks.push({ name: 'SUPABASE_URL_HTTPS', passed: supabaseHttps, required: true });
  const origins = String(env.FRONTEND_ORIGINS || '').split(',').map(value => value.trim());
  checks.push({ name: 'FRONTEND_ORIGINS_INCLUDES_MONITORING', passed: origins.includes(MONITORING_ORIGIN), required: true });
  checks.push({ name: 'MONITORING_PUBLIC_OTLP_TRACES_URL_MATCHES_RENDER', passed: (env.MONITORING_PUBLIC_OTLP_TRACES_URL || EXPECTED_OTLP) === EXPECTED_OTLP, required: true });
  checks.push({ name: 'NODE_ENV_PRODUCTION', passed: env.NODE_ENV === 'production', required: true });
  checks.push({ name: 'PORT_VALID', passed: /^\d+$/.test(env.PORT || '') && Number(env.PORT)>0 && Number(env.PORT)<=65535, required: true });
  checks.push({ name: 'SESSION_COOKIE_SAME_SITE_COMPATIBLE', passed: !env.SESSION_COOKIE_SAME_SITE || env.SESSION_COOKIE_SAME_SITE.toLowerCase()==='none', required: true });
  // firebase.js uses applicationDefault(); Render needs the existing service
  // account secret file, not a new Firebase project or token in the browser.
  checks.push({ name: 'GOOGLE_APPLICATION_CREDENTIALS_FILE_PRESENT', passed: Boolean(env.GOOGLE_APPLICATION_CREDENTIALS && fileExists(env.GOOGLE_APPLICATION_CREDENTIALS)), required: true });
  return checks;
}

if (require.main === module) {
  const local = process.argv.includes('--local');
  if (local) require('dotenv').config({ path: path.join(__dirname,'../.env'), quiet: true });
  console.log(`Environment audit scope: ${local ? 'local checkout only; NOT Render' : 'current process only; run in Render Shell to verify Render'}`);
  const checks = inspectEnvironment();
  for (const check of checks) console.log(`${check.name}: ${check.passed ? 'PASS' : 'FAIL'}`);
  console.log(`NODE_22_RUNTIME: ${process.versions.node.split('.')[0]==='22' ? 'PASS' : 'REVIEW'}`);
  if (checks.some(check => check.required && !check.passed)) process.exitCode = 1;
}
module.exports = { inspectEnvironment };
