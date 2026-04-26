const Sentry = require('@sentry/node');
const logger = require('../utils/logger');

const initSentry = () => {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    if (process.env.NODE_ENV === 'production') {
      logger.warn('SENTRY_DSN not set — error tracking disabled');
    }
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.npm_package_version,
    // Only sample 10% of performance traces to keep quota manageable.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE) || 0.1,
    // Don't send PII like IPs or user agents by default.
    sendDefaultPii: false,
    integrations: [
      Sentry.httpIntegration({ tracing: true }),
      Sentry.mongooseIntegration(),
    ],
    beforeSend(event) {
      // Strip auth cookie values so they never reach Sentry.
      if (event.request?.cookies) {
        const sanitized = {};
        for (const key of Object.keys(event.request.cookies)) {
          sanitized[key] = '[Filtered]';
        }
        event.request.cookies = sanitized;
      }
      return event;
    }
  });

  logger.info('Sentry initialized', { environment: process.env.NODE_ENV });
};

module.exports = { initSentry, Sentry };
