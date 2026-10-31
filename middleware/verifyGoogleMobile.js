
module.exports = function verifyGoogleMobile(admin) {
  return async (req, res, next) => {
    const token = req.body?.idToken;

    if (typeof token !== "string" || !token.trim()) {
      return res.status(401).json({
        message: "A Google sign-in token is required.",
      });
    }

    let identity;

    try {
      identity = await admin.auth().verifyIdToken(token, true);
    } catch (error) {
      // Log the error code, never the authentication token.
      console.error("Splunk Firebase authentication failed:", {
        code: error.code || "unknown",
        message: error.message,
      });

      return res.status(401).json({
        message:
          "Google sign-in could not be verified. Please sign in again.",
      });
    }

    if (
      identity.firebase?.sign_in_provider !== "google.com" ||
      identity.email_verified !== true ||
      typeof identity.email !== "string" ||
      !identity.email
    ) {
      return res.status(403).json({
        message: "A verified Google account is required.",
      });
    }

    req.googleIdentity = {
      email: identity.email.trim().toLowerCase(),
      name: identity.name || identity.email.split("@")[0],
    };

    return next();
  };
};

// // Accept Firebase ID tokens only; never trust an email supplied by the client.
// module.exports = function verifyGoogleMobile(admin) {
//   return async (req, res, next) => {
//     const token = req.body?.idToken;
//     if (typeof token !== 'string' || !token.trim()) {
//       return res.status(401).json({ message: 'A Google sign-in token is required.' });
//     }
//     try {
//       const identity = await admin.auth().verifyIdToken(token, true);
//       if (identity.firebase?.sign_in_provider !== 'google.com' ||
//           identity.email_verified !== true || typeof identity.email !== 'string' || !identity.email) {
//         return res.status(401).json({ message: 'A verified Google account is required.' });
//       }
//       req.googleIdentity = {
//         email: identity.email.trim().toLowerCase(),
//         name: identity.name || identity.email.split('@')[0],
//       };
//       return next();
//     } catch {
//       return res.status(401).json({ message: 'Google sign-in expired or could not be verified. Please try again.' });
//     }
//   };
// };
