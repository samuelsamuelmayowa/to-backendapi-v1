const { WebSocket, WebSocketServer } = require("ws");
const { validateSymbol } = require("./marketDataService");
const { AlpacaStream } = require("./marketData/alpacaStream");

const MAX_SYMBOLS_PER_CLIENT = 5;
const MAX_ACTIVE_SYMBOLS = 100;
const MAX_CLIENTS = 500;
const ALLOWED_ORIGINS = new Set(["https://www.to-analytics.com", "http://localhost:5173"]);
const STREAM_PATH = "/api/market-data/stream";

function createRealtimeMarketDataService({ stream = new AlpacaStream(), maxSymbolsPerClient = MAX_SYMBOLS_PER_CLIENT } = {}) {
  const clients = new Map();
  const symbolCounts = new Map();

  function send(client, message) {
    if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(message));
  }

  function broadcastStatus(status) {
    for (const client of clients.keys()) send(client, { type: "status", status: status.status, ...(status.message ? { message: status.message } : {}) });
  }

  stream.on("status", broadcastStatus);
  stream.on("subscribed", (symbol) => {
    for (const [client, state] of clients) if (state.symbols.has(symbol)) send(client, { type: "subscribed", symbol });
  });
  stream.on("bar", (bar) => {
    for (const [client, state] of clients) if (state.symbols.has(bar.symbol)) send(client, bar);
  });
  stream.on("providerError", (error) => {
    for (const client of clients.keys()) send(client, { type: "error", error: error.message });
  });

  function subscribe(client, state, rawSymbol) {
    let symbol;
    try { symbol = validateSymbol(rawSymbol); } catch {
      send(client, { type: "error", error: "Enter a valid U.S. stock symbol." });
      return;
    }
    if (state.symbols.has(symbol)) return;
    if (state.symbols.size >= maxSymbolsPerClient) {
      send(client, { type: "error", error: `A connection can subscribe to at most ${maxSymbolsPerClient} symbols.` });
      return;
    }
    if (!symbolCounts.has(symbol) && symbolCounts.size >= MAX_ACTIVE_SYMBOLS) {
      send(client, { type: "error", error: "Realtime capacity is full. Try again shortly." });
      return;
    }
    state.symbols.add(symbol);
    const count = (symbolCounts.get(symbol) || 0) + 1;
    symbolCounts.set(symbol, count);
    if (count === 1) {
      stream.subscribe(symbol);
      stream.start();
    }
    send(client, { type: "subscription_pending", symbol });
  }

  function unsubscribe(client, state, rawSymbol) {
    let symbol;
    try { symbol = validateSymbol(rawSymbol); } catch { return; }
    if (!state.symbols.delete(symbol)) return;
    const count = (symbolCounts.get(symbol) || 1) - 1;
    if (count <= 0) {
      symbolCounts.delete(symbol);
      stream.unsubscribe(symbol);
    } else symbolCounts.set(symbol, count);
    send(client, { type: "unsubscribed", symbol });
  }

  function attachClient(client) {
    const state = { symbols: new Set() };
    clients.set(client, state);
    send(client, { type: "status", status: stream.getStatus() });

    client.on("message", (raw) => {
      let message;
      try { message = JSON.parse(String(raw)); } catch {
        send(client, { type: "error", error: "Send a valid JSON subscription message." });
        return;
      }
      if (!message || !["subscribe", "unsubscribe"].includes(message.action)) {
        send(client, { type: "error", error: "Subscription action must be subscribe or unsubscribe." });
        return;
      }
      if (message.action === "subscribe") subscribe(client, state, message.symbol);
      else unsubscribe(client, state, message.symbol);
    });

    client.on("close", () => {
      for (const symbol of [...state.symbols]) unsubscribe(client, state, symbol);
      clients.delete(client);
    });
  }

  return {
    attachClient,
    getStats() {
      return { clientCount: clients.size, symbolCounts: Object.fromEntries(symbolCounts), status: stream.getStatus() };
    },
    close() {
      for (const client of clients.keys()) client.close();
      stream.stop();
      stream.removeListener("status", broadcastStatus);
    },
  };
}

function attachRealtimeMarketData(httpServer, options = {}) {
  const service = options.service || createRealtimeMarketDataService(options);
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024, perMessageDeflate: false });
  wss.on("connection", (client) => {
    if (wss.clients.size > MAX_CLIENTS) {
      client.close(1013, "Realtime capacity is full.");
      return;
    }
    client.isAlive = true;
    client.on("pong", () => { client.isAlive = true; });
    service.attachClient(client);
  });
  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      if (!client.isAlive) {
        client.terminate();
        continue;
      }
      client.isAlive = false;
      client.ping();
    }
  }, 20000);
  heartbeat.unref?.();

  const onUpgrade = (request, socket, head) => {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname !== STREAM_PATH) {
      socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    const origin = request.headers.origin;
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (client) => wss.emit("connection", client, request));
  };
  httpServer.on("upgrade", onUpgrade);

  return {
    service,
    close() {
      clearInterval(heartbeat);
      httpServer.removeListener("upgrade", onUpgrade);
      service.close();
      wss.close();
    },
  };
}

module.exports = { createRealtimeMarketDataService, attachRealtimeMarketData, STREAM_PATH, MAX_SYMBOLS_PER_CLIENT, MAX_ACTIVE_SYMBOLS, MAX_CLIENTS };
