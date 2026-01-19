// src/services/artifacts/storage.js
// Storage utilities for artifact files (local filesystem or S3)

import fs from 'fs/promises';
import { createReadStream, existsSync } from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * Storage configuration
 * In production, this would use S3 or similar cloud storage
 */
const STORAGE_CONFIG = {
  type: process.env.ARTIFACT_STORAGE_TYPE || 'local',
  localPath: process.env.ARTIFACT_STORAGE_PATH || '/tmp/scoutgpt-artifacts',
  s3Bucket: process.env.ARTIFACT_S3_BUCKET || null
};

/**
 * Ensure local storage directory exists
 */
async function ensureStorageDir() {
  if (STORAGE_CONFIG.type === 'local') {
    await fs.mkdir(STORAGE_CONFIG.localPath, { recursive: true });
  }
}

/**
 * Generate a unique filename for an artifact
 */
function generateFilename(format, artifactType) {
  const timestamp = Date.now();
  const random = crypto.randomBytes(4).toString('hex');
  return `${artifactType}_${timestamp}_${random}.${format}`;
}

/**
 * Save artifact content to storage
 *
 * @param {string|Buffer} content - File content
 * @param {string} format - File format (csv, pdf, etc.)
 * @param {string} artifactType - Type of artifact
 * @returns {Promise<{ filePath: string, fileSize: number }>}
 */
export async function saveArtifactFile(content, format, artifactType) {
  await ensureStorageDir();

  const filename = generateFilename(format, artifactType);

  if (STORAGE_CONFIG.type === 'local') {
    const filePath = path.join(STORAGE_CONFIG.localPath, filename);

    // Write file
    await fs.writeFile(filePath, content, 'utf8');

    // Get file stats
    const stats = await fs.stat(filePath);

    console.log(`[storage] Saved artifact to: ${filePath} (${stats.size} bytes)`);

    return {
      filePath,
      fileSize: stats.size
    };
  }

  // Future: S3 storage
  if (STORAGE_CONFIG.type === 's3') {
    throw new Error('S3 storage not yet implemented');
  }

  throw new Error(`Unknown storage type: ${STORAGE_CONFIG.type}`);
}

/**
 * Get a read stream for an artifact file
 *
 * @param {string} filePath - Path to the file
 * @returns {Promise<ReadStream>}
 */
export async function getArtifactStream(filePath) {
  if (STORAGE_CONFIG.type === 'local') {
    // Check file exists
    if (!existsSync(filePath)) {
      throw new Error(`Artifact file not found: ${filePath}`);
    }

    return createReadStream(filePath);
  }

  // Future: S3 storage
  if (STORAGE_CONFIG.type === 's3') {
    throw new Error('S3 storage not yet implemented');
  }

  throw new Error(`Unknown storage type: ${STORAGE_CONFIG.type}`);
}

/**
 * Delete an artifact file from storage
 *
 * @param {string} filePath - Path to the file
 * @returns {Promise<boolean>}
 */
export async function deleteArtifactFile(filePath) {
  if (STORAGE_CONFIG.type === 'local') {
    try {
      await fs.unlink(filePath);
      console.log(`[storage] Deleted artifact: ${filePath}`);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, that's okay
        return true;
      }
      throw error;
    }
  }

  // Future: S3 storage
  if (STORAGE_CONFIG.type === 's3') {
    throw new Error('S3 storage not yet implemented');
  }

  throw new Error(`Unknown storage type: ${STORAGE_CONFIG.type}`);
}

/**
 * Get storage info
 */
export function getStorageInfo() {
  return {
    type: STORAGE_CONFIG.type,
    path: STORAGE_CONFIG.type === 'local' ? STORAGE_CONFIG.localPath : null,
    bucket: STORAGE_CONFIG.type === 's3' ? STORAGE_CONFIG.s3Bucket : null
  };
}

/**
 * Clean up old artifact files (for maintenance)
 *
 * @param {number} maxAgeHours - Delete files older than this
 */
export async function cleanupOldArtifacts(maxAgeHours = 24) {
  if (STORAGE_CONFIG.type !== 'local') {
    console.log('[storage] Cleanup only supported for local storage');
    return 0;
  }

  await ensureStorageDir();

  const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
  const now = Date.now();
  let deletedCount = 0;

  try {
    const files = await fs.readdir(STORAGE_CONFIG.localPath);

    for (const file of files) {
      const filePath = path.join(STORAGE_CONFIG.localPath, file);
      const stats = await fs.stat(filePath);

      if (now - stats.mtimeMs > maxAgeMs) {
        await fs.unlink(filePath);
        deletedCount++;
      }
    }

    console.log(`[storage] Cleaned up ${deletedCount} old artifact files`);
    return deletedCount;

  } catch (error) {
    console.error('[storage] Cleanup error:', error.message);
    return 0;
  }
}

export default {
  saveArtifactFile,
  getArtifactStream,
  deleteArtifactFile,
  getStorageInfo,
  cleanupOldArtifacts
};
