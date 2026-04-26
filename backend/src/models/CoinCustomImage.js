const mongoose = require('mongoose');

const coinCustomImageSchema = new mongoose.Schema({
  coinId: {
    type: String,
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  obverseImage: {
    type: String,
    default: null
  },
  reverseImage: {
    type: String,
    default: null
  },
  // Binary image data persisted in MongoDB
  obverseImageData: {
    type: Buffer
  },
  obverseImageContentType: {
    type: String
  },
  reverseImageData: {
    type: Buffer
  },
  reverseImageContentType: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Compound index to quickly find coin images for a user
coinCustomImageSchema.index({ coinId: 1, userId: 1 }, { unique: true });

// Refresh updatedAt on every save
coinCustomImageSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('CoinCustomImage', coinCustomImageSchema); 