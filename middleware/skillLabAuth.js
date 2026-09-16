const jwt = require("jsonwebtoken");
const User = require("../model/user.js");

async function requireSkillLabAuth(req, res, next) {
  try {
    const authorization = String(req.headers.authorization || "");

    if (!authorization.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Please log in to use TO Skill Lab.",
      });
    }

    const token = authorization.replace(/^Bearer\s+/i, "").trim();

    if (!token) {
      return res.status(401).json({ message: "Your login token is missing." });
    }

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is missing from the backend environment.");
      return res.status(500).json({ message: "Authentication is not configured." });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      return res.status(401).json({
        message:
          error.name === "TokenExpiredError"
            ? "Your session has expired. Please log in again."
            : "Your login session is invalid.",
      });
    }

    const userId = String(decoded.userId || "").trim();
    const email = String(decoded.email || "").trim().toLowerCase();

    const query = userId ? { _id: userId } : { email };
    const user = await User.findOne(query).select("_id name email provider").lean();

    if (!user) {
      return res.status(401).json({ message: "Student account was not found." });
    }

    req.skillLabUser = {
      externalUserId: user._id.toString(),
      email: String(user.email).trim().toLowerCase(),
      fullName: user.name || "Student",
      provider: user.provider || "unknown",
    };

    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = { requireSkillLabAuth };
