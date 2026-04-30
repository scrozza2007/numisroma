const Coin = require('../models/Coin');
const CoinCustomImage = require('../models/CoinCustomImage');
const { validationResult } = require('express-validator');
const { deleteImage } = require('../middlewares/upload');
const { cacheHelpers } = require('../utils/cache');
const { PAGINATION, QUERY_LIMITS } = require('../config/constants');
const { ErrorResponse } = require('../utils/errorResponse');
const logger = require('../utils/logger');

/**
 * Escape special regex characters to prevent ReDoS attacks
 * @param {string} str - String to escape
 * @returns {string} - Escaped string safe for regex
 */
const escapeRegex = (str) => {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

// Add a new coin (admin-only — enforced in the route layer).
//
// Invalidation: clears both the "filters" namespace AND the HTTP-level API
// cache (`numisroma:api:*`), since `cacheMiddleware` caches full /api/coins
// and /api/coins/filter-options response bodies. Clearing only one side
// would leave newly-added coins invisible in search/filter responses until
// the TTL expired.
exports.createCoin = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return ErrorResponse.validationError(res, 'Validation failed', errors.array());
  }

  try {
    const coin = new Coin(req.body);
    await coin.save();

    Promise.allSettled([
      cacheHelpers.filters.clear(),
      cacheHelpers.api.clear()
    ]).then((results) => {
      for (const r of results) {
        if (r.status === 'rejected') {
          logger.error('Failed to invalidate cache after coin creation', {
            error: r.reason?.message
          });
        }
      }
    });

    res.status(201).json(coin);
  } catch (error) {
    logger.error('Error creating coin', { error: error.message });
    return ErrorResponse.serverError(res, 'Failed to create coin');
  }
};

// Gets random coins
exports.getRandomCoins = async (req, res) => {
  try {
    // Validate and limit the number of random coins
    const requestedLimit = parseInt(req.query.limit) || QUERY_LIMITS.DEFAULT_RANDOM_COINS;
    const limit = Math.min(
      Math.max(requestedLimit, 1),
      QUERY_LIMITS.MAX_RANDOM_COINS
    );
    
    // Get total count of coins in the database
    const total = await Coin.countDocuments();
    
    // Aggregate with $sample provides true random selection
    const randomCoins = await Coin.aggregate([
      { $sample: { size: limit } }
    ]);
    
    res.json({
      total,
      results: randomCoins
    });
  } catch (error) {
    logger.error('Error fetching random coins', { error: error.message });
    return ErrorResponse.serverError(res, 'Failed to fetch random coins');
  }
};

