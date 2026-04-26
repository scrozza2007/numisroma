/**
 * Advanced token management system for NumisRoma
 * Implements refresh tokens for enhanced security and user experience
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const Session = require('../models/Session');
const logger = require('./logger');

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

/**
 * Token configuration
 */
const TOKEN_CONFIG = {
  // Access token settings
  ACCESS_TOKEN_EXPIRY: process.env.ACCESS_TOKEN_EXPIRY || '15m', // Short-lived
  ACCESS_TOKEN_SECRET: process.env.JWT_SECRET,
  
  // Refresh token settings
  REFRESH_TOKEN_EXPIRY: process.env.REFRESH_TOKEN_EXPIRY || '7d', // Long-lived
  REFRESH_TOKEN_SECRET: (() => {
    // REFRESH_TOKEN_SECRET must ALWAYS be explicitly set
    if (!process.env.REFRESH_TOKEN_SECRET) {
      const envType = process.env.NODE_ENV || 'development';
      logger.error(`CRITICAL: REFRESH_TOKEN_SECRET must be explicitly set in ${envType} environment`);
      throw new Error('REFRESH_TOKEN_SECRET must be set in environment variables. Generate with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
    }
    return process.env.REFRESH_TOKEN_SECRET;
  })(),
  
  // Token rotation settings
  ROTATE_REFRESH_TOKENS: process.env.ROTATE_REFRESH_TOKENS !== 'false', // Default: true
  MAX_REFRESH_TOKENS_PER_USER: parseInt(process.env.MAX_REFRESH_TOKENS_PER_USER) || 5,
  
  // Security settings
  TOKEN_ISSUER: process.env.TOKEN_ISSUER || 'numisroma-api',
  TOKEN_AUDIENCE: process.env.TOKEN_AUDIENCE || 'numisroma-client'
};

/**
 * Generate access token
 */
const generateAccessToken = (payload) => {
  try {
    const tokenPayload = {
      ...payload,
      type: 'access',
      iat: Math.floor(Date.now() / 1000),
      iss: TOKEN_CONFIG.TOKEN_ISSUER,
      aud: TOKEN_CONFIG.TOKEN_AUDIENCE
    };

    return jwt.sign(tokenPayload, TOKEN_CONFIG.ACCESS_TOKEN_SECRET, {
      expiresIn: TOKEN_CONFIG.ACCESS_TOKEN_EXPIRY
    });
  } catch (error) {
    logger.error('Failed to generate access token', { error: error.message, payload });
    throw new Error('Token generation failed');
  }
};

/**
 * Generate refresh token
 */
const generateRefreshToken = (payload) => {
  try {
    const tokenPayload = {
      ...payload,
      type: 'refresh',
      jti: crypto.randomUUID(), // Unique token ID for tracking
      iat: Math.floor(Date.now() / 1000),
      iss: TOKEN_CONFIG.TOKEN_ISSUER,
      aud: TOKEN_CONFIG.TOKEN_AUDIENCE
    };

    return jwt.sign(tokenPayload, TOKEN_CONFIG.REFRESH_TOKEN_SECRET, {
      expiresIn: TOKEN_CONFIG.REFRESH_TOKEN_EXPIRY
    });
  } catch (error) {
    logger.error('Failed to generate refresh token', { error: error.message, payload });
    throw new Error('Refresh token generation failed');
  }
};

/**
 * Verify access token
 */
const verifyAccessToken = (token) => {
  try {
    const decoded = jwt.verify(token, TOKEN_CONFIG.ACCESS_TOKEN_SECRET, {
      issuer: TOKEN_CONFIG.TOKEN_ISSUER,
      audience: TOKEN_CONFIG.TOKEN_AUDIENCE
    });

    if (decoded.type !== 'access') {
      throw new Error('Invalid token type');
    }

    return decoded;
  } catch (error) {
    logger.security.authFailure('Access token verification failed', { 
      error: error.message,
      tokenPreview: token ? token.substring(0, 20) + '...' : 'null'
    });
    throw error;
  }
};

/**
 * Verify refresh token
 */
const verifyRefreshToken = (token) => {
  try {
    const decoded = jwt.verify(token, TOKEN_CONFIG.REFRESH_TOKEN_SECRET, {
      issuer: TOKEN_CONFIG.TOKEN_ISSUER,
      audience: TOKEN_CONFIG.TOKEN_AUDIENCE
    });

    if (decoded.type !== 'refresh') {
      throw new Error('Invalid token type');
    }

    return decoded;
  } catch (error) {
    logger.security.authFailure('Refresh token verification failed', { 
      error: error.message,
      tokenPreview: token ? token.substring(0, 20) + '...' : 'null'
    });
    throw error;
  }
};

/**
 * Generate token pair (access + refresh)
 */
const generateTokenPair = async (userId, additionalPayload = {}) => {
  try {
    const basePayload = {
      userId,
      ...additionalPayload
    };

    const accessToken = generateAccessToken(basePayload);
    const refreshToken = generateRefreshToken(basePayload);

    // Store refresh token in database
    const refreshTokenDecoded = verifyRefreshToken(refreshToken);
    
    // Clean up old refresh tokens if limit exceeded
    await cleanupOldRefreshTokens(userId);

    // Create session — store hashes only, never plaintext tokens
    const session = new Session({
      userId,
      token: hashToken(accessToken),
      refreshToken: hashToken(refreshToken),
      refreshTokenId: refreshTokenDecoded.jti,
      isActive: true,
      lastActive: new Date(),
      expiresAt: new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)), // 7 days
      metadata: {
        tokenType: 'jwt_with_refresh',
        userAgent: additionalPayload.userAgent || null,
        ipAddress: additionalPayload.ipAddress || null
      }
    });

    await session.save();

    logger.info('Token pair generated', {
      userId,
      sessionId: session._id,
      refreshTokenId: refreshTokenDecoded.jti
    });

    return {
      accessToken,
      refreshToken,
      sessionId: session._id,
      expiresIn: TOKEN_CONFIG.ACCESS_TOKEN_EXPIRY
    };
  } catch (error) {
    logger.error('Failed to generate token pair', { 
      error: error.message, 
      userId 
    });
    throw error;
  }
};

