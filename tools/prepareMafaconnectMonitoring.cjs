'use strict';
// Explicit local preparation only; never starts, stops or deploys MAFACONNECT.
const fs = require('node:fs');
const path = require('node:path');
const root = process.argv[2];
if (!root || !path.isAbsolute(root)) throw new Error('An absolute application directory is required');
const file = path.join(root, 'package.json');
let source = fs.readFileSync(file, 'utf8');
const pkg = JSON.parse(source);
const additions = {
  'start:monitoring': 'node --env-file=.env --require @opentelemetry/auto-instrumentations-node/register app.js',
  'dev:monitoring': 'nodemon --exec "node --env-file=.env --require @opentelemetry/auto-instrumentations-node/register" app.js',
};
for (const [name, command] of Object.entries(additions)) {
  if (pkg.scripts[name] && pkg.scripts[name] !== command) throw new Error('Existing monitoring script differs; review manually');
}
const missing = Object.entries(additions).filter(([name]) => !pkg.scripts[name]);
if (missing.length) {
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  source = source.replace(/("scripts"\s*:\s*\{)/, '$1' + newline + missing.map(([name, value]) => `    ${JSON.stringify(name)}: ${JSON.stringify(value)},`).join(newline));
  JSON.parse(source);
  fs.writeFileSync(file, source);
}
const configFile = path.join(root, 'ecosystem.monitoring.config.cjs');
const config = `'use strict';
// Opt-in configuration for review. Uses the same application, cwd and env.
// Requires Node 22+ and a private .env in the configured cwd.
const base = require('./ecosystem.config.js');
module.exports = { ...base, apps: base.apps.map(app => ({
  ...app,
  node_args: ['--env-file=.env', '--require', '@opentelemetry/auto-instrumentations-node/register'],
})) };
`;
if (fs.existsSync(configFile) && fs.readFileSync(configFile, 'utf8') !== config) throw new Error('Existing monitoring PM2 configuration differs; review manually');
fs.writeFileSync(configFile, config);
console.log('Prepared opt-in npm and PM2 monitoring startup; no application process started or restarted.');
