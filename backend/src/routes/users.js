const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Follow = require('../models/Follow');
const authMiddleware = require('../middlewares/authMiddleware');
const { validateObjectId } = require('../middlewares/enhancedValidation');
const mongoose = require('mongoose');
const Collection = require('../models/Collection');
const Conversation = require('../models/Conversation');
const logger = require('../utils/logger');

/**
 * Escape special regex characters to prevent ReDoS attacks
 */
const escapeRegex = (str) => {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

// Per-request safety caps.
const USER_SEARCH_MAX_LENGTH = 100;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

// GET /api/users - Search users.
// - Only exposes a narrow public projection; never returns `email`, since
//   that would be an information-disclosure issue for any authenticated caller.
// - Paginated to bound response size.
// - Follow status resolved with a single query (avoids an N+1 lookup).
// - User-supplied search is escaped and length-capped to avoid ReDoS.
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { search } = req.query;
    const currentUserId = req.user.userId;

    if (search && String(search).length > USER_SEARCH_MAX_LENGTH) {
      return res.status(400).json({
        error: 'Search term too long',
        message: `Search cannot exceed ${USER_SEARCH_MAX_LENGTH} characters`
      });
    }

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || DEFAULT_PAGE_SIZE, 1),
      MAX_PAGE_SIZE
    );
    const skip = (page - 1) * limit;

    let query = { _id: { $ne: currentUserId } };
    if (search) {
      const escapedSearch = escapeRegex(search);
      // Match on username only. Email matching would expose private data
      // to any authenticated caller — that is an information disclosure bug.
      query.username = { $regex: escapedSearch, $options: 'i' };
    }

    const users = await User.find(query)
      .select('username avatar bio fullName createdAt')
      .sort({ username: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    let followingSet = new Set();
    if (users.length > 0) {
      // One query instead of N — resolves "am I following X, Y, Z?" in
      // constant DB round-trips.
      const follows = await Follow.find({
        follower: currentUserId,
        following: { $in: users.map(u => u._id) }
      }).select('following').lean();
      followingSet = new Set(follows.map(f => f.following.toString()));
    }

    const usersWithFollowStatus = users.map(user => ({
      ...user,
      isFollowing: followingSet.has(user._id.toString())
    }));

    const total = await User.countDocuments(query);

    res.json({
      users: usersWithFollowStatus,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasMore: skip + users.length < total
      }
    });
  } catch (error) {
    logger.error('Error retrieving users', { error: error.message });
    res.status(500).json({ message: 'Error retrieving users' });
  }
});

// GET /api/users/recommended - Get recommended users
router.get('/recommended', authMiddleware, async (req, res) => {
  try {
    const currentUserId = req.user.userId;
    
    // Find IDs of users that the current user already follows
    const following = await Follow.find({ follower: currentUserId })
      .select('following')
      .lean();
    const followingIds = following.map(f => f.following);
    
    // Find users that:
    // 1. The current user doesn't follow yet
    // 2. Are not the current user
    // 3. Have more followers (more popular)
    // 4. Have been recently active
    const users = await User.aggregate([
      {
        $match: {
          _id: { 
            $ne: new mongoose.Types.ObjectId(currentUserId),
            $nin: followingIds 
          }
        }
      },
      {
        $lookup: {
          from: 'follows',
          localField: '_id',
          foreignField: 'following',
          as: 'followers'
        }
      },
      {
        $addFields: {
          followersCount: { $size: '$followers' }
        }
      },
      {
        $sort: {
          followersCount: -1,
          lastActive: -1
        }
      },
      {
        $limit: 3
      },
      {
        $project: {
          password: 0,
          followers: 0
        }
      }
    ]);

    // Add isFollowing (will always be false for recommended users)
    const usersWithFollowStatus = users.map(user => ({
      ...user,
      isFollowing: false
    }));

    res.json(usersWithFollowStatus);
  } catch (error) {
    logger.error('Error retrieving recommended users', { error: error.message });
    res.status(500).json({ message: 'Error retrieving recommended users' });
  }
});

// POST /api/users/:id/follow - Follow a user.
// Race-safe: uses an upsert via the unique (follower, following) index so
// two concurrent follow requests can never create duplicates.
router.post('/:id/follow', validateObjectId('id'), authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user.userId;

    if (id === currentUserId) {
      return res.status(400).json({ message: 'You cannot follow yourself' });
    }

    const userToFollow = await User.findById(id).select('_id').lean();
    if (!userToFollow) {
      return res.status(404).json({ message: 'User not found' });
    }

    const result = await Follow.updateOne(
      { follower: currentUserId, following: id },
      { $setOnInsert: { follower: currentUserId, following: id } },
      { upsert: true }
    );

    if (result.upsertedCount === 0) {
      return res.status(200).json({ message: 'You are already following this user' });
    }

    res.status(201).json({ message: 'Successfully followed user' });
  } catch (error) {
    // E11000 from a racing upsert — treat as idempotent.
    if (error && error.code === 11000) {
      return res.status(200).json({ message: 'You are already following this user' });
    }
    logger.error('Error following user', { error: error.message });
    res.status(500).json({ message: 'Error following user' });
  }
});

