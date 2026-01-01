-- OSM Points of Interest for Travis County
CREATE TABLE IF NOT EXISTS osm_pois_travis (
  id SERIAL PRIMARY KEY,
  osm_id BIGINT UNIQUE NOT NULL,
  name TEXT,
  category TEXT NOT NULL,
  subcategory TEXT,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT DEFAULT 'TX',
  zip TEXT,
  phone TEXT,
  website TEXT,
  tags JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add PostGIS geometry column
ALTER TABLE osm_pois_travis ADD COLUMN IF NOT EXISTS geom GEOMETRY(Point, 4326);

-- Update geom from lat/lng
UPDATE osm_pois_travis SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326) WHERE geom IS NULL;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_osm_pois_travis_geom ON osm_pois_travis USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_osm_pois_travis_category ON osm_pois_travis(category, subcategory);
CREATE INDEX IF NOT EXISTS idx_osm_pois_travis_osm_id ON osm_pois_travis(osm_id);

