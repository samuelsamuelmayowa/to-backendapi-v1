const { createJobsService } = require("../services/jobsService");

function createJobsController(service = createJobsService()) {
  function handle(action) {
    return async (req, res) => {
      try {
        const result = await action(req);
        res.set("Cache-Control", "private, max-age=60, stale-while-revalidate=300");
        res.json(result);
      } catch (error) {
        const status = Number.isInteger(error.statusCode) ? error.statusCode : 502;
        const message = error.statusCode
          ? error.message
          : "Live job search is temporarily unavailable. Please try again later.";
        res.status(status).json({
          error: message,
          ...(error.code ? { code: error.code } : {}),
        });
      }
    };
  }

  return {
    search: handle((req) => service.getJobs(req.query)),
    detail: handle((req) => service.getJobById(req.params.jobId)),
  };
}

module.exports = { createJobsController };
