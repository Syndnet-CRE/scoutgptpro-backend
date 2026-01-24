// src/services/artifacts/generators/developmentAnalysis.js
// Development Analysis artifact generator combining all 4 data sources

import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { analyzeDevelopmentFeasibility } from '../../enrichment/orchestrator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(__dirname, '../../../../uploads/artifacts');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

/**
 * Format currency for display
 */
function formatCurrency(value) {
  if (value == null) return 'N/A';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
}

/**
 * Format number with commas
 */
function formatNumber(value, decimals = 2) {
  if (value == null) return 'N/A';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals
  }).format(value);
}

/**
 * Generate Development Analysis PDF
 */
async function generatePDF(analyses) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });

      const filename = `development_analysis_${Date.now()}.pdf`;
      const filePath = path.join(UPLOADS_DIR, filename);
      const writeStream = fs.createWriteStream(filePath);

      doc.pipe(writeStream);

      // Header
      doc.fontSize(24).font('Helvetica-Bold')
        .text('DEVELOPMENT ANALYSIS REPORT', { align: 'center' });
      doc.moveDown(0.5);

      doc.fontSize(10).font('Helvetica')
        .fillColor('#666666')
        .text(`Generated: ${new Date().toLocaleDateString()}`, { align: 'center' });
      doc.moveDown(0.5);
      doc.text(`Parcels Analyzed: ${analyses.length}`, { align: 'center' });
      doc.moveDown(2);

      // Process each analysis
      analyses.forEach((analysis, index) => {
        if (index > 0) {
          doc.addPage();
        }

        const prop = analysis.property;

        // Property Header
        doc.fontSize(16).font('Helvetica-Bold').fillColor('#000000')
          .text(`Property ${index + 1}: ${prop?.situs_address || prop?.parcel_id || 'Unknown'}`, {
            align: 'left'
          });
        doc.moveDown(0.5);
        doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke('#cccccc');
        doc.moveDown(1);

        // Property Details
        doc.fontSize(12).font('Helvetica-Bold')
          .text('PROPERTY DETAILS');
        doc.moveDown(0.3);

        doc.fontSize(10).font('Helvetica');
        const details = [
          ['Parcel ID', prop?.parcel_id || 'N/A'],
          ['Address', prop?.situs_address || 'N/A'],
          ['Owner', prop?.owner_name_raw || 'N/A'],
          ['Entity Type', prop?.owner_entity_type || 'N/A'],
          ['Asset Class', prop?.asset_class || 'N/A'],
          ['Acreage', prop?.acres_calc ? `${formatNumber(prop.acres_calc)} acres` : 'N/A'],
        ];

        details.forEach(([label, value]) => {
          doc.font('Helvetica-Bold').text(`${label}: `, { continued: true });
          doc.font('Helvetica').text(value);
        });

        doc.moveDown(1);

        // Zoning Analysis
        if (analysis.zoningAnalysis) {
          doc.fontSize(12).font('Helvetica-Bold')
            .text('ZONING ANALYSIS');
          doc.moveDown(0.3);

          doc.fontSize(10).font('Helvetica');
          doc.font('Helvetica-Bold').text('Current Zoning: ', { continued: true });
          doc.font('Helvetica').text(analysis.zoningAnalysis.currentZoning || 'N/A');

          if (analysis.zoningAnalysis.developmentPotential) {
            doc.font('Helvetica-Bold').text('Development Potential: ', { continued: true });
            doc.font('Helvetica').text(analysis.zoningAnalysis.developmentPotential || 'N/A');
          }

          if (analysis.zoningAnalysis.summary) {
            doc.moveDown(0.3);
            doc.font('Helvetica').text(analysis.zoningAnalysis.summary);
          }

          if (analysis.zoningAnalysis.constraints && analysis.zoningAnalysis.constraints.length > 0) {
            doc.moveDown(0.3);
            doc.font('Helvetica-Bold').text('Constraints:');
            analysis.zoningAnalysis.constraints.forEach(constraint => {
              doc.font('Helvetica').text(`  • ${constraint}`, { indent: 10 });
            });
          }

          doc.moveDown(1);
        }

        // Site Characteristics
        if (analysis.siteCharacteristics) {
          doc.fontSize(12).font('Helvetica-Bold')
            .text('SITE CHARACTERISTICS');
          doc.moveDown(0.3);

          doc.fontSize(10).font('Helvetica');
          const siteChars = [
            ['Acreage', analysis.siteCharacteristics.acres ? `${formatNumber(analysis.siteCharacteristics.acres)} acres` : 'N/A'],
            ['Flood Zone', analysis.siteCharacteristics.floodZone || 'N/A'],
            ['Current Use', analysis.siteCharacteristics.currentUse || 'N/A'],
            ['Improvements', analysis.siteCharacteristics.improvements || 'N/A'],
          ];

          siteChars.forEach(([label, value]) => {
            doc.font('Helvetica-Bold').text(`${label}: `, { continued: true });
            doc.font('Helvetica').text(value);
          });

          doc.moveDown(1);
        }

        // Location Analysis
        if (analysis.locationAnalysis) {
          doc.fontSize(12).font('Helvetica-Bold')
            .text('LOCATION ANALYSIS');
          doc.moveDown(0.3);

          doc.fontSize(10).font('Helvetica');
          doc.font('Helvetica-Bold').text('Nearby Retail: ', { continued: true });
          doc.font('Helvetica').text(`${analysis.locationAnalysis.nearbyRetail || 0} locations`);

          doc.font('Helvetica-Bold').text('Nearby Dining: ', { continued: true });
          doc.font('Helvetica').text(`${analysis.locationAnalysis.nearbyDining || 0} locations`);

          doc.font('Helvetica-Bold').text('Nearby Transit: ', { continued: true });
          doc.font('Helvetica').text(`${analysis.locationAnalysis.nearbyTransit || 0} locations`);

          doc.font('Helvetica-Bold').text('Walkability: ', { continued: true });
          doc.font('Helvetica').text(analysis.locationAnalysis.walkabilityIndicator || 'N/A');

          doc.moveDown(1);
        }

        // Valuation
        if (prop) {
          doc.fontSize(12).font('Helvetica-Bold')
            .text('VALUATION');
          doc.moveDown(0.3);

          doc.fontSize(10).font('Helvetica');
          const valuations = [
            ['Market Value', formatCurrency(prop.market_value)],
            ['Land Value', formatCurrency(prop.land_value)],
            ['Improvement Value', formatCurrency(prop.improvement_value)],
            ['Assessed Value', formatCurrency(prop.assessed_total_value)],
          ];

          valuations.forEach(([label, value]) => {
            doc.font('Helvetica-Bold').text(`${label}: `, { continued: true });
            doc.font('Helvetica').text(value);
          });

          doc.moveDown(1);
        }

        // Market Context
        if (analysis.marketContext && Object.keys(analysis.marketContext).length > 0) {
          doc.fontSize(12).font('Helvetica-Bold')
            .text('MARKET CONTEXT');
          doc.moveDown(0.3);

          doc.fontSize(10).font('Helvetica');
          if (analysis.marketContext.trends) {
            doc.font('Helvetica-Bold').text('Market Trends:');
            doc.font('Helvetica').text(analysis.marketContext.trends);
            doc.moveDown(0.3);
          }
          if (analysis.marketContext.news) {
            doc.font('Helvetica-Bold').text('Recent News:');
            doc.font('Helvetica').text(analysis.marketContext.news);
          }
          doc.moveDown(1);
        }

        // Recommendation
        if (analysis.recommendation) {
          doc.fontSize(12).font('Helvetica-Bold')
            .text('DEVELOPMENT RECOMMENDATION');
          doc.moveDown(0.3);

          doc.fontSize(11).font('Helvetica-Bold')
            .text(analysis.recommendation.summary || 'Further analysis recommended');
          doc.moveDown(0.5);

          if (analysis.recommendation.factors && analysis.recommendation.factors.length > 0) {
            doc.fontSize(10).font('Helvetica');
            analysis.recommendation.factors.forEach(factor => {
              doc.text(`  ${factor}`, { indent: 10 });
            });
          }
        }

        // Data Sources
        if (analysis.dataSources && analysis.dataSources.length > 0) {
          doc.moveDown(1);
          doc.fontSize(9).font('Helvetica').fillColor('#666666')
            .text(`Data Sources: ${analysis.dataSources.join(', ')}`);
          doc.fillColor('#000000');
        }
      });

      // Footer
      doc.moveDown(2);
      doc.fontSize(8).fillColor('#999999')
        .text('This analysis combines data from Database, GIS, OSM, and Web sources.', { align: 'center' })
        .text('ScoutGPT Pro - Commercial Real Estate Intelligence', { align: 'center' });

      doc.end();

      writeStream.on('finish', () => {
        const stats = fs.statSync(filePath);
        resolve({
          content: fs.readFileSync(filePath),
          format: 'pdf',
          filePath: `uploads/artifacts/${filename}`,
          fileSize: stats.size
        });
      });

      writeStream.on('error', reject);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Generate Development Analysis artifact
 * Combines all 4 data sources (Database, GIS, OSM, Web) into comprehensive report
 *
 * @param {Array} parcels - Array of parcel data objects
 * @param {object} options - Generation options
 * @returns {Promise<{ content: Buffer, format: string, metadata: object }>}
 */
