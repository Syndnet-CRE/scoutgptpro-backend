// src/services/artifacts/generators/acquisitionReport.js
// Professional Acquisition Report Generator (Oak Meadow quality)

import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getDemographicsForLocation } from '../../census/index.js';
import { analyzeDevelopmentFeasibility } from '../../enrichment/orchestrator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Brand colors
const COLORS = {
  primary: '#1a365d',    // Dark blue
  secondary: '#2d5a3d',  // Forest green
  accent: '#c53030',     // Red
  text: '#1a202c',       // Dark gray
  lightGray: '#e2e8f0',
  mediumGray: '#cbd5e0',
  darkGray: '#718096'
};

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(__dirname, '../../../../uploads/artifacts');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

/**
 * Format currency for display
 */
function formatCurrency(value) {
  if (value == null || value === undefined) return 'N/A';
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
  if (value == null || value === undefined) return 'N/A';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals
  }).format(value);
}

/**
 * Format percentage
 */
function formatPercent(value, decimals = 1) {
  if (value == null || value === undefined) return 'N/A';
  return `${Number(value).toFixed(decimals)}%`;
}

/**
 * Add section header
 */
function addSectionHeader(doc, title) {
  doc.moveDown(1);
  doc.fontSize(16).font('Helvetica-Bold').fillColor(COLORS.primary)
    .text(title.toUpperCase(), { align: 'left' });
  doc.moveDown(0.3);
  doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke(COLORS.primary);
  doc.moveDown(0.5);
  doc.fillColor(COLORS.text);
}

/**
 * Add subsection header
 */
function addSubsectionHeader(doc, title) {
  doc.moveDown(0.8);
  doc.fontSize(12).font('Helvetica-Bold').fillColor(COLORS.secondary)
    .text(title);
  doc.moveDown(0.3);
  doc.fillColor(COLORS.text);
}

/**
 * Add details table (key-value pairs)
 */
function addDetailsTable(doc, rows, options = {}) {
  const { fontSize = 10, labelWidth = 150 } = options;
  
  doc.fontSize(fontSize);
  rows.forEach(([label, value]) => {
    const startY = doc.y;
    doc.font('Helvetica-Bold').text(label + ':', { width: labelWidth, continued: true });
    doc.font('Helvetica').text(value || 'N/A', { width: 362 - labelWidth });
    
    // Add spacing between rows
    if (doc.y === startY) {
      doc.moveDown(0.3);
    }
  });
}

/**
 * Draw recommendation badge
 */
function drawRecommendationBadge(doc, recommendation, x, y) {
  const badgeWidth = 120;
  const badgeHeight = 40;
  const isProceed = recommendation.toLowerCase().includes('proceed') || 
                    recommendation.toLowerCase().includes('recommend');
  
  const bgColor = isProceed ? COLORS.secondary : COLORS.accent;
  const textColor = '#ffffff';
  
  // Draw badge background
  doc.rect(x, y, badgeWidth, badgeHeight)
    .fill(bgColor);
  
  // Draw badge text
  doc.fontSize(10).font('Helvetica-Bold')
    .fillColor(textColor)
    .text('RECOMMENDATION', x + 10, y + 8, { width: badgeWidth - 20, align: 'center' });
  
  doc.fontSize(12)
    .text(recommendation.toUpperCase(), x + 10, y + 22, { 
      width: badgeWidth - 20, 
      align: 'center' 
    });
  
  doc.fillColor(COLORS.text);
}

/**
 * Generate Investment Recommendation
 */