// Get distinct values for filter dropdowns.
//
// Caching: this endpoint is cached at the HTTP layer by `cacheMiddleware`
// in routes/coins.js. We intentionally DO NOT also cache here via
// `cacheHelpers.filters` — double-caching is redundant and causes
// invalidation drift (two TTLs, two clear paths).
//
// Performance: `examples: { $push: '$name' }` can produce arbitrarily
// large arrays for common keys (e.g. popular emperors with 10k coins).
// We cap with `$slice` to the first N names — the UI only displays 2–3.
exports.getFilterOptions = async (req, res) => {
  try {
    const EXAMPLES_LIMIT = 5;

    const [materials, emperors, dynasties, denominations, mints, deities] = await Promise.all([
      Coin.aggregate([
        { $match: { 'description.material': { $exists: true, $ne: '', $ne: null } } },
        { $group: {
          _id: '$description.material',
          count: { $sum: 1 },
          examples: { $push: '$name' }
        }},
        { $project: {
          count: 1,
          examples: { $slice: ['$examples', EXAMPLES_LIMIT] }
        }},
        { $sort: { _id: 1 } }
      ]),

      Coin.aggregate([
        { $match: { 'authority.emperor': { $exists: true, $ne: '', $ne: null } } },
        { $group: {
          _id: '$authority.emperor',
          count: { $sum: 1 },
          dynasties: { $addToSet: '$authority.dynasty' },
          dateRanges: { $addToSet: '$description.date_range' },
          examples: { $push: '$name' }
        }},
        { $project: {
          count: 1,
          dynasties: 1,
          dateRanges: 1,
          examples: { $slice: ['$examples', EXAMPLES_LIMIT] }
        }},
        { $sort: { _id: 1 } }
      ]),

      Coin.aggregate([
        { $match: { 'authority.dynasty': { $exists: true, $ne: '', $ne: null } } },
        { $group: {
          _id: '$authority.dynasty',
          count: { $sum: 1 },
          emperors: { $addToSet: '$authority.emperor' },
          dateRanges: { $addToSet: '$description.date_range' },
          examples: { $push: '$name' }
        }},
        { $project: {
          count: 1,
          emperors: 1,
          dateRanges: 1,
          examples: { $slice: ['$examples', EXAMPLES_LIMIT] }
        }},
        { $sort: { _id: 1 } }
      ]),

      Coin.aggregate([
        { $match: { 'description.denomination': { $exists: true, $ne: '', $ne: null } } },
        { $group: {
          _id: '$description.denomination',
          count: { $sum: 1 },
          materials: { $addToSet: '$description.material' },
          examples: { $push: '$name' }
        }},
        { $project: {
          count: 1,
          materials: 1,
          examples: { $slice: ['$examples', EXAMPLES_LIMIT] }
        }},
        { $sort: { _id: 1 } }
      ]),

      Coin.aggregate([
        { $match: { 'description.mint': { $exists: true, $ne: '', $ne: null } } },
        { $group: {
          _id: '$description.mint',
          count: { $sum: 1 },
          examples: { $push: '$name' }
        }},
        { $project: {
          count: 1,
          examples: { $slice: ['$examples', EXAMPLES_LIMIT] }
        }},
        { $sort: { _id: 1 } }
      ]),

      Coin.aggregate([
        {
          $facet: {
            obverseDeities: [
              { $match: { 'obverse.deity': { $exists: true, $ne: '', $ne: null } } },
              { $group: {
                _id: '$obverse.deity',
                count: { $sum: 1 },
                examples: { $push: '$name' }
              }},
              { $project: { count: 1, examples: { $slice: ['$examples', EXAMPLES_LIMIT] } } }
            ],
            reverseDeities: [
              { $match: { 'reverse.deity': { $exists: true, $ne: '', $ne: null } } },
              { $group: {
                _id: '$reverse.deity',
                count: { $sum: 1 },
                examples: { $push: '$name' }
              }},
              { $project: { count: 1, examples: { $slice: ['$examples', EXAMPLES_LIMIT] } } }
            ]
          }
        },
        {
          $project: {
            allDeities: { $concatArrays: ['$obverseDeities', '$reverseDeities'] }
          }
        },
        { $unwind: '$allDeities' },
        { $replaceRoot: { newRoot: '$allDeities' } },
        { $sort: { _id: 1 } }
      ])
    ]);

    // Create tooltip information from database data
    const createTooltip = (item, type) => {
      const count = item.count;
      const examples = item.examples.slice(0, 3); // First 3 examples
      
      switch (type) {
        case 'emperor':
          const dynastyInfo = item.dynasties && item.dynasties.length > 0 
            ? ` (${item.dynasties.filter(d => d).join(', ')})` 
            : '';
          const dateInfo = item.dateRanges && item.dateRanges.length > 0 
            ? ` ${item.dateRanges.filter(d => d)[0] || ''}` 
            : '';
          return `Roman Emperor${dynastyInfo}${dateInfo} - ${count} coins in collection`;
          
        case 'dynasty':
          const emperorList = item.emperors && item.emperors.length > 0 
            ? item.emperors.filter(e => e).slice(0, 3).join(', ')
            : '';
          const emperorInfo = emperorList ? ` (${emperorList}${item.emperors.length > 3 ? '...' : ''})` : '';
          return `${item._id} dynasty${emperorInfo} - ${count} coins in collection`;
          
        case 'material':
          return `${item._id} coins - ${count} examples in collection. Examples: ${examples.slice(0, 2).join(', ')}`;
          
        case 'denomination':
          const materialInfo = item.materials && item.materials.length > 0 
            ? ` Usually made in ${item.materials.filter(m => m).join(', ')}`
            : '';
          return `${item._id}${materialInfo} - ${count} coins in collection`;
          
        case 'mint':
          return `${item._id} mint - ${count} coins produced here. Examples: ${examples.slice(0, 2).join(', ')}`;
          
        case 'deity':
          const sideInfo = item.sides && item.sides.length > 0 
            ? ` (appears on ${item.sides.join(' and ')})` 
            : '';
          return `${item._id}${sideInfo} - ${count} depictions in collection`;
          
        default:
          return `${item._id} - ${count} coins`;
      }
    };

    // Build response with simple arrays and detailed tooltip objects
    const response = {
      materials: materials.map(m => m._id),
      emperors: emperors.map(e => e._id),
      dynasties: dynasties.map(d => d._id),
      denominations: denominations.map(d => d._id),
      mints: mints.map(m => m._id),
      deities: deities.map(d => d._id),
      
      // Detailed tooltip information
      tooltips: {
        materials: materials.reduce((acc, item) => {
          acc[item._id] = createTooltip(item, 'material');
          return acc;
        }, {}),
        emperors: emperors.reduce((acc, item) => {
          acc[item._id] = createTooltip(item, 'emperor');
          return acc;
        }, {}),
        dynasties: dynasties.reduce((acc, item) => {
          acc[item._id] = createTooltip(item, 'dynasty');
          return acc;
        }, {}),
        denominations: denominations.reduce((acc, item) => {
          acc[item._id] = createTooltip(item, 'denomination');
          return acc;
        }, {}),
        mints: mints.reduce((acc, item) => {
          acc[item._id] = createTooltip(item, 'mint');
          return acc;
        }, {}),
        deities: deities.reduce((acc, item) => {
          acc[item._id] = createTooltip(item, 'deity');
          return acc;
        }, {})
      }
    };

    res.json(response);
  } catch (error) {
    logger.error('Error fetching filter options', { error: error.message });
    return ErrorResponse.serverError(res, 'Failed to fetch filter options');
  }
};

