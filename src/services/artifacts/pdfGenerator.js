// src/services/artifacts/pdfGenerator.js
// PDF generation for acquisition reports and site analysis

import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(__dirname, '../../../uploads/artifacts');
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
 * Generate Acquisition Report PDF
 */
export async function generateAcquisitionReport(propertyData, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });

      const filename = `acquisition_report_${Date.now()}.pdf`;
      const filePath = path.join(UPLOADS_DIR, filename);
      const writeStream = fs.createWriteStream(filePath);

      doc.pipe(writeStream);

      // Header
      doc.fontSize(24).font('Helvetica-Bold')
        .text('ACQUISITION REPORT', { align: 'center' });
      doc.moveDown(0.5);

      doc.fontSize(10).font('Helvetica')
        .fillColor('#666666')
        .text(`Generated: ${new Date().toLocaleDateString()}`, { align: 'center' });
      doc.moveDown(2);

      // Property Details Section
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#000000')
        .text('PROPERTY DETAILS');
      doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke('#cccccc');
      doc.moveDown(0.5);

      const prop = propertyData;
      const details = [
        ['Address', prop.situs_address || prop.address || 'N/A'],
        ['Parcel ID', prop.parcel_id || 'N/A'],
        ['Owner', prop.owner_name_raw || prop.owner || 'N/A'],
        ['Entity Type', prop.owner_entity_type || 'N/A'],
        ['Asset Class', prop.asset_class || 'N/A'],
        ['Acreage', prop.acres_calc ? `${formatNumber(prop.acres_calc)} acres` : 'N/A'],
      ];

      doc.fontSize(10).font('Helvetica');
      details.forEach(([label, value]) => {
        doc.font('Helvetica-Bold').text(`${label}: `, { continued: true });
        doc.font('Helvetica').text(value);
      });

      doc.moveDown(1.5);

      // Valuation Section
      doc.fontSize(14).font('Helvetica-Bold')
        .text('VALUATION');
      doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke('#cccccc');
      doc.moveDown(0.5);

      const valuations = [
        ['Market Value', formatCurrency(prop.market_value)],
        ['Land Value', formatCurrency(prop.land_value)],
        ['Improvement Value', formatCurrency(prop.improvement_value)],
        ['Assessed Value', formatCurrency(prop.assessed_total_value)],
      ];

      doc.fontSize(10);
      valuations.forEach(([label, value]) => {
        doc.font('Helvetica-Bold').text(`${label}: `, { continued: true });
        doc.font('Helvetica').text(value);
      });

      doc.moveDown(1.5);

      // Flags Section
      doc.fontSize(14).font('Helvetica-Bold')
        .text('FLAGS & INDICATORS');
      doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke('#cccccc');
      doc.moveDown(0.5);

      doc.fontSize(10);
      doc.font('Helvetica-Bold').text('Tax Delinquent: ', { continued: true });
      doc.font('Helvetica').text(prop.tax_delinquent_flag ? 'Yes' : 'No');

      doc.font('Helvetica-Bold').text('Homestead Exemption: ', { continued: true });
      doc.font('Helvetica').text(prop.homestead_exemption_flag ? 'Yes' : 'No');

      if (prop.owner_segment) {
        doc.font('Helvetica-Bold').text('Owner Segment: ', { continued: true });
        doc.font('Helvetica').text(prop.owner_segment);
      }

      doc.moveDown(1.5);

      // Location Section
      if (prop.latitude && prop.longitude) {
        doc.fontSize(14).font('Helvetica-Bold')
          .text('LOCATION');
        doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke('#cccccc');
        doc.moveDown(0.5);

        doc.fontSize(10);
        doc.font('Helvetica-Bold').text('Coordinates: ', { continued: true });
        doc.font('Helvetica').text(`${prop.latitude}, ${prop.longitude}`);

        if (prop.mail_zip) {
          doc.font('Helvetica-Bold').text('ZIP Code: ', { continued: true });
          doc.font('Helvetica').text(prop.mail_zip);
        }
      }

      // Footer
      doc.moveDown(3);
      doc.fontSize(8).fillColor('#999999')
        .text('This report is generated for informational purposes only.', { align: 'center' })
        .text('ScoutGPT Pro - Commercial Real Estate Intelligence', { align: 'center' });

      doc.end();

      writeStream.on('finish', () => {
        const stats = fs.statSync(filePath);
        resolve({
          content: fs.readFileSync(filePath),
          format: 'pdf',
          filePath: `uploads/artifacts/${filename}`,
          fileSize: stats.size,
          metadata: {
            type: 'acquisition_report',
            parcel_id: prop.parcel_id
          }
        });
      });

      writeStream.on('error', reject);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Generate Site Analysis PDF
 */
