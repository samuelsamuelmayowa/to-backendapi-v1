const mongoose = require("mongoose");
const Quiz = require("../model/quiz.js");

const MONGO_URI =
  "mongodb+srv://fpasamuelmayowa51:5iX35jgh9yB9P6Im@cluster0.unk3ntp.mongodb.net/datausers";

const splunkDay2Quiz20 = {
  title: "T.O Analytics Splunk Class  12 Quiz",
  description: "Splunk data onboarding, indexing, roles, inputs, and distributed search knowledge check.",
  category: "Splunk",
  level: "Beginner",
  questions: [
    {
      question: "What is the main purpose of indexing in Splunk?",
      options: [
        "To compress data for storage efficiency",
        "To assign numeric addresses to data to optimize search performance",
        "To encrypt data before it is stored",
        "To forward data to search heads"
      ],
      correct: [
        "To assign numeric addresses to data to optimize search performance"
      ],
      reason:
        "Indexing assigns numeric addresses to data to allow faster and more efficient searches."
    },
    {
      question:
        "Which Splunk component transforms raw data into events and stores them on disk?",
      options: [
        "Universal Forwarder",
        "Search Head",
        "Indexer",
        "Deployment Server"
      ],
      correct: ["Indexer"],
      reason:
        "The indexer parses, processes, and stores data on disk."
    },
    {
      question:
        "Which index stores Splunk’s internal logs and processing metrics?",
      options: ["main", "summary", "_audit", "_internal"],
      correct: ["_internal"],
      reason:
        "The _internal index stores Splunk’s internal operational logs."
    },
    {
      question:
        "If no index is specified, where does Splunk store the data?",
      options: [
        "Data is rejected",
        "_internal index",
        "main index",
        "Data is dropped"
      ],
      correct: ["main index"],
      reason:
        "The main index is the default index when none is specified."
    },
    {
      question:
        "What is the primary benefit of summary indexing?",
      options: [
        "Reduces license usage",
        "Encrypts indexed data",
        "Improves search performance over time",
        "Eliminates indexers"
      ],
      correct: ["Improves search performance over time"],
      reason:
        "Summary indexing spreads heavy computation over time for faster searches."
    },
    {
      question:
        "Which authentication method takes precedence in Splunk?",
      options: [
        "LDAP",
        "SAML",
        "Scripted authentication",
        "Native Splunk authentication"
      ],
      correct: ["Native Splunk authentication"],
      reason:
        "Native authentication overrides external authentication methods."
    },
    {
      question:
        "Which authentication methods does Splunk support?",
      options: [
        "LDAP",
        "SAML",
        "MFA",
        "All of the above"
      ],
      correct: ["All of the above"],
      reason:
        "Splunk supports LDAP, SAML, MFA, and scripted authentication."
    },
    {
      question:
        "What do Splunk roles control?",
      options: [
        "Data retention",
        "User actions and access",
        "Hardware usage",
        "Network encryption"
      ],
      correct: ["User actions and access"],
      reason:
        "Roles define permissions and access to Splunk resources."
    },
    {
      question:
        "What is required when creating a role?",
      options: [
        "Assigned indexes",
        "Capabilities",
        "Role name",
        "Assigned users"
      ],
      correct: ["Role name"],
      reason:
        "Only the role name is mandatory when creating a role."
    },
    {
      question:
        "Which rule applies to Splunk role names?",
      options: [
        "Can contain spaces",
        "Must be lowercase",
        "Can use slashes",
        "Can be renamed later"
      ],
      correct: ["Must be lowercase"],
      reason:
        "Role names must be lowercase and cannot contain spaces or slashes."
    },
    {
      question:
        "Which is a supported data input type?",
      options: [
        "Files and directories",
        "Network data",
        "Script output",
        "All of the above"
      ],
      correct: ["All of the above"],
      reason:
        "Splunk supports file, network, and scripted inputs."
    },
    {
      question:
        "Which field identifies the originating device?",
      options: ["source", "sourcetype", "host", "index"],
      correct: ["host"],
      reason:
        "The host field shows the device name or IP address."
    },
    {
      question:
        "For file inputs, what does the source field contain?",
      options: [
        "Hostname",
        "File path",
        "Index name",
        "Sourcetype"
      ],
      correct: ["File path"],
      reason:
        "The source field shows the full file path for file inputs."
    },
    {
      question:
        "What does sourcetype define?",
      options: [
        "Storage location",
        "Data structure/format",
        "Device name",
        "Retention policy"
      ],
      correct: ["Data structure/format"],
      reason:
        "Sourcetype defines the format and structure of the data."
    },
    {
      question:
        "What is the purpose of a Universal Forwarder?",
      options: [
        "Index data",
        "Search data",
        "Collect and forward data",
        "Manage roles"
      ],
      correct: ["Collect and forward data"],
      reason:
        "Universal Forwarders collect and send data to indexers."
    },
    {
      question:
        "What does a Deployment Server do?",
      options: [
        "Distributed searches",
        "Central configuration management",
        "Store licenses",
        "Parse data"
      ],
      correct: ["Central configuration management"],
      reason:
        "Deployment Servers centrally manage client configurations."
    },
    {
      question:
        "Which file connects a client to a deployment server?",
      options: [
        "inputs.conf",
        "server.conf",
        "deploymentclient.conf",
        "indexes.conf"
      ],
      correct: ["deploymentclient.conf"],
      reason:
        "deploymentclient.conf defines the deployment server connection."
    },
    {
      question:
        "Who can access the Monitoring Console?",
      options: [
        "All users",
        "Power users",
        "Admin users",
        "Forwarders"
      ],
      correct: ["Admin users"],
      reason:
        "Only admin users can access the Monitoring Console."
    },
    {
      question:
        "Who initiates searches in distributed search?",
      options: [
        "Indexer",
        "Forwarder",
        "Search Head",
        "Deployment Server"
      ],
      correct: ["Search Head"],
      reason:
        "Search Heads initiate searches and distribute them to indexers."
    },
    {
      question:
        "What happens after indexers complete a distributed search?",
      options: [
        "Results deleted",
        "Stored in summary",
        "Merged and returned to user",
        "Sent to deployment clients"
      ],
      correct: ["Merged and returned to user"],
      reason:
        "Search Heads merge results and return them to users."
    }
  ]
};

