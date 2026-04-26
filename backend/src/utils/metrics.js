const client = require('prom-client');

// Collect default Node.js process metrics (event loop lag, heap, GC, etc.)
client.collectDefaultMetrics({ prefix: 'numisroma_' });

const httpRequestDuration = new client.Histogram({
  name: 'numisroma_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]
});

const httpRequestsTotal = new client.Counter({
  name: 'numisroma_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

// Normalise a raw URL path to a route label so high-cardinality IDs
// don't produce thousands of unique metric series.
const normaliseRoute = (req) => {
  // Use Express's matched route pattern when available (e.g. /api/coins/:id)
  if (req.route && req.route.path) {
    const base = req.baseUrl || '';
    return `${base}${req.route.path}`;
  }
  // Fall back to the first two path segments to avoid cardinality explosion.
  const segments = (req.originalUrl || '/').split('?')[0].split('/').filter(Boolean);
  return `/${segments.slice(0, 2).join('/')}` || '/';
};

const metricsMiddleware = (req, res, next) => {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    const route = normaliseRoute(req);
    const labels = { method: req.method, route, status_code: res.statusCode };
    end(labels);
    httpRequestsTotal.inc(labels);
  });
  next();
};

module.exports = { client, metricsMiddleware };
