const express = require("express");
const app = express();
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
app.use(bodyParser.json()); // application/json
const cors = require("cors");
const dashboardroutes = require("../routes/dashboard.js");
const authroutes = require("../routes/auth.js");
const pagesroutes = require("../routes/pages.js");
const uploadsroutes = require('../routes/file.js')
const adminroutes = require("../routes/adminroutes.js");
const Paypal = require("@paypal/checkout-server-sdk");
const Middleware = require("../middleware/auth");
const dotenv = require("dotenv");
const paypal = require("@paypal/checkout-server-sdk");
const dotenvb = require("dotenv").config();
const cookiesMiddleware = require("universal-cookie-express");
const Payment = require("../model/payment.js");
const Stripe = require("stripe");
const paymentstripe = require('../routes/payment.js')
var cookieParser = require("cookie-parser");
const path = require("path");
const CronJob = require("cron").CronJob;
app.use("/uploads", express.static(path.join(__dirname, "..","uploads")));
// app.use("/uploads", express.static(path.join(__dirname, "uploads")));
console.log("Serving uploads from:", path.join(__dirname,  "..","uploads"));

mongoose
  .connect(
   process.env.DATABASE_URL
  )
  .then((res) => console.log("database connected!!!"))
  .catch((err) => console.log(err.message));

app.use(cors());

app.set("cookie.sameSite", "Strict"); // Default for all cookies
app.use(cookiesMiddleware());

app.all("*", (req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  next();
});



// // connecting the server and frontend
// app.use((req, res, next) => {
//   res.cookie("myCookie", "value", { sameSite: "Strict" });
//   res.setHeader("Content-Type", "application/json");
//   res.setHeader("Access-Content-Allow-Orgin", "*");
//   res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH,DELTE");
//   res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
//   next();
// });

app.use((req, res, next) => {
  res.setHeader(
    'Access-Control-Allow-Origin',
    'http://localhost:5173',
     'https://www.to-analytics.com'
  );

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight requests (CORS preflight)
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  // ✅ This line is essential
  next();
});


app.use("/api", pagesroutes);
app.use("/api", dashboardroutes);
app.use("/api", authroutes);
app.use("/api/payment", paymentstripe)
app.use("/api", adminroutes);
app.use('/api',uploadsroutes)




function get_access_token() {
  const auth = `${client_id}:${client_secret}`;
  const data = "grant_type=client_credentials";
  return fetch(endpoint_url + "/v1/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(auth).toString("base64")}`,
    },
    body: data,
  })
    .then((res) => res.json())
    .then((json) => {
      return json.access_token;
    })
    .catch((err) => console.log(err.message));
}
const environment = process.env.ENVIRONMENT || "sandbox";
const client_id = process.env.CLIENT_ID;
const client_secret = process.env.CLIENT_SECRET;
const endpoint_url =
  environment === "sandbox"
    ? "https://api-m.sandbox.paypal.com"
    : "https://api-m.paypal.com";
const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PORT = 8888 } = process.env;
const base = "https://api-m.sandbox.paypal.com";


//           

const generateAccessToken = async () => {
  try {
    if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
      throw new Error("MISSING_API_CREDENTIALS");
    }
    const auth = Buffer.from(
      PAYPAL_CLIENT_ID + ":" + PAYPAL_CLIENT_SECRET
    ).toString("base64");
    const response = await fetch(`${base}/v1/oauth2/token`, {
      method: "POST",
      body: "grant_type=client_credentials",
      headers: {
        Authorization: `Basic ${auth}`,
      },
    });

    const data = await response.json();
    return data.access_token;
  } catch (error) {
    console.error("Failed to generate Access Token:", error);
  }
};
/// new one below
// /**
//  * Create an order to start the transaction.
//  * @see https://developer.paypal.com/docs/api/orders/v2/#orders_create
//  */