/**
 * Refresh access token using refresh token
 */
const refreshAccessToken = async (refreshToken, additionalPayload = {}) => {
  try {
    // Verify refresh token
    const decoded = verifyRefreshToken(refreshToken);
    
    // Find session with this refresh token
    const session = await Session.findOne({
      refreshTokenId: decoded.jti,
      isActive: true
    });

    if (!session) {
      logger.security.authFailure('Refresh token session not found', {
        refreshTokenId: decoded.jti,
        userId: decoded.userId
      });
      throw new Error('Invalid refresh token session');
    }

    // Check if session is expired
    if (session.expiresAt < new Date()) {
      logger.security.authFailure('Refresh token session expired', {
        sessionId: session._id,
        userId: decoded.userId,
        expiredAt: session.expiresAt
      });
      
      // Clean up expired session
      await Session.findByIdAndUpdate(session._id, { isActive: false });
      throw new Error('Refresh token expired');
    }

    // Generate new access token
    const newAccessToken = generateAccessToken({
      userId: decoded.userId,
      ...additionalPayload
    });

    let newRefreshToken = refreshToken; // Keep same refresh token by default

    if (TOKEN_CONFIG.ROTATE_REFRESH_TOKENS) {
      const refreshPayload = {
        userId: decoded.userId,
        ...additionalPayload
      };

      newRefreshToken = generateRefreshToken(refreshPayload);
      const newRefreshDecoded = jwt.decode(newRefreshToken);

      session.refreshToken = hashToken(newRefreshToken);
      session.refreshTokenId = newRefreshDecoded.jti;
    }

    session.token = hashToken(newAccessToken);
    session.lastActive = new Date();
    await session.save();

    logger.info('Access token refreshed', {
      userId: decoded.userId,
      sessionId: session._id,
      rotatedRefresh: TOKEN_CONFIG.ROTATE_REFRESH_TOKENS
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      sessionId: session._id,
      expiresIn: TOKEN_CONFIG.ACCESS_TOKEN_EXPIRY
    };
  } catch (error) {
    logger.error('Failed to refresh access token', { error: error.message });
    throw error;
  }
};

/**
 * Revoke refresh token
 */
const revokeRefreshToken = async (refreshToken) => {
  try {
    const decoded = verifyRefreshToken(refreshToken);
    
    const session = await Session.findOneAndUpdate(
      { refreshTokenId: decoded.jti, isActive: true },
      { isActive: false, revokedAt: new Date() }
    );

    if (session) {
      logger.info('Refresh token revoked', {
        userId: decoded.userId,
        sessionId: session._id,
        refreshTokenId: decoded.jti
      });
      return true;
    }

    return false;
  } catch (error) {
    logger.error('Failed to revoke refresh token', { error: error.message });
    return false;
  }
};

/**
 * Revoke all refresh tokens for a user
 */
const revokeAllRefreshTokens = async (userId) => {
  try {
    const result = await Session.updateMany(
      { userId, isActive: true },
      { isActive: false, revokedAt: new Date() }
    );

    logger.info('All refresh tokens revoked for user', {
      userId,
      revokedCount: result.modifiedCount
    });

    return result.modifiedCount;
  } catch (error) {
    logger.error('Failed to revoke all refresh tokens', { error: error.message, userId });
    throw error;
  }
};

/**
 * Clean up old refresh tokens for a user (keep only the most recent ones)
 */
const cleanupOldRefreshTokens = async (userId) => {
  try {
    const sessions = await Session.find({ 
      userId, 
      isActive: true 
    }).sort({ lastActive: -1 });

    if (sessions.length > TOKEN_CONFIG.MAX_REFRESH_TOKENS_PER_USER) {
      const sessionsToDeactivate = sessions.slice(TOKEN_CONFIG.MAX_REFRESH_TOKENS_PER_USER);
      
      const sessionIds = sessionsToDeactivate.map(s => s._id);
      
      await Session.updateMany(
        { _id: { $in: sessionIds } },
        { isActive: false, revokedAt: new Date() }
      );

      logger.info('Old refresh tokens cleaned up', {
        userId,
        cleanedCount: sessionIds.length,
        remainingCount: TOKEN_CONFIG.MAX_REFRESH_TOKENS_PER_USER
      });
    }
  } catch (error) {
    logger.error('Failed to cleanup old refresh tokens', { error: error.message, userId });
  }
};

/**
 * Get token information
 */
const getTokenInfo = (token, type = 'access') => {
  try {
    const secret = type === 'access' ? TOKEN_CONFIG.ACCESS_TOKEN_SECRET : TOKEN_CONFIG.REFRESH_TOKEN_SECRET;
    const decoded = jwt.verify(token, secret, { ignoreExpiration: true });
    
    return {
      userId: decoded.userId,
      type: decoded.type,
      issued: new Date(decoded.iat * 1000),
      expires: new Date(decoded.exp * 1000),
      isExpired: decoded.exp < (Date.now() / 1000),
      jti: decoded.jti || null
    };
  } catch (error) {
    return null;
  }
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  generateTokenPair,
  refreshAccessToken,
  revokeRefreshToken,
  revokeAllRefreshTokens,
  cleanupOldRefreshTokens,
  getTokenInfo,
  hashToken,
  TOKEN_CONFIG
};
