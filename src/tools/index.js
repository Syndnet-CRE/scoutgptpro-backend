// src/tools/index.js
// Tool definitions for Claude Anthropic API

import { executeTool } from './handlers.js';
import { getSchemaPromptSection } from '../services/query-orchestrator/index.js';

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
    name: 'execute_sql',
    description: `Execute a read-only SQL query against the ATTOM property database.

Use this for complex analytical queries beyond simple property search:
- Aggregations: average values by zip, cap rate distributions, permit volume
- Multi-table analysis: distress + loan + climate correlations
- Trend analysis: permit activity over time, foreclosure pipeline
- Comparisons: zip code vs zip code, market segment analysis
- Custom scoring: motivation signals, opportunity ranking
- Spatial analysis: properties near a point, within a polygon

AVAILABLE TABLES:

1. attom_assessor (444K rows) — PRIMARY property table
   PK: attom_id (BIGINT). Typed snake_case columns.
   Columns: address_full, address_city, address_zip, latitude, longitude,
   owner1_name, owner_type_desc, company_flag, owner_occupied,
   property_use_group, zoned_code_local,
   year_built, building_sqft, lot_acres, bedrooms_count, bath_count, units_count,
   market_value_total, market_value_land, market_value_improve,
   tax_billed_amount, tax_delinquent_year, homestead_exempt,
   last_sale_date, last_sale_price, apn_formatted

2. attom_parcels (428K) — Geometry. Join: apn = attom_assessor.apn_formatted
   Columns: geom (MultiPolygon SRID 4326), latitude, longitude, apn

3. attom_preforeclosure (46K) — Distress signals
   Join: attom_id → attom_assessor.attom_id. Typed snake_case.
   Columns: record_type, recording_date, default_amount, auction_date, lender_name

4. attom_loan_model (360K) — Loan positions
   Join: NULLIF(attomid,'')::bigint → attom_assessor.attom_id
   ALL TEXT UPPERCASE columns: "OPENLOAN1AMOUNT", "OPENLOAN1INTERESTRATE",
   "OPENLOAN2AMOUNT", "LTV", "AVAILABLEEQUITY", "LENDERNAMEFIRSTPOSITION"
   Cast numerics: NULLIF("OPENLOAN1AMOUNT",'')::numeric

5. attom_rental_avm (345K) — Rental estimates
   Join: NULLIF(attomid,'')::bigint → attom_assessor.attom_id
   ALL TEXT UPPERCASE: "ESTIMATEDRENTALVALUE", "AVMVALUE", "CONFIDENCESCORE"
   Cast: NULLIF("ESTIMATEDRENTALVALUE",'')::numeric

6. attom_climate_change_risk (416K) — Climate risk scores
   Join: NULLIF(attomid,'')::bigint → attom_assessor.attom_id
   ALL TEXT UPPERCASE: "HEATRISKSCORE", "STORMRISKSCORE", "WILDFIRERISKSCORE",
   "DROUGHTRISKSCORE", "FLOODRISKSCORE", "TOTALRISK"

7. attom_boundary_floodzones (411K) — FEMA flood zones
   Join: NULLIF(attomid,'')::bigint → attom_assessor.attom_id
   ALL TEXT UPPERCASE: "GEOID", "GEOTYPE"

8. attom_building_permit (3.1M) — Building permits
   Join: NULLIF(attomid,'')::bigint → attom_assessor.attom_id
   ALL TEXT UPPERCASE: "PERMITNUMBER", "STATUS", "DESCRIPTION", "TYPE", "JOBVALUE", "EFFECTIVEDATE"

9. attom_recorder (1.5M) — Transaction history
   Join: attomid::bigint → attom_assessor.attom_id
   ALL TEXT UPPERCASE: "DOCUMENTTYPE", "RECORDINGDATE", "TRANSFERAMOUNT", "MORTGAGE1AMOUNT"

CRITICAL SQL RULES:
- Tables 4-9 have ALL TEXT UPPERCASE column names. You MUST double-quote them: "OPENLOAN1AMOUNT"
- Cast text to numeric: NULLIF("OPENLOAN1AMOUNT",'')::numeric
- Join pattern for tables 4-8: NULLIF(t.attomid,'')::bigint = a.attom_id
- Join for table 9 (recorder): t.attomid::bigint = a.attom_id (attomid is already numeric text)
- Always include LIMIT
- SELECT only — no writes`,

    input_schema: {
      type: 'object',
      required: ['sql'],
      properties: {
        sql: {
          type: 'string',
          description: 'Read-only SQL query. Must include LIMIT. Must be SELECT/WITH/EXPLAIN only.'
        },
        description: {
          type: 'string',
          description: 'Brief description of what this query answers'
        }
      }
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
    description: `Get GIS layer data for map visualization. Available layers with data: zoning_districts (22,488 zoning polygons), opportunity_zones (3 zones), zip_boundaries (1,989 ZIP codes). Layers without data yet: floodplain_austin, sewer_ccn, water_ccn, water_districts, wetlands_cef, cef_buffers, contours_austin.`,
    input_schema: {
      type: 'object',
      properties: {
        layer_id: {
          type: 'string',
          enum: [
            'zoning_districts',
            'floodplain_austin',
            'sewer_ccn',
            'water_ccn',
            'water_districts',
            'wetlands_cef',
            'cef_buffers',
            'contours_austin',
            'opportunity_zones',
            'zip_boundaries'
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
        },
        action: {
          type: 'string',
          enum: ['show', 'hide'],
          description: 'Whether to show or hide the layer. Default: show',
          default: 'show'
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

export { executeTool, getSchemaPromptSection };
export default TOOLS;
