const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

module.exports = admin;
// var admin = require("firebase-admin");
// var serviceAccount = require("./serviceAccount.json");

// admin.initializeApp({
//   credential: admin.credential.cert(serviceAccount)
// });



// module.exports = admin;