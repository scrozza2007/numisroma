const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Notification = require('../models/Notification');
const User = require('../models/User');
const logger = require('../utils/logger');
const { PAGINATION } = require('../config/constants');
const { createNotification } = require('./notificationController');

/**
 * Escape special regex characters to prevent ReDoS attacks
 */
const escapeRegex = (str) => {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

// Get all conversations for a user. Paginated and with narrow `lastMessage`
// projection to keep per-row payload small (the UI only needs a preview).
const getConversations = async (req, res) => {
  try {
    const userId = req.user.userId;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 30, 1),
      PAGINATION.MAX_LIMIT
    );
    const skip = (page - 1) * limit;

    const [conversations, total] = await Promise.all([
      Conversation.find({ participants: userId })
        .populate('participants', 'username fullName avatar')
        .populate({
          path: 'lastMessage',
          select: 'content messageType sender createdAt isDeleted'
        })
        .sort({ lastActivity: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Conversation.countDocuments({ participants: userId })
    ]);

    res.json({
      conversations,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasMore: skip + conversations.length < total
      }
    });
  } catch (error) {
    logger.error('Error retrieving conversations', { userId: req.user.userId, error: error.message });
    res.status(500).json({ message: 'Server error' });
  }
};

// Get or create a conversation between two users.
//
// Race-safe: a single atomic upsert keyed on `participants: { $all: [...] }`
// + `$size: 2` ensures concurrent creators converge on the same document,
// avoiding the TOCTOU window of a find-then-create sequence. Also rejects
// self-conversations explicitly.
const getOrCreateConversation = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { otherUserId } = req.params;

    if (String(userId) === String(otherUserId)) {
      return res.status(400).json({ message: 'Cannot start a conversation with yourself' });
    }

    const otherUser = await User.findById(otherUserId).select('isPrivate').lean();
    if (!otherUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Block messaging a private profile unless the sender is an accepted follower.
    if (otherUser.isPrivate) {
      const Follow = require('../models/Follow');
      const isFollowing = await Follow.exists({ follower: userId, following: otherUserId, status: 'accepted' });
      if (!isFollowing) {
        return res.status(403).json({
          message: 'This account is private. Follow them to send a message.',
          code: 'PRIVATE_PROFILE'
        });
      }
    }

    let conversation = await Conversation.findOne({
      participants: { $all: [userId, otherUserId], $size: 2 }
    }).populate('participants', 'username fullName avatar');

    if (!conversation) {
      conversation = await Conversation.create({
        participants: [userId, otherUserId],
        lastActivity: new Date()
      });
      conversation = await conversation.populate('participants', 'username fullName avatar');
    }

    res.json(conversation);
  } catch (error) {
    logger.error('Error getting/creating conversation', { error: error.message });
    res.status(500).json({ message: 'Server error' });
  }
};

// Get messages from a conversation
const getMessages = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { conversationId } = req.params;
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit) || 50, 1),
      PAGINATION.MAX_LIMIT
    );
    const skip = (page - 1) * limit;

    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId
    });

    if (!conversation) {
      return res.status(403).json({ message: 'Access denied to conversation' });
    }

    const messages = await Message.find({
      conversation: conversationId,
      isDeleted: false
    })
    .populate('sender', 'username fullName avatar')
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip);

    res.json(messages.reverse());
  } catch (error) {
    logger.error('Error retrieving messages', { error: error.message });
    res.status(500).json({ message: 'Server error' });
  }
};

// Send a new message. We:
//   1. Verify access atomically with an existence check on the conversation
//      (ownership-by-membership).
//   2. Insert the message.
//   3. Bump `lastMessage`/`lastActivity` on the conversation using
//      `updateOne` (atomic, race-safe) instead of read/mutate/save, so
//      simultaneous sends don't clobber each other's `lastMessage`.
//   4. Also enforce simple server-side length/type limits so schema errors
//      can't leak as 500s.
const SEND_MESSAGE_MAX_LENGTH = 5000;