function generateInvestmentRecommendation(doc, property, analysis) {
  addSectionHeader(doc, 'Investment Recommendation');
  
  // Calculate recommendation based on analysis
  let recommendation = 'PASS';
  let rationale = '';
  const highlights = [];
  
  // Analyze factors
  const factors = {
    zoning: analysis?.zoningAnalysis?.developmentPotential || '',
    flood: analysis?.siteCharacteristics?.floodZone || '',
    value: property.market_value || 0,
    acres: property.acres_calc || 0,
    vacant: analysis?.siteCharacteristics?.improvements === 'Vacant/Unimproved',
    walkability: analysis?.locationAnalysis?.walkabilityIndicator || ''
  };
  
  // Determine recommendation
  if (factors.zoning?.includes('high') && 
      factors.flood !== 'A' && factors.flood !== 'AE' && 
      factors.vacant && 
      factors.walkability === 'High') {
    recommendation = 'PROCEED';
    rationale = 'Strong development candidate with favorable zoning, no flood risk, vacant land, and excellent walkability.';
  } else if (factors.zoning?.includes('high') && factors.vacant) {
    recommendation = 'PROCEED WITH CONDITIONS';
    rationale = 'Good development potential but requires further due diligence on flood zone and market conditions.';
  } else {
    rationale = 'Property requires significant analysis before proceeding. Consider alternative opportunities.';
  }
  
  // Build highlights
  if (factors.acres > 0) {
    highlights.push(`${formatNumber(factors.acres)} acres`);
  }
  if (factors.value > 0) {
    highlights.push(`Market Value: ${formatCurrency(factors.value)}`);
  }
  if (factors.vacant) {
    highlights.push('Vacant land - no demolition required');
  }
  if (factors.walkability === 'High') {
    highlights.push('High walkability score');
  }
  
  // Draw recommendation badge
  const badgeX = 50;
  const badgeY = doc.y;
  drawRecommendationBadge(doc, recommendation, badgeX, badgeY);
  doc.y = badgeY + 50;
  
  // Executive Summary
  addSubsectionHeader(doc, 'Executive Summary');
  doc.fontSize(10).font('Helvetica')
    .text(rationale, { align: 'justify' });
  
  // Key Highlights
  if (highlights.length > 0) {
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica-Bold')
      .text('Key Highlights:');
    doc.fontSize(10).font('Helvetica');
    highlights.forEach(highlight => {
      doc.text(`  • ${highlight}`, { indent: 10 });
    });
  }
}

/**
 * Generate Property Overview
 */
function generatePropertyOverview(doc, property) {
  addSectionHeader(doc, 'Property Overview');
  
  const overviewRows = [
    ['Property Address', property.situs_address || property.address || 'N/A'],
    ['Parcel ID', property.parcel_id || 'N/A'],
    ['Property Type', property.asset_class || 'N/A'],
    ['Total Acreage', property.acres_calc ? `${formatNumber(property.acres_calc)} acres` : 'N/A'],
    ['Zoning Code', property.zoning_code || 'N/A'],
    ['Current Owner', property.owner_name_raw || property.owner || 'N/A'],
    ['Owner Type', property.owner_entity_type || 'N/A'],
    ['Year Built', property.year_built || 'N/A'],
    ['Building Square Feet', property.building_sqft ? formatNumber(property.building_sqft, 0) : 'N/A']
  ];
  
  addDetailsTable(doc, overviewRows);
}

/**
 * Generate Financial Analysis
 */
function generateFinancialAnalysis(doc, property, analysis) {
  addSectionHeader(doc, 'Financial Analysis');
  
  // Valuation Table
  addSubsectionHeader(doc, 'Valuation');
  const valuationRows = [
    ['Market Value', formatCurrency(property.market_value)],
    ['Land Value', formatCurrency(property.land_value)],
    ['Improvement Value', formatCurrency(property.improvement_value)],
    ['Assessed Total Value', formatCurrency(property.assessed_total_value)]
  ];
  
  addDetailsTable(doc, valuationRows);
  
  // Calculate price per acre
  if (property.acres_calc && property.market_value) {
    const pricePerAcre = property.market_value / property.acres_calc;
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica-Bold')
      .text('Price per Acre: ', { continued: true });
    doc.font('Helvetica').text(formatCurrency(pricePerAcre));
  }
  
  // Pro Forma (if available)
  if (analysis?.financialProjections) {
    addSubsectionHeader(doc, 'Pro Forma Analysis');
    doc.fontSize(10).font('Helvetica')
      .text('Pro forma analysis would be included here if rental income data is available.');
  }
  
  // Cap Rate & IRR (placeholder - would need income data)
  doc.moveDown(0.5);
  doc.fontSize(10).font('Helvetica')
    .fillColor(COLORS.darkGray)
    .text('Note: Cap rate and IRR calculations require rental income data.', { italic: true });
  doc.fillColor(COLORS.text);
}

/**
 * Generate Market Analysis
 */