let mainPrice = 0;
let mainCourseName = "";
let mainStudentName = "";
const createOrder = async (cart) => {
  // use the cart information passed from the front-end to calculate the purchase unit details
  console.log(
    "shopping cart information passed from the frontend createOrder() callback:",
    cart
  );
  // console.log(cart)
  const accessToken = await generateAccessToken();
  const url = `${base}/v2/checkout/orders`;

  cart.forEach((item) => {
    // console.log(item.studentName, item.price, item.courseName);
    mainCourseName = [item.courseName];
    mainStudentName = item.studentName;
    mainPrice += item.price;
    console.log(mainCourseName, mainStudentName, mainPrice);
  });
  const payload = {
    intent: "CAPTURE",
    purchase_units: [
      {
        amount: {
          currency_code: "USD",
          // value: mainPrice,
          value: 1.0,
          studentName: mainStudentName,
          courseName:"Linux"
          // courseName: mainCourseName,
          // total,               // come from the frontend
        },
      },
    ],
  };

  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      // Uncomment one of these to force an error for negative testing (in sandbox mode only). Documentation:
      // https://developer.paypal.com/tools/sandbox/negative-testing/request-headers/
      // "PayPal-Mock-Response": '{"mock_application_codes": "MISSING_REQUIRED_PARAMETER"}'
      // "PayPal-Mock-Response": '{"mock_application_codes": "PERMISSION_DENIED"}'
      // "PayPal-Mock-Response": '{"mock_application_codes": "INTERNAL_SERVER_ERROR"}'
    },
    method: "POST",
    body: JSON.stringify(payload),
  });

  return handleResponse(response);
};

/**
 * Capture payment for the created order to complete the transaction.
 * @see https://developer.paypal.com/docs/api/orders/v2/#orders_capture
 */
const captureOrder = async (orderID) => {
  const accessToken = await generateAccessToken();
  const url = `${base}/v2/checkout/orders/${orderID}/capture`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      // Uncomment one of these to force an error for negative testing (in sandbox mode only). Documentation:
      // https://developer.paypal.com/tools/sandbox/negative-testing/request-headers/
      // "PayPal-Mock-Response": '{"mock_application_codes": "INSTRUMENT_DECLINED"}'
      // "PayPal-Mock-Response": '{"mock_application_codes": "TRANSACTION_REFUSED"}'
      // "PayPal-Mock-Response": '{"mock_application_codes": "INTERNAL_SERVER_ERROR"}'
    },
  });

  return handleResponse(response);
};

async function handleResponse(response) {
  try {
    const jsonResponse = await response.json();
    return {
      jsonResponse,
      httpStatusCode: response.status,
    };
  } catch (err) {
    const errorMessage = await response.text();
    throw new Error(errorMessage);
  }
}

app.post("/api/orders", async (req, res) => {
  try {
    // use the cart information passed from the front-end to calculate the order amount detals
    const { cart } = req.body;
    const { jsonResponse, httpStatusCode } = await createOrder(cart);
    res.status(httpStatusCode).json(jsonResponse);
  } catch (error) {
    console.error("Failed to create order:", error);
    res.status(500).json({ error: "Failed to create order." });
  }
});

app.post("/api/orders/:orderID/capture", async (req, res) => {
  try {
    const { orderID } = req.params;
    const { jsonResponse, httpStatusCode } = await captureOrder(orderID);
    //now it time to store the data from the frontend to the database  and make the payment to paypal ;
    if (httpStatusCode === 201 || httpStatusCode === 200) {
      let db = new Database();
      let userId = db.getUserFromToken(req.token);
      let order = {
        Order: new Date(),
        UserId: userId._id,
        Products: jsonResponse.purchase_units[0].description,
        Amount: jsonResponse.purchase_units[0].amount.value,
        Status: "In Process",
      };
      const { studentName, courseName, payment_mode, payment_id, price } =
        req.body;
      try {
        const paymentuser = await Payment.create({
          studentName: jsonResponse.purchase_units[0].amount.studentName,
          // courseName: jsonResponse.purchase_units[0].amount.courseName,
          courseName: jsonResponse.purchase_units[0].amount.courseName,
          payment_id: orderID,
          payment_mode: payment_mode,
          price: jsonResponse.purchase_units[0].amount.value,
        });
        res.status(201).json({
          data: paymentuser,
          message: "payment created well!!!!!!",
        });

        console.log(paymentuser, "finished");
      } catch (err) {
        // making an error message to the frontend
        if (!err.statusCode) {
          err.statusCode = 500;
        }
        next(err);
        console.log(err.message);
      }
    }
    res.status(httpStatusCode).json(jsonResponse);
  } catch (error) {
    console.error("Failed to create order:", error);
    res.status(500).json({ error: "Failed to capture order." });
  }
});

/// genral error express
app.use((error, req, res, next) => {
  console.log(error.message);
  const status = error.statusCode || 500;
  const message = error.message;
  res.status(status).json({ message: message, error: "server error" });
});

const port = 8000 || process.env.PORT;
app.listen(port, () => {
  console.log("SERVER IS RUNNING   " + port);
});

module.exports = app;
