// src/services/artifacts/index.js
// Main artifact service for creating, storing, and regenerating artifacts

import pg from 'pg';
import { generateCSV } from './csvGenerator.js';
import { generateAcquisitionReport, generateSiteAnalysis } from './pdfGenerator.js';
import { generateUnderwritingModel, generateCompAnalysis } from './xlsxGenerator.js';
import { generateDevelopmentAnalysis } from './generators/developmentAnalysis.js';
import { saveArtifactFile, getArtifactStream, deleteArtifactFile } from './storage.js';
import crypto from 'crypto';

/**
 * Available artifact generators
 */
const GENERATORS = {
  'csv_export': generateCSV,
  'acquisition_report': generateAcquisitionReport,
  'site_analysis': generateSiteAnalysis,
  'underwriting_model': generateUnderwritingModel,
  'comp_analysis': generateCompAnalysis,
  'development_analysis': generateDevelopmentAnalysis
};

/**
 * Valid artifact types
 */
export const VALID_TYPES = [
  'csv_export',
  'acquisition_report',
  'site_analysis',
  'underwriting_model',
  'comp_analysis',
  'development_analysis'
];

/**
 * Get database pool
 */
function getDbPool() {
  return new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5
  });
}

/**
 * Fetch parcel data by IDs
 */
async function fetchParcelsById(parcelIds, pool) {
  if (!parcelIds || parcelIds.length === 0) {
    return [];
  }

  // Build placeholders for IN clause
  const placeholders = parcelIds.map((_, i) => `$${i + 1}`).join(', ');

  const result = await pool.query(`
    SELECT
      parcel_id,
      situs_address,
      owner_name_raw,
      owner_entity_type,
      owner_segment,
      acres_calc,
      asset_class,
      market_value,
      land_value,
      improvement_value,
      assessed_total_value,
      tax_delinquent_flag,
      homestead_exemption_flag,
      mail_zip,
      county_fips,
      ST_Y(geom_centroid) as latitude,
      ST_X(geom_centroid) as longitude
    FROM parcel_features_travis
    WHERE parcel_id = ANY($1)
  `, [parcelIds]);

  return result.rows;
}

/**
 * Create a new artifact
 *
 * @param {object} params - Artifact creation parameters
 * @returns {Promise<object>} - Created artifact record
 */
