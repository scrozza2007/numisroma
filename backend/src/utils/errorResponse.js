/**
 * Standardized error response utility for NumisRoma
 * Provides consistent error formatting across all API endpoints
 */

const logger = require('./logger');

/**
 * Standard error response class
 */
class ErrorResponse {
  /**
   * Send a standardized error response
   * @param {Object} res - Express response object
   * @param {number} statusCode - HTTP status code
   * @param {string} message - Error message
   * @param {Object|Array} details - Additional error details (optional)
   */
  static send(res, statusCode, message, details = null) {
    const response = {
      success: false,
      error: {
        message,
        statusCode,
        ...(details && { details })
      }
    };

    // Log error if it's a server error (5xx)
    if (statusCode >= 500) {
      logger.error('Server error response', {
        statusCode,
        message,
        details,
        url: res.req?.originalUrl,
        method: res.req?.method
      });
    }

    return res.status(statusCode).json(response);
  }

  /**
   * 400 Bad Request
   */
  static badRequest(res, message = 'Bad request', details = null) {
    return this.send(res, 400, message, details);
  }

  /**
   * 401 Unauthorized
   */
  static unauthorized(res, message = 'Unauthorized', details = null) {
    return this.send(res, 401, message, details);
  }

  /**
   * 403 Forbidden
   */
  static forbidden(res, message = 'Forbidden', details = null) {
    return this.send(res, 403, message, details);
  }

  /**
   * 404 Not Found
   */
  static notFound(res, message = 'Resource not found', details = null) {
    return this.send(res, 404, message, details);
  }

  /**
   * 409 Conflict
   */
  static conflict(res, message = 'Resource conflict', details = null) {
    return this.send(res, 409, message, details);
  }

  /**
   * 422 Unprocessable Entity (validation errors)
   */
  static validationError(res, message = 'Validation failed', details = null) {
    return this.send(res, 422, message, details);
  }

  /**
   * 429 Too Many Requests
   */
  static tooManyRequests(res, message = 'Too many requests', details = null) {
    return this.send(res, 429, message, details);
  }

  /**
   * 500 Internal Server Error
   */
  static serverError(res, message = 'Internal server error', details = null) {
    return this.send(res, 500, message, details);
  }

  /**
   * 503 Service Unavailable
   */
  static serviceUnavailable(res, message = 'Service unavailable', details = null) {
    return this.send(res, 503, message, details);
  }
}

/**
 * Standard success response
 */
class SuccessResponse {
  /**
   * Send a standardized success response
   * @param {Object} res - Express response object
   * @param {*} data - Response data
   * @param {string} message - Success message (optional)
   * @param {number} statusCode - HTTP status code (default: 200)
   */
  static send(res, data, message = null, statusCode = 200) {
    const response = {
      success: true,
      ...(message && { message }),
      data
    };

    return res.status(statusCode).json(response);
  }

  /**
   * 200 OK
   */
  static ok(res, data, message = null) {
    return this.send(res, data, message, 200);
  }

  /**
   * 201 Created
   */
  static created(res, data, message = 'Resource created successfully') {
    return this.send(res, data, message, 201);
  }

  /**
   * 204 No Content
   */
  static noContent(res) {
    return res.status(204).end();
  }
}

module.exports = {
  ErrorResponse,
  SuccessResponse
};
