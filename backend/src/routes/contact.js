const express = require('express');
const { body } = require('express-validator');
const { sendContactMessage } = require('../controllers/contactController');

const router = express.Router();

// Send a contact message
router.post(
  '/',
  [
    body('name')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Name must be between 2-100 characters'),
    body('email')
      .trim()
      .isEmail()
      .withMessage('Please enter a valid email address')
      .normalizeEmail(),
    body('subject')
      .trim()
      .isLength({ min: 5, max: 200 })
      .withMessage('Subject must be between 5-200 characters'),
    body('message')
      .trim()
      .isLength({ min: 20, max: 5000 })
      .withMessage('Message must be between 20-5000 characters')
  ],
  sendContactMessage
);

module.exports = router; 