const mongoose = require("mongoose");
const Quiz = require("../model/quiz.js");

const MONGO_URI =
  "mongodb+srv://fpasamuelmayowa51:5iX35jgh9yB9P6Im@cluster0.unk3ntp.mongodb.net/datausers"; // Change to your DB URI

const powerUserQuiz = {
  title: "T.O Analytics Power User Exam Quiz",
  description: "Test your knowledge of Splunk Power User concepts and SPL commands.",
  questions: [
    {
      question: "Which one of the following statements about the search command is true?",
      options: [
        "It does not allow the use of wildcards.",
        "It treats field values in a case-sensitive manner.",
        "It can only be used at the beginning of the search pipeline.",
        "It behaves exactly like search strings before the first pipe."
      ],
      correct: ["It behaves exactly like search strings before the first pipe."]
    },
    {
      question: "Which of the following actions can the eval command perform?",
      options: [
        "Remove fields from results.",
        "Create or replace an existing field.",
        "Group transactions by one or more fields.",
        "Save SPL commands to be reused in other searches."
      ],
      correct: ["Create or replace an existing field."]
    },
    {
      question: "When can a pipe follow a macro?",
      options: [
        "A pipe may always follow a macro.",
        "The current user must own the macro.",
        "The macro must be defined in the current app.",
        "Only when sharing is set to global for the macro."
      ],
      correct: ["A pipe may always follow a macro."]
    },
    {
      question: "Data models are composed of one or more of which of the following datasets? (Choose all that apply.)",
       multi: true, // 👈 IMPORTANT
      options: [
        "Events datasets",
        "Search datasets",
        "Transaction datasets",
        "Any child of event, transaction, and search datasets"
      ],
      correct: ["Events datasets", "Search datasets", "Transaction datasets"]
    },
    {
      question: "When using the Field Extractor (FX), which of the following delimiters will work? (Choose all that apply.)",
       multi: true, // 👈 IMPORTANT
      options: ["Tabs", "Pipes", "Colons", "Spaces"],
      correct: ["Tabs", "Pipes", "Colons", "Spaces"]
    },
    {
      question: "Which group of users would most likely use pivots?",
      options: ["Users", "Architects", "Administrators", "Knowledge Managers"],
      correct: ["Knowledge Managers"]
    },
    {
      question: "When multiple event types with different color values are assigned to the same event, what determines the color displayed for the event?",
      options: ["Rank", "Weight", "Priority", "Precedence"],
      correct: ["Priority"]
    },
    {
      question: "Based on the macro definition shown (in the PDF), what is the correct way to execute the macro in a search string?",
      options: [
        " \"convert_sales(euro,� \"(ג‚¬,.9",
        " 'convert_sales(euro,� '(ג‚¬,.9",
        " \"convert_sales($euro$,$� \"(ג‚¬$,$.9$",
        " 'convert_sales($euro$,$� '(ג‚¬$,$.9$"
      ],
       multi: true, // 👈 IMPORTANT
      correct: [" 'convert_sales(euro,� '(ג‚¬,.9"]
    },
    {
      question: "There are several ways to access the field extractor. Which option automatically identifies the data type, source type, and sample event?",
      options: [
        "Event Actions > Extract Fields",
        "Fields sidebar > Extract New Fields",
        "Settings > Field Extractions > New Field Extraction",
        "Settings > Field Extractions > Open Field Extractor"
      ],
       multi: true, // 👈 IMPORTANT
      correct: ["Event Actions > Extract Fields"]
    },
    {
      question: "Which of the following statements would help a user choose between the transaction and stats commands?",
      options: [
        "stats can only group events using IP addresses.",
        "The transaction command is faster and more efficient.",
        "There is a 1000 event limitation with the transaction command.",
        "Use stats when the events need to be viewed as a single correlated event."
      ],
      correct: ["There is a 1000 event limitation with the transaction command."]
    },
    {
      question: "By default, how is acceleration configured in the Splunk Common Information Model (CIM) add-on?",
      options: ["Turned off.", "Turned on.", "Determined automatically based on the source-type.", "Determined automatically based on the data source."],
      correct: ["Turned off."]
    },
    {
      question: "Which of the following statements describe the Common Information Model (CIM)? (Choose all that apply.)",
      options: [
        "CIM is a methodology for normalizing data.",
        "CIM can correlate data from different sources.",
        "The Knowledge Manager uses the CIM to create knowledge objects.",
        "CIM is an app that can coexist with other apps on a single Splunk deployment."
      ],
       multi: true, // 👈 IMPORTANT
      correct: ["CIM is a methodology for normalizing data.", "CIM can correlate data from different sources.", "The Knowledge Manager uses the CIM to create knowledge objects."]
    },
    {
      question: "Which of the following knowledge objects represents the output of an eval expression?",
      options: ["Eval fields", "Calculated fields", "Field extractions", "Calculated lookups"],
      correct: ["Calculated fields"]
    },
    {
      question: "What do events in a transaction have in common?",
      options: [
        "All events in a transaction must have the same timestamp.",
        "All events in a transaction must have the same sourcetype.",
        "All events in a transaction must have the exact same set of fields.",
        "All events in a transaction must be related by one or more fields."
      ],
      correct: ["All events in a transaction must be related by one or more fields."]
    },
    {
      question: "Which delimiters can the Field Extractor (FX) detect? (Choose all that apply.)",
      options: ["Tabs", "Pipes", "Spaces", "Commas"],
      correct: ["Pipes", "Spaces", "Commas"]
    },
    {
      question: "A data model consists of which three types of datasets?",
      options: [
        "Constraint, field, value.",
        "Events, searches, transactions.",
        "Field extraction, regex, delimited.",
        "Transaction, session ID, metadata."
      ],
       multi: true, // 👈 IMPORTANT
      correct: ["Events, searches, transactions."]
    },
    {
      question: "Where are the results of eval commands stored?",
      options: ["In a field.", "In an index.", "In a KV Store.", "In a database."],
      correct: ["In a field."]
    },
    {
      question: "Which of the following statements describe calculated fields? (Choose all that apply.)",
      options: [
        "Calculated fields can be used in the search bar.",
        "Calculated fields can be based on an extracted field.",
        "Calculated fields can only be applied to host and sourcetype.",
        "Calculated fields are shortcuts for performing calculations using the eval command."
      ],
       multi: true, // 👈 IMPORTANT
      correct: ["Calculated fields can be used in the search bar.", "Calculated fields can be based on an extracted field.", "Calculated fields are shortcuts for performing calculations using the eval command."]
    },
    {
      question: "Calculated fields can be based on which of the following?",
      options: ["Tags", "Extracted fields", "Output fields for a lookup", "Fields generated from a search string"],
      correct: ["Extracted fields"]
    },
    {
      question: "When should transaction be used?",
      options: [
        "Only in a large distributed Splunk environment.",
        "When calculating results from one or more fields.",
        "When event grouping is based on start/end values.",
        "When grouping events results in over 1000 events in each group."
      ],
      correct: ["When event grouping is based on start/end values."]
    },
    {
      question: "When performing a regular expression (regex) field extraction using the Field Extractor (FX), what happens when the require option is used?",
      options: [
        "The regex can no longer be edited.",
        "The field being extracted will be required for all future events.",
        "The events without the required field will not display in searches.",
        "Only events with the required string will be included in the extraction."
      ],
      correct: ["Only events with the required string will be included in the extraction."]
    },
    {
      question: "When using | timechart by host, which field is represented in the x-axis?",
      options: ["date", "host", "time", "_time"],
      correct: ["_time"]
    },
    {
      question: "Which of the following is the correct way to use the datamodel command to search fields in the Web data model within the Web dataset?",
      options: [
        "| datamodel Web Web search | fields Web*",
        "| search datamodel Web Web | fields Web*",
        "| datamodel Web Web fields | search Web*",
        "datamodel=Web | search Web | fields Web*"
      ],
      correct: ["| datamodel Web Web search | fields Web*"]
    },
    {
      question: "Which of the following statements describe the command below? source-type=access_combined | transaction JSESSIONID",
      options: [
        "An additional field named maxspan is created.",
        "An additional field named duration is created.",
        "An additional field named eventcount is created.",
        "Events with the same JSESSIONID will be grouped together into a single event."
      ],
       multi: true, // 👈 IMPORTANT
      correct: ["An additional field named duration is created.", "An additional field named eventcount is created.", "Events with the same JSESSIONID will be grouped together into a single event."]
    },
    {
      question: "Which of the following searches will return events containing a tag named Privileged?",
      options: ["tag=Priv", "tag=Priv*", "tag=priv*", "tag=privileged"],
      correct: ["tag=Priv*"]
    },
    {
      question: "Given the macro definition below, what should be entered into the Name and Arguments fields to correctly configure the macro?",
      options: [
        "The macro name is sessiontracker and the arguments are action, JESSIONID.",
        "The macro name is sessiontracker(2) and the arguments are action, JESSIONID.",
        "The macro name is sessiontracker and the arguments are $action$, $JESSIONID$.",
        "The macro name is sessiontracker(2) and the Arguments are $action$, $JESSIONID$."
      ], multi: true, // 👈 IMPORTANT
      correct: ["The macro name is sessiontracker(2) and the arguments are action, JESSIONID."]
    },
    {
      question: "What is required for a macro to accept three arguments?",
      options: [
        "The macro's name ends with (3).",
        "The macro's name starts with (3).",
        "The macro's argument count setting is 3 or more.",
        "Nothing, all macros can accept any number of arguments."
      ],
      correct: ["The macro's name ends with (3)."]
    },
    {
      question: "Which workflow action method can be used when the action type is set to link?",
      options: ["GET", "PUT", "Search", "UPDATE"],
      correct: ["GET"]
    },
    {
      question: "Which of the following statements about tags is true? (Choose all that apply.)",
      options: [
        "Tags are case-insensitive.",
        "Tags are based on field/value pairs.",
        "Tags categorize events based on a search.",
        "Tags are designed to make data more understandable."
      ],
       multi: true, // 👈 IMPORTANT
      correct: ["Tags are based on field/value pairs.", "Tags are designed to make data more understandable."]
    },
    {
      question: "Which of the following statements about macros is true? (Choose all that apply.)",
      options: [
        "Arguments are defined at execution time.",
        "Arguments are defined when the macro is created.",
        "Argument values are used to resolve the search string at execution time.",
        "Argument values are used to resolve the search string when the macro is created."
      ],
       multi: true, // 👈 IMPORTANT
      correct: ["Arguments are defined when the macro is created.", "Argument values are used to resolve the search string at execution time."]
    },
    {
      question: "Information needed to create a GET workflow action includes which of the following? (Choose all that apply.)",
      options: [
        "A name for the workflow action.",
        "A URI where the user will be directed at search time.",
        "A label that will appear in the Event Action menu at search time.",
        "A name for the URI where the user will be directed at search time."
      ],
       multi: true, // 👈 IMPORTANT
      correct: ["A name for the workflow action.", "A label that will appear in the Event Action menu at search time."]
    },
    {
      question: "Which of the following can be used with the eval command tostring function? (Choose all that apply.)",
      options: ['"hex"', '"commas"', '"decimal"', '"duration"'],
       multi: true, // 👈 IMPORTANT
      correct: ['"hex"', '"commas"', '"duration"']
    },
    {
      question: "Which of the following searches show a valid use of a macro? (Choose all that apply.)",
      options: [
        "index=main source=mySource oldField=* |'makeMyField(oldField)'| table _time newField",
        "index=main source=mySource oldField=* | stats if('makeMyField(oldField)') | table _time newField",
        "index=main source=mySource oldField=* | eval newField='makeMyField(oldField)'| table _time newField",
        "index=main source=mySource oldField=* | \"'newField('makeMyField(oldField)')'\" | table _time newField"
      ],
       multi: true, // 👈 IMPORTANT
      correct: [
        "index=main source=mySource oldField=* |'makeMyField(oldField)'| table _time newField",
        "index=main source=mySource oldField=* | eval newField='makeMyField(oldField)'| table _time newField"
      ]
    },
    {
      question: "A user wants to convert numeric field values to strings and also to sort on those values. Which command should be used first, the eval or the sort?",
      options: [
        "It doesn't matter whether eval or sort is used first.",
        "Convert the numeric to a string with eval first, then sort.",
        "Use sort first, then convert the numeric to a string with eval.",
        "You cannot use the sort command and the eval command on the same field."
      ],
      correct: ["Use sort first, then convert the numeric to a string with eval."]
    },
    {
      question: "Which Knowledge Object does the Splunk Common Information Model (CIM) use to normalize data, in addition to field aliases, event types, and tags?",
      options: ["Macros", "Lookups", "Workflow actions", "Field extractions"],
      correct: ["Lookups"]
    },
    {
      question: "Which of the following statements describe data model acceleration? (Choose all that apply.)",
      options: [
        "Root events cannot be accelerated.",
        "Accelerated data models cannot be edited.",
        "Private data models cannot be accelerated.",
        "You must have administrative permissions or the accelerate_datamodel capability to accelerate a data model."
      ],
       multi: true, // 👈 IMPORTANT
      correct: ["Accelerated data models cannot be edited.", "Private data models cannot be accelerated.", "You must have administrative permissions or the accelerate_datamodel capability to accelerate a data model."]
    },
    {
      question: "How does a user display a chart in stack mode?",
      options: [
        "By using the stack command.",
        "By turning on the Use Trellis Layout option.",
        "By changing Stack Mode in the Format menu.",
        "You cannot display a chart in stack mode, only a timechart."
      ],
      correct: ["By changing Stack Mode in the Format menu."]
    },
    {
      question: "If no value is specified with the fillnull command, what default value will be used?",
      options: ["0", "N/A", 'Ò€"', "NULL"],
      correct: ["0"]
    },
    {
      question: "What other syntax will produce exactly the same results as | chart count over vendor_action by user?",
      options: [
        "| chart count by vendor_action, user",
        "| chart count over vendor_action, user",
        "| chart count by vendor_action over user",
        "| chart count over user by vendor_action"
      ],
      correct: ["| chart count by vendor_action, user"]
    },
    {
      question: "What are the two parts of a root event dataset?",
      options: ["Fields and variables.", "Fields and attributes.", "Constraints and fields.", "Constraints and lookups."],
      correct: ["Constraints and fields."]
    },
    {
      question: "When using timechart, how many fields can be listed after a by clause?",
      options: [
        "0, because timechart doesn't support using a by clause.",
        "1, because _time is already implied as the x-axis.",
        "2, because one field would represent the x-axis and the other would represent the y-axis.",
        "There is no limit specific to timechart."
      ],
      correct: ["1, because _time is already implied as the x-axis."]
    },
    {
      question: "A field alias has been created based on an original field. A search without any transforming commands is then executed in Smart Mode. Which field name appears in the results?",
      options: [
        "Both will appear in the All Fields list, but only if the alias is specified in the search.",
        "Both will appear in the Interesting Fields list, but only if they appear in at least 20 percent of events.",
        "The original field only appears in All Fields list and the alias only appears in the Interesting Fields list.",
        "The alias only appears in the All Fields list and the original field only appears in the Interesting Fields list."
      ],
      correct: ["Both will appear in the Interesting Fields list, but only if they appear in at least 20 percent of events."]
    },
    {
      question: "Which of the following statements describes macros?",
      options: [
        "A macro is a reusable search string that must contain the full search.",
        "A macro is a reusable search string that must have a fixed time range.",
        "A macro is a reusable search string that may have a flexible time range.",
        "A macro is a reusable search string that must contain only a portion of the search."
      ],
      correct: ["A macro is a reusable search string that may have a flexible time range."]
    },
    {
      question: "In what order are the following knowledge objects/configurations applied?",
      options: [
        "Field Aliases, Field Extractions, Lookups",
        "Field Extractions, Field Aliases, Lookups",
        "Field Extractions, Lookups, Field Aliases",
        "Lookups, Field Aliases, Field Extractions"
      ],
      correct: ["Field Extractions, Field Aliases, Lookups"]
    },
    {
      question: "In which of the following scenarios is an event type more effective than a saved search?",
      options: [
        "When a search should always include the same time range.",
        "When a search needs to be added to other users' dashboards.",
        "When the search string needs to be used in future searches.",
        "When formatting needs to be included with the search string."
      ],
      correct: ["When the search string needs to be used in future searches."]
    },
    {
      question: "When using the transaction command, what does the argument maxspan do?",
      options: [
        "Sets the maximum total time between events in a transaction.",
        "Sets the maximum length of all the events within a transaction.",
        "Sets the maximum total time between the earliest and latest events in a transaction.",
        "Sets the maximum length that any single event can reach to be included in the transaction."
      ],
      correct: ["Sets the maximum total time between the earliest and latest events in a transaction."]
    },
    {
      question: "When creating a Search workflow action, which field is required?",
      options: ["Search string", "Data model name", "Permission setting", "An eval statement"],
      correct: ["Search string"]
    },
    {
      question: "To identify all of the contributing events within a transaction that contain at least one REJECT event, which syntax is correct?",
      options: [
        "index=main REJECT | transaction sessionid",
        "index=main | transaction sessionid | search REJECT",
        "index=main | transaction sessionid | where transaction=reject",
        "index=main | transaction sessionid | where transaction=\"REJECT*\""
      ],
      correct: ["index=main | transaction sessionid | search REJECT"]
    },
    {
      question: "After manually editing a regular expression (regex), which of the following statements is true?",
      options: [
        "Changes made manually can be reverted in the Field Extractor (FX) UI.",
        "It is no longer possible to edit the field extraction in the Field Extractor (FX) UI.",
        "It is not possible to manually edit a regular expression (regex) that was created using the Field Extractor (FX) UI.",
        "The Field Extractor (FX) UI keeps its own version of the field extraction in addition to the one that was manually edited"
      ],
      correct: ["It is no longer possible to edit the field extraction in the Field Extractor (FX) UI."]
    },
    {
      question: "Which of the following statements describes POST workflow actions?",
      options: [
        "Configuration of a POST workflow action includes choosing a sourcetype.",
        "POST workflow actions can be configured to send email to the URI location.",
        "By default, POST workflow actions are shown in both the event and field menus.",
        "POST workflow actions can be configured to send POST arguments to the URI location."
      ],
      correct: ["POST workflow actions can be configured to send POST arguments to the URI location."]
    },
    {
      question: "Which of the following statements is true, especially in large environments?",
      options: [
        "Use the stats command when you need to group events by two or more fields.",
        "The stats command is faster and more efficient than the transaction command.",
        "The transaction command is faster and more efficient than the stats command.",
        "Use the transaction command when you want to see the results of a calculation."
      ],
      correct: ["The stats command is faster and more efficient than the transaction command."]
    },
    {
      question: "What does the following search do? index=corndog type= mysterymeat action=eaten | stats count as corndog_count by user",
      options: [
        "Creates a table of the total count of users and split by corndogs.",
        "Creates a table of the total count of mysterymeat corndogs split by user.",
        "Creates a table with the count of all types of corndogs eaten split by user.",
        "Creates a table that groups the total number of users by vegetarian corndogs."
      ],
      correct: ["Creates a table of the total count of mysterymeat corndogs split by user."]
    },
    {
      question: "Which of the following statements about event types is true? (Choose all that apply.)",
      options: [
        "Event types can be tagged.",
        "Event types must include a time range.",
        "Event types categorize events based on a search.",
        "Event types can be a useful method for capturing and sharing knowledge."
      ],
       multi: true, // 👈 IMPORTANT
      correct: ["Event types can be tagged.", "Event types categorize events based on a search."]
    },
    {
      question: "The Field Extractor (FX) is used to extract a custom field. A report can be created using this custom field. The created report can then be shared with other people in the organization. If another person in the organization runs the shared report and no results are returned, why might this be? (Choose all that apply.)",
      options: [
        "Fast mode is enabled.",
        "The dashboard is private.",
        "The extraction is private.",
        "The person in the organization running the report does not have access to the index."
      ],
       multi: true, // 👈 IMPORTANT
      correct: ["The extraction is private.", "The person in the organization running the report does not have access to the index."]
    },
    {
      question: "Which of the following statements describe the search string below? | datamodel Application_State All_Application_State search",
      options: [
        "Events will be returned from dataset named Application_State.",
        "Events will be returned from the data model named Application_State.",
        "Events will be returned from the data model named All_Application_State.",
        "No events will be returned because the pipe should occur after the datamodel command."
      ],
      correct: ["Events will be returned from the data model named Application_State."]
    },
    {
      question: "What is the correct syntax to search for a tag associated with a value on a specific field?",
      options: [
        "tag=<field>",
        "tag=<field>(<tagname>)",
        "tag=<field>::<tagname>",
        "tag::<field>=<tagname>"
      ],
      correct: ["tag::<field>=<tagname>"]
    },
    {
      question: "In most large Splunk environments, what is the most efficient command that can be used to group events by fields?",
      options: ["join", "stats", "streamstats", "transaction"],
      correct: ["stats"]
    },
    {
      question: "Which workflow uses field values to perform a secondary search?",
      options: ["POST", "Action", "Search", "Sub-search"],
      correct: ["Search"]
    },
    {
      question: "Which of the following statements describes field aliases?",
      options: [
        "Field alias names replace the original field name.",
        "Field aliases can be used in lookup file definitions.",
        "Field aliases only normalize data across sources and sourcetypes.",
        "Field alias names are not case sensitive when used as part of a search."
      ],
      correct: ["Field aliases can be used in lookup file definitions."]
    },
    {
      question: "Which statement is true? Pivot is used for creating datasets. Data models are randomly structured datasets. Pivot is used for creating reports and dashboards. In most cases, each Splunk user will create their own data model.",
      options: [
        "Pivot is used for creating datasets.",
        "Data models are randomly structured datasets.",
        "Pivot is used for creating reports and dashboards.",
        "In most cases, each Splunk user will create their own data model."
      ],
      correct: ["Pivot is used for creating reports and dashboards."]
    },
    {
      question: "Which of the following statements describes the use of the Field Extractor (FX)?",
      options: [
        "The Field Extractor automatically extracts all fields at search time.",
        "The Field Extractor uses PERL to extract fields from the raw events.",
        "Fields extracted using the Field Extractor persist as knowledge objects.",
        "Fields extracted using the Field Extractor do not persist and must be defined for each search."
      ],
      correct: ["Fields extracted using the Field Extractor persist as knowledge objects."]
    },
    {
      question: "Which of the following searches would return a report of sales by product_name?",
      options: [
        "chart sales by product_name",
        "chart sum(price) as sales by product_name",
        "stats sum(price) as sales over product_name",
        "timechart list(sales), values(product_name)"
      ],
      correct: ["chart sum(price) as sales by product_name"]
    },
    {
      question: "Which of the following data models are included in the Splunk Common Information Model (CIM) add-on? (Choose all that apply.)",
      options: ["Alerts", "Email", "Databases", "User permissions"],
      correct: ["Alerts", "Email", "Databases"]
    },
    {
      question: "What is a limitation of searches generated by workflow actions?",
      options: [
        "Searches generated by workflow actions cannot use macros.",
        "Searches generated by workflow actions must be less than 256 characters long.",
        "Searches generated by workflow actions must run in the same app as the workflow action.",
        "Searches generated by workflow actions run with the same permissions as the user running them."
      ],
      correct: ["Searches generated by workflow actions run with the same permissions as the user running them."]
    },
    {
      question: "Which of the following searches would create a graph similar to the one shown in the PDF?",
      options: [
        "index=_internal sourcetype=SavedSplunker | fields sourcetype, status | transaction status maxspan=1d | stats count by status",
        "index=_internal sourcetype=SavedSplunker | fields sourcetype, status | transaction status maxspan=1d | chart count OVER status by _time",
        "index=_internal sourcetype=SavedSplunker | fields sourcetype, status | transaction status maxspan=1d | timechart count by status",
        "None of these searches would generate a similar graph."
      ],
      correct: ["None of these searches would generate a similar graph."]
    },
    {
      question: "What does the transaction command do?",
      options: [
        "Groups a set of transactions based on time.",
        "Creates a single event from a group of events.",
        "Separates two events based on one or more values.",
        "Returns the number of credit card transactions found in the event logs."
      ],
      correct: ["Creates a single event from a group of events."]
    },
    {
      question: "What is the relationship between data models and pivots?",
      options: [
        "Data models provide the datasets for pivots.",
        "Pivots and data models have no relationship.",
        "Pivots and data models are the same thing.",
        "Pivots provide the datasets for data models."
      ],
      correct: ["Data models provide the datasets for pivots."]
    },
    {
      question: "Which of the following statements describes Search workflow actions?",
      options: [
        "By default, Search workflow actions will run as a real-time search.",
        "Search workflow actions can be configured as scheduled searches.",
        "The user can define the time range of the search when creating the workflow action.",
        "Search workflow actions cannot be configured with a search string that includes the transaction command."
      ],
      correct: ["The user can define the time range of the search when created the workflow action."]
    },
    {
      question: "Which of the following commands support the same set of functions?",
      options: [
        "stats, eval, table",
        "search, where, eval",
        "stats, chart, timechart",
        "transaction, chart, timechart"
      ],
      correct: ["stats, chart, timechart"]
    },
    {
      question: "The eval command allows you to do which of the following? (Choose all that apply.)",
      options: ["Format values", "Convert values", "Perform calculations", "Use conditional statements"],
      correct: ["Format values", "Convert values", "Perform calculations", "Use conditional statements"]
    },
    {
      question: "When using the timechart command, how can a user group the events into buckets based on time?",
      options: ["Using the span argument.", "Using the duration argument.", "Using the interval argument.", "Adjusting the fieldformat options."],
      correct: ["Using the span argument."]
    },
    {
      question: "Which of the following statements about data models and pivot are true? (Choose all that apply.)",
      options: [
        "They are both knowledge objects.",
        "Data models are created out of datasets called pivots.",
        "Pivot requires users to input SPL searches on data models.",
        "Pivot allows the creation of data visualizations that present different aspects of a data model."
      ],
      correct: ["Pivot allows the creation of data visualizations that present different aspects of a data model."]
    },
    {
      question: "Data model fields can be added using the Auto-Extracted method. Which of the following statements describe Auto-Extracted fields? (Choose all that apply.)",
      options: [
        "Auto-Extracted fields can be hidden in Pivot.",
        "Auto-Extracted fields can have their data type changed.",
        "Auto-Extracted fields can be given a friendly name for use in Pivot.",
        "Auto-Extracted fields can be added if they already exist in the dataset with constraints."
      ],
       multi: true, // 👈 IMPORTANT
      correct: ["Auto-Extracted fields can be hidden in Pivot.", "Auto-Extracted fields can have their data type changed.", "Auto-Extracted fields can be given a friendly name for use in Pivot.", "Auto-Extracted fields can be added if they already exist in the dataset with constraints."]
    },
    {
      question: "Which type of visualization shows relationships between discrete values in three dimensions?",
      options: ["Pie chart", "Line chart", "Bubble chart", "Scatter chart"],
      correct: ["Bubble chart"]
    },
    {
      question: "Which of the following is a function of the Splunk Common Information Model (CIM)?",
      options: [
        "Normalizing data across a Splunk deployment.",
        "Providing templates for reports and dashboards.",
        "Algorithmically shifting events to other indexes.",
        "Reingesting previously indexed data with new field names."
      ],
      correct: ["Normalizing data across a Splunk deployment."]
    },
    {
      question: "What information must be included when using the datamodel command?",
      options: ["status field", "Multiple indexes", "Data model field name.", "Data model dataset name."],
      correct: ["Data model dataset name."]
    },
    {
      question: "Which of the following workflow actions can be executed from search results? (Choose all that apply.)",
      options: ["GET", "POST", "LOOKUP", "Search"],
      correct: ["GET", "POST", "Search"]
    },
    {
      question: "Which of the following eval command functions is valid?",
      options: ["int()", "count()", "print()", "tostring()"],
      correct: ["tostring()"]
    },
    {
      question: "A calculated field may be based on which of the following?",
      options: ["Lookup tables", "Extracted fields", "Regular expressions", "Fields generated within a search string"],
      correct: ["Extracted fields"]
    },
    {
      question: "A data model can consist of what three types of datasets?",
      options: [
        "Pivot, searches, and events.",
        "Pivot, events, and transactions.",
        "Searches, transactions, and pivot.",
        "Events, searches, and transactions."
      ],
      correct: ["Events, searches, and transactions."]
    },
    {
      question: "When is a GET workflow action needed?",
      options: [
        "To send field values to an external resource.",
        "To retrieve information from an external resource.",
        "To use field values to perform a secondary search.",
        "To define how events flow from forwarders to indexes."
      ],
      correct: ["To retrieve information from an external resource."]
    },
    {
      question: "Which of the following statements describe GET workflow actions?",
      options: [
        "GET workflow actions must be configured with POST arguments.",
        "Configuration of GET workflow actions includes choosing a sourcetype.",
        "Label names for GET workflow actions must include a field name surrounded by dollar signs.",
        "GET workflow actions can be configured to open the URI link in the current window or in a new window."
      ],
      correct: ["GET workflow actions can be configured to open the URI link in the current window or in a new window."]
    },
    {
      question: "Which are valid ways to create an event type? (Choose all that apply.)",
      options: [
        "By using the searchtypes command in the search bar.",
        "By editing the event_type stanza in the props.conf file.",
        "By going to the Settings menu and clicking Event Types > New.",
        "By selecting an event in search results and clicking Event Actions > Build Event Type."
      ],
       multi: true, // 👈 IMPORTANT
      correct: ["By going to the Settings menu and clicking Event Types > New.", "By selecting an event in search results and clicking Event Actions > Build Event Type."]
    },
    {
      question: "Which command can include both an over and a by clause to divide results into sub-groupings?",
      options: ["chart", "stats", "xyseries", "transaction"],
      correct: ["chart"]
    },
    {
      question: "When should you use the transaction command instead of the stats command?",
      options: [
        "When you need to group on multiple values.",
        "When duration is irrelevant in search results.",
        "When you have over 1000 events in a transaction.",
        "When you need to group based on start and end constraints."
      ],
      correct: ["When you need to group based on start and end constraints."]
    },
    {
      question: "Which of the following statements describes POST workflow actions?",
      options: [
        "POST workflow actions are always encrypted.",
        "POST workflow actions cannot use field values in their URI.",
        "POST workflow actions cannot be created on custom sourcetypes.",
        "POST workflow actions can open a web page in either the same window or a new window."
      ],
      correct: ["POST workflow actions can open a web page in either the same window or a new window."]
    },
    {
      question: "What does the Splunk Common Information Model (CIM) add-on include? (Choose all that apply.)",
      options: ["Custom visualizations", "Pre-configured data models", "Fields and event category tags", "Automatic data model acceleration"],
       multi: true, // 👈 IMPORTANT
      correct: ["Pre-configured data models", "Fields and event category tags"]
    },
    {
      question: "Which of the following statements about tags is true?",
      options: [
        "Tags are case insensitive.",
        "Tags are created at index time.",
        "Tags can make your data more understandable.",
        "Tags are searched by using the syntax tag::"
      ],
      correct: ["Tags can make your data more understandable."]
    },
    {
      question: "Which of the following file formats can be extracted using a delimiter field extraction?",
      options: ["CSV", "PDF", "XML", "JSON"],
      correct: ["CSV"]
    },
    {
      question: "A user wants to create a new field alias for a field that appears in two sourcetypes. How many field aliases need to be created?",
      options: [
        "One.",
        "Two.",
        "It depends on whether the original fields have the same name.",
        "It depends on whether the two sourcetypes are associated with the same index."
      ],
      correct: ["Two."]
    },
    {
      question: "In the following eval statement, what is the value of description if the status is 503? index=main | eval description=case(status==200, \"OK\", status==404, \"Not found\", status==500, \"Internal Server Error\")",
      options: [
        "The description field would contain no value.",
        "The description field would contain the value 0.",
        "The description field would contain the value \"Internal Server Error\".",
        "This statement would produce an error in Splunk because it is incomplete."
      ],
      correct: ["The description field would contain no value."]
    },
    {
      question: "In which Settings section are macros defined?",
      options: ["Fields", "Tokens", "Advanced Search", "Searches, Reports, Alerts"],
      correct: ["Advanced Search"]
    },
    {
      question: "Which of the following statements describes calculated fields?",
      options: [
        "Calculated fields are only used on fields added by lookups.",
        "Calculated fields are a shortcut for repetitive and complex eval commands.",
        "Calculated fields are a shortcut for repetitive and complex calc commands.",
        "Calculated fields automatically calculate the simple moving average for indexed fields."
      ],
      correct: ["Calculated fields are a shortcut for repetitive and complex eval commands."]
    },
    {
      question: "Which of the following are required to create a POST workflow action?",
      options: [
        "Label, URI, search string.",
        "XML attributes, URI, name.",
        "Label, URI, post arguments.",
        "URI, search string, time range picker."
      ],
      correct: ["Label, URI, post arguments."]
    },
    {
      question: "Which of the following is one of the pre-configured data models included in the Splunk Common Information Model (CIM) add-on?",
      options: ["Access", "Accounting", "Authorization", "Authentication"],
      correct: ["Authentication"]
    },
    {
      question: "Which of the following statements describe the search below? (Choose all that apply.) index=main | transaction clientip host maxspan=30s max-pause=5s",
      options: [
        "Events in the transaction occurred within 5 seconds.",
        "It groups events that share the same clientip and host.",
        "The first and last events are no more than 5 seconds apart.",
        "The first and last events are no more than 30 seconds apart"
      ],
       multi: true, // 👈 IMPORTANT
      correct: ["It groups events that share the same clientip and host.", "The first and last events are no more than 30 seconds apart"]
    },
    {
      question: "Consider the following search: index=web sourcetype=access_combined The log shows several events that share the same JSESSIONID value (SD421K26502F783). View the events as a group. From the following list, which search groups events by JSESSIONID?",
      options: [
        "index-web sourcetype=access_combined | transaction JSESSIONID | search SD42IK26502F783",
        "index-web sourcetype=access_combined | highlight JSESSIONID | search SD421K26502F783",
        "index=web sourcetype=access_combined SD42IK26502F783 | table JSESSIONID",
        "index=web sourcetype=access_combined JSESSIONID"
      ],
      correct: ["index=web sourcetype=access_combined JSESSIONID"]
    },
    {
      question: "When defining a macro, what are the required elements?",
      options: [
        "Name and a validation error message.",
        "Definition and arguments.",
        "Name and arguments.",
        "Name and definition."
      ],
      correct: ["Name and definition."]
    },
    {
      question: "Where are the descriptions of the data models that come with the Splunk Common Information Model (CIM) Add-on documented?",
      options: [
        "Pivot users manual.",
        "Search and reporting user manual.",
        "CIM Add-on manual.",
        "Data model command reference guide."
      ],
      correct: ["CIM Add-on manual."]
    },
    {
      question: "What is the correct syntax to find events associated with a tag?",
      options: ["tag:=", "tags=", "tags:=", "tag="],
      correct: ["tag="]
    },
    {
      question: "Which of the following is true about the Splunk Common Information Model (CIM)?",
      options: [
        "The CIM contains 28 pre-configured datasets.",
        "The data models included in the CIM are configured with data model acceleration turned on.",
        "The data models included in the CIM are configured with data model acceleration turned off.",
        "The CIM is an app that needs to run on the indexer."
      ],
      correct: ["The data models included in the CIM are configured with data model acceleration turned off."]
    },
    {
      question: "Consider the following search run over a time range of last 7 days: index=web sourcetype=access_combined | timechart avg(bytes) by product_name Which option is used to change the default time span so that results are grouped into 12 hour intervals?",
      options: ["timespan=12", "span=12h", "timespan=12h", "span=12"],
      correct: ["span=12h"]
    },
    {
      question: "When would transaction be used instead of stats?",
      options: [
        "To have a faster and more efficient search.",
        "To see results of a calculation.",
        "To group events based on start/end values.",
        "To group events based on a single field value."
      ],
      correct: ["To group events based on start/end values."]
    },
    {
      question: "Given the following eval statement: ... | eval field1 = if(isnotnull(fieid1),field1,0), field2 = if(isnull Which of the following is the equivalent using fillnull?",
      options: [
        "There is no equivalent expression using fillnull first.",
        "... | fillnull values=(0,\"NO-VALUE\") fields=(field1,field2)",
        "... | fillnull field1|' fillnull value=\"NO-VALUE\" field2",
        "... | fillnull value=0 field1 | fillnull field2"
      ],
      correct: ["... | fillnull value=0 field1 | fillnull field2"]
    },
    {
      question: "The Splunk Common Information Model (CIM) is a collection of what type of knowledge object?",
      options: ["Saved searches", "Lookups", "KV Store", "Data models"],
      correct: ["Data models"]
    },
    {
      question: "How is a Search Workflow Action configured to run at the same time range as the original search?",
      options: [
        "Select the \"Use the same time range as the search that created the field listing\" checkbox.",
        "Set the earliest time to match the original search.",
        "Select the same time range from the time-range picker.",
        "Select the \"Overwrite time range with the original search\" checkbox."
      ],
      correct: ["Select the \"Use the same time range as the search that created the field listing\" checkbox."]
    },
    {
      question: "A calculated field is a shortcut for performing repetitive, long, or complex transformations using which of the following commands?",
      options: ["transaction", "eval", "lookup", "stats"],
      correct: ["eval"]
    },
    {
      question: "When using the transaction command, how are evicted transactions identified?",
      options: [
        "_txn field is set to 1, or true.",
        "open_txn field is set to 1, or true.",
        "max_txn field is set to 0, or false.",
        "closed_txn field is set to 0, or false."
      ],
      correct: ["closed_txn field is set to 0, or false."]
    },
    {
      question: "How are arguments defined within the macro search string?",
      options: ['"arg"', '%arg%', '$arg$', "'arg'"],
      correct: ["$arg$"]
    },
    {
      question: "Which of the following objects can a calculated field use as a source?",
      options: [
        "An alias of a field.",
        "A field added by an automatic lookup.",
        "The tag field.",
        "The eventtype field."
      ],
      correct: ["An alias of a field."]
    },
    {
      question: "How are event types different from saved reports?",
      options: [
        "Event types can be shared with Splunk users and added to dashboards.",
        "Event types include formatting of the search results.",
        "Event types do not include a time range.",
        "Event types cannot be used to organize data into categories."
      ],
      correct: ["Event types do not include a time range."]
    },
    {
      question: "When creating a data model, which root dataset requires at least one constraint?",
      options: [
        "Root event dataset",
        "Root transaction dataset",
        "Root search dataset",
        "Root child dataset"
      ],
      correct: ["Root event dataset"]
    },
    {
      question: "Which search retrieves events with the event type web_errors?",
      options: ["tag=web_errors", "eventtype=web_errors", "eventtype(web_errors)", "eventtype \"web_errors\""],
      correct: ["eventtype=web_errors"]
    },
    {
      question: "When used with the timechart command, which value of the limit argument returns all values?",
      options: ["limit=none", "limit=all", "limit=0", "limit=*"],
      correct: ["limit=0"]
    },
    {
      question: "Which of the following statements best describes a macro?",
      options: [
        "A macro is a method of categorizing events based on a search.",
        "A macro is a knowledge object that enables you to schedule searches for specific events.",
        "A macro is a portion of a search that can be reused in multiple places.",
        "A macro is a way to associate an additional (new) name with an existing field name."
      ],
      correct: ["A macro is a portion of a search that can be reused in multiple places."]
    }
  ]
};

async function seed() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to DB ✅");

    await Quiz.Quiz.deleteMany({ title: "T.O Analytics Power User Exam Quiz" });
    await Quiz.Quiz.create(powerUserQuiz);

    console.log("T.O Analytics Power User Exam Quiz 🚀 inserted!");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

seed();