async function seed() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to DB ✅");

    await Quiz.Quiz.deleteMany({
      title: splunkDay2Quiz20.title
    });

    await Quiz.Quiz.create(splunkDay2Quiz20);

    console.log("T.O Analytics Splunk Class  12 Quiz inserted 🚀");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

seed();


// const mongoose = require("mongoose");
// const Quiz = require("../model/quiz.js");

// const MONGO_URI =
//   "mongodb+srv://fpasamuelmayowa51:5iX35jgh9yB9P6Im@cluster0.unk3ntp.mongodb.net/datausers";

// const splunkDay2Quiz = {
//   title: "T.O Analytics Splunk Class 12 Quiz",
//   description: "Splunk data onboarding, indexing, and core component fundamentals.",
//   category: "Splunk",
//   level: "Beginner",
//   questions: [
//     {
//       question: "What is the main purpose of indexing in Splunk?",
//       options: [
//         "To compress data for storage efficiency",
//         "To assign numeric addresses to data to optimize search performance",
//         "To encrypt data before it is stored",
//         "To forward data to search heads"
//       ],
//       correct: [
//         "To assign numeric addresses to data to optimize search performance"
//       ],
//       reason:
//         "Indexing assigns numeric addresses to data, allowing faster and more efficient searches."
//     },
//     {
//       question:
//         "Which Splunk component is responsible for transforming raw data into events and storing them on disk?",
//       options: [
//         "Universal Forwarder",
//         "Search Head",
//         "Indexer",
//         "Deployment Server"
//       ],
//       correct: ["Indexer"],
//       reason:
//         "The indexer parses raw data into events and stores them on disk."
//     },
//     {
//       question:
//         "Which index stores Splunk’s internal logs and processing metrics?",
//       options: [
//         "main",
//         "summary",
//         "_audit",
//         "_internal"
//       ],
//       correct: ["_internal"],
//       reason:
//         "The _internal index stores Splunk’s internal operational logs and metrics."
//     }
//   ]
// };

// async function seed() {
//   try {
//     await mongoose.connect(MONGO_URI);
//     console.log("Connected to DB ✅");

//     await Quiz.Quiz.deleteMany({
//       title: "T.O Analytics Splunk Class 12 Quiz"
//     });

//     await Quiz.Quiz.create(splunkDay2Quiz);

//     console.log(" T.O Analytics Splunk Class 12 Quiz inserted 🚀");
//     process.exit(0);
//   } catch (err) {
//     console.error(err);
//     process.exit(1);
//   }
// }

// seed();
