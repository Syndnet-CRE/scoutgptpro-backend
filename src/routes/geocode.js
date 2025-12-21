import express from 'express';

const router = express.Router();

// GET /api/geocode/reverse?lat=30.27&lng=-97.74
router.get('/geocode/reverse', async (req, res) => {
  try {
    const { lat, lng } = req.query;
    
    if (!lat || !lng) {
      return res.status(400).json({ 
        success: false, 
        error: 'lat and lng query parameters required' 
      });
    }
    
    // Validate coordinates
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    
    if (isNaN(latNum) || isNaN(lngNum)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid coordinates. lat and lng must be valid numbers.' 
      });
    }
    
    if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
      return res.status(400).json({ 
        success: false, 
        error: 'Coordinates out of range. lat must be -90 to 90, lng must be -180 to 180.' 
      });
    }
    
    // Call Nominatim reverse geocoding API
    // Note: Nominatim requires a User-Agent header and has rate limits
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${latNum}&lon=${lngNum}&format=json&zoom=14&addressdetails=1`,
      {
        headers: {
          'User-Agent': 'ScoutGPT/1.0 (contact@scoutgpt.com)' // Required by Nominatim
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`Nominatim API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Extract useful location parts
    const address = data.address || {};
    
    // Build a short, useful name (prefer neighborhood > suburb > city)
    const locationName = 
      address.neighbourhood ||
      address.suburb ||
      address.city_district ||
      address.town ||
      address.city ||
      address.county ||
      'Unknown Area';
    
    // Build full display name
    const displayName = [
      address.neighbourhood || address.suburb,
      address.city || address.town,
      address.state
    ].filter(Boolean).join(', ');
    
    res.json({
      success: true,
      locationName,        // Short name: "Downtown", "South Austin"
      displayName,         // Full name: "Downtown, Austin, Texas"
      address: {
        neighbourhood: address.neighbourhood,
        suburb: address.suburb,
        city: address.city || address.town,
        county: address.county,
        state: address.state,
        postcode: address.postcode
      },
      coordinates: { lat: latNum, lng: lngNum }
    });
    
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

export default router;
