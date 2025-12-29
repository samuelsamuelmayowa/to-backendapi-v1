const mongoose = require("mongoose"); 
const Quiz = require("../model/quiz.js");

const MONGO_URI =
  "mongodb+srv://fpasamuelmayowa51:5iX35jgh9yB9P6Im@cluster0.unk3ntp.mongodb.net/datausers";

// Import or paste the quiz object here:
const splunkKOQuiz = {
  title: "T.O Analytics – Splunk Class 6 Quiz",
  description: "Covers Knowledge Objects (KOs), lookups, fields, data models, dashboards, and search-time objects.",
  questions: [
    {
      question: "What is the purpose of Splunk Knowledge Objects?",
      options: [
        "To modify raw data",
        "To enrich, categorize, normalize, and structure data",
        "To delete index data",
        "To bypass SPL searches"
      ],
      correct: ["To enrich, categorize, normalize, and structure data"],
      reason: "Knowledge Objects add structure and meaning to raw machine data."
    },
    // ... paste the rest of the 30 questions here ...
       {
      question: "Knowledge Objects are created at what time?",
      options: ["Index time", "Search time", "Deployment time", "Lookup time"],
      correct: ["Search time"],
      reason: "Knowledge Objects are created dynamically during search time."
    },
    {
      question: "Which KO is the foundation for alerts and dashboards?",
      options: ["Tags", "Saved Searches", "Event Types", "Field Aliases"],
      correct: ["Saved Searches"],
      reason: "Saved searches power dashboards and trigger alerts."
    },
    {
      question: "Reports are best described as:",
      options: [
        "Visualizations only",
        "Saved searches with schedules and visualizations",
        "Field extraction objects",
        "Alerts with no trigger"
      ],
      correct: ["Saved searches with schedules and visualizations"],
      reason: "Reports are saved searches, often scheduled, sometimes with visuals."
    },
    {
      question: "Alerts trigger when:",
      options: [
        "Dashboards refresh",
        "A saved search condition is met",
        "CSVs update",
        "KV store syncs"
      ],
      correct: ["A saved search condition is met"],
      reason: "Alerts run saved searches and trigger when conditions evaluate true."
    },
    {
      question: "Lookups enrich data by:",
      options: [
        "Replacing dashboards",
        "Mapping external fields into events",
        "Compressing index data",
        "Generating field aliases"
      ],
      correct: ["Mapping external fields into events"],
      reason: "Lookups enrich events by bringing external reference information."
    },
    {
      question: "Which lookup type uses a NoSQL-style database?",
      options: ["CSV", "KV Store", "Scripted", "External REST"],
      correct: ["KV Store"],
      reason: "KV Store lookups use a MongoDB-like backend store."
    },
    {
      question: "Which command creates search-time regex extractions?",
      options: ["inputlookup", "rex", "tstats", "stats"],
      correct: ["rex"],
      reason: "rex performs regular expression-based search-time field extraction."
    },
    {
      question: "Field aliases are used to:",
      options: [
        "De-duplicate logs",
        "Map different names to one standard field",
        "Trigger alerts",
        "Speed up indexing"
      ],
      correct: ["Map different names to one standard field"],
      reason: "Field aliases unify different field names into one standard form."
    },
    {
      question: "Which KO creates new fields using eval?",
      options: ["Lookups", "Calculated Fields", "Tags", "Data Models"],
      correct: ["Calculated Fields"],
      reason: "Calculated fields use eval expressions to create new fields."
    },
    {
      question: "Event Types classify:",
      options: ["CIM models", "Recurring event patterns", "Lookup values", "Alerts"],
      correct: ["Recurring event patterns"],
      reason: "Event types classify recurring search patterns for reuse."
    },
    {
      question: "Tags allow you to:",
      options: [
        "Combine objects",
        "Group values for easier search",
        "Build indexes",
        "Convert logs"
      ],
      correct: ["Group values for easier search"],
      reason: "Tags attach labels to specific values for easier searching."
    },
    {
      question: "Data Models provide:",
      options: [
        "Data deletion",
        "Structured datasets for pivots and acceleration",
        "Auto dashboards",
        "KV updates"
      ],
      correct: ["Structured datasets for pivots and acceleration"],
      reason: "Data models enable acceleration and pivots."
    },
    {
      question: "Which CIM-aligned apps rely on data models?",
      options: ["Deployment Server", "Splunk ES & ITSI", "Forwarder Manager", "DB Connect"],
      correct: ["Splunk ES & ITSI"],
      reason: "Enterprise Security and ITSI rely on CIM data models."
    },
    {
      question: "Dashboards:",
      options: [
        "Cannot use drilldowns",
        "Visualize SPL results",
        "Replace indexes",
        "Are only CSV-based"
      ],
      correct: ["Visualize SPL results"],
      reason: "Dashboards display SPL queries in visual form."
    },
    {
      question: "Macros are:",
      options: [
        "Regex definitions",
        "Reusable SPL shortcuts",
        "CSV lookups",
        "Eval functions"
      ],
      correct: ["Reusable SPL shortcuts"],
      reason: "Macros allow SPL reuse across searches."
    },
    {
      question: "Which permission level allows editing a KO?",
      options: ["Read", "Write", "Execute", "None"],
      correct: ["Write"],
      reason: "Write permissions allow editing/modifying knowledge objects."
    },
    {
      question: "Global sharing means:",
      options: ["One user only", "Anyone can use it", "Only admins", "Deleted daily"],
      correct: ["Anyone can use it"],
      reason: "Global sharing makes KO available to all app contexts."
    },
    {
      question: "After lookup enrichment, next workflow step is:",
      options: [
        "Raw logs index",
        "Calculated fields apply",
        "Alerts fire",
        "User roles update"
      ],
      correct: ["Calculated fields apply"],
      reason: "Workflow sequence: lookups enrich → calculated fields evaluate."
    },
    {
      question: "Accelerated data models are used for:",
      options: [
        "Faster search performance",
        "Lookup editing",
        "External scripts",
        "Summary deletion"
      ],
      correct: ["Faster search performance"],
      reason: "Acceleration enables fast tstats/pivot searches."
    },
    {
      question: "Saved searches can:",
      options: [
        "Run manually only",
        "Run on schedule, feed dashboards, trigger alerts",
        "Only export CSV",
        "Only tstats"
      ],
      correct: ["Run on schedule, feed dashboards, trigger alerts"],
      reason: "Saved searches support automation and dashboard feeding."
    },
    {
      question: "Which KO maps IP → Country?",
      options: ["Tags", "Lookup", "Event Type", "Eval"],
      correct: ["Lookup"],
      reason: "Lookups enrich IPs with geographic information."
    },
    {
      question: "Which KO groups ports 80 & 443?",
      options: ["Field alias", "Tag", "Calculated field", "Data model"],
      correct: ["Tag"],
      reason: "Tags group field values for search convenience."
    },
    {
      question: "Which KO enriches fields at search time?",
      options: ["Lookups", "Index-time fields", "Summary indexing", "Saved searches"],
      correct: ["Lookups"],
      reason: "Lookups enrich events during search execution."
    },
    {
      question: "TSTATS allows:",
      options: [
        "Index editing",
        "Fast queries using summaries",
        "Running macros",
        "Lookup calls"
      ],
      correct: ["Fast queries using summaries"],
      reason: "tstats leverages accelerated data model summaries."
    },
    {
      question: "Event types help:",
      options: [
        "Classify failed logins",
        "Build dashboards",
        "Delete events",
        "Rewrite indexes"
      ],
      correct: ["Classify failed logins"],
      reason: "Event types identify recurring patterns like login failures."
    },
    {
      question: "Field extractions are created using:",
      options: ["Regex or delimiters", "eval only", "CIM only", "Macros only"],
      correct: ["Regex or delimiters"],
      reason: "Field extractions rely on regex or automatic delimiter parsing."
    },
    {
      question: "A calculated field requires:",
      options: ["A lookup", "A macro", "An eval expression", "A script"],
      correct: ["An eval expression"],
      reason: "Calculated fields depend on eval expressions."
    },
    {
      question: "The KO used for visualizing patterns is:",
      options: ["Macro", "Dashboard", "Event Type", "Alias"],
      correct: ["Dashboard"],
      reason: "Dashboards visualize SPL results."
    },
    {
      question: "Which KO triggers actions when thresholds exceed limits?",
      options: ["Reports", "Alerts", "Tags", "Macros"],
      correct: ["Alerts"],
      reason: "Alerts fire when saved search thresholds are exceeded."
    }
  
  ]
};


async function seed() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to DB ✅");

    // Delete existing quiz with same title
    await Quiz.Quiz.deleteMany({
      title: "T.O Analytics – Splunk Class 6 Quiz",
    });

    // Save the new quiz
    await Quiz.Quiz.create(splunkKOQuiz);

    console.log("Saved: T.O. Analytics – Splunk Class 4 Quiz 🚀");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

seed();
