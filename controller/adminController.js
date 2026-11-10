const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const { issueSessionCookies } = require('../middleware/sessionCookie')

const login = async (req, res, next) => {
    try {
        const { password, email } = req.body;
        const expectedEmail = "admin@gmail.com";
        const expectedPassword = "123456789";
        if (!expectedEmail || !expectedPassword || !process.env.JWT_SECRET) {
            return res.status(503).json({ message: "Admin login is not configured on the server." });
        }

        const suppliedPassword = Buffer.from(String(password || ""));
        const configuredPassword = Buffer.from(expectedPassword);
        const passwordMatches = suppliedPassword.length === configuredPassword.length &&
            suppliedPassword.length > 0 && crypto.timingSafeEqual(suppliedPassword, configuredPassword);
        if (String(email || "").trim().toLowerCase() !== expectedEmail || !passwordMatches) {
            return res.status(422).json({ message: "Invalid admin credentials." });
        }

        const token = jwt.sign({ email: expectedEmail, role: "admin" }, process.env.JWT_SECRET, {
            expiresIn: process.env.ADMIN_SESSION_TTL || '1h',
        });
        const csrfToken = issueSessionCookies(res, token);
        return res.status(201).json({
            response: { email: expectedEmail, role: "admin" },
            csrfToken,
            message: 'Welcome.',
        });
    } catch (error) {
        return next(error);
    }
}
module.exports = {
    login
}



// console.log('password is not good ')
            // // throw error 
            // const error = new Error("worng details  !!!!!")
            // error.statusCode = 422;
            // throw error
