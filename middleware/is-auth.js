const admin = require('../firebase')
const { getRequestToken, verifyRequestToken } = require('./sessionCookie');



const mixMiddleware = async (req, res, next) => {
    const requestToken = getRequestToken(req);
    if (!requestToken.token) {
        const error = new Error('NOT AUTHENTICATICED USER');
        error.statusCode = 401;
        throw error;
    }
    let decodeToken;
    let decodeValue;
    try {
        decodeToken = verifyRequestToken(req).claims;
    } catch (err) {
        try {
            if (requestToken.source !== 'bearer') throw err;
            decodeValue = await admin.auth().verifyIdToken(requestToken.token);
            if (decodeValue) {
                req.userId = decodeValue.uid;
                return next()
            }
            return res.json({ message: "un Authorization by users" })

        } catch (err) {
            console.log("error for admin google", err.message)
        }
        err.statusCode = err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError' ? 401 : 500;
        return next(err);
    }
    if (!decodeToken) {
        const error = new Error("not allowed for jwt  ");
        error.statusCode = 401;
        throw error
    }
    
    req.userId = decodeToken.userId
    next();

}



const Authmiddleware = (req, res, next) => {
    const requestToken = getRequestToken(req);
    if (!requestToken.token) {
        const error = new Error('NOT AUTHENTICATICED');
        error.statusCode = 401;
        return next(error);
    }
    let decodeToken;
    try {
        decodeToken = verifyRequestToken(req).claims;
    } catch (err) {
        err.statusCode = err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError' ? 401 : 500;
        return next(err);
    }
    if (!decodeToken) {
        const error = new Error("not allowed ");
        error.statusCode = 401;
        throw error
    }
    req.userId = decodeToken.userId;
    req.authClaims = decodeToken;
    return next();
}

module.exports = {
    mixMiddleware,
    Authmiddleware
}
