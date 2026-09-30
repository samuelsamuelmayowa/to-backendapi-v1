const EventEmitter = require("node:events");

const STREAM_FEED_PATHS = {
  iex: "v2/iex",
  sip: "v2/sip",
  delayed_sip: "v2/delayed_sip",
  boats: "v1beta1/boats",
  overnight: "v1beta1/overnight",
};
const BASE_RETRY_MS = 1000;
const MAX_RETRY_MS = 30000;
const MAX_RETRIES = 8;

class AlpacaStream extends EventEmitter {
  constructor({ env = process.env, WebSocketImpl = require("ws"), timers = globalThis } = {}) {
    super();
    this.env = env;
    this.WebSocketImpl = WebSocketImpl;
    this.timers = timers;
    this.socket = null;
    this.symbols = new Set();
    this.status = "offline";
    this.retryCount = 0;
    this.retryTimer = null;
    this.heartbeatTimer = null;
    this.stopped = true;
    this.fatal = false;
    this.lastPong = true;
  }

  getStatus() { return this.status; }

  setStatus(status, detail) {
    this.status = status;
    this.emit("status", { status, ...(detail ? { message: detail } : {}) });
  }

  start() {
    this.stopped = false;
    this.fatal = false;
    if (!this.socket && !this.retryTimer) this.connect();
  }

  stop() {
    this.stopped = true;
    this.clearTimers();
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState < this.WebSocketImpl.CLOSING) socket.close();
    this.setStatus("offline");
  }

  subscribe(symbol) {
    if (this.symbols.has(symbol)) return;
    this.symbols.add(symbol);
    if (this.status === "connected") this.send({ action: "subscribe", bars: [symbol], updatedBars: [symbol] });
  }

  unsubscribe(symbol) {
    if (!this.symbols.delete(symbol)) return;
    if (this.status === "connected") this.send({ action: "unsubscribe", bars: [symbol], updatedBars: [symbol] });
    if (this.symbols.size === 0) this.stop();
  }

  send(payload) {
    if (this.socket?.readyState === this.WebSocketImpl.OPEN) this.socket.send(JSON.stringify(payload));
  }

  connect() {
    if (this.stopped || this.fatal || this.socket) return;
    const key = this.env.ALPACA_API_KEY;
    const secret = this.env.ALPACA_API_SECRET;
    const feed = String(this.env.ALPACA_DATA_FEED || "iex").toLowerCase();
    if (!key || !secret) {
      this.setStatus("error", "Realtime market data is not configured on the backend.");
      this.fatal = true;
      return;
    }
    const feedPath = STREAM_FEED_PATHS[feed];
    if (!feedPath) {
      this.setStatus("error", "The configured Alpaca stock feed is unsupported.");
      this.fatal = true;
      return;
    }

    this.setStatus(this.retryCount ? "reconnecting" : "connecting");
    let socket;
    try {
      socket = new this.WebSocketImpl(`wss://stream.data.alpaca.markets/${feedPath}`);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;
    const authTimeout = this.timers.setTimeout(() => {
      if (this.socket === socket && this.status !== "connected") socket.terminate?.();
    }, 8000);

    socket.on("open", () => {
      this.lastPong = true;
      socket.send(JSON.stringify({ action: "auth", key, secret }));
    });
    socket.on("message", (raw) => {
      let messages;
      try { messages = JSON.parse(String(raw)); } catch { return; }
      for (const message of Array.isArray(messages) ? messages : [messages]) {
        if (message.T === "success" && message.msg === "authenticated") {
          this.timers.clearTimeout(authTimeout);
          this.retryCount = 0;
          this.setStatus("connected");
          if (this.symbols.size) this.send({ action: "subscribe", bars: [...this.symbols], updatedBars: [...this.symbols] });
        } else if (message.T === "error") {
          const authOrEntitlementFailure = [401, 402, 403, 409].includes(Number(message.code));
          this.emit("providerError", { code: Number(message.code), message: "Alpaca rejected realtime authentication or feed access." });
          if (authOrEntitlementFailure) {
            this.fatal = true;
            this.setStatus("error", "Alpaca rejected realtime authentication or feed access.");
            socket.close();
          }
        } else if (message.T === "subscription") {
          for (const symbol of new Set([...(message.bars || []), ...(message.updatedBars || [])])) this.emit("subscribed", symbol);
        } else if (message.T === "b" || message.T === "u") {
          const bar = this.normalizeMinuteBar(message, message.T === "u");
          if (bar) this.emit("bar", bar);
        }
      }
    });
    socket.on("pong", () => { this.lastPong = true; });
    socket.on("error", () => {});
    socket.on("close", () => {
      this.timers.clearTimeout(authTimeout);
      if (this.socket === socket) this.socket = null;
      this.clearHeartbeat();
      if (!this.stopped && !this.fatal) this.scheduleReconnect();
      else if (this.fatal) this.setStatus("error", "Alpaca realtime access is unavailable.");
    });

    socket.on("open", () => this.startHeartbeat(socket));
  }

  normalizeMinuteBar(message, updated = false) {
    const values = [message.o, message.h, message.l, message.c, message.v].map(Number);
    const time = Date.parse(message.t);
    if (typeof message.S !== "string" || !this.symbols.has(message.S) || !Number.isFinite(time) || values.some((value) => !Number.isFinite(value))) return null;
    return { type: "minute_bar", symbol: message.S, time, open: values[0], high: values[1], low: values[2], close: values[3], volume: values[4], ...(updated ? { updated: true } : {}) };
  }

  startHeartbeat(socket) {
    this.clearHeartbeat();
    this.heartbeatTimer = this.timers.setInterval(() => {
      if (this.socket !== socket) return;
      if (!this.lastPong) {
        socket.terminate?.();
        return;
      }
      this.lastPong = false;
      socket.ping?.();
    }, 20000);
  }

  scheduleReconnect() {
    if (this.stopped || this.fatal || this.retryTimer) return;
    if (this.retryCount >= MAX_RETRIES) {
      this.setStatus("error", "Alpaca realtime connection could not be restored.");
      this.fatal = true;
      return;
    }
    const delay = Math.min(BASE_RETRY_MS * 2 ** this.retryCount, MAX_RETRY_MS);
    this.retryCount += 1;
    this.setStatus("reconnecting");
    this.retryTimer = this.timers.setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, delay);
  }

  clearHeartbeat() {
    if (this.heartbeatTimer) this.timers.clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  clearTimers() {
    this.clearHeartbeat();
    if (this.retryTimer) this.timers.clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }
}

module.exports = { AlpacaStream };
