const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const { validateObjectId } = require('../middlewares/enhancedValidation');
const {
  getNotifications,
  getUnreadCount,
  markOneRead,
  markAllRead,
  streamNotifications
} = require('../controllers/notificationController');

// SSE — must come before /:id routes to avoid param conflict.
router.get('/stream', authMiddleware, streamNotifications);

router.get('/unread-count', authMiddleware, getUnreadCount);
router.get('/', authMiddleware, getNotifications);
router.put('/read-all', authMiddleware, markAllRead);
router.put('/:id/read', validateObjectId('id'), authMiddleware, markOneRead);

module.exports = router;
