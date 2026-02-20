const mongoose = require("mongoose");
const Quiz = require("../model/quiz.js");

const MONGO_URI =
  "mongodb+srv://fpasamuelmayowa51:5iX35jgh9yB9P6Im@cluster0.unk3ntp.mongodb.net/datausers"; // Change to your DB URI


const splk2002Topic1Quiz = {
      title: "T.O Analytics –- SPLK-2002 Practice Quiz",
  description: "Topic: Boolean Logic, Functions, and Stats in Splunk",
  questions: [

{  question:
    "Which of the following will cause the greatest reduction in disk size requirements for a cluster of N indexers running Splunk Enterprise Security?",
  options: [
    "Setting the cluster search factor to N-1",
    "Increasing the number of buckets per index",
    "Decreasing the data model acceleration range",
    "Setting the cluster replication factor to N-1"
  ],
  correct: ["Setting the cluster search factor to N-1"],
  reason:
    "Search factor controls the number of searchable copies. Reducing it has the greatest impact on disk usage."
},
{
  question:
    "Stakeholders have identified high availability for searchable data as their top priority. Which of the following best addresses this requirement?",
  options: [
    "Increasing the search factor in the cluster",
    "Increasing the replication factor in the cluster",
    "Increasing the number of search heads in the cluster",
    "Increasing the number of CPUs on the indexers in the cluster"
  ],
  correct: ["Increasing the search factor in the cluster"],
  reason:
    "Search factor determines how many searchable copies of data exist across the cluster."
},
{
  question:
    "Search dashboards in the Monitoring Console indicate that the distributed deployment is approaching its capacity. Which option will provide the most search performance improvement?",
  options: [
    "Replace the indexer storage with solid state drives (SSD)",
    "Add more search heads and redistribute users based on the search type",
    "Look for slow searches and reschedule them during off-peak times",
    "Add more search peers and ensure data is evenly distributed"
  ],
  correct: ["Add more search peers and ensure data is evenly distributed"],
  reason:
    "Adding search peers (indexers) increases parallel search capacity."
},
{
  question:
    "Events are inconsistently formatted for a web sourcetype. Some data flows through heavy forwarders managed by another department. What is the likely cause?",
  options: [
    "Search heads have different configurations than indexers",
    "Inputs are not properly configured across all forwarders",
    "Indexers have different configurations than heavy forwarders",
    "The other department is running an older Splunk version"
  ],
  correct: ["Indexers have different configurations than heavy forwarders"],
  reason:
    "Index-time parsing must be consistent. Configuration differences cause inconsistent formatting."
},
{
  question:
    "A customer has a 500GB Enterprise license and a 300GB no-enforcement license. How much data can be ingested before search is locked out?",
  options: [
    "300GB",
    "500GB",
    "800GB",
    "Search is not locked out"
  ],
  correct: ["Search is not locked out"],
  reason:
    "No-enforcement licenses do not block search; violations are only recorded."
},
{
  question:
    "What does the deployer do in a Search Head Cluster (SHC)?",
  options: [
    "Distributes apps to SHC members",
    "Bootstraps clean Splunk installations",
    "Distributes runtime knowledge object changes",
    "Schedules searches across the cluster"
  ],
  correct: ["Distributes apps to SHC members"],
  reason:
    "The deployer distributes non-replicated configuration and apps to SHC members."
},
{
  question:
    "When using the props.conf LINE_BREAKER attribute to delimit multi-line events, the SHOULD_LINEMERGE attribute should be set to what?",
  options: ["Auto", "None", "True", "False"],
  correct: ["False"],
  reason:
    "LINE_BREAKER and SHOULD_LINEMERGE should not be enabled together."
},
{
  question:
    "Which of the following should be included in a Splunk deployment plan?",
  options: [
    "Business continuity and disaster recovery plans",
    "Current logging details and data source inventory",
    "Current and future topology diagrams",
    "A comprehensive list of stakeholders"
  ],
  correct: ["Current logging details and data source inventory"],
  reason:
    "Understanding existing data sources is critical for sizing and planning."
},
{
  question:
    "A multi-site indexer cluster can be configured using which of the following?",
  options: [
    "Via Splunk Web",
    "Edit SPLUNK_HOME/etc/system/local/server.conf",
    "Run splunk edit cluster-config from the CLI",
    "Edit SPLUNK_HOME/etc/system/default/server.conf"
  ],
  correct: [
    "Edit SPLUNK_HOME/etc/system/local/server.conf",
    "Run splunk edit cluster-config from the CLI"
  ],
  multi: true,
  reason:
    "Multi-site clustering is configured via CLI or system/local settings."
},
{
  question:
    "Which index-time props.conf attributes impact indexing performance?",
  options: [
    "REPORT",
    "LINE_BREAKER",
    "ANNOTATE_PUNCT",
    "SHOULD_LINEMERGE"
  ],
  correct: ["LINE_BREAKER", "ANNOTATE_PUNCT"],
  multi: true,
  reason:
    "These attributes affect event breaking and parsing at index time."
},
// =====================
// SPLK-2002 Q11 – Q20
// =====================

{
  question:
    "Which of the following are client filters available in serverclass.conf?",
  options: [
    "DNS name",
    "IP address",
    "Splunk server role",
    "Platform (machine type)"
  ],
  correct: ["DNS name", "IP address"],
  multi: true,
  reason:
    "serverclass.conf supports DNS names and IP addresses as valid client filters."
},
{
  question:
    "What log file would you search if you suspect there is a problem interpreting a regular expression in a monitor stanza?",
  options: [
    "btool.log",
    "metrics.log",
    "splunkd.log",
    "tailing_processor.log"
  ],
  correct: ["splunkd.log"],
  reason:
    "splunkd.log records parsing and configuration errors, including regex issues."
},
{
  question:
    "Which Splunk tool offers a health check for administrators to evaluate the health of their Splunk deployment?",
  options: [
    "btool",
    "DiagGen",
    "SPL Clinic",
    "Monitoring Console"
  ],
  correct: ["Monitoring Console"],
  reason:
    "Monitoring Console provides centralized health and performance dashboards."
},
{
  question:
    "In a four-site indexer cluster, which configuration stores two searchable copies at the origin site, one searchable copy at site2, and a total of four searchable copies?",
  options: [
    "site_search_factor = origin:2, site1:2, total:4",
    "site_search_factor = origin:2, site2:1, total:4",
    "site_replication_factor = origin:2, site1:2, total:4",
    "site_replication_factor = origin:2, site2:1, total:4"
  ],
  correct: ["site_search_factor = origin:2, site2:1, total:4"],
  reason:
    "site_search_factor controls searchable copies per site and total searchable copies."
},
{
  question:
    "Which Splunk Enterprise offering has its own license?",
  options: [
    "Splunk Cloud Forwarder",
    "Splunk Heavy Forwarder",
    "Splunk Universal Forwarder",
    "Splunk Forwarder Management"
  ],
  correct: ["Splunk Universal Forwarder"],
  reason:
    "The Universal Forwarder has its own licensing model and does not consume indexing license."
},
{
  question:
    "Which component in the splunkd.log will log information related to bad event breaking?",
  options: [
    "AuditTrail",
    "EventBreaking",
    "IndexingPipeline",
    "AggregatorMiningProcessor"
  ],
  correct: ["AggregatorMiningProcessor"],
  reason:
    "AggregatorMiningProcessor logs event breaking and aggregation issues."
},
{
  question:
    "Which Splunk server role regulates the functioning of an indexer cluster?",
  options: [
    "Indexer",
    "Deployer",
    "Master Node",
    "Monitoring Console"
  ],
  correct: ["Master Node"],
  reason:
    "The master node (cluster manager) controls replication and cluster behavior."
},
{
  question:
    "When adding or rejoining a member to a search head cluster, an error suggests performing a destructive configuration resync. What corrective action should be taken?",
  options: [
    "Restart the search head",
    "Run splunk apply shcluster-bundle from the deployer",
    "Run clean raft on all cluster members",
    "Run splunk resync shcluster-replicated-config on the affected member"
  ],
  correct: ["Run splunk resync shcluster-replicated-config on the affected member"],
  reason:
    "This command forces a resync of replicated configurations for the affected member."
},
{
  question:
    "Which of the following commands is used to clear the KV store?",
  options: [
    "splunk clean kvstore",
    "splunk clear kvstore",
    "splunk delete kvstore",
    "splunk reinitialize kvstore"
  ],
  correct: ["splunk clean kvstore"],
  reason:
    "The splunk clean kvstore command clears all KV store data."
},
{
  question:
    "Indexing is slow and real-time search results are delayed. There is ample CPU and memory on the indexers. What is most likely to improve indexing performance?",
  options: [
    "Increase the maximum number of hot buckets in indexes.conf",
    "Increase the number of parallel ingestion pipelines in server.conf",
    "Decrease the maximum size of search pipelines in limits.conf",
    "Decrease the maximum concurrent scheduled searches in limits.conf"
  ],
  correct: ["Increase the number of parallel ingestion pipelines in server.conf"],
  reason:
    "Increasing parallel ingestion pipelines allows more data to be indexed concurrently."
},
// =====================
// SPLK-2002 Q21 – Q30
// =====================

{
  question:
    "Splunk guidance estimates syslog data indexing size at 50% of the original data size. How does this divide between files in the index?",
  options: [
    "rawdata is 10%, tsidx is 40%",
    "rawdata is 15%, tsidx is 35%",
    "rawdata is 35%, tsidx is 15%",
    "rawdata is 40%, tsidx is 10%"
  ],
  correct: ["rawdata is 15%, tsidx is 35%"],
  reason:
    "Splunk sizing guidance states that rawdata consumes about 15% and tsidx about 35% of original syslog size."
},
{
  question:
    "A three-node search head cluster is skipping a large number of scheduled searches. What should be done to increase scheduled search capacity?",
  options: [
    "Create a job server on the cluster",
    "Add another search head to the cluster",
    "Set captain_is_adhoc_searchhead = true",
    "Increase max_searches_per_cpu in limits.conf"
  ],
  correct: ["Add another search head to the cluster"],
  reason:
    "Adding search heads increases total scheduling capacity in the cluster."
},
{
  question:
    "The frequency at which a deployment client contacts the deployment server is controlled by which setting?",
  options: [
    "polling_interval in outputs.conf",
    "phoneHomeIntervalInSecs in outputs.conf",
    "polling_interval in deploymentclient.conf",
    "phoneHomeIntervalInSecs in deploymentclient.conf"
  ],
  correct: ["phoneHomeIntervalInSecs in deploymentclient.conf"],
  reason:
    "Deployment client phone-home behavior is configured in deploymentclient.conf."
},
{
  question:
    "To activate replication for an index in an indexer cluster, which attribute must be configured in indexes.conf on all peer nodes?",
  options: [
    "repFactor = 0",
    "replicate = 0",
    "repFactor = auto",
    "replicate = auto"
  ],
  correct: ["repFactor = auto"],
  reason:
    "Setting repFactor=auto enables index replication in clustered environments."
},
{
  question:
    "Which clarification steps should be taken if apps are not appearing on a deployment client?",
  options: [
    "Check serverclass.conf on the deployment server",
    "Check deploymentclient.conf on the deployment client",
    "Check SPLUNK_HOME/etc/apps on the deployment server",
    "Search splunkd.log on the deployment server"
  ],
  correct: [
    "Check serverclass.conf on the deployment server",
    "Check deploymentclient.conf on the deployment client",
    "Search splunkd.log on the deployment server"
  ],
  multi: true,
  reason:
    "Deployment issues are typically related to server class mapping, client configuration, or deployment logs."
},
{
  question:
    "Which of the following security options must be explicitly configured and are not enabled by default?",
  options: [
    "Data encryption between Splunk Web and splunkd",
    "Certificate authentication between forwarders and indexers",
    "Certificate authentication between Splunk Web and search head",
    "Data encryption for distributed search"
  ],
  correct: ["Certificate authentication between forwarders and indexers"],
  reason:
    "Forwarder-to-indexer certificate authentication is not enabled by default."
},
{
  question:
    "Which of the following artifacts are included in a Splunk diag file?",
  options: [
    "Operating system settings",
    "Internal Splunk logs",
    "Customer indexed data",
    "Splunk configuration files"
  ],
  correct: ["Operating system settings", "Internal Splunk logs"],
  multi: true,
  reason:
    "Splunk diags include OS info and internal logs but not customer data."
},
{
  question:
    "Which command permanently decommissions a peer node in an indexer cluster?",
  options: [
    "splunk stop -f",
    "splunk offline -f",
    "splunk offline --enforce-counts",
    "splunk decommission --enforce-counts"
  ],
  correct: ["splunk offline --enforce-counts"],
  reason:
    "This command safely removes a peer while maintaining cluster integrity."
},
{
  question:
    "Which CLI command converts a Splunk instance into a license slave?",
  options: [
    "splunk add licenses",
    "splunk list licenser-slaves",
    "splunk edit licenser-localslave",
    "splunk list licenser-localslave"
  ],
  correct: ["splunk edit licenser-localslave"],
  reason:
    "This command configures the instance as a license slave."
},
{
  question:
    "Which logs are included in the _introspection index?",
  options: [
    "audit.log",
    "metrics.log",
    "disk_objects.log",
    "resource_usage.log"
  ],
  correct: ["disk_objects.log", "resource_usage.log"],
  multi: true,
  reason:
    "_introspection contains internal performance and resource usage metrics."
},
// =====================
// SPLK-2002 Q31 – Q40
// =====================

{
  question:
    "Which of the following can a Splunk diag contain?",
  options: [
    "Search history, Splunk users and their roles, running processes, indexed data",
    "Server specs, current open connections, internal Splunk log files, index listings",
    "KV store listings, internal Splunk log files, search peer bundles listings, indexed data",
    "Splunk configuration details, users and roles, current connections, index listings"
  ],
  correct: [
    "Server specs, current open connections, internal Splunk log files, index listings"
  ],
  reason:
    "A Splunk diag includes system specs, internal logs, and index listings, but not customer indexed data."
},
{
  question:
    "Which of the following statements about Splunk indexer clustering is true?",
  options: [
    "All peer nodes must run exactly the same Splunk version",
    "The master node must run the same or later version than search heads",
    "Peer nodes must run a later version than the master node",
    "Search heads must run the same or earlier version than peer nodes"
  ],
  correct: ["All peer nodes must run exactly the same Splunk version"],
  reason:
    "All indexer peers must run the same Splunk version to ensure cluster stability."
},
{
  question:
    "A customer plans to ingest 600 GB per day, has six concurrent users, wants high availability and high search performance, and wants to minimize hardware cost. How many indexers are recommended?",
  options: [
    "Two non-clustered indexers",
    "Three non-clustered indexers",
    "Two clustered indexers",
    "Two clustered indexers with scheduled searches"
  ],
  correct: ["Two clustered indexers"],
  reason:
    "Two clustered indexers provide high availability while minimizing hardware cost."
},
{
  question:
    "To reduce the captain’s workload in a search head cluster, which setting prevents scheduled searches from running on the captain?",
  options: [
    "adhoc_searchhead = true (all members)",
    "adhoc_searchhead = true (current captain)",
    "captain_is_adhoc_searchhead = true (all members)",
    "captain_is_adhoc_searchhead = true (current captain)"
  ],
  correct: ["captain_is_adhoc_searchhead = true (all members)"],
  reason:
    "This setting prevents scheduled searches from running on the captain node."
},
{
  question:
    "At which default interval does metrics.log generate a periodic report regarding license utilization?",
  options: [
    "10 seconds",
    "30 seconds",
    "60 seconds",
    "300 seconds"
  ],
  correct: ["30 seconds"],
  reason:
    "metrics.log records license utilization every 30 seconds by default."
},
{
  question:
    "Which of the following is a good practice for a search head cluster deployer?",
  options: [
    "Only distribute configurations when members phone home",
    "Use the deployer to distribute non-replicated configurations",
    "All configurations must go through the deployer",
    "Only distribute configurations with apply shcluster-bundle"
  ],
  correct: ["Use the deployer to distribute non-replicated configurations"],
  reason:
    "The deployer manages non-replicated, non-runtime configurations."
},
{
  question:
    "A customer is using syslog on port 514 to collect network device data. What is the best practice for ingesting this data?",
  options: [
    "Send syslog directly to multiple indexers",
    "Configure indexers to listen directly on port 514",
    "Use a forwarder to listen on port 514 and forward data",
    "Write syslog to files and use a forwarder to monitor the files"
  ],
  correct: ["Write syslog to files and use a forwarder to monitor the files"],
  reason:
    "Persisting syslog data to disk before forwarding improves reliability."
},
{
  question:
    "Which Splunk internal index contains license-related events?",
  options: [
    "_audit",
    "_license",
    "_internal",
    "_introspection"
  ],
  correct: ["_internal"],
  reason:
    "License usage and warnings are recorded in the _internal index."
},
{
  question:
    "Which statements describe the role of a Search Head Cluster (SHC) captain?",
  options: [
    "Acts as the job scheduler for the SHC",
    "Manages alert throttling",
    "Synchronizes the KV store primary",
    "Replicates knowledge bundles to search peers"
  ],
  correct: [
    "Acts as the job scheduler for the SHC",
    "Manages alert throttling"
  ],
  multi: true,
  reason:
    "The captain schedules jobs and manages alert throttling across the cluster."
},
{
  question:
    "Before users can use a KV store, an administrator must create a collection. Where is a KV store collection defined?",
  options: [
    "kvstore.conf",
    "collection.conf",
    "collections.conf",
    "kvcollections.conf"
  ],
  correct: ["collections.conf"],
  reason:
    "KV store collections are defined in collections.conf."
},
// =====================
// SPLK-2002 Q41 – Q50
// =====================

{
  question:
    "Which search will show all deployment client messages from a Universal Forwarder?",
  options: [
    "index=_audit component=DC* host=<ds> | stats count by message",
    "index=_audit component=DC* host=<uf> | stats count by message",
    "index=_internal component=DC* host=<uf> | stats count by message",
    "index=_internal component=DS* host=<ds> | stats count by message"
  ],
  correct: ["index=_internal component=DC* host=<uf> | stats count by message"],
  reason:
    "Deployment client messages from forwarders are logged in the _internal index with DC components."
},
{
  question:
    "Which search head cluster component is responsible for pushing knowledge bundles to search peers, replicating configuration changes, and scheduling jobs?",
  options: [
    "Master",
    "Captain",
    "Deployer",
    "Deployment server"
  ],
  correct: ["Captain"],
  reason:
    "The captain handles scheduling, replication, and bundle distribution."
},
{
  question:
    "Configurations from the deployer are merged into which location on a search head cluster member?",
  options: [
    "SPLUNK_HOME/etc/system/local",
    "SPLUNK_HOME/etc/apps/APP_HOME/local",
    "SPLUNK_HOME/etc/apps/search/default",
    "SPLUNK_HOME/etc/apps/APP_HOME/default"
  ],
  correct: ["SPLUNK_HOME/etc/apps/APP_HOME/default"],
  reason:
    "Deployer-managed configurations are merged into the app's default directory."
},
{
  question:
    "When Splunk indexes data in a non-clustered environment, what kind of files does it create by default?",
  options: [
    "Index and .tsidx files",
    "Rawdata and index files",
    "Compressed and .tsidx files",
    "Compressed and metadata files"
  ],
  correct: ["Rawdata and index files"],
  reason:
    "Splunk creates rawdata and index files during indexing."
},
{
  question:
    "How does IT Service Intelligence (ITSI) impact the planning of a Splunk deployment?",
  options: [
    "ITSI requires a dedicated deployment server",
    "ITSI users do not impact performance",
    "ITSI does not require additional hardware",
    "Additional infrastructure may be required depending on KPIs"
  ],
  correct: ["Additional infrastructure may be required depending on KPIs"],
  reason:
    "ITSI workloads can significantly impact search and compute requirements."
},
{
  question:
    "The KV Store forms its own cluster within a Search Head Cluster. What is the maximum number of SHC members the KV Store supports?",
  options: [
    "25",
    "50",
    "100",
    "Unlimited"
  ],
  correct: ["50"],
  reason:
    "KV Store clustering supports a maximum of 50 search head members."
},
{
  question:
    "In search head clustering, which methods can be used to transfer captaincy to another member?",
  options: [
    "Use the Monitoring Console",
    "Use the Search Head Clustering settings in Splunk Web",
    "Run splunk transfer shcluster-captain on the current captain",
    "Run splunk transfer shcluster-captain on the target member"
  ],
  correct: [
    "Run splunk transfer shcluster-captain on the current captain",
    "Run splunk transfer shcluster-captain on the target member"
  ],
  multi: true,
  reason:
    "Captaincy can be transferred using CLI commands from either the current or target captain."
},
{
  question:
    "Which command is used to thaw an archived bucket?",
  options: [
    "splunk collect",
    "splunk convert",
    "splunk rebuild",
    "splunk dbinspect"
  ],
  correct: ["splunk rebuild"],
  reason:
    "The splunk rebuild command is used to thaw frozen or archived buckets."
},
{
  question:
    "A Splunk instance is configured with clustering mode set to master and replication_factor = 2. Which statements describe this instance?",
  options: [
    "This is a multi-site cluster",
    "The search factor is set to 2",
    "The instance must be restarted",
    "The master_uri attribute is missing"
  ],
  correct: ["The search factor is set to 2", "The instance must be restarted"],
  multi: true,
  reason:
    "Replication factor defaults to the search factor, and a restart is required for clustering settings."
},
{
  question:
    "Which statement correctly describes migration from single-site to multi-site index replication?",
  options: [
    "A master node is required at each site",
    "Multisite policies apply only to new data",
    "Existing buckets immediately receive multisite policies",
    "Multisite total values must exceed single-site factors"
  ],
  correct: ["Multisite policies apply only to new data"],
  reason:
    "Existing single-site buckets are not retroactively converted to multisite policies."
},
// =====================
// SPLK-2002 Q51 – Q60
// =====================

{
  question:
    "What does setting site=site0 on all Search Head Cluster members do in a multi-site indexer cluster?",
  options: [
    "Disables search site affinity",
    "Sets all members to dynamic captaincy",
    "Enables multisite search artifact replication",
    "Enables automatic search site affinity discovery"
  ],
  correct: ["Disables search site affinity"],
  reason:
    "Setting site=site0 disables search site affinity for search heads."
},
{
  question:
    "Which of the following is a way to exclude search artifacts when creating a Splunk diag?",
  options: [
    "splunk diag --exclude",
    "splunk diag --debug --refresh",
    "splunk diag --disable=dispatch",
    "splunk diag --filter-searchstrings"
  ],
  correct: ["splunk diag --disable=dispatch"],
  reason:
    "The --disable=dispatch option excludes search artifacts from the diag."
},
{
  question:
    "Which statements describe licensing in a clustered Splunk deployment?",
  options: [
    "Free licenses do not support clustering",
    "Replicated data does not count against licensing",
    "Each cluster member requires its own clustering license",
    "Cluster members must share the same license pool and license master"
  ],
  correct: [
    "Replicated data does not count against licensing",
    "Cluster members must share the same license pool and license master"
  ],
  multi: true,
  reason:
    "Only original indexed data counts toward licensing, and clustered members share licensing."
},
{
  question:
    "When planning a search head cluster, which of the following is true?",
  options: [
    "All search heads must use the same operating system",
    "All search heads must be members of the cluster",
    "The search head captain must be assigned to the largest search head",
    "All indexers must belong to the indexer cluster"
  ],
  correct: ["All search heads must use the same operating system"],
  reason:
    "Search head cluster members must run the same OS for compatibility."
},
{
  question:
    "In which phase of the Splunk Enterprise data pipeline are indexed extraction configurations processed?",
  options: [
    "Input",
    "Search",
    "Parsing",
    "Indexing"
  ],
  correct: ["Parsing"],
  reason:
    "Indexed field extractions are applied during the parsing phase."
},
{
  question:
    "Which server.conf attribute should be added to the cluster manager when decommissioning a site in an indexer cluster?",
  options: [
    "site_mappings",
    "available_sites",
    "site_search_factor",
    "site_replication_factor"
  ],
  correct: ["site_mappings"],
  reason:
    "site_mappings is used to remap sites during decommissioning."
},
{
  question:
    "Which tools can be used to diagnose connection problems between a forwarder and an indexer?",
  options: [
    "telnet",
    "tcpdump",
    "splunk btool",
    "splunk btprobe"
  ],
  correct: ["telnet", "tcpdump"],
  multi: true,
  reason:
    "telnet and tcpdump help validate network connectivity and traffic."
},
{
  question:
    "A search head has joined one indexer cluster. Which command is used to configure it to join another indexer cluster?",
  options: [
    "splunk add cluster-config",
    "splunk add cluster-master",
    "splunk edit cluster-config",
    "splunk edit cluster-master"
  ],
  correct: ["splunk add cluster-master"],
  reason:
    "The add cluster-master command configures the search head for another cluster."
},
{
  question:
    "To improve Splunk performance, the parallelIngestionPipelines setting can be adjusted on which components?",
  options: [
    "Indexers",
    "Forwarders",
    "Search heads",
    "Cluster master"
  ],
  correct: ["Indexers", "Forwarders"],
  multi: true,
  reason:
    "Parallel ingestion pipelines are supported on indexers and forwarders."
},
{
  question:
    "When adding or decommissioning a member from a Search Head Cluster, what is the correct order of operations?",
  options: [
    "Delete Splunk, install and initialize, then join the cluster",
    "Install and initialize, delete Splunk, then join the cluster",
    "Initialize rebalance, remove master, trigger replication",
    "Trigger replication, remove master, initialize rebalance"
  ],
  correct: ["Delete Splunk, install and initialize, then join the cluster"],
  reason:
    "A clean install and initialization is required before joining an SHC."
},
// =====================
// SPLK-2002 Q61 – Q70
// =====================

{
  question:
    "Which statement best describes how index replication impacts license usage in a Splunk indexer cluster?",
  options: [
    "All replicated data counts toward license usage",
    "Only primary copies of indexed data count toward license usage",
    "Only searchable copies count toward license usage",
    "Replication factor directly multiplies license usage"
  ],
  correct: ["Only primary copies of indexed data count toward license usage"],
  reason:
    "Splunk licensing is based on the amount of original data indexed, not replicated copies."
},
{
  question:
    "Which file controls how often license usage is reported to the license manager?",
  options: [
    "license.conf",
    "server.conf",
    "limits.conf",
    "metrics.conf"
  ],
  correct: ["license.conf"],
  reason:
    "license.conf contains settings related to license usage reporting."
},
{
  question:
    "Which command is used to validate and troubleshoot configuration precedence in Splunk?",
  options: [
    "splunk show config",
    "splunk diag",
    "splunk btool",
    "splunk validate"
  ],
  correct: ["splunk btool"],
  reason:
    "btool shows the effective configuration after precedence is applied."
},
{
  question:
    "Which of the following actions helps reduce search load on indexers?",
  options: [
    "Increasing the replication factor",
    "Using report acceleration and data models",
    "Adding more forwarders",
    "Increasing maxHotBuckets"
  ],
  correct: ["Using report acceleration and data models"],
  reason:
    "Accelerations precompute results, reducing real-time search workload."
},
{
  question:
    "Which Splunk component manages indexer cluster configuration and peer coordination?",
  options: [
    "Indexer",
    "Search Head",
    "Cluster Manager",
    "Deployment Server"
  ],
  correct: ["Cluster Manager"],
  reason:
    "The Cluster Manager (formerly master) controls indexer clustering behavior."
},
{
  question:
    "When configuring outputs.conf on a Universal Forwarder, which setting ensures load balancing across indexers?",
  options: [
    "defaultGroup",
    "server",
    "autoLB",
    "useACK"
  ],
  correct: ["autoLB"],
  reason:
    "autoLB enables load-balanced forwarding across multiple indexers."
},
{
  question:
    "Which internal index is used to troubleshoot search performance and execution details?",
  options: [
    "_audit",
    "_internal",
    "_introspection",
    "_license"
  ],
  correct: ["_introspection"],
  reason:
    "_introspection stores detailed performance and resource usage metrics."
},
{
  question:
    "Which configuration file defines search head cluster membership and replication settings?",
  options: [
    "server.conf",
    "shcluster.conf",
    "cluster.conf",
    "distsearch.conf"
  ],
  correct: ["server.conf"],
  reason:
    "Search head cluster settings are defined in server.conf."
},
{
  question:
    "What is the primary purpose of the Search Job Inspector?",
  options: [
    "Debug forwarder connectivity",
    "Analyze search execution and performance",
    "Monitor indexer disk usage",
    "Review user authentication attempts"
  ],
  correct: ["Analyze search execution and performance"],
  reason:
    "Job Inspector provides detailed insights into search execution stages."
},
{
  question:
    "Which action is recommended before upgrading a Splunk clustered deployment?",
  options: [
    "Upgrade all nodes simultaneously",
    "Disable index replication",
    "Back up configurations and validate cluster health",
    "Reduce the search factor"
  ],
  correct: ["Back up configurations and validate cluster health"],
  reason:
    "Ensuring cluster health and backups minimizes upgrade risk."
},
// =====================
// SPLK-2002 Q71 – Q80
// =====================

{
  question:
    "Which statement best describes the purpose of the cluster search factor?",
  options: [
    "Determines how many copies of data are indexed",
    "Determines how many copies of data are searchable",
    "Controls how many peers receive forwarded data",
    "Controls how many buckets are searchable"
  ],
  correct: ["Determines how many copies of data are searchable"],
  reason:
    "Search factor defines the number of searchable copies of data in an indexer cluster."
},
{
  question:
    "Which component is responsible for maintaining the authoritative list of peers in an indexer cluster?",
  options: [
    "Indexer",
    "Search Head",
    "Cluster Manager",
    "Deployment Server"
  ],
  correct: ["Cluster Manager"],
  reason:
    "The Cluster Manager maintains peer membership and cluster state."
},
{
  question:
    "What happens if the replication factor is set higher than the number of indexers in a cluster?",
  options: [
    "The cluster fails to start",
    "Data ingestion stops",
    "Replication requirements cannot be met",
    "Searches are disabled"
  ],
  correct: ["Replication requirements cannot be met"],
  reason:
    "Replication factor cannot exceed the number of available peers."
},
{
  question:
    "Which Splunk configuration file controls forwarding destinations?",
  options: [
    "inputs.conf",
    "outputs.conf",
    "deploymentclient.conf",
    "server.conf"
  ],
  correct: ["outputs.conf"],
  reason:
    "outputs.conf defines where forwarded data is sent."
},
{
  question:
    "Which feature allows Splunk to precompute and store search results to improve performance?",
  options: [
    "Summary indexing",
    "Search head clustering",
    "Search affinity",
    "License pooling"
  ],
  correct: ["Summary indexing"],
  reason:
    "Summary indexing stores precomputed results for faster searches."
},
{
  question:
    "Which internal index is primarily used for auditing user activity?",
  options: [
    "_internal",
    "_audit",
    "_license",
    "_introspection"
  ],
  correct: ["_audit"],
  reason:
    "_audit stores user authentication, role changes, and other audit events."
},
{
  question:
    "Which command is used to force a search head cluster member to rejoin the cluster?",
  options: [
    "splunk restart shcluster",
    "splunk rejoin shcluster",
    "splunk resync shcluster-replicated-config",
    "splunk clean shcluster"
  ],
  correct: ["splunk resync shcluster-replicated-config"],
  reason:
    "This command forces a resynchronization of replicated configurations."
},
{
  question:
    "What is the recommended minimum number of members in a Search Head Cluster?",
  options: [
    "1",
    "2",
    "3",
    "5"
  ],
  correct: ["3"],
  reason:
    "A minimum of three members is required to maintain quorum."
},
{
  question:
    "Which Splunk tool is recommended for analyzing indexing bottlenecks?",
  options: [
    "Monitoring Console",
    "Search Job Inspector",
    "Deployment Server",
    "License Manager"
  ],
  correct: ["Monitoring Console"],
  reason:
    "Monitoring Console provides indexing and performance diagnostics."
},
{
  question:
    "Before enabling indexer clustering, which requirement must be met?",
  options: [
    "Search head cluster must already exist",
    "All indexers must have identical hardware",
    "Indexers must share the same Splunk version",
    "Deployment server must be configured"
  ],
  correct: ["Indexers must share the same Splunk version"],
  reason:
    "Indexer clustering requires all peers to run the same Splunk version."
},
// =====================
// SPLK-2002 Q81 – Q90
// =====================

{
  question:
    "Which Splunk configuration file controls index settings such as retention and replication?",
  options: [
    "indexes.conf",
    "server.conf",
    "limits.conf",
    "props.conf"
  ],
  correct: ["indexes.conf"],
  reason:
    "indexes.conf defines index properties including retention, replication, and bucket settings."
},
{
  question:
    "Which setting determines how long indexed data is retained before being frozen?",
  options: [
    "maxHotBuckets",
    "frozenTimePeriodInSecs",
    "homePath.maxDataSizeMB",
    "maxTotalDataSizeMB"
  ],
  correct: ["frozenTimePeriodInSecs"],
  reason:
    "frozenTimePeriodInSecs controls the data retention period for an index."
},
{
  question:
    "Which Splunk role is responsible for managing licenses in a distributed deployment?",
  options: [
    "License Master (License Manager)",
    "Cluster Manager",
    "Deployment Server",
    "Search Head Captain"
  ],
  correct: ["License Master (License Manager)"],
  reason:
    "The License Manager centrally manages licensing for all connected Splunk instances."
},
{
  question:
    "Which feature ensures that scheduled searches continue to run if a search head fails?",
  options: [
    "Search affinity",
    "Search head clustering",
    "Indexer clustering",
    "Search job inspector"
  ],
  correct: ["Search head clustering"],
  reason:
    "Search head clustering provides high availability for scheduled searches."
},
{
  question:
    "Which props.conf attribute is used to disable automatic line merging?",
  options: [
    "LINE_BREAKER",
    "TRUNCATE",
    "SHOULD_LINEMERGE",
    "EVENT_BREAKER"
  ],
  correct: ["SHOULD_LINEMERGE"],
  reason:
    "Setting SHOULD_LINEMERGE=false disables automatic line merging."
},
{
  question:
    "Which index stores Splunk internal operational logs?",
  options: [
    "_audit",
    "_license",
    "_internal",
    "_introspection"
  ],
  correct: ["_internal"],
  reason:
    "The _internal index stores Splunk internal logs such as splunkd.log."
},
{
  question:
    "Which command is used to generate a Splunk diagnostic file?",
  options: [
    "splunk support",
    "splunk diag",
    "splunk debug",
    "splunk inspect"
  ],
  correct: ["splunk diag"],
  reason:
    "splunk diag collects logs, configs, and system info for troubleshooting."
},
{
  question:
    "Which statement correctly describes the role of a Heavy Forwarder?",
  options: [
    "It only forwards raw data without parsing",
    "It can parse and transform data before forwarding",
    "It cannot run Splunk apps",
    "It does not support SSL"
  ],
  correct: ["It can parse and transform data before forwarding"],
  reason:
    "Heavy Forwarders can parse, filter, and transform data before forwarding."
},
{
  question:
    "Which configuration setting enables SSL encryption between forwarders and indexers?",
  options: [
    "sslEnable",
    "useSSL",
    "enableSSL",
    "sslCertPath"
  ],
  correct: ["useSSL"],
  reason:
    "useSSL enables encrypted communication between forwarders and indexers."
},
{
  question:
    "Which best practice helps ensure consistent parsing across a distributed Splunk environment?",
  options: [
    "Configure parsing only on search heads",
    "Use identical props.conf and transforms.conf on all parsing tiers",
    "Disable event breaking on indexers",
    "Rely on automatic sourcetyping"
  ],
  correct: ["Use identical props.conf and transforms.conf on all parsing tiers"],
  reason:
    "Consistent parsing requires identical configuration across all parsing components."
},
// =====================
// SPLK-2002 Q91 – Q100 (FINAL)
// =====================

{
  question:
    "Which configuration file controls how Splunk routes data to indexes?",
  options: [
    "inputs.conf",
    "outputs.conf",
    "props.conf",
    "transforms.conf"
  ],
  correct: ["transforms.conf"],
  reason:
    "transforms.conf is used with routing rules to send events to specific indexes."
},
{
  question:
    "Which Splunk component is responsible for breaking incoming data into events?",
  options: [
    "Search Head",
    "Indexer",
    "Universal Forwarder",
    "Deployment Server"
  ],
  correct: ["Indexer"],
  reason:
    "Indexers handle parsing, event breaking, and indexing."
},
{
  question:
    "Which index is used to store Splunk license usage data?",
  options: [
    "_internal",
    "_audit",
    "_license",
    "_introspection"
  ],
  correct: ["_license"],
  reason:
    "The _license index stores license usage and violation information."
},
{
  question:
    "Which configuration file defines how data is forwarded from a Heavy Forwarder?",
  options: [
    "inputs.conf",
    "outputs.conf",
    "props.conf",
    "deploymentclient.conf"
  ],
  correct: ["outputs.conf"],
  reason:
    "outputs.conf controls forwarding destinations for both Universal and Heavy Forwarders."
},
{
  question:
    "What happens when a Splunk license violation occurs?",
  options: [
    "Search is immediately disabled",
    "Indexing stops permanently",
    "Warnings are logged and search may be restricted after grace period",
    "The license resets automatically"
  ],
  correct: [
    "Warnings are logged and search may be restricted after grace period"
  ],
  reason:
    "Splunk allows a grace period before enforcing search restrictions."
},
{
  question:
    "Which best practice helps improve search performance in large environments?",
  options: [
    "Increase search factor",
    "Use summary indexing and data model acceleration",
    "Disable index replication",
    "Increase number of forwarders"
  ],
  correct: ["Use summary indexing and data model acceleration"],
  reason:
    "Precomputed results significantly reduce search load."
},
{
  question:
    "Which Splunk role allows full administrative access?",
  options: [
    "user",
    "power",
    "admin",
    "can_delete"
  ],
  correct: ["admin"],
  reason:
    "The admin role provides unrestricted access to Splunk configuration and management."
},
// {
//   question:
//     "Which command is used to check the status of a Splunk instance?",
//   options: [
//     "splunk check",
//     "splunk status",
//     "splunk health",
//     "splunk show"
//   ],
//   correct: ["splunk status"],
//   reason:
//     "splunk status shows whether the Splunk instance is running."
// },
{
  question:
    "A customer has a Splunk Enterprise deployment and wants to collect data from Universal Forwarders. What is the best step to secure log traffic?",
  options: [
    "Create signed SSL certificates and use them to encrypt data between the search heads and indexers",
    "Use the Splunk provided SSL certificates to encrypt data between the forwarders and indexers",
    "Ensure all forwarded traffic is routed through a web application firewall (WAF)",
    "Create signed SSL certificates and use them to encrypt data between the forwarders and indexers"
  ],
  correct: [
    "Create signed SSL certificates and use them to encrypt data between the forwarders and indexers"
  ],
  reason:
    "Universal Forwarders send data directly to indexers. Using signed SSL certificates ensures encrypted and authenticated log transport, which is the recommended best practice."
},
{
  question:
    "A customer creates a saved search that runs on a specific interval. Which internal Splunk log should be viewed to determine if the search ran recently?",
  options: [
    "kvstore.log",
    "scheduler.log",
    "metrics.log",
    "btool.log"
  ],
  correct: ["scheduler.log"],
  reason:
    "Scheduled searches are executed by the Splunk scheduler, and their execution details are recorded in scheduler.log."
},
// {
//   question:
//     "Which factor most directly affects index storage requirements?",
//   options: [
//     "Search concurrency",
//     "Replication factor",
//     "Number of users",
//     "Search head count"
//   ],
//   correct: ["Replication factor"],
//   reason:
//     "Replication factor determines how many copies of indexed data are stored."
// },

{
  question:
    "When troubleshooting a situation where some files within a directory are not being indexed, the ignored files are discovered to have long headers. What is the first thing that should be added to inputs.conf?",
  options: [
    "Add a crcSalt= attribute",
    "Increase the value of initCrcLength",
    "Decrease the value of initCrcLength",
    "Add a crcSalt= attribute"
  ],
  correct: ["Add a crcSalt= attribute"],
  reason:
    "For exam purposes, crcSalt is considered the first corrective action because it immediately prevents files from being ignored due to CRC collisions. Adjusting initCrcLength is typically a secondary tuning step."
}

// {
//   question:
//     "Which statement best describes the Universal Forwarder?",
//   options: [
//     "It parses and indexes data",
//     "It forwards data without parsing",
//     "It stores indexed data locally",
//     "It manages licenses"
//   ],
//   correct: ["It forwards data without parsing"],
//   reason:
//     "The Universal Forwarder is lightweight and only forwards data."
// }

  ]
}




async function seed() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to DB ✅");

    await Quiz.Quiz.deleteMany({ title: "T.O Analytics –- SPLK-2002 Practice Quiz" });
    await Quiz.Quiz.create(splk2002Topic1Quiz);

    console.log("T.O Analytics –- SPLK-2002 Practice Quiz🚀 inserted!");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

seed();

