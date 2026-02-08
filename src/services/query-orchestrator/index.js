/**
 * Query Orchestrator
 * Main service coordinating intelligent property search
 */

import { PrismaClient } from '@prisma/client';
import { getSchemaContext, getSchemaPromptSection } from './schemaContext.js';
import { resolveGeography } from './geographyResolver.js';
import { buildPropertyQuery } from './queryBuilder.js';
import { enrichResults } from './resultEnricher.js';

const prisma = new PrismaClient();

/**
 * Intelligent property search orchestrator
 */
export async function intelligentPropertySearch({
  query = '',
  filters = {},
  location = {},
  sort_by = 'market_value',
  limit = 25
}) {
  const startTime = Date.now();
  const metadata = { filters, query };
  
  try {
    // 1. Resolve geography
    let spatial = null;
    if (location.reference) {
      console.log(`[Orchestrator] Resolving: "${location.reference}"`);
      spatial = await resolveGeography(location.reference, {
        defaultDistance: location.distance_meters || 5000
      });
      if (spatial) {
        metadata.location = spatial.label;
        console.log(`[Orchestrator] Resolved: ${spatial.label}`);
      }
    }
    
    // Use explicit bbox if provided
    if (location.bbox && Array.isArray(location.bbox) && location.bbox.length === 4) {
      spatial = { type: 'bbox', coordinates: location.bbox, label: 'Custom bbox' };
      metadata.location = 'Custom bbox';
    }
    
    // 2. Parse implicit filters from query
    const implicitFilters = parseQueryForFilters(query);
    const mergedFilters = { ...implicitFilters, ...filters };
    metadata.filters = mergedFilters;
    
    // 3. Build query
    console.log('[Orchestrator] Filters:', mergedFilters);
    const { sql, params } = buildPropertyQuery({
      filters: mergedFilters,
      spatial,
      sort: { field: sort_by, direction: 'DESC' },
      limit: Math.min(limit, 100),
      includeEnrichment: true,
      includeZoning: true
    });
    
    // 4. Execute via Prisma
    console.log('[Orchestrator] Executing query...');
    const rows = await prisma.$queryRawUnsafe(sql, ...params);
    console.log(`[Orchestrator] Found ${rows.length} results`);
    
    // 5. Enrich
    metadata.executionTime = Date.now() - startTime;
    metadata.sort = sort_by;
    
    const enriched = enrichResults(rows, { sortBy: sort_by === 'value_per_acre' ? 'value_per_acre' : 'motivation' });
    
    // Convert to GeoJSON FeatureCollection format
    const features = enriched.properties.map(prop => ({
      type: 'Feature',
      geometry: prop.geometry,
      properties: {
        parcel_id: String(prop.attom_id),
        address: prop.address_full,
        owner: prop.owner1_name,
        owner_type: prop.owner_type_desc,
        acres: prop.lot_acres,
        asset_class: prop.property_use_group,
        market_value: prop.market_value_total,
        land_value: prop.market_value_land,
        improvement_value: prop.market_value_improve,
        value_per_acre: prop.value_per_acre,
        value_per_sqft: prop.value_per_sqft,
        improvement_ratio: prop.improvement_ratio,
        tax_delinquent: prop.tax_delinquent_year != null,
        homestead: prop.homestead_exempt,
        zoning_code: prop.zoned_code_local,
        zoning_description: prop.zoning_description,
        year_built: prop.year_built,
        building_sqft: prop.building_sqft,
        motivation_score: prop.motivation_score,
        motivation_factors: prop.motivation_factors,
        opportunity_flags: prop.opportunity_flags,
        lat: prop.lat,
        lng: prop.lng
      }
    }));
    
    return {
      type: 'FeatureCollection',
      features,
      query_summary: {
        total_results: features.length,
        filters_applied: mergedFilters,
        location: metadata.location,
        execution_time_ms: metadata.executionTime,
        sort_by: sort_by
      },
      summary: enriched.summary,
      metadata: enriched.summary
    };
    
  } catch (error) {
    console.error('[Orchestrator] Error:', error);
    return {
      type: 'FeatureCollection',
      query_summary: {
        total_results: 0,
        filters_applied: metadata.filters,
        error: error.message,
        execution_time_ms: Date.now() - startTime
      },
      features: [],
      summary: `Search failed: ${error.message}`
    };
  }
}

/**
 * Parse natural language for implicit filters
 */
function parseQueryForFilters(query) {
  if (!query) return {};
  const filters = {};
  const text = query.toLowerCase();
  
  // Asset class
  if (text.includes('commercial') || text.includes('retail') || text.includes('office')) {
    filters.asset_class = 'commercial';
  } else if (text.includes('residential') || text.includes('house') || text.includes('home')) {
    filters.asset_class = 'residential';
  } else if (text.includes('industrial') || text.includes('warehouse')) {
    filters.asset_class = 'industrial';
  } else if (text.includes('land') || text.includes('lot') || text.includes('vacant')) {
    filters.asset_class = 'land';
  }
  
  // Size
  const acreMatch = text.match(/over (\d+) acres?|(\d+)\+ acres?|more than (\d+) acres?/i);
  if (acreMatch) {
    filters.min_acres = parseFloat(acreMatch[1] || acreMatch[2] || acreMatch[3]);
  } else if (text.includes('large')) {
    filters.min_acres = 2;
  }
  
  // Value
  const maxValueMatch = text.match(/under \$?([\d,]+)|below \$?([\d,]+)|less than \$?([\d,]+)/i);
  if (maxValueMatch) {
    let val = parseFloat((maxValueMatch[1] || maxValueMatch[2] || maxValueMatch[3]).replace(/,/g, ''));
    if (val < 10000) val *= 1000; // Assume "500" means "$500k"
    filters.max_value = val;
  }
  
  // Distress
  if (text.includes('distress') || text.includes('delinquent')) {
    filters.tax_delinquent = true;
  }
  
  // ZIP
  const zipMatch = text.match(/\b(78\d{3})\b/);
  if (zipMatch) filters.zip_code = zipMatch[1];
  
  return filters;
}

export { getSchemaContext, getSchemaPromptSection };
export default { intelligentPropertySearch, getSchemaContext, getSchemaPromptSection };
