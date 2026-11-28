'use strict';
// Test app only. Requires the selected installed Express package, never app.js,
// dotenv, Sequelize, the user's database or the user's production ingestion key.
const express = require(process.env.MONITORING_TEST_EXPRESS_PATH);
const http = require('node:http');
const app = express();
let mysql, mysqlEndpoint;
async function query(fail = false, promiseMode = false) {
  // Loopback fault server, no real DB, credentials or SQL data. Query failures
  // still finish official mysql2 spans and expose their context for this probe.
  const connection = mysql.createConnection({ host: '127.0.0.1', port: (mysqlEndpoint._server || mysqlEndpoint).address().port, user: 'probe', password: 'DO_NOT_STORE' });
  connection.on('error', () => {});
  if (promiseMode) {
    try { const [result] = await connection.promise().query('SELECT 1 /* DO_NOT_STORE */'); return { failed: false, result }; }
    catch { return { failed: true }; }
    finally { connection.destroy(); }
  }
  return new Promise(resolve => connection.query(fail ? 'SELECT 0 /* CONTROLLED_FAILURE DO_NOT_STORE */' : 'SELECT 1 /* DO_NOT_STORE */', (error, result) => {
    connection.destroy(); resolve({ failed: !!error, result });
  }));
}
if (process.env.MONITORING_TEST_MYSQL_PATH) {
  mysql = require(process.env.MONITORING_TEST_MYSQL_PATH);
  if (process.env.MONITORING_TEST_MYSQL_SUCCESS === '1') {
    // A synthetic protocol endpoint, never a real database or application data.
    mysqlEndpoint = mysql.createServer();
    mysqlEndpoint.on('connection', connection => {
      connection.on('error', () => {});
      connection.serverHandshake({ protocolVersion: 10, serverVersion: '8.0.0-probe',
        connectionId: 1, statusFlags: 2, characterSet: 45, capabilityFlags: 0x8a205 });
      connection.on('query', statement => {
        setTimeout(() => {
          if (statement.includes('CONTROLLED_FAILURE')) return connection.writeError({ code: 1105, message: 'Controlled probe failure' });
          connection.writeColumns([{ catalog: 'def', schema: '', table: '', orgTable: '', name: 'value', orgName: '', characterSet: 45, columnLength: 1, columnType: 3, flags: 0, decimals: 0 }]);
          connection.writeTextRow([1]); connection.writeEof();
        }, 25);
      });
    });
  } else mysqlEndpoint = require('node:net').createServer(socket => socket.destroy());
}
let dependency;
if (process.env.MONITORING_TEST_DEPENDENCIES === '1') {
  dependency = http.createServer((req,res) => res.end('local dependency'));
  dependency.listen(0,'127.0.0.1');
}
app.get('/', async (req, res) => {
  if (mysql) {
    const result = await query(false, true);
    return res.status(result.failed && process.env.MONITORING_TEST_MYSQL_SUCCESS === '1' ? 500 : 200).json({ probe: true, databaseFailed: result.failed });
  }
  if (!dependency) return res.json({ probe: true });
  http.get(`http://127.0.0.1:${dependency.address().port}/private?token=DO_NOT_STORE`, response => {
    response.resume(); response.on('end', () => res.json({ probe: true }));
  }).on('error', () => res.status(502).end());
});
app.get('/failure', async (req, res) => {
  if (!mysql) return res.status(404).end();
  const result = await query(true);
  res.status(result.failed ? 500 : 200).json({ probe: true, databaseFailed: result.failed });
});
let server;
async function start() {
  if (mysql) {
    await new Promise(resolve => mysqlEndpoint.listen(0, '127.0.0.1', resolve));
    await query(); // Startup operation outside any HTTP request.
  }
  server = app.listen(Number(process.env.MONITORING_TEST_PORT || 0), '127.0.0.1', error => {
    if (error) return console.log(`Probe bind error=${error.code}`);
    console.log(`Probe listening port=${server.address().port}`);
  });
}
start().catch(() => process.exit(1));
process.on('SIGTERM', () => { server?.close(); dependency?.close(); mysqlEndpoint?.close(); });
