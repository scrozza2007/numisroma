const { Schema, model } = require('mongoose');

const SessionSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  token: {
    type: String,
    required: true,
    unique: true
  },
  // Refresh token support
  refreshToken: {
    type: String,
    unique: true,
    sparse: true // Allow null values to be unique
  },
  refreshTokenId: {
    type: String
    // Uniqueness + sparseness enforced via `SessionSchema.index` below.
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
  },
  revokedAt: {
    type: Date
  },
  deviceInfo: {
    type: {
      type: String,
      enum: ['desktop', 'mobile', 'tablet', 'unknown'],
      default: 'unknown'
    },
    operatingSystem: {
      type: String,
      default: 'unknown'
    },
    browser: {
      type: String,
      default: 'unknown'
    },
    deviceName: {
      type: String,
      default: 'Unknown device'
    }
  },
  ipAddress: {
    type: String
  },
  location: {
    type: String,
    default: 'Unknown'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastActive: {
    type: Date,
    default: Date.now
  },
  // Additional metadata for enhanced security
  metadata: {
    tokenType: {
      type: String,
      enum: ['jwt', 'jwt_with_refresh'],
      default: 'jwt'
    },
    userAgent: String,
    ipAddress: String,
    loginMethod: {
      type: String,
      enum: ['password', 'refresh_token', 'social'],
      default: 'password'
    }
  }
}, { timestamps: true });

// Index for cleanup operations
SessionSchema.index({ userId: 1, isActive: 1, lastActive: -1 });
SessionSchema.index({ token: 1, isActive: 1 }); // Critical for auth middleware
SessionSchema.index({ refreshTokenId: 1 }, { unique: true, sparse: true });
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = model('Session', SessionSchema); 