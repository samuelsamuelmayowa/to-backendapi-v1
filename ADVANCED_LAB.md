# Advanced Splunk practice

The existing `/api/splunk-lab` routes are unchanged. `POST /api/splunk-lab/practice/run` adds stateless synthetic practice; it needs no database migration, seed, Supabase service, socket connection, or background worker.

Deploy the backend changes to the existing Render service and the frontend through its existing hosting flow. The React frontend uses `VITE_API_URL` as the backend origin (without `/api/splunk-lab`). Set it to the actual Render backend URL in the frontend hosting environment before building. For local development, set the same variable in the frontend `.env` or `.env.local` file and restart Vite. Local environment files do not configure the hosted frontend automatically; rebuild/redeploy the frontend after changing its hosted environment variable. If the variable is absent or the new endpoint is unavailable, the advanced track executes the identical bundled simulator locally and labels results accordingly. Validation and rate-limit errors are not bypassed with local fallback.

Open `/toskillab/lab` and select **Advanced practice**. The original lab remains available. The new track has three synthetic captures, seven tasks per capture, event replay, time-window searches, result charts, hints, saved queries, evidence notes, and Markdown report exports. Progress is device-local and is not synchronized to an account. Written reports are not automatically graded and practice completion is not a credential.

## Maintenance

`services/advancedScenarios.js`, `services/advancedSpl.js`, and `services/advancedPractice.js` are the source of truth. Run `npm run sync:advanced-lab` with the frontend sibling checkout present after editing these files, and commit the generated frontend modules with the backend changes. Runtime deployment does not require the sibling repository.

Run `npm run test:advanced-lab` with both checkouts present. In the frontend run `npm run build`.

The simulator intentionally implements a bounded SPL subset, documented in the workbench. It does not execute JavaScript expressions or user-supplied regular expressions. Evaluation compares result field names and values, preserving row order only for tasks that explicitly request ordering. Solutions are bundled for self-guided learning, not secure examinations. Full-capture/all-time results are required for completion; replay and restricted windows remain available for exploration.
