# Read-only stock market data API

This API is independent of the Supabase paper-trading workflow. It reads stock market data from Alpaca and never submits orders or accesses simulator tables.

## Backend environment

Set `ALPACA_API_KEY` and `ALPACA_API_SECRET` in the Node backend runtime. Optional `ALPACA_DATA_FEED` selects `sip`, `iex`, `delayed_sip`, `boats`, `overnight`, or `otc`; it defaults to `iex`. Keep these variables server-side and do not prefix them with `VITE_`. The provider endpoints are fixed in the provider adapter; clients cannot supply an upstream URL.

The backend's `.env.example` documents the required names. `ALPACA_DATA_URL` is deliberately not read, so environment configuration cannot redirect credential-bearing calls to an arbitrary host.

## Endpoints

- `GET /api/market-data/quote/:symbol` returns the latest trade price when Alpaca supplies one, optional bid and ask when available, the associated timestamp when available, and `source: "alpaca"`.
- `GET /api/market-data/bars/:symbol?timeframe=1Day&limit=200` returns normalized OHLCV bars. Optional `start` and `end` accept `YYYY-MM-DD` or RFC-3339 timestamps. `limit` is 1–10,000.
- `GET /api/market-data/search?q=apple` searches active US equity assets from Alpaca's asset directory and returns at most ten normalized results.
- `GET /api/market-data/symbol/AAPL` returns metadata only for an exact active U.S. equity match from the same cached asset directory. It supplies `currency: "USD"` for this U.S. equity universe and returns 404 for an absent exact match.

## TradingView Datafeed adapter

The frontend adapter is `t-o-analytics/src/services/tradingViewDatafeed.js`. It calls only this backend and advertises `1`, `5`, `15`, `30`, `60`, `D`, and `W`, mapped to `1Min`, `5Min`, `15Min`, `30Min`, `1Hour`, `1Day`, and `1Week`. It requests the chart's `from`/`to` interval and uses `countBack` as the bars limit, capped at the API maximum of 10,000. Intraday times remain exact epoch milliseconds. Daily and weekly bar timestamps are normalized to midnight UTC on the provider's session date, as TradingView expects. Symbol price precision is one cent (`minmov: 1`, `pricescale: 100`) for the supported U.S. equity chart universe. Realtime subscriptions are intentionally no-op placeholders until Phase 3.

Requests are read-only, limited to 60 requests per minute per client IP, and return generic provider/network errors without exposing provider response bodies or credentials. The Alpaca asset directory is cached in process memory for 15 minutes. Rate limiting and the cache are process-local; multi-instance deployments should add shared storage if a global limit/cache is required.

## Data source

The implementation uses Alpaca's official stock snapshot, historical bars, and asset-list endpoints. Feed availability and latency depend on the Alpaca account's data entitlements. Check the official [latest stock snapshot](https://docs.alpaca.markets/us/reference/stocksnapshotsingle), [historical stock bars](https://docs.alpaca.markets/us/reference/stockbars), and [assets](https://docs.alpaca.markets/us/reference/get-v2-assets-1) documentation.

## Realtime stream

`GET /api/market-data/stream` upgrades to the T.O. WebSocket protocol. Clients send `{"action":"subscribe","symbol":"AAPL"}` or the matching `unsubscribe` message. Authenticated Alpaca minute bars are normalized as `{type:"minute_bar",symbol,time,open,high,low,close,volume}` and sent only to T.O. clients subscribed to that symbol. One Alpaca connection is shared per backend process; frontend subscriptions are reference-counted. The service validates ticker syntax, limits clients to five symbols each, limits the backend to 100 active symbols and 500 clients, checks browser origins, and closes stale clients with ping/pong keepalives. It reads `ALPACA_DATA_FEED` and defaults to `iex`; feed entitlement errors are surfaced as controlled stream status errors. Alpaca credentials are used only in the backend auth message. Reconnects use bounded exponential delay and active symbols are re-subscribed after authentication.

The browser aggregates incoming regular-session minute bars to supported chart periods. Intraday boundaries use the U.S. Eastern session open and account for daylight saving time; daily and weekly bars are stamped at midnight UTC for the New York session date/week. This UI and realtime path do not change the paper-trading order engine. Alpaca stream protocol reference: [official streaming market data documentation](https://docs.alpaca.markets/us/docs/streaming-market-data).
