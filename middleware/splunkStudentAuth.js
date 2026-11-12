"use strict";

const firebaseAdmin = require("../firebase");
const User = require("../model/user");
const { verifyRequestToken } = require("./sessionCookie");

function createSplunkStudentAuth({ admin = firebaseAdmin, UserModel = User, verifySession = verifyRequestToken } = {}) {
  return async function requireSplunkStudent(req, res, next) {
    try {
      const authorization = String(req.get("Authorization") || "");
      const bearer = /^Bearer\s+([^\s]+)$/i.exec(authorization);
      let email;
      let name;

      if (bearer) {
        const identity = await admin.auth().verifyIdToken(bearer[1], true);
        if (identity.email_verified !== true || typeof identity.email !== "string" || !identity.email.trim()) {
          return res.status(403).json({ message: "A verified Firebase student account is required." });
        }
        email = identity.email.trim().toLowerCase();
        name = identity.name || email.split("@")[0];
      } else {
        const verified = verifySession(req);
        if (!verified) return res.status(401).json({ message: "Sign in to use the Splunk Studio data and student workspace." });
        email = String(verified.claims?.email || "").trim().toLowerCase();
        name = verified.claims?.name || email.split("@")[0];
        if (!email) return res.status(401).json({ message: "Your session does not contain a student identity." });
      }

      const user = await UserModel.findOne({ email }).select("_id email name").lean();
      if (!user) return res.status(401).json({ message: "This signed-in account is not linked to a T.O. Analytics student profile." });

      req.splunkStudent = {
        ownerId: String(user._id),
        email: String(user.email).trim().toLowerCase(),
        name: user.name || name,
      };
      return next();
    } catch (error) {
      if (error?.name === "JsonWebTokenError" || error?.name === "TokenExpiredError" || error?.name === "NotBeforeError") {
        return res.status(401).json({ message: "Your Firebase token or session has expired. Sign in again." });
      }
      if (error?.code?.startsWith?.("auth/")) {
        return res.status(401).json({ message: "Firebase could not verify this account. Sign in again." });
      }
      return next(error);
    }
  };
}

module.exports = createSplunkStudentAuth();
module.exports.createSplunkStudentAuth = createSplunkStudentAuth;
