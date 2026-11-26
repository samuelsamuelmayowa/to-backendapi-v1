'use strict';
// Test app only. Requires the selected installed Express package, never app.js,
// dotenv, Sequelize, the user's database or the user's production ingestion key.
const express = require(process.env.MONITORING_TEST_EXPRESS_PATH);
const http = require('node:http');
const app = express();
let dependency;
if (process.env.MONITORING_TEST_DEPENDENCIES === '1') {
  dependency = http.createServer((req,res) => res.end('local dependency'));
  dependency.listen(0,'127.0.0.1');
}
app.get('/', (req, res) => {
  if (!dependency) return res.json({ probe: true });
  http.get(`http://127.0.0.1:${dependency.address().port}/private?token=DO_NOT_STORE`, response => {
    response.resume(); response.on('end', () => res.json({ probe: true }));
  }).on('error', () => res.status(502).end());
});
const server = app.listen(0, '127.0.0.1', () => console.log(`Probe listening port=${server.address().port}`));
process.on('SIGTERM', () => { server.close(); dependency?.close(); });
