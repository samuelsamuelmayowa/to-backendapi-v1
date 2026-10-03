// GET-only diagnosis through local Express routers. No account initialization or mutations.
const express = require('express');
const { config } = require('./diagnoseOptions');
const path = require('node:path');

async function main() {
  const backendDir = path.join(__dirname, '..');
  Object.assign(process.env, config(backendDir));
  if (process.argv.includes('--legacy-alpaca-env')) {
    const legacy = config(path.join(backendDir, '../t-o-analytics'));
    for (const key of ['ALPACA_API_KEY', 'ALPACA_API_SECRET']) if (!process.env[key]) process.env[key] = legacy[key] || '';
    process.env.ALPACA_OPTIONS_FEED ||= 'indicative';
    console.log('Using existing server credentials in memory for GET-only diagnosis. Backend .env unchanged.');
  }
  const { createOptionsRouter } = require('../routes/options');
  const { createMarketDataRouter } = require('../routes/marketData');
  const app = express();
  app.use(require('../middleware/cors'));
  app.use('/api/options', createOptionsRouter());
  app.use('/api/market-data', createMarketDataRouter());
  const server = app.listen(19001, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const base = 'http://127.0.0.1:19001/api';
  async function request(route) {
    const url = `${base}/${route}`;
    const response = await fetch(url, { method: 'GET', headers: { Origin: 'http://localhost:5173' }, signal: AbortSignal.timeout(90000) });
    const data = await response.json();
    const summary = data.contracts ? { ...data, contracts: data.contracts.slice(0, 2), contractCount: data.contracts.length } : data;
    console.log(JSON.stringify({ method: 'GET', url, status: response.status, body: summary }));
    return data;
  }
  try {
    await request('options/health');
    await request('market-data/quote/AAPL');
    const end = new Date(), start = new Date(end); start.setUTCDate(start.getUTCDate() - 7);
    await request(`market-data/bars/AAPL?timeframe=1Day&start=${start.toISOString()}&end=${end.toISOString()}&limit=3`);
    const dates = await request('options/expirations?symbol=AAPL');
    if (dates.expirations?.length) for (const type of ['call', 'put']) await request(`options/chain?symbol=AAPL&expiration=${dates.expirations[0]}&type=${type}`);
    // No bearer token: authentication rejects before any account/database writes.
    for (const endpoint of ['account', 'positions', 'history']) await request(`options/${endpoint}`);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
