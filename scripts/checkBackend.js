'use strict';
// Production code has no transpilation step. Syntax-check without requiring
// modules, connecting databases, starting schedulers or calling providers.
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const files = ['api/index.js','routes/monitoring.js','monitoring-api.cjs','otlp-parser.cjs','advanced-otlp-parser.cjs',
  'services/database.js','routes/auth.js','middleware/requestCookies.js','middleware/sessionCookie.js',
  'middleware/verifyGoogleMobile.js','config/supabaseAdmin.js','firebase.js',
  'scripts/checkMonitoringEnvironment.js','scripts/checkMonitoringSchema.js','scripts/runBackendTests.js'];
for(const file of files) {
  const result=spawnSync(process.execPath,['--check',path.resolve(__dirname,'..',file)],{encoding:'utf8',windowsHide:true});
  if(result.status!==0) {console.error(`Syntax check failed: ${file}`);process.exitCode=1;}
}
if(!process.exitCode)console.log(`Backend syntax checks passed (${files.length} files). No providers or schedulers started.`);
