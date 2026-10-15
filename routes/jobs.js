"use strict";

// Node.js 18+ / Express 4 or 5
// Mount: app.use("/api/jobs", require("./routes/jobs")({ getCollection: () => mongoose.connection.db?.collection("career_jobs_cache") }));
// No database? app.use("/api/jobs", require("./routes/jobs")()); // in-memory cache, not durable

const express = require("express");
const crypto = require("node:crypto");

const API_URL = "https://api.openwebninja.com/jsearch/search-v2";
const ALLOWED_CATEGORIES = new Set([
  "Splunk Analyst", "Splunk Administrator", "Splunk Engineer", "SOC Analyst",
  "Cybersecurity Analyst", "Information Security", "Linux Administrator",
  "System Administrator", "Cloud Engineer", "DevOps Engineer",
  "Software Engineer", "Backend Developer", "Frontend Developer",
  "Data Analyst", "AI Engineer", "Machine Learning Engineer",
  "IT Support", "Network Engineer",
]);
const DEFAULT_QUERIES = [
  "Splunk analyst or Splunk engineer jobs in United States",
  "SOC analyst cybersecurity jobs in United States",
  "DevOps cloud engineer jobs in United States",
  "software engineer developer jobs in United States",
  "Linux system administrator jobs in United States",
];

const memoryCache = new Map();
const pending = new Map();
const ipRequests = new Map();
const memoryMonthlyUsage = new Map();

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const maxCalls = () => clamp(Number(process.env.JSEARCH_MONTHLY_BUDGET) || 150, 1, 200);
const cacheHours = () => clamp(Number(process.env.JSEARCH_CACHE_HOURS) || 24, 1, 168);
const seedHours = () => clamp(Number(process.env.JSEARCH_SEED_CACHE_HOURS) || 48, 1, 168);

