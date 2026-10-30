
require("dotenv").config();

const express = require("express");
const Stripe = require("stripe");

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Separate checkout and webhook routers
const checkoutRouter = express.Router();
const webhookRouter = express.Router();

// Course prices come from the backend, NOT the frontend
const COURSE_PRICES = JSON.parse(
  process.env.STRIPE_COURSE_PRICE_IDS || "{}"
);

const FRONTEND_URL = "https://www.to-analytics.com";

// =======================================
// CREATE STRIPE CHECKOUT SESSION
// POST /api/payment/create-checkout-session
// =======================================

checkoutRouter.post("/create-checkout-session", async (req, res) => {
  try {
    const { courseIds } = req.body || {};

    // Validate cart
    if (
      !Array.isArray(courseIds) ||
      courseIds.length === 0 ||
      courseIds.length > 5
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid or empty shopping cart",
      });
    }

    // Normalize IDs
    const ids = courseIds.map((id) => String(id).trim());

    // Reject invalid IDs
    if (
      ids.some((id) => !/^[a-zA-Z0-9_-]{1,64}$/.test(id))
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid course ID",
      });
    }

    // Prevent duplicate course purchases in the same cart
    if (new Set(ids).size !== ids.length) {
      return res.status(400).json({
        success: false,
        message: "Duplicate courses are not allowed",
      });
    }

    // Verify every course exists in backend configuration
    const invalidCourse = ids.find(
      (id) =>
        !Object.prototype.hasOwnProperty.call(
          COURSE_PRICES,
          id
        )
    );

    if (invalidCourse) {
      return res.status(400).json({
        success: false,
        message: `Course not configured: ${invalidCourse}`,
      });
    }

    // Get trusted Stripe Price IDs
    const priceIds = ids.map((id) => COURSE_PRICES[id]);

    // Verify prices exist and are one-time prices
    const prices = await Promise.all(
      priceIds.map((priceId) => stripe.prices.retrieve(priceId))
    );

    if (
      prices.some(
        (price) =>
          !price.active ||
          price.type !== "one_time" ||
          price.recurring
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "A course has an inactive or recurring Stripe price. Use an active one-time price.",
      });
    }

    const lineItems = priceIds.map((priceId) => ({
      price: priceId,
      quantity: 1,
    }));

    // Create hosted Stripe Checkout session
    const session = await stripe.checkout.sessions.create({
      mode: "payment",

      payment_method_types: ["card"],

      line_items: lineItems,

      metadata: {
        course_ids: ids.join(","),
        platform: "TO Analytics",
      },

      success_url:
        `${FRONTEND_URL}/success` +
        "?session_id={CHECKOUT_SESSION_ID}",

      cancel_url: `${FRONTEND_URL}/cancel`,
    });

    if (!session.url) {
      throw new Error("Stripe did not return a checkout URL");
    }

    return res.status(200).json({
      success: true,
      url: session.url,
      sessionId: session.id,
    });

  } catch (error) {
    console.error("Stripe Checkout Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to create Stripe Checkout session",
    });
  }
});

// =======================================
// STRIPE WEBHOOK
// POST /api/payment/webhook
// =======================================

// This endpoint MUST receive the original raw request body.
webhookRouter.post(
  "/",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];

    if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
      return res.status(400).send(
        "Missing Stripe webhook configuration"
      );
    }

    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (error) {
      console.error(
        "Stripe webhook signature error:",
        error.message
      );

      return res.status(400).send(
        "Webhook signature verification failed"
      );
    }

    try {
      switch (event.type) {
        case "checkout.session.completed":
        case "checkout.session.async_payment_succeeded": {
          const session = event.data.object;

          if (session.payment_status === "paid") {
            console.log("Verified Stripe payment:", {
              sessionId: session.id,
              courseIds: session.metadata?.course_ids,
              amountTotal: session.amount_total,
              currency: session.currency,
              customerEmail:
                session.customer_details?.email,
            });

            // NEXT INTEGRATION:
            // Save the verified payment to MongoDB.
            // Match it to the authenticated student.
            // Grant access to purchased courses.
            //
            // Make database processing idempotent:
            // Stripe can send the same event more than once.
          }

          break;
        }

        case "checkout.session.async_payment_failed":
          console.log(
            "Stripe payment failed:",
            event.data.object.id
          );
          break;

        default:
          break;
      }

      return res.status(200).json({
        received: true,
      });
    } catch (error) {
      console.error(
        "Stripe webhook processing error:",
        error
      );

      return res.status(500).send(
        "Webhook processing failed"
      );
    }
  }
);

module.exports = {
  checkoutRouter,
  webhookRouter,
};
