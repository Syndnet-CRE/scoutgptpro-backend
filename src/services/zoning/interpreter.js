/**
 * Austin Zoning Code Interpretation Database
 * Based on Austin Land Development Code Title 25
 */
const ZONING_DEFINITIONS = {
  // Downtown Mixed Use
  'CBD': {
    name: 'Central Business District',
    category: 'commercial',
    maxHeight: 'unlimited',
    minSetbackFront: 0,
    minSetbackSide: 0,
    minSetbackRear: 0,
    maxFAR: 8.0,
    allowedUses: ['office', 'retail', 'residential', 'hotel', 'entertainment'],
    requiresParking: false,
    notes: 'No height limit in core CBD. Development bonuses available.'
  },
  
  // Commercial Highway
  'CH': {
    name: 'Commercial Highway',
    category: 'commercial',
    maxHeight: '60 ft',
    minSetbackFront: 25,
    minSetbackSide: 0,
    minSetbackRear: 0,
    maxFAR: 1.0,
    allowedUses: ['retail', 'office', 'restaurant', 'auto-related', 'light industrial'],
    requiresParking: true,
    notes: 'Intended for auto-oriented commercial along highways.'
  },
  
  // Commercial Services
  'CS': {
    name: 'Commercial Services',
    category: 'commercial',
    maxHeight: '40 ft',
    minSetbackFront: 15,
    minSetbackSide: 0,
    minSetbackRear: 0,
    maxFAR: 0.5,
    allowedUses: ['retail', 'office', 'service', 'light industrial'],
    requiresParking: true,
    notes: 'General commercial services.'
  },
  'CS-1': {
    name: 'Commercial Services - Restricted',
    category: 'commercial',
    maxHeight: '40 ft',
    minSetbackFront: 15,
    minSetbackSide: 10,
    minSetbackRear: 10,
    maxFAR: 0.5,
    allowedUses: ['retail', 'office', 'service'],
    requiresParking: true,
    notes: 'More restrictive than CS, buffering residential areas.'
  },
  
  // General Retail
  'GR': {
    name: 'General Retail',
    category: 'commercial',
    maxHeight: '40 ft',
    minSetbackFront: 15,
    minSetbackSide: 0,
    minSetbackRear: 5,
    maxFAR: 1.0,
    allowedUses: ['retail', 'restaurant', 'personal services', 'office'],
    requiresParking: true,
    notes: 'Pedestrian-oriented retail.'
  },
  
  // Multifamily
  'MF-1': {
    name: 'Multifamily Residence - Low Density',
    category: 'residential',
    maxHeight: '35 ft',
    minSetbackFront: 25,
    minSetbackSide: 5,
    minSetbackRear: 10,
    maxFAR: 0.5,
    maxUnitsPerAcre: 12,
    allowedUses: ['multifamily', 'duplex', 'townhome'],
    requiresParking: true,
    notes: 'Low-density multifamily.'
  },
  'MF-4': {
    name: 'Multifamily Residence - High Density',
    category: 'residential',
    maxHeight: '60 ft',
    minSetbackFront: 15,
    minSetbackSide: 10,
    minSetbackRear: 10,
    maxFAR: 2.0,
    maxUnitsPerAcre: 54,
    allowedUses: ['multifamily', 'apartment', 'condo'],
    requiresParking: true,
    notes: 'High-density multifamily, often near transit.'
  },
  
  // Industrial
  'LI': {
    name: 'Limited Industrial',
    category: 'industrial',
    maxHeight: '60 ft',
    minSetbackFront: 20,
    minSetbackSide: 0,
    minSetbackRear: 0,
    maxFAR: 1.0,
    allowedUses: ['light manufacturing', 'warehouse', 'flex', 'office'],
    requiresParking: true,
    notes: 'Light industrial, limited outdoor operations.'
  },
  
  // Agricultural
  'AG': {
    name: 'Agricultural',
    category: 'agricultural',
    maxHeight: '35 ft',
    minSetbackFront: 40,
    minSetbackSide: 20,
    minSetbackRear: 20,
    maxFAR: 0.1,
    minLotSize: '10 acres',
    allowedUses: ['agricultural', 'single-family', 'ranch'],
    requiresParking: false,
    notes: 'Agricultural preservation, limited development.'
  },
  
  // Single Family
  'SF-3': {
    name: 'Single Family Residence - Standard',
    category: 'residential',
    maxHeight: '35 ft',
    minSetbackFront: 25,
    minSetbackSide: 5,
    minSetbackRear: 10,
    maxFAR: 0.4,
    minLotSize: '5,750 sq ft',
    allowedUses: ['single-family', 'adu'],
    requiresParking: true,
    notes: 'Standard single-family lots.'
  }
};

// Overlay modifiers
const OVERLAY_MODIFIERS = {
  'CO': { name: 'Conditional Overlay', effect: 'Additional conditions may apply' },
  'NP': { name: 'Neighborhood Plan', effect: 'Subject to neighborhood plan restrictions' },
  'H': { name: 'Historic', effect: 'Historic preservation requirements' },
  'ETOD': { name: 'Equitable Transit-Oriented Development', effect: 'Increased density near transit' },
  'CURE': { name: 'Core Transit Corridor', effect: 'Enhanced transit access requirements' },
  'PDA': { name: 'Planned Development Area', effect: 'Custom development standards' },
  'DBETOD': { name: 'Density Bonus ETOD', effect: 'Density bonuses available' }
};