export async function generateDevelopmentAnalysis(parcels, options = {}) {
  if (!parcels || parcels.length === 0) {
    throw new Error('No parcels provided for development analysis');
  }

  // Extract parcel IDs
  const parcelIds = parcels.map(p => p.parcel_id).filter(Boolean);

  if (parcelIds.length === 0) {
    throw new Error('No valid parcel IDs found in provided data');
  }

  // Analyze each parcel using the enrichment orchestrator
  // This combines all 4 sources: Database, GIS, OSM, Web
  const analyses = await Promise.all(
    parcelIds.map(id => analyzeDevelopmentFeasibility(id))
  );

  // Filter out any failed analyses
  const validAnalyses = analyses.filter(a => a && !a.error);

  if (validAnalyses.length === 0) {
    throw new Error('No valid analyses generated for provided parcels');
  }

  // Generate PDF
  const pdfResult = await generatePDF(validAnalyses);

  // Return structured data compatible with existing artifact system
  return {
    content: pdfResult.content,
    format: 'pdf',
    metadata: {
      type: 'development_analysis',
      parcelCount: validAnalyses.length,
      parcelIds: parcelIds,
      generatedAt: new Date().toISOString(),
      // Include structured data for potential React rendering
      structuredData: {
        analyses: validAnalyses,
        reactComponent: 'DevelopmentAnalysisArtifact'
      },
      // Include data sources used
      dataSources: ['database', 'gis', 'osm', 'web']
    }
  };
}

export default {
  generateDevelopmentAnalysis
};
