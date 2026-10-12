const { createHash } = require("node:crypto");

const JSEARCH_ENDPOINT = "https://api.openwebninja.com/jsearch/search-v2";
const DEFAULT_TTL_MS = 45 * 60 * 1000;
const MAX_PAGE = 20;
const RESULT_PAGE_SIZE = 10;
const MAX_CACHE_ENTRIES = 250;

const CATEGORIES = {
  "Splunk Analyst": "Splunk Analyst",
  "Splunk Administrator": "Splunk Administrator",
  "Splunk Engineer": "Splunk Engineer",
  "SOC Analyst": "SOC Analyst",
  "Cybersecurity Analyst": "Cybersecurity Analyst",
  "Information Security": "Information Security",
  "Linux Administrator": "Linux Administrator",
  "System Administrator": "System Administrator",
  "Cloud Engineer": "Cloud Engineer",
  "DevOps Engineer": "DevOps Engineer",
  "Software Engineer": "Software Engineer",
  "Backend Developer": "Backend Developer",
  "Frontend Developer": "Frontend Developer",
  "Data Analyst": "Data Analyst",
  "AI Engineer": "AI Engineer",
  "Machine Learning Engineer": "Machine Learning Engineer",
  "IT Support": "IT Support",
  "Network Engineer": "Network Engineer",
};

const EMPLOYMENT_TYPES = {
  full_time: "FULLTIME",
  part_time: "PARTTIME",
  contract: "CONTRACTOR",
  internship: "INTERN",
};

const EXPERIENCE_REQUIREMENTS = {
  entry: "under_3_years_experience",
  mid: "",
  senior: "more_than_3_years_experience",
};

const POSTED_DATES = {
  today: "today",
  three_days: "3days",
  week: "week",
  month: "month",
};

const US_COUNTRY_NAMES = new Set([
  "us",
  "usa",
  "united states",
  "united states of america",
]);

