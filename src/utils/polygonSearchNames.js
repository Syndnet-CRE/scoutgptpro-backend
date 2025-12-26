/**
 * Generate a name for a polygon search based on location and area
 * @param {string} locationName - Location name from reverse geocoding (e.g., "Downtown", "South Austin")
 * @param {number} areaAcres - Area in acres (optional)
 * @returns {string} Generated name like "Downtown - 245.5 acres" or "Downtown"
 */
export function generatePolygonSearchName(locationName, areaAcres) {
  if (!locationName) {
    return areaAcres && areaAcres > 0 
      ? `Search - ${areaAcres.toFixed(1)} acres`
      : 'Untitled Search';
  }
  
  if (areaAcres && areaAcres > 0) {
    return `${locationName} - ${areaAcres.toFixed(1)} acres`;
  }
  
  return locationName;
}

/**
 * Generate a name from coordinates and area (requires reverse geocoding call)
 * This is a convenience function that can be used when you have coordinates
 * but need to fetch the location name first
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} areaAcres - Area in acres (optional)
 * @returns {Promise<string>} Generated name
 */
export async function generatePolygonSearchNameFromCoords(lat, lng, areaAcres) {
  try {
    const response = await fetch(
      `http://localhost:${process.env.PORT || 3001}/api/geocode/reverse?lat=${lat}&lng=${lng}`
    );
    
    if (!response.ok) {
      throw new Error('Reverse geocoding failed');
    }
    
    const data = await response.json();
    return generatePolygonSearchName(data.locationName, areaAcres);
  } catch (error) {
    console.error('Error generating name from coordinates:', error);
    return generatePolygonSearchName(null, areaAcres);
  }
}




