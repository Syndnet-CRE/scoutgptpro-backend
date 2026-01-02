-- Create table for zoning districts
CREATE TABLE IF NOT EXISTS zoning_districts (
  id SERIAL PRIMARY KEY,
  zoning_code VARCHAR(50),
  zoning_desc VARCHAR(255),
  overlay VARCHAR(50),
  geometry GEOMETRY(MultiPolygon, 4326),
  raw_attributes JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create spatial index
CREATE INDEX IF NOT EXISTS idx_zoning_districts_geom 
ON zoning_districts USING GIST(geometry);

-- Create index on zoning code
CREATE INDEX IF NOT EXISTS idx_zoning_districts_code 
ON zoning_districts(zoning_code);

-- Create index on overlay
CREATE INDEX IF NOT EXISTS idx_zoning_districts_overlay 
ON zoning_districts(overlay);

