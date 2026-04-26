/**
 * Per-request timeout.
 *
 * Returns 503 if the handler hasn't finished in `ms` ms, and logs it so
 * capacity issues are visible. Skips upload routes because they can
 * legitimately take longer (multer + sharp process large images).
 *
 * Usage:
 *   app.use(requestTimeoutMiddleware({ ms: 30000 }))
 */

const logger = require('../utils/logger');

const DEFAULT_TIMEOUT_MS = Number(process.env.REQUEST_HANDLER_TIMEOUT_MS) || 30000;

// Routes that process uploads / heavy work — do not apply the default cap.
const SKIP_PATH_PREFIXES = [
  '/api/coins/:id/custom-images',
  '/api/coins/:id/images',
  '/api/collections', // upload paths live under collections too
  '/uploads'
];

const shouldSkip = (reqPath) => {
  return SKIP_PATH_PREFIXES.some(prefix => reqPath.startsWith(prefix));
};

const requestTimeoutMiddleware = ({ ms = DEFAULT_TIMEOUT_MS } = {}) => {
  return (req, res, next) => {
    if (shouldSkip(req.path)) return next();

    const timer = setTimeout(() => {
      if (res.headersSent) return;
      logger.warn('Request timed out', {
        requestId: req.id,
        method: req.method,
        url: req.originalUrl,
        timeoutMs: ms
      });
      res.status(503).json({
        error: 'Request timeout',
        message: 'The server took too long to respond. Please retry.',
        requestId: req.id
      });
    }, ms);

    const clear = () => clearTimeout(timer);
    res.on('finish', clear);
    res.on('close', clear);

    next();
  };
};

module.exports = { requestTimeoutMiddleware };
