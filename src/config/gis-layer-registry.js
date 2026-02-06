// gis-layer-registry.js
// Single source of truth for all GIS layers.
// To add a new layer: add one entry to LAYER_REGISTRY.

const LAYER_REGISTRY = {
  zoning_districts: {
    id: 'zoning_districts',
    displayName: 'Zoning Districts',
    table: 'zoning_districts',
    geometryColumn: 'geometry',
    geometryType: 'MultiPolygon',
    srid: 4326,
    hasData: true,          // UPDATE THIS when data is imported
    category: 'zoning',
    style: {
      fillColor: '#3b82f6',
      fillOpacity: 0.3,
      strokeColor: '#1e40af',
      strokeWidth: 1.5
    },
    featureProperties: ['zoning_code', 'zoning_desc', 'overlay'],  // columns to include in GeoJSON properties
    maxFeatures: 5000,
    keywords: ['zoning', 'zoned', 'zone', 'land use', 'zoning district']
  },

  floodplain_austin: {
    id: 'floodplain_austin',
    displayName: 'Floodplain (Austin)',
    table: 'gis_floodplain_austin',
    geometryColumn: 'geometry',
    geometryType: 'MultiPolygon',
    srid: 4326,
    hasData: false,
    category: 'environmental',
    style: {
      fillColor: '#0ea5e9',
      fillOpacity: 0.35,
      strokeColor: '#0369a1',
      strokeWidth: 1
    },
    featureProperties: ['zone_code', 'zone_desc'],
    maxFeatures: 5000,
    keywords: ['flood', 'floodplain', 'flood zone', 'fema', 'flood risk']
  },

  sewer_ccn: {
    id: 'sewer_ccn',
    displayName: 'Sewer Service Areas (CCN)',
    table: 'gis_sewer_ccn',
    geometryColumn: 'geometry',
    geometryType: 'MultiPolygon',
    srid: 4326,
    hasData: true,
    category: 'utilities',
    style: {
      fillColor: '#a855f7',
      fillOpacity: 0.25,
      strokeColor: '#7e22ce',
      strokeWidth: 1
    },
    featureProperties: ['ccn_no', 'utility', 'county', 'type'],
    maxFeatures: 5000,
    keywords: ['sewer', 'wastewater', 'sewer service']
  },

  water_ccn: {
    id: 'water_ccn',
    displayName: 'Water Service Areas (CCN)',
    table: 'gis_water_ccn',
    geometryColumn: 'geometry',
    geometryType: 'MultiPolygon',
    srid: 4326,
    hasData: true,
    category: 'utilities',
    style: {
      fillColor: '#06b6d4',
      fillOpacity: 0.25,
      strokeColor: '#0891b2',
      strokeWidth: 1
    },
    featureProperties: ['ccn_no', 'utility', 'county', 'type'],
    maxFeatures: 5000,
    keywords: ['water', 'water service', 'water main', 'water district']
  },

  water_districts: {
    id: 'water_districts',
    displayName: 'Water/Wastewater Districts',
    table: 'gis_water_districts',
    geometryColumn: 'geometry',
    geometryType: 'MultiPolygon',
    srid: 4326,
    hasData: false,
    category: 'utilities',
    style: {
      fillColor: '#14b8a6',
      fillOpacity: 0.25,
      strokeColor: '#0d9488',
      strokeWidth: 1
    },
    featureProperties: [],
    maxFeatures: 5000,
    keywords: ['water district', 'utility district', 'mud', 'wcid']
  },

  wetlands_cef: {
    id: 'wetlands_cef',
    displayName: 'Wetlands (CEF)',
    table: 'gis_wetlands_cef',
    geometryColumn: 'geometry',
    geometryType: 'MultiPolygon',
    srid: 4326,
    hasData: false,
    category: 'environmental',
    style: {
      fillColor: '#22c55e',
      fillOpacity: 0.3,
      strokeColor: '#15803d',
      strokeWidth: 1
    },
    featureProperties: [],
    maxFeatures: 5000,
    keywords: ['wetland', 'wetlands', 'marsh', 'riparian']
  },

  cef_buffers: {
    id: 'cef_buffers',
    displayName: 'CEF Biological Buffers',
    table: 'gis_cef_buffers',
    geometryColumn: 'geometry',
    geometryType: 'MultiPolygon',
    srid: 4326,
    hasData: false,
    category: 'environmental',
    style: {
      fillColor: '#84cc16',
      fillOpacity: 0.25,
      strokeColor: '#65a30d',
      strokeWidth: 1
    },
    featureProperties: [],
    maxFeatures: 5000,
    keywords: ['cef', 'buffer', 'environmental buffer', 'critical environmental']
  },

  contours_austin: {
    id: 'contours_austin',
    displayName: 'Elevation Contours',
    table: 'gis_contours_austin',
    geometryColumn: 'geometry',
    geometryType: 'MultiLineString',
    srid: 4326,
    hasData: false,
    category: 'environmental',
    style: {
      strokeColor: '#78716c',
      strokeWidth: 0.8,
      strokeOpacity: 0.6
    },
    featureProperties: [],
    maxFeatures: 10000,
    keywords: ['contour', 'elevation', 'topography', 'terrain']
  },

  opportunity_zones: {
    id: 'opportunity_zones',
    displayName: 'Opportunity Zones',
    table: 'opportunity_zones',
    geometryColumn: 'geometry',
    geometryType: 'MultiPolygon',
    srid: 4326,
    hasData: true,           // 3 rows
    category: 'financial',
    style: {
      fillColor: '#f59e0b',
      fillOpacity: 0.3,
      strokeColor: '#d97706',
      strokeWidth: 2,
      strokeDasharray: [4, 2]
    },
    featureProperties: [],
    maxFeatures: 1000,
    keywords: ['opportunity zone', 'oz', 'qualified opportunity']
  },

  zip_boundaries: {
    id: 'zip_boundaries',
    displayName: 'ZIP Code Boundaries',
    table: 'zip_boundaries',
    geometryColumn: 'geom',   // NOTE: this table uses 'geom' not 'geometry'
    geometryType: 'MultiPolygon',
    srid: 4326,
    hasData: true,            // 1,989 rows
    category: 'boundaries',
    style: {
      fillColor: '#6366f1',
      fillOpacity: 0.1,
      strokeColor: '#4f46e5',
      strokeWidth: 1
    },
    featureProperties: ['zcta5'],
    maxFeatures: 2000,
    keywords: ['zip', 'zip code', 'zipcode', 'postal']
  }
};

export { LAYER_REGISTRY };