const test = require("node:test");
const assert = require("node:assert/strict");
const EventEmitter = require("node:events");
const http = require("node:http");
const { WebSocket } = require("ws");
const { AlpacaStream } = require("../services/marketData/alpacaStream");
const { createRealtimeMarketDataService, attachRealtimeMarketData } = require("../services/realtimeMarketDataService");

class MockAlpacaSocket extends EventEmitter {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor(url) {
    super();
    this.url = url;
    this.readyState = MockAlpacaSocket.CONNECTING;
    this.sent = [];
    MockAlpacaSocket.instances.push(this);
  }
  send(payload) { this.sent.push(JSON.parse(payload)); }
  open() { this.readyState = MockAlpacaSocket.OPEN; this.emit("open"); }
  serverMessage(payload) { this.emit("message", Buffer.from(JSON.stringify(payload))); }
  ping() { this.emit("pong"); }
  close() { this.readyState = MockAlpacaSocket.CLOSED; this.emit("close"); }
  terminate() { this.close(); }
}
MockAlpacaSocket.instances = [];

function fakeTimers() {
  let nextId = 0;
  const pending = new Map();
  return {
    pending,
    setTimeout(callback, delay) { const id = ++nextId; pending.set(id, { callback, delay }); return id; },
    clearTimeout(id) { pending.delete(id); },
    setInterval(callback, delay) { return this.setTimeout(callback, delay); },
    clearInterval(id) { pending.delete(id); },
  };
}

class MockClient extends EventEmitter {
  static OPEN = 1;
  constructor() { super(); this.readyState = MockClient.OPEN; this.sent = []; }
  send(payload) { this.sent.push(JSON.parse(payload)); }
  message(payload) { this.emit("message", Buffer.from(JSON.stringify(payload))); }
  disconnect() { this.readyState = 3; this.emit("close"); }
}

test("Alpaca stream authenticates server-side, subscribes once, and normalizes minute bars", () => {
  MockAlpacaSocket.instances = [];
  const timers = fakeTimers();
  const stream = new AlpacaStream({
    env: { ALPACA_API_KEY: "test-key", ALPACA_API_SECRET: "test-secret", ALPACA_DATA_FEED: "iex" },
    WebSocketImpl: MockAlpacaSocket,
    timers,
  });
  const statuses = [];
  const bars = [];
  stream.on("status", (status) => statuses.push(status.status));
  stream.on("bar", (bar) => bars.push(bar));
  stream.subscribe("AAPL");
  stream.start();

  const socket = MockAlpacaSocket.instances[0];
  assert.match(socket.url, /\/v2\/iex$/);
  socket.open();
  assert.deepEqual(socket.sent[0], { action: "auth", key: "test-key", secret: "test-secret" });
  socket.serverMessage([{ T: "success", msg: "authenticated" }]);
  assert.deepEqual(socket.sent[1], { action: "subscribe", bars: ["AAPL"], updatedBars: ["AAPL"] });
  socket.serverMessage([{ T: "subscription", bars: ["AAPL"] }]);
  socket.serverMessage([{ T: "b", S: "AAPL", t: "2026-09-30T14:30:00Z", o: 10, h: 12, l: 9, c: 11, v: 50 }]);
  socket.serverMessage([{ T: "u", S: "AAPL", t: "2026-09-30T14:30:00Z", o: 10, h: 13, l: 9, c: 12, v: 55 }]);
  assert.deepEqual(bars[0], { type: "minute_bar", symbol: "AAPL", time: Date.parse("2026-09-30T14:30:00Z"), open: 10, high: 12, low: 9, close: 11, volume: 50 });
  assert.equal(bars[1].updated, true);
  assert.equal(bars[1].high, 13);
  assert.ok(statuses.includes("connected"));
  stream.unsubscribe("AAPL");
  assert.equal(stream.getStatus(), "offline");
});

test("Alpaca stream uses bounded exponential reconnect and restores active subscriptions", () => {
  MockAlpacaSocket.instances = [];
  const timers = fakeTimers();
  const stream = new AlpacaStream({
    env: { ALPACA_API_KEY: "test-key", ALPACA_API_SECRET: "test-secret", ALPACA_DATA_FEED: "iex" },
    WebSocketImpl: MockAlpacaSocket,
    timers,
  });
  stream.subscribe("MSFT");
  stream.start();
  const first = MockAlpacaSocket.instances[0];
  first.open();
  first.serverMessage([{ T: "success", msg: "authenticated" }]);
  first.close();
  const retry = [...timers.pending.entries()].find(([, timer]) => timer.delay === 1000);
  assert.ok(retry);
  timers.pending.delete(retry[0]);
  retry[1].callback();
  const second = MockAlpacaSocket.instances[1];
  assert.ok(second);
  second.open();
  second.serverMessage([{ T: "success", msg: "authenticated" }]);
  assert.deepEqual(second.sent[1], { action: "subscribe", bars: ["MSFT"], updatedBars: ["MSFT"] });
  stream.stop();
});

