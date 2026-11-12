# Splunk tutorial data and advanced dataset plan

## Current data to search workflow

The backend importer reads the user-supplied `data/tutorialdata.zip` and `data/Prices.csv.zip` archives in place. It validates ZIP bounds, compression methods, entry paths, checksums, file sizes, record counts, and parsed fields. It does not extract files to disk or alter the ZIP archives.

Run the importer only against a local or otherwise approved MongoDB database:

```powershell
cd C:\ClientApps\JOINAPPTO\to-backendapi-v1
$env:DATABASE_URL = "mongodb://127.0.0.1:27017/to_analytics_lab"
npm run import:splunk-tutorial
```

The importer creates `splunk_lab_datasets` and `splunk_lab_events` collections and four searchable indexes:

| Index | Records | Source |
| --- | ---: | --- |
| `buttercup_web` | 39,532 | `access.log` |
| `buttercup_auth` | 40,088 | `secure.log` |
| `buttercup_sales` | 30,244 | `vendor_sales.log` |
| `buttercup_prices` | 16 | `prices.csv` |

The catalog stores each dataset's source, sourcetype, fields, timestamp range, event count, origin, and archive version. The version makes repeated imports idempotent. The generic search endpoint accepts an index-qualified query, enforces the existing 40-request-per-minute limit, applies the selected time range, and calculates results with the backend SPL engine.

For the local React app, point its existing API setting at the local backend before starting Vite:

```powershell
cd C:\ClientApps\JOINAPPTO\t-o-analytics
$env:VITE_API_URL = "http://localhost:9000"
npm run dev
```

Open the existing Splunk Studio route, choose an imported Buttercup index, and try:

```spl
index=buttercup_web status>=400 | stats count by status
index=buttercup_auth action=failure | stats count by user | sort -count
index=buttercup_prices | table productId product_name price sale_price
```

The current importer is for the supplied tutorial archives only. It does not import arbitrary uploads, BOTS, Attack Data, EVTX, or PCAP files. The tutorial download documentation describes Buttercup Games as fictional but does not state a redistribution license for the archive. The catalog therefore flags redistribution for review; keep this user-supplied copy out of public packaging until the applicable terms are confirmed.

## Advanced dataset review

| Source | What it contains | Storage and size | License and simulator fit |
| --- | --- | --- | --- |
| [BOTS v3](https://github.com/splunk/botsv3) | A multi-source security incident dataset spanning Linux, Windows/Sysmon, AWS, network, endpoint, identity, and web records. | One 320.1 MB pre-indexed Splunk dataset, distributed for placement under Splunk's apps directory. | The repository states CC0. The pre-indexed format is not ordinary CSV/JSON and is not compatible with the current Node importer. Do not parse its bucket files as text. |
| [Splunk Attack Data](https://github.com/splunk/attack_data) | MITRE ATT&CK-aligned attack and detection test records from Attack Range/Atomic Red Team and other environments, with YAML metadata mapping paths, sources, sourcetypes, and techniques. | Sparse `.log` files, YAML metadata, and other raw event representations; dataset objects use Git LFS. The repository warns that fetching all objects exceeds 9 GB. Its docs support fetching a selected path. | Repository license is Apache-2.0. Check each selected dataset's provenance and terms before redistributing records. Individual raw logs can be adapted after format inspection; the whole repository is not a simulator import unit. |

### Recommended next datasets

1. **Windows investigation:** start with the single `T1003.001/atomic_red_team/windows-security.log` object (8.28 KB on its GitHub file page), plus its adjacent YAML metadata. Inspect the actual payload and sidecar sourcetype before implementing an XML/JSON/text adapter. The repository also lists `windows-system.log` at 383 KB if a second source is needed.
2. **Failed-login investigation:** select a small Windows Security account-lockout dataset under `T1078.002/account_lockout`, after inspecting the exact object size and metadata. Build a mission around event IDs, affected account, host, and an incident timeline.
3. **Network/proxy investigation:** consider `cisco_secure_access/proxy/automated_web_recon_http_errors.log` (271 KB) as a later, separate dataset. Inspect the data and metadata before assigning fields or sourcetype.
4. **Multi-source incident and detection engineering:** combine a versioned, small collection of related files only after each source parser is proven. Store ATT&CK technique, source, sourcetype, file provenance, license notes, and a dataset version in the Data Catalog.

No BOTS v3 or Attack Data content was downloaded or added to the project. To keep the next download narrow, use the individual file pages above and retrieve only the selected raw log and its YAML metadata; do not clone the Attack Data repository or fetch all Git LFS objects.

### Mission design for a later milestone

- **Security monitoring:** count failures by action and identify an increase by host or source.
- **Failed logins:** group failures by user and source IP, then check for a later successful login.
- **Windows events:** filter Security/Sysmon records by event code and build a host/process timeline.
- **Network traffic:** summarize proxy or flow records by source, destination, action, and time bucket.
- **Incident investigation:** correlate versioned source datasets by user, host, source IP, and time window.
- **Detection engineering:** evaluate the result rows and threshold requirements, rather than requiring one exact SPL string; show a rationale and partial credit.

The current SPL engine can search the imported text/CSV-derived records and calculate core filters, tables, sorting, and statistics. A future importer can add bounded JSON/NDJSON and XML event adapters. Binary packet captures, Windows EVTX, and Splunk's pre-indexed bucket format need separate conversion or licensed infrastructure and should remain out of the Node CSV/text path.
