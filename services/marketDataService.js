const { createAlpacaProvider, MarketDataError } = require("./marketData/alpacaProvider");

const DEFAULT_TIMEFRAME = "1Day";
const TIMEFRAME_PATTERN = /^(?:[1-9]|[1-5][0-9])(?:Min|T)$|^(?:[1-9]|1[0-9]|2[0-3])(?:Hour|H)$|^(?:1Day|1D|1Week|1W|[1-6]Month|[1-6]M)$/;
const SYMBOL_PATTERN = /^[A-Z0-9][A-Z0-9.-]{0,14}$/;

function validateSymbol(value) {
  const symbol = String(value || "").trim().toUpperCase();
  if (!SYMBOL_PATTERN.test(symbol) || symbol.includes("..") || symbol.endsWith(".")) {
    throw new MarketDataError("Enter a valid stock symbol.", 400);
  }
  return symbol;
}

function validateDate(value, name) {
  if (value === undefined) return undefined;
  const date = String(value);
  if (date.length > 40 || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(date) || !Number.isFinite(Date.parse(date))) {
    throw new MarketDataError(`${name} must be a valid date or RFC-3339 timestamp.`, 400);
  }
  return date;
}

function createMarketDataService(provider = createAlpacaProvider()) {
  return {
    async getQuote(rawSymbol) {
      return provider.getQuote(validateSymbol(rawSymbol));
    },

    async getBars(rawSymbol, query = {}) {
      const symbol = validateSymbol(rawSymbol);
      const timeframe = String(query.timeframe || DEFAULT_TIMEFRAME);
      if (!TIMEFRAME_PATTERN.test(timeframe)) {
        throw new MarketDataError("timeframe must be a supported Alpaca stock timeframe.", 400);
      }
      const start = validateDate(query.start, "start");
      const end = validateDate(query.end, "end");
      if (start && end && Date.parse(start) > Date.parse(end)) {
        throw new MarketDataError("start must be earlier than or equal to end.", 400);
      }
      const limit = query.limit === undefined ? 1000 : Number(query.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 10000) {
        throw new MarketDataError("limit must be an integer between 1 and 10000.", 400);
      }
      return provider.getBars(symbol, { timeframe, start, end, limit });
    },

    async searchSymbols(rawQuery) {
      const query = String(rawQuery || "").trim();
      if (query.length < 1 || query.length > 50 || !/^[A-Za-z0-9 .&'-]+$/.test(query)) {
        throw new MarketDataError("q must contain 1 to 50 letters, numbers, spaces, or common company-name characters.", 400);
      }
      return provider.searchSymbols(query);
    },

    async getSymbol(rawSymbol) {
      const symbol = validateSymbol(rawSymbol);
      const matches = await provider.searchSymbols(symbol);
      const exactMatch = matches.find((asset) => asset.symbol === symbol && asset.type === "stock");
      if (!exactMatch) {
        throw new MarketDataError("No active U.S. equity was found for that symbol.", 404);
      }
      return {
        symbol: exactMatch.symbol,
        ...(exactMatch.name ? { name: exactMatch.name } : {}),
        ...(exactMatch.exchange ? { exchange: exactMatch.exchange } : {}),
        type: "stock",
        currency: "USD",
      };
    },
  };
}

module.exports = { createMarketDataService, validateSymbol, validateDate };
