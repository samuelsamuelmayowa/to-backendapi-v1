const mongoose = require("mongoose");
const Quiz = require("../model/quiz.js");

const MONGO_URI =
  "mongodb+srv://fpasamuelmayowa51:5iX35jgh9yB9P6Im@cluster0.unk3ntp.mongodb.net/datausers"; // Change to your DB URI


const splunkClass9Quiz = {
  title: "T.O Analytics – Splunk Class 9 Quiz",
  description: "Splunk architecture, deployment, licensing, and administration knowledge check.",
  category: "Splunk",
  level: "Beginner → Intermediate",
  questions: [
    {
      question: "Which Splunk deployment combines searching and indexing on a single instance?",
      options: ["Distributed", "Clustered", "Standalone", "Splunk Cloud"],
      correct: ["Standalone"],
     reason:
        "A standalone deployment runs searching and indexing on the same Splunk instance, usually for small setups or labs."
    },
    {
      question: "Which component is responsible for parsing and indexing incoming data?",
      options: ["Search Head", "Universal Forwarder", "Indexer", "Manager Node"],
      correct: ["Indexer"],
      reason:
        "Indexers handle parsing, event breaking, timestamping, and storing data into indexes."
    },
    {
      question: "Which component manages index replication in an indexer cluster?",
      options: ["Search Head", "Deployer", "Manager Node", "Monitoring Console"],
      correct: ["Manager Node"],
      reason:
        "The Manager Node coordinates index replication, bucket management, and overall cluster health."
    },
    {
      question: "What is the primary function of a Search Head?",
      options: [
        "Store indexed data",
        "Forward events",
        "Manage searches and merge results",
        "Parse raw data"
      ],
      correct: ["Manage searches ]and merge results"],
      reason:
        "Search Heads distribute searches to indexers and merge the results for users."
    },
    {
      question: "Which forwarder is lightweight and does NOT parse or index data?",
      options: [
        "Heavy Forwarder",
        "Universal Forwarder",
        "Indexer",
        "Deployment Server"
      ],
      correct: ["Universal Forwarder"],
      reason:
        "Universal Forwarders are lightweight and only forward data without parsing or indexing."
    },
    {
      question: "When does a Heavy Forwarder require a Splunk license?",
      options: [
        "Always",
        "Never",
        "Only when indexing locally",
        "Only in Splunk Cloud"
      ],
      correct: ["Only when indexi]ng locally"],
      reason:
        "Licensing is based on indexing volume. A heavy forwarder only consumes a license if it indexes data."
    },
    {
      question: "Which default index is used if no index is specified?",
      options: ["default", "_internal", "main", "summary"],
      correct: ["main"],
      reason:
        "Splunk sends data to the 'main' index by default if no index is specified."
    },
    {
      question: "What does the sourcetype field describe?",
      options: [
        "Hostname of the device",
        "File location",
        "Data structure and format",
        "Index location"
      ],
      correct: ["Data structure and format"],
      reason:
        "Sourcetype defines how Splunk should interpret and parse the data."
    },
    {
      question: "Which field identifies where an event originated from?",
      options: ["host", "source", "sourcetype", "index"],
      correct: ["source"],
      reason:
        "The source field indicates the file path, port, or input that generated the event."
    },
    {
      question: "Which ingestion method is best for sending JSON data securely over HTTPS?",
      options: [
        "Syslog",
        "Scripted input",
        "File monitoring",
        "HTTP Event Collector (HEC)"
      ],
      correct: ["HTTP Event Colle]ctor (HEC)"],
      reason:
        "HEC allows secure, token-based data ingestion over HTTPS."
    },
    {
      question: "In which order does Splunk process data?",
      options: [
        "Index → Parse → Search",
        "Parse → Index → Search",
        "Search → Index → Parse",
        "Store → Search → Parse"
      ],
      correct: ["Parse → Index → Search"],
      reason:
        "Data must be parsed and indexed before it can be searched."
    },
    {
      question: "Which bucket lifecycle order is correct?",
      options: [
        "Warm → Hot → Cold → Frozen",
        "Hot → Cold → Warm → Frozen",
        "Hot → Warm → Cold → Frozen",
        "Cold → Warm → Hot → Frozen"
      ],
      correct: ["Hot → Warm → Col]d → Frozen"],
      reason:
        "Data ages through hot, warm, cold, and finally frozen buckets."
    },
    {
      question: "Which component distributes apps to Search Head Cluster members?",
      options: [
        "Deployment Server",
        "Manager Node",
        "Deployer",
        "License Manager"
      ],
      correct: ["Deployer"],
      reason:
        "The Deployer pushes configurations and apps to Search Head Cluster members."
    },
    {
      question: "Which configuration directory should NEVER be edited directly?",
      options: ["local", "app", "system/default", "etc/apps"],
      correct: ["system/default"],
      reason:
        "Default directories are overwritten during upgrades; changes must go into local."
    },
    {
      question: "What is the primary purpose of the Deployment Server?",
      options: [
        "Manage licenses",
        "Distribute configurations to clients",
        "Coordinate searches",
        "Replicate index data"
      ],
      correct: ["Distribute confi]gurations to clients"],
      reason:
        "Deployment Server centrally manages and pushes configs to forwarders."
    },
    {
      question: "Which statement about Splunk Cloud Platform is TRUE?",
      options: [
        "Customers manage the OS",
        "Indexers are customer-managed",
        "It is a fully managed SaaS service",
        "It requires on-prem hardware"
      ],
      correct: ["It is a fully ma]naged SaaS service"],
      reason:
        "Splunk Cloud is fully managed by Splunk, including infrastructure and OS."
    },
    {
      question: "Which type of app collects and normalizes data but does NOT contain dashboards?",
      options: [
        "Full App",
        "Technology Add-on (TA)",
        "Search App",
        "Visualization App"
      ],
      correct: ["Technology Add-o]n (TA)"],
      reason:
        "TAs focus on data inputs, CIM compliance, and field extractions."
    },
    {
      question: "Which license model is used by Splunk Cloud Platform?",
      options: [
        "Volume-based (GB/day)",
        "Infrastructure license",
        "Workload-based licensing",
        "Free license"
      ],
      correct: ["Workload-based l]icensing"],
      reason:
        "Splunk Cloud typically uses workload-based licensing instead of GB/day."
    },
    {
      question: "Which component provides centralized monitoring of Splunk health?",
      options: [
        "Deployer",
        "Monitoring Console",
        "Manager Node",
        "Deployment Server"
      ],
      correct: ["Monitoring Console"],
      reason:
        "Monitoring Console provides health and performance visibility across deployments."
    },
    {
      question: "Which configuration layer takes precedence in Splunk?",
      options: ["system/default", "app/default", "default", "local"],
      correct: ["local"],
      reason:
        "Local configuration files override all default configurations."
    },
    {
      question: "Which Splunk component is NOT in the data path?",
      options: [
        "Indexer",
        "Heavy Forwarder",
        "Search Head",
        "Manager Node"
      ],
      correct: ["Manager Node"],     reason:
        "Manager Node coordinates the cluster but does not handle data ingestion or search."
    },
    {
      question: "Where are Splunk configuration files primarily stored?",
      options: [
        "/opt/splunk/bin",
        "$SPLUNK_HOME/etc",
        "/var/log/splunk",
        "/usr/local/splunk"
      ],
      correct: ["$SPLUNK_HOME/etc"],
      reason:"All Splunk apps and configurations reside under $SPLUNK_HOME/etc.",
    },
    {
      question: "Which input type allows Splunk Cloud customers to send data without managing servers?",
      options: [
        "File monitoring",
        "Syslog",
        "HTTP Event Collector (HEC)",
        "Scripted input"
      ],
      correct: ["HTTP Event Colle]ctor (HEC)"],
      reason:
        "HEC enables serverless data ingestion into Splunk Cloud."
    },
    {
      question: "Which role distributes configurations to forwarders?",
      options: [
        "Deployment Server",
        "Deployer",
        "Manager Node",
        "License Manager"
      ],
      correct: ["Deployment Server]"],
      reason:
        "Deployment Server manages and pushes apps to forwarders."
    },
    {
      question: "Which statement about Universal Forwarders is TRUE?",
      options: [
        "They perform indexing",
        "They require a license",
        "They consume minimal resources",
        "They manage searches"
      ],
      correct: ["They consume min]imal resources"],
      reason:
        "Universal Forwarders are lightweight and optimized for low resource usage."
    },
    {
      question: "What happens during a Splunk license violation?",
      options: [
        "Data is deleted",
        "Searches stop permanently",
        "Some searches are restricted",
        "Forwarders stop sending data"
      ],
      correct: ["Some searches ar]e restricted"],
      reason:
        "License violations restrict certain searches but do not delete data."
    },
    {
      question: "Which field identifies the system that generated an event?",
      options: ["source", "index", "sourcetype", "host"],
      correct: ["host"],
      reason:
        "The host field represents the originating system."
    },
    {
      question: "Which bucket state contains data that is no longer searchable?",
      options: ["Cold", "Warm", "Hot", "Frozen"],
      correct: ["Frozen"],
      reason:
        "Frozen buckets are archived or deleted and are no longer searchable."
    },
    {
      question: "Which component distributes apps to indexers in a cluster?",
      options: [
        "Search Head",
        "Deployer",
        "Manager Node",
        "Deployment Server"
      ],
      correct: ["Manager Node"],     reason:
        "The Manager Node distributes configuration bundles to indexer peers."
    },
    {
      question: "Which Splunk component is responsible for license enforcement?",
      options: [
        "Manager Node",
        "Search Head",
        "License Manager",
        "Monitoring Console"
      ],
      correct: ["License Manager"],
      reason:
        "The License Manager controls and enforces Splunk licensing."
    }
  ]
};


async function seed() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to DB ✅");

    await Quiz.Quiz.deleteMany({ title: "T.O Analytics – Splunk Class 9 Quiz" });
    await Quiz.Quiz.create(splunkClass9Quiz);

    console.log("T.O Analytics – Splunk Class 9 Quiz🚀 inserted!");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

seed();
