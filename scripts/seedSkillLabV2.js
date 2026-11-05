"use strict";
// Run after applying migrations/20261027_skill_lab_workplace.sql:
//   node scripts/seedSkillLabV2.js
// Uses existing backend config/supabaseAdmin.js (server-only service-role).
// Inserts only missing questions and templates; safe to rerun.
const supabase = require("../config/supabaseAdmin.js");
const crypto = require("node:crypto");

// Format: [prompt, choices (4), correctIndex, explanation].
const BANK = {
  analyst: [
    ["Which SPL command groups events and returns aggregate counts?", ["stats", "fields", "rename", "sort"], 0, "stats count produces aggregate counts and can group with by."],
    ["To count failed logins per username, which query is most appropriate?", ["index=auth status=failure | stats count by user", "index=auth | table user", "index=auth | head 1", "index=auth | dedup user"], 0, "Filter failed logins then aggregate by user."],
    ["Which command adds a calculated field without changing raw events?", ["eval", "delete", "outputlookup", "collect"], 0, "eval computes a new field at search time."],
    ["Which command lists only the fields host, user, and status?", ["fields host user status", "timechart host user status", "sort host user status", "transaction host user status"], 0, "fields controls which columns remain."],
    ["What is the purpose of the time picker in Splunk Search?", ["Limit the searched time range", "Change the user's timezone permanently", "Delete old indexed events", "Rename a timestamp field"], 0, "Time filters help limit data scanned and improve relevance."],
    ["How would you find error volume in five-minute buckets?", ["index=web status>=500 | timechart span=5m count", "index=web | dedup status", "index=web | rename status as count", "index=web | head 5"], 0, "timechart with span groups events over time."],
    ["Which command helps calculate a percentage of total events?", ["eventstats count as total followed by eval", "head followed by dedup", "table followed by rename", "outputlookup without a search"], 0, "eventstats can place an overall total on each event for percentage calculations."],
    ["A lookup table maps IPs to department names. Which operation enriches results?", ["lookup", "sort", "head", "return"], 0, "lookup adds fields from a lookup dataset."],
    ["What is the main difference between where and search?", ["where supports eval expressions, search uses search syntax", "where permanently deletes events", "search cannot filter fields", "where only works on saved searches"], 0, "where evaluates expressions, while search uses SPL search predicates."],
    ["Why use stats dc(user) in a report?", ["Count distinct users", "Count duplicate users only", "Display current date", "Delete a user"], 0, "dc means distinct count."],
    ["A dashboard should let users choose host values. Which feature helps?", ["Input token", "Frozen index", "Delete command", "Indexer restart"], 0, "Dashboard inputs can drive searches using tokens."],
    ["Which query lists the top 10 HTTP endpoints by event count?", ["index=web | top limit=10 uri_path", "index=web | rare limit=10 host", "index=web | transaction uri_path", "index=web | head 10"], 0, "top displays the most frequent values."],
    ["Which SPL expression calculates a duration in seconds?", ["eval duration=end_time-start_time", "stats values(duration)", "lookup duration", "dedup end_time"], 0, "eval can subtract numeric timestamps."],
    ["Why does index=app sourcetype=access narrow a search?", ["It filters indexed metadata", "It changes retention settings", "It creates a lookup", "It restarts forwarders"], 0, "Filtering index and sourcetype early improves accuracy and cost."],
    ["What is the function of dedup session_id?", ["Keep one event per session_id", "Join all session events", "Sum session durations", "Encrypt a session ID"], 0, "dedup removes later duplicates in the output."],
    ["Which command compares yesterday's and today's average latency?", ["timechart span=1d avg(latency)", "head 2", "rex latency", "sort -latency"], 0, "Use timechart to aggregate over days."],
    ["What does fillnull value=unknown help with?", ["Replace missing fields in results", "Drop null events", "Make a new index", "Rebuild a lookup"], 0, "fillnull can substitute a visible placeholder for null values."],
    ["Why add a threshold line to an error-rate chart?", ["To compare data against an expected limit", "To hide errors", "To change data collection", "To reset the index"], 0, "Thresholds help interpret when a metric needs attention."],
    ["What does the rex command commonly do?", ["Extract fields using a regular expression", "Restart the search head", "Delete indexed logs", "Export a dashboard"], 0, "rex extracts fields from textual event data."],
    ["Which practice improves an incident report based on search results?", ["Include timeframe, evidence, and recommended action", "Only paste screenshots without context", "Report every event as malicious", "Hide search assumptions"], 0, "Reproducible evidence and concrete next actions matter."],
  ],
  soc: [
    ["What is the first step after an unusual authentication alert?", ["Validate scope, timestamps, and evidence", "Disable all accounts immediately", "Delete source logs", "Mark incident resolved without review"], 0, "Triage verifies alert context before escalation."],
    ["Many failed logins followed by a success on one user suggest what?", ["Possible password guessing followed by access", "Guaranteed scheduled patching", "A DNS outage", "A harmless index rotation"], 0, "This pattern merits identity and source correlation."],
    ["Which fields help correlate login anomalies?", ["user, src_ip, _time, action", "color, theme, css", "font, image, title", "invoice, price, cart"], 0, "Identity, source, time, and action are essential."],
    ["A suspicious destination domain appears in DNS logs. What should you do?", ["Correlate host, user, and other events", "Assume every lookup is malicious", "Delete logs", "Ignore because DNS is normal"], 0, "Correlate evidence to establish malicious behavior."],
    ["What does the MITRE ATT&CK framework provide?", ["A common language for adversary techniques", "A replacement for access controls", "A DNS resolver", "A billing system"], 0, "ATT&CK organizes observed adversary tactics and techniques."],
    ["Why verify an alert's time window?", ["To reduce false context and correlate events", "To delete old detections", "To encrypt alerts", "To change account passwords"], 0, "Time boundaries are needed for meaningful correlations."],
    ["Which response is most appropriate for a suspected compromised account?", ["Escalate with evidence and follow approved containment procedure", "Publish credentials", "Turn off logging", "Immediately reimage every server"], 0, "Follow the incident response plan and preserve evidence."],
    ["Why distinguish false positive from false negative?", ["A false positive alerts on benign activity; false negative misses malicious activity", "Both mean a confirmed breach", "Both indicate database failure", "Only severity differs"], 0, "They represent different detection errors."],
    ["Which search helps spot one source IP targeting multiple users?", ["index=auth action=failure | stats dc(user) by src_ip", "index=auth | head 1", "index=auth | dedup src_ip", "index=auth | table action"], 0, "Distinct targeted users by source helps detect broad guessing."],
    ["What should an incident timeline contain?", ["Ordered relevant events and timestamps", "Only the alert title", "Unverified guesses", "Personal opinions without evidence"], 0, "A timeline connects the sequence of events."],
    ["When is an urgent escalation justified?", ["When corroborated indicators show serious ongoing impact", "Every time a dashboard loads", "Whenever a query is slow", "When one harmless ping is logged"], 0, "Escalation should be grounded in severity and confirmed indicators."],
    ["What is the role of endpoint telemetry in triage?", ["Correlate processes, hosts, and suspicious activity", "Replace user training", "Block all DNS by default", "Create payroll reports"], 0, "Endpoint details help connect security events."],
    ["Why preserve raw logs during an investigation?", ["For integrity, chronology, and auditability", "To make the dashboard prettier", "To avoid writing reports", "To increase false positives"], 0, "Evidence preservation supports reliable incident response."],
    ["How should a SOC analyst handle an uncertain IOC match?", ["Validate with context and additional signals", "Declare a breach without review", "Share personal data publicly", "Delete the associated event"], 0, "An IOC match by itself may be benign."],
    ["What does an alert playbook usually define?", ["Triage, enrichment, escalation, and response steps", "Only the dashboard font", "The employee salary", "The index retention period"], 0, "Playbooks standardize repeatable investigations."],
    ["Which SPL command is useful for counting events per risk score?", ["stats count by risk_score", "rename risk_score", "delete risk_score", "head risk_score"], 0, "stats aggregates counts grouped by values."],
    ["Why check for known maintenance windows?", ["To explain expected changes before escalation", "To turn off all detections forever", "To remove timestamps", "To prevent all reports"], 0, "Maintenance may create benign unusual activity."],
    ["What is a good next step after correlating a phishing click?", ["Check related authentication and endpoint events", "Erase the user's mailbox", "Ignore it because email is common", "Publish the sender's password"], 0, "Correlate follow-on actions to assess impact."],
    ["Which finding most supports suspicious lateral movement?", ["Unexpected remote connections across multiple hosts", "One legitimate dashboard refresh", "A user viewing documentation", "An approved health check"], 0, "Unusual cross-host activity can suggest lateral movement."],
    ["What should a clear SOC handoff include?", ["Indicators, impact, evidence, actions taken, next steps", "Just the word urgent", "No timestamps", "Only unrelated alerts"], 0, "Structured handoffs enable the next analyst to continue safely."],
  ],
  engineer: [
    ["What component receives data from a Universal Forwarder?", ["An indexer or configured receiving tier", "A dashboard token", "A lookup CSV", "A browser extension"], 0, "Forwarders send data to the ingestion pipeline."],
    ["Which configuration file defines data inputs?", ["inputs.conf", "savedsearches.conf", "ui-prefs.conf", "macros.conf"], 0, "inputs.conf specifies monitored data and other inputs."],
    ["What does props.conf commonly control?", ["Parsing, timestamps, and field extraction settings", "User payroll", "Vercel deployment", "Git commit history"], 0, "props.conf supports source parsing and knowledge rules."],
    ["Which config file is often used to route and transform events?", ["transforms.conf", "indexes.conf only", "authorize.conf only", "web.conf only"], 0, "transforms.conf defines reusable transforms used with props."],
    ["Why monitor indexer disk utilization?", ["Capacity pressure can affect indexing and retention", "It changes dashboard colors", "It makes SPL syntax invalid", "It deletes user accounts"], 0, "Disk capacity affects indexing health."],
    ["Which command shows search peer and indexing diagnostics?", ["| rest /services/server/info", "| inputlookup users.csv", "| head 5", "| return 1"], 0, "The REST search command can query management endpoints."],
    ["What is an advantage of using tstats on accelerated data models?", ["Efficient aggregation over indexed summaries", "It bypasses all permissions", "It permanently changes raw logs", "It disables the scheduler"], 0, "tstats operates efficiently on indexed data and data model acceleration."],
    ["Why set correct sourcetype during onboarding?", ["So timestamps and field parsing behave predictably", "To make dashboards dark", "To avoid authentication", "To prevent all indexing"], 0, "Sourcetype drives parsing and search conventions."],
    ["How should a search be optimized for high-volume data?", ["Filter by index, time, and selective terms early", "Search all-time across every index", "Use join everywhere", "Always run transaction first"], 0, "Search selectivity reduces work."],
    ["When should you prefer a lookup over a large manual case statement?", ["When mapping frequently changing reference values", "When logs are encrypted", "For changing font styles", "Only for deleting logs"], 0, "Lookups separate mappings from SPL."],
    ["What does a deployment server help manage?", ["Apps and configurations on compatible forwarders", "Payroll settlement", "Google sign-in", "Monitor brightness"], 0, "Deployment servers distribute apps and settings."],
    ["Why is time synchronization critical in distributed logging?", ["Events can be correlated accurately across hosts", "It enlarges files", "It creates user sessions", "It avoids all alerts"], 0, "Clock drift makes incident timelines unreliable."],
    ["What does metrics.log help diagnose?", ["Splunk component performance and throughput", "Only frontend JavaScript", "Employee salary", "Public DNS registration"], 0, "Metrics logs provide operational internal telemetry."],
    ["What is the best way to validate a new data source?", ["Check ingestion, timestamps, host, source, and sourcetype", "Only open a dashboard", "Only check UI theme", "Skip test events"], 0, "Validate end-to-end ingestion and metadata."],
    ["What is a common purpose of indexes.conf?", ["Set index storage and retention settings", "Define login HTML", "Select interview answers", "Send SMS"], 0, "indexes.conf contains index-level storage settings."],
    ["When can accelerated data models help a SOC search?", ["Repeated high-volume summarizations", "When no data exists", "To replace network controls", "To write CSS"], 0, "Acceleration speeds compatible searches."],
    ["Why review search scheduler load?", ["Too many concurrent scheduled searches can affect performance", "It changes username casing", "It resets access tokens", "It disables the firewall"], 0, "Capacity planning includes scheduled searches."],
    ["What should be tested before deploying new ingest transformations?", ["Representative sample events and parsing outcomes", "Only navbar links", "Only theme colors", "Only marketing text"], 0, "Test against samples to avoid lost or malformed events."],
    ["Which practice is appropriate for production config changes?", ["Version control, review, and rollback plan", "Edit directly with no backup", "Avoid documenting changes", "Skip validation"], 0, "Managed, auditable changes minimize operational risk."],
    ["What does distributed search typically involve?", ["Search heads dispatching work to search peers", "All search work in a browser tab", "Converting metrics into salaries", "Turning off data parsing"], 0, "Search heads coordinate distributed searches."],
  ],
};

