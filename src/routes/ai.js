import express from 'express';
import Anthropic from '@anthropic-ai/sdk';

const router = express.Router();
const anthropic = new Anthropic({ 
  apiKey: process.env.CLAUDE_API_KEY 
});

// POST /api/ai/query
router.post('/query', async (req, res) => {
  try {
    const { mode, query, bounds, subject } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }
    
    console.log(`🤖 AI Query [${mode}]: "${query}"`);
    
    // Check if needs MapServer data
    const needsGIS = shouldFetchGIS(query, mode);
    
    let mapData = null;
    if (needsGIS) {
      console.log('📍 Fetching MapServer data...');
      
      try {
        const baseUrl = process.env.BACKEND_URL || 'http://localhost:3001';
        const mapResponse = await fetch(`${baseUrl}/api/mapservers/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            query, 
            bounds, 
            maxResults: 10 
          })
        });
        
        if (mapResponse.ok) {
          mapData = await mapResponse.json();
          console.log(`✅ Got ${mapData.servers?.length || 0} MapServers`);
        }
      } catch (error) {
        console.warn('⚠️ MapServer fetch failed:', error.message);
      }
    }
    
    // Build prompts
    const systemPrompt = buildSystemPrompt(mode, mapData);
    const userPrompt = buildUserPrompt(query, subject, mapData);
    
    // Call Claude
    console.log('🧠 Calling Claude API...');
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ 
        role: 'user', 
        content: userPrompt 
      }]
    });
    
    const content = response.content[0];
    const text = content.type === 'text' ? content.text : '';
    
    // Build response
    const result = {
      messages: [{ 
        role: 'assistant', 
        text 
      }],
      overlays: [],
      pins: [],
      insights: []
    };
    
    // Add MapServer overlays
    if (mapData?.servers) {
      mapData.servers.forEach(server => {
        if (server.features.length > 0) {
          result.overlays.push({
            id: server.serverId,
            type: 'geojson',
            name: server.category,
            data: {
              type: 'FeatureCollection',
              features: server.features
            },
            style: getStyleForCategory(server.category),
            visible: true
          });
        }
      });
    }
    
    console.log(`✅ Response ready (${result.overlays.length} overlays)`);
    res.json(result);
    
  } catch (error) {
    console.error('❌ AI query error:', error);
    res.status(500).json({ 
      error: 'AI query failed',
      message: error.message 
    });
  }
});

function shouldFetchGIS(query, mode) {
  if (mode === 'zoning') return true;
  
  const gisKeywords = [
    'sewer', 'utility', 'utilities', 'flood', 'floodplain',
    'zoning', 'parcel', 'permit', 'water', 'wastewater',
    'infrastructure', 'easement', 'right of way'
  ];
  
  return gisKeywords.some(kw => query.toLowerCase().includes(kw));
}

function buildSystemPrompt(mode, mapData) {
  let prompt = `You are ScoutGPT, an AI assistant for commercial real estate analysis. You have access to comprehensive GIS data from 948+ ArcGIS MapServers covering Texas markets.`;
  
  if (mapData?.servers) {
    prompt += `\n\nAvailable GIS Data for this query:`;
    mapData.servers.forEach(server => {
      prompt += `\n- ${server.category}: ${server.features.length} features found`;
    });
  }
  
  switch (mode) {
    case 'scout':
      prompt += `\n\nMode: Scout - Provide general property intelligence and opportunities.`;
      break;
    case 'zoning':
      prompt += `\n\nMode: Zoning-GIS - Focus on due diligence, zoning, utilities, and regulatory analysis.`;
      break;
    case 'comps':
      prompt += `\n\nMode: Comps - Analyze comparable properties and valuations.`;
      break;
    case 'site':
      prompt += `\n\nMode: Site Analysis - Evaluate highest and best use and development potential.`;
      break;
  }
  
  return prompt;
}

function buildUserPrompt(query, subject, mapData) {
  let prompt = query;
  
  if (subject) {
    prompt += `\n\nSubject Property:`;
    if (subject.address) prompt += `\nAddress: ${subject.address}`;
    if (subject.lat && subject.lng) {
      prompt += `\nCoordinates: ${subject.lat}, ${subject.lng}`;
    }
  }
  
  if (mapData?.servers) {
    prompt += `\n\nGIS Data Found:`;
    mapData.servers.forEach(server => {
      if (server.features.length > 0) {
        prompt += `\n\n${server.category}:`;
        prompt += `\n- ${server.features.length} features`;
        
        // Include sample data
        const sample = server.features[0];
        if (sample.properties) {
          const props = Object.entries(sample.properties).slice(0, 3);
          prompt += `\n- Sample attributes: ${props.map(([k, v]) => `${k}=${v}`).join(', ')}`;
        }
      }
    });
  }
  
  return prompt;
}

function getStyleForCategory(category) {
  const styles = {
    'Sewer Utilities': { 
      'line-color': '#8B4513', 
      'line-width': 2 
    },
    'Floodplain': { 
      'fill-color': '#4682B4', 
      'fill-opacity': 0.4,
      'line-color': '#1E90FF',
      'line-width': 1
    },
    'Zoning': { 
      'fill-color': '#FFD700', 
      'fill-opacity': 0.3,
      'line-color': '#FFA500',
      'line-width': 2
    },
    'Water Utilities': {
      'line-color': '#1E90FF',
      'line-width': 2
    },
    'Parcels': {
      'fill-color': '#90EE90',
      'fill-opacity': 0.2,
      'line-color': '#228B22',
      'line-width': 1
    }
  };
  
  return styles[category] || { 
    'line-color': '#888888', 
    'line-width': 1 
  };
}

export default router;
