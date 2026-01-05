/**
 * County Resolver Service
 * 
 * Resolves parcelId to county table information.
 * Strategy: Query all county tables until we find a match, then cache the result.
 * 
 * This service is used by route handlers to determine which county table
 * to query for parcel geometry and enrichment data.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * County table configuration
 * Maps FIPS codes to table names for geometry and enrichment tables
 */
export const COUNTY_TABLES = [
  { fips: '48453', name: 'Travis', table: 'parcels_travis', enrichment: 'parcels_travis_enrichment' },
  { fips: '48021', name: 'Bastrop', table: 'parcels_bastrop', enrichment: 'parcels_bastrop_enrichment' },
  { fips: '48027', name: 'Bell', table: 'parcels_bell', enrichment: 'parcels_bell_enrichment' },
  { fips: '48031', name: 'Blanco', table: 'parcels_blanco', enrichment: 'parcels_blanco_enrichment' },
  { fips: '48053', name: 'Burnet', table: 'parcels_burnet', enrichment: 'parcels_burnet_enrichment' },
  { fips: '48055', name: 'Caldwell', table: 'parcels_caldwell', enrichment: 'parcels_caldwell_enrichment' },
  { fips: '48091', name: 'Comal', table: 'parcels_comal', enrichment: 'parcels_comal_enrichment' },
  { fips: '48209', name: 'Hays', table: 'parcels_hays', enrichment: 'parcels_hays_enrichment' },
  { fips: '48259', name: 'Kendall', table: 'parcels_kendall', enrichment: 'parcels_kendall_enrichment' },
  { fips: '48287', name: 'Lee', table: 'parcels_lee', enrichment: 'parcels_lee_enrichment' },
  { fips: '48299', name: 'Llano', table: 'parcels_llano', enrichment: 'parcels_llano_enrichment' },
  { fips: '48491', name: 'Williamson', table: 'parcels_williamson', enrichment: 'parcels_williamson_enrichment' }
];

/**
 * Cache: parcelId -> county info
 * Prevents repeated queries for the same parcelId
 */
const parcelCountyCache = new Map();

/**
 * Resolve parcelId to county table information
 * 
 * @param {string} parcelId - The parcel ID to resolve
 * @param {PrismaClient} [prismaInstance] - Optional Prisma instance (defaults to module-level instance)
 * @returns {Promise<{fips: string, name: string, table: string, enrichment: string} | null>}
 *   Returns county info if found, null if parcel not found in any county
 */
export async function resolveParcelCounty(parcelId, prismaInstance = prisma) {
  if (!parcelId) {
    return null;
  }
  
  const parcelIdStr = String(parcelId).trim();
  
  // Check cache first
  if (parcelCountyCache.has(parcelIdStr)) {
    return parcelCountyCache.get(parcelIdStr);
  }
  
  // Query each county table until found
  // Start with Travis (most common) for better performance
  const countiesToQuery = [
    COUNTY_TABLES.find(c => c.fips === '48453'), // Travis first
    ...COUNTY_TABLES.filter(c => c.fips !== '48453') // Then others
  ].filter(Boolean);
  
  for (const county of countiesToQuery) {
    try {
      const result = await prismaInstance.$queryRawUnsafe(
        `SELECT 1 FROM ${county.table} WHERE parcel_id = $1 LIMIT 1`,
        parcelIdStr
      );
      
      if (result && result.length > 0) {
        // Found it - cache and return
        parcelCountyCache.set(parcelIdStr, county);
        return county;
      }
    } catch (error) {
      // Log error but continue to next county
      console.warn(`[countyResolver] Error querying ${county.table} for parcel ${parcelIdStr}:`, error.message);
      continue;
    }
  }
  
  // Not found in any county
  console.log(`[countyResolver] Parcel ${parcelIdStr} not found in any county table`);
  return null;
}

/**
 * Clear the parcel county cache
 * Useful for testing or when county data is updated
 */
export function clearParcelCountyCache() {
  parcelCountyCache.clear();
}

/**
 * Get cache statistics
 * @returns {{size: number, entries: Array<{parcelId: string, county: string}>}}
 */
export function getCacheStats() {
  return {
    size: parcelCountyCache.size,
    entries: Array.from(parcelCountyCache.entries()).map(([parcelId, county]) => ({
      parcelId,
      county: county.name
    }))
  };
}

export default {
  resolveParcelCounty,
  COUNTY_TABLES,
  clearParcelCountyCache,
  getCacheStats
};
