// Dev-only verbose request/response logger. Emits both a request line and
// a response line — helpful when debugging locally but too chatty for prod.
const requestLogger = (req, res, next) => {
  const start = Date.now();
  const timestamp = new Date().toISOString();

  console.log(JSON.stringify({
    type: 'request',
    timestamp,
    requestId: req.id,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent'),
    contentType: req.get('Content-Type'),
    ...(req.user && { userId: req.user.userId })
  }));

  const originalJson = res.json;
  res.json = function(body) {
    const duration = Date.now() - start;
    console.log(JSON.stringify({
      type: 'response',
      timestamp: new Date().toISOString(),
      requestId: req.id,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip || req.connection.remoteAddress,
      ...(req.user && { userId: req.user.userId }),
      ...(res.statusCode >= 400 && { error: true })
    }));

    return originalJson.call(this, body);
  };

  next();
};

// Lightweight production access logger. One JSON line per completed
// response, driven by `res.on('finish')` so we don't allocate or buffer
// per-request state. Emits only dimensions we need for operational
// dashboards (method, path, status, duration, size, requestId, userId).
// Paths known to be high-volume and low-signal are sampled to keep log
// volume manageable.
const HIGH_VOLUME_PATHS = [
  '/health',
  '/api/csrf-token'
];
const SAMPLE_RATE = Number(process.env.ACCESS_LOG_SAMPLE_RATE) || 0.1; // 10%

const accessLogger = (req, res, next) => {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    try {
      const isHighVolume = HIGH_VOLUME_PATHS.some((p) => req.originalUrl.startsWith(p));
      if (isHighVolume && Math.random() > SAMPLE_RATE && res.statusCode < 400) {
        return;
      }

      const durationMs = Number((process.hrtime.bigint() - start) / 1000000n);
      console.log(JSON.stringify({
        type: 'access',
        timestamp: new Date().toISOString(),
        requestId: req.id,
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        durationMs,
        ip: req.ip,
        contentLength: Number(res.getHeader('Content-Length')) || undefined,
        userId: req.user && req.user.userId,
        error: res.statusCode >= 400 || undefined
      }));
    } catch {
      // Access logging must never throw into the request pipeline.
    }
  });

  next();
};

// Error logger
const errorLogger = (err, req, res, next) => {
  console.log(JSON.stringify({
    type: 'error',
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.originalUrl,
    error: {
      name: err.name,
      message: err.message,
      stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined
    },
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent'),
    ...(req.user && { userId: req.user.userId })
  }));

  next(err);
};

// Database operation logger
const dbLogger = {
  logQuery: (operation, model, query, duration) => {
    console.log(JSON.stringify({
      type: 'database',
      timestamp: new Date().toISOString(),
      operation,
      model,
      query: JSON.stringify(query),
      duration: `${duration}ms`
    }));
  },

  logConnection: (status, error = null) => {
    console.log(JSON.stringify({
      type: 'database_connection',
      timestamp: new Date().toISOString(),
      status,
      ...(error && { error: error.message })
    }));
  }
};

module.exports = {
  requestLogger,
  accessLogger,
  errorLogger,
  dbLogger
};
