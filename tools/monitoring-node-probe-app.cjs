'use strict';
// Test app only. Requires the selected installed Express package, never app.js,
// dotenv, Sequelize, the user's database or the user's production ingestion key.
const express = require(process.env.MONITORING_TEST_EXPRESS_PATH);
const http = require('node:http');
const app = express();
let mysql, mysqlEndpoint;
async function query() {
  // Loopback fault server, no real DB, credentials or SQL data. Query failures
  // still finish official mysql2 spans and expose their context for this probe.
  const connection = mysql.createConnection({ host: '127.0.0.1', port: mysqlEndpoint.address().port, user: 'probe', password: 'DO_NOT_STORE' });
  connection.on('error', () => {});
  await new Promise(resolve => connection.query('SELECT 1 /* DO_NOT_STORE */', () => { connection.destroy(); resolve(); }));
}
if (process.env.MONITORING_TEST_MYSQL_PATH) {
  mysql = require(process.env.MONITORING_TEST_MYSQL_PATH);
  mysqlEndpoint = require('node:net').createServer(socket => socket.destroy());
}
let dependency;
if (process.env.MONITORING_TEST_DEPENDENCIES === '1') {
  dependency = http.createServer((req,res) => res.end('local dependency'));
  dependency.listen(0,'127.0.0.1');
}
app.get('/', async (req, res) => {
  if (mysql) { await query(); return res.json({ probe: true }); }
  if (!dependency) return res.json({ probe: true });
  http.get(`http://127.0.0.1:${dependency.address().port}/private?token=DO_NOT_STORE`, response => {
    response.resume(); response.on('end', () => res.json({ probe: true }));
  }).on('error', () => res.status(502).end());
});
let server;
async function start() {
  if (mysql) {
    await new Promise(resolve => mysqlEndpoint.listen(0, '127.0.0.1', resolve));
    await query(); // Startup operation outside any HTTP request.
  }
  server = app.listen(0, '127.0.0.1', () => console.log(`Probe listening port=${server.address().port}`));
}
start().catch(() => process.exit(1));
process.on('SIGTERM', () => { server?.close(); dependency?.close(); mysqlEndpoint?.close(); });
