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
    zipCode: null,
    county: null,
    zoning: null,
    taxDelinquent: null,
    absenteeOwner: null,
    vacantLand: null,
    distressed: null,
    keywords: []
  };

  const queryLower = query.toLowerCase();

  // Property type detection
  if (queryLower.includes('vacant') || queryLower.includes('land') || queryLower.includes('lot')) {
    criteria.propertyType = 'land';
    criteria.vacantLand = true;
  } else if (queryLower.includes('commercial') || queryLower.includes('retail') || queryLower.includes('office')) {
    criteria.propertyType = 'commercial';
  } else if (queryLower.includes('residential') || queryLower.includes('house') || queryLower.includes('home') || queryLower.includes('sfr') || queryLower.includes('single family')) {
    criteria.propertyType = 'residential';
  } else if (queryLower.includes('industrial') || queryLower.includes('warehouse')) {
    criteria.propertyType = 'industrial';
  } else if (queryLower.includes('mixed') || queryLower.includes('multi')) {
    criteria.propertyType = 'mixed';
  } else if (queryLower.includes('multifamily') || queryLower.includes('apartment') || queryLower.includes('multi-family')) {
    criteria.propertyType = 'multifamily';
  }

  // Motivated seller / distressed indicators
  if (queryLower.includes('motivated') || queryLower.includes('distressed') || queryLower.includes('urgent') || queryLower.includes('must sell')) {
    criteria.distressed = true;
  }

  // Tax delinquent
  if (queryLower.includes('delinquent') || queryLower.includes('tax lien') || queryLower.includes('back taxes') || queryLower.includes('tax debt')) {
    criteria.taxDelinquent = true;
  }

  // Absentee owner
  if (queryLower.includes('absentee') || queryLower.includes('out of state') || queryLower.includes('out-of-state') || queryLower.includes('non-local') || queryLower.includes('investor owned')) {
    criteria.absenteeOwner = true;
  }

  // Price extraction (improved)
  const pricePatterns = [
    /under\s*\$?([\d,]+)\s*k?/i,
    /below\s*\$?([\d,]+)\s*k?/i,
    /less\s+than\s*\$?([\d,]+)\s*k?/i,
    /max\s*\$?([\d,]+)\s*k?/i,
    /up\s+to\s*\$?([\d,]+)\s*k?/i,
    /\$?([\d,]+)\s*k?\s+or\s+less/i
  ];
  
  for (const pattern of pricePatterns) {
    const match = queryLower.match(pattern);
    if (match) {
      let price = parseFloat(match[1].replace(/,/g, ''));
      if (queryLower.includes('k') || price < 1000) price *= 1000;
      criteria.maxPrice = price;
      break;
    }
  }

  const minPricePatterns = [
    /over\s*\$?([\d,]+)\s*k?/i,
    /above\s*\$?([\d,]+)\s*k?/i,
    /more\s+than\s*\$?([\d,]+)\s*k?/i,
    /min\s*\$?([\d,]+)\s*k?/i,
    /at\s+least\s*\$?([\d,]+)\s*k?/i
  ];
  
  for (const pattern of minPricePatterns) {
    const match = queryLower.match(pattern);
    if (match) {
      let price = parseFloat(match[1].replace(/,/g, ''));
      if (queryLower.includes('k') || price < 1000) price *= 1000;
      criteria.minPrice = price;
      break;
    }
  }

  // Acreage extraction (improved)
  const acresMatch = queryLower.match(/(\d+\.?\d*)\+?\s*(?:acres?|ac)/i);
  const acresOverMatch = queryLower.match(/over\s*(\d+\.?\d*)\s*(?:acres?|ac)/i);
  const acresUnderMatch = queryLower.match(/under\s*(\d+\.?\d*)\s*(?:acres?|ac)/i);
  
  if (acresOverMatch) {
    criteria.minAcres = parseFloat(acresOverMatch[1]);
  } else if (acresUnderMatch) {
    criteria.maxAcres = parseFloat(acresUnderMatch[1]);
  } else if (acresMatch) {
    criteria.minAcres = parseFloat(acresMatch[1]);
  }

  // ZIP code extraction
  const zipMatch = query.match(/\b(7\d{4})\b/);
  if (zipMatch) {
    criteria.zipCode = zipMatch[1];
  }

  // City detection (Texas focus)
  const cities = ['austin', 'dallas', 'houston', 'san antonio', 'fort worth', 'el paso', 'arlington', 'plano', 'round rock', 'georgetown', 'cedar park', 'pflugerville', 'leander', 'bee cave', 'lakeway', 'dripping springs'];
  for (const city of cities) {
    if (queryLower.includes(city)) {
      criteria.city = city;
      break;
    }
  }

  // County detection
  const counties = ['travis', 'williamson', 'hays', 'bastrop', 'caldwell', 'dallas', 'tarrant', 'harris', 'bexar'];
  for (const county of counties) {
    if (queryLower.includes(county + ' county') || queryLower.includes(county)) {
      criteria.county = county;
      break;
    }
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
  const factors = [];

  // Tax delinquency (strong indicator) +25
  if (property.taxDelinquent || (property.totalDue && property.totalDue > property.totalTax)) {
    score += 25;
    factors.push('tax-delinquent');
  }

  // Absentee owner +15
  const mailingCity = (property.mailingCity || property.mailingAddr || '').toLowerCase();
  const propCity = (property.city || property.address || 'austin').toLowerCase();
  if (mailingCity && mailingCity !== propCity && mailingCity.length > 0) {
    score += 15;
    factors.push('absentee-owner');
  }

  // Vacant land (no improvements) +10
  if (!property.impValue || property.impValue === 0) {
    score += 10;
    factors.push('vacant-land');
  }

  // Long-term ownership +5 (skip - saleDate not available in data)
  // Note: saleDate field is not present in parcel data

  // Low value per acre (potentially undervalued) +10
  if (property.acres && property.mktValue) {
    const valuePerAcre = property.mktValue / property.acres;
    if (valuePerAcre < 30000) {
      score += 10;
      factors.push('potentially-undervalued');
    }
  }

  // Large lot +5
  if (property.acres && property.acres > 1) {
    score += 5;
    factors.push('large-lot');
  }

  // Corporate/trust ownership (often more motivated) +5
  const ownerLower = (property.owner || '').toLowerCase();
  if (ownerLower.includes('llc') || ownerLower.includes('trust') || ownerLower.includes('corp') || ownerLower.includes('inc') || ownerLower.includes('estate')) {
    score += 5;
    factors.push('entity-owned');
  }

  return {
    score: Math.min(score, 100),
    factors
  };
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

  // Absentee owner (address state is NOT Texas)
  const address = (property.address || '').toLowerCase();
  if (address) {
    const parts = address.split(',');
    if (parts.length >= 2) {
      const statePart = parts[parts.length - 1].trim().split()[0].toLowerCase();
      // Check if state is NOT Texas
      if (statePart && statePart !== 'tx' && statePart !== 'texas') {
        flags.push('absentee-owner');
      }
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

          // Absentee owner detection (address state is NOT Texas)
          if (criteria.absenteeOwner) {
            const address = (props.address || '').toLowerCase();
            let isAbsentee = false;
            
            if (address) {
              const parts = address.split(',');
              if (parts.length >= 2) {
                const statePart = parts[parts.length - 1].trim().split()[0].toLowerCase();
                // Check if state is NOT Texas
                if (statePart && statePart !== 'tx' && statePart !== 'texas') {
                  isAbsentee = true;
                }
              }
            }
            
            if (!isAbsentee) continue;
          }

          // Distressed property detection (multiple indicators)
          if (criteria.distressed) {
            const isDelinquent = (props.totalDue && props.totalTax && 
              parseFloat(String(props.totalDue).replace(/,/g, '')) > parseFloat(String(props.totalTax).replace(/,/g, ''))) || false;
            const isDistressed = 
              isDelinquent ||
              (!props.impValue || props.impValue === 0); // Vacant land often distressed
            // Note: foreclosure and bankOwned fields not available in data
            
            if (!isDistressed) continue;
          }

          // ZIP code filtering
          if (criteria.zipCode) {
            const propZip = (props.zip || props.zipCode || props.address || '').toString();
            if (!propZip.includes(criteria.zipCode)) continue;
          }

          // Build property object
          const propertyType = determinePropertyType(props);
          const isDelinquent = (props.totalDue && props.totalDue > props.totalTax) || false;
          const { score: motivationScore, factors: scoreFactors } = calculateMotivationScore({ 
            ...props, 
            taxDelinquent: isDelinquent,
            address: props.address
          });
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
