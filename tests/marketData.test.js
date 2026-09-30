const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { createAlpacaProvider } = require("../services/marketData/alpacaProvider");
const { createMarketDataService } = require("../services/marketDataService");
const { createMarketDataController } = require("../controller/marketDataController");
const { createMarketDataRouter } = require("../routes/marketData");
const corsMiddleware = require("../middleware/cors");

const env = { ALPACA_API_KEY: "test-key", ALPACA_API_SECRET: "test-secret", ALPACA_DATA_FEED: "iex" };
const jsonResponse = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test("quote endpoint normalizes available snapshot fields and sends credentials only upstream", async () => {
  let captured;
  const provider = createAlpacaProvider({
    env,
    fetcher: async (url, options) => {
      captured = { url, options };
      return jsonResponse({ latestTrade: { p: 225.5, t: "2026-09-30T10:00:00Z" }, latestQuote: { bp: 225.45, ap: 225.55 } });
    },
  });
  assert.deepEqual(await provider.getQuote("AAPL"), {
    symbol: "AAPL", price: 225.5, bid: 225.45, ask: 225.55,
    timestamp: "2026-09-30T10:00:00Z", source: "alpaca",
  });
  assert.match(captured.url, /^https:\/\/data\.alpaca\.markets\/v2\/stocks\/AAPL\/snapshot\?/);
  assert.equal(captured.options.headers["APCA-API-KEY-ID"], "test-key");
  assert.equal(captured.options.headers["APCA-API-SECRET-KEY"], "test-secret");
});

test("quote response omits unavailable trade prices instead of filling them with a fallback", async () => {
  const provider = createAlpacaProvider({
    env,
    fetcher: async () => jsonResponse({ latestTrade: null, latestQuote: { bp: 12.3, ap: 12.4, t: "2026-09-30T10:00:00Z" } }),
  });
  assert.deepEqual(await provider.getQuote("AAPL"), {
    symbol: "AAPL", bid: 12.3, ask: 12.4, timestamp: "2026-09-30T10:00:00Z", source: "alpaca",
  });
});

test("bars endpoint follows Alpaca pagination and maps OHLCV without inventing fields", async () => {
  const urls = [];
  const provider = createAlpacaProvider({
    env,
    fetcher: async (url) => {
      urls.push(new URL(url));
      if (!new URL(url).searchParams.has("page_token")) {
        return jsonResponse({ bars: { AAPL: [{ t: "2026-09-29T00:00:00Z", o: 1, h: 3, l: 0.5, c: 2, v: 10 }] }, next_page_token: "next-page" });
      }
      return jsonResponse({ bars: { AAPL: [{ t: "2026-09-30T00:00:00Z", o: 2, h: 4, l: 1, c: 3, v: 20 }] } });
    },
  });
  const result = await provider.getBars("AAPL", { timeframe: "1Day", limit: 2 });
  assert.deepEqual(result.bars, [
    { time: "2026-09-29T00:00:00Z", open: 1, high: 3, low: 0.5, close: 2, volume: 10 },
    { time: "2026-09-30T00:00:00Z", open: 2, high: 4, low: 1, close: 3, volume: 20 },
  ]);
  assert.equal(urls.length, 2);
  assert.equal(urls[0].searchParams.get("timeframe"), "1Day");
  assert.equal(urls[1].searchParams.get("page_token"), "next-page");
});

