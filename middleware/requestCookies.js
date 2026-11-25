'use strict';
const universalCookieMiddleware = require('universal-cookie-express');

// universal-cookie-express 6 registers a change listener that starts a polling
// timer even on the server. Release that request-owned listener when the response
// finishes or disconnects, while preserving its existing cookie-writing behavior.
module.exports = function requestCookies() {
  const middleware = universalCookieMiddleware();
  return (req, res, next) => middleware(req, res, () => {
    const cookies = req.universalCookies;
    const listeners = Array.isArray(cookies?.changeListeners) ? [...cookies.changeListeners] : [];
    function cleanup() {
      for (const listener of listeners) cookies.removeChangeListener(listener);
      res.removeListener('finish', cleanup);
      res.removeListener('close', cleanup);
    }
    res.once('finish', cleanup);
    res.once('close', cleanup);
    next();
  });
};