function generateMarketAnalysis(doc, demographics) {
  addSectionHeader(doc, 'Market Analysis');
  
  if (!demographics || !demographics.demographics) {
    doc.fontSize(10).font('Helvetica')
      .fillColor(COLORS.darkGray)
      .text('Demographic data not available for this location.');
    doc.fillColor(COLORS.text);
    return;
  }
  
  const demo = demographics.demographics;
  
  addSubsectionHeader(doc, 'Demographics (Census ACS 5-Year Estimates)');
  
  const demoRows = [
    ['Total Population', formatNumber(demo.total_population, 0)],
    ['Median Household Income', formatCurrency(demo.median_household_income)],
    ['Median Age', formatNumber(demo.median_age, 1)],
    ['Total Housing Units', formatNumber(demo.total_housing_units, 0)],
    ['Occupied Housing Units', formatNumber(demo.occupied_housing_units, 0)],
    ['Vacant Housing Units', formatNumber(demo.vacant_housing_units, 0)],
    ['Vacancy Rate', demo.vacancy_rate ? formatPercent(demo.vacancy_rate) : 'N/A'],
    ['Owner Occupied Units', formatNumber(demo.owner_occupied_units, 0)],
    ['Renter Occupied Units', formatNumber(demo.renter_occupied_units, 0)],
    ['Owner Occupancy Rate', demo.owner_occupancy_rate ? formatPercent(demo.owner_occupancy_rate) : 'N/A'],
    ['Median Home Value', formatCurrency(demo.median_home_value)],
    ['Median Gross Rent', formatCurrency(demo.median_gross_rent)]
  ];
  
  addDetailsTable(doc, demoRows);
  
  // Data source note
  doc.moveDown(0.5);
  doc.fontSize(8).font('Helvetica').fillColor(COLORS.darkGray)
    .text(`Data Source: ${demo.data_source || 'US Census Bureau ACS 5-Year Estimates'} (${demo.data_year || '2022'})`);
  doc.fillColor(COLORS.text);
}

/**
 * Generate Risk Assessment
 */
function generateRiskAssessment(doc, property, analysis) {
  addSectionHeader(doc, 'Risk Assessment');
  
  const risks = [];
  const mitigations = [];
  
  // Flood risk
  const floodZone = analysis?.siteCharacteristics?.floodZone || property.flood_zone;
  if (floodZone && floodZone !== 'X' && floodZone !== 'Unknown') {
    risks.push({
      risk: 'Flood Zone Risk',
      level: 'HIGH',
      description: `Property is located in FEMA flood zone ${floodZone}, which may require flood insurance and impact development.`
    });
    mitigations.push({
      risk: 'Flood Zone Risk',
      mitigation: 'Obtain FEMA elevation certificate and consider flood insurance costs in underwriting.'
    });
  }
  
  // Tax delinquency
  if (property.tax_delinquent_flag) {
    risks.push({
      risk: 'Tax Delinquency',
      level: 'MEDIUM',
      description: 'Property has outstanding tax delinquencies that may complicate acquisition.'
    });
    mitigations.push({
      risk: 'Tax Delinquency',
      mitigation: 'Verify total tax liability and negotiate with seller to clear liens before closing.'
    });
  }
  
  // Zoning constraints
  if (analysis?.zoningAnalysis?.constraints && analysis.zoningAnalysis.constraints.length > 0) {
    risks.push({
      risk: 'Zoning Constraints',
      level: 'MEDIUM',
      description: `Zoning restrictions may limit development potential: ${analysis.zoningAnalysis.constraints.join(', ')}`
    });
    mitigations.push({
      risk: 'Zoning Constraints',
      mitigation: 'Consult with planning department and consider variance applications if needed.'
    });
  }
  
  // Homestead exemption
  if (property.homestead_exemption_flag) {
    risks.push({
      risk: 'Homestead Exemption',
      level: 'LOW',
      description: 'Property has homestead exemption, indicating owner-occupied residential use.'
    });
    mitigations.push({
      risk: 'Homestead Exemption',
      mitigation: 'Verify current use and owner intent. May require longer negotiation timeline.'
    });
  }
  
  // Default risk if none identified
  if (risks.length === 0) {
    risks.push({
      risk: 'Standard Acquisition Risks',
      level: 'LOW',
      description: 'Standard due diligence required for any real estate acquisition.'
    });
    mitigations.push({
      risk: 'Standard Acquisition Risks',
      mitigation: 'Complete title search, environmental assessment, and property inspection.'
    });
  }
  
  // Display risks
  risks.forEach((risk, index) => {
    if (index > 0) doc.moveDown(0.5);
    
    doc.fontSize(10).font('Helvetica-Bold')
      .text(`${risk.risk} (${risk.level})`);
    doc.fontSize(10).font('Helvetica')
      .text(risk.description, { align: 'justify' });
  });
  
  // Display mitigations
  if (mitigations.length > 0) {
    doc.moveDown(1);
    addSubsectionHeader(doc, 'Risk Mitigations');
    
    mitigations.forEach((mit, index) => {
      if (index > 0) doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica-Bold')
        .text(`${mit.risk}:`, { continued: true });
      doc.font('Helvetica')
        .text(` ${mit.mitigation}`, { align: 'justify' });
    });
  }
}

