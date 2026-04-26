/**
 * Password validation utility for NumisRoma frontend
 * Matches backend validation rules
 */

export const PASSWORD_RULES = {
  MIN_LENGTH: 8,
  PATTERNS: {
    UPPERCASE: /[A-Z]/,
    NUMBER: /[0-9]/,
    SPECIAL_CHAR: /[!@#$%^&*]/
  }
};

/**
 * Validate password against all rules
 * @param {string} password - Password to validate
 * @returns {Object} - { isValid: boolean, errors: string[] }
 */
export const validatePassword = (password) => {
  const errors = [];

  if (!password) {
    return { isValid: false, errors: ['Password is required'] };
  }

  if (password.length < PASSWORD_RULES.MIN_LENGTH) {
    errors.push(`Password must be at least ${PASSWORD_RULES.MIN_LENGTH} characters`);
  }

  if (!PASSWORD_RULES.PATTERNS.UPPERCASE.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!PASSWORD_RULES.PATTERNS.NUMBER.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (!PASSWORD_RULES.PATTERNS.SPECIAL_CHAR.test(password)) {
    errors.push('Password must contain at least one special character (!@#$%^&*)');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Get password strength (weak, medium, strong)
 * @param {string} password - Password to check
 * @returns {string} - Strength level
 */
export const getPasswordStrength = (password) => {
  if (!password) return 'weak';

  let score = 0;

  // Length scoring
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (password.length >= 16) score++;

  // Complexity scoring
  if (PASSWORD_RULES.PATTERNS.UPPERCASE.test(password)) score++;
  if (PASSWORD_RULES.PATTERNS.NUMBER.test(password)) score++;
  if (PASSWORD_RULES.PATTERNS.SPECIAL_CHAR.test(password)) score++;
  if (/[a-z]/.test(password)) score++;

  if (score <= 3) return 'weak';
  if (score <= 5) return 'medium';
  return 'strong';
};

/**
 * Validate passwords match
 * @param {string} password - Original password
 * @param {string} confirmPassword - Confirmation password
 * @returns {Object} - { isValid: boolean, error: string }
 */
export const validatePasswordsMatch = (password, confirmPassword) => {
  if (password !== confirmPassword) {
    return {
      isValid: false,
      error: 'Passwords do not match'
    };
  }
  return { isValid: true, error: null };
};
