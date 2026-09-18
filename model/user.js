const mongoose = require("mongoose");

const { Schema } = mongoose;

const userSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    password: {
      type: String,
      select: false,
    },

    status: {
      type: String,
      default: "Welcome to T.O. Analytics",
    },

    provider: {
      type: String,
    },

    posts: [
      {
        type: Schema.Types.ObjectId,
        ref: "Payment",
      },
    ],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("User", userSchema);



// const mongoose = require('mongoose')
// const Schema = mongoose.Schema
// const User = new Schema({
//     email: {
//         type: String,
//         unqiue:true,
//         required: true
//     },
//     name: {
//         type: String,
//         required: true
//     },
//     password: {
//         type: String,
//     },
//     status: {
//         type: String,
//         default:'welcome to To'
//     },
//     provider: {
//         type: String,  
//     },
//     date: {
//         type: Date,
//         default:Date.now()
//     },
//     posts: [
//         { type: Schema.Types.ObjectID, ref: 'Payment' },
//     ]
// })
// module.exports = mongoose.model('User', User)