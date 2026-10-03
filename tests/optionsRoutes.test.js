const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createOptionsRouter } = require('../routes/options');
const { emptyWallet } = require('../services/optionsAccounting');

function database() {
  const rows = new Map();
  return { rows, auth: { getUser: async token => ({ data: { user: ['alice', 'bob'].includes(token) ? { id: token } : null } }) }, from(table) {
    assert.equal(table, 'options_practice_accounts', 'Options must never access the Stocks tables');
    let mode, value; const filters = {};
    const run = () => {
      if (mode === 'insert') { if (!rows.has(value.user_id)) rows.set(value.user_id, { user_id: value.user_id, version: 0, state: emptyWallet() }); return { error: null }; }
      const row = rows.get(filters.user_id);
      if (mode === 'update') {
        if (!row || row.version !== filters.version) return { data: [], error: null };
        rows.set(filters.user_id, structuredClone({ ...row, ...value })); return { data: [{ version: value.version }], error: null };
      }
      return { data: structuredClone(row), error: null };
    };
    const query = { upsert(v) { mode = 'insert'; value = v; return this; }, update(v) { mode = 'update'; value = v; return this; }, select() { return this; }, eq(k, v) { filters[k] = v; return this; }, single() { return Promise.resolve(run()); }, then(resolve, reject) { return Promise.resolve().then(run).then(resolve, reject); } };
    return query;
  } };
}
test('authenticated Options HTTP lifecycle, ownership, idempotency, concurrent funds and API failure', async t => {
  const db = database();
  const contract = { symbol: 'AAPL991216C00100000', underlyingSymbol: 'AAPL', expiration: '2099-12-16', type: 'call', strike: 100, mark: 5, timestamp: new Date().toISOString(), feed: 'indicative' };
  let failMarket = false;
  const market = { expirations: async () => ({ expirations: ['2099-12-16'] }), chain: async () => { if (failMarket) throw Object.assign(new Error('Alpaca unavailable'), { statusCode: 502 }); return { contracts: [contract] }; }, contract: async symbol => { if (symbol !== contract.symbol) throw new Error('Unknown contract'); return { ...contract, timestamp: new Date().toISOString() }; }, snapshots: async () => { if (failMarket) throw new Error('Alpaca unavailable'); return { contracts: [contract] }; } };
  const app = express(); app.use(express.json()); app.use('/api/options', createOptionsRouter({ market, getDb: () => db }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}/api/options/`;
  async function call(path, body, token = 'alice') { const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body && JSON.stringify(body) }); return { status: response.status, data: await response.json() }; }
  const order = (requestId, quantity = 1, action = 'buy') => ({ symbol: contract.symbol, quantity, action, requestId });
  assert.equal((await call('account', null, '')).status, 401);
  assert.equal((await call('account', null, 'invalid')).status, 401);
  assert.equal((await call('account')).data.cash, 10000);
  assert.deepEqual((await call('health', null, '')).data, { status: 'ok', service: 'options', apiVersion: 1 });
  assert.deepEqual((await call('history')).data, { history: [] });
  failMarket = true;
  assert.deepEqual((await call('positions')).data, { positions: [], marketError: null }, 'Empty positions do not depend on Alpaca');
  failMarket = false;
  const buy = { ...order('request-0000000001'), premium: 0.01, cost: 1, userId: 'bob', balance: 999999 };
  assert.equal((await call('orders', buy)).status, 200);
  assert.equal((await call('orders', buy)).status, 200);
  assert.equal((await call('account')).data.cash, 9500);
  assert.equal((await call('history')).data.history.length, 1);
  assert.equal((await call('orders', order('request-0000000002', 1, 'sell'), 'bob')).status, 400);
  assert.equal((await call('account', null, 'bob')).data.cash, 10000);
  assert.equal((await call('orders', order('request-0000000003', 100))).status, 400);
  contract.mark = 7;
  assert.equal((await call('orders', order('request-0000000004', 1, 'sell'))).status, 200);
  assert.equal((await call('account')).data.cash, 10200);
  assert.equal((await call('history')).data.history[0].realizedPnl, 200);
  assert.equal((await call('positions')).data.positions.length, 0);
  contract.mark = 60;
  const competing = await Promise.all([call('orders', order('request-0000000005')), call('orders', order('request-0000000006'))]);
  assert.equal(competing.filter(r => r.status === 200).length, 1);
  assert.equal((await call('account')).data.cash, 4200);
  failMarket = true;
  assert.equal((await call('chain?symbol=AAPL&expiration=2099-12-16&type=call')).status, 502);
  const positions = await call('positions'); assert.equal(positions.data.positions[0].current, null); assert.match(positions.data.marketError, /unavailable/);
  assert.equal((await call('reset', {})).status, 200);
  assert.equal((await call('account')).data.cash, 10000);
  assert.equal((await call('history')).data.history.length, 0);
});

test('HTTP errors distinguish missing migration, invalid expiry, auth and unexpected server failure', async t => {
  let code = 'PGRST205';
  const db = { auth: { getUser: async () => ({ data: { user: { id: 'test-user' } } }) }, from: () => ({ upsert: async () => ({ error: { code } }) }) };
  const app = express();
  app.use('/api/options', createOptionsRouter({ getDb: () => db, market: { expirations: async () => { throw new Error('private internal detail'); } } }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}/api/options/`;
  for (const endpoint of ['account', 'positions', 'history']) {
    const res = await fetch(base + endpoint, { headers: { Authorization: 'Bearer test-session' } });
    assert.equal(res.status, 503); assert.equal((await res.json()).code, 'DATABASE_MIGRATION_REQUIRED');
  }
  code = '42501';
  const databaseFailure = await fetch(base + 'account', { headers: { Authorization: 'Bearer test-session' } });
  assert.equal((await databaseFailure.json()).code, 'DATABASE_UNAVAILABLE');
  const expired = await fetch(base + 'chain?symbol=AAPL&expiration=2020-01-01&type=call');
  assert.equal(expired.status, 400); assert.equal((await expired.json()).code, 'EXPIRED_CONTRACT');
  const invalid = await fetch(base + 'chain?symbol=AAPL&expiration=2099-02-30&type=call');
  assert.equal(invalid.status, 400); assert.equal((await invalid.json()).code, 'INVALID_REQUEST');
  const unexpected = await fetch(base + 'expirations?symbol=AAPL');
  assert.equal(unexpected.status, 500);
  const error = await unexpected.json();
  assert.equal(error.code, 'SERVER_ERROR'); assert.doesNotMatch(error.error, /private internal/);
});
