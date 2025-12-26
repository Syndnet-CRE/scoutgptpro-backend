import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { searchMapServers } from '../services/mapserver-service.js';
import { extractCategories } from '../services/category-mapper.js';
import { queryProperties, needsPropertyData } from '../services/property-service.js';
import { rateLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();
const anthropic = new Anthropic({ 
  apiKey: process.env.CLAUDE_API_KEY 
});

// POST /api/ai/query - Rate limited to 30 calls per 15 minutes
router.post('/query', rateLimiter({ max: 30, windowMs: 15 * 60 * 1000 }), async (req, res) => {
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
    let text = '';
    try {
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
      text = content.type === 'text' ? content.text : '';
    } catch (claudeError) {
      console.error('⚠️ Claude API error (continuing with property results):', claudeError.message);
      // Generate a basic message if Claude fails
      if (propertyResults.length > 0) {
        text = `I found ${propertyResults.length} properties matching your criteria. Here are the top results based on motivation scores.`;
      } else {
        text = 'I searched for properties but did not find any matching your criteria.';
      }
    }
    
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
  let prompt = `You are ScoutGPT, an AI-powered commercial real estate acquisition assistant. You help investors, developers, and brokers find and analyze properties.

Your role is to:
1. Analyze property data intelligently to find opportunities
2. Identify patterns that indicate motivated sellers or investment potential
3. Provide actionable insights for real estate professionals
4. Think like an experienced acquisition analyst

When analyzing properties, consider:
- Tax delinquency indicates financial distress (motivated seller)
- Absentee owners (mailing address ≠ property address) may be more willing to sell
- Vacant land with low tax values may be undervalued
- Long-term ownership without improvements suggests potential motivation
- Properties with multiple opportunity flags are higher priority targets

IMPORTANT: 
- Always reference specific properties from the data provided
- Rank properties by investment potential (motivation score)
- Highlight the BEST opportunities first
- Explain WHY each property is interesting
- Be specific with numbers (acres, tax values, scores)

`;

  if (mapData?.servers) {
    prompt += `\n\nAvailable GIS Data for this query:`;
    mapData.servers.forEach(server => {
      prompt += `\n- ${server.category}: ${server.features.length} features found`;
    });
  }

  switch (mode) {
    case 'scout':
      prompt += `\n\nMode: Scout - Help find investment opportunities based on user criteria. Focus on identifying motivated sellers and undervalued properties.`;
      break;
    case 'zoning':
      prompt += `\n\nMode: Zoning - Analyze zoning regulations, permitted uses, and development potential.`;
      break;
    case 'comps':
      prompt += `\n\nMode: Comps - Find comparable sales and market analysis.`;
      break;
    case 'site':
      prompt += `\n\nMode: Site Analysis - Evaluate site characteristics, utilities, and development feasibility.`;
      break;
  }

  if (propertyResults.length > 0) {
    prompt += `\n\nYou have access to ${propertyResults.length} properties matching the query. Analyze them and present the best opportunities.`;
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
  
  // Build property context for Claude
  if (propertyResults.length > 0) {
    prompt += `\n\n## PROPERTY DATA (${propertyResults.length} properties found)\n`;
    prompt += `Top opportunities ranked by motivation score:\n\n`;
    
    propertyResults.slice(0, 15).forEach((prop, i) => {
      prompt += `### ${i + 1}. ${prop.address}\n`;
      prompt += `- Owner: ${prop.owner}\n`;
      prompt += `- Type: ${prop.propertyType} | Acres: ${prop.acres || 'N/A'}\n`;
      prompt += `- Tax Value: $${(prop.taxValue || 0).toLocaleString()} | Market Value: $${(prop.marketValue || 0).toLocaleString()}\n`;
      prompt += `- Motivation Score: ${prop.motivationScore}/100\n`;
      if (prop.opportunityFlags && prop.opportunityFlags.length > 0) {
        prompt += `- Opportunity Flags: ${prop.opportunityFlags.join(', ')}\n`;
      }
      prompt += '\n';
    });
    
    if (propertyResults.length > 15) {
      prompt += `\n... and ${propertyResults.length - 15} more properties.\n`;
    }
    
    prompt += `\nProvide analysis highlighting the BEST opportunities and explain WHY they stand out.`;
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
