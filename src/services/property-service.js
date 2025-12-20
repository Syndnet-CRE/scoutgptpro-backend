import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load parcel chunk index
const CHUNKS_DIR = path.join(__dirname, '../../data/parcels/chunks');
let chunkIndex = null;
let indexBaseDir = null;

function loadChunkIndex() {
  if (chunkIndex && indexBaseDir) return { index: chunkIndex, baseDir: indexBaseDir };
  try {
    // Try multiple possible paths
    const possiblePaths = [
      path.join(__dirname, '../../data/parcels/chunk_index.json'),
      path.join(__dirname, '../data/parcels/chunk_index.json'),
      path.join(process.cwd(), 'data/parcels/chunk_index.json'),
      '/opt/render/project/src/data/parcels/chunk_index.json'
    ];
    
    let indexPath = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        indexPath = p;
        break;
      }
    }
    
    if (!indexPath) {
      console.error('❌ chunk_index.json not found in any expected location');
      return { index: { chunks: [] }, baseDir: null };
    }
    
    indexBaseDir = path.dirname(indexPath);
    chunkIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    return { index: chunkIndex, baseDir: indexBaseDir };
  } catch (error) {
    console.error('Failed to load chunk index:', error);
    return { index: { chunks: [] }, baseDir: null };
  }
}

// Parse query for property criteria
function parseQueryCriteria(query, mode) {
  const criteria = {
    propertyType: null,
    maxPrice: null,
    minPrice: null,
    minAcres: null,
    maxAcres: null,
    city: null,
    zoning: null,
    taxDelinquent: null,
    keywords: []
  };

  const queryLower = query.toLowerCase();

  // Property type detection
  if (queryLower.includes('vacant') || queryLower.includes('land') || queryLower.includes('lot')) {
    criteria.propertyType = 'land';
  } else if (queryLower.includes('commercial') || queryLower.includes('retail') || queryLower.includes('office')) {
    criteria.propertyType = 'commercial';
  } else if (queryLower.includes('residential') || queryLower.includes('house') || queryLower.includes('home')) {
    criteria.propertyType = 'residential';
  } else if (queryLower.includes('industrial') || queryLower.includes('warehouse')) {
    criteria.propertyType = 'industrial';
  } else if (queryLower.includes('mixed')) {
    criteria.propertyType = 'mixed';
  }

  // Price extraction
  const priceUnderMatch = queryLower.match(/under\s*\$?([\d,]+)k?/i);
  const priceBelowMatch = queryLower.match(/below\s*\$?([\d,]+)k?/i);
  const priceMaxMatch = queryLower.match(/max\s*\$?([\d,]+)k?/i);
  if (priceUnderMatch || priceBelowMatch || priceMaxMatch) {
    const match = priceUnderMatch || priceBelowMatch || priceMaxMatch;
    let price = parseFloat(match[1].replace(/,/g, ''));
    if (queryLower.includes('k')) price *= 1000;
    if (price < 1000) price *= 1000; // Assume "50" means $50,000
    criteria.maxPrice = price;
  }

  const priceOverMatch = queryLower.match(/over\s*\$?([\d,]+)k?/i);
  const priceAboveMatch = queryLower.match(/above\s*\$?([\d,]+)k?/i);
  const priceMinMatch = queryLower.match(/min\s*\$?([\d,]+)k?/i);
  if (priceOverMatch || priceAboveMatch || priceMinMatch) {
    const match = priceOverMatch || priceAboveMatch || priceMinMatch;
    let price = parseFloat(match[1].replace(/,/g, ''));
    if (queryLower.includes('k')) price *= 1000;
    if (price < 1000) price *= 1000;
    criteria.minPrice = price;
  }

  // Acreage extraction
  const acresMinMatch = queryLower.match(/(\d+\.?\d*)\+?\s*acres?/i);
  const acresOverMatch = queryLower.match(/over\s*(\d+\.?\d*)\s*acres?/i);
  if (acresOverMatch) {
    criteria.minAcres = parseFloat(acresOverMatch[1]);
  } else if (acresMinMatch) {
    criteria.minAcres = parseFloat(acresMinMatch[1]);
  }

  // City detection
  if (queryLower.includes('austin')) criteria.city = 'austin';
  if (queryLower.includes('dallas')) criteria.city = 'dallas';
  if (queryLower.includes('houston')) criteria.city = 'houston';
  if (queryLower.includes('san antonio')) criteria.city = 'san antonio';

  // Tax delinquent
  if (queryLower.includes('delinquent') || queryLower.includes('tax lien')) {
    criteria.taxDelinquent = true;
  }

  // Zoning
  const zoningMatch = queryLower.match(/zoned?\s+(sf-?\d|mf-?\d|gr|cs|lo|go|li|hi|p|pud)/i);
  if (zoningMatch) {
    criteria.zoning = zoningMatch[1].toUpperCase();
  }

  return criteria;
}

