const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startMonitoringRetention } = require('../routes/monitoring');

test('retention schedules the real RPC every minute, skips overlaps and recovers after failure', async () => {
  let tick, finish, calls = 0, warnings = 0, unref = false;
  const timer = startMonitoringRetention(() => ({ rpc(name) {
    assert.equal(name, 'monitoring_prune_expired'); calls++;
    return new Promise(resolve => { finish = resolve; });
  } }), { schedule(callback, interval) {
    assert.equal(interval, 60000); tick = callback;
    return { unref() { unref = true; } };
  }, logger: { warn() { warnings++; } } });
  assert.ok(timer); assert.equal(unref, true);
  const first = tick();
  await tick(); assert.equal(calls, 1);
  finish({ error: { code: 'test-only' } }); await first;
  assert.equal(warnings, 1);
  const second = tick(); assert.equal(calls, 2);
  finish({ data: { spans_deleted: 1, buckets_deleted: 1 }, error: null }); await second;
  assert.equal(warnings, 1);
});

test('retention survives thrown storage errors and retries on the next tick', async () => {
  let tick, calls = 0;
  startMonitoringRetention(() => { calls++; throw new Error('test-only'); }, {
    schedule(callback) { tick = callback; return { unref() {} }; }, logger: { warn() {} },
  });
  await tick(); await tick(); assert.equal(calls, 2);
});
