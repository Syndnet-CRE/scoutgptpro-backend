// src/routes/artifactsV2.js
// Enhanced artifact routes with PDF and XLSX generation

import express from 'express';
import pool from '../db/pool.js';
import { generateAcquisitionReport, generateSiteAnalysis } from '../services/artifacts/pdfGenerator.js';
import { generateUnderwritingModel, generateCompAnalysis } from '../services/artifacts/xlsxGenerator.js';
import { saveArtifactFile, getArtifactStream } from '../services/artifacts/storage.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const router = express.Router();

/**
 * Fetch parcel data by ID
 */
async function fetchParcelById(parcelId) {
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
    WHERE parcel_id = $1
    LIMIT 1
  `, [parcelId]);

  return result.rows[0] || null;
}

/**
 * Fetch multiple parcels
 */
async function fetchParcels(parcelIds) {
  if (!parcelIds || parcelIds.length === 0) return [];

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
 * Store artifact record in database
 */
async function storeArtifactRecord({ type, filePath, format, fileSize, parcelIds, queryInput }) {
  const checksum = crypto.randomBytes(16).toString('hex');
  const dataRetrievalTimestamp = new Date();

  // Build query_input JSON
  const queryInputJson = queryInput || {
    source: 'deal_room_generation',
    type: type,
    generated_at: dataRetrievalTimestamp.toISOString()
  };

  const result = await pool.query(`
    INSERT INTO artifacts (
      artifact_type,
      file_path,
      file_format,
      file_size_bytes,
      file_checksum,
      result_parcel_ids,
      query_input,
      data_retrieval_timestamp,
      template_version,
      status
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '1.0', 'completed')
    RETURNING *
  `, [type, filePath, format, fileSize, checksum, parcelIds, JSON.stringify(queryInputJson), dataRetrievalTimestamp]);

  return result.rows[0];
}

/**
 * POST /api/v2/artifacts/acquisition-report
 * Generate acquisition report PDF for a property
 */
router.post('/acquisition-report', async (req, res) => {
  try {
    const { parcelId, dealRoomId, userId } = req.body;

    if (!parcelId) {
      return res.status(400).json({ success: false, error: 'parcelId is required' });
    }

    // Fetch property data
    const propertyData = await fetchParcelById(parcelId);
    if (!propertyData) {
      return res.status(404).json({ success: false, error: 'Property not found' });
    }

    // Generate PDF
    const result = await generateAcquisitionReport(propertyData);

    // Store artifact record
    const artifact = await storeArtifactRecord({
      type: 'acquisition_report',
      filePath: result.filePath,
      format: result.format,
      fileSize: result.fileSize,
      parcelIds: [parcelId]
    });

    // Attach to deal room if provided
    if (dealRoomId) {
      await pool.query(`
        INSERT INTO deal_room_artifacts (deal_room_id, artifact_id, added_by)
        VALUES ($1, $2, $3)
      `, [dealRoomId, artifact.artifact_id.toString(), userId || 'system']);
    }

    res.status(201).json({
      success: true,
      artifact: {
        artifact_id: artifact.artifact_id,
        artifact_type: artifact.artifact_type,
        file_format: artifact.file_format,
        file_size_bytes: artifact.file_size_bytes,
        file_path: artifact.file_path,
        created_at: artifact.created_at
      }
    });

  } catch (error) {
    console.error('[POST /api/v2/artifacts/acquisition-report] Error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to generate acquisition report' });
  }
});

/**
 * POST /api/v2/artifacts/site-analysis
 * Generate site analysis PDF for a property
 */
router.post('/site-analysis', async (req, res) => {
  try {
    const { parcelId, dealRoomId, userId } = req.body;

    if (!parcelId) {
      return res.status(400).json({ success: false, error: 'parcelId is required' });
    }

    // Fetch property data
    const propertyData = await fetchParcelById(parcelId);
    if (!propertyData) {
      return res.status(404).json({ success: false, error: 'Property not found' });
    }

    // Generate PDF
    const result = await generateSiteAnalysis(propertyData);

    // Store artifact record
    const artifact = await storeArtifactRecord({
      type: 'site_analysis',
      filePath: result.filePath,
      format: result.format,
      fileSize: result.fileSize,
      parcelIds: [parcelId]
    });

    // Attach to deal room if provided
    if (dealRoomId) {
      await pool.query(`
        INSERT INTO deal_room_artifacts (deal_room_id, artifact_id, added_by)
        VALUES ($1, $2, $3)
      `, [dealRoomId, artifact.artifact_id.toString(), userId || 'system']);
    }

    res.status(201).json({
      success: true,
      artifact: {
        artifact_id: artifact.artifact_id,
        artifact_type: artifact.artifact_type,
        file_format: artifact.file_format,
        file_size_bytes: artifact.file_size_bytes,
        file_path: artifact.file_path,
        created_at: artifact.created_at
      }
    });

  } catch (error) {
    console.error('[POST /api/v2/artifacts/site-analysis] Error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to generate site analysis' });
  }
});

/**
 * POST /api/v2/artifacts/underwriting-model
 * Generate underwriting model XLSX for a property
 */
router.post('/underwriting-model', async (req, res) => {
  try {
    const { parcelId, dealRoomId, userId, assumptions } = req.body;

    if (!parcelId) {
      return res.status(400).json({ success: false, error: 'parcelId is required' });
    }

    // Fetch property data
    const propertyData = await fetchParcelById(parcelId);
    if (!propertyData) {
      return res.status(404).json({ success: false, error: 'Property not found' });
    }

    // Generate XLSX
    const result = await generateUnderwritingModel(propertyData, { assumptions });

    // Store artifact record
    const artifact = await storeArtifactRecord({
      type: 'underwriting_model',
      filePath: result.filePath,
      format: result.format,
      fileSize: result.fileSize,
      parcelIds: [parcelId]
    });

    // Attach to deal room if provided
    if (dealRoomId) {
      await pool.query(`
        INSERT INTO deal_room_artifacts (deal_room_id, artifact_id, added_by)
        VALUES ($1, $2, $3)
      `, [dealRoomId, artifact.artifact_id.toString(), userId || 'system']);
    }

    res.status(201).json({
      success: true,
      artifact: {
        artifact_id: artifact.artifact_id,
        artifact_type: artifact.artifact_type,
        file_format: artifact.file_format,
        file_size_bytes: artifact.file_size_bytes,
        file_path: artifact.file_path,
        created_at: artifact.created_at,
        metadata: result.metadata
      }
    });

  } catch (error) {
    console.error('[POST /api/v2/artifacts/underwriting-model] Error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to generate underwriting model' });
  }
});

/**
 * POST /api/v2/artifacts/comp-analysis
 * Generate comparable analysis XLSX for multiple properties
 */
router.post('/comp-analysis', async (req, res) => {
  try {
    const { parcelIds, dealRoomId, userId } = req.body;

    if (!parcelIds || !Array.isArray(parcelIds) || parcelIds.length === 0) {
      return res.status(400).json({ success: false, error: 'parcelIds array is required' });
    }

    // Fetch property data
    const properties = await fetchParcels(parcelIds);
    if (properties.length === 0) {
      return res.status(404).json({ success: false, error: 'No properties found' });
    }

    // Generate XLSX
    const result = await generateCompAnalysis(properties);

    // Store artifact record
    const artifact = await storeArtifactRecord({
      type: 'comp_analysis',
      filePath: result.filePath,
      format: result.format,
      fileSize: result.fileSize,
      parcelIds
    });

    // Attach to deal room if provided
    if (dealRoomId) {
      await pool.query(`
        INSERT INTO deal_room_artifacts (deal_room_id, artifact_id, added_by)
        VALUES ($1, $2, $3)
      `, [dealRoomId, artifact.artifact_id.toString(), userId || 'system']);
    }

    res.status(201).json({
      success: true,
      artifact: {
        artifact_id: artifact.artifact_id,
        artifact_type: artifact.artifact_type,
        file_format: artifact.file_format,
        file_size_bytes: artifact.file_size_bytes,
        file_path: artifact.file_path,
        created_at: artifact.created_at,
        property_count: properties.length
      }
    });

  } catch (error) {
    console.error('[POST /api/v2/artifacts/comp-analysis] Error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to generate comp analysis' });
  }
});

/**
 * GET /api/v2/artifacts/:artifactId/download
 * Download an artifact file
 */
router.get('/:artifactId/download', async (req, res) => {
  try {
    const { artifactId } = req.params;

    // Get artifact record
    const result = await pool.query(`
      SELECT * FROM artifacts WHERE artifact_id = $1
    `, [artifactId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Artifact not found' });
    }

    const artifact = result.rows[0];

    // Increment download count
    await pool.query(`
      UPDATE artifacts SET download_count = download_count + 1 WHERE artifact_id = $1
    `, [artifactId]);

    // Get file stream
    const stream = await getArtifactStream(artifact.file_path);

    // Set content type
    const contentTypes = {
      csv: 'text/csv',
      pdf: 'application/pdf',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    };

    const filename = `${artifact.artifact_type}_${artifactId}.${artifact.file_format}`;

    res.setHeader('Content-Type', contentTypes[artifact.file_format] || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    stream.pipe(res);

  } catch (error) {
    console.error('[GET /api/v2/artifacts/:artifactId/download] Error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to download artifact' });
  }
});

/**
 * GET /api/v2/artifacts/types
 * Get available artifact types
 */
router.get('/types', async (req, res) => {
  res.json({
    success: true,
    types: [
      { type: 'acquisition_report', format: 'pdf', description: 'Acquisition report PDF for a property' },
      { type: 'site_analysis', format: 'pdf', description: 'Site analysis PDF for a property' },
      { type: 'underwriting_model', format: 'xlsx', description: 'Excel underwriting model with pro forma' },
      { type: 'comp_analysis', format: 'xlsx', description: 'Comparable property analysis spreadsheet' },
      { type: 'csv_export', format: 'csv', description: 'CSV export of property data' }
    ]
  });
});

export default router;