/**
 * Parse a zoning code into base zone and overlays
 * Example: "CBD-CO-NP" → { base: "CBD", overlays: ["CO", "NP"] }
 * Example: "MF-4-CO" → { base: "MF-4", overlays: ["CO"] }
 */
export function parseZoningCode(code) {
  if (!code) return { base: null, overlays: [] };
  
  const parts = code.split('-');
  
  // Check if first two parts form a valid base code (e.g., "MF-4", "CS-1", "SF-3")
  // Overlays are typically 2-3 letter codes, not numbers
  let base;
  let overlays;
  
  if (parts.length >= 2) {
    const potentialBase = `${parts[0]}-${parts[1]}`;
    // If second part is a number or if the combined code exists in definitions, it's part of base
    if (/^\d+$/.test(parts[1]) || ZONING_DEFINITIONS[potentialBase]) {
      base = potentialBase;
      overlays = parts.slice(2);
    } else {
      // Second part is likely an overlay (like "CO", "NP", "H")
      base = parts[0];
      overlays = parts.slice(1);
    }
  } else {
    base = parts[0];
    overlays = [];
  }
  
  return { base, overlays };
}

/**
 * Get full zoning interpretation
 * @param {string} zoningCode - Full zoning code (e.g., "CBD-CO-NP")
 * @returns {object} Complete zoning interpretation
 */
export function interpretZoning(zoningCode) {
  const { base, overlays } = parseZoningCode(zoningCode);
  
  const baseDefinition = ZONING_DEFINITIONS[base] || {
    name: 'Unknown Zoning',
    category: 'unknown',
    notes: `No interpretation available for base code: ${base}`
  };
  
  const overlayInfo = overlays.map(o => OVERLAY_MODIFIERS[o] || { 
    name: o, 
    effect: 'Unknown overlay' 
  });
  
  return {
    code: zoningCode,
    base: {
      code: base,
      ...baseDefinition
    },
    overlays: overlayInfo,
    summary: generateZoningSummary(baseDefinition, overlayInfo),
    developmentPotential: assessDevelopmentPotential(baseDefinition)
  };
}

function generateZoningSummary(base, overlays) {
  let summary = `${base.name || 'Unknown'}: `;
  
  if (base.maxHeight) summary += `Max height ${base.maxHeight}. `;
  if (base.maxFAR) summary += `FAR up to ${base.maxFAR}. `;
  if (base.minSetbackFront) summary += `${base.minSetbackFront}ft front setback. `;
  if (base.allowedUses) summary += `Allows: ${base.allowedUses.join(', ')}. `;
  
  if (overlays.length > 0) {
    summary += `Overlays: ${overlays.map(o => o.name).join(', ')}.`;
  }
  
  return summary;
}

function assessDevelopmentPotential(base) {
  if (!base.category) return 'unknown';
  
  const factors = [];
  
  // Height potential
  if (base.maxHeight === 'unlimited' || parseInt(base.maxHeight) >= 60) {
    factors.push('high-rise potential');
  }
  
  // Density potential
  if (base.maxFAR >= 2.0) {
    factors.push('high-density development');
  } else if (base.maxFAR >= 1.0) {
    factors.push('medium-density development');
  }
  
  // Use flexibility
  if (base.allowedUses?.length >= 4) {
    factors.push('mixed-use potential');
  }
  
  return factors.length > 0 ? factors.join(', ') : 'limited development';
}

/**
 * Get constraints for a specific parcel
 * @param {string} parcelId - Parcel ID
 * @param {object} pool - Database pool
 */
export async function getParcelConstraints(parcelId, pool) {
  // Get parcel info
  const parcelResult = await pool.query(`
    SELECT parcel_id, zoning_code, acres_calc, flood_zone,
           geom_centroid
    FROM parcel_features_travis
    WHERE parcel_id = $1
  `, [parcelId]);
  
  if (parcelResult.rows.length === 0) {
    return { found: false, error: 'Parcel not found' };
  }
  
  const parcel = parcelResult.rows[0];
  const zoning = interpretZoning(parcel.zoning_code);
  
  // Get overlays from zoning_districts table
  const overlayResult = await pool.query(`
    SELECT zoning_code, zoning_desc, overlay
    FROM zoning_districts
    WHERE ST_Intersects(geometry, (
      SELECT geom_centroid FROM parcel_features_travis WHERE parcel_id = $1
    ))
  `, [parcelId]);
  
  return {
    found: true,
    parcelId,
    acres: parcel.acres_calc,
    zoningCode: parcel.zoning_code,
    zoning,
    floodZone: parcel.flood_zone,
    overlays: overlayResult.rows,
    constraints: {
      setbacks: {
        front: zoning.base.minSetbackFront || 'N/A',
        side: zoning.base.minSetbackSide || 'N/A',
        rear: zoning.base.minSetbackRear || 'N/A'
      },
      height: zoning.base.maxHeight || 'N/A',
      far: zoning.base.maxFAR || 'N/A',
      allowedUses: zoning.base.allowedUses || [],
      parkingRequired: zoning.base.requiresParking
    }
  };
}

export default {
  interpretZoning,
  parseZoningCode,
  getParcelConstraints,
  ZONING_DEFINITIONS,
  OVERLAY_MODIFIERS
};
