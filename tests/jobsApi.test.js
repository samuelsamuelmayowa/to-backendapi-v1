const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { createJobsService, validateSearch } = require("../services/jobsService");
const { createJobsController } = require("../controller/jobsController");
const { createJobsRouter } = require("../routes/jobs");

const providerJob = (overrides = {}) => ({
  job_id: "splunk-001",
  job_title: "Splunk Engineer",
  employer_name: "Example Security",
  employer_logo: "https://images.example/logo.png",
  job_city: "Baltimore",
  job_state: "Maryland",
  job_country: "USA",
  job_is_remote: false,
  work_arrangement: "on-site",
  job_employment_type: "Full-time",
  job_min_salary: 120000,
  job_max_salary: 150000,
  job_salary_currency: "USD",
  job_salary_period: "YEAR",
  job_posted_at_datetime_utc: "2026-10-01T12:00:00Z",
  job_publisher: "LinkedIn",
  job_description: "<p>Build a <strong>Splunk</strong> platform.</p><script>bad()</script>",
  job_apply_link: "https://jobs.example/apply/1",
  ...overrides,
});

const jsonResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

function createLog() {
  return { info() {}, warn() {}, error() {} };
}

test("JSearch search sends authenticated OpenWeb Ninja request and normalizes only real fields", async () => {
  let request;
  const service = createJobsService({
    env: { OPENWEBNINJA_API_KEY: "server-secret" },
    log: createLog(),
    fetcher: async (url, options) => {
      request = { url: new URL(url), options };
      return jsonResponse({ status: "OK", data: [providerJob()] });
    },
  });

  const result = await service.getJobs({
    query: "Splunk Engineer",
    location: "Maryland",
    category: "Splunk Engineer",
    employmentType: "full_time",
    datePosted: "week",
    page: "1",
  });

  assert.equal(request.url.origin, "https://api.openwebninja.com");
  assert.equal(request.url.pathname, "/jsearch/search-v2");
  assert.equal(request.url.searchParams.get("query"), "Splunk Engineer Maryland");
  assert.equal(request.url.searchParams.get("country"), "us");
  assert.equal(request.url.searchParams.get("page"), "1");
  assert.equal(request.url.searchParams.get("num_pages"), "1");
  assert.equal(request.url.searchParams.get("employment_types"), "FULLTIME");
  assert.equal(request.url.searchParams.get("date_posted"), "week");
  assert.equal(request.url.searchParams.has("remote_jobs_only"), false);
  assert.equal(request.options.headers["x-api-key"], "server-secret");
  assert.deepEqual(result.jobs[0], {
    id: "splunk-001",
    title: "Splunk Engineer",
    company: "Example Security",
    companyLogo: "https://images.example/logo.png",
    location: "Baltimore, Maryland, USA",
    city: "Baltimore",
    state: "Maryland",
    country: "USA",
    remote: false,
    workArrangement: "on-site",
    employmentType: "Full-time",
    seniority: "",
    salary: { min: 120000, max: 150000, currency: "USD", period: "YEAR" },
    datePosted: "2026-10-01T12:00:00.000Z",
    source: "LinkedIn",
    description: "Build a Splunk platform.",
    applyUrl: "https://jobs.example/apply/1",
  });
  assert.equal(result.jobs[0].applyUrl, "https://jobs.example/apply/1");
});

test("the Splunk, SOC, Linux, and software tabs build category-specific U.S. queries", () => {
  for (const category of [
    "Splunk Engineer",
    "SOC Analyst",
    "Linux Administrator",
    "Software Engineer",
  ]) {
    const search = validateSearch({ category });
    assert.equal(search.upstreamParams.query, category);
    assert.equal(search.upstreamParams.country, "us");
    assert.equal(search.upstreamParams.num_pages, "1");
  }
});

test("identical query pages use server cache and provider pagination metadata", async () => {
  let calls = 0;
  const service = createJobsService({
    env: { OPENWEBNINJA_API_KEY: "test-key" },
    log: createLog(),
    fetcher: async () => {
      calls += 1;
      return jsonResponse({
        jobs: [providerJob()],
        cursor: "next-page",
      });
    },
  });
  const first = await service.getJobs({ query: "Splunk", page: "1" });
  const cached = await service.getJobs({ query: "Splunk", page: "1" });
  assert.equal(calls, 1);
  assert.equal(first.cached, false);
  assert.equal(cached.cached, true);
  assert.equal(cached.pagination.nextCursor, "next-page");
  assert.equal(cached.pagination.hasMore, true);
  assert.equal(service.getJobById("splunk-001").applyUrl, "https://jobs.example/apply/1");
});

