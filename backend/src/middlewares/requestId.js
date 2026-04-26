/**
 * Request ID middleware.
 *
 * Attaches a stable UUID (or honors an upstream X-Request-Id) to every
 * request and echoes it on the response so that logs, errors, and
 * distributed traces can all be correlated.
 *
 * `req.id` is used by other middlewares (logger, errorHandler).
 */

const { randomUUID } = require('crypto');

const INCOMING_HEADER = 'x-request-id';
const OUTGOING_HEADER = 'X-Request-Id';

// Permit only sane upstream values (alphanumeric + dash/underscore, reasonable
// length) — never trust arbitrary strings from clients since they end up in logs.
const VALID_ID = /^[A-Za-z0-9_-]{8,128}$/;

const requestIdMiddleware = (req, res, next) => {
  const incoming = req.headers[INCOMING_HEADER];
  const id = typeof incoming === 'string' && VALID_ID.test(incoming)
    ? incoming
    : randomUUID();

  req.id = id;
  res.setHeader(OUTGOING_HEADER, id);
  next();
};

module.exports = { requestIdMiddleware };
