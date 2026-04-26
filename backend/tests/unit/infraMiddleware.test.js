/**
 * Tests for request-id, request-timeout, metrics, and errorHandler middlewares.
 */
const request = require('supertest');
const express = require('express');

// ── requestIdMiddleware ───────────────────────────────────────────────────────
describe('requestIdMiddleware', () => {
  const { requestIdMiddleware } = require('../../src/middlewares/requestId');
  let app;
  beforeEach(() => {
    app = express();
    app.use(requestIdMiddleware);
    app.get('/ping', (req, res) => res.json({ id: req.id }));
  });

  test('attaches a UUID when no X-Request-Id header is present', async () => {
    const res = await request(app).get('/ping').expect(200);
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  test('echoes a valid upstream X-Request-Id', async () => {
    const res = await request(app)
      .get('/ping')
      .set('x-request-id', 'valid-id-1234')
      .expect(200);
    expect(res.body.id).toBe('valid-id-1234');
    expect(res.headers['x-request-id']).toBe('valid-id-1234');
  });

  test('ignores an invalid upstream X-Request-Id and generates a new one', async () => {
    const res = await request(app)
      .get('/ping')
      .set('x-request-id', '<script>xss</script>')
      .expect(200);
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  test('echoes the id in the response header', async () => {
    const res = await request(app).get('/ping');
    expect(res.headers['x-request-id']).toBeDefined();
  });
});

// ── requestTimeoutMiddleware ──────────────────────────────────────────────────
describe('requestTimeoutMiddleware', () => {
  const { requestTimeoutMiddleware } = require('../../src/middlewares/requestTimeout');

  test('calls next() for normal routes', async () => {
    const app = express();
    app.use(requestTimeoutMiddleware({ ms: 5000 }));
    app.get('/ok', (_req, res) => res.json({ ok: true }));
    await request(app).get('/ok').expect(200);
  });

  test('returns 503 after the timeout elapses', async () => {
    const app = express();
    app.use(requestTimeoutMiddleware({ ms: 20 }));
    app.get('/slow', (_req, res) => {
      setTimeout(() => { if (!res.headersSent) res.json({ done: true }); }, 200);
    });
    const res = await request(app).get('/slow').expect(503);
    expect(res.body.error).toMatch(/timeout/i);
  });

  test('skips timeout for upload routes', async () => {
    const app = express();
    app.use(requestTimeoutMiddleware({ ms: 10 }));
    app.get('/api/collections/upload', (_req, res) => {
      setTimeout(() => res.json({ done: true }), 100);
    });
    // Should complete without 503
    await request(app).get('/api/collections/upload').expect(200);
  });
});

// ── metricsMiddleware ─────────────────────────────────────────────────────────
describe('metricsMiddleware', () => {
  const { metricsMiddleware, client } = require('../../src/utils/metrics');

  test('tracks requests without throwing', async () => {
    const app = express();
    app.use(metricsMiddleware);
    app.get('/test', (_req, res) => res.json({ ok: 1 }));

    await request(app).get('/test').expect(200);

    const metrics = await client.register.metrics();
    expect(metrics).toContain('numisroma_http_requests_total');
  });
});

// ── errorHandler ─────────────────────────────────────────────────────────────
describe('errorHandler', () => {
  const { errorHandler, notFoundHandler } = require('../../src/middlewares/errorHandler');

  test('notFoundHandler returns 404', async () => {
    const app = express();
    app.use(notFoundHandler);
    await request(app).get('/does-not-exist').expect(404);
  });

  test('errorHandler returns 500 for generic errors', async () => {
    const app = express();
    app.get('/boom', () => { throw new Error('kaboom'); });
    // eslint-disable-next-line no-unused-vars
    app.use((err, req, res, next) => errorHandler(err, req, res, next));
    await request(app).get('/boom').expect(500);
  });

  test('errorHandler respects statusCode on error object', async () => {
    const app = express();
    app.get('/custom', (_req, _res, next) => {
      const err = new Error('custom');
      err.statusCode = 422;
      next(err);
    });
    // eslint-disable-next-line no-unused-vars
    app.use((err, req, res, next) => errorHandler(err, req, res, next));
    await request(app).get('/custom').expect(422);
  });
});