// Calculate motivation score based on property attributes
function calculateMotivationScore(property) {
  let score = 50; // Base score

  // Tax delinquency is a strong indicator
  if (property.taxDelinquent || (property.totalDue && property.totalDue > property.totalTax)) {
    score += 25;
  }

  // Absentee owner (mailing address different from property)
  if (property.mailingAddr && property.address) {
    const mailingCity = (property.mailingAddr || '').toLowerCase();
    const propCity = (property.address || '').toLowerCase();
    if (!mailingCity.includes('austin') && propCity.includes('austin')) {
      score += 15; // Out of area owner
    }
  }

  // Long-term ownership (older tax year data suggests long hold)
  if (property.yearBuilt && property.yearBuilt < 1980) {
    score += 5;
  }

  // Vacant land often more motivated
  if (!property.impValue || property.impValue === 0) {
    score += 10;
  }

  // Cap at 100
  return Math.min(score, 100);
}

// Determine opportunity flags
function getOpportunityFlags(property) {
  const flags = [];

  // Undervalued (tax value significantly below typical market)
  if (property.acres && property.mktValue) {
    const pricePerAcre = property.mktValue / property.acres;
    if (pricePerAcre < 50000) {
      flags.push('potentially-undervalued');
    }
  }

  // Tax delinquent
  if (property.taxDelinquent || (property.totalDue && property.totalDue > property.totalTax)) {
    flags.push('tax-delinquent');
  }

  // Vacant land
  if (!property.impValue || property.impValue === 0) {
    flags.push('vacant-land');
  }

  // Large lot
  if (property.acres && property.acres > 1) {
    flags.push('large-lot');
  }

  // Absentee owner
  if (property.mailingAddr && property.address) {
    const mailingLower = (property.mailingAddr || '').toLowerCase();
    const addressLower = (property.address || '').toLowerCase();
    if (!mailingLower.includes('austin') && addressLower.includes('austin')) {
      flags.push('absentee-owner');
    }
  }

  return flags;
}

// Determine property type from available data
function determinePropertyType(property) {
  // Check improvement value
  if (!property.impValue || property.impValue === 0) {
    return 'land';
  }

  // Check legal description or other fields for clues
  const legalDesc = (property.legalDesc || '').toLowerCase();
  
  if (legalDesc.includes('commercial') || legalDesc.includes('retail')) {
    return 'commercial';
  }
  if (legalDesc.includes('industrial') || legalDesc.includes('warehouse')) {
    return 'industrial';
  }
  if (legalDesc.includes('mixed')) {
    return 'mixed';
  }
  
  // Default to residential if has improvements
  return 'residential';
}

