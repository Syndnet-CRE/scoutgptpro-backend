// src/services/artifacts/xlsxGenerator.js
// Excel spreadsheet generation for underwriting models and data exports

import ExcelJS from 'exceljs';
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
 * Generate Underwriting Model XLSX
 */
export async function generateUnderwritingModel(propertyData, options = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ScoutGPT Pro';
  workbook.created = new Date();

  const prop = propertyData;

  // ==================== Summary Sheet ====================
  const summarySheet = workbook.addWorksheet('Summary', {
    properties: { tabColor: { argb: '2563EB' } }
  });

  // Header styling
  const headerStyle = {
    font: { bold: true, size: 14, color: { argb: 'FFFFFF' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: '2563EB' } },
    alignment: { horizontal: 'center', vertical: 'middle' }
  };

  const labelStyle = {
    font: { bold: true },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F3F4F6' } }
  };

  // Title
  summarySheet.mergeCells('A1:D1');
  summarySheet.getCell('A1').value = 'UNDERWRITING MODEL';
  summarySheet.getCell('A1').style = headerStyle;
  summarySheet.getRow(1).height = 30;

  // Property Info
  summarySheet.getCell('A3').value = 'Property Information';
  summarySheet.getCell('A3').style = { font: { bold: true, size: 12 } };

  const propertyInfo = [
    ['Address', prop.situs_address || prop.address || 'N/A'],
    ['Parcel ID', prop.parcel_id || 'N/A'],
    ['Owner', prop.owner_name_raw || 'N/A'],
    ['Asset Class', prop.asset_class || 'N/A'],
    ['Acreage', prop.acres_calc || 0],
    ['Market Value', prop.market_value || 0],
    ['Land Value', prop.land_value || 0],
    ['Improvement Value', prop.improvement_value || 0],
  ];

  let row = 4;
  propertyInfo.forEach(([label, value]) => {
    summarySheet.getCell(`A${row}`).value = label;
    summarySheet.getCell(`A${row}`).style = labelStyle;
    summarySheet.getCell(`B${row}`).value = value;

    if (typeof value === 'number' && label.includes('Value')) {
      summarySheet.getCell(`B${row}`).numFmt = '$#,##0';
    }
    row++;
  });

  // Set column widths
  summarySheet.getColumn('A').width = 25;
  summarySheet.getColumn('B').width = 30;
  summarySheet.getColumn('C').width = 20;
  summarySheet.getColumn('D').width = 20;

  // ==================== Assumptions Sheet ====================
  const assumptionsSheet = workbook.addWorksheet('Assumptions', {
    properties: { tabColor: { argb: '10B981' } }
  });

  assumptionsSheet.mergeCells('A1:D1');
  assumptionsSheet.getCell('A1').value = 'INVESTMENT ASSUMPTIONS';
  assumptionsSheet.getCell('A1').style = headerStyle;
  assumptionsSheet.getRow(1).height = 30;

  // Default assumptions (user can modify)
  const marketValue = prop.market_value || 1000000;
  const assumptions = [
    ['Purchase Assumptions', '', '', ''],
    ['Purchase Price', marketValue, 'Adjust as needed', ''],
    ['Closing Costs (%)', 0.03, '3% of purchase price', ''],
    ['Due Diligence', 15000, 'Inspections, surveys, etc.', ''],
    ['', '', '', ''],
    ['Financing Assumptions', '', '', ''],
    ['Down Payment (%)', 0.25, '25% equity required', ''],
    ['Interest Rate', 0.07, 'Current market rate', ''],
    ['Loan Term (years)', 25, 'Amortization period', ''],
    ['', '', '', ''],
    ['Operating Assumptions', '', '', ''],
    ['Cap Rate', 0.065, 'Target cap rate', ''],
    ['Vacancy Rate', 0.05, '5% vacancy allowance', ''],
    ['Management Fee (%)', 0.04, '4% of gross income', ''],
    ['Annual Rent Growth', 0.03, '3% annual increase', ''],
    ['Annual Expense Growth', 0.025, '2.5% annual increase', ''],
  ];

  row = 3;
  assumptions.forEach(([label, value, note]) => {
    assumptionsSheet.getCell(`A${row}`).value = label;
    if (label && !label.includes('Assumptions') && label !== '') {
      assumptionsSheet.getCell(`A${row}`).style = labelStyle;
      assumptionsSheet.getCell(`B${row}`).value = value;

      if (typeof value === 'number') {
        if (label.includes('%') || label.includes('Rate') || label.includes('Growth')) {
          assumptionsSheet.getCell(`B${row}`).numFmt = '0.00%';
        } else if (label.includes('Price') || label.includes('Diligence')) {
          assumptionsSheet.getCell(`B${row}`).numFmt = '$#,##0';
        }
      }

      assumptionsSheet.getCell(`C${row}`).value = note;
      assumptionsSheet.getCell(`C${row}`).font = { italic: true, color: { argb: '6B7280' } };
    } else if (label.includes('Assumptions')) {
      assumptionsSheet.getCell(`A${row}`).style = { font: { bold: true, size: 11 } };
    }
    row++;
  });

  assumptionsSheet.getColumn('A').width = 25;
  assumptionsSheet.getColumn('B').width = 18;
  assumptionsSheet.getColumn('C').width = 30;

  // ==================== Pro Forma Sheet ====================
  const proFormaSheet = workbook.addWorksheet('Pro Forma', {
    properties: { tabColor: { argb: 'F59E0B' } }
  });

  proFormaSheet.mergeCells('A1:F1');
  proFormaSheet.getCell('A1').value = '5-YEAR PRO FORMA';
  proFormaSheet.getCell('A1').style = headerStyle;
  proFormaSheet.getRow(1).height = 30;

  // Headers
  proFormaSheet.getRow(3).values = ['', 'Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5'];
  proFormaSheet.getRow(3).font = { bold: true };
  proFormaSheet.getRow(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E5E7EB' } };

  // Calculate pro forma values
  const purchasePrice = marketValue;
  const capRate = 0.065;
  const baseNOI = purchasePrice * capRate;
  const rentGrowth = 0.03;
  const expenseGrowth = 0.025;
  const vacancyRate = 0.05;

  const proFormaData = [
    { label: 'Gross Potential Income', formula: (year) => baseNOI / (1 - vacancyRate) * Math.pow(1 + rentGrowth, year - 1) },
    { label: 'Less: Vacancy', formula: (year) => -(baseNOI / (1 - vacancyRate) * Math.pow(1 + rentGrowth, year - 1) * vacancyRate) },
    { label: 'Effective Gross Income', formula: (year) => baseNOI * Math.pow(1 + rentGrowth, year - 1) },
    { label: '', formula: () => '' },
    { label: 'Operating Expenses', formula: (year) => -(baseNOI * 0.35 * Math.pow(1 + expenseGrowth, year - 1)) },
    { label: 'Management Fee', formula: (year) => -(baseNOI * Math.pow(1 + rentGrowth, year - 1) * 0.04) },
    { label: '', formula: () => '' },
    { label: 'Net Operating Income', formula: (year) => baseNOI * Math.pow(1 + rentGrowth, year - 1) * 0.96 - (baseNOI * 0.35 * Math.pow(1 + expenseGrowth, year - 1)) },
  ];

  row = 4;
  proFormaData.forEach((item) => {
    proFormaSheet.getCell(`A${row}`).value = item.label;
    if (item.label && !item.label.includes('Less')) {
      proFormaSheet.getCell(`A${row}`).style = labelStyle;
    }

    for (let year = 1; year <= 5; year++) {
      const col = String.fromCharCode(65 + year); // B, C, D, E, F
      const value = item.formula(year);
      if (value !== '') {
        proFormaSheet.getCell(`${col}${row}`).value = value;
        proFormaSheet.getCell(`${col}${row}`).numFmt = '$#,##0';
      }
    }
    row++;
  });

  proFormaSheet.getColumn('A').width = 25;
  for (let i = 2; i <= 6; i++) {
    proFormaSheet.getColumn(i).width = 15;
  }

  // ==================== Save File ====================
  const filename = `underwriting_model_${Date.now()}.xlsx`;
  const filePath = path.join(UPLOADS_DIR, filename);

  await workbook.xlsx.writeFile(filePath);

  const stats = fs.statSync(filePath);

  return {
    content: fs.readFileSync(filePath),
    format: 'xlsx',
    filePath: `uploads/artifacts/${filename}`,
    fileSize: stats.size,
    metadata: {
      type: 'underwriting_model',
      parcel_id: prop.parcel_id,
      sheets: ['Summary', 'Assumptions', 'Pro Forma']
    }
  };
}

/**
 * Generate Comp Analysis XLSX
 */
export async function generateCompAnalysis(properties, options = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ScoutGPT Pro';
  workbook.created = new Date();

  const compSheet = workbook.addWorksheet('Comparable Analysis');

  // Header styling
  const headerStyle = {
    font: { bold: true, size: 12, color: { argb: 'FFFFFF' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: '2563EB' } },
    alignment: { horizontal: 'center', vertical: 'middle' }
  };

  // Title
  compSheet.mergeCells('A1:J1');
  compSheet.getCell('A1').value = 'COMPARABLE PROPERTY ANALYSIS';
  compSheet.getCell('A1').style = headerStyle;
  compSheet.getRow(1).height = 30;

  // Column headers
  const headers = [
    'Parcel ID', 'Address', 'Asset Class', 'Acreage',
    'Market Value', 'Land Value', 'Improvement Value',
    '$/Acre', 'Owner Type', 'Tax Status'
  ];

  compSheet.getRow(3).values = headers;
  compSheet.getRow(3).font = { bold: true };
  compSheet.getRow(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E5E7EB' } };

  // Data rows
  const propArray = Array.isArray(properties) ? properties : [properties];
  let row = 4;

  propArray.forEach((prop) => {
    const pricePerAcre = prop.acres_calc && prop.market_value
      ? prop.market_value / prop.acres_calc
      : 0;

    compSheet.getRow(row).values = [
      prop.parcel_id || 'N/A',
      prop.situs_address || prop.address || 'N/A',
      prop.asset_class || 'N/A',
      prop.acres_calc || 0,
      prop.market_value || 0,
      prop.land_value || 0,
      prop.improvement_value || 0,
      pricePerAcre,
      prop.owner_entity_type || 'N/A',
      prop.tax_delinquent_flag ? 'Delinquent' : 'Current'
    ];

    // Format numbers
    compSheet.getCell(`D${row}`).numFmt = '#,##0.00';
    compSheet.getCell(`E${row}`).numFmt = '$#,##0';
    compSheet.getCell(`F${row}`).numFmt = '$#,##0';
    compSheet.getCell(`G${row}`).numFmt = '$#,##0';
    compSheet.getCell(`H${row}`).numFmt = '$#,##0';

    row++;
  });

  // Set column widths
  const widths = [15, 35, 15, 12, 15, 15, 15, 15, 15, 12];
  widths.forEach((width, i) => {
    compSheet.getColumn(i + 1).width = width;
  });

  // Summary statistics
  row += 2;
  compSheet.getCell(`A${row}`).value = 'Summary Statistics';
  compSheet.getCell(`A${row}`).style = { font: { bold: true, size: 11 } };
  row++;

  const values = propArray.map(p => p.market_value || 0).filter(v => v > 0);
  if (values.length > 0) {
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);

    compSheet.getCell(`A${row}`).value = 'Average Value:';
    compSheet.getCell(`B${row}`).value = avg;
    compSheet.getCell(`B${row}`).numFmt = '$#,##0';
    row++;

    compSheet.getCell(`A${row}`).value = 'Min Value:';
    compSheet.getCell(`B${row}`).value = min;
    compSheet.getCell(`B${row}`).numFmt = '$#,##0';
    row++;

    compSheet.getCell(`A${row}`).value = 'Max Value:';
    compSheet.getCell(`B${row}`).value = max;
    compSheet.getCell(`B${row}`).numFmt = '$#,##0';
  }

  // Save file
  const filename = `comp_analysis_${Date.now()}.xlsx`;
  const filePath = path.join(UPLOADS_DIR, filename);

  await workbook.xlsx.writeFile(filePath);
  const stats = fs.statSync(filePath);

  return {
    content: fs.readFileSync(filePath),
    format: 'xlsx',
    filePath: `uploads/artifacts/${filename}`,
    fileSize: stats.size,
    metadata: {
      type: 'comp_analysis',
      property_count: propArray.length
    }
  };
}

export default {
  generateUnderwritingModel,
  generateCompAnalysis
};
