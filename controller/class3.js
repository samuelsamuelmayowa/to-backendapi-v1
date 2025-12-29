const mongoose = require("mongoose");
const Quiz = require("../model/quiz.js");

const MONGO_URI = "mongodb+srv://fpasamuelmayowa51:5iX35jgh9yB9P6Im@cluster0.unk3ntp.mongodb.net/datausers";

const splunkClass3Quiz = {
  title: "T.O Analytics Splunk Class 3 Quiz",
  description: "Covers concepts from the T.O Analytics Splunk Class 3 presentation on Introduction to SPL, search commands, and data transformation.",
  questions: [
    {
      question: "What does SPL stand for?",
      options: [
        "System Processing Log",
        "Search Processing Language",
        "Structured Programming Language",
        "Splunk Programming Logic"
      ],
      correct: ["Search Processing Language"]
    },
    {
      question: "SPL is primarily used for:",
      options: [
        "Writing system code",
        "Searching, filtering, and transforming data",
        "Building user interfaces",
        "Generating license keys"
      ],
      correct: ["Searching, filtering, and transforming data"]
    },
    {
      question: "Splunk is best described as a:",
      options: [
        "Database engine",
        "Web server",
        "Platform for searching, monitoring, and analyzing machine data",
        "Log parser only"
      ],
      correct: ["Platform for searching, monitoring, and analyzing machine data"]
    },
    {
      question: "Splunk Web is:",
      options: [
        "A command-line tool",
        "A browser-based interface",
        "An external plugin",
        "A mobile app"
      ],
      correct: ["A browser-based interface"]
    },
    {
      question: "Real-world use of SPL includes all EXCEPT:",
      options: [
        "Detecting intrusions",
        "Monitoring infrastructure",
        "Creating malware",
        "Visualizing performance metrics"
      ],
      correct: ["Creating malware"]
    },
    {
      question: "The search command is used to:",
      options: [
        "Delete events",
        "Retrieve data that matches conditions",
        "Create dashboards",
        "Define indexes"
      ],
      correct: ["Retrieve data that matches conditions"]
    },
    {
      question: "What happens if you omit “search” in a Splunk query?",
      options: [
        "The query fails",
        "Splunk assumes search automatically",
        "It becomes a subsearch",
        "It filters only internal logs"
      ],
      correct: ["Splunk assumes search automatically"]
    },
    {
      question: "Which of the following is a valid SPL example?",
      options: [
        "find error host=web1",
        "search error OR failure",
        "grep error log",
        "match error host"
      ],
      correct: ["search error OR failure"]
    },
    {
      question: "Which command filters data based on conditions similar to SQL’s WHERE clause?",
      options: [
        "search",
        "stats",
        "where",
        "eval"
      ],
      correct: ["where"]
    },
    {
      question: "In status=200 AND bytes>50000, the AND operator means:",
      options: [
        "Combine unrelated searches",
        "Match both conditions",
        "Ignore both conditions",
        "Sort results"
      ],
      correct: ["Match both conditions"]
    },
    {
      question: "The Power Trio of SPL includes:",
      options: [
        "search, eval, and top",
        "search, where, and eval",
        "eval, fields, and rename",
        "stats, chart, and table"
      ],
      correct: ["search, where, and eval"]
    },
    {
      question: "The eval command is used to:",
      options: [
        "Create or modify fields",
        "Delete events",
        "Export data",
        "Start searches"
      ],
      correct: ["Create or modify fields"]
    },
    {
      question: "Example: | eval response_sec = response_time/1000 — this converts:",
      options: [
        "Seconds to milliseconds",
        "Milliseconds to seconds",
        "Text to epoch",
        "Bytes to bits"
      ],
      correct: ["Milliseconds to seconds"]
    },
    {
      question: "Which command narrows data to only slow transactions?",
      options: [
        "eval",
        "where",
        "dedup",
        "chart"
      ],
      correct: ["where"]
    },
    {
      question: "Which combination best describes SPL workflow?",
      options: [
        "search = find, where = filter, eval = enrich",
        "where = find, eval = display, search = compute",
        "eval = filter, search = transform, where = store",
        "chart = find, stats = clean, rename = join"
      ],
      correct: ["search = find, where = filter, eval = enrich"]
    },
    {
      question: "The stats command is used for:",
      options: [
        "Deleting duplicates",
        "Calculating metrics like count, avg, sum",
        "Formatting dashboards",
        "Creating time buckets"
      ],
      correct: ["Calculating metrics like count, avg, sum"]
    },
    {
      question: "The timechart command:",
      options: [
        "Groups data alphabetically",
        "Visualizes data across time",
        "Deletes time fields",
        "Extracts text patterns"
      ],
      correct: ["Visualizes data across time"]
    },
    {
      question: "The chart command displays data:",
      options: [
        "Only as bar charts",
        "In a 2D comparative format",
        "As time-series lines",
        "Only by count"
      ],
      correct: ["In a 2D comparative format"]
    },
    {
      question: "The eval function split('A,B,C', ',') creates:",
      options: [
        "A single string",
        "A list or array",
        "A table",
        "A renamed field"
      ],
      correct: ["A list or array"]
    },
    {
      question: "The mvexpand function:",
      options: [
        "Combines multi-values",
        "Expands a multivalue field into separate events",
        "Deletes duplicates",
        "Renames fields"
      ],
      correct: ["Expands a multivalue field into separate events"]
    },
    {
      question: "The strptime() function converts:",
      options: [
        "Epoch → String",
        "String → Epoch",
        "Number → Boolean",
        "Date → Index"
      ],
      correct: ["String → Epoch"]
    },
    {
      question: "The strftime() function converts:",
      options: [
        "String → Epoch",
        "Epoch → Readable Time",
        "JSON → Table",
        "Text → Bytes"
      ],
      correct: ["Epoch → Readable Time"]
    },
    {
      question: "Why use strptime()?",
      options: [
        "To display time neatly",
        "To do time math and comparisons",
        "To filter IP addresses",
        "To rename fields"
      ],
      correct: ["To do time math and comparisons"]
    },
    {
      question: "strftime(_time, '%Y-%m-%d') produces:",
      options: [
        "Unix timestamp",
        "Formatted date",
        "Field alias",
        "Average values"
      ],
      correct: ["Formatted date"]
    },
    {
      question: "In Splunk, a field is:",
      options: [
        "A log file",
        "A name-value pair extracted from events",
        "A dashboard panel",
        "A report title"
      ],
      correct: ["A name-value pair extracted from events"]
    },
    {
      question: "Default fields include:",
      options: [
        "_time, host, source",
        "user, action, bytes",
        "table, stats, chart",
        "eval, where, index"
      ],
      correct: ["_time, host, source"]
    },
    {
      question: "The command fields clientip, status, bytes does what?",
      options: [
        "Removes those fields",
        "Displays only those fields",
        "Calculates stats",
        "Exports fields"
      ],
      correct: ["Displays only those fields"]
    },
    {
      question: "The rename command is used to:",
      options: [
        "Change field names",
        "Filter null values",
        "Create new indexes",
        "Sort data"
      ],
      correct: ["Change field names"]
    },
    {
      question: "The command table helps to:",
      options: [
        "Display fields in tabular format",
        "Export to Excel",
        "Create joins",
        "Sort values"
      ],
      correct: ["Display fields in tabular format"]
    },
    {
      question: "Understanding fields in Splunk is important because:",
      options: [
        "It helps write better queries",
        "It controls user access",
        "It limits license usage",
        "It disables indexing"
      ],
      correct: ["It helps write better queries"]
    }
  ]
};

async function seed() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to DB ✅");

    await Quiz.Quiz.deleteMany({ title: "T.O Analytics Splunk Class 3 Quiz" });
    await Quiz.Quiz.create(splunkClass3Quiz);

    console.log("T.O Analytics Splunk Class 3 Quiz🚀");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

seed();
