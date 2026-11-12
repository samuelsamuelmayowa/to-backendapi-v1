"use strict";

const SplunkSearchHistory = require("../model/SplunkSearchHistory");
const { getDatasetModel, isTrainingStoreReady, trainingStoreUnavailableError } = require("../services/splunkTrainingStore");
const { runStoredSPL } = require("../services/splunkStudentSearch");
const { SplError } = require("../services/splEngine");

exports.listCatalog = async (req, res, next) => {
  try {
    if (!isTrainingStoreReady()) return res.status(503).json({ message: trainingStoreUnavailableError().message });
    const datasets = await getDatasetModel().find({ status: "ready" })
      .select("slug name description index sourceCategory sourcetypes fields eventCount timestampRange dataOrigin isSynthetic distributionStatus")
      .sort({ name: 1 }).lean();
    res.json({ data: datasets });
  } catch (error) { next(error); }
};

exports.search = async (req, res, next) => {
  const requestStarted = performance.now();
  const query = String(req.body?.query || "").trim().slice(0, 3000);
  const timeRange = ["all", "24h", "7d"].includes(req.body?.timeRange) ? req.body.timeRange : "all";
  const historyBase = {
    ownerId: req.splunkStudent.ownerId,
    query,
    index: (query.match(/(?:^|\s)index=([A-Za-z0-9_-]+)/i) || [])[1] || "",
    source: "stored",
    timeRange,
  };
  try {
    const data = await runStoredSPL(query, { timeRange, page: req.body?.page, pageSize: req.body?.pageSize });
    data.elapsedMs = Math.max(0, Math.round(performance.now() - requestStarted));
    if (!req.skipSearchHistory) {
      const savedHistory = await SplunkSearchHistory.create({ ...historyBase, status: "complete", resultCount: data.count, resultRows: data.totalRows, elapsedMs: data.elapsedMs }).catch(() => null);
      if (savedHistory) data.history = { id: String(savedHistory._id), query: savedHistory.query, index: savedHistory.index, source: savedHistory.source, timeRange: savedHistory.timeRange, status: savedHistory.status, resultCount: savedHistory.resultCount, resultRows: savedHistory.resultRows, elapsedMs: savedHistory.elapsedMs, createdAt: savedHistory.createdAt };
    }
    res.json({ data });
  } catch (error) {
    let savedHistory = null;
    if (!req.skipSearchHistory) savedHistory = await SplunkSearchHistory.create({ ...historyBase, status: "error", error: String(error.message || "Search failed").slice(0, 500), elapsedMs: Math.max(0, Math.round(performance.now() - requestStarted)) }).catch(() => null);
    const history = savedHistory && { id: String(savedHistory._id), query: savedHistory.query, index: savedHistory.index, source: savedHistory.source, timeRange: savedHistory.timeRange, status: savedHistory.status, error: savedHistory.error, createdAt: savedHistory.createdAt };
    if (error instanceof SplError || error.status) return res.status(error.status || 422).json({ message: error.message, ...(error.command ? { command: error.command } : {}), ...(history ? { history } : {}) });
    next(error);
  }
};