export async function generateSiteAnalysis(propertyData, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });

      const filename = `site_analysis_${Date.now()}.pdf`;
      const filePath = path.join(UPLOADS_DIR, filename);
      const writeStream = fs.createWriteStream(filePath);

      doc.pipe(writeStream);

      // Header
      doc.fontSize(24).font('Helvetica-Bold')
        .text('SITE ANALYSIS', { align: 'center' });
      doc.moveDown(0.5);

      doc.fontSize(10).font('Helvetica')
        .fillColor('#666666')
        .text(`Generated: ${new Date().toLocaleDateString()}`, { align: 'center' });
      doc.moveDown(2);

      const prop = propertyData;

      // Site Overview
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#000000')
        .text('SITE OVERVIEW');
      doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke('#cccccc');
      doc.moveDown(0.5);

      doc.fontSize(10).font('Helvetica');

      const overview = [
        ['Property Address', prop.situs_address || prop.address || 'N/A'],
        ['Parcel ID', prop.parcel_id || 'N/A'],
        ['Total Acreage', prop.acres_calc ? `${formatNumber(prop.acres_calc)} acres` : 'N/A'],
        ['Asset Classification', prop.asset_class || 'N/A'],
        ['Current Use', prop.land_use || prop.asset_class || 'N/A'],
      ];

      overview.forEach(([label, value]) => {
        doc.font('Helvetica-Bold').text(`${label}: `, { continued: true });
        doc.font('Helvetica').text(value);
      });

      doc.moveDown(1.5);

      // Ownership Analysis
      doc.fontSize(14).font('Helvetica-Bold')
        .text('OWNERSHIP ANALYSIS');
      doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke('#cccccc');
      doc.moveDown(0.5);

      doc.fontSize(10);
      const ownership = [
        ['Owner Name', prop.owner_name_raw || 'N/A'],
        ['Entity Type', prop.owner_entity_type || 'Individual'],
        ['Owner Segment', prop.owner_segment || 'N/A'],
        ['Homestead Status', prop.homestead_exemption_flag ? 'Homesteaded' : 'Non-Homesteaded'],
      ];

      ownership.forEach(([label, value]) => {
        doc.font('Helvetica-Bold').text(`${label}: `, { continued: true });
        doc.font('Helvetica').text(value);
      });

      doc.moveDown(1.5);

      // Value Assessment
      doc.fontSize(14).font('Helvetica-Bold')
        .text('VALUE ASSESSMENT');
      doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke('#cccccc');
      doc.moveDown(0.5);

      const marketValue = prop.market_value || 0;
      const landValue = prop.land_value || 0;
      const improvementValue = prop.improvement_value || 0;
      const landRatio = marketValue > 0 ? ((landValue / marketValue) * 100).toFixed(1) : 'N/A';
      const improvementRatio = marketValue > 0 ? ((improvementValue / marketValue) * 100).toFixed(1) : 'N/A';

      doc.fontSize(10);
      doc.font('Helvetica-Bold').text(`Total Market Value: `, { continued: true });
      doc.font('Helvetica').text(formatCurrency(marketValue));

      doc.font('Helvetica-Bold').text(`Land Value: `, { continued: true });
      doc.font('Helvetica').text(`${formatCurrency(landValue)} (${landRatio}%)`);

      doc.font('Helvetica-Bold').text(`Improvement Value: `, { continued: true });
      doc.font('Helvetica').text(`${formatCurrency(improvementValue)} (${improvementRatio}%)`);

      if (prop.acres_calc && marketValue > 0) {
        const pricePerAcre = marketValue / prop.acres_calc;
        doc.font('Helvetica-Bold').text(`Price per Acre: `, { continued: true });
        doc.font('Helvetica').text(formatCurrency(pricePerAcre));
      }

      doc.moveDown(1.5);

      // Risk Indicators
      doc.fontSize(14).font('Helvetica-Bold')
        .text('RISK INDICATORS');
      doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke('#cccccc');
      doc.moveDown(0.5);

      doc.fontSize(10);

      if (prop.tax_delinquent_flag) {
        doc.fillColor('#cc0000')
          .font('Helvetica-Bold').text('⚠ TAX DELINQUENT', { continued: false });
        doc.fillColor('#000000');
      } else {
        doc.font('Helvetica').text('✓ No tax delinquency reported');
      }

      // Footer
      doc.moveDown(3);
      doc.fontSize(8).fillColor('#999999')
        .text('This analysis is generated for informational purposes only.', { align: 'center' })
        .text('ScoutGPT Pro - Commercial Real Estate Intelligence', { align: 'center' });

      doc.end();

      writeStream.on('finish', () => {
        const stats = fs.statSync(filePath);
        resolve({
          content: fs.readFileSync(filePath),
          format: 'pdf',
          filePath: `uploads/artifacts/${filename}`,
          fileSize: stats.size,
          metadata: {
            type: 'site_analysis',
            parcel_id: prop.parcel_id
          }
        });
      });

      writeStream.on('error', reject);
    } catch (error) {
      reject(error);
    }
  });
}

export default {
  generateAcquisitionReport,
  generateSiteAnalysis
};