export async function createArtifact({
  type,
  sessionId,
  userId = null,
  queryInput,
  queryIntent = null,
  parcelIds,
  options = {}
}) {
  // Validate type
  if (!VALID_TYPES.includes(type)) {
    throw new Error(`Invalid artifact type: ${type}. Valid types: ${VALID_TYPES.join(', ')}`);
  }

  // Get generator
  const generator = GENERATORS[type];
  if (!generator) {
    throw new Error(`Generator not implemented for type: ${type}`);
  }

  const pool = getDbPool();

  try {
    // Fetch parcel data
    const parcels = await fetchParcelsById(parcelIds, pool);

    if (parcels.length === 0) {
      throw new Error('No parcels found for the provided IDs');
    }

    const dataRetrievalTimestamp = new Date();

    // Generate the artifact content
    const { content, format, metadata: genMetadata } = await generator(parcels, options);

    // Calculate checksum
    const checksum = crypto.createHash('sha256').update(content).digest('hex');

    // Save file to storage
    const { filePath, fileSize } = await saveArtifactFile(content, format, type);

    // Insert artifact record
    const result = await pool.query(`
      INSERT INTO artifacts (
        artifact_type,
        created_by_session,
        created_by_user,
        query_input,
        query_intent,
        result_parcel_ids,
        data_retrieval_timestamp,
        file_path,
        file_format,
        file_size_bytes,
        file_checksum,
        template_version,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'completed')
      RETURNING *
    `, [
      type,
      sessionId,
      userId,
      JSON.stringify(queryInput),
      queryIntent ? JSON.stringify(queryIntent) : null,
      parcelIds,
      dataRetrievalTimestamp,
      filePath,
      format,
      fileSize,
      checksum,
      '1.0'
    ]);

    const artifact = result.rows[0];

    console.log(`[artifacts] Created ${type} artifact: ${artifact.artifact_id} (${parcelIds.length} parcels)`);

    return {
      artifact_id: artifact.artifact_id,
      artifact_type: artifact.artifact_type,
      file_format: artifact.file_format,
      file_size_bytes: artifact.file_size_bytes,
      result_count: parcelIds.length,
      created_at: artifact.created_at,
      status: artifact.status,
      metadata: genMetadata
    };

  } catch (error) {
    console.error('[artifacts] Error creating artifact:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

/**
 * Get artifact by ID
 */
export async function getArtifact(artifactId) {
  const pool = getDbPool();

  try {
    const result = await pool.query(`
      SELECT * FROM artifacts WHERE artifact_id = $1
    `, [artifactId]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];

  } catch (error) {
    console.error('[artifacts] Error getting artifact:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

/**
 * Get artifact file stream for download
 */
export async function downloadArtifact(artifactId) {
  const pool = getDbPool();

  try {
    // Get artifact record
    const result = await pool.query(`
      SELECT file_path, file_format, artifact_type
      FROM artifacts
      WHERE artifact_id = $1
    `, [artifactId]);

    if (result.rows.length === 0) {
      return null;
    }

    const artifact = result.rows[0];

    // Increment download count
    await pool.query(`
      UPDATE artifacts
      SET download_count = download_count + 1
      WHERE artifact_id = $1
    `, [artifactId]);

    // Get file stream
    const stream = await getArtifactStream(artifact.file_path);

    return {
      stream,
      format: artifact.file_format,
      filename: `${artifact.artifact_type}_${artifactId}.${artifact.file_format}`
    };

  } catch (error) {
    console.error('[artifacts] Error downloading artifact:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

/**
 * Regenerate an artifact with fresh data
 */
export async function regenerateArtifact(artifactId) {
  const pool = getDbPool();

  try {
    // Get original artifact
    const result = await pool.query(`
      SELECT * FROM artifacts WHERE artifact_id = $1
    `, [artifactId]);

    if (result.rows.length === 0) {
      throw new Error(`Artifact not found: ${artifactId}`);
    }

    const original = result.rows[0];

    // Create new artifact with same parameters but fresh data
    const newArtifact = await createArtifact({
      type: original.artifact_type,
      sessionId: original.created_by_session,
      userId: original.created_by_user,
      queryInput: original.query_input,
      queryIntent: original.query_intent,
      parcelIds: original.result_parcel_ids,
      options: { regeneratedFrom: artifactId }
    });

    // Update the new artifact to link to original
    await pool.query(`
      UPDATE artifacts
      SET regenerated_from = $2
      WHERE artifact_id = $1
    `, [newArtifact.artifact_id, artifactId]);

    console.log(`[artifacts] Regenerated artifact ${artifactId} → ${newArtifact.artifact_id}`);

    return newArtifact;

  } catch (error) {
    console.error('[artifacts] Error regenerating artifact:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

/**
 * List artifacts for a session
 */
export async function listArtifacts({ sessionId, type, limit = 20 }) {
  const pool = getDbPool();

  try {
    const conditions = [];
    const values = [];
    let paramIndex = 1;

    if (sessionId) {
      conditions.push(`created_by_session = $${paramIndex++}`);
      values.push(sessionId);
    }

    if (type) {
      conditions.push(`artifact_type = $${paramIndex++}`);
      values.push(type);
    }

    values.push(limit);

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    const result = await pool.query(`
      SELECT
        artifact_id,
        artifact_type,
        file_format,
        file_size_bytes,
        array_length(result_parcel_ids, 1) as result_count,
        created_at,
        download_count,
        status,
        regenerated_from
      FROM artifacts
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex}
    `, values);

    return result.rows;

  } catch (error) {
    console.error('[artifacts] Error listing artifacts:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

/**
 * Delete an artifact
 */
export async function deleteArtifact(artifactId) {
  const pool = getDbPool();

  try {
    // Get artifact to find file path
    const result = await pool.query(`
      SELECT file_path FROM artifacts WHERE artifact_id = $1
    `, [artifactId]);

    if (result.rows.length === 0) {
      return false;
    }

    const { file_path } = result.rows[0];

    // Delete file from storage
    if (file_path) {
      await deleteArtifactFile(file_path);
    }

    // Delete database record
    await pool.query(`
      DELETE FROM artifacts WHERE artifact_id = $1
    `, [artifactId]);

    console.log(`[artifacts] Deleted artifact: ${artifactId}`);
    return true;

  } catch (error) {
    console.error('[artifacts] Error deleting artifact:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

/**
 * Quick artifact generation without database storage
 * Useful for on-demand report generation
 *
 * @param {string} type - Artifact type
 * @param {object|array} propertyData - Property data (single object or array)
 * @param {object} options - Generation options
 * @returns {Promise<{ content: Buffer, format: string, metadata: object }>}
 */
export async function generateArtifact(type, propertyData, options = {}) {
  const generator = GENERATORS[type];
  if (!generator) {
    throw new Error(`Generator not implemented for type: ${type}. Available: ${Object.keys(GENERATORS).join(', ')}`);
  }

  // Normalize to single property for single-property generators
  const data = Array.isArray(propertyData) ? propertyData[0] : propertyData;

  return generator(data, options);
}

// Re-export storage functions for convenience
export { saveArtifactFile as saveArtifact, deleteArtifactFile } from './storage.js';

export default {
  createArtifact,
  getArtifact,
  downloadArtifact,
  regenerateArtifact,
  listArtifacts,
  deleteArtifact,
  generateArtifact,
  VALID_TYPES,
  GENERATORS
};