class JobsError extends Error {
  constructor(message, statusCode = 502, code = "JOBS_UNAVAILABLE") {
    super(message);
    this.name = "JobsError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

function readText(value, name, maximum = 120) {
  if (value === undefined || value === "") return "";
  if (typeof value !== "string") {
    throw new JobsError(`${name} must be a text value.`, 400, "INVALID_INPUT");
  }
  const text = value.trim();
  if (text.length > maximum || /[\u0000-\u001f\u007f]/.test(text)) {
    throw new JobsError(`${name} is too long or contains invalid characters.`, 400, "INVALID_INPUT");
  }
  return text;
}

function readEnum(value, name, allowed) {
  const text = readText(value, name, 40);
  if (text && !Object.hasOwn(allowed, text)) {
    throw new JobsError(`Unsupported ${name} filter.`, 400, "INVALID_INPUT");
  }
  return text;
}

function validateSearch(query = {}) {
  const term = readText(query.query, "query");
  const category = readText(query.category, "category", 60);
  if (category && !Object.hasOwn(CATEGORIES, category)) {
    throw new JobsError("Unsupported job category.", 400, "INVALID_INPUT");
  }
  const location = readText(query.location, "location", 100);
  const employmentType = readEnum(query.employmentType, "employment type", EMPLOYMENT_TYPES);
  const seniority = readEnum(query.seniority, "seniority", EXPERIENCE_REQUIREMENTS);
  const datePosted = readEnum(query.datePosted, "posting date", POSTED_DATES);
  const workplace = readText(query.workplace, "workplace", 20);
  if (workplace && !["remote", "hybrid", "onsite"].includes(workplace)) {
    throw new JobsError("Unsupported workplace filter.", 400, "INVALID_INPUT");
  }

  const page = query.page === undefined ? 1 : Number(query.page);
  if (!Number.isInteger(page) || page < 1 || page > MAX_PAGE) {
    throw new JobsError(`page must be an integer from 1 to ${MAX_PAGE}.`, 400, "INVALID_INPUT");
  }
  const cursor = readText(query.cursor, "cursor", 500);

  const searchTerms = [term, CATEGORIES[category], location]
    .filter(Boolean)
    .filter((value, index, terms) =>
      terms.findIndex((item) => item.toLowerCase() === value.toLowerCase()) === index,
    );
  if (workplace === "remote" && !searchTerms.some((value) => /\bremote\b/i.test(value))) {
    searchTerms.push("remote jobs");
  }
  const searchQuery = searchTerms.join(" ") || "technology jobs";

  return {
    query: searchQuery,
    category,
    location,
    employmentType,
    seniority,
    datePosted,
    workplace,
    page,
    cursor,
    upstreamParams: {
      query: searchQuery,
      country: "us",
      num_pages: "1",
      ...(cursor ? { cursor } : { page: String(page) }),
      ...(employmentType ? { employment_types: EMPLOYMENT_TYPES[employmentType] } : {}),
      ...(EXPERIENCE_REQUIREMENTS[seniority]
        ? { job_requirements: EXPERIENCE_REQUIREMENTS[seniority] }
        : {}),
      ...(datePosted ? { date_posted: POSTED_DATES[datePosted] } : {}),
    },
  };
}

function plainText(value) {
  if (typeof value !== "string") return "";
  return value
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function validHttpUrl(value) {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function toDate(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value < 1e12 ? value * 1000 : value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : "";
  }
  if (typeof value !== "string" || !value.trim()) return "";
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : "";
}

function finiteNumber(value) {
  const number = Number(value);
  return value !== null && value !== "" && Number.isFinite(number) ? number : undefined;
}

function normalizeJob(job) {
  if (!job || typeof job !== "object") return null;
  const title = typeof job.job_title === "string" ? job.job_title.trim() : "";
  const applyUrl = validHttpUrl(job.job_apply_link || job.apply_link || job.url);
  if (!title || !applyUrl) return null;

  const city = typeof job.job_city === "string" ? job.job_city.trim() : "";
  const state = typeof job.job_state === "string" ? job.job_state.trim() : "";
  const country = typeof job.job_country === "string" ? job.job_country.trim() : "";
  if (!US_COUNTRY_NAMES.has(country.toLowerCase().replace(/[.,]/g, "").replace(/\s+/g, " "))) {
    return null;
  }
  const listedLocation = typeof job.job_location === "string" ? job.job_location.trim() : "";
  const salaryMin = finiteNumber(job.job_min_salary);
  const salaryMax = finiteNumber(job.job_max_salary);
  const salary = {
    ...(salaryMin !== undefined ? { min: salaryMin } : {}),
    ...(salaryMax !== undefined ? { max: salaryMax } : {}),
    ...(typeof job.job_salary_currency === "string" ? { currency: job.job_salary_currency } : {}),
    ...(typeof job.job_salary_period === "string" ? { period: job.job_salary_period } : {}),
  };
  const requiredExperienceYears = finiteNumber(job.required_experience_years);
  const postedAt = toDate(
    job.job_posted_at_datetime_utc ||
      job.job_posted_at ||
      job.job_posted_at_timestamp,
  );
  const id = String(
    job.job_id ||
      job.id ||
      createHash("sha256").update(applyUrl).digest("hex").slice(0, 24),
  );

  return {
    id,
    title,
    company: typeof job.employer_name === "string" ? job.employer_name.trim() : "",
    companyLogo: validHttpUrl(job.employer_logo),
    location: [city, state, country].filter(Boolean).join(", ") || listedLocation,
    city,
    state,
    country,
    remote:
      job.job_is_remote === true ||
      String(job.work_arrangement || job.job_work_arrangement || "").toLowerCase() === "remote",
    ...(typeof job.work_arrangement === "string" && job.work_arrangement.trim()
      ? { workArrangement: job.work_arrangement.trim() }
      : typeof job.job_work_arrangement === "string" && job.job_work_arrangement.trim()
        ? { workArrangement: job.job_work_arrangement.trim() }
      : typeof job.job_work_arrangement_type === "string" && job.job_work_arrangement_type.trim()
        ? { workArrangement: job.job_work_arrangement_type.trim() }
        : {}),
    employmentType: typeof job.job_employment_type === "string" ? job.job_employment_type : "",
    seniority: typeof job.seniority_level === "string" ? job.seniority_level : "",
    ...(requiredExperienceYears !== undefined ? { requiredExperienceYears } : {}),
    salary,
    datePosted: postedAt,
    source: typeof job.job_publisher === "string" ? job.job_publisher : "",
    description: plainText(job.job_description),
    applyUrl,
  };
}

function positiveTtl(value) {
  const ttl = Number(value);
  return Number.isFinite(ttl) && ttl >= 60_000 && ttl <= 24 * 60 * 60 * 1000
    ? ttl
    : DEFAULT_TTL_MS;
}

function createJobsService({
  env = process.env,
  fetcher = globalThis.fetch,
  now = Date.now,
  log,
  ttlMs = positiveTtl(env.JOBS_CACHE_TTL_MS),
  timeoutMs = 12_000,
} = {}) {
  const cache = new Map();
  const jobDetails = new Map();
  const staleRetentionMs = 24 * 60 * 60 * 1000;

  async function getJobs(rawQuery = {}) {
    const serviceLog = log || require("../logger");
    const params = validateSearch(rawQuery);
    const cacheKey = JSON.stringify(params.upstreamParams);
    const currentTime = now();
    const entry = cache.get(cacheKey);

    if (entry && entry.expiresAt > currentTime) {
      serviceLog.info("jobs.search.cache_hit", { category: params.category, page: params.page });
      return { ...entry.result, cached: true, stale: false };
    }
    if (entry && entry.pending) {
      const result = await entry.pending;
      return { ...result, cached: true, stale: false };
    }

    const staleEntry = entry && entry.staleUntil > currentTime ? entry : null;
    const nextEntry = staleEntry || {};
    nextEntry.pending = (async () => {
      const startedAt = now();
      let timeout;
      try {
        const apiKey = env.OPENWEBNINJA_API_KEY;
        if (typeof apiKey !== "string" || !apiKey.trim()) {
          throw new JobsError("Live job search is not configured. Please try again later.", 503, "JOBS_NOT_CONFIGURED");
        }

        const url = new URL(JSEARCH_ENDPOINT);
        for (const [name, value] of Object.entries(params.upstreamParams)) {
          url.searchParams.set(name, value);
        }
        const controller = new AbortController();
        timeout = setTimeout(() => controller.abort(), timeoutMs);
        const response = await fetcher(url, {
          method: "GET",
          headers: { "x-api-key": apiKey.trim(), Accept: "application/json" },
          signal: controller.signal,
        });
        if (!response.ok) {
          serviceLog.warn("jobs.search.provider_error", {
            category: params.category,
            page: params.page,
            providerStatus: response.status,
            durationMs: now() - startedAt,
          });
          if (response.status === 401 || response.status === 403) {
            throw new JobsError(
              "OpenWeb Ninja rejected the API key or JSearch access. Check the key and JSearch subscription in Render.",
              503,
              "JOBS_PROVIDER_AUTH",
            );
          }
          if (response.status === 400) {
            throw new JobsError(
              "OpenWeb Ninja rejected the job search request.",
              502,
              "JOBS_PROVIDER_REQUEST",
            );
          }
          throw new JobsError(
            response.status === 429
              ? "Live job search is temporarily rate limited. Please try again later."
              : "Live job search is temporarily unavailable. Please try again later.",
            response.status === 429 ? 503 : 502,
            response.status === 429 ? "JOBS_PROVIDER_RATE_LIMIT" : "JOBS_PROVIDER_UNAVAILABLE",
          );
        }

        const payload = await response.json();
        const resultData = payload?.data;
        const providerJobs = Array.isArray(payload?.jobs)
          ? payload.jobs
          : Array.isArray(resultData)
            ? resultData
            : Array.isArray(resultData?.jobs)
              ? resultData.jobs
            : Array.isArray(payload?.results)
              ? payload.results
              : null;
        if (!providerJobs) {
          throw new JobsError("Live job search returned an unexpected response.", 502, "INVALID_PROVIDER_RESPONSE");
        }

        const seen = new Set();
        const jobs = providerJobs.map(normalizeJob).filter((job) => {
          if (!job) return false;
          const key = job.applyUrl.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        const nextCursor =
          payload.next_page_token ||
          payload.nextPageToken ||
          payload.cursor ||
          payload.next_cursor ||
          resultData?.cursor ||
          payload.pagination?.next_page_token ||
          payload.pagination?.nextPageToken ||
          payload.pagination?.cursor ||
          payload.pagination?.next_cursor ||
          "";
        const pageCount = Number(payload.pagination?.total_pages);
        const hasMore = Boolean(
          params.page < MAX_PAGE &&
            (nextCursor ||
              payload.pagination?.has_next_page ||
              (Number.isInteger(pageCount) && pageCount > params.page)),
        );
        const refreshedAt = new Date(now()).toISOString();
        const result = {
          jobs,
          pagination: {
            page: params.page,
            hasMore,
            nextPage: hasMore && !nextCursor ? params.page + 1 : null,
            ...(nextCursor ? { nextCursor: String(nextCursor) } : {}),
          },
          refreshedAt,
        };
        const storedAt = now();
        nextEntry.result = result;
        nextEntry.expiresAt = storedAt + ttlMs;
        nextEntry.staleUntil = storedAt + ttlMs + staleRetentionMs;
        serviceLog.info("jobs.search.provider_success", {
          category: params.category,
          page: params.page,
          resultCount: jobs.length,
          durationMs: storedAt - startedAt,
        });

        for (const job of jobs) {
          jobDetails.set(job.id, {
            job,
            expiresAt: storedAt + ttlMs + staleRetentionMs,
          });
        }
        if (jobDetails.size > MAX_CACHE_ENTRIES * RESULT_PAGE_SIZE) {
          for (const [id, detail] of jobDetails) {
            if (detail.expiresAt <= storedAt || jobDetails.size > MAX_CACHE_ENTRIES * RESULT_PAGE_SIZE) {
              jobDetails.delete(id);
            }
          }
        }
        if (cache.size > MAX_CACHE_ENTRIES) {
          for (const [key, item] of cache) {
            if (key !== cacheKey && !item.pending) {
              cache.delete(key);
              break;
            }
          }
        }
        return { ...result, cached: false, stale: false };
      } catch (error) {
        if (staleEntry && staleEntry.result) {
          serviceLog.warn("jobs.search.stale_cache_fallback", {
            category: params.category,
            page: params.page,
            code: error.code || "JOBS_UNAVAILABLE",
          });
          return { ...staleEntry.result, cached: true, stale: true };
        }
        if (!(error instanceof JobsError)) {
          const timedOut = error.name === "AbortError";
          serviceLog.error("jobs.search.request_failed", {
            category: params.category,
            page: params.page,
            errorName: timedOut ? "AbortError" : error.name,
          });
          throw new JobsError(
            timedOut
              ? "OpenWeb Ninja did not respond in time. Please try again shortly."
              : "Could not connect to OpenWeb Ninja. Please try again shortly.",
            502,
            timedOut ? "JOBS_PROVIDER_TIMEOUT" : "JOBS_PROVIDER_CONNECTION",
          );
        }
        throw error;
      } finally {
        if (timeout) clearTimeout(timeout);
        nextEntry.pending = null;
      }
    })();

    cache.set(cacheKey, nextEntry);
    return nextEntry.pending;
  }

  function getJobById(rawId) {
    const id = readText(rawId, "job id", 200);
    if (!id) throw new JobsError("A job id is required.", 400, "INVALID_INPUT");
    const detail = jobDetails.get(id);
    if (!detail || detail.expiresAt <= now()) {
      jobDetails.delete(id);
      throw new JobsError("This job is not in the current search results. Search for it again.", 404, "JOB_NOT_FOUND");
    }
    return detail.job;
  }

  return { getJobs, getJobById };
}

module.exports = {
  CATEGORIES,
  JobsError,
  createJobsService,
  normalizeJob,
  validateSearch,
};
