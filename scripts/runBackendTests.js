'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.join(__dirname,'..');
const files = fs.readdirSync(path.join(root,'tests')).filter(name => /\.test\.(js|cjs)$/.test(name)).sort().map(name => `tests/${name}`);
// Excludes the old smoke-test.js ad-hoc prototype. All *.test.* files run in
// separate Node processes with their own mocks and localhost test servers.
const result = spawnSync(process.execPath,['--test','--test-concurrency=1','--test-timeout=60000',...files], { cwd: root, stdio: 'inherit', windowsHide: true });
if (result.error) { console.error('Backend test runner could not start.'); process.exitCode=1; }
else process.exitCode=result.status ?? 1;
