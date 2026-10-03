const INITIAL_CASH = 10000;
const round = v => Math.round(v * 100) / 100;
const emptyWallet = () => ({ cash: INITIAL_CASH, positions: [], history: [] });
function applyOrder(wallet, contract, quantity, action, requestId, now = new Date()) {
  if (!['buy', 'sell'].includes(action)) throw new Error('Only Buy to Open and Sell to Close are supported.');
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10000) throw new Error('Enter 1–10,000 whole contracts.');
  if (!contract || !Number.isFinite(contract.mark) || contract.mark <= 0) throw new Error('This contract has no valid premium.');
  if (contract.expiration <= now.toISOString().slice(0, 10)) throw new Error('Trading is disabled on or after the expiration date.');
  const age = now.getTime() - Date.parse(contract.timestamp);
  if (!Number.isFinite(age) || age < -60000 || age > 20 * 60000) throw new Error('Market data is stale. Refresh during market hours before trading.');
  const existing = wallet.positions.find(p => p.symbol === contract.symbol);
  if (action === 'sell' && (!existing || quantity > existing.quantity)) throw new Error('You can only close contracts owned in this Options account.');
  const total = round(contract.mark * 100 * quantity);
  if (!Number.isSafeInteger(Math.round(total * 100))) throw new Error('Order size is too large.');
  if (action === 'buy' && total > wallet.cash) throw new Error('Insufficient Options practice buying power.');
  const remaining = (existing?.quantity || 0) + (action === 'buy' ? quantity : -quantity);
  const average = action === 'buy' ? ((existing?.average || 0) * (existing?.quantity || 0) + contract.mark * quantity) / remaining : existing.average;
  const positions = wallet.positions.filter(p => p.symbol !== contract.symbol);
  if (remaining) positions.push({ ...contract, quantity: remaining, average, entryCost: round(average * 100 * remaining), entryTimestamp: existing?.entryTimestamp || now.toISOString(), status: 'open' });
  const fill = { ...contract, quantity, action, total, premium: contract.mark, date: now.toISOString(), requestId, status: 'filled', realizedPnl: action === 'sell' ? round((contract.mark - existing.average) * 100 * quantity) : null };
  return { cash: round(wallet.cash + (action === 'buy' ? -total : total)), positions, history: [fill, ...wallet.history] };
}
module.exports = { INITIAL_CASH, emptyWallet, applyOrder };
