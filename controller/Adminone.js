const mongoose = require("mongoose");
const Quiz = require("../model/quiz.js");

const MONGO_URI = "mongodb+srv://fpasamuelmayowa51:5iX35jgh9yB9P6Im@cluster0.unk3ntp.mongodb.net/datausers"; // Change to your DB URI

const splunkAdminQuiz = {
  title: "T.O Analytics Splunk Admin Exam Quiz",
  description: "Covers Splunk Administration, Deployment, and Configuration concepts.",
  questions: [
    {
      question: "What will the following inputs. conf stanza do? [script://myscript . sh]Interval=0",
      options: [
        "The script will run at the default interval of 60 seconds.",
        "The script will not be run.",
        "The script will be run only once for each time Splunk is rest arted.",
        "The script will be run. As soon as the script exits, Splunk r estarts it.",
      ],
      correct: ["The script will be run only once for each time Splunk is rest arted."],
    },
    {
      question: "A configuration file in a deployed app needs to be directly edi ted. Which steps would ensure a successful deployment to clients?",
      options: [
        "Make the change in $SPLUNK HOME/etc/dep10yment apps/$appName/ 10ca1/ on the deployment server, and the change will be automatically sent to the deploy ment clients.",
        "Make the change in $SPLUNK HOME /etc/apps/$appname/local/ on any of the deployment clients, and then run the command . / splunk reload deploy-server to push th at change to the deployment server.",
        "Make the change in $SPLUNK HOME/etc/dep10yment apps/$appName/ 10ca1/ on the deployment server, and then run $SPLUNK HOME/bin/sp1unk reload deploy--ser ver.",
        "Make the change in $SPLUNK HOME/etc/apps/$appName/defau1t on the deployment server, and it",
      ],
      correct: ["Make the change in $SPLUNK HOME/etc/dep10yment apps/$appName/ 10ca1/ on the deployment server, and then run $SPLUNK HOME/bin/sp1unk reload deploy--ser ver."],
    },
    {
      question: "Using the CLI on the forwarder, how could the current forwarder  to indexer configuration be viewed?",
      options: [
        "splunk btool server list --debug",
        "splunk list forward-indexer",
        "splunk list forward-server",
        "splunk btool indexes list --debug",
      ],
      correct: ["splunk list forward-server"],
    },
    {
      question: "Which of the following apply to how distributed search works? ( select all that apply)",
      options: [
        "The search head dispatches searches to the peers",
        "The search peers pull the data from the forwarders.",
        "Peers run searches in parallel and return their portion of re sults.",
        "The search head consolidates the individual results and prepa res reports",
      ], multi: true, // 👈 IMPORTANT
      correct: ["The search head dispatches searches to the peers", "Peers run searches in parallel and return their portion of re sults.", "The search head consolidates the individual results and prepa res reports"],
    },
    {
      question: "When running the command shown below, what is the default path in which deployment server. conf is created? splunk set deploy-poll deployServer:port",
      options: [
        "SFLUNK_HOME/etc/deployment",
        "SPLUNK_HOME/etc/system/local",
        "SPLUNK_HOME/etc/system/default",
        "SPLUNK_KOME/etc/apps/deployment",
      ],
      correct: ["SPLUNK_HOME/etc/system/default"],
    },
    {
      question: "What is a role in Splunk? (select all that apply)",
      options: [
        "A classification that determines what capabilities a user has .",
        "A classification that determines if a Splunk server can remotely control another Splunk server.",
        "A classification that determines what functions a Splunk server controls.",
        "A classification that determines what indexes a user can sear ch.",
      ], multi: true, // 👈 IMPORTANT
      correct: ["A classification that determines what capabilities a user has .", "A classification that determines what indexes a user can sear ch."],
    },
    {
      question: "Which of the following are required when defining an index in i ndexes. conf? (select all that apply)",
      options: [
        "coldPath",
        "homePath",
        "frozenPath",
        "thawedPath",
      ], multi: true, // 👈 IMPORTANT
      correct: ["coldPath", "homePath", "thawedPath"],
    },
    {
      question: "Which of the following statements describes how distributed sea rch works?",
      options: [
        "Forwarders pull data from the search peers.",
        "Search heads store a portion of the searchable data.",
        "The search head dispatches searches to the search peers.",
        "Search results are replicated within the indexer cluster.",
      ],
      correct: ["The search head dispatches searches to the search peers."],
    },
    {
      question: "Which of the following monitor inputs stanza headers would matc h all of the following files? /var/log/www1/secure.log/var/log/www/secure.l/var/log/www/logs/secure.logs/var/log/www2/secure.log",
      options: [
        "[monitor:///var/log/.../secure.*",
        "[monitor:///var/log/www1/secure.*]",
        "[monitor:///var/log/www1/secure.log]",
        "[monitor:///var/log/www*/secure.*]",
      ],
      correct: ["[monitor:///var/log/www1/secure.log]"],
    },
    {
      question: "Search heads in a company's European offices need to be able to  search data in their New York offices. They also need to restrict access to certain indexers. What sho uld be configured to allow this type of action?",
      options: [
        "Indexer clustering",
        "LDAP control",
        "Distributed search",
        "Search head clustering",
      ],
      correct: ["Distributed search"],
    },
    {
      question: "When indexing a data source, which fields are considered metada ta?",
      options: [
        "source, host, time",
        "time, sourcetype, source",
        "host, raw, sourcetype",
        "sourcetype, source, host",
      ],
      correct: ["sourcetype, source, host"],
    },
    {
      question: "This file has been manually created on a universal forwarder A new Splunk admin comes in and connects the universal forwarde rs to a deployment server and deploys the same app with a new Which file is now monitored?",
      options: [
        "/var/log/messages",
        "/var/log/maillog",
        "/var/log/maillog and /var/log/messages",
        "none of the above",
      ],
      correct: ["/var/log/maillog"],
    },
    {
      question: "An add-on has configured field aliases for source IP address an d destination IP address fields. A specific user prefers not to have those fields present in their user con text. Based on the defaultprops.confbelow, whichSPLUNK_HOME/etc/users/buttercup/myTA/local/props.confstanz a can be added to the user's local context to disable the field aliases?",
      options: [
        "Option A",
        "Option B",
        "Option C",
        "Option D",
      ],
      correct: ["Option B"],
    },
    {
      question: "What is the command to reset the fishbucket for one source?",
      options: [
        "rm -r ~/splunkforwarder/var/lib/splunk/fishbucket",
        "splunk clean eventdata -index _thefishbucket",
        "splunk cmd btprobe -d SPLUNK_HOME/var/lib/splunk/fishbucket/s plunk_private_db -- file <source> -- reset",
        "splunk btool fishbucket reset <source>",
      ],
      correct: ["splunk cmd btprobe -d SPLUNK_HOME/var/lib/splunk/fishbucket/s plunk_private_db -- file <source> -- reset"],
    },
    {
      question: "Which Splunk component would one use to perform line breaking p rior to indexing?",
      options: [
        "Heavy Forwarder",
        "Universal Forwarder",
        "Search head",
        "This can only be done at the indexing layer.",
      ],
      correct: ["Heavy Forwarder"],
    },
    {
      question: "The following stanza is active in indexes.conf: [cat_facts]maxHotSpanSecs = 3600frozenTimePeriodInSecs = 2630000maxTota1DataSizeMB = 650000All other related indexes.conf settings are default values.If the event timestamp was 3739283 seconds ago, will it be sear chable?",
      options: [
        "Yes, only if the bucket is still hot.",
        "No, because the index will have exceeded its maximum size.",
        "Yes, only if the index size is also below 650000 MB.",
        "No, because the event time is greater than the retention time .",
      ],
      correct: ["No, because the event time is greater than the retention time ."],
    },
    {
      question: "What is required when adding a native user to Splunk? (select a ll that apply)",
      options: [
        "Password",
        "Username",
        "Full Name",
        "Default app",
      ], multi: true, // 👈 IMPORTANT
      correct: ["Password", "Username"],
    },
    {
      question: "Which of the following are supported configuration methods to a dd inputs on a forwarder? (select all that apply)",
      options: [
        "CLI",
        "Edit inputs . conf",
        "Edit forwarder.conf",
        "Forwarder Management",
      ],
       multi: true, // 👈 IMPORTANT
      correct: ["CLI", "Edit inputs . conf", "Forwarder Management"],
    },
    {
      question: "Load balancing on a Universal Forwarder is not scaling correctl y. The forwarder's outputs. and the tcpout stanza are setup correctly. What else could be the cause of thi s scaling issue? (select all that apply)",
      options: [
        "The receiving port is not properly setup to listen on the rig ht port.",
        "The inputs . conf'S _SYSZOG_ROVTING is not setup to use the r ight group names.",
        "The DNS record used is not setup with a valid list of IP addr esses.",
        "The indexAndForward value is not set properly.",
      ],
      correct: ["The receiving port is not properly setup to listen on the rig ht port.", "The DNS record used is not setup with a valid list of IP addr esses."],
    },
    {
      question: "Which network input option provides durable file-system bufferi ng of data to mitigate data loss due to network outages and splunkd restarts?",
      options: [
        "diskQueueSize",
        "durableQueueSize",
        "persistentOueueSize",
        "queueSize",
      ],
      correct: ["persistentOueueSize"],
    },
    {
      question: "Which option on the Add Data menu is most useful for testing da ta ingestion without creating inputs.conf?",
      options: [
        "Upload option",
        "Forward option",
        "Monitor option",
        "Download option",
      ],
      correct: ["Upload option"],
    },
    {
      question: "Which of the following are available input methods when adding a file input in Splunk Web? (Choose all that apply.)",
      options: [
        "Index once.",
        "Monitor interval.",
        "On-demand monitor.",
        "Continuously monitor.",
      ], multi: true, // 👈 IMPORTANT
      correct: ["Index once.", "Continuously monitor."],
    },
    {
      question: "In which phase of the index time process does the license meter ing occur?",
      options: [
        "input phase",
        "Parsing phase",
        "Indexing phase",
        "Licensing phase",
      ],
      correct: ["Indexing phase"],
    },
    {
      question: "In a customer managed Splunk Enterprise environment, what is th e endpoint URI used to collect data?",
      options: [
        "services/ collector",
        "services/ inputs ? raw",
        "services/ data/ collector",
        "data/ collector",
      ],
      correct: ["services/ data/ collector"],
    },
    {
      question: "In inputs. conf, which stanza would mean Splunk was only readin g one local file?",
      options: [
        "[read://opt/log/crashlog/Jan27crash.txt]",
        "[monitor::/ opt/log/crashlog/Jan27crash.txt]",
        "[monitor:/// opt/log/]",
        "[monitor:/// opt/log/ crashlog/Jan27crash.txt]",
      ],
      correct: ["[monitor::/ opt/log/crashlog/Jan27crash.txt]"],
    },
    {
      question: "A Universal Forwarder has the following active stanza in inputs  . conf: [monitor: //var/log]disabled = Ohost = 460352847An event from this input has a timestamp of 10:55. What timezon e will Splunk add to the event as part of indexing?",
      options: [
        "Universal Coordinated Time.",
        "The timezone of the search head.",
        "The timezone of the indexer that indexed the event.",
        "The timezone of the forwarder.",
      ],
      correct: ["The timezone of the forwarder."],
    },
    {
      question: "Which parent directory contains the configuration files in Splu nk?",
      options: [
        "SSFLUNK_HOME/etc",
        "SSPLUNK_HOME/var",
        "SSPLUNK_HOME/conf",
        "SSPLUNK_HOME/default",
      ],
      correct: ["SSFLUNK_HOME/etc"],
    },
    {
      question: "In which scenario would a Splunk Administrator want to enable d ata integrity check when creating an index?",
      options: [
        "To ensure that hot buckets are still open for writes and have not been forced to roll to a cold state",
        "To ensure that configuration files have not been tampered wit h for auditing and/or legal purposes",
        "To ensure that user passwords have not been tampered with for auditing and/or legal purposes.",
        "To ensure that data has not been tampered with for auditing a nd/or legal purposes",
      ],
      correct: ["To ensure that data has not been tampered with for auditing a nd/or legal purposes"],
    },
    {
      question: "During search time, which directory of configuration files has the highest precedence?",
      options: [
        "$SFLUNK_KOME/etc/system/local",
        "$SPLUNK_KCME/etc/system/default",
        "$SPLUNK_HCME/etc/apps/app1/local",
        "$SPLUNK HCME/etc/users/admin/local",
      ],
      correct: ["$SPLUNK HCME/etc/users/admin/local"],
    },
    {
      question: "A Universal Forwarder is collecting two separate sources of dat a (A,B). Source A is being routed through a Heavy Forwarder and then to an indexer. Source B is being route d directly to the indexer. Both sets of data require the masking of raw text strings before being written to  disk. What does the administrator need to do to ensure that the masking takes place successfully?",
      options: [
        "Make sure that props . conf and transforms . conf are both pr esent on the in-dexer and the search head.",
        "For source A, make sure that props . conf is in place on the indexer; and for source B, make sure transforms . conf is present on the Heavy Forwarder.",
        "Make sure that props . conf and transforms . conf are both pr esent on the Universal Forwarder.",
        "Place both props . conf and transforms . conf on the Heavy Fo rwarder for source A, and place both",
      ],
      correct: ["Place both props . conf and transforms . conf on the Heavy Fo rwarder for source A, and place both"],
    },
    {
      question: "When using a directory monitor input, specific source types can  be selectively overridden using which configuration file?",
      options: [
        "sourcetypes . conf",
        "trans forms . conf",
        "outputs . conf",
        "props . conf",
      ],
      correct: ["props . conf"],
    },
    {
      question: "In a distributed environment, which Splunk component is used to  distribute apps and configurations to the other Splunk instances?",
      options: [
        "Indexer",
        "Deployer",
        "Forwarder",
        "Deployment server",
      ],
      correct: ["Deployment server"],
    },
    {
      question: "Which of the following are supported options when configuring o ptional network inputs?",
      options: [
        "Metadata override, sender filtering options, network input qu eues (quantum queues)",
        "Metadata override, sender filtering options, network input qu eues (memory/persistent queues)",
        "Filename override, sender filtering options, network output q ueues (memory/persistent queues)",
        "Metadata override, receiver filtering options, network input queues (memory/persistent queues)",
      ],
      correct: ["Metadata override, sender filtering options, network input qu eues (memory/persistent queues)"],
    },
    {
      question: "Which Splunk component performs indexing and responds to search  requests from the search head?",
      options: [
        "Forwarder",
        "Search peer",
        "License master",
        "Search head cluster",
      ],
      correct: ["Search peer"],
    },
    {
      question: "When using license pools, volume allocations apply to which Spl unk components?",
      options: [
        "Indexers",
        "Indexes",
        "Heavy Forwarders",
        "Search Heads",
      ],
      correct: ["Indexers"],
    },
    {
      question: "Which forwarder is recommended by Splunk to use in a production  environment?",
      options: [
        "Heavy forwarder",
        "SSL forwarder",
        "Lightweight forwarder",
        "Universal forwarder",
      ],
      correct: ["Universal forwarder"],
    },
    {
      question: "After configuring a universal forwarder to communicate with an indexer, which index can be checked via the Splunk Web UI for a successful connection?",
      options: [
        "index=main",
        "index=test",
        "index=summary",
        "index=_internal",
      ],
      correct: ["index=_internal"],
    },
    {
      question: "Which of the following are methods for adding inputs in Splunk?  (select all that apply)",
      options: [
        "CLI",
        "Splunk Web",
        "Editing inputs. conf",
        "Editing monitor. con f",
      ], multi: true, // 👈 IMPORTANT
      correct: ["CLI", "Splunk Web", "Editing inputs. conf"],
    },
    {
      question: "The following stanzas in inputs. conf are currently being used by a deployment client: [udp: //145.175.118.177:1001Connection_host = dnssourcetype = syslogWhich of the following statements is true of data that is recei ved via this input?",
      options: [
        "If Splunk is restarted, data will be queued and then sent whe n Splunk has restarted.",
        "Local firewall ports do not need to be opened on the deployme nt client since the port is defined in inputs.conf.",
        "The host value associated with data received will be the IP a ddress that sent the data.",
        "If Splunk is restarted, data may be lost.",
      ],
      correct: ["If Splunk is restarted, data may be lost."],
    },
    {
      question: "In addition to single, non-clustered Splunk instances, what els e can the deployment server push apps to?",
      options: [
        "Universal forwarders",
        "Splunk Cloud",
        "Linux package managers",
        "Windows using WMI",
      ],
      correct: ["Universal forwarders"],
    },
    {
      question: "Which Splunk forwarder has a built-in license?",
      options: [
        "Light forwarder",
        "Heavy forwarder",
        "Universal forwarder",
        "Cloud forwarder",
      ],
      correct: ["Universal forwarder"],
    },
    {
      question: "How is a remote monitor input distributed to forwarders?",
      options: [
        "As an app.",
        "As a forward.conf file.",
        "As a monitor.conf file.",
        "As a forwarder monitor profile.",
      ],
      correct: ["As an app."],
    },
    {
      question: "Windows can prevent a Splunk forwarder from reading open files.  If files need to be read while they are being written to, what type of input stanza needs to be created ?",
      options: [
        "Tail Reader",
        "Upload",
        "MonitorNoHandIe",
        "Monitor",
      ],
      correct: ["MonitorNoHandIe"],
    },
    {
      question: "Which of the following is accurate regarding the input phase?",
      options: [
        "Breaks data into events with timestamps.",
        "Applies event-level transformations.",
        "Fine-tunes metadata.",
        "Performs character encoding.",
      ],
      correct: ["Performs character encoding."],
    },
    {
      question: "How do you remove missing forwarders from the Monitoring Consol e?",
      options: [
        "By restarting Splunk.",
        "By rescanning active forwarders.",
        "By reloading the deployment server.",
        "By rebuilding the forwarder asset table.",
      ],
      correct: ["By rebuilding the forwarder asset table."],
    },
    {
      question: "In which phase do indexed extractions in props.conf occur?",
      options: [
        "Inputs phase",
        "Parsing phase",
        "Indexing phase",
        "Searching phase",
      ],
      correct: ["Parsing phase"],
    },
    {
      question: "Which feature in Splunk allows Event Breaking, Timestamp extrac tions, and any advanced configurations found in props.conf to be validated all through the UI?",
      options: [
        "Apps",
        "Search",
        "Data preview",
        "Forwarder inputs",
      ],
      correct: ["Data preview"],
    },
    {
      question: "What type of data is counted against the Enterprise license at a fixed 150 bytes per event?",
      options: [
        "License data",
        "Metricsdata",
        "Internal Splunk data",
        "Internal Windows logs",
      ],
      correct: ["Metricsdata"],
    },
    {
      question: "What is the valid option for a [monitor] stanza in inputs.conf?",
      options: [
        "enabled",
        "datasource",
        "server_name",
        "ignoreOlderThan",
      ],
      correct: ["ignoreOlderThan"],
    },
    {
      question: "Which Splunk configuration file is used to enable data integrit y checking?",
      options: [
        "props.conf",
        "global.conf",
        "indexes.conf",
        "data_integrity.conf",
      ],
      correct: ["indexes.conf"],
    },
    {
      question: "Which setting in indexes. conf allows data retention to be cont rolled by time?",
      options: [
        "maxDaysToKeep",
        "moveToFrozenAfter",
        "maxDataRetentionTime",
        "frozenTimePeriodlnSecs",
      ],
      correct: ["frozenTimePeriodlnSecs"],
    },
    {
      question: "When deploying apps on Universal Forwarders using the deploymen t server, what is the correct component and location of the app before it is deployed?",
      options: [
        "On Universal Forwarder, $SPLUNK_HOME/etc/apps",
        "On Deployment Server, $SPLUNK_HOME/etc/apps",
        "On Deployment Server, $SPLUNK_HOME/etc/deployment-apps",
        "On Universal Forwarder, $SPLUNK_HOME/etc/deployment-apps",
      ],
      correct: ["On Deployment Server, $SPLUNK_HOME/etc/deployment-apps"],
    },
    {
      question: "When should the Data Preview feature be used?",
      options: [
        "When extracting fields for ingested data.",
        "When previewing the data before searching.",
        "When reviewing data on the source host.",
        "When validating the parsing of data.",
      ],
      correct: ["When validating the parsing of data."],
    },
    {
      question: "Assume a file is being monitored and the data was incorrectly i ndexed to an exclusive index. The index is cleaned and now the data must be reindexed. What other index mu st be cleaned to reset the input checkpoint information for that file?",
      options: [
        "_audit",
        "_checkpoint",
        "_introspection",
        "_thefishbucket",
      ],
      correct: ["_thefishbucket"],
    },
    {
      question: "The priority of layered Splunk configuration files depends on t he file's:",
      options: [
        "Owner",
        "Weight",
        "Context",
        "Creation time",
      ],
      correct: ["Context"],
    },
    {
      question: "Syslog files are being monitored on a Heavy Forwarder. Where wo uld the appropriate TRANSFORMS setting be deployed to reroute logs based on the event message?",
      options: [
        "Heavy Forwarder",
        "Indexer",
        "Search head",
        "Deployment server",
      ],
      correct: ["Heavy Forwarder"],
    },
    {
      question: "What happens when the same username exists in Splunk as well as  through LDAP?",
      options: [
        "Splunk user is automatically deleted from authentication.conf .",
        "LDAP settings take precedence.",
        "Splunk settings take precedence.",
        "LDAP user is automatically deleted from authentication.conf",
      ],
      correct: ["Splunk settings take precedence."],
    },
    {
      question: "Which configuration file would be used to forward the Splunk in ternal logs from a search head to the indexer?",
      options: [
        "props.conf",
        "inputs.conf",
        "outputs.conf",
        "collections.conf",
      ],
      correct: ["outputs.conf"],
    },
    {
      question: "The CLI command splunk add forward-server indexer:<receiving-po rt> will create stanza(s) in which configuration file?",
      options: [
        "inputs.conf",
        "indexes.conf",
        "outputs.conf",
        "servers.conf",
      ],
      correct: ["outputs.conf"],
    },
    {
      question: "Where are license files stored?",
      options: [
        "$SPLUNK_HOME/etc/secure",
        "$SPLUNK_HOME/etc/system",
        "$SPLUNK_HOME/etc/licenses",
        "$SPLUNK_HOME/etc/apps/licenses",
      ],
      correct: ["$SPLUNK_HOME/etc/licenses"],
    },
    {
      question: "Running this search in a distributed environment: On what Splunk component does the eval command get executed?",
      options: [
        "Heavy Forwarders",
        "Universal Forwarders",
        "Search peers",
        "Search heads",
      ],
      correct: ["Search peers"],
    },
    {
      question: "Which Splunk component consolidates the individual results and prepares reports in a distributed environment?",
      options: [
        "Indexers",
        "Forwarder",
        "Search head",
        "Search peers",
      ],
      correct: ["Search head"],
    },
    {
      question: "Which layers are involved in Splunk configuration file layering? (select all that apply)",
      options: [
        "App context",
        "User context",
        "Global context",
        "Forwarder context",
      ], multi: true, // 👈 IMPORTANT
      correct: ["App context", "User context", "Global context"],
    },
    {
      question: "Which data pipeline phase is the last opportunity for defining event boundaries?",
      options: [
        "Input phase",
        "Indexing phase",
        "Parsing phase",
        "Search phase",
      ],
      correct: ["Parsing phase"],
    },
    {
      question: "Which of the following is an appropriate description of a deplo yment server in a non-cluster environment?",
      options: [
        "Allows management of local Splunk instances, requires Enterpr ise license, handles job of sending configurations packaged as apps. can automatically restart remo te Splunk instances.",
        "Allows management of remote Splunk instances, requires Enterp rise license, handles job of sending configurations, can automatically restart remote Splunk instanc es.",
        "Allows management of remote Splunk instances, requires no lic ense, handles job of sending configurations, can automatically restart remote Splunk instanc es.",
        "Allows management of remote Splunk instances, requires Enterp rise license, handles job of sending",
      ],
      correct: ["Allows management of remote Splunk instances, requires Enterp rise license, handles job of sending configurations, can automatically restart remote Splunk instanc es."],
    },
    {
      question: "A Splunk administrator has been tasked with developing a retent ion strategy to have frequently accessed data sets on SSD storage and to have older, less frequently acc essed data on slower NAS storage. They have set a mount point for the NAS. Which parameter do they nee d to modify to set the path for the older, less frequently accessed data in indexes.conf?",
      options: [
        "homepath",
        "thawedPath",
        "summaryHomePath",
        "colddeath",
      ],
      correct: ["colddeath"],
    },
    {
      question: "All search-time field extractions should be specified on which Splunk component?",
      options: [
        "Deployment server",
        "Universal forwarder",
        "Indexer",
        "Search head",
      ],
      correct: ["Search head"],
    },
    {
      question: "Consider the following stanza ininputs.conf: What will the value of the source filed be for events generated  by this scripts input?",
      options: [
        "/opt/splunk/ecc/apps/search/bin/liscer.sh",
        "unknown",
        "liscer",
        "liscer.sh",
      ],
      correct: ["/opt/splunk/ecc/apps/search/bin/liscer.sh"],
    },
    {
      question: "UsingSEDCMDinprops.confallows raw data to be modified. With the  given event below, which option will mask the first three digits of theAcctIDfield resulting output: [22/Oct/2018:15:50:21] VendorID=1234 Code=B AcctID=xxx5309 Event: [22/Oct/2018:15:50:21] VendorID=1234 Code=B AcctID=xxx5309",
      options: [
        "SEDCMD-1acct = s/VendorID=\\d{3}(\\d{4})/VendorID=xxx/g",
        "SEDCMD-xxxAcct = s/AcctID=\\d{3}(\\d{4})/AcctID=xxx/g",
        "SEDCMD-1acct = s/AcctID=\\d{3}(\\d{4})/AcctID=\\1xxx/g",
        "SEDCMD-1acct = s/AcctID=\\d{3}(\\d{4})/AcctID=xxx\\1/g",
      ],
      correct: ["SEDCMD-1acct = s/AcctID=\\d{3}(\\d{4})/AcctID=xxx\\1/g"],
    },
    {
      question: "Local user accounts created in Splunk store passwords in which file?",
      options: [
        "$ SFLUNK_HOME/etc/passwd",
        "$ SFLUNK_HOME/etc/authentication",
        "$ S?LUNK_HOME/etc/users/passwd.conf",
        "$ SPLUNK HOME/etc/users/authentication.conf",
      ],
      correct: ["$ SFLUNK_HOME/etc/passwd"],
    },
    {
      question: "When configuring HTTP Event Collector (HEC) input, how would on e ensure the events have been indexed?",
      options: [
        "Enable indexer acknowledgment.",
        "Enable forwarder acknowledgment.",
        "splunk check-integrity -index <index name>",
        "index=_internal component=ACK | stats count by host",
      ],
      correct: ["Enable indexer acknowledgment."],
    },
    {
      question: "When Splunk is integrated with LDAP, which attribute can be cha nged in the Splunk UI for an LDAP user?",
      options: [
        "Default app",
        "LDAP group",
        "Password",
        "Username",
      ],
      correct: ["Default app"],
    },
    {
      question: "You update a props. conf file while Splunk is running. You do n ot restart Splunk and you run this command: splunk btoo1 props list --debug. What will the output be?",
      options: [
        "list of all the configurations on-disk that Splunk contains.",
        "A verbose list of all configurations as they were when splunk d started.",
        "A list of props. conf configurations as they are on-disk alon g with a file path from which the configuration is located",
        "A list of the current running props, conf configurations alon g with a file path from which the",
      ],
      correct: ["A list of props. conf configurations as they are on-disk alon g with a file path from which the configuration is located"],
    },
    {
      question: "How can native authentication be disabled in Splunk?",
      options: [
        "Remove the $SPLUNK_HOME/etc/passwd file",
        "Create an empty $SPLUNK_HOME/etc/passwd file",
        "Set SPLUNK_AUTHENTICATION=false in splunk-launch.conf",
        "Set nativeAuthentication=false in authentication.conf",
      ],
      correct: ["Create an empty $SPLUNK_HOME/etc/passwd file"],
    },
    {
      question: "After how many warnings within a rolling 30-day period will a l icense violation occur with an enforced Enterprise license?",
      options: [
        "1",
        "3",
        "4",
        "5",
      ],
      correct: ["5"],
    },
    {
      question: "Which authentication methods are natively supported within Splunk Enterprise? (select all that apply)",
      options: [
        "LDAP",
        "SAML",
        "RADIUS",
        "Duo Multifactor Authentication",
      ], multi: true, // 👈 IMPORTANT
      correct: ["LDAP", "SAML", "RADIUS"],
    },
    {
      question: "A user recently installed an application to index NCINX access logs. After configuring the application, they realize that no data is being ingested. Which configuration file do they need to edit to ingest the accesslogs to ensure it remains unaffected after upgrade?",
      options: [
        "Option A",
        "Option B",
        "Option C",
        "Option D",
      ],
      correct: ["Option A"],
    },
    {
      question: "When working with an indexer cluster, what changes with the glo bal precedence when comparing to a standalone deployment?",
      options: [
        "Nothing changes.",
        "The peer-apps local directory becomes the highest priority.",
        "The app local directories move to second in the priority list .",
        "The system default directory' becomes the highest priority.",
      ],
      correct: ["The app local directories move to second in the priority list ."],
    },
    {
      question: "Which of the following applies only to Splunk index data integr ity check?",
      options: [
        "Lookup table",
        "Summary Index",
        "Raw data in the index",
        "Data model acceleration",
      ],
      correct: ["Raw data in the index"],
    },
    {
      question: "Which Splunk component(s) would break a stream of syslog inputs  into individual events? (select all that apply)",
      options: [
        "Universal Forwarder",
        "Search head",
        "Heavy Forwarder",
        "Indexer",
      ], multi: true, // 👈 IMPORTANT
      correct: ["Heavy Forwarder", "Indexer"],
    },
    {
      question: "Who provides the Application Secret, Integration, and Secret ke ys, as well as the API Hostname when setting up Duo for Multi-Factor Authentication in Splunk Enterp rise?",
      options: [
        "Duo Administrator",
        "LDAP Administrator",
        "SAML Administrator",
        "Trio Administrator",
      ],
      correct: ["Duo Administrator"],
    },
    {
      question: "Which of the following Splunk components require a separate ins tallation package?",
      options: [
        "Deployment server",
        "License master",
        "Universal forwarder",
        "Heavy forwarder",
      ],
      correct: ["Universal forwarder"],
    },
    {
      question: "A non-clustered Splunk environment has three indexers (A,B,C) a nd two search heads (X, Y). During a search executed on search head X, indexer A crashes. What is Sp lunk's response?",
      options: [
        "Update the user in Splunk web informing them that the results of their search may be incomplete.",
        "Repeat the search request on indexer B without informing the user.",
        "Update the user in Splunk web that their results may be incom ple and that Splunk will try to re-execute the search.",
        "Inform the user in Splunk web that their results may be incom plete and have them attempt the search",
      ],
      correct: ["Update the user in Splunk web informing them that the results of their search may be incomplete."],
    },
    {
      question: "Which is a valid stanza for a network input?",
      options: [
        "[udp://172.16.10.1:9997] connection = dnssourcetype = dns",
        "[any://172.16.10.1:10001] connection_host = ipsourcetype = web",
        "[tcp://172.16.10.1:9997] connection_host = websourcetype = web",
        "[tcp://172.16.10.1:10001]",
      ],
      correct: ["[tcp://172.16.10.1:10001]"],
    },
    {
      question: "Which additional component is required for a search head cluste r?",
      options: [
        "Deployer",
        "Cluster Master",
        "Monitoring Console",
        "Management Console",
      ],
      correct: ["Deployer"],
    },
    {
      question: "What event-processing pipelines are used to process data for in dexing? (select all that apply)",
      options: [
        "Typing pipeline",
        "Parsing pipeline",
        "fifo pipeline",
        "Indexing pipeline",
      ], multi: true, // 👈 IMPORTANT
      correct: ["Parsing pipeline", "Indexing pipeline"],
    },
    {
      question: "Where are deployment server apps mapped to clients?",
      options: [
        "Apps tab in forwarder management interface or clientapps.conf .",
        "Clients tab in forwarder management interface or deploymentcl ient.conf.",
        "Server Classes tab in forwarder management interface or serve rclass.conf.",
        "Client Applications tab in forwarder management interface or clientapps.conf.",
      ],
      correct: ["Server Classes tab in forwarder management interface or serve rclass.conf."],
    },
    {
      question: "Which of the following accurately describes HTTP Event Collecto r indexer acknowledgement?",
      options: [
        "It requires a separate channel provided by the client.",
        "It is configured the same as indexer acknowledgement used to protect in-flight data.",
        "It can be enabled at the global setting level.",
        "It stores status information on the Splunk server.",
      ],
      correct: ["It requires a separate channel provided by the client."],
    },
    {
      question: "Which Splunk indexer operating system platform is supported whe n sending logs from a Windows universal forwarder?",
      options: [
        "Any OS platform",
        "Linux platform only",
        "Windows platform only.",
        "None of the above.",
      ],
      correct: ["Any OS platform"],
    },
    {
      question: "When using a directory monitor input, specific source type can be selectively overridden using which configuration file?",
      options: [
        "props.conf",
        "sourcetypes.conf",
        "transforms.conf",
        "outputs.conf",
      ],
      correct: ["props.conf"],
    },
    {
      question: "Which of the following authentication types requires scripting in Splunk?",
      options: [
        "ADFS",
        "LDAP",
        "SAML",
        "RADIUS",
      ],
      correct: ["RADIUS"],
    },
    {
      question: "Which of the following statements accurately describes using SS L to secure the feed from a forwarder?",
      options: [
        "It does not encrypt the certificate password.",
        "SSL automatically compresses the feed by default.",
        "It requires that the forwarder be set to compressed=true.",
        "It requires that the receiver be set to compression=true.",
      ],
      correct: ["It does not encrypt the certificate password."],
    },
    {
      question: "Which setting allows the configuration of Splunk to allow event s to span over more than one line?",
      options: [
        "SHOULD_LINEMERGE = true",
        "BREAK_ONLY_BEFORE_DATE = true",
        "BREAK_ONLY_BEFORE = <REGEX pattern>",
        "SHOULD_LINEMERGE = false",
      ],
      correct: ["SHOULD_LINEMERGE = true"],
    },
    {
      question: "Which of the following statements describe deployment managemen t? (select all that apply)",
      options: [
        "Requires an Enterprise license",
        "Is responsible for sending apps to forwarders.",
        "Once used, is the only way to manage forwarders",
        "Can automatically restart the host OS running the forwarder.",
      ], multi: true, // 👈 IMPORTANT
      correct: ["Requires an Enterprise license", "Is responsible for sending apps to forwarders."],
    },
    {
      question: "What hardware attribute would need to be changed to increase th e number of simultaneous searches (ad- hoc and scheduled) on a single search head?",
      options: [
        "Disk",
        "CPUs",
        "Memory",
        "Network interface cards",
      ],
      correct: ["CPUs"],
    },
    {
      question: "Which of the following are reasons to create separate indexes? (Choose all that apply.)",
      options: [
        "Different retention times.",
        "Increase number of users.",
        "Restrict user permissions.",
        "File organization.",
      ], multi: true, // 👈 IMPORTANT
      correct: ["Different retention times.", "Restrict user permissions."],
    },
    {
      question: "What are the required stanza attributes when configuring the tr ansforms. conf to manipulate or remove events?",
      options: [
        "REGEX, DEST. FORMAT",
        "REGEX.SRC_KEY, FORMAT",
        "REGEX, DEST_KEY, FORMAT",
        "REGEX, DEST_KEY FORMATTING",
      ],
      correct: ["REGEX, DEST_KEY, FORMAT"],
    },
    {
      question: "Which optional configuration setting in inputs .conf allows you  to selectively forward the data to specific indexer(s)?",
      options: [
        "_TCP_ROUTING",
        "_INDEXER_LIST",
        "_INDEXER_GROUP",
        "_INDEXER ROUTING",
      ],
      correct: ["_TCP_ROUTING"],
    },
    {
      question: "When does a warm bucket roll over to a cold bucket?",
      options: [
        "When Splunk is restarted.",
        "When the maximum warm bucket age has been reached.",
        "When the maximum warm bucket size has been reached.",
        "When the maximum number of warm buckets is reached.",
      ],
      correct: ["When the maximum number of warm buckets is reached."],
    },
    {
      question: "The volume of data from collecting log files from 50 Linux serv ers and 200 Windows servers will require multiple indexers. Following best practices, which types of Spl unk component instances are needed?",
      options: [
        "Indexers, search head, universal forwarders, license master",
        "Indexers, search head, deployment server, universal forwarder s",
        "Indexers, search head, deployment server, license master, uni versal forwarder",
        "Indexers, search head, deployment server, license master, uni versal forwarder, heavy forwarder",
      ],
      correct: ["Indexers, search head, deployment server, license master, uni versal forwarder"],
    },
    {
      question: "Which of the following statements apply to directory inputs? {s elect all that apply)",
      options: [
        "All discovered text files are consumed.",
        "Compressed files are ignored by default",
        "Splunk recursively traverses through the directory structure.",
        "When adding new log files to a monitored directory, the forwa rder must be restarted to take them into",
      ], multi: true, // 👈 IMPORTANT
      correct: ["All discovered text files are consumed.", "Splunk recursively traverses through the directory structure."],
    },
    {
      question: "Where can scripts for scripted inputs reside on the host file s ystem? (select all that apply)",
      options: [
        "$SFLUNK_HOME/bin/scripts",
        "$SPLUNK_HOME/etc/apps/bin",
        "$SPLUNK_HOME/etc/system/bin",
        "$S?LUNK_HOME/etc/apps/<your_app>/bin_",
      ], multi: true, // 👈 IMPORTANT
      correct: ["$SFLUNK_HOME/bin/scripts", "$SPLUNK_HOME/etc/system/bin", "$S?LUNK_HOME/etc/apps/<your_app>/bin_"],
    },
    {
      question: "Within props. conf, which stanzas are valid for data modificati on? (select all that apply)",
      options: [
        "Host",
        "Server",
        "Source",
        "Sourcetype",
      ], multi: true, // 👈 IMPORTANT
      correct: ["Host", "Source", "Sourcetype"],
    },
    {
      question: "What are the minimum required settings when creating a network input in Splunk?",
      options: [
        "Protocol, port number",
        "Protocol, port, location",
        "Protocol, username, port",
        "Protocol, IP. port number",
      ],
      correct: ["Protocol, port number"],
    },
    {
      question: "Which of the methods listed below supports muti-factor authenti cation?",
      options: [
        "Lightweight Directory Access Protocol (LDAP)",
        "Security Assertion Markup Language (SAML)",
        "Single Sign-on (SSO)",
        "OpenlD",
      ],
      correct: ["Security Assertion Markup Language (SAML)"],
    },
    {
      question: "An organization wants to collect Windows performance data from a set of clients, however, installing Splunk software on these clients is not allowed. What option is  available to collect this data in Splunk Enterprise?",
      options: [
        "Use Local Windows host monitoring.",
        "Use Windows Remote Inputs with WMI.",
        "Use Local Windows network monitoring.",
        "Use an index with an Index Data Type of Metrics.",
      ],
      correct: ["Use Windows Remote Inputs with WMI."],
    },
    {
      question: "User role inheritance allows what to be inherited from the pare nt role? (select all that apply)",
      options: [
        "Parents",
        "Capabilities",
        "Index access",
        "Search history",
      ],
       multi: true, // 👈 IMPORTANT
      correct: ["Capabilities", "Index access"],
    },
    {
      question: "A log file contains 193 days worth of timestamped events. Which  monitor stanza would be used to collect data 45 days old and newer from that log file?",
      options: [
        "followTail = -45d",
        "ignore = 45d",
        "includeNewerThan = -35d",
        "ignoreOlderThan = 45d",
      ],
      correct: ["ignoreOlderThan = 45d"],
    },
    {
      question: "Which Splunk forwarder type allows parsing of data before forwa rding to an indexer?",
      options: [
        "Universal forwarder",
        "Parsing forwarder",
        "Heavy forwarder",
        "Advanced forwarder",
      ],
      correct: ["Heavy forwarder"],
    },
    {
      question: "How often does Splunk recheck the LDAP server?",
      options: [
        "Every 5 minutes",
        "Each time a user logs in",
        "Each time Splunk is restarted",
        "Varies based on LDAP_refresh setting.",
      ],
      correct: ["Each time a user logs in"],
    },
    {
      question: "Which of the following methods will connect a deployment client  to a deployment server? (select all that apply)",
      options: [
        "Run $SPLUNK_ROME/bin/ splunk set deploy-poll : from the command line of the deployment client.",
        "Create and edit a deploymentserver . conf file in SSPLVNE{ on the deployment server.",
        "Create and edit a deploymentclient . conf file in SSPLTJNE( EOME/etc/ system/local on the deployment client.",
        "Run $SPLUNK ROME/bin/spiunk set deploy-poi i : from the command line of the deployment server.",
      ],
       multi: true, // 👈 IMPORTANT
      correct: ["Run $SPLUNK_ROME/bin/ splunk set deploy-poll : from the command line of the deployment client.", "Create and edit a deploymentclient . conf file in SSPLTJNE( EOME/etc/ system/local on the deployment client."],
    },
    {
      question: "When are knowledge bundles distributed to search peers?",
      options: [
        "After a user logs in.",
        "When Splunk is restarted.",
        "When adding a new search peer.",
        "When a distributed search is initiated.",
      ],
      correct: ["When a distributed search is initiated."],
    },
    {
      question: "What is the difference between the two wildcards ... and - for the monitor stanza in inputs, conf?",
      options: [
        "... is not supported in monitor stanzas",
        "There is no difference, they are interchangable and match anything beyond directory boundaries.",
        "* matches anything in that specific directory path segment, whereas ... recurses through subdirectories as well.",
        "... matches anything in that specific directory path segment, whereas - recurses through subdirectories",
      ],
      correct: ["* matches anything in that specific directory path segment, whereas ... recurses through subdirectories as well."],
    },
    {
      question: "A company moves to a distributed architecture to meet the growing demand for the use of Splunk. What parameter can be configured to enable automatic load balancing in the Universal Forwarder to send data to the indexers?",
      options: [
        "Create one outputs . conf file for each of the server addresses in the indexing tier.",
        "Configure the outputs . conf file to point to any server in the indexing tier and Splunk will configure the data to be sent to all of the indexers.",
        "Splunk does not do load balancing and requires a hardware load balancer to balance traffic across the indexers.",
        "Set the stanza to have a server value equal to a comma-separated list of IP addresses and indexer",
      ],
      correct: ["Set the stanza to have a server value equal to a comma-separated list of IP addresses and indexer"],
    },
    {
      question: "Which default Splunk role could be assigned to provide users with the following capabilities? Create saved searchesEdit shared objects and alertsNot allowed to create custom roles",
      options: [
        "admin",
        "power",
        "user",
        "splunk-system-role",
      ],
      correct: ["power"],
    },
    {
      question: "What is the correct order of steps in Duo Multifactor Authentication?",
      options: [
        "1 Request Login 2. Connect to SAML server 3 Duo MFA 4 Create User session5 Authentication Granted 6. Log into Splunk",
        "1. Request Login 2 Duo MFA 3. Authentication Granted 4 Connect to SAML server5. Log into Splunk6. Create User session",
        "1 Request Login 2 Check authentication / group mapping3 Authentication Granted4. Duo MFA5. Create User session6. Log into Splun k",
        "1 Request Login 2 Duo MFA",
      ],
      correct: ["1 Request Login 2 Check authentication / group mapping3 Authentication Granted4. Duo MFA5. Create User session6. Log into Splun k"],
    },
    {
      question: "When deploying apps, which attribute in the forwarder managemen t interface determines the apps that clients install?",
      options: [
        "App Class",
        "Client Class",
        "Server Class",
        "Forwarder Class",
      ],
      correct: ["Server Class"],
    },
    {
      question: "Which artifact is required in the request header when creating an HTTP event?",
      options: [
        "ackID",
        "Token",
        "Manifest",
        "Host name",
      ],
      correct: ["Token"],
    },
    {
      question: "An index stores its data in buckets. Which default directories does Splunk use to store buckets? (Choose all that apply.)",
      options: [
        "bucketdb",
        "frozendb",
        "colddb",
        "db",
      ],
       multi: true, // 👈 IMPORTANT
      correct: ["colddb", "db"],
    },
    {
      question: "Which file will be matched for the following monitor stanza in inputs. conf? [monitor: ///var/log/*/bar/*. txt]",
      options: [
        "/var/log/host_460352847/temp/bar/file/csv/foo.txt",
        "/var/log/host_460352847/bar/foo.txt",
        "/var/log/host_460352847/bar/file/foo.txt",
        "/var/ log/ host_460352847/temp/bar/file/foo.txt",
      ],
      correct: ["/var/log/host_460352847/bar/file/foo.txt"],
    },
    {
      question: "If an update is made to an attribute in inputs.conf on a univer sal forwarder, on which Splunk component would the fishbucket need to be reset in order to reindex the d ata?",
      options: [
        "Indexer",
        "Forwarder",
        "Search head",
        "Deployment server",
      ],
      correct: ["Indexer"],
    },
    {
      question: "To set up a Network input in Splunk, what needs to be specified '?",
      options: [
        "File path.",
        "Username and password",
        "Network protocol and port number.",
        "Network protocol and MAC address.",
      ],
      correct: ["Network protocol and port number."],
    },
    {
      question: "In which Splunk configuration is the SEDCMD used?",
      options: [
        "props, conf",
        "inputs.conf",
        "indexes.conf",
        "transforms.conf",
      ],
      correct: ["props, conf"],
    },
    {
      question: "Which of the following is valid distribute search group?",
      options: [
        "Option A",
        "Option B",
        "Option C",
        "Option D",
      ],
      correct: ["Option D"],
    },
    {
      question: "Which of the following must be done to define user permissions when integrating Splunk with LDAP?",
      options: [
        "Map Users",
        "Map Groups",
        "Map LDAP Inheritance",
        "Map LDAP to Active Directory",
      ],
      correct: ["Map Groups"],
    },
    {
      question: "When configuring monitor inputs with whitelists or blacklists, what is the supported method of filtering the lists?",
      options: [
        "Slash notation",
        "Regular expression",
        "Irregular expression",
        "Wildcard-only expression",
      ],
      correct: ["Regular expression"],
    },
    {
      question: "What event-processing pipelines are used to process data for in dexing? (select all that apply)",
      options: [
        "fifo pipeline",
        "Indexing pipeline",
        "Parsing pipeline",
        "Typing pipeline",
      ],
       multi: true, // 👈 IMPORTANT
      correct: ["Indexing pipeline", "Parsing pipeline"],
    },
    {
      question: "The universal forwarder has which capabilities when sending dat a? (select all that apply)",
      options: [
        "Sending alerts",
        "Compressing data",
        "Obfuscating/hiding data",
        "Indexer acknowledgement",
      ],
       multi: true, // 👈 IMPORTANT
      correct: ["Compressing data", "Indexer acknowledgement"],
    },
    {
      question: "What is the name of the object that stores events inside of an index?",
      options: [
        "Container",
        "Bucket",
        "Data layer",
        "Indexer",
      ],
      correct: ["Bucket"],
    },
    {
      question: "Which of the following is a valid distributed search group?",
      options: [
        "[distributedSearch:Paris] default = false servers = server1, server2",
        "[searchGroup:Paris] default = false servers = server1:8089, s erver2:8089",
        "[searchGroup:Paris] default = false servers = server1:9997, s erver2:9997",
        "[distributedSearch:Paris] default = false servers = server1:8 089; server2:8089",
      ],
      correct: ["[distributedSearch:Paris] default = false servers = server1:8 089; server2:8089"],
    },
    {
      question: "Which Splunk component does a search head primarily communicate  with?",
      options: [
        "Indexer",
        "Forwarder",
        "Cluster master",
        "Deployment server",
      ],
      correct: ["Indexer"],
    },
    {
      question: "What type of Splunk license is pre-selected in a brand new Splu nk installation?",
      options: [
        "Free license",
        "Forwarder license",
        "Enterprise trial license",
        "Enterprise license",
      ],
      correct: ["Enterprise trial license"],
    },
    {
      question: "How does the Monitoring Console monitor forwarders?",
      options: [
        "By pulling internal logs from forwarders.",
        "By using the forwarder monitoring add-on",
        "With internal logs forwarded by forwarders.",
        "With internal logs forwarded by deployment server.",
      ],
      correct: ["With internal logs forwarded by forwarders."],
    },
    {
      question: "After an Enterprise Trial license expires, it will automaticall y convert to a Free license. How many days is an Enterprise Trial license valid before this conversion occurs ?",
      options: [
        "90 days",
        "60 days",
        "7 days",
        "14 days",
      ],
      correct: ["60 days"],
    },
    {
      question: "Which feature of Splunk's role configuration can be used to agg regate multiple roles intended for groups of users?",
      options: [
        "Linked roles",
        "Grantable roles",
        "Role federation",
        "Role inheritance",
      ],
      correct: ["Role inheritance"],
    },
    {
      question: "What is the default value ofLINE_BREAKER?",
      options: [
        "\\r\\n",
        "([\\r\\n]+)",
        "\\r+\\n+",
        "(\\r\\n+)",
      ],
      correct: ["([\\r\\n]+)"],
    },
    {
      question: "Immediately after installation, what will a Universal Forwarder  do first?",
      options: [
        "Automatically detect any indexers in its subnet and begin rou ting data.",
        "Begin reading local files on its server.",
        "Begin generating internal Splunk logs.",
        "Send an email to the operator that the installation process h as completed.",
      ],
      correct: ["Begin generating internal Splunk logs."],
    },
    {
      question: "Which of the following describes a Splunk deployment server?",
      options: [
        "A Splunk Forwarder that deploys data to multiple indexers.",
        "A Splunk app installed on a Splunk Enterprise server.",
        "A Splunk Enterprise server that distributes apps.",
        "A server that automates the deployment of Splunk Enterprise t o remote servers.",
      ],
      correct: ["A Splunk Enterprise server that distributes apps."],
    },
    {
      question: "What happens when there are conflicting settings within two or more configuration files?",
      options: [
        "The setting is ignored until conflict is resolved.",
        "The setting for both values will be used together.",
        "The setting with the lowest precedence is used.",
        "The setting with the highest precedence is used.",
      ],
      correct: ["The setting with the highest precedence is used."],
    },
    {
      question: "In this example, ifuseACKis set to true and themaxQueueSizeis s et to 7MB, what is the size of the wait queue on this universal forwarder?",
      options: [
        "21MB",
        "28MB",
        "14MB",
        "7MB",
      ],
      correct: ["21MB"],
    },
    {
      question: "What is the default character encoding used by Splunk during th e input phase?",
      options: [
        "UTF-8",
        "UTF-16",
        "EBCDIC",
        "ISO 8859",
      ],
      correct: ["UTF-8"],
    },
    {
      question: "TheLINE_BREAKERattribute is configured in which configuration f ile?",
      options: [
        "props.conf",
        "indexes.conf",
        "inpucs.conf",
        "transforms.conf",
      ],
      correct: ["props.conf"],
    },
    {
      question: "After automatic load balancing is enabled on a forwarder, the t ime interval for switching indexers can be updated by using which of the following attributes?",
      options: [
        "channelTTL",
        "connectionTimeout",
        "autoLBFrequency",
        "secsInFailurelnterval",
      ],
      correct: ["autoLBFrequency"],
    },
    {
      question: "How is data handled by Splunk during the input phase of the dat a ingestion process?",
      options: [
        "Data is treated as streams.",
        "Data is broken up into events.",
        "Data is initially written to disk.",
        "Data is measured by the license meter.",
      ],
      correct: ["Data is treated as streams."],
    },
    {
      question: "Event processing occurs at which phase of the data pipeline?",
      options: [
        "Search",
        "Indexing",
        "Parsing",
        "Input",
      ],
      correct: ["Parsing"],
    },
    {
      question: "Which of the following configuration files are used with a univ ersal forwarder? (Choose all that apply.)",
      options: [
        "inputs.conf",
        "monitor.conf",
        "outputs.conf",
        "forwarder.conf",
      ],
       multi: true, // 👈 IMPORTANT
      correct: ["inputs.conf", "outputs.conf"],
    },
    {
      question: "Social Security Numbers (PII) data is found in log events, whic h is against company policy. SSN format is as follows: 123-44-5678. Which configuration file and stanza pair will mask possible SSN s in the log events?",
      options: [
        "props.conf [mask-SSN]REX = (?ms)^(.)\\<[SSN>\\d{3}-?\\d{2}-?(\\d{4}.*)$\"FORMAT = $1<SSN>###-##-$2KEY = _raw",
        "props.conf [mask-SSN]REGEX = (?ms)^(.)\\<[SSN>\\d{3}-?\\d{2}-?(\\d{4}.*)$\" FORMAT = $1<S SN>###-##-$2 DEST_KEY = _raw",
        "transforms.conf [mask-SSN]REX = (?ms)^(.)\\<[SSN>\\d{3}-?\\d{2}-?(\\d{4}.*)$\"FORMAT = $1<SSN>###-##-$2DEST_KEY = _raw",
        "transforms.conf",
      ],
      correct: ["transforms.conf"],
    },
    {
      question: "Which option accurately describes the purpose of the HTTP Event  Collector (HEC)?",
      options: [
        "A token-based HTTP input that is secure and scalable and that requires the use of forwarders",
        "A token-based HTTP input that is secure and scalable and that does not require the use of forwarders.",
        "An agent-based HTTP input that is secure and scalable and tha t does not require the use of forwarders.",
        "A token-based HTTP input that is insecure and non-scalable an d that does not require the use of",
      ],
      correct: ["A token-based HTTP input that is secure and scalable and that does not require the use of forwarders."],
    },
    {
      question: "Immediately after installation, what will a Universal Forwarder  do first?",
      options: [
        "Automatically detect any indexers in its subnet and begin routing data.",
        "Begin generating internal Splunk logs.",
        "Begin reading local files on its server.",
        "Send an email to the operator that the installation process has completed.",
      ],
      correct: ["Begin generating internal Splunk logs."],
    },
    {
      question: "Given a forwarder with the following outputs.conf configuration: [tcpout : mypartner]Server = 145.188.183.184:9097[tcpout : hfbank]server = inputsl . mysplunkhfs . corp : 9997 , inputs2 . mysplunkhfs . corp : 9997Which of the following is a true statement?",
      options: [
        "Data will continue to flow to hfbank if 145.188.183.184:9097 is unreachable.",
        "Data is not encrypted to mypartner because 145.188:183.184 : 9097 is specified by IP.",
        "Data is encrypted to mypartner because 145.183.184:097 is specified by IP.",
        "Data will eventually stop flowing everywhere if 145.188.183.184:9097 is unreachable.",
      ],
      correct: ["Data will continue to flow to hfbank if 145.188.183.184:9097 is unreachable."],
    },
    {
      question: "When would the following command be used?",
      options: [
        "To verify' the integrity of a local index.",
        "To verify the integrity of a SmartStore index.",
        "To verify the integrity of a SmartStore bucket.",
        "To verify the integrity of a local bucket.",
      ],
      correct: ["To verify the integrity of a local bucket."],
    },
    {
      question: "What are the values forhostandindexfor[stanza1]used by Splunk d uring index time, given the following configuration files?",
      options: [
        "host=server1 index=unixinfo",
        "host=server1 index=searchinfo",
        "host=searchsvr1 index=searchinfo",
        "host=unixsvr1",
      ],
      correct: ["host=server1 index=unixinfo"],
    },
    {
      question: "Which of the following is a benefit of distributed search?",
      options: [
        "Peers run search in sequence.",
        "Peers run search in parallel.",
        "Resilience from indexer failure.",
        "Resilience from search head failure.",
      ],
      correct: ["Peers run search in parallel."],
    },
    {
      question: "Which configuration files are used to transform raw data ingest ed by Splunk? (Choose all that apply.)",
      options: [
        "props.conf",
        "inputs.conf",
        "rawdata.conf",
        "transforms.conf",
      ],
       multi: true, // 👈 IMPORTANT
      correct: ["props.conf", "transforms.conf"],
    },
    {
      question: "What is an example of a proper configuration for CHARSET within  props.conf?",
      options: [
        "[host: : server. splunk. com] CHARSET = BIG5",
        "[index: :main] CHARSET = BIG5",
        "[sourcetype: : son] CHARSET = BIG5",
        "[source: : /var/log/ splunk]",
      ],
      correct: ["[host: : server. splunk. com] CHARSET = BIG5"],
    },
    {
      question: "The Splunk administrator wants to ensure data is distributed ev enly amongst the indexers. To do this, he runs the following search over the last 24 hours : index=*What field can the administrator check to see the data distribu tion?",
      options: [
        "host",
        "index",
        "linecount",
        "splunk_server",
      ],
      correct: ["splunk_server"],
    },
    {
      question: "Where should apps be located on the deployment server that the clients pull from?",
      options: [
        "$SFLUNK_KOME/etc/apps",
        "$SPLUNK_HCME/etc/sear:ch",
        "$SPLUNK_HCME/etc/master-apps",
        "$SPLUNK HCME/etc/deployment-apps",
      ],
      correct: ["$SPLUNK HCME/etc/deployment-apps"],
    },
    {
      question: "When running a real-time search, search results are pulled from  which Splunk component?",
      options: [
        "Heavy forwarders and search peers",
        "Heavy forwarders",
        "Search heads",
        "Search peers",
      ],
      correct: ["Search peers"],
    },
    {
      question: "What options are available when creating custom roles? (select all that apply)",
      options: [
        "Restrict search terms",
        "Whitelist search terms",
        "Limit the number of concurrent search jobs",
        "Allow or restrict indexes that can be searched.",
      ],
       multi: true, // 👈 IMPORTANT
      correct: ["Restrict search terms", "Limit the number of concurrent search jobs", "Allow or restrict indexes that can be searched."],
    },
    {
      question: "On the deployment server, administrators can map clients to server classes using client filters. Which of the following statements is accurate?",
      options: [
        "The blacklist takes precedence over the whitelist.",
        "The whitelist takes precedence over the blacklist.",
        "Wildcards are not supported in any client filters.",
        "Machine type filters are applied before the whitelist and blacklist.",
      ],
      correct: ["The blacklist takes precedence over the whitelist."],
    },
    {
      question: "In case of a conflict between a whitelist and a blacklist input setting, which one is used?",
      options: [
        "Blacklist",
        "Whitelist",
        "They cancel each other out.",
        "Whichever is entered into the configuration first.",
      ],
      correct: ["Blacklist"],
    },
    {
      question: "Which of the following enables compression for universal forwarders in outputs. conf ?",
      options: [
        "Option A",
        "Option B",
        "Option C",
        "Option D",
      ],
      correct: ["Option B"],
    },
    {
      question: "What conf file needs to be edited to set up distributed search groups?",
      options: [
        "props.conf",
        "search.conf",
        "distsearch.conf",
        "distibutedsearch.conf",
      ],
      correct: ["distsearch.conf"],
    },
    {
      question: "Which forwarder type can parse data prior to forwarding?",
      options: [
        "Universal forwarder",
        "Heaviest forwarder",
        "Hyper forwarder",
        "Heavy forwarder",
      ],
      correct: ["Heavy forwarder"],
    },
    {
      question: "Which of the following indexes come pre-configured with Splunk Enterprise? (select all that apply)",
      options: [
        "_license",
        "_lnternal",
        "_external",
        "_thefishbucket",
      ],
       multi: true, // 👈 IMPORTANT
      correct: ["_lnternal", "_thefishbucket"],
    },
    {
      question: "Which of the following types of data count against the license daily quota?",
      options: [
        "Replicated data",
        "splunkd logs",
        "Summary index data",
        "Windows internal logs",
      ],
      correct: ["Windows internal logs"],
    },
    {
      question: "Consider a company with a Splunk distributed environment in pro duction. The Compliance Department wants to start using Splunk; however, they want to ensure that no one can see their reports or any other knowledge objects. Which Splunk Component can be added to imple ment this policy for the new team?",
      options: [
        "Indexer",
        "Deployment server",
        "Universal forwarder",
        "Search head",
      ],
      correct: ["Search head"],
    },
    {
      question: "For single line event sourcetypes. it is most efficient to set SHOULD_linemerge to what value?",
      options: [
        "True",
        "False",
        "<regex string>",
        "Newline Character",
      ],
      correct: ["False"],
    },
    {
      question: "Which of the following is the use case for the deployment serve r feature of Splunk?",
      options: [
        "Managing distributed workloads in a Splunk environment.",
        "Automating upgrades of Splunk forwarder installations on endpoin ts.",
        "Orchestrating the operations and scale of a containerized Spl unk deployment.",
        "Updating configuration and distributing apps to processing co mponents, primarily forwarders.",
      ],
      correct: ["Updating configuration and distributing apps to processing co mponents, primarily forwarders."],
    },
    {
      question: "In a customer managed Splunk Enterprise environment, what is th e endpoint URI used to collect data?",
      options: [
        "services/collector",
        "data/collector",
        "services/inputs?raw",
        "services/data/collector",
      ],
      correct: ["services/collector"],
    },
    {
      question: "What is the correct example to redact a plain-text password fro m raw events?",
      options: [
        "in props.conf: [identity]REGEX-redact_pw = s/password=([^,|/s]+)/ ####REACTED####/g",
        "in props.conf: [identity]SEDCMD-redact_pw = s/password=([^,|/s]+)/ ####REACTED####/g",
        "in transforms.conf: [identity]SEDCMD-redact_pw = s/password=([^,|/s]+)/ ####REACTED####/g",
        "in transforms.conf:",
      ],
      correct: ["in props.conf: [identity]SEDCMD-redact_pw = s/password=([^,|/s]+)/ ####REACTED####/g"],
    },
    {
      question: "In this source definition the MAX_TIMESTAMP_LOOKHEAD is missing. Which value would fit best? Event example:",
      options: [
        "MAX_TIMESTAMP_L0CKAHEAD = 5",
        "MAX_TIMESTAMP_LOOKAHEAD - 10",
        "MAX_TIMESTAMF_LOOKHEAD = 20",
        "MAX TIMESTAMP LOOKAHEAD - 30",
      ],
      correct: ["MAX TIMESTAMP LOOKAHEAD - 30"],
    },
    {
      question: "A new forwarder has been installed with a manually createddeploymentclient.conf. What is the next step to enable the communication between the forwarder and the deployment server?",
      options: [
        "Restart Splunk on the deployment server.",
        "Enable the deployment client in Splunk Web under Forwarder Management.",
        "Restart Splunk on the deployment client.",
        "Wait for up to the time set in thephoneHomeIntervalInSecssetting.",
      ],
      correct: ["Restart Splunk on the deployment client."],
    },
    {
      question: "What is the correct curl to send multiple events through HTTP Event Collector?",
      options: [
        "Option A",
        "Option B",
        "Option C",
        "Option D",
      ],
      correct: ["Option B"],
    },
    {
      question: "How would you configure your distsearch conf to allow you to run the search below? sourcetype=access_combined status=200 action=purchase splunk_setver_group=HOUSTON",
      options: [
        "Option A",
        "Option B",
        "Option C",
        "Option D",
      ],
      correct: ["Option C"],
    },
    {
      question: "Which pathway represents where a network input in Splunk might be found?",
      options: [
        "$SPLUNK HOME/ etc/ apps/ ne two r k/ inputs.conf",
        "$SPLUNK HOME/ etc/ apps/ $appName/ local / inputs.conf",
        "$SPLUNK HOME/ system/ local /udp.conf",
        "$SPLUNK HOME/ var/lib/ splunk/$inputName/homePath/",
      ],
      correct: ["$SPLUNK HOME/ etc/ apps/ $appName/ local / inputs.conf"],
    },
    {
      question: "Which Splunk component distributes apps and certain other confi guration updates to search head cluster members?",
      options: [
        "Deployer",
        "Cluster master",
        "Deployment server",
        "Search head cluster master",
      ],
      correct: ["Deployment server"],
    },
    {
      question: "Which valid bucket types are searchable? (select all that apply )",
      options: [
        "Hot buckets",
        "Cold buckets",
        "Warm buckets",
        "Frozen buckets",
      ],
       multi: true, // 👈 IMPORTANT
      correct: ["Hot buckets", "Cold buckets", "Warm buckets"],
    },
    {
      question: "A security team needs to ingest a static file for a specific in cident. The log file has not been collected previously and future updates to the file must not be indexed. Which command would meet these needs?",
      options: [
        "splunk add one shot / opt/ incident [data .log --index incide nt",
        "splunk edit monitor /opt/incident/data.* --index incident",
        "splunk add monitor /opt/incident/data.log --index incident",
        "splunk edit oneshot [opt/ incident/data.* --index incident",
      ],
      correct: ["splunk add one shot / opt/ incident [data .log --index incide nt"],
    },
    {
      question: "An admin is running the latest version of Splunk with a 500 GB license. The current daily volume of new data is 300 GB per day. To minimize license issues, what is the best  way to add 10 TB of historical data to the index?",
      options: [
        "Buy a bigger Splunk license.",
        "Add 2.5 TB each day for the next 5 days.",
        "Add all 10 TB in a single 24 hour period.",
        "Add 200 GB of historical data each day for 50 days.",
      ],
      correct: ["Add all 10 TB in a single 24 hour period."],
    },
    {
      question: "Which Splunk component requires a Forwarder license?",
      options: [
        "Search head",
        "Heavy forwarder",
        "Heaviest forwarder",
        "Universal forwarder",
      ],
      correct: ["Heavy forwarder"],
    },
    {
      question: "What action is required to enable forwarder management in Splun k Web?",
      options: [
        "Navigate to Settings > Server Settings > General Settings, an d set an App server port.",
        "Navigate to Settings > Forwarding and receiving, and click on Enable Forwarding.",
        "Create a server class and map it to a client inSPLUNK_HOME/etc/system/local/serverclass.conf.",
        "Place an app in theSPLUNK_HOME/etc/deployment-appsdirectory o f the deployment server.",
      ],
      correct: ["Create a server class and map it to a client inSPLUNK_HOME/etc/system/local/serverclass.conf."],
    },
  ]
};

async function seed() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to DB ✅");
    await Quiz.Quiz.deleteMany({ title: "T.O Analytics Splunk Admin Exam Quiz" });
    await Quiz.Quiz.create(splunkAdminQuiz);
    console.log("T.O Analytics Splunk Admin Exam Quiz🚀 inserted!");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

seed();