function getParam(value, limit = 120) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function safeUrl(value) {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function jobToFrontend(job) {
  const candidateApply = job.job_apply_link || job.apply_options?.find((option) => option.apply_link)?.apply_link || job.job_google_link;
  const minSalary = typeof job.job_min_salary === "number" ? job.job_min_salary : undefined;
  const maxSalary = typeof job.job_max_salary === "number" ? job.job_max_salary : undefined;
  const hasSalary = minSalary !== undefined || maxSalary !== undefined;
  const arrangement = String(job.work_arrangement || "");
  const isRemote = job.job_is_remote === true || arrangement.toLowerCase() === "remote";
  const posted = job.job_posted_at_datetime_utc ||
    (Number.isFinite(Number(job.job_posted_at_timestamp)) && Number(job.job_posted_at_timestamp) > 0
      ? new Date(Number(job.job_posted_at_timestamp) * 1000).toISOString()
      : "");

  return {
    id: String(job.job_id || job.job_uid || `${job.job_title || "role"}:${job.employer_name || "employer"}:${job.job_location || ""}`),
    title: String(job.job_title || "Untitled role"),
    company: String(job.employer_name || "Employer not listed"),
    companyLogo: safeUrl(job.employer_logo),
    location: String(job.job_location || [job.job_city, job.job_state, job.job_country].filter(Boolean).join(", ") || "Location not listed"),
    description: String(job.job_description || "No description provided by the employer."),
    applyUrl: safeUrl(candidateApply),
    source: String(job.job_publisher || "Not listed"),
    postedAt: posted,
    datePosted: posted,
    remote: isRemote,
    workArrangement: arrangement || (isRemote ? "Remote" : ""),
    employmentType: String(job.job_employment_types?.[0] || job.job_employment_type || ""),
    seniority: String(job.seniority_level || ""),
    salary: hasSalary ? {
      min: minSalary,
      max: maxSalary,
      currency: String(job.job_salary_currency || "USD"),
      period: String(job.job_salary_period || ""),
    } : null,
    salaryLabel: typeof job.job_salary_string === "string" ? job.job_salary_string : "",
  };
}

function newError(message, code = 502) {
  const error = new Error(message);
  error.status = code;
  return error;
}

function createJobsRouter({ getCollection = () => null } = {}) {
  const router = express.Router();

  async function collectionOrNull() {
    try {
      return (await getCollection()) || null;
    } catch (error) {
      console.error("Career cache database unavailable:", error.message);
      return null;
    }
  }

  function cacheKey(params) {
    return `jobs:${crypto.createHash("sha256").update(JSON.stringify(params)).digest("hex")}`;
  }

  async function readCache(key) {
    const local = memoryCache.get(key);
    if (local && new Date(local.expiresAt).getTime() > Date.now()) return local;
    const collection = await collectionOrNull();
    if (!collection) return local || null;
    try {
      const record = await collection.findOne({ _id: key });
      if (record?.payload) {
        // Another Render instance may have refreshed an expired local record.
        if (!local || new Date(record.refreshedAt) > new Date(local.refreshedAt)) {
          memoryCache.set(key, record);
          return record;
        }
      }
    } catch (error) {
      console.error("Career cache read error:", error.message);
    }
    return local || null;
  }

  async function saveCache(key, payload, ttlHours) {
    const entry = {
      payload,
      refreshedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + ttlHours * 3600000),
    };
    if (memoryCache.size > 500) memoryCache.clear();
    memoryCache.set(key, entry);
    const collection = await collectionOrNull();
    if (collection) {
      try {
        await collection.updateOne({ _id: key }, { $set: entry }, { upsert: true });
      } catch (error) {
        console.error("Career cache write error:", error.message);
      }
    }
    return entry;
  }

  // Reserve credit BEFORE the upstream call. A Mongo collection makes the quota
  // limit atomic and persistent across Render restarts and concurrent instances.
  async function reserveBudget() {
    // Match your OpenWeb Ninja billing-cycle reset day (e.g. the 10th), not
    // the first day of the calendar month.
    const now = new Date();
    const resetDay = clamp(Number(process.env.JSEARCH_BILLING_RESET_DAY) || 1, 1, 28);
    const anchor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), resetDay));
    if (now < anchor) anchor.setUTCMonth(anchor.getUTCMonth() - 1);
    const key = `budget:${anchor.toISOString().slice(0, 10)}`;
    const budget = maxCalls();
    const collection = await collectionOrNull();
    if (collection) {
      try {
        try {
          await collection.insertOne({ _id: key, used: 0 });
        } catch (error) {
          if (error.code !== 11000) throw error;
        }
        const result = await collection.updateOne(
          { _id: key, used: { $lt: budget } },
          { $inc: { used: 1 } },
        );
        if (!result.modifiedCount) throw newError("Monthly job-search API budget reached. Please try again after the quota resets.", 429);
        return;
      } catch (error) {
        if (error.status === 429) throw error;
        console.error("Career budget DB warning (using in-memory guard):", error.message);
      }
    }
    // Fallback is process-local only; configure getCollection for durable quotas.
    const used = memoryMonthlyUsage.get(key) || 0;
    if (used >= budget) throw newError("Monthly job-search API budget reached. Please try again after the quota resets.", 429);
    memoryMonthlyUsage.set(key, used + 1);
  }

  async function providerSearch(params, ttlHours) {
    const key = cacheKey(params);
    const cached = await readCache(key);
    const isFresh = cached && new Date(cached.expiresAt).getTime() > Date.now();
    if (isFresh) {
      return { ...cached.payload, refreshedAt: cached.refreshedAt, stale: false };
    }
    if (pending.has(key)) return pending.get(key);

    const task = (async () => {
      try {
        if (!process.env.JSEARCH_API_KEY) {
          throw newError("JSearch API is not configured on the backend.", 503);
        }
        await reserveBudget();
        const url = new URL(API_URL);
        for (const [field, value] of Object.entries(params)) {
          if (value !== undefined && value !== null && value !== "") url.searchParams.set(field, String(value));
        }
        const response = await fetch(url, {
          method: "GET",
          headers: { "x-api-key": process.env.JSEARCH_API_KEY, Accept: "application/json" },
          signal: AbortSignal.timeout(18000),
        });
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) throw newError("Jobs API authentication failed. Check the backend API key.", 503);
          if (response.status === 429) throw newError("OpenWeb Ninja job-search quota or rate limit reached.", 429);
          throw newError(`Job provider returned HTTP ${response.status}.`, 502);
        }
        const body = await response.json();
        const data = body?.data;
        if (body?.status && body.status !== "OK" && body.status !== "ok") {
          throw newError("The jobs provider returned an unsuccessful response.", 502);
        }
        if (!data || !Array.isArray(data.jobs)) throw newError("Unexpected JSearch search-v2 response format.", 502);
        const payload = {
          jobs: data.jobs.map(jobToFrontend).filter((job) => Boolean(job.applyUrl)),
          cursor: typeof data.cursor === "string" ? data.cursor : "",
        };
        const saved = await saveCache(key, payload, ttlHours);
        return { ...payload, refreshedAt: saved.refreshedAt, stale: false };
      } catch (error) {
        // Existing results can still be shown briefly during a provider outage.
        const age = cached ? Date.now() - new Date(cached.refreshedAt).getTime() : Infinity;
        if (cached && age <= 7 * 86400000) {
          return { ...cached.payload, refreshedAt: cached.refreshedAt, stale: true };
        }
        if (error.name === "TimeoutError" || error.name === "AbortError") {
          throw newError("The jobs provider timed out. Please retry later.", 504);
        }
        throw error;
      } finally {
        pending.delete(key);
      }
    })();
    pending.set(key, task);
    return task;
  }

  // Small per-IP abuse limit to discourage quota exhaustion by automated clients.
  router.use((req, res, next) => {
    const now = Date.now();
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    if (ipRequests.size > 15000) ipRequests.clear();
    const entry = ipRequests.get(ip);
    const current = !entry || now - entry.since > 3600000 ? { since: now, count: 0 } : entry;
    current.count += 1;
    ipRequests.set(ip, current);
    if (current.count > 60) return res.status(429).json({ error: "Too many job searches. Please try again later." });
    return next();
  });

  router.get("/", async (req, res) => {
    try {
      const query = getParam(req.query.query);
      const category = getParam(req.query.category, 60);
      const location = getParam(req.query.location, 80);
      const workplace = getParam(req.query.workplace, 20);
      const employmentType = getParam(req.query.employmentType, 20);
      const seniority = getParam(req.query.seniority, 20);
      const datePosted = getParam(req.query.datePosted, 20);
      const page = clamp(parseInt(req.query.page, 10) || 1, 1, 30);
      const cursor = getParam(req.query.cursor, 2048);

      if (category && !ALLOWED_CATEGORIES.has(category)) return res.status(400).json({ error: "Invalid job category." });
      if (workplace && !["remote", "hybrid", "onsite"].includes(workplace)) return res.status(400).json({ error: "Invalid workplace filter." });
      if (datePosted && !["today", "three_days", "week", "month"].includes(datePosted)) return res.status(400).json({ error: "Invalid date filter." });
      if (employmentType && !["full_time", "part_time", "contract", "internship"].includes(employmentType)) return res.status(400).json({ error: "Invalid employment type." });
      if (seniority && !["entry", "mid", "senior"].includes(seniority)) return res.status(400).json({ error: "Invalid seniority filter." });
      if (page > 1 && !cursor) return res.status(400).json({ error: "Pagination requires a cursor from the previous page." });

      const remote = workplace === "remote";
      const providerFilters = {
        country: "us",
        language: "en",
        num_pages: 1,
        ...(datePosted ? { date_posted: { today: "today", three_days: "3days", week: "week", month: "month" }[datePosted] } : {}),
        ...(remote ? { work_from_home: "true" } : {}),
        ...(employmentType ? { employment_types: { full_time: "FULLTIME", part_time: "PARTTIME", contract: "CONTRACTOR", internship: "INTERN" }[employmentType] } : {}),
        ...(seniority === "entry" ? { job_requirements: "under_3_years_experience" } : {}),
        ...(seniority === "senior" ? { job_requirements: "more_than_3_years_experience" } : {}),
      };
      const defaultFeed = !query && !category && !location && !workplace && !employmentType && !seniority && !datePosted && !cursor && page === 1;

      let jobs;
      let nextCursor = "";
      let stale = false;
      let refreshedAt = "";
      if (defaultFeed) {
        // Diversified default feed. Cached per search term; 5 calls per cache cycle,
        // NOT five calls on every student page view.
        const outcomes = await Promise.allSettled(DEFAULT_QUERIES.map((term) =>
          providerSearch({ query: term, ...providerFilters }, seedHours()),
        ));
        const success = outcomes.filter((result) => result.status === "fulfilled").map((result) => result.value);
        if (!success.length) throw outcomes[0].reason;
        jobs = success.flatMap((item) => item.jobs);
        stale = success.some((item) => item.stale) || success.length < DEFAULT_QUERIES.length;
        refreshedAt = success.map((item) => item.refreshedAt).sort().at(0) || "";
      } else {
        const role = [query, category].filter(Boolean).join(" ") || (remote ? "remote technology" : "technology");
        const arrangement = workplace === "hybrid" ? "hybrid " : workplace === "onsite" ? "on-site " : "";
        const searchText = `${arrangement}${role} jobs in ${location || "United States"}`;
        const result = await providerSearch({ query: searchText, ...providerFilters, ...(cursor ? { cursor } : {}) }, cacheHours());
        jobs = result.jobs;
        nextCursor = result.cursor;
        stale = result.stale;
        refreshedAt = result.refreshedAt;
      }

      const seen = new Set();
      const uniqueJobs = jobs.filter((job) => {
        const fingerprint = job.applyUrl || job.id;
        if (!fingerprint || seen.has(fingerprint)) return false;
        seen.add(fingerprint);
        return true;
      }).sort((a, b) => (Date.parse(b.postedAt) || 0) - (Date.parse(a.postedAt) || 0));

      res.set("Cache-Control", "public, max-age=120, stale-while-revalidate=300");
      return res.json({
        jobs: uniqueJobs,
        pagination: {
          page,
          hasMore: Boolean(nextCursor),
          nextCursor: nextCursor || null,
          nextPage: nextCursor ? page + 1 : null,
        },
        refreshedAt,
        stale,
        count: uniqueJobs.length,
      });
    } catch (error) {
      console.error("JSearch career jobs failed:", error.message);
      return res.status(error.status || 502).json({ error: error.status ? error.message : "Could not fetch careers at this time." });
    }
  });

  return router;
}

module.exports = createJobsRouter;


// const express = require("express");
// const rateLimit = require("express-rate-limit");
// const { createJobsController } = require("../controller/jobsController");

// function createJobsRouter(controller = createJobsController()) {
//   const router = express.Router();
//   const jobsLimiter = rateLimit({
//     windowMs: 60 * 1000,
//     max: 30,
//     standardHeaders: true,
//     legacyHeaders: false,
//     message: { error: "Job search request limit reached. Please try again shortly." },
//   });

//   router.use(jobsLimiter);
//   router.get("/", controller.search);
//   router.get("/:jobId", controller.detail);
//   return router;
// }

// module.exports = createJobsRouter();
// module.exports.createJobsRouter = createJobsRouter;
