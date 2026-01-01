-- Add property_id column to link POIs to properties
ALTER TABLE osm_pois_travis ADD COLUMN IF NOT EXISTS property_id TEXT;

-- Create index for faster joins
CREATE INDEX IF NOT EXISTS idx_osm_pois_travis_property_id ON osm_pois_travis(property_id);

