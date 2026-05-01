const Notification = require('../models/Notification');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const logger = require('../utils/logger');
const sseEmitter = require('../utils/sseEmitter');

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

// Push updated counts to a user's SSE connection (best-effort, no throw).
const pushCountsToUser = async (userId) => {
  try {
    const [notifCount, msgCount] = await Promise.all([
      Notification.countDocuments({ recipient: userId, isRead: false }),
      (async () => {
        const convs = await Conversation.find({ participants: userId }).select('_id').lean();
        if (!convs.length) return 0;
        return Message.countDocuments({
          conversation: { $in: convs.map(c => c._id) },
          sender: { $ne: userId },
          'readBy.user': { $ne: userId },
          isDeleted: false
        });
      })()
    ]);
    sseEmitter.emit(`user:${userId}`, { notifications: notifCount, messages: msgCount });
  } catch (err) {
    logger.warn('pushCountsToUser failed', { userId, error: err.message });
  }
};

// Helper called by other controllers to create a notification and push SSE update.
const createNotification = async ({ recipient, sender, type, relatedUser, relatedConversation }) => {
  if (String(recipient) === String(sender)) return null;
  const notification = await Notification.create({
    recipient,
    sender,
    type,
    relatedUser: relatedUser || null,
    relatedConversation: relatedConversation || null
  });
  pushCountsToUser(String(recipient)).catch(() => {});
  return notification;
};

// GET /api/notifications
const getNotifications = async (req, res) => {
  try {
    const userId = req.user.userId;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || DEFAULT_PAGE_SIZE, 1),
      MAX_PAGE_SIZE
    );
    const skip = (page - 1) * limit;

    const [notifications, total] = await Promise.all([
      Notification.find({ recipient: userId })
        .populate('sender', 'username avatar')
        .populate('relatedConversation', '_id')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments({ recipient: userId })
    ]);

    res.json({
      notifications,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasMore: skip + notifications.length < total
      }
    });
  } catch (error) {
    logger.error('Error retrieving notifications', { error: error.message });
    res.status(500).json({ message: 'Error retrieving notifications' });
  }
};

// GET /api/notifications/unread-count
const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.userId;
    const count = await Notification.countDocuments({ recipient: userId, isRead: false });
    res.json({ count });
  } catch (error) {
    logger.error('Error counting unread notifications', { error: error.message });
    res.status(500).json({ message: 'Error counting notifications' });
  }
};

// PUT /api/notifications/:id/read
const markOneRead = async (req, res) => {
  try {
    const userId = req.user.userId;
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: userId },
      { isRead: true },
      { new: true }
    );
    if (!notification) return res.status(404).json({ message: 'Notification not found' });
    res.json(notification);
  } catch (error) {
    logger.error('Error marking notification read', { error: error.message });
    res.status(500).json({ message: 'Error updating notification' });
  }
};

// PUT /api/notifications/read-all
const markAllRead = async (req, res) => {
  try {
    const userId = req.user.userId;
    await Notification.updateMany({ recipient: userId, isRead: false }, { isRead: true });
    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    logger.error('Error marking all notifications read', { error: error.message });
    res.status(500).json({ message: 'Error updating notifications' });
  }
};

// Track active SSE connections per user to kick old one when new one opens.
const activeConnections = new Map();

// GET /api/notifications/stream  — SSE
const streamNotifications = async (req, res) => {
  const userId = req.user.userId;

  // Kick the previous connection for this user.
  const prev = activeConnections.get(userId);
  if (prev) {
    try { prev.end(); } catch {}
  }
  activeConnections.set(userId, res);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const sendEvent = (data) => {
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {}
  };

  // Send initial counts immediately.
  try {
    const [notifCount, msgCount] = await Promise.all([
      Notification.countDocuments({ recipient: userId, isRead: false }),
      (async () => {
        const convs = await Conversation.find({ participants: userId }).select('_id').lean();
        if (!convs.length) return 0;
        return Message.countDocuments({
          conversation: { $in: convs.map(c => c._id) },
          sender: { $ne: userId },
          'readBy.user': { $ne: userId },
          isDeleted: false
        });
      })()
    ]);
    sendEvent({ notifications: notifCount, messages: msgCount });
  } catch {}

  const listener = (data) => sendEvent(data);
  const eventKey = `user:${userId}`;
  sseEmitter.on(eventKey, listener);

  // 30-second keepalive comment.
  const heartbeat = setInterval(() => {
    try { res.write(': ping\n\n'); } catch {}
  }, 30000);

  const cleanup = () => {
    clearInterval(heartbeat);
    sseEmitter.off(eventKey, listener);
    if (activeConnections.get(userId) === res) activeConnections.delete(userId);
  };

  req.on('close', cleanup);
  req.on('aborted', cleanup);
};

module.exports = {
  getNotifications,
  getUnreadCount,
  markOneRead,
  markAllRead,
  streamNotifications,
  createNotification,
  pushCountsToUser
};