// A task includes visible fictitious data, a precise deliverable, and a server-only rubric.
// No live Splunk instance and no malicious code execution.
const TASKS = {
  analyst: [
    ["Failed login spike", "investigation", "A service desk reports multiple failed logins. Identify targeted users and source IPs. Explain whether the sample suggests brute force and propose a verification step.", [{user:"ada",src_ip:"10.0.1.11",action:"failure",count:26},{user:"sam",src_ip:"10.0.1.11",action:"failure",count:19},{user:"ada",src_ip:"10.0.1.11",action:"success",count:1}], "index=training sourcetype=auth", "Write a query counting failed logins by user/source IP and a concise triage report.", ["stats", "by", "src_ip"], ["login", "investigate"]],
    ["API error surge", "operations", "The API team sees more 500 errors after a rollout. Find the affected endpoints and report a probable next investigation step.", [{uri:"/orders",status:500,count:63},{uri:"/checkout",status:502,count:28},{uri:"/products",status:200,count:320}], "index=training sourcetype=web", "Aggregate 5xx status by URI and explain remediation.", ["stats", "status", "uri"], ["error", "endpoint"]],
    ["Slow search dashboard", "performance", "A dashboard is slow because its query searches all time. Propose a narrower, aggregated search and explain how it helps users.", [{host:"web01",duration_ms:3200},{host:"web02",duration_ms:780},{host:"web01",duration_ms:4600}], "index=training earliest=-24h", "Calculate average duration by host; note performance optimizations.", ["stats", "avg", "host"], ["performance", "time"]],
    ["VPN usage report", "reporting", "Leadership asks how many distinct people logged into the remote access service yesterday.", [{user:"chi",action:"success"},{user:"chi",action:"success"},{user:"bayo",action:"success"}], "index=training sourcetype=vpn", "Count unique users and explain what the metric means.", ["stats", "dc", "user"], ["user", "report"]],
    ["HTTP 404 patterns", "investigation", "Find the pages most often requested but missing and recommend steps for the web team.", [{path:"/help",status:404,count:48},{path:"/legacy",status:404,count:37},{path:"/home",status:200,count:300}], "index=training sourcetype=access", "Report top missing paths using SPL and recommend a redirect or link fix.", ["status", "stats", "path"], ["404", "fix"]],
    ["Daily health snapshot", "reporting", "Prepare a short overview of error events over time for the morning operations meeting.", [{_time:"08:00",status:500,count:8},{_time:"09:00",status:500,count:16},{_time:"10:00",status:200,count:280}], "index=training earliest=-24h", "Create a timechart query and describe the trend.", ["timechart", "count", "status"], ["trend", "error"]],
  ],
  soc: [
    ["Unusual authentication activity", "triage", "Security alerts show several failures followed by one success. Assess source, timeline, and containment options without making unsupported claims.", [{user:"employee7",src_ip:"198.51.100.7",action:"failure",count:37},{user:"employee7",src_ip:"198.51.100.7",action:"success",count:1}], "index=training sourcetype=auth", "Count failures by user and source, describe risk, and propose escalation.", ["stats", "src_ip", "action"], ["failure", "escalate"]],
    ["DNS anomaly review", "triage", "One endpoint is querying an unfamiliar domain more frequently than usual. Correlate the requester and propose an evidence-led response.", [{host:"desk12",domain:"updates.invalid",count:82},{host:"desk14",domain:"internal.example",count:12}], "index=training sourcetype=dns", "Summarize DNS lookups by host and domain, then describe what else to verify.", ["stats", "host", "domain"], ["dns", "verify"]],
    ["Privileged sign-in review", "identity", "Review a burst of admin logins to determine if they occurred outside business hours and what context is missing.", [{user:"admin1",hour:2,action:"success"},{user:"admin1",hour:3,action:"success"},{user:"ops1",hour:11,action:"success"}], "index=training sourcetype=auth", "Filter privileged activity; summarize by user and describe escalation threshold.", ["search", "user", "stats"], ["admin", "review"]],
    ["Firewall deny surge", "network", "A firewall logged spikes in denied outbound traffic. Identify source hosts and destination counts to prioritize investigation.", [{src_ip:"10.2.1.5",dest_ip:"203.0.113.22",action:"deny",count:74},{src_ip:"10.2.1.8",dest_ip:"203.0.113.25",action:"allow",count:12}], "index=training sourcetype=firewall", "Aggregate denied connections by source and explain the next verification step.", ["stats", "deny", "src_ip"], ["firewall", "investigate"]],
    ["Endpoint process timeline", "investigation", "An endpoint monitoring tool reports an unexpected process chain. Summarize the relevant hosts and processes for a handoff.", [{host:"laptop23",process:"powershell.exe",parent:"winword.exe",count:1},{host:"laptop23",process:"chrome.exe",parent:"explorer.exe",count:8}], "index=training sourcetype=edr", "Write a query grouping processes and parents; include an evidence-based handoff.", ["stats", "process", "parent"], ["process", "escalate"]],
    ["Alert fatigue tuning", "detection", "An alert fires repeatedly for a known approved scanner. Recommend a narrow tuning strategy while keeping true anomalies visible.", [{src_ip:"10.20.0.8",signature:"port_scan",count:85},{src_ip:"10.20.0.44",signature:"port_scan",count:4}], "index=training sourcetype=ids", "Count alerts by source, identify known scanner, and propose a targeted exception.", ["stats", "signature", "src_ip"], ["alert", "tune"]],
  ],
  engineer: [
    ["Indexing throughput check", "platform", "Check which data sources produce the most events and could drive unexpected indexing growth.", [{source:"/var/log/app.log",count:8200},{source:"/var/log/auth.log",count:1150},{source:"/var/log/db.log",count:240}], "index=training earliest=-24h", "Aggregate counts by source; recommend safe capacity follow-up.", ["stats", "count", "source"], ["index", "capacity"]],
    ["Sourcetype quality audit", "ingestion", "An onboarding team suspects timestamp parsing issues in new machine logs. Identify unusual source/sourcetype combinations.", [{source:"api.json",sourcetype:"_json",count:420},{source:"api.json",sourcetype:"unknown",count:61}], "index=training", "Count events by source and sourcetype, then describe parsing validation.", ["stats", "source", "sourcetype"], ["timestamp", "parsing"]],
    ["Missing logs investigation", "ingestion", "A monitoring dashboard stopped receiving events from one server. Check host coverage and propose a checklist of ingestion components.", [{host:"app01",last_seen:"14:55"},{host:"app02",last_seen:"09:15"},{host:"app03",last_seen:"14:51"}], "index=training", "Show latest event time per host and suggest input/forwarder checks.", ["stats", "latest", "host"], ["forwarder", "check"]],
    ["Expensive scheduled searches", "performance", "Search scheduler metrics show several high-latency jobs. Identify jobs needing optimization.", [{savedsearch_name:"hourly_big_join",run_time:190},{savedsearch_name:"small_report",run_time:3}], "index=training sourcetype=scheduler", "Rank search run times and recommend a targeted performance improvement.", ["stats", "max", "savedsearch_name"], ["search", "optimize"]],
    ["Dashboard data model use", "performance", "An accelerated data model exists. Draft a basic tstats aggregation for a dashboard and explain why it may help.", [{dataset:"Authentication",action:"failure",count:45},{dataset:"Authentication",action:"success",count:360}], "| tstats count from datamodel=Authentication", "Count authentication actions using tstats and discuss acceleration prerequisites.", ["tstats", "count", "by"], ["data model", "performance"]],
    ["Change validation report", "deployment", "A new extraction rule was deployed. Prepare a verification search and a rollback plan based on known test events.", [{source:"app.log",event:"status=ok user=chi"},{source:"app.log",event:"status=error user=ola"}], "index=training sourcetype=app", "Use a field-based count and explain how to validate and roll back.", ["stats", "status", "count"], ["rollback", "validate"]],
  ],
};