// Get date range information for period filter
exports.getDateRanges = async (req, res) => {
  try {
    const dateRanges = await Coin.distinct('description.date_range');
    
    // Parse and sort date ranges
    const parsedRanges = dateRanges
      .filter(range => range && range.trim())
      .map(range => {
        // Extract start year from formats like "27 BC - 14 AD", "98-117 AD", etc.
        const match = range.match(/(\d+)\s*(BC|AD)/i);
        if (match) {
          const year = parseInt(match[1]);
          const era = match[2].toUpperCase();
          return {
            original: range,
            sortKey: era === 'BC' ? -year : year
          };
        }
        return { original: range, sortKey: 0 };
      })
      .sort((a, b) => a.sortKey - b.sortKey)
      .map(item => item.original);

    res.json({
      ranges: parsedRanges,
      // Also provide min/max years for range slider
      minYear: -31, // 31 BCE (start of Roman Empire)
      maxYear: 491   // 491 CE (end of Western Roman Empire)
    });
  } catch (error) {
    logger.error('Error fetching date ranges', { error: error.message });
    return ErrorResponse.serverError(res, 'Failed to fetch date ranges');
  }
};

exports.getCoins = async (req, res) => {
  try {
    const { 
      keyword, 
      date_range, 
      material, 
      emperor, 
      dynasty, 
      denomination, 
      mint, 
      portrait, 
      deity,
      startYear,
      endYear,
      sortBy = 'name',
      order = 'asc'
    } = req.query;

    // Validate and sanitize pagination parameters
    const page = Math.max(parseInt(req.query.page, 10) || PAGINATION.DEFAULT_PAGE, PAGINATION.DEFAULT_PAGE);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || PAGINATION.DEFAULT_LIMIT, PAGINATION.MIN_LIMIT),
      PAGINATION.MAX_LIMIT
    );

    // Hard cap on free-text inputs that flow into regex constructors. This
    // caps both payload size (DoS) and the worst case regex cost even after
    // escaping. Real coin references are far below this.
    const MAX_KEYWORD_LENGTH = 200;
    if (keyword && String(keyword).length > MAX_KEYWORD_LENGTH) {
      return ErrorResponse.badRequest(res, 'Keyword too long', {
        message: `Keyword cannot exceed ${MAX_KEYWORD_LENGTH} characters`
      });
    }

    let query = {};
    let useTextSearch = false;

    // Use hybrid search approach: text search for general queries, regex for specific ones
    if (keyword) {
      // Check if keyword looks like a specific RIC reference
      const isSpecificQuery = /\bRIC\b/i.test(keyword) || // Any RIC reference
                             /\b(Alexandria|Constantinople)\b.*\d+/i.test(keyword) ||
                             keyword.split(' ').length >= 3;
      
      
      if (isSpecificQuery) {
        // SECURITY: user-controlled values MUST be escaped before being
        // embedded into a regex. Unescaped values allow both regex
        // injection (e.g. `(.*){10}`) and ReDoS via catastrophic
        // backtracking. We also cap length defensively above.
        const safeKeyword = escapeRegex(keyword);

        // For RIC queries, always search primarily in name field
        if (keyword.includes('RIC')) {
          // Special handling for patterns like "RIC 77" - should find any RIC with 77
          if (/^RIC\s+\d+$/.test(keyword.trim())) {
            const number = keyword.match(/\d+$/)[0];
            query.name = { $regex: `RIC.*\\b${number}\\b`, $options: 'i' };
          } else {
            query.name = { $regex: safeKeyword, $options: 'i' };
          }
        } else {
          // Other specific queries - broader search
          query.$or = [
            { name: { $regex: safeKeyword, $options: 'i' } },
            { 'obverse.legend': { $regex: safeKeyword, $options: 'i' } },
            { 'reverse.legend': { $regex: safeKeyword, $options: 'i' } },
            { 'authority.emperor': { $regex: safeKeyword, $options: 'i' } },
            { 'description.mint': { $regex: safeKeyword, $options: 'i' } }
          ];
        }
      } else {
        // Use fast text search for general queries
        query.$text = { $search: keyword };
        useTextSearch = true;
      }
    }
    
    // Handle deity filter
    if (deity) {
      const escapedDeity = escapeRegex(deity);
      if (keyword) {
        // When both keyword and deity are present, add deity as an additional filter using $and
        query.$and = query.$and || [];
        query.$and.push({
          $or: [
            { 'obverse.deity': { $regex: escapedDeity, $options: 'i' } },
            { 'reverse.deity': { $regex: escapedDeity, $options: 'i' } }
          ]
        });
      } else {
        // When only deity filter is used, use $or directly
        query.$or = [
          { 'obverse.deity': { $regex: escapedDeity, $options: 'i' } },
          { 'reverse.deity': { $regex: escapedDeity, $options: 'i' } }
        ];
      }
    }
    
    if (date_range) {
      query['description.date_range'] = { $regex: escapeRegex(date_range), $options: 'i' };
    }
    
    // Year range filter - use numeric comparison instead of regex for performance and security
    if (startYear || endYear) {
      // Input validation and safety limits
      const MAX_YEAR_RANGE = 200; // Covers the core Roman Empire period
      const MIN_YEAR = -100; // 100 BCE
      const MAX_YEAR = 500; // 500 CE
      
      // Strict format validation: optional leading minus, then digits only
      const YEAR_PATTERN = /^-?\d+$/;
      if (startYear && !YEAR_PATTERN.test(String(startYear).trim())) {
        return ErrorResponse.badRequest(res, 'Invalid year format', {
          message: 'startYear must be a valid integer'
        });
      }
      if (endYear && !YEAR_PATTERN.test(String(endYear).trim())) {
        return ErrorResponse.badRequest(res, 'Invalid year format', {
          message: 'endYear must be a valid integer'
        });
      }
      
      const start = startYear ? parseInt(startYear, 10) : MIN_YEAR;
      const end = endYear ? parseInt(endYear, 10) : MAX_YEAR;
      
      // Validate parsed values are finite (guards against Infinity, NaN edge cases)
      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        return ErrorResponse.badRequest(res, 'Invalid year format', {
          message: 'Years must be valid finite numbers'
        });
      }
      
      // Validate year range size to prevent excessive queries
      if (Math.abs(end - start) > MAX_YEAR_RANGE) {
        return ErrorResponse.badRequest(res, 'Year range too large', {
          message: `Maximum range is ${MAX_YEAR_RANGE} years`
        });
      }
      
      // Validate year bounds
      if (start < MIN_YEAR || end > MAX_YEAR) {
        return ErrorResponse.badRequest(res, 'Invalid year range', {
          message: `Years must be between ${MIN_YEAR} and ${MAX_YEAR}`
        });
      }
      
      if (start > end) {
        return ErrorResponse.badRequest(res, 'Invalid year range', {
          message: 'Start year must be less than or equal to end year'
        });
      }
      
      query.$and = query.$and || [];
      
      // Use efficient numeric comparison with indexed fields
      // This prevents ReDoS attacks and is orders of magnitude faster than regex
      query.$and.push({
        $or: [
          // Coins where the date range overlaps with the requested range
          {
            'description.startYear': { $exists: true, $lte: end },
            'description.endYear': { $exists: true, $gte: start }
          },
          // Fallback for coins that have not yet been backfilled with the
          // numeric startYear/endYear fields. Uses a simple, safe regex
          // restricted to specific years only.
          {
            'description.startYear': { $exists: false },
            'description.date_range': { 
              $regex: `\\b(${Math.abs(start)}|${Math.abs(end)})\\b`, 
              $options: 'i' 
            }
          }
        ]
      });
    }
    
    if (material) {
      query['description.material'] = { $regex: escapeRegex(material), $options: 'i' };
    }
    if (emperor) {
      query['authority.emperor'] = { $regex: escapeRegex(emperor), $options: 'i' };
    }
    if (dynasty) {
      query['authority.dynasty'] = { $regex: escapeRegex(dynasty), $options: 'i' };
    }
    if (denomination) {
      query['description.denomination'] = { $regex: escapeRegex(denomination), $options: 'i' };
    }
    if (mint) {
      query['description.mint'] = { $regex: escapeRegex(mint), $options: 'i' };
    }
    if (portrait) {
      query['obverse.portrait'] = { $regex: escapeRegex(portrait), $options: 'i' };
    }
    

    // Pagination
    const skip = (page - 1) * limit;

    // Sorting (whitelisted fields only)
    const ALLOWED_SORT_FIELDS = [
      'name', 'emperor', 'dynasty', 'date', 'chronological',
      'denomination', 'mint', 'material', 'relevance'
    ];
    
    // Validate sortBy parameter
    const validatedSortBy = ALLOWED_SORT_FIELDS.includes(sortBy) ? sortBy : 'name';
    const sortOrder = order === 'desc' ? -1 : 1;
    let sortOptions = {};
    
    // Handle different sort options
    switch (validatedSortBy) {
      case 'relevance':
        if (useTextSearch) {
          // Sort by text search relevance score
          sortOptions['score'] = { $meta: 'textScore' };
        } else {
          // Sort by name when not using text search
          sortOptions['name'] = sortOrder;
        }
        break;
      case 'emperor':
        sortOptions['authority.emperor'] = sortOrder;
        break;
      case 'dynasty':
        sortOptions['authority.dynasty'] = sortOrder;
        break;
      case 'date':
      case 'chronological':
        // For chronological sort, we need a more complex approach
        // For now, sort by date_range field
        sortOptions['description.date_range'] = sortOrder;
        break;
      case 'denomination':
        sortOptions['description.denomination'] = sortOrder;
        break;
      case 'mint':
        sortOptions['description.mint'] = sortOrder;
        break;
      case 'material':
        sortOptions['description.material'] = sortOrder;
        break;
      default:
        // Fallback to name sort (should never reach here due to validation)
        sortOptions['name'] = sortOrder;
    }

    // Build query with projection for text search
    let mongoQuery = Coin.find(query);
    
    // Add text score projection if using text search
    if (useTextSearch) {
      mongoQuery = mongoQuery.select({ score: { $meta: 'textScore' } });
    }
    
    const coins = await mongoQuery
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .sort(sortOptions);

    const total = await Coin.countDocuments(query);

    res.json({
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / limit),
      results: coins
    });
  } catch (error) {
    logger.error('Error fetching coins', { error: error.message });
    return ErrorResponse.serverError(res, 'Failed to fetch coins');
  }
};

