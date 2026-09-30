const marketDataService = require("../services/marketDataService").createMarketDataService();

function createMarketDataController(service = marketDataService) {
  function handle(handler) {
    return async (req, res) => {
      try {
        res.set("Cache-Control", "public, max-age=5, stale-while-revalidate=10");
        res.json(await handler(req));
      } catch (error) {
        const status = Number.isInteger(error.statusCode) ? error.statusCode : 502;
        res.status(status).json({ error: error.statusCode ? error.message : "Market data is temporarily unavailable." });
      }
    };
  }

  return {
    quote: handle((req) => service.getQuote(req.params.symbol)),
    bars: handle((req) => service.getBars(req.params.symbol, req.query)),
    search: handle((req) => service.searchSymbols(req.query.q)),
    symbol: handle((req) => service.getSymbol(req.params.symbol)),
  };
}

module.exports = { createMarketDataController };