// DELETE /api/users/:id/unfollow - Unfollow a user
router.delete('/:id/unfollow', validateObjectId('id'), authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user.userId;

    const userToUnfollow = await User.findById(id);
    if (!userToUnfollow) {
      return res.status(404).json({ message: 'User not found' });
    }

    const result = await Follow.deleteOne({
      follower: currentUserId,
      following: id
    });

    if (result.deletedCount === 0) {
      return res.status(400).json({ message: 'You are not following this user' });
    }

    res.json({ message: 'Successfully unfollowed user' });
  } catch (error) {
    logger.error('Error unfollowing user', { error: error.message });
    res.status(500).json({ message: 'Error unfollowing user' });
  }
});

// GET /api/users/:id/profile - Get user public profile
router.get('/:id/profile', validateObjectId('id'), authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user.userId;

    const user = await User.findById(id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Count followers
    const followersCount = await Follow.countDocuments({ following: id });
    // Count following
    const followingCount = await Follow.countDocuments({ follower: id });
    // Count coins
    const coinsCount = await Collection.aggregate([
      { $match: { user: user._id } },
      { $unwind: '$coins' },
      { $count: 'total' }
    ]);
    
    // Check if the authenticated user follows this profile
    let isFollowing = false;
    if (currentUserId && currentUserId !== id) {
      isFollowing = await Follow.exists({ follower: currentUserId, following: id });
    }

    res.json({
      _id: user._id,
      username: user.username,
      avatar: user.avatar || null,
      bio: user.bio || '',
      createdAt: user.createdAt,
      followersCount,
      followingCount,
      coinsCount: coinsCount[0]?.total || 0,
      isFollowing: !!isFollowing
    });
  } catch (error) {
    logger.error('Error retrieving user profile', { error: error.message });
    res.status(500).json({ message: 'Error retrieving user profile' });
  }
});

// GET /api/users/:id/followers - Paginated followers list.
router.get('/:id/followers', validateObjectId('id'), authMiddleware, async (req, res) => {
  try {
    const userId = req.params.id;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || DEFAULT_PAGE_SIZE, 1),
      MAX_PAGE_SIZE
    );
    const skip = (page - 1) * limit;

    const [follows, total] = await Promise.all([
      Follow.find({ following: userId })
        .populate('follower', 'username avatar bio')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Follow.countDocuments({ following: userId })
    ]);

    res.json({
      users: follows.map(f => f.follower),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasMore: skip + follows.length < total
      }
    });
  } catch (error) {
    logger.error('Error getting followers', { error: error.message });
    res.status(500).json({ message: 'Error retrieving followers' });
  }
});

// GET /api/users/:id/following - Paginated following list.
router.get('/:id/following', validateObjectId('id'), authMiddleware, async (req, res) => {
  try {
    const userId = req.params.id;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || DEFAULT_PAGE_SIZE, 1),
      MAX_PAGE_SIZE
    );
    const skip = (page - 1) * limit;

    const [follows, total] = await Promise.all([
      Follow.find({ follower: userId })
        .populate('following', 'username avatar bio')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Follow.countDocuments({ follower: userId })
    ]);

    res.json({
      users: follows.map(f => f.following),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasMore: skip + follows.length < total
      }
    });
  } catch (error) {
    logger.error('Error getting following', { error: error.message });
    res.status(500).json({ message: 'Error retrieving following' });
  }
});

// GET /api/users/:id/activity - Get recent user activities
router.get('/:id/activity', validateObjectId('id'), authMiddleware, async (req, res) => {
  try {
    const userId = req.params.id;
    
    const recentFollowers = await Follow.find({ following: userId })
      .populate('follower', 'username avatar')
      .sort({ createdAt: -1 })
      .limit(10);

    const activities = recentFollowers.map(follow => ({
      type: 'follow',
      user: follow.follower,
      createdAt: follow.createdAt
    }));

    res.json(activities);
  } catch (error) {
    logger.error('Error getting user activity', { error: error.message });
    res.status(500).json({ 
      message: 'Error retrieving user activity'
    });
  }
});

// GET /api/users/:id/chat - Create or get a chat with a user
router.get('/:id/chat', validateObjectId('id'), authMiddleware, async (req, res) => {
  try {
    const currentUserId = req.user.userId;
    const otherUserId = req.params.id;

    const otherUser = await User.findById(otherUserId).select('username avatar');
    if (!otherUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    let conversation = await Conversation.findOne({
      participants: { $all: [currentUserId, otherUserId], $size: 2 }
    });

    if (!conversation) {
      conversation = await Conversation.create({
        participants: [currentUserId, otherUserId],
        lastActivity: new Date()
      });
    }

    res.json({
      conversationId: conversation._id,
      user: otherUser
    });
  } catch (error) {
    logger.error('Error creating/getting chat', { error: error.message });
    res.status(500).json({ 
      message: 'Error creating chat'
    });
  }
});

module.exports = router; 