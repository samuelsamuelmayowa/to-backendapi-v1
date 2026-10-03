// Read-only integration diagnosis. Never prints keys, tokens or account records.
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
function config(dir) {
  const values = {};
  for (const name of ['.env', '.env.local']) {
    const file = path.join(dir, name);
    if (fs.existsSync(file)) Object.assign(values, dotenv.parse(fs.readFileSync(file)));
  }
  return values;
}
async function probe(url, options = {}) {
  try {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(20000) });
    const text = await response.text();
    console.log(JSON.stringify({ method: options.method || 'GET', url, status: response.status, contentType: response.headers.get('content-type'), allowOrigin: response.headers.get('access-control-allow-origin'), body: text.slice(0, 700) }));
  } catch (error) { console.log(JSON.stringify({ url, error: error.message, cause: error.cause?.code })); }
}
async function main() {
  const backend = { ...config(path.join(__dirname, '..')), ...process.env };
  const frontend = config(path.join(__dirname, '../../t-o-analytics'));
  for (const [name, env] of [['frontend', frontend], ['backend', backend]]) {
    console.log(name, JSON.stringify(Object.fromEntries(['VITE_BACKEND_API', 'VITE_API_URL', 'VITE_SUPABASE_URL', 'SUPABASE_URL', 'PORT', 'ALPACA_OPTIONS_FEED', 'ALPACA_DATA_FEED'].map(k => [k, env[k] || null]))));
    console.log('Configured secrets', JSON.stringify(Object.fromEntries(['SUPABASE_SERVICE_ROLE_KEY', 'VITE_SUPABASE_ANON_KEY', 'ALPACA_API_KEY', 'ALPACA_API_SECRET', 'SUPABASE_DB_URL'].map(k => [k, Boolean(env[k])]))));
  }
  const base = (frontend.VITE_BACKEND_API || frontend.VITE_API_URL || 'http://localhost:9000').replace(/\/+$/, '').replace(/\/api$/, '') + '/api';
  for (const endpoint of ['market-data/quote/AAPL', 'options/health', 'options/expirations?symbol=AAPL', 'options/account', 'options/positions', 'options/history']) await probe(`${base}/${endpoint}`, { headers: { Origin: 'http://localhost:5173' } });
  if (backend.SUPABASE_URL && backend.SUPABASE_SERVICE_ROLE_KEY) {
    await probe(`${backend.SUPABASE_URL}/rest/v1/options_practice_accounts?select=user_id,version,state,updated_at&limit=0`, { headers: { apikey: backend.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${backend.SUPABASE_SERVICE_ROLE_KEY}` } });
  }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { config, probe };
