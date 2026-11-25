const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const requestCookies = require('../middleware/requestCookies');
test('legacy cookie writes still work and request polling listeners are released', async t => {
  const app=express();let cookies;
  app.use(requestCookies());
  app.get('/',(req,res)=>{cookies=req.universalCookies;cookies.set('test-only-cookie','ok',{path:'/'});res.json({ok:true});});
  const server=await new Promise(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));});
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const response=await fetch(`http://127.0.0.1:${server.address().port}/`);
  assert.equal(response.status,200);assert.match(response.headers.get('set-cookie'),/test-only-cookie=ok/);
  await response.json();assert.equal(cookies.changeListeners.length,0);
});
