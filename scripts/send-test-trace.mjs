// Send one syntactically valid OTLP/HTTP-JSON HTTP SERVER span to T.O. Monitoring.
// Requires environment variables TO_TEST_OTLP_ENDPOINT and TO_TEST_PROJECT_KEY.
import { randomBytes } from 'node:crypto';

const url = process.env.TO_TEST_OTLP_ENDPOINT;
const key = process.env.TO_TEST_PROJECT_KEY;
if (!url || !key || !url.startsWith('https://')) {
  console.error('Set TO_TEST_OTLP_ENDPOINT=https://YOUR-RENDER-API/otlp/v1/traces and TO_TEST_PROJECT_KEY=your_secret');
  process.exit(1);
}
const start = BigInt(Date.now()) * 1000000n;
const data = {
  resourceSpans: [{
    resource: { attributes: [{key:'service.name',value:{stringValue:'test-node-api'}}] },
    scopeSpans: [{spans: [{
      traceId:randomBytes(16).toString('hex'),
      spanId:randomBytes(8).toString('hex'),
      kind:2,
      startTimeUnixNano:start.toString(),
      endTimeUnixNano:(start+25000000n).toString(),
      attributes:[
        {key:'http.request.method',value:{stringValue:'GET'}},
        {key:'http.route',value:{stringValue:'/api/test'}},
        {key:'http.response.status_code',value:{intValue:'200'}},
      ],
    }]}],
  }],
};
const result = await fetch(url, {
  method:'POST',
  headers:{'content-type':'application/json','x-to-project-key':key},
  body:JSON.stringify(data),
  signal:AbortSignal.timeout(10000),
});
const body = await result.text();
console.log(`Response HTTP ${result.status}: ${body}`);
if (!result.ok) process.exitCode=1;
