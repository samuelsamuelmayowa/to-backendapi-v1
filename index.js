// const app = require("./api/index");
// const cors = require("cors");

// // ✅ Use CORS properly
// app.use(cors({
//   origin: ["http://localhost:5173", "https://www.to-analytics.com"], // allowed origins
//   methods: ["GET", "POST", "PATCH", "DELETE"],
//   allowedHeaders: ["Content-Type", "Authorization"],
//   credentials: true,
// }));

// // Optional: You can keep this for safety
// app.use((req, res, next) => {
//   res.setHeader("Content-Type", "application/json");
//   next();
// });

// module.exports = app;


const app = require('./api/index')
const cors = require("cors");
app.use(cors())
// // connecting the server and frontend
app.all('*', (req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    next();
});

app.use((req, res, next) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
        'Access-Control-Allow-Origin',
        'http://localhost:5173'
        //  'https://www.to-analytics.com'
    );
    // res.setHeader('Access-Content-Allow-Orgin', 'https://www.to-analytics.com')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH,DELTE')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    next()
})


module.exports = app