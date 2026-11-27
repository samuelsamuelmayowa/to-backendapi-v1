'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');
const applicationDirectory = process.env.MONITORING_TEST_APPLICATION_DIR;

test('official HTTP/Express/mysql2 context reaches receiver and disposable PostgreSQL for success, failure and background work', {
  skip: !applicationDirectory && 'Set MONITORING_TEST_APPLICATION_DIR to the installed test application directory; never supply credentials',
  timeout: 240000,
}, async () => {
  assert.ok(path.isAbsolute(applicationDirectory));
  const { stdout } = await promisify(execFile)(process.execPath, [path.join(__dirname, '../probeInstalledMonitoring.cjs'), applicationDirectory,
    '--mysql', '--mysql-success', '--express', '--frontend-setup', '--default-detectors', '--postgres'],
  { cwd: path.join(__dirname, '../..'), windowsHide: true, timeout: 220000 });
  const reports = stdout.trim().split(/\r?\n/).filter(line => line.startsWith('{')).map(line => JSON.parse(line));
  const mysql = reports.find(report => 'mysqlStartupRoots' in report);
  const receiver = reports.find(report => 'receiverStoredSpans' in report);
  const stored = reports.find(report => 'correctTestProject' in report);
  assert.equal(mysql.mysqlStartupRoots, 1);
  assert.equal(mysql.mysqlRequestChildren, 2);
  assert.equal(mysql.successfulMysqlRequestSpans, 1);
  assert.equal(mysql.failedMysqlRequestSpans, 1);
  assert.equal(mysql.failureHttpStatus, 500);
  assert.equal(receiver.exportedServerSpans, 2);
  assert.equal(receiver.exportedClientSpans, 3);
  assert.ok(receiver.filteredInternalSpans > 0);
  assert.deepEqual(receiver.receiverStatuses, [200]);
  assert.equal(receiver.receiverStoredSpans, 5);
  assert.equal(receiver.storage, 'disposable-local-PostgreSQL');
  assert.equal(stored.storedServerSpans, 2);
  assert.equal(stored.storedClientSpans, 3);
  assert.equal(stored.correlated, true);
  assert.equal(stored.safe, true);
  assert.equal(stored.correctTestProject, true);
  assert.equal(stored.productionRequests, 0);
});
