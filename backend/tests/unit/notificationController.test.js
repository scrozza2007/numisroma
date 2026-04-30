const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../../src/models/User');
const Follow = require('../../src/models/Follow');
const Notification = require('../../src/models/Notification');
const notificationRoutes = require('../../src/routes/notifications');
const userRoutes = require('../../src/routes/users');

const app = express();
app.use(express.json());

// Minimal auth middleware for tests — reads Bearer token.
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }
};

// Patch the actual authMiddleware used by routes.
jest.mock('../../src/middlewares/authMiddleware', () => {
  const jwt = require('jsonwebtoken');
  return (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Unauthorized' });
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET);
      next();
    } catch {
      res.status(401).json({ message: 'Invalid token' });
    }
  };
});

// Suppress SSE-emitter side-effects in tests.
jest.mock('../../src/utils/sseEmitter', () => {
  const { EventEmitter } = require('events');
  return new EventEmitter();
});

app.use('/api/notifications', notificationRoutes);
app.use('/api/users', userRoutes);

const makeToken = (userId) =>
  jwt.sign({ userId: String(userId) }, process.env.JWT_SECRET, { expiresIn: '1h' });

const createUser = async (username) =>
  User.create({
    username,
    email: `${username}@test.com`,
    password: 'hashedpassword123'
  });

describe('Notification model', () => {
  test('creates a notification with required fields', async () => {
    const [u1, u2] = await Promise.all([createUser('notif_user1'), createUser('notif_user2')]);
    const notif = await Notification.create({
      recipient: u1._id,
      sender: u2._id,
      type: 'new_follower'
    });
    expect(notif.isRead).toBe(false);
    expect(notif.type).toBe('new_follower');
    expect(String(notif.recipient)).toBe(String(u1._id));
  });

  test('rejects invalid notification type', async () => {
    const [u1, u2] = await Promise.all([createUser('nt_user3'), createUser('nt_user4')]);
    await expect(
      Notification.create({ recipient: u1._id, sender: u2._id, type: 'invalid_type' })
    ).rejects.toThrow();
  });
});

describe('GET /api/notifications/unread-count', () => {
  test('returns 0 when no notifications', async () => {
    const user = await createUser('unread_u1');
    const token = makeToken(user._id);
    const res = await request(app)
      .get('/api/notifications/unread-count')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.count).toBe(0);
  });

  test('returns correct unread count', async () => {
    const [u1, u2] = await Promise.all([createUser('unread_u2'), createUser('unread_u3')]);
    await Notification.create([
      { recipient: u1._id, sender: u2._id, type: 'new_follower', isRead: false },
      { recipient: u1._id, sender: u2._id, type: 'new_message', isRead: true }
    ]);
    const token = makeToken(u1._id);
    const res = await request(app)
      .get('/api/notifications/unread-count')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.count).toBe(1);
  });
});

describe('PUT /api/notifications/read-all', () => {
  test('marks all notifications as read', async () => {
    const [u1, u2] = await Promise.all([createUser('readall_u1'), createUser('readall_u2')]);
    await Notification.create([
      { recipient: u1._id, sender: u2._id, type: 'new_follower', isRead: false },
      { recipient: u1._id, sender: u2._id, type: 'new_message', isRead: false }
    ]);
    const token = makeToken(u1._id);
    await request(app)
      .put('/api/notifications/read-all')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const count = await Notification.countDocuments({ recipient: u1._id, isRead: false });
    expect(count).toBe(0);
  });
});

describe('POST /api/users/:id/follow with private profile', () => {
  test('creates pending Follow and follow_request notification for private profile', async () => {
    const [actor, target] = await Promise.all([
      createUser('follow_actor'),
      User.create({ username: 'private_target', email: 'pt@test.com', password: 'pw123456', isPrivate: true })
    ]);
    const token = makeToken(actor._id);
    const res = await request(app)
      .post(`/api/users/${target._id}/follow`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    expect(res.body.followStatus).toBe('pending');

    const follow = await Follow.findOne({ follower: actor._id, following: target._id });
    expect(follow.status).toBe('pending');

    const notif = await Notification.findOne({ recipient: target._id, type: 'follow_request' });
    expect(notif).not.toBeNull();
  });

  test('creates accepted Follow and new_follower notification for public profile', async () => {
    const [actor, target] = await Promise.all([
      createUser('pub_actor'),
      createUser('pub_target')
    ]);
    const token = makeToken(actor._id);
    const res = await request(app)
      .post(`/api/users/${target._id}/follow`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    expect(res.body.followStatus).toBe('accepted');

    const follow = await Follow.findOne({ follower: actor._id, following: target._id });
    expect(follow.status).toBe('accepted');

    const notif = await Notification.findOne({ recipient: target._id, type: 'new_follower' });
    expect(notif).not.toBeNull();
  });
});

describe('POST /api/users/:id/follow-request/accept', () => {
  test('accepts a pending follow request and sends follow_accepted notification', async () => {
    const [requester, owner] = await Promise.all([
      createUser('req_user'),
      User.create({ username: 'owner_user', email: 'owner@test.com', password: 'pw123456', isPrivate: true })
    ]);

    await Follow.create({ follower: requester._id, following: owner._id, status: 'pending' });

    const token = makeToken(owner._id);
    await request(app)
      .post(`/api/users/${requester._id}/follow-request/accept`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const follow = await Follow.findOne({ follower: requester._id, following: owner._id });
    expect(follow.status).toBe('accepted');

    const notif = await Notification.findOne({ recipient: requester._id, type: 'follow_accepted' });
    expect(notif).not.toBeNull();
  });

  test('returns 404 when no pending request exists', async () => {
    const [u1, u2] = await Promise.all([createUser('no_req_1'), createUser('no_req_2')]);
    const token = makeToken(u2._id);
    await request(app)
      .post(`/api/users/${u1._id}/follow-request/accept`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});

describe('GET /api/users/:id/follow-requests', () => {
  test('returns pending requests for own profile', async () => {
    const [r1, r2, owner] = await Promise.all([
      createUser('fr_r1'),
      createUser('fr_r2'),
      User.create({ username: 'fr_owner', email: 'fro@test.com', password: 'pw123456', isPrivate: true })
    ]);
    await Follow.create([
      { follower: r1._id, following: owner._id, status: 'pending' },
      { follower: r2._id, following: owner._id, status: 'pending' }
    ]);
    const token = makeToken(owner._id);
    const res = await request(app)
      .get(`/api/users/${owner._id}/follow-requests`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.requests).toHaveLength(2);
    expect(res.body.pagination.total).toBe(2);
  });

  test('returns 403 when accessing someone else\'s follow requests', async () => {
    const [u1, u2] = await Promise.all([createUser('fr_other1'), createUser('fr_other2')]);
    const token = makeToken(u1._id);
    await request(app)
      .get(`/api/users/${u2._id}/follow-requests`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });
});
