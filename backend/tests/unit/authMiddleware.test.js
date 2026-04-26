/**
 * Unit tests for auth middleware
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../../src/models/User');
const Session = require('../../src/models/Session');
const { auth, optionalAuth } = require('../../src/middlewares/auth');
const { hashToken } = require('../../src/utils/tokenManager');
const userFixtures = require('../fixtures/users');

async function createActiveSession(userId, token) {
  await Session.create({
    userId,
    token: hashToken(token),
    isActive: true,
    lastActive: new Date()
  });
}

// Create Express app for testing
const app = express();
app.use(express.json());

// Test route that requires authentication
app.get('/protected', auth, (req, res) => {
  res.json({ 
    message: 'Access granted', 
    userId: req.user._id
  });
});

app.get('/test-no-id', auth, (req, res) => {
  res.json({
    message: 'Access granted',
    userId: req.user._id != null ? String(req.user._id) : 'undefined'
  });
});

// Test route with optional authentication
app.get('/optional', optionalAuth, (req, res) => {
  res.json({ 
    message: 'Optional access',
    userId: req.user?._id || null,
    isAuthenticated: !!req.user
  });
});

// Test route that doesn't require authentication
app.get('/public', (req, res) => {
  res.json({ message: 'Public access' });
});

describe('Auth Middleware', () => {
  let testUser, validToken;

  beforeEach(async () => {
    const userData = await userFixtures.createUserWithHashedPassword(userFixtures.validUser);
    testUser = await User.create(userData);

    validToken = jwt.sign(
      { userId: testUser._id },
      process.env.JWT_SECRET || 'test_jwt_secret_for_testing_purposes_only',
      { expiresIn: '1h' }
    );
    await createActiveSession(testUser._id, validToken);
  });

  describe('auth middleware - Valid Authentication', () => {
    test('should allow access with valid token in Authorization header', async () => {
      const response = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Access granted');
      expect(response.body).toHaveProperty('userId', testUser._id.toString());
    });

    test('should attach decoded JWT to request', async () => {
      const response = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      // Verify user ID from JWT is attached
      expect(response.body.userId).toBe(testUser._id.toString());
    });

    test('should work with recently created token', async () => {
      const freshToken = jwt.sign(
        { userId: testUser._id },
        process.env.JWT_SECRET || 'test_jwt_secret_for_testing_purposes_only',
        { expiresIn: '2h' }
      );
      await createActiveSession(testUser._id, freshToken);

      const response = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${freshToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Access granted');
    });

    test('should work with token containing additional payload data', async () => {
      const tokenWithExtraData = jwt.sign(
        {
          userId: testUser._id,
          role: 'admin',
          permissions: ['read', 'write']
        },
        process.env.JWT_SECRET || 'test_jwt_secret_for_testing_purposes_only',
        { expiresIn: '1h' }
      );
      await createActiveSession(testUser._id, tokenWithExtraData);

      const response = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${tokenWithExtraData}`)
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Access granted');
      expect(response.body).toHaveProperty('userId', testUser._id.toString());
    });
  });

  describe('auth middleware - Invalid Authentication', () => {
    test('should reject request without token', async () => {
      const response = await request(app)
        .get('/protected')
        .expect(401);

      expect(response.body).toHaveProperty('msg', 'Missing token, access denied');
    });

    test('should reject request without Authorization header', async () => {
      const response = await request(app)
        .get('/protected')
        .expect(401);

      expect(response.body).toHaveProperty('msg', 'Missing token, access denied');
    });

    test('should reject request with invalid token', async () => {
      const response = await request(app)
        .get('/protected')
        .set('Authorization', 'Bearer invalid_token_here')
        .expect(401);

      expect(response.body).toHaveProperty('msg', 'Invalid token, access denied');
    });

    test('should reject request with expired token', async () => {
      const expiredToken = jwt.sign(
        { userId: testUser._id },
        process.env.JWT_SECRET || 'test_jwt_secret_for_testing_purposes_only',
        { expiresIn: '-1h' }
      );

      const response = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      expect(response.body).toHaveProperty('msg', 'Invalid token, access denied');
    });

    test('should reject token with invalid signature', async () => {
      const tokenWithWrongSecret = jwt.sign(
        { userId: testUser._id },
        'wrong_secret',
        { expiresIn: '1h' }
      );

      const response = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${tokenWithWrongSecret}`)
        .expect(401);

      expect(response.body).toHaveProperty('msg', 'Invalid token, access denied');
    });

    test('should reject malformed Authorization header', async () => {
      const response = await request(app)
        .get('/protected')
        .set('Authorization', 'InvalidFormat')
        .expect(401);

      expect(response.body).toHaveProperty('msg', 'Missing token, access denied');
    });

    test('should handle empty Authorization header', async () => {
      const response = await request(app)
        .get('/protected')
        .set('Authorization', '')
        .expect(401);

      expect(response.body).toHaveProperty('msg', 'Missing token, access denied');
    });

    test('should handle Authorization header with only "Bearer"', async () => {
      const response = await request(app)
        .get('/protected')
        .set('Authorization', 'Bearer')
        .expect(401);

      expect(response.body).toHaveProperty('msg', 'Missing token, access denied');
    });

    test('should handle Authorization header with "Bearer " and space', async () => {
      const response = await request(app)
        .get('/protected')
        .set('Authorization', 'Bearer ')
        .expect(401);

      expect(response.body).toHaveProperty('msg', 'Missing token, access denied');
    });
  });

  describe('optionalAuth middleware', () => {
    test('should allow access without token and set user to null', async () => {
      const response = await request(app)
        .get('/optional')
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Optional access');
      expect(response.body).toHaveProperty('userId', null);
      expect(response.body).toHaveProperty('isAuthenticated', false);
    });

    test('should allow access with valid token', async () => {
      const response = await request(app)
        .get('/optional')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Optional access');
      expect(response.body).toHaveProperty('userId', testUser._id.toString());
      expect(response.body).toHaveProperty('isAuthenticated', true);
    });

    test('should allow access with invalid token and set user to null', async () => {
      const response = await request(app)
        .get('/optional')
        .set('Authorization', 'Bearer invalid_token')
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Optional access');
      expect(response.body).toHaveProperty('userId', null);
      expect(response.body).toHaveProperty('isAuthenticated', false);
    });

    test('should allow access with expired token and set user to null', async () => {
      const expiredToken = jwt.sign(
        { userId: testUser._id },
        process.env.JWT_SECRET || 'test_jwt_secret_for_testing_purposes_only',
        { expiresIn: '-1h' }
      );

      const response = await request(app)
        .get('/optional')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Optional access');
      expect(response.body).toHaveProperty('userId', null);
      expect(response.body).toHaveProperty('isAuthenticated', false);
    });
  });

  describe('Token Format Handling', () => {
    test('should extract token correctly from Bearer format', async () => {
      const response = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Access granted');
    });

    test('should trim Bearer token when extra spaces are present', async () => {
      const response = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer  ${validToken}  `)
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Access granted');
    });

    test('should reject raw JWT without Bearer prefix in Authorization header', async () => {
      const response = await request(app)
        .get('/protected')
        .set('Authorization', validToken)
        .expect(401);

      expect(response.body).toHaveProperty('msg', 'Missing token, access denied');
    });
  });

  describe('JWT Payload Handling', () => {
    test('should handle token with minimal payload', async () => {
      const minimalToken = jwt.sign(
        { userId: testUser._id, scope: 'minimal-payload-test' },
        process.env.JWT_SECRET || 'test_jwt_secret_for_testing_purposes_only',
        { expiresIn: '55m' }
      );
      await createActiveSession(testUser._id, minimalToken);

      const response = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${minimalToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('userId', testUser._id.toString());
    });

    test('should handle token with additional claims', async () => {
      const tokenWithClaims = jwt.sign(
        {
          userId: testUser._id,
          username: testUser.username,
          role: 'user',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600
        },
        process.env.JWT_SECRET || 'test_jwt_secret_for_testing_purposes_only'
      );
      await createActiveSession(testUser._id, tokenWithClaims);

      const response = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${tokenWithClaims}`)
        .expect(200);

      expect(response.body).toHaveProperty('userId', testUser._id.toString());
    });

    test('should allow token missing userId claim when session is valid', async () => {
      const tokenWithoutUserId = jwt.sign(
        { username: testUser.username },
        process.env.JWT_SECRET || 'test_jwt_secret_for_testing_purposes_only',
        { expiresIn: '1h' }
      );
      await createActiveSession(testUser._id, tokenWithoutUserId);

      const response = await request(app)
        .get('/test-no-id')
        .set('Authorization', `Bearer ${tokenWithoutUserId}`)
        .expect(200);

      expect(response.body).toHaveProperty('userId', 'undefined');
    });
  });

  describe('Error Scenarios', () => {
    test('should handle malformed JWT', async () => {
      const response = await request(app)
        .get('/protected')
        .set('Authorization', 'Bearer not.a.jwt')
        .expect(401);

      expect(response.body).toHaveProperty('msg', 'Invalid token, access denied');
    });

    test('should handle completely invalid token format', async () => {
      const response = await request(app)
        .get('/protected')
        .set('Authorization', 'Bearer ;;;;invalid;;;;')
        .expect(401);

      expect(response.body).toHaveProperty('msg', 'Invalid token, access denied');
    });

    test('should handle empty token after Bearer', async () => {
      const response = await request(app)
        .get('/protected')
        .set('Authorization', 'Bearer ')
        .expect(401);

      expect(response.body).toHaveProperty('msg', 'Missing token, access denied');
    });
  });

  describe('Public Routes', () => {
    test('should allow access to public routes without token', async () => {
      const response = await request(app)
        .get('/public')
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Public access');
    });

    test('should allow access to public routes with invalid token', async () => {
      const response = await request(app)
        .get('/public')
        .set('Authorization', 'Bearer invalid_token')
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Public access');
    });
  });
});