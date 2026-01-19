import express from 'express';
import pg from 'pg';
import Papa from 'papaparse';

const router = express.Router();
const { Pool } = pg;

/**
 * POST /api/export/csv
 * Export properties as CSV
 * 
 * Request body:
 * {
 *   "propertyIds": ["123", "456", ...],  // Optional: specific IDs
 *   "filters": { ... },                   // Optional: query filters
 *   "fields": ["parcel_id", "situs_address", ...] // Optional: specific fields
 * }
 */
router.post('/csv', async (req, res) => {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 10
  });

  try {
    const { propertyIds, filters, fields } = req.body;

    // Default fields to export
    const defaultFields = [
      'parcel_id',
      'situs_address',
      'owner_name_raw',
      'owner_entity_type',
      'owner_segment',
      'acres_calc',
      'asset_class',
      'market_value',
      'land_value',
      'building_sqft',
      'tax_delinquent_flag',
      'homestead_exemption_flag',
      'county_fips',
      'mail_zip'
    ];

    const exportFields = fields && fields.length > 0 ? fields : defaultFields;

    // Build WHERE clause
    const conditions = [];
    const values = [];
    let paramIndex = 1;

    if (propertyIds && propertyIds.length > 0) {
      // Export specific properties by ID
      const placeholders = propertyIds.map((_, i) => `$${paramIndex + i}`).join(', ');
      conditions.push(`parcel_id IN (${placeholders})`);
      values.push(...propertyIds);
      paramIndex += propertyIds.length;
    } else if (filters) {
      // Apply filters (similar to /api/ai/query logic)
      if (filters.asset_class) {
        if (Array.isArray(filters.asset_class)) {
          const placeholders = filters.asset_class.map((_, i) => `$${paramIndex + i}`).join(', ');
          conditions.push(`asset_class IN (${placeholders})`);
          values.push(...filters.asset_class.map(v => v.toLowerCase()));
          paramIndex += filters.asset_class.length;
        } else {
          conditions.push(`asset_class = $${paramIndex}`);
          values.push(filters.asset_class.toLowerCase());
          paramIndex++;
        }
      }

      if (filters.owner_entity_type) {
        if (Array.isArray(filters.owner_entity_type)) {
          const placeholders = filters.owner_entity_type.map((_, i) => `$${paramIndex + i}`).join(', ');
          conditions.push(`owner_entity_type IN (${placeholders})`);
          values.push(...filters.owner_entity_type.map(v => v.toLowerCase()));
          paramIndex += filters.owner_entity_type.length;
        } else {
          conditions.push(`owner_entity_type = $${paramIndex}`);
          values.push(filters.owner_entity_type.toLowerCase());
          paramIndex++;
        }
      }

      if (filters.owner_segment) {
        if (Array.isArray(filters.owner_segment)) {
          const placeholders = filters.owner_segment.map((_, i) => `$${paramIndex + i}`).join(', ');
          conditions.push(`owner_segment IN (${placeholders})`);
          values.push(...filters.owner_segment.map(v => v.toLowerCase()));
          paramIndex += filters.owner_segment.length;
        } else {
          conditions.push(`owner_segment = $${paramIndex}`);
          values.push(filters.owner_segment.toLowerCase());
          paramIndex++;
        }
      }

      if (filters.tax_delinquent === true) {
        conditions.push(`tax_delinquent_flag = $${paramIndex}`);
        values.push(true);
        paramIndex++;
      }

      if (filters.acres_min !== null && filters.acres_min !== undefined) {
        conditions.push(`acres_calc >= $${paramIndex}`);
        values.push(parseFloat(filters.acres_min));
        paramIndex++;
      }

      if (filters.acres_max !== null && filters.acres_max !== undefined) {
        conditions.push(`acres_calc <= $${paramIndex}`);
        values.push(parseFloat(filters.acres_max));
        paramIndex++;
      }

      if (filters.market_value_min !== null && filters.market_value_min !== undefined) {
        conditions.push(`market_value >= $${paramIndex}`);
        values.push(parseFloat(filters.market_value_min));
        paramIndex++;
      }

      if (filters.market_value_max !== null && filters.market_value_max !== undefined) {
        conditions.push(`market_value <= $${paramIndex}`);
        values.push(parseFloat(filters.market_value_max));
        paramIndex++;
      }

      if (filters.county_fips) {
        conditions.push(`county_fips = $${paramIndex}`);
        values.push(filters.county_fips);
        paramIndex++;
      }
    }

    // Limit export to prevent abuse
    const MAX_EXPORT = 10000;
    values.push(MAX_EXPORT);
    const limitParamIndex = paramIndex;

    // Build WHERE clause string
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Build SELECT clause
    const selectClause = exportFields.join(', ');

    // Build SQL query
    const sqlQuery = `
      SELECT ${selectClause}
      FROM parcel_features_travis
      ${whereClause}
      ORDER BY parcel_id
      LIMIT $${limitParamIndex}
    `;

    console.log('[CSV Export] Query:', sqlQuery);
    console.log('[CSV Export] Values:', values);

    // Fetch properties
    const result = await pool.query(sqlQuery, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No properties found matching criteria'
      });
    }

    // Generate CSV using papaparse
    const csvData = result.rows.map(row => {
      const csvRow = {};
      exportFields.forEach(field => {
        let value = row[field];
        if (value === null || value === undefined) {
          value = '';
        } else if (typeof value === 'boolean') {
          value = value ? 'true' : 'false';
        } else if (typeof value === 'number') {
          value = value.toString();
        } else {
          value = String(value);
        }
        csvRow[field] = value;
      });
      return csvRow;
    });

    const csvContent = Papa.unparse(csvData, {
      header: true,
      columns: exportFields
    });

    // Set headers for file download
    const filename = `scoutgpt_export_${Date.now()}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', Buffer.byteLength(csvContent, 'utf8'));

    console.log(`[CSV Export] Exported ${result.rows.length} properties to CSV`);

    return res.send(csvContent);

  } catch (error) {
    console.error('[CSV Export] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to export CSV',
      message: error.message
    });
  } finally {
    await pool.end();
  }
});

/**
 * GET /api/export/fields
 * Get available fields for export
 */
router.get('/fields', async (req, res) => {
  const availableFields = [
    { field: 'parcel_id', label: 'Parcel ID', type: 'string' },
    { field: 'situs_address', label: 'Address', type: 'string' },
    { field: 'owner_name_raw', label: 'Owner Name', type: 'string' },
    { field: 'owner_entity_type', label: 'Entity Type', type: 'string' },
    { field: 'owner_segment', label: 'Owner Segment', type: 'string' },
    { field: 'acres_calc', label: 'Acreage', type: 'number' },
    { field: 'asset_class', label: 'Asset Class', type: 'string' },
    { field: 'market_value', label: 'Market Value', type: 'number' },
    { field: 'land_value', label: 'Land Value', type: 'number' },
    { field: 'building_sqft', label: 'Building Sq Ft', type: 'number' },
    { field: 'tax_delinquent_flag', label: 'Tax Delinquent', type: 'boolean' },
    { field: 'homestead_exemption_flag', label: 'Homestead Exemption', type: 'boolean' },
    { field: 'county_fips', label: 'County FIPS', type: 'string' },
    { field: 'mail_zip', label: 'ZIP Code', type: 'string' },
    { field: 'mailing_address', label: 'Mailing Address', type: 'string' },
    { field: 'mail_city', label: 'Mailing City', type: 'string' },
    { field: 'mail_state', label: 'Mailing State', type: 'string' },
    { field: 'year_built', label: 'Year Built', type: 'number' },
    { field: 'assessed_total_value', label: 'Assessed Total Value', type: 'number' },
    { field: 'improvement_value', label: 'Improvement Value', type: 'number' },
    { field: 'last_sale_date', label: 'Last Sale Date', type: 'date' },
    { field: 'last_sale_price', label: 'Last Sale Price', type: 'number' }
  ];

  return res.json({
    success: true,
    fields: availableFields
  });
});

export default router;
