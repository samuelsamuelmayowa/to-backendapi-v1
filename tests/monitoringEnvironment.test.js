const { test } = require('node:test');
const assert = require('node:assert/strict');
const { inspectEnvironment } = require('../scripts/checkMonitoringEnvironment');
const good = { SUPABASE_URL:'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY:'test-only', DATABASE_URL:'test-only', JWT_SECRET:'test-only',
  OPENAI_API_KEY:'test-only',STRIPE_SECRET_KEY:'test-only',
  FRONTEND_ORIGINS:'https://www.to-analytics.com,https://to-monitoring.vercel.app', NODE_ENV:'production', PORT:'10000', GOOGLE_APPLICATION_CREDENTIALS:'/test-only/credentials' };
test('Render environment audit accepts the existing production OTLP default and prints no values', () => {
  const results=inspectEnvironment(good,()=>true);
  assert.ok(results.every(check=>check.passed));
  assert.ok(!JSON.stringify(results).includes('test-only'));
  assert.ok(!JSON.stringify(results).includes('example.supabase.co'));
});
test('environment audit flags missing origin, wrong endpoint, credentials and cookie incompatibility', () => {
  const results=inspectEnvironment({...good,FRONTEND_ORIGINS:'',MONITORING_PUBLIC_OTLP_TRACES_URL:'http://localhost:8000/otlp/v1/traces',SESSION_COOKIE_SAME_SITE:'strict',GOOGLE_APPLICATION_CREDENTIALS:''},()=>false);
  for(const name of ['FRONTEND_ORIGINS_INCLUDES_MONITORING','MONITORING_PUBLIC_OTLP_TRACES_URL_MATCHES_RENDER','SESSION_COOKIE_SAME_SITE_COMPATIBLE','GOOGLE_APPLICATION_CREDENTIALS_FILE_PRESENT']) {
    assert.equal(results.find(check=>check.name===name).passed,false);
  }
});