test("pagination sends the documented cursor and remote searches use query terms", async () => {
  let request;
  const service = createJobsService({
    env: { OPENWEBNINJA_API_KEY: "test-key" },
    log: createLog(),
    fetcher: async (url) => {
      request = new URL(url);
      return jsonResponse({ data: { jobs: [providerJob()], cursor: "next-cursor" } });
    },
  });
  const result = await service.getJobs({
    category: "SOC Analyst",
    workplace: "remote",
    cursor: "cursor-1",
  });
  assert.equal(request.searchParams.get("cursor"), "cursor-1");
  assert.equal(request.searchParams.has("page"), false);
  assert.equal(request.searchParams.get("num_pages"), "1");
  assert.equal(request.searchParams.get("query"), "SOC Analyst remote jobs");
  assert.equal(result.pagination.nextCursor, "next-cursor");
});

test("search validation rejects invalid categories, filters, and page numbers before provider calls", async () => {
  let calls = 0;
  const service = createJobsService({
    env: { OPENWEBNINJA_API_KEY: "test-key" },
    log: createLog(),
    fetcher: async () => {
      calls += 1;
      return jsonResponse({ jobs: [] });
    },
  });
  await assert.rejects(service.getJobs({ category: "All" }), { statusCode: 400 });
  await assert.rejects(service.getJobs({ employmentType: "casual" }), { statusCode: 400 });
  await assert.rejects(service.getJobs({ page: "21" }), { statusCode: 400 });
  await assert.rejects(service.getJobs({ query: "bad\u0000query" }), { statusCode: 400 });
  assert.equal(calls, 0);
});

test("unsafe or missing application URLs are omitted and duplicates are removed", async () => {
  const service = createJobsService({
    env: { OPENWEBNINJA_API_KEY: "test-key" },
    log: createLog(),
    fetcher: async () => jsonResponse({
      jobs: [
        providerJob(),
        providerJob({ job_id: "duplicate", job_title: "Duplicate listing" }),
        providerJob({ job_id: "bad-url", job_apply_link: "javascript:alert(1)" }),
      ],
    }),
  });
  const result = await service.getJobs();
  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].applyUrl, "https://jobs.example/apply/1");
});

test("only provider records explicitly identified as U.S. jobs are returned", async () => {
  const service = createJobsService({
    env: { OPENWEBNINJA_API_KEY: "test-key" },
    log: createLog(),
    fetcher: async () => jsonResponse({
      status: "OK",
      data: [
        providerJob({ job_id: "us-code", job_country: "US", job_apply_link: "https://jobs.example/us-code" }),
        providerJob({ job_id: "us-name", job_country: "United States", job_apply_link: "https://jobs.example/us-name" }),
        providerJob({ job_id: "canada", job_country: "Canada", job_apply_link: "https://jobs.example/canada" }),
        providerJob({ job_id: "unknown", job_country: "", job_apply_link: "https://jobs.example/unknown" }),
      ],
    }),
  });

  const result = await service.getJobs({ category: "Splunk Engineer" });
  assert.deepEqual(result.jobs.map((job) => job.id), ["us-code", "us-name"]);
});

test("stale cached jobs are served when provider refresh fails; missing credentials fail safely", async () => {
  let currentTime = 1000000;
  let shouldFail = false;
  const service = createJobsService({
    env: { OPENWEBNINJA_API_KEY: "test-key" },
    log: createLog(),
    now: () => currentTime,
    ttlMs: 60000,
    fetcher: async () => {
      if (shouldFail) throw new Error("provider unreachable");
      return jsonResponse({ jobs: [providerJob()] });
    },
  });
  await service.getJobs({ query: "Splunk" });
  currentTime += 61000;
  shouldFail = true;
  const stale = await service.getJobs({ query: "Splunk" });
  assert.equal(stale.stale, true);
  assert.equal(stale.jobs.length, 1);

  const unconfigured = createJobsService({ env: {}, log: createLog() });
  await assert.rejects(unconfigured.getJobs(), { statusCode: 503, code: "JOBS_NOT_CONFIGURED" });
});

test("jobs HTTP routes return normalized results and safe provider failures", async (t) => {
  const service = {
    getJobs: async () => ({
      jobs: [{ id: "job-1", title: "SOC Analyst", applyUrl: "https://jobs.example/1" }],
      pagination: { page: 1, hasMore: false, nextPage: null },
      refreshedAt: "2026-10-01T12:00:00.000Z",
      cached: false,
      stale: false,
    }),
    getJobById: async (id) => {
      if (id === "job-1") return { id, title: "SOC Analyst", applyUrl: "https://jobs.example/1" };
      const error = new Error("not found");
      error.statusCode = 404;
      error.code = "JOB_NOT_FOUND";
      throw error;
    },
  };
  const app = express();
  app.use("/api/jobs", createJobsRouter(createJobsController(service)));
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/jobs`;

  const response = await fetch(`${base}?query=SOC`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).jobs[0].applyUrl, "https://jobs.example/1");
  const detail = await fetch(`${base}/job-1`);
  assert.equal(detail.status, 200);
  assert.equal((await detail.json()).title, "SOC Analyst");
  const missing = await fetch(`${base}/missing`);
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: "not found", code: "JOB_NOT_FOUND" });
});
