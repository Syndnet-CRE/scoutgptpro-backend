// Test script for polygon search CRUD endpoints
const BASE_URL = process.env.API_URL || 'http://localhost:3001/api';

async function test() {
  console.log('=== Testing Polygon Search CRUD Endpoints ===\n');
  
  let createdId = null;
  
  try {
    // 1. CREATE - Create a polygon search
    console.log('1. Creating polygon search...');
    const createRes = await fetch(`${BASE_URL}/polygon-searches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Downtown Austin Test',
        description: 'Test search for downtown Austin area',
        polygonGeoJSON: {
          type: 'Polygon',
          coordinates: [[[-97.75, 30.26], [-97.73, 30.26], [-97.73, 30.28], [-97.75, 30.28], [-97.75, 30.26]]]
        },
        areaAcres: 245.5,
        centroidLat: 30.27,
        centroidLng: -97.74,
        messages: [
          { 
            role: 'user', 
            content: 'Show me vacant land', 
            timestamp: new Date().toISOString() 
          },
          { 
            role: 'assistant', 
            content: 'Found 15 vacant land properties in this area...', 
            timestamp: new Date().toISOString() 
          }
        ],
        filters: {
          isVacantLand: true,
          minAcres: 1.0
        }
      })
    });
    
    if (!createRes.ok) {
      const errorText = await createRes.text();
      throw new Error(`Create failed: ${createRes.status} - ${errorText}`);
    }
    
    const created = await createRes.json();
    console.log('✅ Created:', created.success);
    console.log('   ID:', created.search?.id);
    console.log('   Name:', created.search?.name);
    createdId = created.search?.id;
    
    // 2. LIST - List all searches
    console.log('\n2. Listing searches...');
    const listRes = await fetch(`${BASE_URL}/polygon-searches?limit=10`);
    const list = await listRes.json();
    console.log('✅ Listed:', list.success);
    console.log('   Found:', list.searches?.length, 'searches');
    if (list.searches && list.searches.length > 0) {
      console.log('   First search:', list.searches[0].name, '-', list.searches[0].messageCount, 'messages');
    }
    
    // 3. GET ONE - Get single search with full data
    if (createdId) {
      console.log('\n3. Getting single search...');
      const getRes = await fetch(`${BASE_URL}/polygon-searches/${createdId}`);
      const single = await getRes.json();
      console.log('✅ Retrieved:', single.success);
      console.log('   Name:', single.search?.name);
      console.log('   Messages:', single.search?.messages?.length);
      console.log('   Filters:', JSON.stringify(single.search?.filters));
      
      // 4. APPEND MESSAGES - Add new messages
      console.log('\n4. Appending messages...');
      const appendRes = await fetch(`${BASE_URL}/polygon-searches/${createdId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content: 'What about properties over $500k?',
              timestamp: new Date().toISOString()
            },
            {
              role: 'assistant',
              content: 'Found 8 properties over $500k in this area.',
              timestamp: new Date().toISOString()
            }
          ]
        })
      });
      const appended = await appendRes.json();
      console.log('✅ Appended:', appended.success);
      console.log('   Total messages:', appended.messageCount);
      
      // 5. UPDATE - Update search name and filters
      console.log('\n5. Updating search...');
      const updateRes = await fetch(`${BASE_URL}/polygon-searches/${createdId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Downtown Austin - Updated',
          filters: {
            isVacantLand: true,
            minAcres: 1.0,
            minValue: 500000
          }
        })
      });
      const updated = await updateRes.json();
      console.log('✅ Updated:', updated.success);
      console.log('   New name:', updated.search?.name);
      console.log('   New filters:', JSON.stringify(updated.search?.filters));
      
      // 6. DELETE - Delete the search
      console.log('\n6. Deleting search...');
      const delRes = await fetch(`${BASE_URL}/polygon-searches/${createdId}`, { 
        method: 'DELETE' 
      });
      const deleted = await delRes.json();
      console.log('✅ Deleted:', deleted.success);
      
      // Verify deletion
      console.log('\n7. Verifying deletion...');
      const verifyRes = await fetch(`${BASE_URL}/polygon-searches/${createdId}`);
      if (verifyRes.status === 404) {
        console.log('✅ Search successfully deleted (404 as expected)');
      } else {
        console.log('⚠️  Search still exists');
      }
    }
    
    console.log('\n=== All Tests Complete ===');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('   Make sure the server is running: npm run dev');
    }
  }
}

test();
