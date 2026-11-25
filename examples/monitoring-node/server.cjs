'use strict';
// OpenTelemetry is loaded BEFORE Express by the documented --require option.
const express = require('express');
const app = express();
app.get('/products', (req, res) => res.json({ products: [{ id: 'sample', name: 'Shopping API demo' }] }));
const server = app.listen(Number(process.env.PORT || 8091), '127.0.0.1', () => {
  console.log(`Shopping API listening on http://127.0.0.1:${server.address().port}/products`);
});
process.on('SIGTERM', () => server.close());