// Get a single coin by ID
exports.getCoinById = async (req, res) => {
  try {
    // Try cache first for non-authenticated users
    if (!req.user) {
      const cachedCoin = await cacheHelpers.coins.get(req.params.id);
      if (cachedCoin) {
        logger.debug('Coin cache hit', { coinId: req.params.id });
        return res.json(cachedCoin);
      }
    }

    const coin = await Coin.findById(req.params.id);
    
    if (!coin) {
      return ErrorResponse.notFound(res, 'Coin not found');
    }

    // If the user is authenticated, check whether they have uploaded custom
    // images for this coin and substitute them into the response.
    if (req.user) {
      try {
        const customImages = await CoinCustomImage.findOne({
          coinId: req.params.id,
          userId: req.user.userId
        });

        if (customImages) {
          const coinWithCustomImages = coin.toObject();
          if (customImages.obverseImage) {
            coinWithCustomImages.obverse = {
              ...coinWithCustomImages.obverse,
              image: customImages.obverseImage
            };
          }
          if (customImages.reverseImage) {
            coinWithCustomImages.reverse = {
              ...coinWithCustomImages.reverse,
              image: customImages.reverseImage
            };
          }
          return res.json(coinWithCustomImages);
        }
      } catch (customError) {
        // Fail open: fall back to catalog images rather than breaking the
        // request if the per-user custom-image lookup fails. Log at warn so
        // operators can still see repeated failures.
        logger.warn('Custom image lookup failed; falling back to catalog', {
          coinId: req.params.id,
          userId: req.user?.userId,
          error: customError.message
        });
      }
    }

    // Cache coin for non-authenticated users
    if (!req.user) {
      cacheHelpers.coins.set(req.params.id, coin).catch(err => 
        logger.error('Failed to cache coin', { coinId: req.params.id, error: err.message })
      );
    }

    res.json(coin);
  } catch (error) {
    if (error.kind === 'ObjectId') {
      return ErrorResponse.notFound(res, 'Coin not found');
    }
    logger.error('Error fetching coin by ID', { coinId: req.params.id, error: error.message });
    return ErrorResponse.serverError(res, 'Failed to fetch coin');
  }
};