/**
 * Generate Action Plan
 */
function generateActionPlan(doc, recommendation) {
  addSectionHeader(doc, 'Action Plan');
  
  const isProceed = recommendation.toLowerCase().includes('proceed');
  
  const weeks = isProceed ? [
    {
      week: 'Week 1',
      tasks: [
        'Engage title company and order preliminary title report',
        'Request property inspection and environmental assessment',
        'Submit LOI (Letter of Intent) to seller',
        'Begin financial underwriting and pro forma analysis'
      ]
    },
    {
      week: 'Week 2',
      tasks: [
        'Review title report and identify any liens or encumbrances',
        'Receive inspection reports and assess repair costs',
        'Negotiate purchase agreement terms',
        'Secure financing commitment (if applicable)'
      ]
    },
    {
      week: 'Week 3',
      tasks: [
        'Complete due diligence review',
        'Finalize purchase agreement',
        'Coordinate with lender and title company',
        'Schedule closing date'
      ]
    },
    {
      week: 'Week 4',
      tasks: [
        'Final walkthrough',
        'Close transaction',
        'Record deed and transfer ownership',
        'Begin post-acquisition planning'
      ]
    }
  ] : [
    {
      week: 'Week 1',
      tasks: [
        'Review risk assessment and determine if risks are manageable',
        'Consider alternative properties in the area',
        'If proceeding, begin standard due diligence process'
      ]
    },
    {
      week: 'Week 2-4',
      tasks: [
        'Complete comprehensive due diligence',
        'Reassess acquisition decision based on findings',
        'Either proceed with acquisition or identify alternative opportunities'
      ]
    }
  ];
  
  weeks.forEach((weekPlan, index) => {
    if (index > 0) doc.moveDown(0.8);
    
    doc.fontSize(11).font('Helvetica-Bold').fillColor(COLORS.secondary)
      .text(weekPlan.week);
    doc.fillColor(COLORS.text);
    doc.moveDown(0.3);
    
    weekPlan.tasks.forEach(task => {
      doc.fontSize(10).font('Helvetica')
        .text(`  • ${task}`, { indent: 10 });
    });
  });
}

/**
 * Generate Title Page
 */
function generateTitlePage(doc, property) {
  // Title
  doc.fontSize(28).font('Helvetica-Bold').fillColor(COLORS.primary)
    .text('ACQUISITION REPORT', { align: 'center' });
  doc.moveDown(1);
  
  // Property Address
  doc.fontSize(18).font('Helvetica-Bold').fillColor(COLORS.text)
    .text(property.situs_address || property.address || 'Property Address', { align: 'center' });
  doc.moveDown(0.5);
  
  // Parcel ID
  if (property.parcel_id) {
    doc.fontSize(12).font('Helvetica').fillColor(COLORS.darkGray)
      .text(`Parcel ID: ${property.parcel_id}`, { align: 'center' });
  }
  
  doc.moveDown(2);
  
  // Key Metrics Box
  const metricsY = doc.y;
  const boxWidth = 250;
  const boxHeight = 120;
  const boxX = (612 - boxWidth) / 2; // Center on page
  
  doc.rect(boxX, metricsY, boxWidth, boxHeight)
    .stroke(COLORS.primary)
    .fill(COLORS.lightGray);
  
  doc.fontSize(12).font('Helvetica-Bold').fillColor(COLORS.primary)
    .text('KEY METRICS', boxX + 10, metricsY + 10, { width: boxWidth - 20, align: 'center' });
  
  const metrics = [
    ['Acreage', property.acres_calc ? `${formatNumber(property.acres_calc)} acres` : 'N/A'],
    ['Market Value', formatCurrency(property.market_value)],
    ['Asset Class', property.asset_class || 'N/A']
  ];
  
  let metricY = metricsY + 35;
  metrics.forEach(([label, value]) => {
    doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.text)
      .text(`${label}:`, boxX + 15, metricY);
    doc.font('Helvetica')
      .text(value, boxX + 80, metricY);
    metricY += 20;
  });
  
  doc.fillColor(COLORS.text);
  
  // Date
  doc.moveDown(3);
  doc.fontSize(10).font('Helvetica').fillColor(COLORS.darkGray)
    .text(`Generated: ${new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    })}`, { align: 'center' });
  
  doc.fillColor(COLORS.text);
  
  // Add page break
  doc.addPage();
}

