const DATA_API_BASE = "https://data.alpaca.markets/v2";
const ASSETS_API_URL = "https://paper-api.alpaca.markets/v2/assets";
const ALLOWED_FEEDS = new Set(["sip", "iex", "delayed_sip", "boats", "overnight", "otc"]);
const REQUEST_TIMEOUT_MS = 10000;

class MarketDataError extends Error {
  constructor(message, statusCode = 502) {
    super(message);
    this.name = "MarketDataError";
    this.statusCode = statusCode;
  }
}

function getConfiguration(env = process.env) {
  const key = env.ALPACA_API_KEY;
  const secret = env.ALPACA_API_SECRET;
  if (!key || !secret) {
    throw new MarketDataError(
      "Market data is not configured. Set ALPACA_API_KEY and ALPACA_API_SECRET on the backend.",
      503,
    );
  }

  const feed = String(env.ALPACA_DATA_FEED || "iex").toLowerCase();
  if (!ALLOWED_FEEDS.has(feed)) {
    throw new MarketDataError("ALPACA_DATA_FEED must be a supported Alpaca stock feed.", 503);
  }
  return { key, secret, feed };
}

async function requestJson(url, env = process.env, fetcher = globalThis.fetch) {
  const { key, secret } = getConfiguration(env);
  let response;
  try {
    response = await fetcher(url, {
      headers: {
        Accept: "application/json",
        "APCA-API-KEY-ID": key,
        "APCA-API-SECRET-KEY": secret,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new MarketDataError("Could not reach Alpaca market data. Please retry.", 502);
  }

  if (!response.ok) {
    if (response.status === 429) {
      throw new MarketDataError("Alpaca request limit reached. Please retry shortly.", 429);
    }
    if (response.status === 401 || response.status === 403) {
      throw new MarketDataError("Alpaca rejected the backend credentials or feed access.", 502);
    }
    if (response.status === 404 || response.status === 422) {
      throw new MarketDataError("No market data was found for that symbol or query.", 404);
    }
    if (response.status >= 500) {
      throw new MarketDataError("Alpaca market data is temporarily unavailable.", 502);
    }
    throw new MarketDataError("Alpaca rejected that symbol or market-data query.", 400);
  }

  try {
    return await response.json();
  } catch {
    throw new MarketDataError("Alpaca returned an invalid market-data response.", 502);
  }
}

function finite(value) {
  const number = Number(value);
  return value !== null && value !== undefined && Number.isFinite(number) ? number : undefined;
}

function createAlpacaProvider({ env = process.env, fetcher = globalThis.fetch, now = Date.now } = {}) {
  let assetsCache;
  let assetsExpiresAt = 0;

  return {
    async getQuote(symbol) {
      const { feed } = getConfiguration(env);
      const query = new URLSearchParams({ feed });
      const snapshot = await requestJson(
        `${DATA_API_BASE}/stocks/${encodeURIComponent(symbol)}/snapshot?${query}`,
        env,
        fetcher,
      );
      const trade = snapshot.latestTrade || {};
      const quote = snapshot.latestQuote || {};
      const result = { symbol, source: "alpaca" };
      const price = finite(trade.p);
      const bid = finite(quote.bp);
      const ask = finite(quote.ap);
      const timestamp = trade.t || quote.t;
      if (price !== undefined) result.price = price;
      if (bid !== undefined) result.bid = bid;
      if (ask !== undefined) result.ask = ask;
      if (timestamp) result.timestamp = timestamp;
      if (price === undefined && bid === undefined && ask === undefined) {
        throw new MarketDataError("No current quote or trade was found for that symbol.", 404);
      }
      return result;
    },

    async getBars(symbol, { timeframe, start, end, limit }) {
      const { feed } = getConfiguration(env);
      const bars = [];
      let pageToken;
      do {
        const params = new URLSearchParams({
          symbols: symbol,
          timeframe,
          limit: String(Math.min(limit - bars.length, 1000)),
          feed,
          sort: "asc",
        });
        if (start) params.set("start", start);
        if (end) params.set("end", end);
        if (pageToken) params.set("page_token", pageToken);
        const body = await requestJson(`${DATA_API_BASE}/stocks/bars?${params}`, env, fetcher);
        const rows = Array.isArray(body.bars?.[symbol]) ? body.bars[symbol] : [];
        for (const row of rows) {
          const open = finite(row.o);
          const high = finite(row.h);
          const low = finite(row.l);
          const close = finite(row.c);
          const volume = finite(row.v);
          if (!row.t || [open, high, low, close, volume].some((value) => value === undefined)) continue;
          bars.push({ time: row.t, open, high, low, close, volume });
          if (bars.length >= limit) break;
        }
        pageToken = bars.length < limit ? body.next_page_token : undefined;
      } while (pageToken);

      return { symbol, timeframe, bars };
    },

    async searchSymbols(query) {
      const { key, secret } = getConfiguration(env);
      if (!assetsCache || assetsExpiresAt <= now()) {
        let response;
        try {
          const params = new URLSearchParams({ status: "active", asset_class: "us_equity" });
          response = await fetcher(`${ASSETS_API_URL}?${params}`, {
            headers: {
              Accept: "application/json",
              "APCA-API-KEY-ID": key,
              "APCA-API-SECRET-KEY": secret,
            },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          });
        } catch {
          throw new MarketDataError("Could not reach Alpaca symbol directory. Please retry.", 502);
        }
        if (!response.ok) {
          if (response.status === 429) throw new MarketDataError("Alpaca request limit reached. Please retry shortly.", 429);
          if (response.status === 401 || response.status === 403) throw new MarketDataError("Alpaca rejected the backend credentials.", 502);
          throw new MarketDataError("Alpaca symbol search is temporarily unavailable.", 502);
        }
        try {
          assetsCache = await response.json();
        } catch {
          throw new MarketDataError("Alpaca returned an invalid symbol directory.", 502);
        }
        assetsExpiresAt = now() + 15 * 60 * 1000;
      }

      const needle = query.toLowerCase();
      return assetsCache
        .filter((asset) => asset.status === "active" && asset.class === "us_equity")
        .filter((asset) => `${asset.symbol || ""} ${asset.name || ""}`.toLowerCase().includes(needle))
        .sort((a, b) => {
          const aExact = String(a.symbol || "").toLowerCase() === needle ? 0 : 1;
          const bExact = String(b.symbol || "").toLowerCase() === needle ? 0 : 1;
          return aExact - bExact || String(a.symbol || "").localeCompare(String(b.symbol || ""));
        })
        .slice(0, 10)
        .map((asset) => ({
          symbol: asset.symbol,
          name: asset.name,
          ...(asset.exchange ? { exchange: asset.exchange } : {}),
          type: "stock",
        }));
    },
  };
}

module.exports = { createAlpacaProvider, MarketDataError, requestJson };