// Update custom images for a collection entry
exports.updateCoinImages = async (req, res) => {
  try {
    const { entryId } = req.params;
    const userId = req.user.userId;

    let customImages = await CoinCustomImage.findOne({ collectionEntryId: entryId, userId });
    if (!customImages) {
      customImages = new CoinCustomImage({ collectionEntryId: entryId, userId });
    }

    if (req.processedImages.obverse && customImages.obverseImage) {
      deleteImage(customImages.obverseImage);
    }
    if (req.processedImages.reverse && customImages.reverseImage) {
      deleteImage(customImages.reverseImage);
    }

    if (req.processedImages.obverse) {
      customImages.obverseImageData = req.processedImages.obverse.buffer;
      customImages.obverseImageContentType = req.processedImages.obverse.contentType;
      customImages.obverseImage = `/api/coins/entry/${entryId}/images/obverse`;
    }
    if (req.processedImages.reverse) {
      customImages.reverseImageData = req.processedImages.reverse.buffer;
      customImages.reverseImageContentType = req.processedImages.reverse.contentType;
      customImages.reverseImage = `/api/coins/entry/${entryId}/images/reverse`;
    }

    await customImages.save();

    res.json({ message: 'Coin images updated successfully' });
  } catch (error) {
    logger.error('Error updating coin custom images', {
      entryId: req.params.entryId,
      userId: req.user?.userId,
      error: error.message
    });
    return ErrorResponse.serverError(res, 'Failed to update coin images');
  }
};

