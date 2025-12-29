const mongoose = require("mongoose");
const Quiz = require("../model/quiz.js");

const MONGO_URI = "mongodb+srv://fpasamuelmayowa51:5iX35jgh9yB9P6Im@cluster0.unk3ntp.mongodb.net/datausers";

const splunkBooleanStatsQuiz = {
  title: "T.O Analytics Splunk Class 4 Quiz",
  description: "Topic: Boolean Logic, Functions, and Stats in Splunk",
  questions: [
    {
      question: "Which Boolean operator returns results when both conditions are true?",
      options: ["OR", "AND", "NOT", "XOR"],
      correct: ["AND"]
    },
    {
      question: "What does the NOT operator do in Splunk searches?",
      options: ["Combines fields", "Filters out results that match a condition", "Adds new fields", "Counts events"],
      correct: ["Filters out results that match a condition"]
    },
    {
      question: "Which command is used to create new calculated fields?",
      options: ["stats", "eval", "where", "rex"],
      correct: ["eval"]
    },
    {
      question: "What is the purpose of the coalesce() function?",
      options: ["Combine values and pick the first non-null", "Count fields", "Merge indexes", "Calculate averages"],
      correct: ["Combine values and pick the first non-null"]
    },
    {
      question: "Which function is used to determine the number of characters in a field?",
      options: ["count()", "len()", "strlen()", "length()"],
      correct: ["len()"]
    },
    {
      question: "In Splunk, the where command is used to:",
      options: ["Rename fields", "Filter results after search-time processing", "Format timestamps", "Extract fields"],
      correct: ["Filter results after search-time processing"]
    },
    {
      question: "What is the correct syntax for using AND in a Splunk search?",
      options: [
        "field1=val1 + field2=val2",
        "field1=val1 OR field2=val2",
        "field1=val1 AND field2=val2",
        "field1=val1 NOT field2=val2"
      ],
      correct: ["field1=val1 AND field2=val2"]
    },
    {
      question: "Which function allows conditional evaluation in Splunk?",
      options: ["case()", "evalif()", "if()", "where()"],
      correct: ["if()"]
    },
    {
      question: "What is the main purpose of the stats command?",
      options: ["To summarize and aggregate data", "To extract fields", "To enrich lookup data", "To collect metrics"],
      correct: ["To summarize and aggregate data"]
    },
    {
      question: "What does the following command return: stats count by source?",
      options: [
        "Total count of all events",
        "Count of events per source",
        "Count of fields per index",
        "Average event time"
      ],
      correct: ["Count of events per source"]
    },
    {
      question: "The OR operator returns results when:",
      options: [
        "All conditions are false",
        "Any one condition is true",
        "All conditions are true",
        "No condition matches"
      ],
      correct: ["Any one condition is true"]
    },
    {
      question: "Which eval function can be used to check multiple conditions in order?",
      options: ["if()", "case()", "coalesce()", "match()"],
      correct: ["case()"]
    },
    {
      question: "What is the difference between stats and eventstats?",
      options: [
        "eventstats keeps the original events",
        "stats removes original events",
        "Both A and B",
        "Neither"
      ],
      correct: ["Both A and B"]
    },
    {
      question: "Which of the following searches will exclude debug events?",
      options: ["log_level!=DEBUG", "NOT log_level=DEBUG", "log_level<>DEBUG", "Both A and B"],
      correct: ["Both A and B"]
    },
    {
      question: "What command is used for faster summary searches using indexed data?",
      options: ["eventstats", "tstats", "collect", "mstats"],
      correct: ["tstats"]
    },
    {
      question: "In eval, what does if(x>100, 'High', 'Low') do?",
      options: [
        "Creates a new field called High",
        "Returns 'High' if x>100, else 'Low'",
        "Filters only High values",
        "None"
      ],
      correct: ["Returns 'High' if x>100, else 'Low'"]
    },
    {
      question: "Which function replaces NULL values with a default?",
      options: ["coalesce()", "fillnull()", "default()", "replace()"],
      correct: ["coalesce()"]
    },
    {
      question: "What is the purpose of parentheses in Boolean logic?",
      options: [
        "To improve search speed",
        "To group expressions for proper evaluation order",
        "To rename fields",
        "None"
      ],
      correct: ["To group expressions for proper evaluation order"]
    },
    {
      question: "What is the output of stats count by sourcetype if there are 3 sourcetypes?",
      options: [
        "3 rows, each with a count per sourcetype",
        "One total count",
        "An error",
        "A null result"
      ],
      correct: ["3 rows, each with a count per sourcetype"]
    },
    {
      question: "What command would you use to find events generated by a specific host only?",
      options: [
        "search host=<hostname>",
        "filter host=<hostname>",
        "where host==<hostname>",
        "stats host=<hostname>"
      ],
      correct: ["search host=<hostname>"]
    },
    {
      question: "Which command calculates statistical aggregates without removing raw events?",
      options: ["stats", "eventstats", "tstats", "lookup"],
      correct: ["eventstats"]
    },
    {
      question: "What is the correct Boolean logic to show all ERROR or WARN events?",
      options: [
        "log_level=ERROR NOT log_level=WARN",
        "log_level=ERROR OR log_level=WARN",
        "log_level=ERROR AND log_level=WARN",
        "log_level!=ERROR OR WARN"
      ],
      correct: ["log_level=ERROR OR log_level=WARN"]
    },
    {
      question: "Which command helps in filtering results post aggregation?",
      options: ["search", "where", "eval", "table"],
      correct: ["where"]
    },
    {
      question: "What is the function of sort in Splunk?",
      options: ["Summarize data", "Order results ascending or descending", "Rename fields", "Count events"],
      correct: ["Order results ascending or descending"]
    },
    {
      question: "The case() function differs from if() because:",
      options: [
        "It can handle multiple conditions",
        "It’s faster",
        "It only returns true/false",
        "It replaces field values"
      ],
      correct: ["It can handle multiple conditions"]
    },
    {
      question: "Which command counts distinct values in a field?",
      options: [
        "stats dc(field)",
        "stats count(field)",
        "stats unique(field)",
        "stats distinct(field)"
      ],
      correct: ["stats dc(field)"]
    },
    {
      question: "What is the effect of using NOT in a Splunk search?",
      options: ["Adds more fields", "Removes matching events", "Creates calculated fields", "None"],
      correct: ["Removes matching events"]
    },
    {
      question: "What field represents the time the event was indexed?",
      options: ["_time", "_indextime", "timestamp", "index_time"],
      correct: ["_indextime"]
    },
    {
      question: "Which command transforms events into a tabular summary format?",
      options: ["table", "stats", "top", "dedup"],
      correct: ["stats"]
    },
    {
      question: "Why is tstats faster than stats?",
      options: [
        "It uses pre-indexed tsidx summaries",
        "It uses more memory",
        "It skips time fields",
        "It limits events"
      ],
      correct: ["It uses pre-indexed tsidx summaries"]
    }
  ]
};

async function seed() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to DB ✅");

    await Quiz.Quiz.deleteMany({ title: "T.O. Analytics – Splunk Class 4 Quiz" });
    await Quiz.Quiz.create(splunkBooleanStatsQuiz);

    console.log("T.O. Analytics – Splunk Class 4 Quiz 🚀");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

seed();