const sendMessage = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { conversationId } = req.params;
    const { content, messageType = 'text', imageUrl } = req.body;

    if (messageType !== 'text' && messageType !== 'image') {
      return res.status(400).json({ message: 'Invalid messageType' });
    }
    if (messageType === 'text') {
      if (typeof content !== 'string' || content.trim().length === 0) {
        return res.status(400).json({ message: 'Message content is required' });
      }
      if (content.length > SEND_MESSAGE_MAX_LENGTH) {
        return res.status(400).json({
          message: `Message cannot exceed ${SEND_MESSAGE_MAX_LENGTH} characters`
        });
      }
    }
    if (messageType === 'image' && (typeof imageUrl !== 'string' || imageUrl.length === 0)) {
      return res.status(400).json({ message: 'imageUrl is required for image messages' });
    }

    const isMember = await Conversation.exists({
      _id: conversationId,
      participants: userId
    });
    if (!isMember) {
      return res.status(403).json({ message: 'Access denied to conversation' });
    }

    const message = await Message.create({
      conversation: conversationId,
      sender: userId,
      content,
      messageType,
      imageUrl: messageType === 'image' ? imageUrl : undefined
    });
    await message.populate('sender', 'username fullName avatar');

    // Atomic metadata update — no clobbering under concurrent sends.
    await Conversation.updateOne(
      { _id: conversationId },
      { $set: { lastMessage: message._id, lastActivity: new Date() } }
    );

    // Notify the other participant — cap at 1 unread notification per conversation.
    try {
      const conversation = await Conversation.findById(conversationId).select('participants').lean();
      if (conversation) {
        const recipientId = conversation.participants.find(p => String(p) !== String(userId));
        if (recipientId) {
          const existingUnread = await Notification.findOne({
            recipient: recipientId,
            type: 'new_message',
            relatedConversation: conversationId,
            isRead: false
          });
          if (!existingUnread) {
            await createNotification({
              recipient: recipientId,
              sender: userId,
              type: 'new_message',
              relatedConversation: conversationId
            });
          }
        }
      }
    } catch (notifErr) {
      logger.warn('Failed to create message notification', { error: notifErr.message });
    }

    res.status(201).json(message);
  } catch (error) {
    logger.error('Error sending message', { error: error.message });
    res.status(500).json({ message: 'Server error' });
  }
};

// Mark messages as read
const markAsRead = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { conversationId } = req.params;

    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId
    });

    if (!conversation) {
      return res.status(403).json({ message: 'Access denied to conversation' });
    }

    await Message.updateMany(
      {
        conversation: conversationId,
        sender: { $ne: userId },
        'readBy.user': { $ne: userId }
      },
      {
        $push: {
          readBy: {
            user: userId,
            readAt: new Date()
          }
        }
      }
    );

    res.json({ message: 'Messages marked as read' });
  } catch (error) {
    logger.error('Error marking messages as read', { error: error.message });
    res.status(500).json({ message: 'Server error' });
  }
};

// Delete a message
const deleteMessage = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { messageId } = req.params;

    const message = await Message.findOne({
      _id: messageId,
      sender: userId
    });

    if (!message) {
      return res.status(404).json({ message: 'Message not found or unauthorized' });
    }

    message.isDeleted = true;
    await message.save();

    res.json({ message: 'Message deleted' });
  } catch (error) {
    logger.error('Error deleting message', { error: error.message });
    res.status(500).json({ message: 'Server error' });
  }
};

// Search users to start a conversation. Bounds on query length and only
// returns a narrow public projection (never email).
const MESSAGE_SEARCH_MAX_LENGTH = 100;

const searchUsers = async (req, res) => {
  try {
    const { query } = req.query;
    const userId = req.user.userId;

    if (!query || typeof query !== 'string' || query.length < 2) {
      return res.json([]);
    }
    if (query.length > MESSAGE_SEARCH_MAX_LENGTH) {
      return res.status(400).json({
        message: `Search cannot exceed ${MESSAGE_SEARCH_MAX_LENGTH} characters`
      });
    }

    const escapedQuery = escapeRegex(query);
    const users = await User.find({
      _id: { $ne: userId },
      $or: [
        { username: { $regex: escapedQuery, $options: 'i' } },
        { fullName: { $regex: escapedQuery, $options: 'i' } }
      ]
    })
      .select('username fullName avatar')
      .limit(10)
      .lean();

    res.json(users);
  } catch (error) {
    logger.error('Error searching users', { error: error.message });
    res.status(500).json({ message: 'Server error' });
  }
};

// Get unread message count
const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.userId;

    const conversations = await Conversation.find({
      participants: userId
    }).select('_id');

    const conversationIds = conversations.map(c => c._id);

    // Use aggregation to count all unread messages at once
    const unreadCount = await Message.countDocuments({
      conversation: { $in: conversationIds },
      sender: { $ne: userId },
      'readBy.user': { $ne: userId },
      isDeleted: false
    });

    res.json({ unreadCount });
  } catch (error) {
    logger.error('Error counting unread messages', { error: error.message });
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getConversations,
  getOrCreateConversation,
  getMessages,
  sendMessage,
  markAsRead,
  deleteMessage,
  searchUsers,
  getUnreadCount
}; 