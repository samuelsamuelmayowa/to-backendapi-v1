const express = require('express');
const UserProgress = require('../model/userprogress.js')
const router = express.Router();
const authController = require('../controller/authController')
const { body } = require('express-validator')
const User = require('../model/user')
const Middleware = require('../middleware/is-auth')
const QuizResult = require('../model/quiz.js')
const Quiz = require("../model/quiz.js");
const logger = require("../logger");




// router.post('/sighup', [
//   body('email').isEmail().withMessage('please enter a vilad email').custom((value, { req }) => {
//     return User.findOne({ email: req.email }).then(userDoc => {
//       if (userDoc) {
//         return Promise.reject('Email already taken')
//       }
//     })
//   }).normalizeEmail(),

//   body('password').trim(),
//   body('name').notEmpty().withMessage('please enter a vilad email').custom((value, { req }) => {
//     return User.findOne({ name: value }).then(userDoc => {
//       if (userDoc) {
//         return Promise.reject('name already taken')
//       }
//     })
//   })
// ], authController.signup);
router.post('/sighup', [
  body('email').isEmail().withMessage('please enter a vilad email').custom((value, { req }) => {
    return User.findOne({ email: req.email }).then(userDoc => {
      if (userDoc) {
      
      logger.warn({
        event: "signup_duplicate_email",
        email: value,
        ip: req.ip
      });
        return Promise.reject('Email already taken')
      }
    })
  }).normalizeEmail(),

  body('password').trim(),
  body('name').notEmpty().withMessage('please enter a vilad email').custom((value, { req }) => {
    return User.findOne({ name: value }).then(userDoc => {
      if (userDoc) {
          logger.warn({
        event: "signup_duplicate_email",
        email: value,
        ip: req.ip
      });
        return Promise.reject('name already taken')
      }
    })
  })
], authController.signup);

router.post('/login', authController.login)




router.get("/health", (req, res) => {
  res.json({ message: "Hello" });
});

