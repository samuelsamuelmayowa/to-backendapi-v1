require("dotenv").config();
const mongoose = require("mongoose");
const SplunkCase = require("../model/SplunkCase");

const cases = [
  {
    slug: "credential-storm", code: "INC-1042", title: "Credential Storm", subtitle: "Brute-force attack followed by account compromise", difficulty: "Intermediate", duration: 35,
    briefing: "At 09:18 UTC, the identity team reported a spike in failed VPN logins. Determine the attacking source, affected user, and whether any login succeeded.",
    index: "auth", sourcetype: "vpn:auth", fields: ["_time", "user", "src_ip", "action", "country", "device"], published: true,
    events: [
      { _time: "09:14:02", user: "d.adeleke", src_ip: "185.220.101.44", action: "failure", country: "NL", device: "unknown" },
      { _time: "09:14:19", user: "d.adeleke", src_ip: "185.220.101.44", action: "failure", country: "NL", device: "unknown" },
      { _time: "09:14:41", user: "d.adeleke", src_ip: "185.220.101.44", action: "failure", country: "NL", device: "unknown" },
      { _time: "09:15:03", user: "d.adeleke", src_ip: "185.220.101.44", action: "failure", country: "NL", device: "unknown" },
      { _time: "09:15:22", user: "d.adeleke", src_ip: "185.220.101.44", action: "failure", country: "NL", device: "unknown" },
      { _time: "09:15:55", user: "d.adeleke", src_ip: "185.220.101.44", action: "success", country: "NL", device: "Chrome/Linux" },
      { _time: "09:17:20", user: "m.okafor", src_ip: "102.89.33.18", action: "success", country: "NG", device: "Edge/Windows" }
    ],
    missions: [
      { key: "scope", title: "Scope failed authentication", instruction: "Search the authentication index for failed VPN events.", points: 20, expectedQuery: "index=auth sourcetype=vpn:auth action=failure", hints: ["Filter the authentication index to action=failure.", "Start with index=auth sourcetype=vpn:auth action=failure."], explanation: "Filtering early limits the events entering the pipeline." },
      { key: "aggregate", title: "Identify targeted accounts", instruction: "Count failures by user and source IP, then keep accounts with at least five failures.", points: 30, expectedQuery: "index=auth action=failure | stats count AS failures BY user src_ip | where failures>=5", hints: ["Use stats count grouped by user and src_ip.", "Add | where failures>=5 after stats."], explanation: "stats creates grouped evidence and where applies the threshold." },
      { key: "confirm", title: "Confirm compromise", instruction: "Show failure and success counts per user and source IP with conditional aggregation.", points: 35, expectedQuery: "index=auth | stats count(eval(action=\"failure\")) AS failures, count(eval(action=\"success\")) AS successes BY user src_ip", hints: ["Use count(eval(...)) once for each action.", "Group both counts BY user src_ip."], explanation: "Conditional aggregation preserves both sides of the authentication sequence." }
    ]
  },
  {
    slug: "powershell", code: "INC-1078", title: "Encoded PowerShell", subtitle: "Endpoint execution and command-line investigation", difficulty: "Advanced", duration: 45,
    briefing: "EDR detected PowerShell on a finance workstation shortly after a document was opened. Find the suspicious command, its parent process, and the affected host.",
    index: "endpoint", sourcetype: "sysmon:xml", fields: ["_time", "host", "user", "Image", "ParentImage", "CommandLine", "EventCode"], published: true,
    events: [
      { _time: "11:02:11", host: "FIN-WS17", user: "a.bello", Image: "WINWORD.EXE", ParentImage: "explorer.exe", CommandLine: "WINWORD.EXE invoice.docm", EventCode: 1 },
      { _time: "11:02:17", host: "FIN-WS17", user: "a.bello", Image: "powershell.exe", ParentImage: "WINWORD.EXE", CommandLine: "powershell -nop -w hidden -enc SQBFAFgA", EventCode: 1 },
      { _time: "11:02:23", host: "FIN-WS17", user: "a.bello", Image: "rundll32.exe", ParentImage: "powershell.exe", CommandLine: "rundll32.exe C:\\ProgramData\\cache.dll,Start", EventCode: 1 },
      { _time: "11:03:05", host: "HR-WS04", user: "k.obi", Image: "powershell.exe", ParentImage: "explorer.exe", CommandLine: "powershell Get-Printer", EventCode: 1 }
    ],
    missions: [
      { key: "encoded", title: "Find encoded execution", instruction: "Find process-creation events containing encoded PowerShell switches.", points: 25, expectedQuery: "index=endpoint EventCode=1 powershell *-enc*", hints: ["Search EventCode=1 and the word powershell.", "Add the wildcard term *-enc*."], explanation: "Process creation logs expose executable, parent, and command-line context." },
      { key: "extract", title: "Extract the encoded payload", instruction: "Use rex with a named group called encoded_payload to extract the value following -enc.", points: 35, expectedQuery: "index=endpoint powershell *-enc* | rex field=CommandLine \"-enc\\s+(?<encoded_payload>\\S+)\"", hints: ["Use rex against CommandLine.", "Use the named group (?<encoded_payload>...)."], explanation: "rex creates a result field from a named capture group." },
      { key: "chain", title: "Build the process chain", instruction: "Create a chronological table containing time, host, user, parent, process, and command line.", points: 25, expectedQuery: "index=endpoint host=FIN-WS17 | sort _time | table _time host user ParentImage Image CommandLine", hints: ["Filter to FIN-WS17 and sort by _time.", "Use table with all requested fields."], explanation: "A chronological process chain explains how execution began and continued." }
    ]
  },
  {
    slug: "exfiltration", code: "INC-1121", title: "Midnight Exfiltration", subtitle: "Proxy anomaly and outbound data investigation", difficulty: "Expert", duration: 50,
    briefing: "Network monitoring shows an unusual outbound transfer after midnight. Identify the host, destination, and volume, then write a useful detection query.",
    index: "proxy", sourcetype: "web:proxy", fields: ["_time", "src", "dest_domain", "bytes_out", "action", "user_agent"], published: true,
    events: [
      { _time: "00:41:02", src: "10.20.5.77", dest_domain: "sync-storage.cc", bytes_out: 188000000, action: "allowed", user_agent: "python-requests/2.31" },
      { _time: "00:43:14", src: "10.20.5.77", dest_domain: "sync-storage.cc", bytes_out: 244000000, action: "allowed", user_agent: "python-requests/2.31" },
      { _time: "00:47:51", src: "10.20.5.77", dest_domain: "sync-storage.cc", bytes_out: 221000000, action: "allowed", user_agent: "python-requests/2.31" },
      { _time: "00:55:09", src: "10.20.8.14", dest_domain: "updates.microsoft.com", bytes_out: 8400000, action: "allowed", user_agent: "WindowsUpdate" },
      { _time: "01:04:33", src: "10.20.5.77", dest_domain: "sync-storage.cc", bytes_out: 197000000, action: "allowed", user_agent: "python-requests/2.31" }
    ],
    missions: [
      { key: "volume", title: "Measure outbound volume", instruction: "Sum bytes sent by source and destination, convert the result to MB, and sort highest first.", points: 30, expectedQuery: "index=proxy | stats sum(bytes_out) AS total_bytes BY src dest_domain | eval outbound_mb=round(total_bytes/1024/1024,2) | sort - outbound_mb", hints: ["Aggregate bytes with stats first.", "Convert total_bytes using eval and divide by 1024 twice."], explanation: "Aggregate raw bytes before converting units." },
      { key: "timeline", title: "Plot the transfer timeline", instruction: "Create a 5-minute timechart of outbound bytes by destination domain.", points: 25, expectedQuery: "index=proxy | timechart span=5m sum(bytes_out) BY dest_domain", hints: ["Use the timechart command.", "Set span=5m and group BY dest_domain."], explanation: "A timechart makes transfer bursts visible." },
      { key: "detect", title: "Author a reusable detection", instruction: "Find sources sending over 500 MB in an hour and retain source, destination, and total bytes.", points: 30, expectedQuery: "index=proxy | bin _time span=1h | stats sum(bytes_out) AS total_bytes BY _time src dest_domain | where total_bytes>524288000", hints: ["Bucket _time into one-hour spans.", "Aggregate bytes, then apply the threshold with where."], explanation: "Time bucketing plus aggregation creates a reusable analytic." }
    ]
  }
];

async function seed() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing.");
  await mongoose.connect(process.env.DATABASE_URL);
  for (const item of cases) await SplunkCase.findOneAndUpdate({ slug: item.slug }, item, { upsert: true, new: true, runValidators: true });
  console.log(`Seeded ${cases.length} published Splunk cases.`);
  await mongoose.disconnect();
}

seed().catch(async (error) => { console.error("Splunk seed failed:", error.message); await mongoose.disconnect().catch(() => {}); process.exit(1); });
