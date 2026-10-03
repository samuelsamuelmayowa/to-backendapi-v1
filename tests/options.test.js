const test = require('node:test');
const assert = require('node:assert/strict');
const { applyOrder, emptyWallet } = require('../services/optionsAccounting');
const { normalize, createOptionsMarketData } = require('../services/optionsMarketData');
const now = new Date('2026-10-02T15:00:00Z');
const contract = { symbol: 'AAPL261016C00100000', underlyingSymbol: 'AAPL', type: 'call', strike: 100, expiration: '2026-10-16', mark: 5, timestamp: now.toISOString(), feed: 'indicative' };
test('buy call, weighted entries, close and realized P/L are server-calculated', () => {
  let state = applyOrder(emptyWallet(), contract, 2, 'buy', 'request-one', now);
  assert.equal(state.cash, 9000);
  state = applyOrder(state, { ...contract, mark: 8 }, 1, 'buy', 'request-two', now);
  assert.equal(state.positions[0].average, 6);
  state = applyOrder(state, { ...contract, mark: 7 }, 3, 'sell', 'request-three', now);
  assert.equal(state.cash, 10300);
  assert.equal(state.positions.length, 0);
  assert.equal(state.history[0].realizedPnl, 300);
});
test('long put accounting and validations reject unsafe orders without mutation', () => {
  const wallet = emptyWallet(), put = { ...contract, type: 'put', symbol: 'AAPL261016P00100000' };
  assert.equal(applyOrder(wallet, put, 1, 'buy', 'put-request', now).cash, 9500);
  for (const qty of [0, -1, 0.5, '1', NaN, 10001]) assert.throws(() => applyOrder(wallet, contract, qty, 'buy', 'r', now));
  assert.throws(() => applyOrder(wallet, contract, 21, 'buy', 'r', now), /Insufficient/);
  assert.throws(() => applyOrder(wallet, contract, 1, 'sell', 'r', now), /owned/);
  assert.throws(() => applyOrder(wallet, { ...contract, mark: null }, 1, 'buy', 'r', now), /premium/);
  assert.throws(() => applyOrder(wallet, { ...contract, expiration: '2026-10-02' }, 1, 'buy', 'r', now), /expiration/);
  assert.throws(() => applyOrder(wallet, { ...contract, timestamp: '2026-10-01T15:00:00Z' }, 1, 'buy', 'r', now), /stale/);
  assert.deepEqual(wallet, emptyWallet());
});
test('normalization preserves missing values and all Greeks', () => {
  const missing = normalize(contract.symbol, {}, 'indicative');
  assert.equal(missing.mark, null); assert.equal(missing.bid, null); assert.equal(missing.iv, null);
  const quote = normalize(contract.symbol, { latestQuote: { bp: 4, ap: 6, t: now.toISOString() }, latestTrade: { p: 9 }, impliedVolatility: 0.25, greeks: { delta: 0.6, gamma: 0.03, theta: -0.1, vega: 0.2 } }, 'opra');
  assert.equal(quote.mark, 5); assert.equal(quote.delta, 0.6); assert.equal(quote.theta, -0.1); assert.equal(quote.feed, 'opra');
  const invalidBid = normalize(contract.symbol, { latestQuote: { bp: -1, ap: 6, t: now.toISOString() }, latestTrade: { p: 4, t: '2026-10-01T15:00:00Z' } }, 'indicative');
  assert.equal(invalidBid.mark, 4); assert.equal(invalidBid.timestamp, '2026-10-01T15:00:00Z');
});
test('metadata pagination, separate caching and snapshot null rows', async () => {
  const calls = [];
  const market = createOptionsMarketData({ env: { ALPACA_API_KEY: 'test', ALPACA_API_SECRET: 'test' }, now: () => now.getTime(), fetcher: async url => {
    calls.push(url);
    if (url.includes('/contracts')) return { ok: true, json: async () => ({ option_contracts: [{ symbol: contract.symbol, expiration_date: contract.expiration, size: '100', root_symbol: 'AAPL', type: 'call' }, { symbol: 'AAPL1261016C00100000', expiration_date: contract.expiration, size: '10', root_symbol: 'AAPL1', type: 'call' }] }) };
    return { ok: true, json: async () => ({ snapshots: {} }) };
  } });
  assert.deepEqual((await market.expirations('AAPL')).expirations, ['2026-10-16']);
  await market.expirations('AAPL'); assert.equal(calls.length, 1);
  const chain = await market.chain('AAPL', '2026-10-16', 'call');
  assert.equal(chain.contracts.length, 1); assert.equal(chain.contracts[0].mark, null);
  assert.equal(chain.feed, 'indicative'); assert.ok(calls.at(-1).includes('feed=indicative'));
});

test('expiration discovery excludes past/today/adjusted contracts, deduplicates and sorts', async () => {
  const market = createOptionsMarketData({ env: { ALPACA_API_KEY: 'test', ALPACA_API_SECRET: 'test' }, now: () => now.getTime(), fetcher: async url => {
    assert.equal(new URL(url).searchParams.get('expiration_date_gte'), '2026-10-03');
    return Response.json({ option_contracts: ['2026-10-16', '2026-10-02', '2026-10-01', '2026-10-09', '2026-10-16', 'bad'].map(expiration_date => ({ size: '100', root_symbol: 'AAPL', expiration_date })) });
  } });
  assert.deepEqual((await market.expirations('AAPL')).expirations, ['2026-10-09', '2026-10-16']);
});

test('Options reports real upstream error status/message without credential leakage', async () => {
  const market = createOptionsMarketData({ env: { ALPACA_API_KEY: 'secret-key', ALPACA_API_SECRET: 'secret-value' }, fetcher: async () => Response.json({ code: 40110000, message: 'unauthorized secret-key secret-value' }, { status: 401 }) });
  await assert.rejects(market.expirations('AAPL'), error => error.code === 'ALPACA_ACCESS_DENIED' && error.statusCode === 502 && error.upstreamStatus === 401 && error.upstreamCode === 40110000 && /unauthorized/.test(error.message) && !/secret-key|secret-value/.test(error.message));
  const limited = createOptionsMarketData({ env: { ALPACA_API_KEY: 'test', ALPACA_API_SECRET: 'test' }, fetcher: async () => Response.json({ message: 'too many requests' }, { status: 429 }) });
  await assert.rejects(limited.expirations('AAPL'), { code: 'ALPACA_RATE_LIMITED', statusCode: 429 });
  await assert.rejects(createOptionsMarketData({ env: {} }).expirations('AAPL'), { code: 'ALPACA_NOT_CONFIGURED', statusCode: 503 });
});
