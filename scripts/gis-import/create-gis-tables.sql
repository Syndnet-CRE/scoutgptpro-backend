-- GIS Layer Import Tables
-- Run with: psql $DATABASE_URL -f scripts/gis-import/create-gis-tables.sql

-- Water CCN
CREATE TABLE IF NOT EXISTS gis_water_ccn (
  id SERIAL PRIMARY KEY,
  ccn_no VARCHAR(20),
  utility VARCHAR(255),
  county VARCHAR(100),
  type VARCHAR(50),
  geometry GEOMETRY(MultiPolygon, 4326),
  raw_attributes JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gis_water_ccn_geom ON gis_water_ccn USING GIST(geometry);
CREATE INDEX IF NOT EXISTS idx_gis_water_ccn_ccn ON gis_water_ccn(ccn_no);

-- Sewer CCN
CREATE TABLE IF NOT EXISTS gis_sewer_ccn (
  id SERIAL PRIMARY KEY,
  ccn_no VARCHAR(20),
  utility VARCHAR(255),
  county VARCHAR(100),
  type VARCHAR(50),
  geometry GEOMETRY(MultiPolygon, 4326),
  raw_attributes JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gis_sewer_ccn_geom ON gis_sewer_ccn USING GIST(geometry);
CREATE INDEX IF NOT EXISTS idx_gis_sewer_ccn_ccn ON gis_sewer_ccn(ccn_no);

-- Water/WW Districts
CREATE TABLE IF NOT EXISTS gis_water_districts (
  id SERIAL PRIMARY KEY,
  district_name VARCHAR(255),
  district_type VARCHAR(100),
  geometry GEOMETRY(MultiPolygon, 4326),
  raw_attributes JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gis_water_districts_geom ON gis_water_districts USING GIST(geometry);

-- Floodplain (City of Austin - supplements FEMA)
CREATE TABLE IF NOT EXISTS gis_floodplain_austin (
  id SERIAL PRIMARY KEY,
  zone_code VARCHAR(20),
  zone_desc VARCHAR(255),
  geometry GEOMETRY(MultiPolygon, 4326),
  raw_attributes JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gis_floodplain_austin_geom ON gis_floodplain_austin USING GIST(geometry);
CREATE INDEX IF NOT EXISTS idx_gis_floodplain_austin_zone ON gis_floodplain_austin(zone_code);

-- Wetlands (CEF)
CREATE TABLE IF NOT EXISTS gis_wetlands_cef (
  id SERIAL PRIMARY KEY,
  wetland_type VARCHAR(100),
  geometry GEOMETRY(MultiPolygon, 4326),
  raw_attributes JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gis_wetlands_cef_geom ON gis_wetlands_cef USING GIST(geometry);

-- CEF Buffers
CREATE TABLE IF NOT EXISTS gis_cef_buffers (
  id SERIAL PRIMARY KEY,
  buffer_type VARCHAR(100),
  buffer_distance INT,
  geometry GEOMETRY(MultiPolygon, 4326),
  raw_attributes JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gis_cef_buffers_geom ON gis_cef_buffers USING GIST(geometry);

-- Contours (may be large - lines not polygons)
CREATE TABLE IF NOT EXISTS gis_contours_austin (
  id SERIAL PRIMARY KEY,
  elevation NUMERIC(10,2),
  contour_type VARCHAR(20),
  geometry GEOMETRY(MultiLineString, 4326),
  raw_attributes JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gis_contours_austin_geom ON gis_contours_austin USING GIST(geometry);
CREATE INDEX IF NOT EXISTS idx_gis_contours_austin_elev ON gis_contours_austin(elevation);

-- Verify tables created
SELECT 
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public' 
  AND table_name LIKE 'gis_%'
ORDER BY table_name;
