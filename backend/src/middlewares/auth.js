const auth = require('./authMiddleware');
const optionalAuth = require('./optionalAuthMiddleware');

module.exports = {
  auth,
  optionalAuth
};
