// Synthetic, deterministic training data. No customer telemetry is used.
const time = seconds => `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
const task = (id, title, instruction, query, hints, explanation, ordered = false) => ({ id, title, instruction, query, hints, explanation, ordered });
const auth = Array.from({ length: 96 }, (_, i) => ({ _time: time(32400 + i * 15), user: ['m.okafor', 'k.obi', 'a.bello', 's.james'][i % 4], src_ip: `192.0.2.${10 + i % 4}`, action: i % 17 === 0 ? 'failure' : 'success', country: 'NG', device: 'managed-laptop' }));
for (let i = 0; i < 12; i++) auth.push({ _time: time(33000 + i * 8), user: 'd.adeleke', src_ip: '203.0.113.44', action: 'failure', country: 'NL', device: 'unknown' });
auth.push({ _time: '09:12:10', user: 'd.adeleke', src_ip: '203.0.113.44', action: 'success', country: 'NL', device: 'unmanaged-linux' });
const web = Array.from({ length: 120 }, (_, i) => ({ _time: time(50400 + i * 10), host: i % 2 ? 'api-02' : 'api-01', path: i % 3 ? '/catalog' : '/checkout', status: 200, duration_ms: 80 + i % 11 * 10, release: 'v2.8' }));
for (let i = 0; i < 24; i++) web.push({ _time: time(51000 + i * 10), host: 'api-02', path: '/checkout', status: 503, duration_ms: 3200 + i * 10, release: 'v2.9' });
const proxy = Array.from({ length: 90 }, (_, i) => ({ _time: time(1800 + i * 20), src: `192.0.2.${20 + i % 5}`, dest_domain: ['updates.example.com', 'docs.example.com', 'backup.example.com'][i % 3], bytes_out: 20000 + i * 100, action: 'allowed', user_agent: 'managed-browser' }));
for (let i = 0; i < 8; i++) proxy.push({ _time: time(2400 + i * 90), src: '192.0.2.77', dest_domain: 'sync-storage.example', bytes_out: 110000000, action: 'allowed', user_agent: 'python-requests' });
proxy.push({ _time: '00:53:00', src: '192.0.2.88', dest_domain: 'sync-storage.example', bytes_out: 0, action: 'blocked', user_agent: 'managed-browser' });

const scenarios = [
  {
    id: 'advanced-auth', title: 'Credential Storm: response shift', code: 'SOC-201', difficulty: 'Intermediate', duration: 40,
    index: 'auth', sourcetype: 'vpn:auth', events: auth,
    briefing: 'The identity team sees an authentication spike during the morning shift. Separate normal login mistakes from repeated attempts, confirm whether access succeeded, and recommend containment supported by evidence.',
    tasks: [
      task('failures', 'Scope failed logins', 'Return all failed authentication events, keeping the original event fields.', 'index=auth action=failure', ['Start in index=auth.', 'Filter the action field to failure.'], 'Filtering early separates failed authentication from the normal login baseline.'),
      task('sources', 'Find repeated attempts', 'Count failures by src_ip, name the count failures, and keep sources with at least 10 failures.', 'index=auth action=failure | stats count AS failures BY src_ip | where failures>=10', ['Aggregate only failed events.', 'Use stats count AS failures BY src_ip, then where failures>=10.'], 'A threshold reduces the noise from occasional typing mistakes.'),
      task('target', 'Identify targeted accounts', 'For source 203.0.113.44, count failures by user using the field name failures.', 'index=auth src_ip=203.0.113.44 action=failure | stats count AS failures BY user', ['Combine source and action filters.', 'Group the failure count BY user.'], 'Grouping by account reveals who was targeted.'),
      task('access', 'Confirm successful access', 'Return successful login events from 203.0.113.44 with all original fields.', 'index=auth src_ip=203.0.113.44 action=success', ['Search the same source again.', 'Change the action filter to success.'], 'A success after repeated failures warrants investigation; it is evidence, not proof of intent.'),
      task('timeline', 'Build an evidence timeline', 'For 203.0.113.44, sort chronologically and show only _time user src_ip action.', 'index=auth src_ip=203.0.113.44 | sort _time | table _time user src_ip action', ['Filter to the suspicious source.', 'Use sort _time before table.'], 'A sequence connects the repeated failures to the successful login.', true),
      task('baseline', 'Compare source locations', 'Count all authentication events by country using the field name events.', 'index=auth | stats count AS events BY country', ['Remove the suspicious-source filter.', 'Use stats count AS events BY country.'], 'Location is context; it should not be the only reason to classify an event as malicious.'),
      task('chart', 'Chart the login burst', 'Build a five-minute count timechart of all authentication events split by action.', 'index=auth | timechart span=5m count BY action', ['Start from all authentication events.', 'Use timechart span=5m count BY action.'], 'The chart compares failed and successful activity over the same interval.', true),
    ],
    debrief: 'The unfamiliar source 203.0.113.44 produced 12 failures for d.adeleke followed by a success. Verify the login with the user, revoke suspicious sessions, and review MFA and downstream activity.'
  },
  {
    id: 'advanced-outage', title: 'Checkout under pressure', code: 'OPS-204', difficulty: 'Beginner', duration: 35,
    index: 'web', sourcetype: 'access:json', events: web,
    briefing: 'Customers report failed checkouts after a deployment. Identify the affected endpoint and server, measure latency, compare releases, and prepare a handover for the on-call engineer.',
    tasks: [
      task('errors', 'Find server errors', 'Return all events with status 500 or above, preserving the original fields.', 'index=web status>=500', ['Search index=web.', 'Use a numeric status>=500 filter.'], 'Server errors distinguish backend failures from successful requests.'),
      task('endpoint', 'Locate the failing endpoint', 'Count server errors by path using errors as the count field.', 'index=web status>=500 | stats count AS errors BY path', ['Filter errors before aggregation.', 'Use stats count AS errors BY path.'], 'The checkout path is affected while catalog requests continue to succeed.'),
      task('host', 'Isolate the affected server', 'Count server errors by host, naming the count errors.', 'index=web status>=500 | stats count AS errors BY host', ['Keep the error filter.', 'Group the count BY host.'], 'A single affected server narrows the immediate response.'),
      task('latency', 'Measure failed-request latency', 'Calculate average duration_ms for server errors by host and name it avg_ms.', 'index=web status>=500 | stats avg(duration_ms) AS avg_ms BY host', ['Use avg rather than count.', 'Name the aggregate avg_ms and group BY host.'], 'Failures are also slow, increasing the impact on customers.'),
      task('release', 'Compare deployed versions', 'Count all requests by release and status with a count field named requests.', 'index=web | stats count AS requests BY release status', ['Include both successes and failures.', 'Group on release and status together.'], 'The observed errors coincide with v2.9; this correlation guides validation, not automatic blame.'),
      task('first', 'Find the first failure', 'Return the earliest error as a one-row table containing _time host path release.', 'index=web status>=500 | sort _time | head 1 | table _time host path release', ['Sort errors chronologically.', 'Use head 1 and project the four requested fields.'], 'The first failure is a useful anchor when comparing deployment records.', true),
      task('chart', 'Visualize service health', 'Build a five-minute count timechart of all web requests split by status.', 'index=web | timechart span=5m count BY status', ['Search all web events.', 'Split timechart counts BY status.'], 'A time series shows when the failure window began.', true),
    ],
    debrief: 'There are 24 checkout errors on api-02 associated with v2.9, starting at 14:10 UTC. Escalate with the timeline, confirm the deployment change, and validate recovery after mitigation.'
  },
  {
    id: 'advanced-egress', title: 'Midnight outbound investigation', code: 'SOC-209', difficulty: 'Advanced', duration: 45,
    index: 'proxy', sourcetype: 'web:proxy', events: proxy,
    briefing: 'An outbound-volume alert fired during the night shift. Identify the sender, destination, total transferred bytes, and whether prevention controls stopped the activity. Compare suspicious traffic with normal browsing.',
    tasks: [
      task('large', 'Locate large transfers', 'Return individual events sending more than 100000000 bytes.', 'index=proxy bytes_out>100000000', ['Search the proxy index.', 'Compare bytes_out to 100000000.'], 'Large events are a useful starting point, but aggregation is needed to measure total impact.'),
      task('volume', 'Measure total outbound bytes', 'Sum bytes_out by src and dest_domain, call the sum total_bytes, and sort highest first.', 'index=proxy | stats sum(bytes_out) AS total_bytes BY src dest_domain | sort - total_bytes', ['Aggregate before sorting.', 'Use sum(bytes_out) AS total_bytes BY src dest_domain.'], 'The sender transferred 880000000 bytes to the suspicious destination.', true),
      task('threshold', 'Create a volume detection', 'Across this complete capture, sum bytes_out by src as total_bytes and retain sources over 500000000 bytes.', 'index=proxy | stats sum(bytes_out) AS total_bytes BY src | where total_bytes>500000000', ['This threshold is for the full capture, not an hourly alert.', 'Apply where after stats.'], 'A useful detection states its units and observation window explicitly.'),
      task('agent', 'Inspect the sending tool', 'For src 192.0.2.77, return distinct user_agent values in a one-column table.', 'index=proxy src=192.0.2.77 | dedup user_agent | table user_agent', ['Filter to the suspicious source.', 'Use dedup then table user_agent.'], 'A scripting user agent adds context but can also be used legitimately.'),
      task('control', 'Check prevention outcomes', 'Count events to sync-storage.example by action, using events as the count field.', 'index=proxy dest_domain=sync-storage.example | stats count AS events BY action', ['Include both allowed and blocked events.', 'Group the event count BY action.'], 'One blocked event does not mean the other transfers were prevented.'),
      task('timeline', 'Build the transfer timeline', 'For src 192.0.2.77, sort by time and show _time src dest_domain bytes_out action.', 'index=proxy src=192.0.2.77 | sort _time | table _time src dest_domain bytes_out action', ['Filter to the source.', 'Sort _time and list the five requested fields.'], 'A compact timeline makes the supporting evidence easy to review.', true),
      task('chart', 'Chart outbound volume', 'Build a five-minute sum(bytes_out) timechart for all proxy events, split by dest_domain.', 'index=proxy | timechart span=5m sum(bytes_out) BY dest_domain', ['Use a sum, not a count.', 'Split the timechart BY dest_domain.'], 'Volume charts reveal the burst relative to normal background traffic.', true),
    ],
    debrief: '192.0.2.77 sent 880000000 bytes to sync-storage.example across eight allowed transfers. The blocked event belongs to another host. Preserve evidence and validate the transfer purpose before deciding on containment.'
  }
];
scenarios.forEach(scenario => scenario.events.sort((a, b) => a._time.localeCompare(b._time)));
module.exports = { scenarios };
