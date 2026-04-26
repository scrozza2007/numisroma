const { Schema, model } = require('mongoose');

const CoinSchema = new Schema({
  name: { 
    type: String, 
    required: true 
  },
  authority: {
    emperor: { type: String, required: true },
    dynasty: { type: String }
  },
  description: {
    date_range: { type: String },
    mint: { type: String },
    denomination: { type: String },
    material: { type: String },
    notes: { type: String },
    // Numeric year fields for efficient range queries (prevent ReDoS)
    startYear: { type: Number, index: true },
    endYear: { type: Number, index: true }
  },
  obverse: {
    legend: { type: String },
    type: { type: String },
    portrait: { type: String },
    deity: { type: String },
    image: { type: String },
    license: { type: String },
    credits: { type: String }
  },
  reverse: {
    legend: { type: String },
    type: { type: String },
    portrait: { type: String },
    deity: { type: String },
    mintmark: { type: String },
    officinamark: { type: String },
    image: { type: String },
    license: { type: String },
    credits: { type: String }
  }
}, { timestamps: true });

/**
 * Pre-save hook to automatically populate numeric year fields
 * This ensures new coins have indexed year data for efficient queries
 */
CoinSchema.pre('save', function(next) {
  // Only process if date_range is present and year fields are not set
  if (this.description?.date_range && 
      (!this.description.startYear || !this.description.endYear)) {
    
    const dateRange = this.description.date_range.trim();
    
    // Match patterns like "27 BC - 14 AD" or "98-117 AD"
    const rangeMatch = dateRange.match(/(\d+)\s*(BC|BCE|AD|CE)?\s*[-–]\s*(\d+)\s*(BC|BCE|AD|CE)?/i);
    if (rangeMatch) {
      const startNum = parseInt(rangeMatch[1]);
      const startEra = (rangeMatch[2] || rangeMatch[4] || 'AD').toUpperCase();
      const endNum = parseInt(rangeMatch[3]);
      const endEra = (rangeMatch[4] || 'AD').toUpperCase();
      
      this.description.startYear = (startEra === 'BC' || startEra === 'BCE') ? -startNum : startNum;
      this.description.endYear = (endEra === 'BC' || endEra === 'BCE') ? -endNum : endNum;
    } else {
      // Match single year like "235 CE" or "98 AD"
      const singleMatch = dateRange.match(/(\d+)\s*(BC|BCE|AD|CE)?/i);
      if (singleMatch) {
        const year = parseInt(singleMatch[1]);
        const era = (singleMatch[2] || 'AD').toUpperCase();
        const numYear = (era === 'BC' || era === 'BCE') ? -year : year;
        
        this.description.startYear = numYear;
        this.description.endYear = numYear;
      }
    }
  }
  
  next();
});

// Performance indexes for search and filtering
CoinSchema.index({ name: 1 }); // For name searches
CoinSchema.index({ 'authority.emperor': 1 }); // For emperor filter
CoinSchema.index({ 'authority.dynasty': 1 }); // For dynasty filter
CoinSchema.index({ 'description.material': 1 }); // For material filter
CoinSchema.index({ 'description.denomination': 1 }); // For denomination filter
CoinSchema.index({ 'description.mint': 1 }); // For mint filter
CoinSchema.index({ 'description.date_range': 1 }); // For date range filter
CoinSchema.index({ 'obverse.deity': 1 }); // For deity searches
CoinSchema.index({ 'reverse.deity': 1 }); // For deity searches

// Compound indexes for common search combinations
CoinSchema.index({ 'authority.emperor': 1, 'description.material': 1 }); // Emperor + material
CoinSchema.index({ 'authority.dynasty': 1, 'description.date_range': 1 }); // Dynasty + period
CoinSchema.index({ 'description.material': 1, 'description.denomination': 1 }); // Material + denomination
// Compound index for year range overlap queries (startYear <= end AND endYear >= start)
CoinSchema.index({ 'description.startYear': 1, 'description.endYear': 1 });

// Text index for full-text search across multiple fields
CoinSchema.index({
  name: 'text',
  'obverse.legend': 'text',
  'reverse.legend': 'text',
  'authority.emperor': 'text',
  'authority.dynasty': 'text',
  'description.mint': 'text',
  'obverse.type': 'text',
  'reverse.type': 'text'
}, {
  weights: {
    name: 10,
    'authority.emperor': 8,
    'authority.dynasty': 6,
    'obverse.legend': 4,
    'reverse.legend': 4,
    'description.mint': 3,
    'obverse.type': 2,
    'reverse.type': 2
  },
  name: 'coin_text_index'
});

module.exports = model('Coin', CoinSchema);