// Query properties from parcel chunks
export async function queryProperties({ bounds, query, mode, limit = 50 }) {
  const criteria = parseQueryCriteria(query, mode);
  const results = [];
  
  console.log('🔍 Querying properties with criteria:', criteria);

  try {
    const { index, baseDir } = loadChunkIndex();
    
    if (!baseDir) {
      console.error('❌ Could not determine base directory for chunks');
      return [];
    }
    
    // Find chunks that intersect with bounds (if provided)
    let chunksToSearch = index.chunks || [];
    
    if (bounds) {
      chunksToSearch = chunksToSearch.filter(chunk => {
        if (!chunk.bounds) return true;
        const chunkBounds = chunk.bounds;
        const cWest = chunkBounds.minLng ?? chunkBounds.west ?? chunkBounds.min_lng;
        const cSouth = chunkBounds.minLat ?? chunkBounds.south ?? chunkBounds.min_lat;
        const cEast = chunkBounds.maxLng ?? chunkBounds.east ?? chunkBounds.max_lng;
        const cNorth = chunkBounds.maxLat ?? chunkBounds.north ?? chunkBounds.max_lat;
        
        if (cWest === undefined || cSouth === undefined || cEast === undefined || cNorth === undefined) {
          return true; // Include if bounds unclear
        }
        
        // Check intersection
        return !(cEast < bounds.west ||
                 cWest > bounds.east ||
                 cNorth < bounds.south ||
                 cSouth > bounds.north);
      });
    }

    // Limit chunks to search for performance
    const maxChunks = 20;
    chunksToSearch = chunksToSearch.slice(0, maxChunks);

    console.log(`📦 Searching ${chunksToSearch.length} chunks`);

    for (const chunk of chunksToSearch) {
      if (results.length >= limit) break;

      try {
        let chunkFile = chunk.file || chunk.filename || `chunk_${chunk.key}.geojson`;
        
        // Handle different path formats (matching parcels.js logic)
        let chunkPath;
        if (chunkFile.startsWith('chunks/')) {
          chunkPath = path.join(baseDir, chunkFile);
        } else if (chunkFile.startsWith('/')) {
          chunkPath = chunkFile;
        } else {
          chunkPath = path.join(baseDir, 'chunks', chunkFile);
        }
        
        // Try alternate path if not found
        if (!fs.existsSync(chunkPath)) {
          const altPath = path.join(baseDir, chunkFile);
          if (fs.existsSync(altPath)) {
            chunkPath = altPath;
          } else {
            console.log(`⚠️ Chunk file not found: ${chunkPath}`);
            continue;
          }
        }

        const chunkData = JSON.parse(fs.readFileSync(chunkPath, 'utf8'));

        for (const feature of chunkData.features || []) {
          if (results.length >= limit) break;

          const props = feature.properties || {};
          
          // Apply filters
          if (criteria.propertyType) {
            const propType = determinePropertyType(props);
            if (propType !== criteria.propertyType) continue;
          }

          if (criteria.maxPrice && props.mktValue && props.mktValue > criteria.maxPrice) continue;
          if (criteria.minPrice && props.mktValue && props.mktValue < criteria.minPrice) continue;
          if (criteria.minAcres && props.acres && props.acres < criteria.minAcres) continue;
          if (criteria.maxAcres && props.acres && props.acres > criteria.maxAcres) continue;
          
          if (criteria.taxDelinquent !== null) {
            const isDelinquent = (props.totalDue && props.totalDue > props.totalTax) || false;
            if (criteria.taxDelinquent && !isDelinquent) continue;
            if (!criteria.taxDelinquent && isDelinquent) continue;
          }

          // Build property object
          const propertyType = determinePropertyType(props);
          const isDelinquent = (props.totalDue && props.totalDue > props.totalTax) || false;
          const motivationScore = calculateMotivationScore({ ...props, taxDelinquent: isDelinquent });
          const opportunityFlags = getOpportunityFlags({ ...props, taxDelinquent: isDelinquent });

          // Get centroid for lat/lng
          let lat = null, lng = null;
          if (props.centroid && Array.isArray(props.centroid)) {
            lng = props.centroid[0];
            lat = props.centroid[1];
          } else if (feature.geometry) {
            // Calculate centroid from geometry if needed
            if (feature.geometry.type === 'Point') {
              lng = feature.geometry.coordinates[0];
              lat = feature.geometry.coordinates[1];
            } else if (feature.geometry.type === 'Polygon' && feature.geometry.coordinates[0]) {
              // Simple centroid calculation for polygon
              const coords = feature.geometry.coordinates[0];
              let sumLng = 0, sumLat = 0;
              for (const coord of coords) {
                sumLng += coord[0];
                sumLat += coord[1];
              }
              lng = sumLng / coords.length;
              lat = sumLat / coords.length;
            }
          }

          // Skip if no coordinates
          if (!lat || !lng) continue;

          // Convert string numbers to actual numbers
          const parseNumber = (val) => {
            if (val === null || val === undefined) return 0;
            const num = typeof val === 'string' ? parseFloat(val) : val;
            return isNaN(num) ? 0 : num;
          };

          results.push({
            id: props.id || feature.id || `parcel_${results.length}`,
            address: props.address || 'Unknown Address',
            owner: props.owner || 'Unknown Owner',
            propertyType: propertyType,
            assetClass: propertyType === 'land' ? 'vacant_land' : propertyType,
            taxValue: parseNumber(props.totalTax),
            landValue: parseNumber(props.landValue),
            improvementValue: parseNumber(props.impValue),
            marketValue: parseNumber(props.mktValue),
            acres: parseNumber(props.acres),
            zoning: props.zoning || null,
            floodZone: props.floodZone || null,
            taxDelinquent: isDelinquent,
            ownerOccupied: props.ownerOccupied || false,
            motivationScore: motivationScore,
            opportunityFlags: opportunityFlags,
            lat: lat,
            lng: lng,
            centroid: props.centroid || [lng, lat],
            yearBuilt: props.yearBuilt ? parseNumber(props.yearBuilt) : null,
            legalDesc: props.legalDesc || null
          });
        }
      } catch (chunkError) {
        console.error(`❌ Error reading chunk ${chunk.file || chunk.filename}:`, chunkError.message);
      }
    }

    // Sort by motivation score (highest first)
    results.sort((a, b) => b.motivationScore - a.motivationScore);

    console.log(`✅ Found ${results.length} matching properties`);
    return results;

  } catch (error) {
    console.error('❌ Property query failed:', error);
    return [];
  }
}

// Check if query needs property data
export function needsPropertyData(query, mode) {
  const queryLower = query.toLowerCase();
  
  // Scout mode typically needs property data
  if (mode === 'scout') return true;
  
  // Keywords that indicate property search
  const propertyKeywords = [
    'find', 'search', 'show', 'list', 'properties', 'parcels',
    'land', 'vacant', 'lots', 'commercial', 'residential',
    'under', 'below', 'above', 'over', 'price', 'acres',
    'delinquent', 'tax', 'owner', 'motivated'
  ];
  
  return propertyKeywords.some(keyword => queryLower.includes(keyword));
}

// Export helper functions for testing
export {
  parseQueryCriteria,
  calculateMotivationScore,
  getOpportunityFlags,
  determinePropertyType
};
