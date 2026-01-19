// src/services/artifacts/csvGenerator.js
// Generate CSV exports from parcel data

/**
 * Default columns for CSV export
 */
/**
 * Safe number formatter - handles strings, numbers, and nulls
 */
const formatNumber = (v, decimals = 0) => {
  if (v === null || v === undefined || v === '') return '';
  const num = typeof v === 'number' ? v : parseFloat(v);
  return isNaN(num) ? '' : num.toFixed(decimals);
};

const formatCurrency = (v) => {
  if (v === null || v === undefined || v === '') return '';
  const num = typeof v === 'number' ? v : parseFloat(v);
  return isNaN(num) ? '' : num.toLocaleString();
};

const DEFAULT_COLUMNS = [
  { key: 'parcel_id', header: 'Parcel ID' },
  { key: 'situs_address', header: 'Address' },
  { key: 'owner_name_raw', header: 'Owner' },
  { key: 'owner_entity_type', header: 'Owner Type' },
  { key: 'owner_segment', header: 'Owner Segment' },
  { key: 'acres_calc', header: 'Acres', transform: (v) => formatNumber(v, 2) },
  { key: 'asset_class', header: 'Asset Class' },
  { key: 'market_value', header: 'Market Value', transform: formatCurrency },
  { key: 'land_value', header: 'Land Value', transform: formatCurrency },
  { key: 'improvement_value', header: 'Improvement Value', transform: formatCurrency },
  { key: 'assessed_total_value', header: 'Assessed Value', transform: formatCurrency },
  { key: 'tax_delinquent_flag', header: 'Tax Delinquent', transform: (v) => v === true ? 'Yes' : 'No' },
  { key: 'homestead_exemption_flag', header: 'Homestead', transform: (v) => v === true ? 'Yes' : 'No' },
  { key: 'mail_zip', header: 'ZIP' },
  { key: 'county_fips', header: 'County FIPS' },
  { key: 'latitude', header: 'Latitude', transform: (v) => formatNumber(v, 6) },
  { key: 'longitude', header: 'Longitude', transform: (v) => formatNumber(v, 6) }
];

/**
 * Escape a value for CSV (handles commas, quotes, newlines)
 */
function escapeCSV(value) {
  if (value === null || value === undefined) {
    return '';
  }

  const str = String(value);

  // Check if escaping is needed
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    // Escape double quotes by doubling them
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Generate CSV content from parcel data
 *
 * @param {array} parcels - Array of parcel objects from database
 * @param {object} options - Generation options
 * @returns {Promise<{ content: string, format: string, metadata: object }>}
 */
export async function generateCSV(parcels, options = {}) {
  const columns = options.columns || DEFAULT_COLUMNS;
  const includeHeader = options.includeHeader !== false;

  // Build header row
  const headers = columns.map(c => escapeCSV(c.header));
  const headerRow = headers.join(',');

  // Build data rows
  const dataRows = parcels.map(parcel => {
    return columns.map(col => {
      let value = parcel[col.key];

      // Apply transform if present
      if (col.transform && value !== null && value !== undefined) {
        value = col.transform(value);
      }

      return escapeCSV(value);
    }).join(',');
  });

  // Combine into CSV content
  const rows = includeHeader ? [headerRow, ...dataRows] : dataRows;
  const csvContent = rows.join('\n');

  // Calculate statistics for metadata
  const numericColumns = ['acres_calc', 'market_value', 'land_value', 'improvement_value'];
  const stats = {};

  for (const colKey of numericColumns) {
    const values = parcels
      .map(p => parseFloat(p[colKey]))
      .filter(v => !isNaN(v) && v > 0);

    if (values.length > 0) {
      stats[colKey] = {
        min: Math.min(...values),
        max: Math.max(...values),
        avg: values.reduce((a, b) => a + b, 0) / values.length,
        count: values.length
      };
    }
  }

  return {
    content: csvContent,
    format: 'csv',
    metadata: {
      rowCount: parcels.length,
      columnCount: columns.length,
      columns: columns.map(c => c.header),
      statistics: stats,
      generatedAt: new Date().toISOString()
    }
  };
}

/**
 * Get available column configurations
 */
export function getAvailableColumns() {
  return DEFAULT_COLUMNS.map(c => ({
    key: c.key,
    header: c.header,
    hasTransform: !!c.transform
  }));
}

export default {
  generateCSV,
  getAvailableColumns,
  DEFAULT_COLUMNS
};
