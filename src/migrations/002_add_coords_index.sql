-- Add spatial index for coordinate-based property lookups
-- Created: Feb 8, 2026 for coordinate-based property lookup endpoint

CREATE INDEX IF NOT EXISTS idx_attom_assessor_coords
ON attom_assessor (latitude, longitude)
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- This index optimizes the ORDER BY clause in getPropertyCardByCoords
-- For coordinate-based nearest neighbor queries on the 444K+ properties