async function main() {
  const { data: roles, error: roleError } = await supabase.from("skill_lab_roles").select("id,slug").eq("is_active", true);
  if (roleError) throw roleError;

  console.log(
  "Roles found in Supabase:",
  (roles || []).map((role) => ({
    slug: role.slug,
    id: role.id,
  }))
);
  let questionCount = 0;
  let templateCount = 0;
  for (const role of roles || []) {
    const questions = BANK[role.slug] || [];
    const tasks = TASKS[role.slug] || [];
    if (!questions.length && !tasks.length) continue;
    const { data: existing, error } = await supabase.from("skill_lab_questions").select("prompt").eq("role_id", role.id);
    if (error) throw error;
    const previous = new Set((existing || []).map(q => q.prompt));
    const newQuestions = questions.filter(([prompt]) => !previous.has(prompt)).map(([prompt, options, correct_option, explanation]) => {
      // Distribute the correct answers across A–D (not always option A).
      const offset = crypto.createHash("sha256").update(prompt).digest()[0] % options.length;
      return {
        role_id: role.id, level: null, is_active: true, category: "Role knowledge", difficulty: "entry",
        prompt, options: [...options.slice(offset), ...options.slice(0, offset)],
        correct_option: (correct_option - offset + options.length) % options.length,
        explanation, points: 10, time_limit_seconds: 75,
      };
    });
    if (newQuestions.length) {
      const { error: insertError } = await supabase.from("skill_lab_questions").insert(newQuestions);
      if (insertError) throw insertError;
      questionCount += newQuestions.length;
    }
    const { data: existingTasks, error: taskError } = await supabase.from("skill_lab_task_templates").select("title").eq("role_slug", role.slug);
    if (taskError) throw taskError;
    const existingTitles = new Set((existingTasks || []).map(t => t.title));
    const newTasks = tasks.filter(([title]) => !existingTitles.has(title)).map(([title, category, brief, sample_logs, starter_query, expected_output, spl_terms, report_terms]) => ({
      role_slug: role.slug, title, category, brief, sample_logs, starter_query, expected_output,
      rubric: { spl_terms, report_terms }, difficulty: "junior", is_active: true,
    }));
    if (newTasks.length) {
      const { error: insertError } = await supabase.from("skill_lab_task_templates").insert(newTasks);
      if (insertError) throw insertError;
      templateCount += newTasks.length;
    }
    console.log(`${role.slug}: ${newQuestions.length} new interview questions, ${newTasks.length} new workplace scenarios`);
  }
  console.log(`Seed finished. Added ${questionCount} interview questions and ${templateCount} scenario templates.`);
}

if (require.main === module) main().catch((error) => { console.error("Seed failed:", error.message); process.exitCode = 1; });
module.exports = { BANK, TASKS };
