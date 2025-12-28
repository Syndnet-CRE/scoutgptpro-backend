/**
 * ATTOM Resolver Service
 * 
 * Resolves parcelId to ATTOM GeoJSON ID (32-hex) using xref_parcel_property_travis table.
 * Handles conflicts by setting attomGeoId=null and attomConflict=true.
 * 
 * NOTE: This service returns attomGeoId (32-hex GeoJSON ID), NOT the numeric attomId
 * from properties table. The numeric attomId is preserved separately.
 * 
 * Read-only service - does not modify properties table.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Get ATTOM GeoJSON ID for a single parcelId
 * @param {string} parcelId - 6-digit parcel identifier
 * @returns {Promise<{attomGeoId: string|null, attomConflict: boolean, attomGeoIdSource: string}>}
 */
export async function getAttomGeoIdByParcelId(parcelId) {
  if (!parcelId) {
    return { attomGeoId: null, attomConflict: false, attomGeoIdSource: 'unmapped' };
  }

  const parcelIdStr = String(parcelId).trim();
  
  // Check conflicts first (conflicts override xref)
  const conflict = await prisma.$queryRawUnsafe(`
    SELECT parcel_id, attom_ids, attom_id_count
    FROM xref_parcel_property_travis_conflicts
    WHERE parcel_id = $1
    LIMIT 1
  `, parcelIdStr);
  
  if (conflict && conflict.length > 0) {
    return {
      attomGeoId: null, // Conflicts must return null
      attomConflict: true,
      attomGeoIdSource: 'conflict'
    };
  }
  
  // Check xref table for unique mapping (attom_id column contains 32-hex GeoJSON ID)
  const xref = await prisma.$queryRawUnsafe(`
    SELECT parcel_id, attom_id
    FROM xref_parcel_property_travis
    WHERE parcel_id = $1
    LIMIT 1
  `, parcelIdStr);
  
  if (xref && xref.length > 0) {
    return {
      attomGeoId: xref[0].attom_id, // This is the 32-hex GeoJSON ID
      attomConflict: false,
      attomGeoIdSource: 'travis_xref'
    };
  }
  
  // No mapping found
  return {
    attomGeoId: null,
    attomConflict: false,
    attomGeoIdSource: 'unmapped'
  };
}

/**
 * Legacy function name for backward compatibility
 * @deprecated Use getAttomGeoIdByParcelId instead
 */
export async function getAttomIdByParcelId(parcelId) {
  return getAttomGeoIdByParcelId(parcelId);
}

/**
 * Attach ATTOM GeoJSON IDs to a list of property objects
 * Preserves existing numeric attomId from properties table.
 * 
 * @param {Array<Object>} properties - Array of property objects with parcelId field
 * @returns {Promise<Array<Object>>} - Same array with attomGeoId and attomConflict added
 *                                      Existing attomId (numeric) is preserved if present
 */
export async function attachAttomGeoIdsToProperties(properties) {
  if (!properties || !Array.isArray(properties) || properties.length === 0) {
    return properties;
  }
  
  // Extract unique parcelIds
  const parcelIds = [...new Set(
    properties
      .map(p => p.parcelId || p.parcel_id)
      .filter(id => id != null)
      .map(id => String(id).trim())
  )];
  
  if (parcelIds.length === 0) {
    // No parcelIds to resolve, return properties as-is with attomGeoId=null
    return properties.map(p => ({
      ...p,
      attomGeoId: null,
      attomConflict: false,
      attomGeoIdSource: 'unmapped'
      // Preserve existing attomId (numeric) if present
    }));
  }
  
  // Build parameterized query for batch lookup
  const placeholders = parcelIds.map((_, idx) => `$${idx + 1}`).join(', ');
  
  // Query conflicts first (these override xref)
  const conflicts = await prisma.$queryRawUnsafe(`
    SELECT parcel_id, attom_ids, attom_id_count
    FROM xref_parcel_property_travis_conflicts
    WHERE parcel_id IN (${placeholders})
  `, ...parcelIds);
  
  // Build conflict map
  const conflictMap = new Map();
  conflicts.forEach(c => {
    conflictMap.set(c.parcel_id, {
      attomGeoId: null,
      attomConflict: true,
      attomGeoIdSource: 'conflict'
    });
  });
  
  // Query xref for non-conflict parcelIds
  const nonConflictIds = parcelIds.filter(id => !conflictMap.has(id));
  
  let xrefMap = new Map();
  if (nonConflictIds.length > 0) {
    const xrefPlaceholders = nonConflictIds.map((_, idx) => `$${idx + 1}`).join(', ');
    const xrefs = await prisma.$queryRawUnsafe(`
      SELECT parcel_id, attom_id
      FROM xref_parcel_property_travis
      WHERE parcel_id IN (${xrefPlaceholders})
    `, ...nonConflictIds);
    
    xrefs.forEach(x => {
      xrefMap.set(x.parcel_id, {
        attomGeoId: x.attom_id, // This is the 32-hex GeoJSON ID
        attomConflict: false,
        attomGeoIdSource: 'travis_xref'
      });
    });
  }
  
  // Merge results into properties, preserving existing attomId (numeric)
  return properties.map(property => {
    const parcelId = String(property.parcelId || property.parcel_id || '').trim();
    
    if (!parcelId) {
      return {
        ...property,
        attomGeoId: null,
        attomConflict: false,
        attomGeoIdSource: 'unmapped'
        // Preserve existing attomId (numeric) if present
      };
    }
    
    // Check conflict first (conflicts override xref)
    if (conflictMap.has(parcelId)) {
      return {
        ...property,
        ...conflictMap.get(parcelId)
        // Preserve existing attomId (numeric) if present
      };
    }
    
    // Check xref
    if (xrefMap.has(parcelId)) {
      return {
        ...property,
        ...xrefMap.get(parcelId)
        // Preserve existing attomId (numeric) if present
      };
    }
    
    // No mapping found
    return {
      ...property,
      attomGeoId: null,
      attomConflict: false,
      attomGeoIdSource: 'unmapped'
      // Preserve existing attomId (numeric) if present
    };
  });
}

/**
 * Legacy function name for backward compatibility
 * @deprecated Use attachAttomGeoIdsToProperties instead
 */
export async function attachAttomIdsToProperties(properties) {
  return attachAttomGeoIdsToProperties(properties);
}