test("symbol search filters active equities, returns at most ten, and caches the asset list", async () => {
  let calls = 0;
  const provider = createAlpacaProvider({
    env,
    fetcher: async () => {
      calls += 1;
      return jsonResponse([
        { status: "active", class: "us_equity", symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ" },
        { status: "inactive", class: "us_equity", symbol: "OLD", name: "Apple Old" },
        { status: "active", class: "crypto", symbol: "APPLE/USD", name: "Apple Coin" },
      ]);
    },
  });
  assert.deepEqual(await provider.searchSymbols("apple"), [
    { symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ", type: "stock" },
  ]);
  await provider.searchSymbols("apple");
  assert.equal(calls, 1);
});

test("symbol lookup returns exact active equity metadata and rejects partial or invalid matches", async () => {
  let calls = 0;
  const service = createMarketDataService({
    searchSymbols: async (query) => {
      calls += 1;
      assert.equal(query, "AAPL");
      return [
        { symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ", type: "stock" },
        { symbol: "AAPX", name: "Apple ETF", exchange: "BATS", type: "stock" },
      ];
    },
  });
  assert.deepEqual(await service.getSymbol("aapl"), {
    symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ", type: "stock", currency: "USD",
  });
  const notFound = createMarketDataService({ searchSymbols: async () => [{ symbol: "AAPX", type: "stock" }] });
  await assert.rejects(notFound.getSymbol("AAPL"), { statusCode: 404 });
  await assert.rejects(service.getSymbol("AAPL/other"), { statusCode: 400 });
  assert.equal(calls, 1);
});

test("validation rejects malformed input before provider calls", async () => {
  let calls = 0;
  const provider = {
    getQuote: async () => { calls += 1; },
    getBars: async () => { calls += 1; },
    searchSymbols: async () => { calls += 1; },
  };
  const service = createMarketDataService(provider);
  await assert.rejects(service.getQuote("AAPL/../../other"), { statusCode: 400 });
  await assert.rejects(service.getBars("AAPL", { timeframe: "1Day&feed=sip" }), { statusCode: 400 });
  await assert.rejects(service.getBars("AAPL", { start: "2026-09-30", end: "2026-09-01" }), { statusCode: 400 });
  await assert.rejects(service.searchSymbols("apple&url=https://example.com"), { statusCode: 400 });
  assert.equal(calls, 0);
});

test("missing credentials and provider throttling return safe, explicit errors", async () => {
  const missing = createAlpacaProvider({ env: {}, fetcher: async () => { throw new Error("must not call"); } });
  await assert.rejects(missing.getQuote("AAPL"), { statusCode: 503 });
  const throttled = createAlpacaProvider({ env, fetcher: async () => jsonResponse({}, 429) });
  await assert.rejects(throttled.getQuote("AAPL"), { statusCode: 429 });
  const badSymbol = createAlpacaProvider({ env, fetcher: async () => jsonResponse({}, 400) });
  await assert.rejects(badSymbol.getQuote("NOTREAL"), { statusCode: 400 });
});

test("HTTP routes expose normalized quote, bars, and search responses", async (t) => {
  const service = createMarketDataService({
    getQuote: async (symbol) => ({ symbol, price: 10, source: "alpaca" }),
    getBars: async (symbol, query) => ({ symbol, timeframe: query.timeframe || "1Day", bars: [] }),
    searchSymbols: async (query) => [{ symbol: "AAPL", name: "Apple Inc.", type: "stock", query }],
    getSymbol: async (symbol) => ({ symbol, name: "Apple Inc.", type: "stock", currency: "USD" }),
  });
  const app = express();
  app.use("/api/market-data", createMarketDataRouter(createMarketDataController(service)));
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/market-data`;

  const quote = await fetch(`${base}/quote/AAPL`);
  assert.equal(quote.status, 200);
  assert.deepEqual(await quote.json(), { symbol: "AAPL", price: 10, source: "alpaca" });

  const bars = await fetch(`${base}/bars/AAPL?timeframe=1Day&limit=100`);
  assert.equal(bars.status, 200);
  assert.deepEqual(await bars.json(), { symbol: "AAPL", timeframe: "1Day", bars: [] });

  const search = await fetch(`${base}/search?q=apple`);
  assert.equal(search.status, 200);
  assert.deepEqual(await search.json(), [{ symbol: "AAPL", name: "Apple Inc.", type: "stock", query: "apple" }]);

  const symbol = await fetch(`${base}/symbol/AAPL`);
  assert.equal(symbol.status, 200);
  assert.deepEqual(await symbol.json(), {
    symbol: "AAPL", name: "Apple Inc.", type: "stock", currency: "USD",
  });

  const malformedSymbol = await fetch(`${base}/quote/%3Cinvalid-symbol%3E`);
  assert.equal(malformedSymbol.status, 400);
  const injectedPath = await fetch(`${base}/quote/%2E%2E%2F..%2Fsomething`);
  assert.ok(injectedPath.status >= 400);
  const excessiveLimit = await fetch(`${base}/bars/AAPL?limit=999999999`);
  assert.equal(excessiveLimit.status, 400);
  const badTimeframe = await fetch(`${base}/bars/AAPL?timeframe=INVALID`);
  assert.equal(badTimeframe.status, 400);
  const emptySearch = await fetch(`${base}/search?q=`);
  assert.equal(emptySearch.status, 400);
  const arbitraryProviderUrl = await fetch(`${base}/search?q=https%3A%2F%2Fexample.com`);
  assert.equal(arbitraryProviderUrl.status, 400);
});

test("CORS allows configured T.O. frontend origins with credentials and rejects other origins", async (t) => {
  const app = express();
  app.use(corsMiddleware);
  app.get("/api/market-data/ping", (_req, res) => res.json({ ok: true }));
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/market-data/ping`;

  const allowed = await fetch(url, { headers: { Origin: "https://www.to-analytics.com" } });
  assert.equal(allowed.headers.get("access-control-allow-origin"), "https://www.to-analytics.com");
  assert.equal(allowed.headers.get("access-control-allow-credentials"), "true");

  const blocked = await fetch(url, { headers: { Origin: "https://untrusted.example" } });
  assert.equal(blocked.headers.get("access-control-allow-origin"), null);

  const preflight = await fetch(url, {
    method: "OPTIONS",
    headers: {
      Origin: "http://localhost:5173",
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "authorization",
    },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "http://localhost:5173");
  assert.match(preflight.headers.get("access-control-allow-headers"), /authorization/i);
});
