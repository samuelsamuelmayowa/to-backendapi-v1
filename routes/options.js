const express = require('express');
const rateLimit = require('express-rate-limit');
const { createOptionsMarketData } = require('../services/optionsMarketData');
const { applyOrder, emptyWallet, INITIAL_CASH } = require('../services/optionsAccounting');
const { OptionsError, databaseError } = require('../services/optionsErrors');
function createOptionsRouter({ market = createOptionsMarketData(), getDb = () => require('../config/supabaseAdmin') } = {}) {
  const router = express.Router();
  router.use(rateLimit({ windowMs: 60000, max: 90, standardHeaders: true, legacyHeaders: false, message: { code: 'RATE_LIMITED', error: 'Options request limit reached. Please retry shortly.' } }));
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  const wrap = fn => async (req, res) => {
    try { await fn(req, res); } catch (e) {
      const status = e.statusCode || 500;
      res.status(status).json({ code: e.code || 'SERVER_ERROR', error: e.statusCode ? e.message : 'An unexpected Options server error occurred. Please retry.', ...(e.upstreamStatus ? { upstreamStatus: e.upstreamStatus, upstreamCode: e.upstreamCode } : {}) });
    }
  };
  router.get('/health', (_req, res) => res.json({ status: 'ok', service: 'options', apiVersion: 1 }));
  function symbolQuery(req) {
    const symbol = String(req.query.symbol || '').toUpperCase();
    if (!/^[A-Z]{1,6}$/.test(symbol)) throw new OptionsError('Enter a valid underlying symbol.', 'INVALID_REQUEST');
    return symbol;
  }
  router.get('/expirations', wrap(async (req, res) => res.json(await market.expirations(symbolQuery(req)))));
  router.get('/chain', wrap(async (req, res) => {
    const symbol = symbolQuery(req), { expiration, type } = req.query;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiration || '') || !['call', 'put'].includes(type)
      || !Number.isFinite(Date.parse(expiration)) || new Date(expiration).toISOString().slice(0, 10) !== expiration) throw new OptionsError('Select a valid expiration and call or put.', 'INVALID_REQUEST');
    if (expiration <= new Date().toISOString().slice(0, 10)) throw new OptionsError('Choose a future expiration. Trading is disabled on or after expiration.', 'EXPIRED_CONTRACT');
    res.json(await market.chain(symbol, expiration, type));
  }));
  // Match the simulator's Supabase visitor/session identity, not the site's unrelated JWT identity.
  router.use(async (req, res, next) => {
    try {
      const token = /^Bearer (.+)$/.exec(req.headers.authorization || '')?.[1];
      if (!token) return res.status(401).json({ code: 'AUTH_REQUIRED', error: 'Sign in to your practice account.' });
      const { data, error } = await getDb().auth.getUser(token);
      if (error || !data?.user) return res.status(401).json({ code: 'AUTH_REQUIRED', error: 'Your practice session expired. Reload and try again.' });
      req.optionsUserId = data.user.id; next();
    } catch { res.status(503).json({ code: 'AUTH_UNAVAILABLE', error: 'Practice authentication is temporarily unavailable.' }); }
  });
  async function account(userId) {
    const db = getDb();
    const init = await db.from('options_practice_accounts').upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true });
    if (init.error) throw databaseError(init.error);
    const { data, error } = await db.from('options_practice_accounts').select('*').eq('user_id', userId).single();
    if (error) throw databaseError(error);
    return data;
  }
  async function save(userId, current, state) {
    const { data, error } = await getDb().from('options_practice_accounts').update({ state, version: current.version + 1, updated_at: new Date().toISOString() }).eq('user_id', userId).eq('version', current.version).select('version');
    if (error) throw databaseError(error);
    if (!data?.length) throw new OptionsError('Account changed during this request. Refresh before trying again.', 'ACCOUNT_CONFLICT', 409);
  }
  router.get('/account', wrap(async (req, res) => { const { state } = await account(req.optionsUserId); res.json({ cash: state.cash, initialCash: INITIAL_CASH, realizedPnl: state.history.reduce((s, f) => s + (f.realizedPnl || 0), 0), todayPnl: null }); }));
  router.get('/positions', wrap(async (req, res) => {
    const { state } = await account(req.optionsUserId);
    let quotes = []; let marketError = null;
    if (state.positions.length) {
      try { quotes = (await market.snapshots(state.positions.map(p => p.symbol))).contracts; } catch (e) { marketError = e.message; }
    }
    res.json({ positions: state.positions.map(p => ({ ...p, current: quotes.find(c => c.symbol === p.symbol) || null })), marketError });
  }));
  router.get('/history', wrap(async (req, res) => res.json({ history: (await account(req.optionsUserId)).state.history })));
  router.post('/orders', wrap(async (req, res) => {
    const { symbol, quantity, action, requestId } = req.body || {};
    if (typeof requestId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(requestId)) throw new OptionsError('A valid order request ID is required.', 'INVALID_REQUEST');
    const current = await account(req.optionsUserId);
    if (current.state.history.some(f => f.requestId === requestId)) return res.json({ status: 'filled' });
    const contract = await market.contract(String(symbol || ''));
    let state;
    try { state = applyOrder(current.state, contract, quantity, action, requestId); }
    catch (error) { throw new OptionsError(error.message, 'ORDER_REJECTED'); }
    await save(req.optionsUserId, current, state);
    res.json({ status: 'filled', fill: state.history[0] });
  }));
  router.post('/reset', wrap(async (req, res) => { const current = await account(req.optionsUserId); await save(req.optionsUserId, current, emptyWallet()); res.json({ status: 'reset' }); }));
  return router;
}
module.exports = { createOptionsRouter };