// Reset custom images for a collection entry (revert to catalog images)
exports.resetCoinImages = async (req, res) => {
  try {
    const { entryId } = req.params;
    const userId = req.user.userId;

    const customImages = await CoinCustomImage.findOne({ collectionEntryId: entryId, userId });
    if (customImages) {
      if (customImages.obverseImage) deleteImage(customImages.obverseImage);
      if (customImages.reverseImage) deleteImage(customImages.reverseImage);
      await CoinCustomImage.deleteOne({ collectionEntryId: entryId, userId });
    }

    res.json({ message: 'Coin images reset to catalog defaults successfully' });
  } catch (error) {
    logger.error('Error resetting coin custom images', {
      entryId: req.params.entryId,
      userId: req.user?.userId,
      error: error.message
    });
    return ErrorResponse.serverError(res, 'Failed to reset coin images');
  }
};

// Get custom images for a collection entry.
exports.getCustomImages = async (req, res) => {
  try {
    const { entryId } = req.params;
    const userId = req.user.userId;

    const customImages = await CoinCustomImage.findOne({ collectionEntryId: entryId, userId }).lean();

    if (!customImages) {
      return res.json(null);
    }

    res.json({
      obverseImage: customImages.obverseImage || null,
      reverseImage: customImages.reverseImage || null,
      createdAt: customImages.createdAt,
      updatedAt: customImages.updatedAt
    });
  } catch (error) {
    logger.error('Error fetching coin custom images', {
      entryId: req.params.entryId,
      userId: req.user?.userId,
      error: error.message
    });
    return ErrorResponse.serverError(res, 'Failed to fetch custom images');
  }
};