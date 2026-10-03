# Options simulator setup

Frontend: `t-o-analytics`. Backend: `to-backendapi-v1`.

Apply `migrations/20261002_options_accounts.sql` to the same Supabase project used by the existing trading simulator. This creates only `options_practice_accounts`; it does not touch Stocks tables. RLS denies browser access and the Express API uses the existing Supabase admin client after verifying the simulator's bearer token with `auth.getUser` (including authenticated visitor sessions).

Required backend environment variables: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ALPACA_API_KEY`, `ALPACA_API_SECRET`. Set `ALPACA_OPTIONS_FEED=indicative` (default) or `opra` only with entitlement. Existing frontend `VITE_BACKEND_API`/`VITE_API_URL` and Supabase configuration are reused. Never put Alpaca credentials or service role keys in frontend environment variables.

Deploy the backend route and database migration before the new frontend. The UI reports unavailable services and never substitutes demo data. No Alpaca order endpoint is called. The Alpaca Trading API is used only for GET contract metadata; snapshots use the Market Data API.

## Endpoints

- `GET /api/options/expirations?symbol=AAPL`: standard contracts, discovered dates within three years, cached 15 minutes. A partial list is explicitly flagged.
- `GET /api/options/chain?symbol=AAPL&expiration=YYYY-MM-DD&type=call`: normalized quotes/Greeks, null missing values; snapshots cached 15 seconds.
- Authenticated `GET /api/options/account`, `/positions`, `/history`.
- Authenticated `POST /api/options/orders`: `{symbol, quantity, action: "buy"|"sell", requestId}`. Browser premium/cost/balance/user ID are ignored. A version-checked atomic write stores cash, positions and fills together, rejecting concurrent conflicts. Successful request IDs are idempotent until account reset.
- Authenticated `POST /api/options/reset`: clears only this user's Options account and restores $10,000 virtual cash.

This first version uses one isolated JSON account ledger per user to save each transaction atomically without a multi-table RPC. Full fill history is retained; production growth may warrant a normalized ledger with an atomic database transaction. Long positions only, standard 100-share contracts, no exercise/assignment. Fills require a quote/trade timestamp no older than 20 minutes (allowing indicative delay); trading is disabled on and after the expiration date. No stale valuation fallback to entry cost. Today's P/L is null until daily equity baselines are implemented. Total P/L includes realized and unrealized returns since reset when current position marks are available.

Legacy `to-options-lab-v1:*` browser saves are retained untouched. They are not imported as authoritative balances because browser accounting is untrusted. The legacy Vercel Options chain handler and its tests remain for compatibility; the new workspace uses Express exclusively.

## Verification

Backend: `node --test tests/options.test.js tests/optionsRoutes.test.js tests/marketData.test.js tests/realtimeMarketData.test.js`.

Frontend: `node --test scripts/options-calculations.test.js scripts/options-simulator.test.js scripts/alpaca-options.test.js scripts/stockChartServices.test.js scripts/paperTradeErrors.test.js scripts/marketDataStream.test.js`; run `npm run build` and targeted ESLint on new Options components.

Before release, run the user's browser flows with a configured backend and the migration applied: AAPL quote/chart/dates/chain, call/put/date/symbol changes, contract selection, payoff, buy call/put, full close, insufficient funds, upstream failure, mobile overflow. Also verify the unchanged Stocks page loads quote/chart/account/positions/history, switches timeframes and places a virtual stock trade. Automated Stocks service regressions cannot substitute for this live check.

### Continuation verification — 2026-10-03

- Fixed Options selection to derive from the current successful chain response, hiding the selected contract and disabling buys when chain refresh fails. Underlying bid/ask/timestamp and moneyness now also suppress cached quote values after errors.
- Manual refresh reloads expiration discovery as well as quotes, contracts, and account data. Successful session recovery clears a previous authentication error.
- Frontend regression tests: 22 passed. Production build passed before these follow-up UI edits; targeted Options ESLint passed after them.
- Backend Options and standard market-data tests: 14 passed. The separate realtime market-data suite passed its first five tests but timed out after 30 seconds; full Stocks realtime regression remains unresolved.
- Browser verification could not start because the browser-control runtime failed to initialize (`failed to write kernel assets`). Live flows, mobile layout, migration application, and deployment remain unverified. No deployment or database migration was performed in this continuation.
