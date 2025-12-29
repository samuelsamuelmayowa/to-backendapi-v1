const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// ✅ Question schema (for each quiz question)
const questionSchema = new Schema({
  question: { type: String, required: true },
  options: [{ type: String, required: true }],
  correct: { type: [String], required: true }, // supports multiple correct answers
  reason: { type: String } 
});

// ✅ Quiz schema (wraps questions together)
const quizSchema = new Schema({
  title: { type: String, required: true },
  description: { type: String },
  questions: [questionSchema], // <-- this is key
});

const quizResultSchema = new Schema(
  {
    username: { type: String, required: true },
    testName: { type: String, required: true },
    score: { type: Number, required: true },
    totalQuestions: { type: Number, required: true },
    dateTaken: { type: Date, default: Date.now },
    missedQuestions: [
      {
        question: String,
        selected: String,
        correct: String,
      },
    ],
  },
  { timestamps: true }
);

// ✅ Export all models
const Quiz = mongoose.model('Quiz', quizSchema);
const QuizResult = mongoose.model('QuizResult', quizResultSchema);

module.exports = { Quiz, QuizResult };














// const mongoose = require('mongoose');
// const Schema = mongoose.Schema;

// // ✅ Question schema (for each quiz question)
// const questionSchema = new Schema({
//   questions: { type: String, required: true },
//   options: [{ type: String, required: true }],
//   correct: { type: [String], required: true }, // array, but supports one or more correct answers
// });

// // ✅ QuizResult schema (to store user scores)
// const quizResultSchema = new Schema(
//   {
//     username: { type: String, required: true },
//     testName: { type: String, required: true },
//     score: { type: Number, required: true },
//     totalQuestions: { type: Number, required: true },
//     dateTaken: { type: Date, default: Date.now },
//   },
//   { timestamps: true }
// );

// // ✅ Export both models
// const Question = mongoose.model('Question', questionSchema);
// const QuizResult = mongoose.model('QuizResult', quizResultSchema);
// module.exports = { Question, QuizResult };






// const mongoose = require('mongoose')
// const Schema = mongoose.Schema

// const questionSchema = new Schema({
//   question: { type: String, required: true },
//   options: [{ type: String, required: true }],
//   correct: [{ type: String, required: true }],
// });

// const quizResultSchema = new Schema(
//   {
//     username: { type: String, required: true },
//     testName: { type: String, required: true },
//     score: { type: Number, required: true },
//     totalQuestions: { type: Number, required: true },
//     dateTaken: { type: Date, default: Date.now },
//   },
//   { timestamps: true }
// );


// module.exports = mongoose.model('QuizResult',quizResultSchema)