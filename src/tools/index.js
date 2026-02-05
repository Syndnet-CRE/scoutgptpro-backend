// src/tools/index.js
// Tool definitions for Claude Anthropic API

import { executeTool } from './handlers.js';
import { getSchemaPromptSection } from '../services/query-orchestrator/index.js';

export const TOOLS = [
  {
    name: 'intelligent_property_search',
    description: `Search properties with intelligent query understanding and enriched results.

Handles:
- Natural language location ("downtown Austin", "near I-35", "in 78702")
- Relative size terms ("large", "small", "over 5 acres")  
- Property types ("commercial", "developable land")
- Investment criteria ("distressed", "tax delinquent")

Returns enriched GeoJSON with:
- Core property data (address, owner, acreage, values)
- Zoning interpretation (what uses are allowed)
- Value metrics ($/acre, improvement ratio)
- Opportunity flags (tax_delinquent, underimproved, development_potential)

Use this for ALL property searches - it provides better results than search_properties.`,

    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language description of desired properties'
        },
        filters: {
          type: 'object',
          description: 'Explicit structured filters',
          properties: {
            asset_class: { type: 'string', enum: ['residential', 'commercial', 'industrial', 'land', 'agricultural'] },
            min_acres: { type: 'number' },
            max_acres: { type: 'number' },
            min_value: { type: 'number' },
            max_value: { type: 'number' },
            zoning_code: { type: 'string' },
            owner_type: { type: 'string', enum: ['individual', 'llc', 'corporation', 'trust', 'government'] },
            tax_delinquent: { type: 'boolean' },
            exclude_flood_zone: { type: 'boolean' },
            zip_code: { type: 'string' },
            city: { type: 'string' }
          }
        },
        location: {
          type: 'object',
          properties: {
            reference: { type: 'string', description: 'Location: "downtown Austin", "78702", address' },
            distance_meters: { type: 'number', description: 'Search radius (default 5000)' },
            bbox: { type: 'array', items: { type: 'number' }, description: '[minLng, minLat, maxLng, maxLat]' }
          }
        },
        sort_by: { type: 'string', enum: ['value_per_acre', 'market_value', 'acres_calc', 'year_built'] },
        limit: { type: 'number', default: 25, maximum: 100 }
      },
      required: ['query']
    }
  },
  {
    name: 'search_properties',
    description: 'Search Travis County property database. Returns GeoJSON for map display. Use this whenever the user asks to find, show, or search for properties.',
    input_schema: {
      type: 'object',
      properties: {
        filters: {
          type: 'object',
          description: 'Property filters',
          properties: {
            zip_code: {
              type: ['string', 'number'],
              description: '5-digit ZIP code (e.g., "78758" or 78758)'
            },
            city: {
              type: 'string',
              description: 'City name (e.g., "Austin")'
            },
            min_acres: {
              type: 'number',
              description: 'Minimum acreage'
            },
            max_acres: {
              type: 'number',
              description: 'Maximum acreage'
            },
            min_value: {
              type: 'number',
              description: 'Minimum market value in USD'
            },
            max_value: {
              type: 'number',
              description: 'Maximum market value in USD'
            },
            asset_class: {
              type: 'string',
              enum: ['land', 'residential', 'commercial', 'industrial'],
              description: 'Property type. Valid values: "land", "residential", "commercial", "industrial"'
            },
            zoning_code: {
              type: 'string',
              description: 'Zoning code (e.g., "SF-3", "GR")'
            },
            has_homestead: {
              type: 'boolean',
              description: 'Filter by homestead exemption status (maps to homestead_exemption_flag - true = owner-occupied, false = investment property)'
            },
            is_tax_delinquent: {
              type: 'boolean',
              description: 'Filter for tax delinquent properties (maps to tax_delinquent_flag)'
            }
          }
        },
        bbox: {
          type: 'array',
          items: { type: 'number' },
          minItems: 4,
          maxItems: 4,
          description: 'Bounding box [minLng, minLat, maxLng, maxLat] for spatial filtering'
        },
        limit: {
          type: 'number',
          description: 'Max results, default 50'
        }
      },
      required: []
    }
  },
  {
    name: 'get_property',
    description: 'Get detailed information about a specific property by parcel ID.',
    input_schema: {
      type: 'object',
      properties: {
        parcel_id: {
          type: 'string',
          description: 'The parcel ID to look up'
        }
      },
      required: ['parcel_id']
    }
  },
  {
    name: 'analyze_property',
    description: 'Analyze development feasibility for one or more properties. Returns constraints, opportunities, and recommendations.',
    input_schema: {
      type: 'object',
      properties: {
        parcel_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of parcel IDs to analyze (max 5)',
          minItems: 1,
          maxItems: 5
        }
      },
      required: ['parcel_ids']
    }
  },
  {
    name: 'web_search',
    description: 'Search the web for market news, current information, or recent activity related to real estate, properties, or locations.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query'
        },
        search_type: {
          type: 'string',
          enum: ['market_news', 'zoning_news', 'development_news', 'general'],
          description: 'Type of search to perform'
        },
        location: {
          type: 'string',
          description: 'Optional location to include in search (e.g., "Austin, TX")'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'get_osm_nearby',
    description: 'Find nearby points of interest (POIs) like restaurants, retail, transit, schools, parks, hospitals, banks, grocery stores using OpenStreetMap data.',
    input_schema: {
      type: 'object',
      properties: {
        lat: {
          type: 'number',
          description: 'Latitude of center point'
        },
        lng: {
          type: 'number',
          description: 'Longitude of center point'
        },
        radius_meters: {
          type: 'number',
          description: 'Search radius in meters',
          default: 500,
          minimum: 50,
          maximum: 5000
        },
        categories: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['restaurant', 'retail', 'transit', 'school', 'park', 'hospital', 'bank', 'grocery']
          },
          description: 'Optional categories to filter by. If not provided, returns all categories.'
        }
      },
      required: ['lat', 'lng']
    }
  },
  {
    name: 'get_gis_layers',
    description: `Get GIS layer data for a bounding box or specific parcel.

LOCAL DATA (fast, stored in database):
- zoning_districts: 22,488 zoning polygons for Austin/Travis County
- parcels_boundaries: Parcel boundaries from Travis CAD
- floodplain: Austin floodplain data (gis_floodplain_austin)
- water_mains: Water CCN boundaries (gis_water_ccn)
- sewer_mains: Sewer CCN boundaries (gis_sewer_ccn)
- wetlands: CEF wetlands (gis_wetlands_cef)
- contours: Elevation contours (gis_contours_austin)
- cef_buffers: CEF biological buffers (gis_cef_buffers)
- water_districts: Water/wastewater districts (gis_water_districts)

NOT YET LOADED:
- fema_flood_zones: FEMA flood data (use floodplain instead)
- building_permits: Building permits (not yet imported)
- gas_mains: Gas infrastructure (not yet imported)

Returns GeoJSON FeatureCollection for local layers, or error message for unavailable layers.`,
    input_schema: {
      type: 'object',
      properties: {
        layer_id: {
          type: 'string',
          enum: [
            'zoning_districts',
            'parcels_boundaries',
            'floodplain',
            'water_mains',
            'sewer_mains',
            'wetlands',
            'contours',
            'cef_buffers',
            'water_districts',
            'fema_flood_zones',
            'building_permits',
            'gas_mains'
          ],
          description: 'The GIS layer to retrieve'
        },
        bbox: {
          type: 'array',
          items: { type: 'number' },
          minItems: 4,
          maxItems: 4,
          description: 'Bounding box [minLng, minLat, maxLng, maxLat] for spatial filtering'
        },
        parcel_id: {
          type: 'string',
          description: 'Get layers intersecting a specific parcel (alternative to bbox)'
        }
      },
      required: ['layer_id']
    }
  },
  {
    name: 'generate_artifact',
    description: 'Generate a downloadable artifact (report, analysis, comparison) for properties. Creates professional reports that users can view and download.',
    input_schema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['development_analysis', 'acquisition_report', 'property_comparison', 'market_analysis'],
          description: 'Type of artifact to generate'
        },
        parcel_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of parcel IDs to include in the artifact (max 10)',
          minItems: 1,
          maxItems: 10
        },
        title: {
          type: 'string',
          description: 'Optional title for the artifact'
        }
      },
      required: ['type', 'parcel_ids']
    }
  },
  {
    name: 'get_census_data',
    description: 'Get demographic data from the US Census Bureau for a location. Returns population, median income, median age, housing statistics, vacancy rates, and rent data for the census tract containing the given coordinates.',
    input_schema: {
      type: 'object',
      properties: {
        latitude: {
          type: 'number',
          description: 'Latitude of the location'
        },
        longitude: {
          type: 'number',
          description: 'Longitude of the location'
        }
      },
      required: ['latitude', 'longitude']
    }
  }
];

export { executeTool, getSchemaPromptSection };
export default TOOLS;
