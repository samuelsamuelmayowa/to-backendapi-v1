const test = require('node:test');
const assert = require('node:assert/strict');
const { scenarios } = require('../services/advancedScenarios');
const { executeAdvanced, sameResults } = require('../services/advancedSpl');
const { runPractice } = require('../services/advancedPractice');

test('all 21 tasks have nonempty, executable solutions without mutating source events', () => {
  assert.equal(scenarios.reduce((sum, s) => sum + s.tasks.length, 0), 21);
  for (const scenario of scenarios) {
    const snapshot = JSON.stringify(scenario.events);
    for (const task of scenario.tasks) {
      const result = runPractice({ scenarioId: scenario.id, taskId: task.id, query: task.query });
      assert.equal(result.passed, true, task.id);
      assert.ok(result.count > 0, task.id);
    }
    assert.equal(JSON.stringify(scenario.events), snapshot);
  }
});

test('investigation data contains the intended signal and meaningful background', () => {
  const auth = runPractice({ scenarioId: 'advanced-auth', taskId: 'sources', query: 'index=auth action=failure | stats count AS failures BY src_ip | where failures>=10' });
  assert.deepEqual(auth.rows, [{ src_ip: '203.0.113.44', failures: 12 }]);
  const outage = runPractice({ scenarioId: 'advanced-outage', taskId: 'latency', query: 'index=web status>=500 | stats avg(duration_ms) AS avg_ms BY host' });
  assert.deepEqual(outage.rows, [{ host: 'api-02', avg_ms: 3315 }]);
  const transfer = runPractice({ scenarioId: 'advanced-egress', taskId: 'threshold', query: 'index=proxy | stats sum(bytes_out) AS total_bytes BY src | where total_bytes>500000000' });
  assert.deepEqual(transfer.rows, [{ src: '192.0.2.77', total_bytes: 880000000 }]);
});

test('accepts equivalent queries and column ordering but enforces timeline order', () => {
  assert.equal(runPractice({ scenarioId: 'advanced-auth', taskId: 'sources', query: 'search index="auth" | search action="failure" | stats count AS failures BY src_ip | where failures>9 | table failures src_ip' }).passed, true);
  assert.equal(runPractice({ scenarioId: 'advanced-auth', taskId: 'timeline', query: 'index=auth src_ip=203.0.113.44 | sort - _time | table _time user src_ip action' }).passed, false);
  assert.equal(sameResults([{ a: 1 }, { a: 2 }], [{ a: 2 }, { a: 1 }]), true);
  assert.equal(sameResults([{ a: 1 }, { a: 1 }], [{ a: 1 }]), false);
});

test('partial replay and time windows do not award task completion', () => {
  const scenario = scenarios[0]; const task = scenario.tasks[0];
  const partial = runPractice({ scenarioId: scenario.id, taskId: task.id, query: task.query, cursor: 10 });
  assert.equal(partial.scanned, 10); assert.equal(partial.passed, false); assert.equal(partial.eligible, false);
  const windowed = runPractice({ scenarioId: scenario.id, taskId: task.id, query: task.query, windowMinutes: 5 });
  assert.ok(windowed.scanned < scenario.events.length); assert.equal(windowed.passed, false);
});

test('rejects invalid snapshots, commands, syntax, and resource-exhausting query lengths', () => {
  const payload = { scenarioId: 'advanced-auth', taskId: 'failures', query: 'index=auth' };
  for (const cursor of [-1, 0, 0.5, 100000, '10']) assert.throws(() => runPractice({ ...payload, cursor }), /replay position/);
  assert.throws(() => runPractice({ ...payload, windowMinutes: 99 }), /Choose/);
  assert.throws(() => runPractice({ ...payload, query: 'a'.repeat(3001) }), /3,000/);
  for (const query of ['index=auth | rex field=user "(a+)+"', 'index=auth | head 999999', 'index="auth', 'index=auth |', 'index=auth action=failure OR action=success', 'index=auth | eval x=alert(1)']) {
    assert.throws(() => runPractice({ ...payload, query }));
  }
});

test('field filters, wildcard values, quoted pipe characters, and empty results behave predictably', () => {
  const events = [{ _time: '09:00:00', message: 'a|b', status: 503 }, { _time: '09:05:00', message: 'clean', status: 200 }];
  assert.equal(executeAdvanced(events, 'index=test message="a|b"', { index: 'test' }).count, 1);
  assert.equal(executeAdvanced(events, 'index=test message="cl*"', { index: 'test' }).count, 1);
  assert.equal(executeAdvanced(events, 'message="' + 'a*'.repeat(1000) + 'z"', {}).count, 0);
  assert.equal(executeAdvanced(events, 'index=wrong', { index: 'test' }).count, 0);
  assert.deepEqual(executeAdvanced(events, 'status>900 | stats count AS events', {}).rows, [{ events: 0 }]);
});

test('browser and backend practice engines stay in sync', async () => {
  const browser = await import('../../t-o-analytics/src/lib/advancedLab/advancedPractice.js');
  for (const scenario of scenarios) for (const task of scenario.tasks) {
    const payload = { scenarioId: scenario.id, taskId: task.id, query: task.query };
    assert.deepEqual(browser.runPractice(payload), runPractice(payload));
  }
});

test('practice HTTP endpoint works without a database and returns validation errors', async () => {
  const express = require('express');
  const app = express(); app.use(express.json());
  app.use('/api/splunk-lab', require('../routes/splunkLab'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/splunk-lab/practice/run`;
    const post = body => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const response = await post({ scenarioId: 'advanced-auth', taskId: 'failures', query: 'index=auth action=failure' });
    assert.equal(response.status, 200); assert.equal((await response.json()).data.passed, true);
    assert.equal((await post({ scenarioId: 'missing' })).status, 422);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
