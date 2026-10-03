const { requestJson, MarketDataError } = require('./marketData/alpacaProvider');
const { OptionsError } = require('./optionsErrors');
const number = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
function mark(c) {
  return c.bid != null && c.ask != null && c.bid >= 0 && c.ask > 0 && c.ask >= c.bid
    ? (c.bid + c.ask) / 2 : c.last > 0 ? c.last : null;
}
function normalize(symbol, snapshot, feed) {
  const m = /^([A-Z]+)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/.exec(symbol);
  if (!m) return null;
  const c = { symbol, underlyingSymbol: m[1], expiration: `20${m[2]}-${m[3]}-${m[4]}`, type: m[5] === 'C' ? 'call' : 'put', strike: Number(m[6]) / 1000,
    bid: number(snapshot.latestQuote?.bp), ask: number(snapshot.latestQuote?.ap), last: number(snapshot.latestTrade?.p),
    iv: number(snapshot.impliedVolatility), feed, quoteTimestamp: snapshot.latestQuote?.t || null, tradeTimestamp: snapshot.latestTrade?.t || null };
  for (const key of ['delta', 'gamma', 'theta', 'vega']) c[key] = number(snapshot.greeks?.[key]);
  c.mark = mark(c);
  c.timestamp = c.bid != null && c.bid >= 0 && c.ask > 0 && c.ask >= c.bid ? c.quoteTimestamp : c.tradeTimestamp;
  return c;
}
function createOptionsMarketData({ env = process.env, fetcher = globalThis.fetch, now = Date.now } = {}) {
  const cache = new Map();
  async function cached(key, ttl, load) {
    const hit = cache.get(key);
    if (hit && hit.expires > now()) return hit.promise;
    if (cache.size > 100) cache.delete(cache.keys().next().value);
    const promise = load().catch(error => { cache.delete(key); throw error; });
    cache.set(key, { expires: now() + ttl, promise });
    return promise;
  }
  // Reuse the existing credential/timeout transport without changing Stocks errors.
  async function request(url) {
    let upstreamStatus, upstreamMessage, upstreamCode;
    try {
      return await requestJson(url, env, async (...args) => {
        const response = await fetcher(...args);
        if (!response.ok) {
          upstreamStatus = response.status;
          const payload = await response.clone?.().json().catch(() => null);
          upstreamCode = payload?.code;
          upstreamMessage = typeof payload?.message === 'string' ? payload.message.slice(0, 300) : null;
          for (const secret of [env.ALPACA_API_KEY, env.ALPACA_API_SECRET].filter(Boolean)) upstreamMessage = upstreamMessage?.split(secret).join('[redacted]');
          upstreamMessage = upstreamMessage?.replace(/[\r\n\t]/g, ' ');
        }
        return response;
      });
    } catch (error) {
      const code = upstreamStatus === 429 ? 'ALPACA_RATE_LIMITED' : upstreamStatus === 401 || upstreamStatus === 403 ? 'ALPACA_ACCESS_DENIED' : error.statusCode === 503 ? 'ALPACA_NOT_CONFIGURED' : 'ALPACA_UNAVAILABLE';
      throw new OptionsError(upstreamMessage ? `Alpaca Options (HTTP ${upstreamStatus}): ${upstreamMessage}` : error.message,
        code, upstreamStatus === 429 ? 429 : error.statusCode === 503 ? 503 : 502,
        { upstreamStatus, upstreamCode });
    }
  }
  function feed() {
    const value = env.ALPACA_OPTIONS_FEED || 'indicative';
    if (!['indicative', 'opra'].includes(value)) throw new OptionsError('Set ALPACA_OPTIONS_FEED to indicative or opra on the backend.', 'ALPACA_NOT_CONFIGURED', 503);
    return value;
  }
  async function metadata(symbol, expiration) {
    const today = new Date(now()).toISOString().slice(0, 10);
    return cached(`meta:${today}:${symbol}:${expiration || ''}`, 900000, async () => {
      const contracts = []; let token;
      const end = new Date(now()); end.setUTCFullYear(end.getUTCFullYear() + 3);
      for (let page = 0; page < 30; page++) {
        const tomorrow = new Date(`${today}T00:00:00Z`); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
        const params = new URLSearchParams({ underlying_symbols: symbol, status: 'active', limit: '1000', expiration_date_gte: tomorrow.toISOString().slice(0, 10), expiration_date_lte: end.toISOString().slice(0, 10) });
        if (expiration) params.set('expiration_date', expiration);
        if (token) params.set('page_token', token);
        const body = await request(`https://paper-api.alpaca.markets/v2/options/contracts?${params}`);
        contracts.push(...(body.option_contracts || []).filter(c => Number(c.size) === 100 && c.root_symbol === symbol && /^\d{4}-\d{2}-\d{2}$/.test(c.expiration_date) && c.expiration_date > today));
        token = body.next_page_token;
        if (!token) break;
      }
      return { contracts, hasMore: Boolean(token) };
    });
  }
  async function snapshots(symbols) {
    const selectedFeed = feed();
    if (!symbols.length) return { contracts: [], feed: selectedFeed };
    return cached(`snap:${selectedFeed}:${symbols.join(',')}`, 15000, async () => {
      const contracts = [];
      for (let i = 0; i < symbols.length; i += 100) {
        const params = new URLSearchParams({ symbols: symbols.slice(i, i + 100).join(','), feed: selectedFeed });
        const body = await request(`https://data.alpaca.markets/v1beta1/options/snapshots?${params}`);
        contracts.push(...Object.entries(body.snapshots || {}).map(([s, v]) => normalize(s, v, selectedFeed)).filter(Boolean));
      }
      return { contracts, feed: selectedFeed, fetchedAt: new Date(now()).toISOString() };
    });
  }
  return { metadata, snapshots,
    async expirations(symbol) { const data = await metadata(symbol); return { expirations: [...new Set(data.contracts.map(c => c.expiration_date))].sort(), hasMore: data.hasMore }; },
    async chain(symbol, expiration, type) {
      const meta = await metadata(symbol, expiration);
      const rows = meta.contracts.filter(c => c.type === type && c.expiration_date === expiration);
      const data = await snapshots(rows.map(c => c.symbol));
      const bySymbol = new Map(data.contracts.map(c => [c.symbol, c]));
      return { ...data, symbol, expiration, hasMore: meta.hasMore, contracts: rows.map(c => bySymbol.get(c.symbol) || normalize(c.symbol, {}, data.feed)).filter(Boolean).sort((a, b) => a.strike - b.strike) };
    },
    async contract(symbol) {
      const c = normalize(symbol, {}, feed());
      if (!c) throw new MarketDataError('Invalid option contract.', 400);
      const meta = await metadata(c.underlyingSymbol, c.expiration);
      if (!meta.contracts.some(row => row.symbol === symbol)) throw new MarketDataError('Standard option contract unavailable or expired.', 400);
      return (await snapshots([symbol])).contracts[0];
    }
  };
}
module.exports = { createOptionsMarketData, normalize, mark };
