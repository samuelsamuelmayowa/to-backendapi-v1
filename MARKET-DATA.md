# Read-only stock market data API

This API is independent of the Supabase paper-trading workflow. It reads stock market data from Alpaca and never submits orders or accesses simulator tables.

## Backend environment

Set `ALPACA_API_KEY` and `ALPACA_API_SECRET` in the Node backend runtime. Optional `ALPACA_DATA_FEED` selects `sip`, `iex`, `delayed_sip`, `boats`, `overnight`, or `otc`; it defaults to `iex`. Keep these variables server-side and do not prefix them with `VITE_`. The provider endpoints are fixed in the provider adapter; clients cannot supply an upstream URL.

The backend's `.env.example` documents the required names. `ALPACA_DATA_URL` is deliberately not read, so environment configuration cannot redirect credential-bearing calls to an arbitrary host.

## Endpoints

- `GET /api/market-data/quote/:symbol` returns the latest trade price when Alpaca supplies one, optional bid and ask when available, the associated timestamp when available, and `source: "alpaca"`.
- `GET /api/market-data/bars/:symbol?timeframe=1Day&limit=200` returns normalized OHLCV bars. Optional `start` and `end` accept `YYYY-MM-DD` or RFC-3339 timestamps. `limit` is 1–10,000.
- `GET /api/market-data/search?q=apple` searches active US equity assets from Alpaca's asset directory and returns at most ten normalized results.

Requests are read-only, limited to 60 requests per minute per client IP, and return generic provider/network errors without exposing provider response bodies or credentials. The Alpaca asset directory is cached in process memory for 15 minutes. Rate limiting and the cache are process-local; multi-instance deployments should add shared storage if a global limit/cache is required.

## Data source

The implementation uses Alpaca's official stock snapshot, historical bars, and asset-list endpoints. Feed availability and latency depend on the Alpaca account's data entitlements. Check the official [latest stock snapshot](https://docs.alpaca.markets/us/reference/stocksnapshotsingle), [historical stock bars](https://docs.alpaca.markets/us/reference/stockbars), and [assets](https://docs.alpaca.markets/us/reference/get-v2-assets-1) documentation.
