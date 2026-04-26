/**
 * Migration script to populate numeric year fields from date_range strings
 * This enables efficient year range queries without regex (prevents ReDoS)
 * 
 * Run with: node scripts/migrate-year-fields.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Coin = require('../src/models/Coin');

/**
 * Parse year from date_range string
 * Examples: "27 BC - 14 AD", "98-117 AD", "235 CE", "117-138"
 */
function parseYearFromRange(dateRange) {
  if (!dateRange || typeof dateRange !== 'string') {
    return null;
  }

  const range = dateRange.trim();
  
  // Match patterns like "27 BC - 14 AD" or "98-117 AD"
  const rangeMatch = range.match(/(\d+)\s*(BC|BCE|AD|CE)?\s*[-–]\s*(\d+)\s*(BC|BCE|AD|CE)?/i);
  if (rangeMatch) {
    const startNum = parseInt(rangeMatch[1]);
    const startEra = (rangeMatch[2] || rangeMatch[4] || 'AD').toUpperCase();
    const endNum = parseInt(rangeMatch[3]);
    const endEra = (rangeMatch[4] || 'AD').toUpperCase();
    
    const startYear = (startEra === 'BC' || startEra === 'BCE') ? -startNum : startNum;
    const endYear = (endEra === 'BC' || endEra === 'BCE') ? -endNum : endNum;
    
    return { startYear, endYear };
  }
  
  // Match single year like "235 CE" or "98 AD"
  const singleMatch = range.match(/(\d+)\s*(BC|BCE|AD|CE)?/i);
  if (singleMatch) {
    const year = parseInt(singleMatch[1]);
    const era = (singleMatch[2] || 'AD').toUpperCase();
    const numYear = (era === 'BC' || era === 'BCE') ? -year : year;
    
    return { startYear: numYear, endYear: numYear };
  }
  
  return null;
}

async function migrateYearFields() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected successfully\n');

    // Get all coins that don't have year fields populated
    const coins = await Coin.find({
      $or: [
        { 'description.startYear': { $exists: false } },
        { 'description.endYear': { $exists: false } }
      ]
    });

    console.log(`Found ${coins.length} coins to migrate\n`);

    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const coin of coins) {
      try {
        const dateRange = coin.description?.date_range;
        const years = parseYearFromRange(dateRange);
        
        if (years) {
          coin.description.startYear = years.startYear;
          coin.description.endYear = years.endYear;
          await coin.save();
          updated++;
          
          if (updated % 100 === 0) {
            console.log(`Processed ${updated} coins...`);
          }
        } else {
          skipped++;
          console.log(`Skipped (no parseable date): ${coin.name} - "${dateRange}"`);
        }
      } catch (error) {
        errors++;
        console.error(`Error processing coin ${coin._id}: ${error.message}`);
      }
    }

    console.log('\n=== Migration Complete ===');
    console.log(`Updated: ${updated}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Errors: ${errors}`);
    console.log(`Total: ${coins.length}`);

    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
migrateYearFields();
