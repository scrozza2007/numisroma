const express = require('express');
const authMiddleware = require('../middlewares/authMiddleware');
const { validateObjectId } = require('../middlewares/enhancedValidation');
const sessionController = require('../controllers/sessionController');

const router = express.Router();

// All routes require authentication.
router.use(authMiddleware);

// List all active sessions for the current user.
router.get('/', sessionController.getActiveSessions);

// Terminate all sessions except the current one.
// NOTE: must be registered BEFORE /:sessionId so that "DELETE /" resolves
// here rather than being matched as an empty param.
router.delete('/', sessionController.terminateAllOtherSessions);

// Terminate a specific session (ObjectId-validated).
router.delete('/:sessionId', validateObjectId('sessionId'), sessionController.terminateSession);

module.exports = router;
