// Test script for polygon query endpoint
const testPolygon = {
  geometry: {
    type: "Polygon",
    coordinates: [[
      [-97.78, 30.25],
      [-97.70, 30.25],
      [-97.70, 30.32],
      [-97.78, 30.32],
      [-97.78, 30.25]
    ]]
  },
  filters: {
    // minValue: 100000,
    // maxValue: 500000,
    // propertyType: "land",
    // isAbsentee: true
  },
  limit: 10
};

const API_URL = process.env.API_URL || 'http://localhost:3001';

async function testPolygonQuery() {
  console.log('=== Testing Polygon Query Endpoint ===\n');
  console.log('URL:', `${API_URL}/api/query/polygon`);
  console.log('Polygon:', JSON.stringify(testPolygon.geometry, null, 2));
  console.log('Filters:', JSON.stringify(testPolygon.filters, null, 2));
  console.log('Limit:', testPolygon.limit);
  console.log('\nSending request...\n');
  
  const startTime = Date.now();
  
  try {
    const response = await fetch(`${API_URL}/api/query/polygon`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(testPolygon)
    });
    
    const responseTime = Date.now() - startTime;
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Error Response:', response.status, response.statusText);
      console.error('Error body:', errorText);
      return;
    }
    
    const data = await response.json();
    
    console.log('✅ Success:', data.success);
    console.log('📊 Count:', data.count);
    console.log('⏱️  Response time:', responseTime, 'ms');
    console.log('\n📍 Polygon Info:');
    console.log('   Area:', data.polygon?.areaAcres, 'acres');
    console.log('   Centroid:', data.polygon?.centroid);
    
    if (data.properties && data.properties.length > 0) {
      console.log('\n🏠 Sample Properties:');
      data.properties.slice(0, 3).forEach((prop, i) => {
        console.log(`\n   ${i + 1}. Parcel ID: ${prop.parcelId}`);
        console.log(`      Address: ${prop.siteAddress || prop.address || 'N/A'}`);
        console.log(`      City: ${prop.siteCity || prop.city || 'N/A'}`);
        console.log(`      Acres: ${prop.acres || 'N/A'}`);
        console.log(`      Market Value: $${prop.mktValue?.toLocaleString() || 'N/A'}`);
        console.log(`      Motivation Score: ${prop.motivationScore || 'N/A'}`);
        console.log(`      Coords: [${prop.longitude}, ${prop.latitude}]`);
      });
    } else {
      console.log('\n⚠️  No properties found in polygon');
    }
    
    console.log('\n=== Test Complete ===');
    
  } catch (error) {
    console.error('❌ Request failed:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('   Make sure the server is running on', API_URL);
      console.error('   Start with: npm run dev');
    }
  }
}

testPolygonQuery();