/**
 * Generate Acquisition Report PDF
 */
async function generatePDF(property, analysis, demographics, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });

      const filename = `acquisition_report_${property.parcel_id || Date.now()}_${Date.now()}.pdf`;
      const filePath = path.join(UPLOADS_DIR, filename);
      const writeStream = fs.createWriteStream(filePath);

      doc.pipe(writeStream);

      // Title Page
      generateTitlePage(doc, property);
      
      // Investment Recommendation
      const recommendation = analysis?.recommendation?.summary || 'Further Analysis Recommended';
      generateInvestmentRecommendation(doc, property, analysis);
      
      // Property Overview
      doc.addPage();
      generatePropertyOverview(doc, property);
      
      // Financial Analysis
      doc.addPage();
      generateFinancialAnalysis(doc, property, analysis);
      
      // Market Analysis
      doc.addPage();
      generateMarketAnalysis(doc, demographics);
      
      // Risk Assessment
      doc.addPage();
      generateRiskAssessment(doc, property, analysis);
      
      // Action Plan
      doc.addPage();
      generateActionPlan(doc, recommendation);
      
      // Footer on last page
      doc.moveDown(2);
      doc.fontSize(8).fillColor(COLORS.darkGray)
        .text('This report is generated for informational purposes only and does not constitute investment advice.', { align: 'center' })
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
 * Generate Acquisition Report artifact
 * 
 * @param {Array} parcels - Array of parcel data objects (typically single property)
 * @param {object} options - Generation options
 * @returns {Promise<{ content: Buffer, format: string, metadata: object }>}
 */
export async function generateAcquisitionReport(parcels, options = {}) {
  if (!parcels || parcels.length === 0) {
    throw new Error('No parcels provided for acquisition report');
  }

  // Use first parcel (acquisition reports are typically single property)
  const property = parcels[0];
  
  if (!property.parcel_id) {
    throw new Error('Parcel ID is required for acquisition report');
  }

  // Get coordinates for census data
  const lat = property.latitude || property.lat;
  const lng = property.longitude || property.lng;
  
  // Fetch analysis and demographics in parallel
  let analysis = null;
  let demographics = null;
  
  try {
    // Get development feasibility analysis
    analysis = await analyzeDevelopmentFeasibility(property.parcel_id);
  } catch (err) {
    console.warn('[Acquisition Report] Analysis failed:', err.message);
  }
  
  try {
    // Get census demographics if coordinates available
    if (lat && lng) {
      demographics = await getDemographicsForLocation(lat, lng);
    } else {
      console.warn('[Acquisition Report] No coordinates available for census data');
    }
  } catch (err) {
    console.warn('[Acquisition Report] Census data failed:', err.message);
  }

  // Generate PDF
  const pdfResult = await generatePDF(property, analysis, demographics, options);

  // Return structured data compatible with existing artifact system
  return {
    content: pdfResult.content,
    format: 'pdf',
    metadata: {
      type: 'acquisition_report',
      parcel_id: property.parcel_id,
      parcelCount: 1,
      generatedAt: new Date().toISOString(),
      hasAnalysis: !!analysis,
      hasDemographics: !!demographics,
      structuredData: {
        property,
        analysis,
        demographics,
        reactComponent: 'AcquisitionReportArtifact'
      }
    }
  };
}

export default {
  generateAcquisitionReport
};
