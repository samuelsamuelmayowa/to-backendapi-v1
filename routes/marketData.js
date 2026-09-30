const express = require("express");
const rateLimit = require("express-rate-limit");
const { createMarketDataController } = require("../controller/marketDataController");

function createMarketDataRouter(controller = createMarketDataController()) {
  const router = express.Router();
  const marketDataLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Market-data request limit reached. Please retry shortly." },
  });

  router.use(marketDataLimiter);
  router.get("/quote/:symbol", controller.quote);
  router.get("/bars/:symbol", controller.bars);
  router.get("/search", controller.search);
  return router;
}

module.exports = createMarketDataRouter();
module.exports.createMarketDataRouter = createMarketDataRouter;
