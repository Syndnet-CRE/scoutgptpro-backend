// src/routes/artifacts.js
// API routes for artifact management (exports, reports)

import express from 'express';
import {
  createArtifact,
  getArtifact,
  downloadArtifact,
  regenerateArtifact,
  listArtifacts,
  deleteArtifact,
  VALID_TYPES
} from '../services/artifacts/index.js';
import { getSession } from '../services/sessions/index.js';
import { sendError } from '../utils/apiResponse.js';

const router = express.Router();

/**
 * POST /api/artifacts
 * Create a new artifact (CSV export, report, etc.)
 */
router.post('/', async (req, res) => {
  try {
    const { type, sessionId, parcelIds, options = {} } = req.body;

    // Validate required fields
    if (!type) {
      return sendError(res, 'Artifact type is required', 400);
    }

    if (!VALID_TYPES.includes(type)) {
      return sendError(res, `Invalid artifact type. Valid types: ${VALID_TYPES.join(', ')}`, 400);
    }

    if (!sessionId) {
      return sendError(res, 'Session ID is required', 400);
    }

    if (!parcelIds || !Array.isArray(parcelIds) || parcelIds.length === 0) {
      return sendError(res, 'parcelIds array is required', 400);
    }

    // Get session to retrieve query context
    const session = await getSession(sessionId);
    if (!session) {
      return sendError(res, 'Session not found', 404);
    }

    // Build query input from session state
    const queryInput = {
      query: session.state?.activeResultSet?.query || 'Manual export',
      intentId: session.state?.activeResultSet?.intentId,
      exportedAt: new Date().toISOString(),
      parcelCount: parcelIds.length
    };

    // Create the artifact
    const artifact = await createArtifact({
      type,
      sessionId,
      queryInput,
      queryIntent: null,  // Could be fetched from query_intents table
      parcelIds,
      options
    });

    res.status(201).json({
      success: true,
      artifact
    });

  } catch (error) {
    console.error('[POST /api/artifacts] Error:', error.message);
    return sendError(res, 'Failed to create artifact', 500, error.message);
  }
});

/**
 * GET /api/artifacts/:artifactId
 * Get artifact metadata
 */
router.get('/:artifactId', async (req, res) => {
  try {
    const { artifactId } = req.params;

    const artifact = await getArtifact(artifactId);

    if (!artifact) {
      return sendError(res, 'Artifact not found', 404);
    }

    res.json({
      success: true,
      artifact: {
        artifact_id: artifact.artifact_id,
        artifact_type: artifact.artifact_type,
        file_format: artifact.file_format,
        file_size_bytes: artifact.file_size_bytes,
        result_count: artifact.result_parcel_ids?.length || 0,
        created_at: artifact.created_at,
        download_count: artifact.download_count,
        status: artifact.status,
        regenerated_from: artifact.regenerated_from,
        data_retrieval_timestamp: artifact.data_retrieval_timestamp
      }
    });

  } catch (error) {
    console.error('[GET /api/artifacts/:artifactId] Error:', error.message);
    return sendError(res, 'Failed to get artifact', 500, error.message);
  }
});

/**
 * GET /api/artifacts/:artifactId/download
 * Download artifact file
 */
router.get('/:artifactId/download', async (req, res) => {
  try {
    const { artifactId } = req.params;

    const download = await downloadArtifact(artifactId);

    if (!download) {
      return sendError(res, 'Artifact not found', 404);
    }

    // Set headers for file download
    const contentTypes = {
      csv: 'text/csv',
      pdf: 'application/pdf',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      json: 'application/json'
    };

    res.setHeader('Content-Type', contentTypes[download.format] || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${download.filename}"`);

    // Stream the file
    download.stream.pipe(res);

  } catch (error) {
    console.error('[GET /api/artifacts/:artifactId/download] Error:', error.message);
    return sendError(res, 'Failed to download artifact', 500, error.message);
  }
});

/**
 * POST /api/artifacts/:artifactId/regenerate
 * Regenerate an artifact with fresh data
 */
router.post('/:artifactId/regenerate', async (req, res) => {
  try {
    const { artifactId } = req.params;

    // Check original exists
    const original = await getArtifact(artifactId);
    if (!original) {
      return sendError(res, 'Original artifact not found', 404);
    }

    // Regenerate
    const newArtifact = await regenerateArtifact(artifactId);

    res.status(201).json({
      success: true,
      artifact: newArtifact,
      regeneratedFrom: artifactId
    });

  } catch (error) {
    console.error('[POST /api/artifacts/:artifactId/regenerate] Error:', error.message);
    return sendError(res, 'Failed to regenerate artifact', 500, error.message);
  }
});

/**
 * GET /api/artifacts/session/:sessionId
 * List artifacts for a session
 */
router.get('/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { type, limit = 20 } = req.query;

    const artifacts = await listArtifacts({
      sessionId,
      type,
      limit: parseInt(limit, 10)
    });

    res.json({
      success: true,
      count: artifacts.length,
      artifacts
    });

  } catch (error) {
    console.error('[GET /api/artifacts/session/:sessionId] Error:', error.message);
    return sendError(res, 'Failed to list artifacts', 500, error.message);
  }
});

/**
 * DELETE /api/artifacts/:artifactId
 * Delete an artifact
 */
router.delete('/:artifactId', async (req, res) => {
  try {
    const { artifactId } = req.params;

    const deleted = await deleteArtifact(artifactId);

    if (!deleted) {
      return sendError(res, 'Artifact not found', 404);
    }

    res.json({
      success: true,
      message: 'Artifact deleted'
    });

  } catch (error) {
    console.error('[DELETE /api/artifacts/:artifactId] Error:', error.message);
    return sendError(res, 'Failed to delete artifact', 500, error.message);
  }
});

/**
 * GET /api/artifacts/types
 * Get available artifact types
 */
router.get('/types', async (req, res) => {
  res.json({
    success: true,
    types: VALID_TYPES.map(type => ({
      type,
      available: type === 'csv_export',  // Only CSV is implemented for now
      description: getTypeDescription(type)
    }))
  });
});

/**
 * Get description for artifact type
 */
function getTypeDescription(type) {
  const descriptions = {
    csv_export: 'Export property data to CSV file',
    comp_report: 'Generate comparable sales analysis report (coming soon)',
    site_analysis: 'Generate site suitability analysis (coming soon)',
    feasibility: 'Generate development feasibility study (coming soon)',
    investment_report: 'Generate investment analysis report (coming soon)'
  };
  return descriptions[type] || 'Unknown type';
}

export default router;
