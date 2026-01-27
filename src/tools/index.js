// src/tools/index.js
// Tool definitions for Claude Anthropic API

import { executeTool } from './handlers.js';

export const TOOLS = [
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
              description: 'Property type: residential, commercial, land, industrial, mixed, unknown'
            },
            zoning_code: {
              type: 'string',
              description: 'Zoning code (e.g., "SF-3", "GR")'
            },
            is_vacant: {
              type: 'boolean',
              description: 'Filter for vacant land (asset_class contains "land" or "vacant")'
            },
            has_homestead: {
              type: 'boolean',
              description: 'Filter by homestead exemption status (true = owner-occupied, false = investment property)'
            },
            is_tax_delinquent: {
              type: 'boolean',
              description: 'Filter for tax delinquent properties'
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
    description: 'Get GIS layer data (zoning, flood zones, utilities, parcels, buildings, wetlands, permits) for a bounding box or specific parcel.',
    input_schema: {
      type: 'object',
      properties: {
        layer_id: {
          type: 'string',
          enum: [
            'zoning_districts',
            'flood_fema_zones',
            'sewer_mains',
            'water_mains',
            'parcels_boundaries',
            'building_footprints',
            'wetlands_boundaries',
            'permits_building'
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
  }
];

export { executeTool };
export default TOOLS;
