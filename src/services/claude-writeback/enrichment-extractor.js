/**
 * Enrichment Extractor
 * Extracts valuable insights from tool results for storage
 */

/**
 * Extract enrichments from tool execution results
 * @param {string} toolName - Name of the tool
 * @param {Object} toolInput - Input passed to the tool
 * @param {Object} toolResult - Result from the tool
 * @returns {Array<Object>} Array of enrichments to store
 */
export function extractEnrichments(toolName, toolInput, toolResult) {
  const enrichments = [];

  switch (toolName) {
    case 'analyze_property': {
      const parcelIds = toolInput.parcel_ids || [];
      if (toolResult.analyses && Array.isArray(toolResult.analyses)) {
        for (const analysis of toolResult.analyses) {
          if (analysis.parcel_id && analysis.recommendation) {
            enrichments.push({
              parcelId: analysis.parcel_id,
              enrichmentType: 'development_analysis',
              enrichmentData: {
                constraints: analysis.constraints,
                recommendations: analysis.recommendation,
                feasibility_score: analysis.feasibility_score
              },
              confidenceScore: 0.85,
              sourceTool: toolName
            });
          }
        }
      }
      break;
    }

    case 'get_property': {
      if (toolResult.parcel_id && toolInput.parcel_id) {
        // Store any calculated fields or derived insights
        if (toolResult.distress_indicators) {
          enrichments.push({
            parcelId: toolInput.parcel_id,
            enrichmentType: 'distress_analysis',
            enrichmentData: toolResult.distress_indicators,
            confidenceScore: 0.90,
            sourceTool: toolName
          });
        }
      }
      break;
    }

    case 'web_search': {
      if (toolResult.results && toolInput.location) {
        enrichments.push({
          parcelId: `location:${toolInput.location}`,
          enrichmentType: 'market_insight',
          enrichmentData: {
            query: toolInput.query,
            search_type: toolInput.search_type,
            top_results: (toolResult.results || []).slice(0, 5).map(r => ({
              title: r.title,
              url: r.url,
              snippet: r.snippet
            })),
            searched_at: new Date().toISOString()
          },
          confidenceScore: 0.70,
          sourceTool: toolName
        });
      }
      break;
    }

    case 'get_gis_layers': {
      if (toolResult.features && toolInput.parcel_id) {
        enrichments.push({
          parcelId: toolInput.parcel_id,
          enrichmentType: `gis_${toolInput.layer_id}`,
          enrichmentData: {
            layer_id: toolInput.layer_id,
            feature_count: toolResult.features.length,
            features: toolResult.features.slice(0, 10) // Store up to 10 features
          },
          confidenceScore: 0.95,
          sourceTool: toolName
        });
      }
      break;
    }

    case 'get_osm_nearby': {
      if (toolResult.pois && toolInput.lat && toolInput.lng) {
        enrichments.push({
          parcelId: `coords:${toolInput.lat},${toolInput.lng}`,
          enrichmentType: 'nearby_pois',
          enrichmentData: {
            radius_meters: toolInput.radius_meters,
            categories: toolInput.categories,
            poi_count: toolResult.pois.length,
            pois: toolResult.pois.slice(0, 20) // Store up to 20 POIs
          },
          confidenceScore: 0.95,
          sourceTool: toolName
        });
      }
      break;
    }
  }

  return enrichments;
}

export default { extractEnrichments };