test("missing credentials and an unsupported feed produce controlled terminal stream states", () => {
  const noCredentials = new AlpacaStream({ env: {}, WebSocketImpl: MockAlpacaSocket, timers: fakeTimers() });
  noCredentials.start();
  assert.equal(noCredentials.getStatus(), "error");
  const badFeed = new AlpacaStream({ env: { ALPACA_API_KEY: "x", ALPACA_API_SECRET: "y", ALPACA_DATA_FEED: "invalid" }, WebSocketImpl: MockAlpacaSocket, timers: fakeTimers() });
  badFeed.start();
  assert.equal(badFeed.getStatus(), "error");
});

test("subscription manager shares upstream symbols across clients and cleans disconnects", () => {
  const calls = { subscribe: [], unsubscribe: [], start: 0, stop: 0 };
  const stream = new EventEmitter();
  stream.status = "offline";
  stream.getStatus = () => stream.status;
  stream.start = () => { calls.start += 1; stream.status = "connecting"; stream.emit("status", { status: "connecting" }); };
  stream.stop = () => { calls.stop += 1; stream.status = "offline"; stream.emit("status", { status: "offline" }); };
  stream.subscribe = (symbol) => calls.subscribe.push(symbol);
  stream.unsubscribe = (symbol) => calls.unsubscribe.push(symbol);
  const service = createRealtimeMarketDataService({ stream, maxSymbolsPerClient: 2 });
  const first = new MockClient();
  const second = new MockClient();
  const third = new MockClient();
  service.attachClient(first);
  service.attachClient(second);
  service.attachClient(third);

  first.message({ action: "subscribe", symbol: "aapl" });
  second.message({ action: "subscribe", symbol: "AAPL" });
  third.message({ action: "subscribe", symbol: "MSFT" });
  first.message({ action: "subscribe", symbol: "MSFT" });
  assert.deepEqual(calls.subscribe, ["AAPL", "MSFT"]);
  assert.deepEqual(service.getStats().symbolCounts, { AAPL: 2, MSFT: 2 });
  first.message({ action: "subscribe", symbol: "TSLA" });
  assert.ok(first.sent.some((message) => message.type === "error" && message.error.includes("at most 2")));
  first.message({ action: "subscribe", symbol: "AAPL/../MSFT" });
  assert.ok(first.sent.some((message) => message.type === "error" && message.error.includes("valid")));

  second.disconnect();
  assert.equal(service.getStats().symbolCounts.AAPL, 1);
  third.disconnect();
  first.disconnect();
  assert.deepEqual(calls.unsubscribe.sort(), ["AAPL", "MSFT"]);
  assert.equal(service.getStats().clientCount, 0);
});

test("subscription messages report provider acknowledgement and route complete bars", () => {
  const stream = new EventEmitter();
  stream.getStatus = () => "connected";
  stream.start = () => {};
  stream.stop = () => {};
  stream.subscribe = () => {};
  stream.unsubscribe = () => {};
  const service = createRealtimeMarketDataService({ stream });
  const client = new MockClient();
  service.attachClient(client);
  client.message({ action: "subscribe", symbol: "AAPL" });
  assert.ok(client.sent.some((message) => message.type === "subscription_pending"));
  stream.emit("subscribed", "AAPL");
  assert.ok(client.sent.some((message) => message.type === "subscribed" && message.symbol === "AAPL"));
  const bar = { type: "minute_bar", symbol: "AAPL", time: 1, open: 1, high: 2, low: 1, close: 2, volume: 10 };
  stream.emit("bar", bar);
  assert.ok(client.sent.some((message) => message.type === "minute_bar" && message.open === 1 && message.volume === 10));
  client.disconnect();
  service.close();
});

test("backend WebSocket endpoint accepts the frontend origin and relays normalized stream events", async (t) => {
  const stream = new EventEmitter();
  stream.getStatus = () => "offline";
  stream.start = () => { stream.status = "connecting"; stream.emit("status", { status: "connecting" }); };
  stream.stop = () => {};
  stream.subscribe = () => {};
  stream.unsubscribe = () => {};
  const service = createRealtimeMarketDataService({ stream });
  const server = http.createServer();
  const realtime = attachRealtimeMarketData(server, { service });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    realtime.close();
    await new Promise((resolve) => server.close(resolve));
  });
  const client = new WebSocket(`ws://127.0.0.1:${server.address().port}/api/market-data/stream`, {
    headers: { Origin: "https://www.to-analytics.com" },
  });
  const nextMessage = () => new Promise((resolve, reject) => {
    client.once("message", (raw) => resolve(JSON.parse(String(raw))));
    client.once("error", reject);
  });
  const initialMessage = nextMessage();
  await new Promise((resolve, reject) => { client.once("open", resolve); client.once("error", reject); });
  assert.deepEqual(await initialMessage, { type: "status", status: "offline" });
  client.send(JSON.stringify({ action: "subscribe", symbol: "AAPL" }));
  let message;
  do { message = await nextMessage(); } while (message.type !== "subscription_pending");
  stream.emit("subscribed", "AAPL");
  assert.deepEqual(await nextMessage(), { type: "subscribed", symbol: "AAPL" });
  const bar = { type: "minute_bar", symbol: "AAPL", time: 1000, open: 1, high: 2, low: 1, close: 2, volume: 10 };
  stream.emit("bar", bar);
  assert.deepEqual(await nextMessage(), bar);
  client.close();
  await new Promise((resolve) => client.once("close", resolve));
  assert.equal(service.getStats().clientCount, 0);
});
