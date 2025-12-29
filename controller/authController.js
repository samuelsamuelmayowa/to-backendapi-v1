const { validationResult } = require('express-validator')
const User = require('../model/user.js');
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const admin = require('../firebase');
const nodemailer = require("nodemailer");
const logger = require("../logger.js");
const dotenvb = require("dotenv").config();





//  FORGOT PASSWORD
const forgotPassword = async (req, res, next) => {
    const { email } = req.body;

    try {
        const user = await User.findOne({ email });
        if (!user) {
            const error = new Error("No account found with that email.");
            error.statusCode = 404;
            throw error;
        }

        // Create a short-lived reset token (15 mins)
        const resetToken = jwt.sign(
            { email: user.email, userId: user._id },
            process.env.JWT_SECRET,
            { expiresIn: "15m" }
        );

        const resetLink = `https://www.to-analytics.com/reset-password/${resetToken}`;

        // Set up mail transport
        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });

        const mailOptions = {
            from: `"TO Analytics" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: "Password Reset Request",
            text: `Click the link below to reset your password:\n\n${resetLink}\n\nThis link will expire in 15 minutes.`,
        };

        await transporter.sendMail(mailOptions);

        res.status(200).json({ message: "Password reset link sent to your email." });
    } catch (err) {
        if (!err.statusCode) err.statusCode = 500;
        next(err);
        console.log(err.message);
    }
};

// RESET PASSWORD
const resetPassword = async (req, res, next) => {
    const { token } = req.params;
    const { password } = req.body;

    try {
        // Verify JWT
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findOne({ _id: decoded.userId, email: decoded.email });

        if (!user) {
            const error = new Error("Invalid token or user not found.");
            error.statusCode = 400;
            throw error;
        }

        // Hash new password
        const hashed = await bcrypt.hash(password, 12);
        user.password = hashed;
        await user.save();

        res.status(200).json({ message: "Password reset successful. You can now log in." });
    } catch (err) {
        if (err.name === "TokenExpiredError") {
            err.message = "Reset link has expired. Please request a new one.";
        }
        if (!err.statusCode) err.statusCode = 500;
        next(err);
    }
};

const signup = (req, res, next) => {
    const error = validationResult(req);
    if (!error.isEmpty()) {
        // const error = new Error("vaildation failed data please fill up!!!!!")
        const error = new Error("Account already existing!!!!!")
        error.statusCode = 422;
        throw error
    }
    const { email, name, password } = req.body;
    // check if user exist first 

    const token = jwt.sign({ email: email },
        // 'sfcdhbvdhs vsdvjsvsvvd'
        process.env.JWT_SECRET
        , {
            expiresIn: process.env.JWT_TIME
        })

    bcrypt.hash(password, 12).then(hased => {
        const user = new User({
            name: name,
            email: email,
            provider: "email and password",
            password: hased
        })
        user.save().then((result) => {
            res.status(201).json({
                massage: 'user enter',
                data: result,
                token,
                email: email,
            })
            console.log(result)
            console.log('welcome to To!!!!!!!!!!!!!!!!!!!!!')
        })
    }).catch((err) => {
        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err)
        console.log(err.message)
    })

}


const login = (req, res, next) => {
    // check vaildation
    // check if user exist 
    // check for token
    const { email, password } = req.body;
    let loadedUser;
    User.findOne({ email: email }).then((user) => {
        if (!user) {
            const error = new Error("Login error: Verify your email and password or create an account");
            error.statusCode = 401;
            throw error;
        }
        loadedUser = user;
        return bcrypt.compare(password, user.password)
    }).then(isEqaul => {
        if (!isEqaul) {
            const error = new Error("Password unrecognized. Retry or reset your password!!!");
            error.statusCode = 403;
            throw error;
        }
        const token = jwt.sign({ email: loadedUser.email, userId: loadedUser._id.toString() },
            // 'sfcdhbvdhs vsdvjsvsvvd',
            process.env.JWT_SECRET,
            {
                expiresIn: process.env.JWT_TIME
            })
        logger.info({
            event: "signup_success",
            email: newUser.email,
            ip: req.ip
        });

        res.status(200).json({
            message: 'welcome',
            token: token,
            email: loadedUser.email,
            data: loadedUser
        })

    }).catch((err) => {
        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err)
        console.log(err.message)
    })
}


const userInfo = async (req, res, next) => {
    // this function will return the user login info for both google auth and jwt
    const token = req.headers.authorization.split(' ')[1]
    let decodeToken;
    let decodeValue;
    try {
        decodeToken = jwt.verify(token,
            // 'sfcdhbvdhs vsdvjsvsvvd'
            process.env.JWT_TIME,
        )
        console.log(decodeToken)
        return res.status(200).json({
            token: decodeToken
        })
    } catch (err) {
        try {
            //firebase auth admin
            decodeValue = await admin.auth().verifyIdToken(token);
            console.log(decodeValue)
            if (decodeValue) {
                return res.status(200).json({
                    token: decodeValue
                })
            }
            return res.json({ message: "un Authorization by users" })
        } catch (err) {
            console.log("error for admin google", err.message)
        }
        err.statusCode = 500;
        throw err;
    }

}

const googleAuth = async (req, res, next) => {
    /// storing only google users
    try {
        const { name, email } = req.body;
        // Check if user already exists with the provided email
        const existingUser = await User.findOne({ email });

        if (existingUser) {
            // Existing user found, log in and return token
            const token = jwt.sign({ email, userId: existingUser._id.toString() },
                process.env.JWT_SECRET, {
                expiresIn: process.env.JWT_TIME
                // '5h' 
            }); // Use environment variable for JWT secret
            console.log(`User already exists: ${existingUser._id}`);
            return res.status(200).json({
                email: email,
                response: existingUser,
                token: token,
                provider: "google"
            });

        }

        // New user - create with provided name and email
        const createdUser = await User.create({ name, email, provider: "google" });
        console.log(`New user created: ${createdUser._id}`);

        // Generate and return token for new user
        const token = jwt.sign({ email: createdUser.email, userId: createdUser._id.toString() },
            process.env.JWT_SECRET, { expiresIn: process.env.JWT_TIME });
        res.status(201).json({
            email: createdUser.email,
            response: createdUser,
            token,

        });

    } catch (err) {
        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
        console.error(err.message);
    }
}

module.exports = {
    googleAuth,
    signup,
    forgotPassword,
    resetPassword,
    login,
    userInfo
}





// try {
//     // i want the token then the users infomation and display the name or gmail;
//     const token = req.headers.authorization.split(' ')[1];
//     const googlefirebasetoken = await admin.auth().verifyIdToken(token);
//     const jwttoken = jwt.verify(token, 'sfcdhbvdhs vsdvjsvsvvd');

//     if (googlefirebasetoken.firebase.identities === "google.com") {
//         res.status(200).json({
//             firebase: googlefirebasetoken
//         })
//         next()
//     }
//     else  if(jwttoken){

//         return res.status(200).json({
//             jwt_token: jwttoken,
//         })
//     }







// } catch (err) {
//     if (!err.statusCode) {
//         err.statusCode = 500;
//     }
//     next(err)
//     console.log(err.message)
// }