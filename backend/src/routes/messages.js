const express = require('express');
const { body } = require('express-validator');
const authMiddleware = require('../middlewares/authMiddleware');
const { createSsrfValidator } = require('../utils/ssrfProtection');
const { validateObjectId } = require('../middlewares/enhancedValidation');
const {
  getConversations,
  getOrCreateConversation,
  getMessages,
  sendMessage,
  markAsRead,
  deleteMessage,
  searchUsers,
  getUnreadCount
} = require('../controllers/messageController');

const router = express.Router();

// All routes in this router require authentication
router.use(authMiddleware);

// GET /api/messages/conversations - Get every conversation the user is part of
router.get('/conversations', getConversations);

// GET /api/messages/conversations/:otherUserId - Get or create a 1:1 conversation
router.get('/conversations/:otherUserId', validateObjectId('otherUserId'), getOrCreateConversation);

// GET /api/messages/unread-count - Total unread messages across all conversations
router.get('/unread-count', getUnreadCount);

// GET /api/messages/search/users - Search users to start a conversation.
// MUST be registered before /:conversationId, otherwise 'search' is matched
// as an ObjectId parameter and the route becomes unreachable.
router.get('/search/users', searchUsers);

// GET /api/messages/:conversationId - Messages within a specific conversation
router.get('/:conversationId', validateObjectId('conversationId'), getMessages);

// POST /api/messages/:conversationId - Send a message into a conversation
router.post('/:conversationId', validateObjectId('conversationId'), [
  body('content')
    .trim()
    .notEmpty()
    .withMessage('Message content is required')
    .isLength({ max: 5000 })
    .withMessage('Message content too long (max 5000 characters)'),
  body('messageType')
    .optional()
    .isIn(['text', 'image'])
    .withMessage('Invalid message type'),
  body('imageUrl')
    .optional()
    .custom(createSsrfValidator({ 
      allowedProtocols: ['https:', 'http:'],
      performDnsCheck: true 
    }))
], sendMessage);

// PUT /api/messages/:conversationId/read - Mark all messages in the conversation as read
router.put('/:conversationId/read', validateObjectId('conversationId'), markAsRead);

// DELETE /api/messages/message/:messageId - Delete a single message
router.delete('/message/:messageId', validateObjectId('messageId'), deleteMessage);

module.exports = router;
