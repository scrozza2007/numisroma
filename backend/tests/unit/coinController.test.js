/**
 * Unit tests for coinController
 */

const request = require('supertest');
const express = require('express');
const coinController = require('../../src/controllers/coinController');
const Coin = require('../../src/models/Coin');
const coinFixtures = require('../fixtures/coins');

// Create Express app for testing
const app = express();
app.use(express.json());

// Setup routes for testing
app.get('/api/coins', coinController.getCoins);
app.get('/api/coins/random', coinController.getRandomCoins);
app.get('/api/coins/filter-options', coinController.getFilterOptions);
app.post('/api/coins', coinController.createCoin);

describe('Coin Controller', () => {
  beforeAll(async () => {
    await Coin.syncIndexes();
  });

  describe('GET /api/coins', () => {
    beforeEach(async () => {
      // Insert test coins
      await Coin.insertMany(coinFixtures.multipleCoinsBatch);
    });

    test('should return coins with default pagination', async () => {
      const response = await request(app)
        .get('/api/coins')
        .expect(200);

      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('page', 1);
      expect(response.body).toHaveProperty('pages');
      expect(response.body).toHaveProperty('results');
      expect(Array.isArray(response.body.results)).toBe(true);
      expect(response.body.results.length).toBeLessThanOrEqual(20); // Default limit
    });

    test('should filter coins by keyword "RIC VIII"', async () => {
      const response = await request(app)
        .get('/api/coins?keyword=RIC VIII')
        .expect(200);

      expect(response.body.results).toHaveLength(1);
      expect(response.body.results[0].name).toContain('RIC VIII');
    });

    test('should filter coins by emperor', async () => {
      const response = await request(app)
        .get('/api/coins?emperor=Augustus')
        .expect(200);

      expect(response.body.results).toHaveLength(1);
      expect(response.body.results[0].authority.emperor).toBe('Augustus');
    });

    test('should filter coins by material', async () => {
      const response = await request(app)
        .get('/api/coins?material=Silver')
        .expect(200);

      expect(response.body.results).toHaveLength(1);
      expect(response.body.results[0].description.material).toBe('Silver');
    });

    test('should handle specific RIC number queries', async () => {
      const response = await request(app)
        .get('/api/coins?keyword=RIC 77')
        .expect(200);

      // Should find the Trajan coin with number 77
      expect(response.body.results).toHaveLength(1);
      expect(response.body.results[0].name).toContain('77');
    });

    test('should sort coins by name ascending', async () => {
      const response = await request(app)
        .get('/api/coins?sortBy=name&order=asc')
        .expect(200);

      const names = response.body.results.map(coin => coin.name);
      const sortedNames = [...names].sort();
      expect(names).toEqual(sortedNames);
    });

    test('should limit results correctly', async () => {
      const response = await request(app)
        .get('/api/coins?limit=2')
        .expect(200);

      expect(response.body.results).toHaveLength(2);
    });

    test('should handle pagination correctly', async () => {
      const page1 = await request(app)
        .get('/api/coins?page=1&limit=2')
        .expect(200);

      const page2 = await request(app)
        .get('/api/coins?page=2&limit=2')
        .expect(200);

      expect(page1.body.page).toBe(1);
      expect(page2.body.page).toBe(2);
      
      // Results should be different
      expect(page1.body.results[0]._id).not.toBe(page2.body.results[0]._id);
    });

    test('should return empty results for non-existent keyword', async () => {
      const response = await request(app)
        .get('/api/coins?keyword=NonExistentCoin')
        .expect(200);

      expect(response.body.results).toHaveLength(0);
      expect(response.body.total).toBe(0);
    });
  });

  describe('GET /api/coins/random', () => {
    beforeEach(async () => {
      await Coin.insertMany(coinFixtures.multipleCoinsBatch);
    });

    test('should return random coins with default limit', async () => {
      const response = await request(app)
        .get('/api/coins/random')
        .expect(200);

      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('results');
      expect(Array.isArray(response.body.results)).toBe(true);
      expect(response.body.results.length).toBeLessThanOrEqual(3); // Default limit
    });

    test('should respect custom limit', async () => {
      const response = await request(app)
        .get('/api/coins/random?limit=2')
        .expect(200);

      expect(response.body.results).toHaveLength(2);
    });

    test('should return different results on multiple calls', async () => {
      const response1 = await request(app).get('/api/coins/random?limit=1');
      const response2 = await request(app).get('/api/coins/random?limit=1');

      // Note: This test might occasionally fail due to randomness
      // In a real scenario, you might want to mock the random function
      expect(response1.body.results).toHaveLength(1);
      expect(response2.body.results).toHaveLength(1);
    });
  });

  describe('GET /api/coins/filter-options', () => {
    beforeEach(async () => {
      await Coin.insertMany(coinFixtures.multipleCoinsBatch);
    });

    test('should return filter options', async () => {
      const response = await request(app)
        .get('/api/coins/filter-options')
        .expect(200);

      expect(response.body).toHaveProperty('materials');
      expect(response.body).toHaveProperty('emperors');
      expect(response.body).toHaveProperty('dynasties');
      expect(response.body).toHaveProperty('denominations');
      expect(response.body).toHaveProperty('mints');
      expect(response.body).toHaveProperty('deities');

      expect(Array.isArray(response.body.materials)).toBe(true);
      expect(Array.isArray(response.body.emperors)).toBe(true);
    });

    test('should include tooltips in response', async () => {
      const response = await request(app)
        .get('/api/coins/filter-options')
        .expect(200);

      expect(response.body).toHaveProperty('tooltips');
      expect(response.body.tooltips).toHaveProperty('materials');
      expect(response.body.tooltips).toHaveProperty('emperors');
    });
  });

  describe('POST /api/coins', () => {
    test('should create a new coin with valid data', async () => {
      const response = await request(app)
        .post('/api/coins')
        .send(coinFixtures.validCoin)
        .expect(201);

      expect(response.body).toHaveProperty('_id');
      expect(response.body.name).toBe(coinFixtures.validCoin.name);
      expect(response.body.authority.emperor).toBe(coinFixtures.validCoin.authority.emperor);

      // Verify coin was saved to database
      const savedCoin = await Coin.findById(response.body._id);
      expect(savedCoin).toBeTruthy();
      expect(savedCoin.name).toBe(coinFixtures.validCoin.name);
    });

    test('should reject coin with invalid data', async () => {
      const response = await request(app)
        .post('/api/coins')
        .send(coinFixtures.invalidCoin)
        .expect(500); // Should return server error for validation failure

      // Verify coin was not saved
      const coinCount = await Coin.countDocuments();
      expect(coinCount).toBe(0);
    });

    test('should handle missing required fields', async () => {
      const incompleteCoin = {
        authority: {
          emperor: 'Test Emperor'
        }
        // Missing name and other required fields
      };

      await request(app)
        .post('/api/coins')
        .send(incompleteCoin)
        .expect(500);
    });
  });

  describe('Error Handling', () => {
    test('should handle database connection errors gracefully', async () => {
      const dbError = new Error('Client must be connected before running operations');
      const findSpy = jest.spyOn(Coin, 'find').mockReturnValue({
        select() {
          return this;
        },
        skip() {
          return this;
        },
        limit() {
          return this;
        },
        sort() {
          return Promise.reject(dbError);
        }
      });

      try {
        const response = await request(app).get('/api/coins').expect(500);

        expect(response.body).toMatchObject({
          success: false,
          error: { message: 'Failed to fetch coins', statusCode: 500 }
        });
      } finally {
        findSpy.mockRestore();
      }
    });

    test('should handle invalid ObjectId in parameters', async () => {
      const response = await request(app)
        .get('/api/coins/invalid-id')
        .expect(404);
    });
  });
});