// Get all quizzes for dropdown
router.get("/quiz/list", async (req, res) => {
  try {
    const quizzes = await Quiz.Quiz.find({}, "title description");
    res.json(quizzes);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
router.get("/quiz/all-results", async (req, res) => {
  try {
    const results = await Quiz.QuizResult.find().sort({ dateTaken: -1 });
    res.json(results);
  } catch (err) {
    res.status(500).json({ message: "Error fetching results", error: err });
  }
});

router.get("/all-scores", async (req, res) => {
  try {
    const results = await Quiz.QuizResult.find().sort({ createdAt: -1 });
    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch all results" });
  }
});

router.get("/quiz/:name", async (req, res) => {
  try {
    const quiz = await Quiz.Quiz.findOne({ title: req.params.name });
    if (!quiz) return res.status(404).json({ message: "Quiz not found" });
    res.json(quiz);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/quiz/save", async (req, res) => {
  try {
    const { username, testName, score, totalQuestions, missedQuestions } = req.body;

    // Validate required fields
    if (!username || !testName || score === undefined || !totalQuestions) {
      return res.status(400).json({ message: "Missing fields" });
    }

    const result = new QuizResult.QuizResult({
      username,
      testName,
      score,
      totalQuestions,
      missedQuestions: missedQuestions || [],
    });

    await result.save();
    res.status(201).json(result);
  } catch (err) {
    console.error("Error saving quiz result:", err);
    res.status(500).json({ message: err.message });
  }
});

// router.post("/quiz/save", async (req, res) => {
//   try {
//     const { username, testName, score, quizQuestions, userAnswers } = req.body;

//     // Validate required fields
//     if (!username || !testName || !score || !quizQuestions || !userAnswers) {
//       return res.status(400).json({ message: "❌ Missing required fields" });
//     }

//     // Compute missed questions
//     const missed = quizQuestions
//       .map((q, i) => {
//         const correctAnswers = Array.isArray(q.correct)
//           ? q.correct
//           : [q.correct];
//         const userAnswer = userAnswers[i];

//         if (!correctAnswers.includes(userAnswer)) {
//           return {
//             question: q.question,
//             selected: userAnswer,
//             correct: correctAnswers.join(", "),
//           };
//         }
//         return null;
//       })
//       .filter(Boolean);

//     // Save result
//     const result = new QuizResult.QuizResult({
//       username,
//       testName,
//       score,
//       totalQuestions: quizQuestions.length,
//       missedQuestions: missed,
//     });

//     await result.save();

//     return res.status(201).json({
//       message: "✅ Quiz result saved successfully",
//       result,
//     });
//   } catch (err) {
//     console.error("❌ Error saving quiz result:", err);
//     res.status(500).json({
//       message: "Server error while saving quiz result",
//       error: err.message,
//     });
//   }
// });

router.get("/quiz/my-scores/:username", async (req, res) => {
  try {
    const { username } = req.params;

    if (!username)
      return res.status(400).json([]);

    const results = await QuizResult.QuizResult.find({ username }).sort({ dateTaken: -1 });

    // Always return an array
    res.status(200).json(results || []);
  } catch (err) {
    console.error("Error fetching quiz scores:", err);
    res.status(500).json([]);
  }
});

// router.get("/quiz/my-scores/:username", async (req, res) => {
//   try {
//     const { username } = req.params;

//     // Check if username was provided
//     if (!username) {
//       return res.status(400).json({ message: "Username is required" });
//     }

//     // Fetch user's quiz results, sorted by most recent
//     const results = await QuizResult.find({ username }).sort({ dateTaken: -1 });

//     // Handle empty results
//     if (!results || results.length === 0) {
//       return res.status(404).json({ message: "No test scores found" });
//     }

//     // Respond with the user's results
//     res.status(200).json(results);

//   } catch (err) {
//     console.error("Error fetching quiz scores:", err);
//     res.status(500).json({ message: "Server error", error: err.message });
//   }
// });

// router.get("/quiz/my-scores/:username", async (req, res) => {
//   try {
//     const results = await QuizResult.QuizResult.find({ username: req.params.username }).sort({ dateTaken: -1 });
//     res.json(results);
//   } catch (err) {
//     res.status(500).json({ message: "Server error", error: err.message });
//   }
// });

// router.get("/quiz/my-scores/:username", async (req, res) => {
//   try {
//     const { username } = req.params;

//     if (!username)
//       return res.status(400).json({ message: "Username is required" });

//     const results = await QuizResult.find({ username }).sort({ dateTaken: -1 });

//     if (results.length === 0)
//       return res.status(404).json({ message: "No test scores found" });

//     res.status(200).json(results);
//   } catch (err) {
//     res.status(500).json({ message: "Server error", error: err.message });
//   }
// });
// // // Save quiz score
// router.post("/save", async (req, res) => {
//   try {
//     const { username, testName, score } = req.body;

//     if (!username || !testName || score === undefined)
//       return res.status(400).json({ message: "Missing fields" });

//     const result = await QuizResult.create({ username, testName, score });

//     res.status(201).json({ message: "Score saved successfully", result });
//   } catch (err) {
//     res.status(500).json({ message: "Server error", error: err.message });
//   }
// });
// Save quiz score
// router.post("/save", async (req, res) => {
//   try {
//     const { username, testName, score, totalQuestions } = req.body;

//     if (!username || !testName || score === undefined || !totalQuestions)
//       return res.status(400).json({ message: "Missing fields" });

//     const result = await QuizResult.create({
//       username,
//       testName,
//       score,
//       totalQuestions,
//       dateTaken: new Date(),
//     });

//     res.status(201).json({ message: "Score saved successfully", result });
//   } catch (err) {
//     res.status(500).json({ message: "Server error", error: err.message });
//   }
// });


// router.get("/quiz/my-scores/:username", async (req, res) => {
//   try {
//     const results = await QuizResult.find({ username: req.params.username }).sort({ dateTaken: -1 });
//     res.json(results);
//   } catch (err) {
//     res.status(500).json({ message: "Server error", error: err.message });
//   }
// });

// router.get("/quiz/my-scores/:username", async (req, res) => {
//   try {
//     const { username } = req.params;

//     if (!username)
//       return res.status(400).json({ message: "Username is required" });

//     const results = await QuizResult.find({ username }).sort({ dateTaken: -1 });

//     if (results.length === 0)
//       return res.status(404).json({ message: "No test scores found" });

//     res.status(200).json(results);
//   } catch (err) {
//     res.status(500).json({ message: "Server error", error: err.message });
//   }
// });
// google token from firebase, and we jwt token from our own server 
//procted
router.post('/forgot-password', authController.forgotPassword)
router.post('/reset-password/:token', authController.resetPassword)


router.get('/users',
  // Middleware.mixMiddleware,
  // (req, res) => {
  // res.status(200).json("sdafafafafafaf")
  authController.userInfo)





router.post('/google', [
  body('email').isEmail().withMessage('please enter a vilad email').custom((value, { req }) => {
    return User.findOne({ email: req.email }).then(userDoc => {
      if (userDoc) {
        return Promise.reject('Email already taken')
      }
    })
  }).normalizeEmail(),
], authController.googleAuth)


router.post("/create-checkout-session", async (req, res) => {
  const { cartItems, email } = req.body;

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      customer_email: email,
      line_items: cartItems.map(item => ({
        price_data: {
          currency: "usd",
          product_data: { name: item.name },
          unit_amount: item.price * 100, // Convert $ to cents
        },
        quantity: item.quantity,
      })),
      success_url: "http://localhost:5173/success?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "http://localhost:5173/cancel",
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

// ✅ Verify payment (after redirect)
router.get("/verify-payment", async (req, res) => {
  const { session_id } = req.query;

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);

    // Save payment to DB only if successful
    if (session.payment_status === "paid") {
      const newPayment = new Payment({
        userEmail: session.customer_email,
        amount: session.amount_total / 100,
        currency: session.currency,
        paymentStatus: session.payment_status,
        paymentId: session.id,
      });
      await newPayment.save();
    }

    res.json({ success: true, session });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Payment verification failed" });
  }
});




// Get user's progress for all classes
router.get("/:email", async (req, res) => {
  try {
    const progress = await UserProgress.find({ email: req.params.email });
    res.json(progress);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Save/update a note or progress
router.post("/save", async (req, res) => {
  try {
    const { email, courseId, classId, note, time, duration, completed } = req.body;
    const update = { note, time, duration, completed };
    const progress = await UserProgress.findOneAndUpdate(
      { email, courseId, classId },
      { $set: update },
      { new: true, upsert: true }
    );
    res.json(progress);
  } catch (err) {
    res.status(500).json({ error: "Could not save progress" });
  }
});

module.exports = router