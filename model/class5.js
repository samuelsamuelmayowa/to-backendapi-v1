const mongoose = require("mongoose");
const Quiz = require("../model/quiz.js");

const MONGO_URI ="mongodb+srv://fpasamuelmayowa51:5iX35jgh9yB9P6Im@cluster0.unk3ntp.mongodb.net/datausers"
//   "mongodb+srv://fpasamuelmayowa51:5iX35jgh9yB9P6Im@cluster0.unk3ntp.mongodb.net/datausers";

const splunkAdvancedSPLWithReason = {
  title: "T.O Analytics – Splunk Class 5 Quiz",
  description:
    "Advanced SPL quiz including reasoning for each answer.",
  questions: [
    {
      question:
        'When using coalesce(fieldA, fieldB, "Unknown"), which value will Splunk return if fieldA="" (empty string) and fieldB=NULL?',
      options: ["fieldA", "fieldB", '"Unknown"', "NULL"],
      correct: ["fieldA"],
      reason:
        "Empty string is a real value in Splunk (not null), so coalesce returns it."
    },
    {
      question:
        "Which situation leads coalesce to return different results depending on field order?",
      options: [
        "Both fields always have values",
        "Only one field has values",
        "Fields contain null values inconsistently",
        "Both fields always null"
      ],
      correct: ["Fields contain null values inconsistently"],
      reason:
        "If some events have some fields null and others not, the field order changes which value is returned."
    },
    {
      question:
        'In eval clean=coalesce(field1, field2, "no component"), how is "no component" treated?',
      options: [
        "A field name",
        "A literal string",
        "A null placeholder",
        "A dynamic field"
      ],
      correct: ["A literal string"],
      reason:
        '"no component" is treated as a real string value.'
    },
    {
      question:
        "Why does search ComponentClean = no component fail without quotes?",
      options: [
        "Splunk can't match spaces",
        "Space splits into tokens",
        "Fields cannot contain spaces",
        "Values must always be quoted"
      ],
      correct: ["Space splits into tokens"],
      reason:
        "Without quotes, Splunk reads `no component` as two separate tokens."
    },
    {
      question: "Which is case-sensitive in Splunk?",
      options: [
        "Commands only",
        "Fields only",
        "Commands and fields",
        "Commands, fields, and values"
      ],
      correct: ["Commands and fields"],
      reason:
        "Splunk commands and field names are case-sensitive."
    },
    {
      question:
        "What happens if you search componenttype when the field is ComponentType?",
      options: [
        "It matches automatically",
        "It fails",
        "It matches if quoted",
        "It depends on the indexer"
      ],
      correct: ["It fails"],
      reason:
        "Field names must match their exact casing."
    },
    {
      question: "When does tstats outperform stats the most?",
      options: [
        "Small indexes",
        "Without acceleration",
        "Large accelerated models",
        "When using wildcards"
      ],
      correct: ["Large accelerated models"],
      reason:
        "tstats reads pre-summarized datamodel acceleration files, giving speed on large datasets."
    },
    {
      question: "Why is tstats faster?",
      options: [
        "Skips indexers",
        "Uses TSIDX metadata",
        "Uses more CPU",
        "Uses cached searches"
      ],
      correct: ["Uses TSIDX metadata"],
      reason:
        "tstats reads TSIDX metadata instead of full raw events."
    },
    {
      question: "Why can eval fail after stats?",
      options: [
        "Stats drops fields",
        "Eval needs raw data",
        "Stats lowercases fields",
        "Eval only works first"
      ],
      correct: ["Stats drops fields"],
      reason:
        "stats removes fields not included in the aggregation, so eval has nothing to reference."
    },
    {
      question:
        'Which SPL correctly matches component_clean="no component"?',
      options: [
        "search component_clean=no component",
        'search component_clean="no component"',
        'search "component_clean"="no component"',
        "B and C"
      ],
      correct: ["B and C"],
      reason:
        "Both versions properly quote the value with spaces."
    },
    {
      question:
        "What happens if you write stats count by sourcetype using lowercase by?",
      options: [
        "Query fails",
        "Query works only with uppercase",
        "Fields must be uppercase",
        "It works (case-insensitive clause)"
      ],
      correct: ["It works (case-insensitive clause)"],
      reason:
        "Splunk command clauses like BY are case-insensitive."
    },
    {
      question: 'How does coalesce treat empty string ""?',
      options: ["As NULL", "As a value", "As error", "Skipped automatically"],
      correct: ["As a value"],
      reason:
        "Empty string is still a value, not null."
    },
    {
      question: "Which is true about search?",
      options: [
        "Works only on indexed fields",
        "Works after eval",
        "Cannot search strings",
        "Only works before stats"
      ],
      correct: ["Works after eval"],
      reason:
        "`search` can filter pipeline results, including values created by `eval`."
    },
    {
      question: "What happens when searching for an eval-created value?",
      options: [
        "Cannot be searched",
        "Must be searched before eval",
        "Search sees mutated pipeline",
        "Must use where"
      ],
      correct: ["Search sees mutated pipeline"],
      reason:
        "search operates on the transformed results after eval modifies events."
    },
    {
      question: "What are TSIDX files?",
      options: [
        "Store raw data",
        "Store structured metadata",
        "For summary indexes only",
        "Replace indexed fields"
      ],
      correct: ["Store structured metadata"],
      reason:
        "TSIDX holds metadata that makes accelerated searches fast."
    },
    {
      question: "Why does tstats return fewer fields than stats?",
      options: [
        "Fields missing from datamodel",
        "Can't read strings",
        "tstats collapses fields",
        "Bug in acceleration"
      ],
      correct: ["Fields missing from datamodel"],
      reason:
        "tstats only returns fields included in the datamodel acceleration."
    },
    {
      question: "Why is search StatusCode=200 OR 404 wrong?",
      options: [
        "OR unsupported",
        "Must quote values",
        "404 becomes standalone term",
        "Cannot compare numbers"
      ],
      correct: ["404 becomes standalone term"],
      reason:
        "Splunk interprets `404` as a separate search token, not `StatusCode=404`."
    },
    {
      question:
        "Which SPL finds events where either fieldA or fieldB has a non-null value?",
      options: [
        "where coalesce(fieldA, fieldB)",
        "search fieldA=* OR fieldB=*",
        "eval x=coalesce(fieldA,fieldB) | where x!=\"\"",
        "B and C"
      ],
      correct: ["B and C"],
      reason:
        "Both methods detect events where either field contains a value."
    },
    {
      question: "search field=value does what?",
      options: [
        "Searches raw text",
        "Restricts to field=value events",
        "Matches value anywhere",
        "Aggregates results"
      ],
      correct: ["Restricts to field=value events"],
      reason:
        "It compares the event field explicitly to the value."
    },
    {
      question: "Where do you check query performance timing?",
      options: [
        "Job Inspector",
        "Monitoring Console",
        "Server Controls",
        "Clustering Dashboard"
      ],
      correct: ["Job Inspector"],
      reason:
        "Job Inspector shows detailed timing, optimization, and search pipeline execution data."
    }
  ]
};

async function seed() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to DB ✅");

    await Quiz.Quiz.deleteMany({
      title: "T.O Analytics – Splunk Class 5 Quiz"
    });
    await Quiz.Quiz.create(splunkAdvancedSPLWithReason);

    console.log("T.O. Analytics – Splunk Advanced SPL Quiz (With Explanations) 🚀");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

seed();
