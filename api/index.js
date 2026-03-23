// Vercel serverless function — wraps the Express app from dist/index.cjs
// The built server creates an HTTP server and calls listen(), which we intercept.

const http = require('http');

// Monkey-patch createServer to capture the Express request handler
// and prevent listen() from binding a port inside Vercel.
let handler = null;
let ready = null;

const origCreateServer = http.createServer;
http.createServer = function (requestListener) {
  if (typeof requestListener === 'function') {
    handler = requestListener;
  }
  const srv = origCreateServer.call(http, requestListener);
  const origListen = srv.listen.bind(srv);
  srv.listen = function () {
    // Extract the callback (last argument if it's a function)
    const args = Array.from(arguments);
    const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
    // Fire the callback so the app thinks it's listening
    if (cb) setImmediate(cb);
    return srv;
  };
  return srv;
};

// Load the bundled server — this triggers the async IIFE
const initPromise = new Promise((resolve) => {
  require('../dist/index.cjs');
  // Give the async IIFE time to register routes
  // The IIFE awaits registerRoutes then calls listen, whose callback we fire via setImmediate
  // After that, all routes are registered.
  setTimeout(resolve, 500);
});

module.exports = async (req, res) => {
  await initPromise;
  if (handler) {
    return handler(req, res);
  }
  res.statusCode = 500;
  res.end(JSON.stringify({ error: 'Server failed to initialize' }));
};
