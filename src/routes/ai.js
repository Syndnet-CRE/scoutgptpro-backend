import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { searchMapServers } from '../services/mapserver-service.js';
import { extractCategories } from '../services/category-mapper.js';
import { queryProperties, needsPropertyData } from '../services/property-service.js';

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
        // Extract relevant categories from query
        const categories = extractCategories(query);
        
        // Call service with category filter
        mapData = await searchMapServers({ 
          query, 
          bounds,
          categories: categories.length > 0 ? categories : undefined,
          maxResults: 10 
        });
        
        console.log(`✅ Got ${mapData.servers?.length || 0} MapServers with data`);
      } catch (error) {
        console.error('❌ MapServer search failed:');
        console.error('   Error:', error.message);
        console.error('   Stack:', error.stack);
      }
    }
    
    // Query properties if needed
    let propertyResults = [];
    if (needsPropertyData(query, mode)) {
      try {
        console.log('🏠 Querying properties...');
        propertyResults = await queryProperties({
          bounds: bounds ? {
            north: bounds.north,
            south: bounds.south,
            east: bounds.east,
            west: bounds.west
          } : null,
          query,
          mode,
          limit: 100  // Get more, we'll paginate on frontend
        });
        console.log(`✅ Property query returned ${propertyResults.length} results`);
      } catch (error) {
        console.error('❌ Property query failed:', error);
      }
    }
    
    // Build prompts
    const systemPrompt = buildSystemPrompt(mode, mapData, propertyResults);
    const userPrompt = buildUserPrompt(query, subject, mapData, propertyResults);
    
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
      properties: propertyResults.slice(0, 25),  // First 25 for initial load
      totalCount: propertyResults.length,
      overlays: [],
      pins: propertyResults.slice(0, 25).map(prop => ({
        id: prop.id,
        lat: prop.lat,
        lng: prop.lng,
        address: prop.address,
        propertyType: prop.propertyType,
        motivationScore: prop.motivationScore
      })),
      insights: propertyResults.length > 0 ? [
        `Found ${propertyResults.length} properties`,
        `Average motivation score: ${propertyResults.length > 0 ? Math.round(propertyResults.reduce((a, b) => a + b.motivationScore, 0) / propertyResults.length) : 0}`,
        `Property types: ${[...new Set(propertyResults.map(p => p.propertyType))].join(', ')}`
      ] : []
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
    
    console.log(`✅ Response ready (${result.overlays.length} overlays, ${result.properties.length} properties)`);
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

function buildSystemPrompt(mode, mapData, propertyResults = []) {
  let prompt = `You are ScoutGPT, an AI assistant for commercial real estate analysis. You have access to comprehensive GIS data from 948+ ArcGIS MapServers covering Texas markets.`;
  
  if (mapData?.servers) {
    prompt += `\n\nAvailable GIS Data for this query:`;
    mapData.servers.forEach(server => {
      prompt += `\n- ${server.category}: ${server.features.length} features found`;
    });
  }
  
  if (propertyResults.length > 0) {
    prompt += `\n\nProperty Data: I found ${propertyResults.length} properties matching the query criteria.`;
  }
  
  switch (mode) {
    case 'scout':
      prompt += `\n\nMode: Scout - Provide general property intelligence and opportunities. Highlight the most promising properties based on motivation scores and opportunity flags.`;
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

function buildUserPrompt(query, subject, mapData, propertyResults = []) {
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
  
  // Add property context
  if (propertyResults.length > 0) {
    prompt += `\n\nI found ${propertyResults.length} properties matching your query. Here are the top results:\n`;
    propertyResults.slice(0, 10).forEach((prop, i) => {
      prompt += `\n${i + 1}. ${prop.address}`;
      prompt += `\n   - Type: ${prop.propertyType}, Acres: ${prop.acres}`;
      prompt += `\n   - Tax Value: $${prop.taxValue?.toLocaleString() || 'N/A'}, Market Value: $${prop.marketValue?.toLocaleString() || 'N/A'}`;
      prompt += `\n   - Motivation Score: ${prop.motivationScore}/100`;
      if (prop.opportunityFlags.length > 0) {
        prompt += `\n   - Flags: ${prop.opportunityFlags.join(', ')}`;
      }
    });
    prompt += `\n\nPlease summarize these findings for the user, highlighting the most promising opportunities based on motivation scores and opportunity flags.`;
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
