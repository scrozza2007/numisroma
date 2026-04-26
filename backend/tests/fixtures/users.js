/**
 * Test fixtures for users
 */

const bcrypt = require('bcryptjs');

const userFixtures = {
  validUser: {
    username: 'testuser',
    email: 'test@example.com',
    password: 'password123',
    fullName: 'Test User',
    location: 'Test City'
  },

  validUser2: {
    username: 'testuser2',
    email: 'test2@example.com',
    password: 'password456',
    fullName: 'Test User 2',
    location: 'Test City 2'
  },

  adminUser: {
    username: 'admin',
    email: 'admin@example.com',
    password: 'adminpassword',
    fullName: 'Admin User',
    location: 'Admin City',
    role: 'admin'
  },

  invalidUser: {
    // Missing required fields
    username: 'invalid',
    // No email or password
  },

  userWithWeakPassword: {
    username: 'weakuser',
    email: 'weak@example.com',
    password: '123', // Too short
    fullName: 'Weak User'
  },

  userWithInvalidEmail: {
    username: 'bademail',
    email: 'not-an-email',
    password: 'password123',
    fullName: 'Bad Email User'
  },

  // Helper function to create user with hashed password
  async createUserWithHashedPassword(userData) {
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    return {
      ...userData,
      password: hashedPassword
    };
  },

  // Helper function to create multiple users
  async createMultipleUsers() {
    const users = [
      this.validUser,
      this.validUser2,
      this.adminUser
    ];

    const hashedUsers = [];
    for (const user of users) {
      hashedUsers.push(await this.createUserWithHashedPassword(user));
    }
    
    return hashedUsers;
  }
};

module.exports = userFixtures;
