// Test script for acquisition report generation
// Usage: node scripts/test-acquisition-report.js [parcel_id]

import { PrismaClient } from '@prisma/client';
import { createArtifact } from '../src/services/artifacts/index.js';
import { createSession } from '../src/services/sessions/index.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

const prisma = new PrismaClient();

async function testAcquisitionReport(parcelId) {
  try {
    console.log(`\n[Test] Generating acquisition report for parcel: ${parcelId}\n`);

    // Get a sample parcel if none provided
    if (!parcelId) {
      console.log('[Test] No parcel ID provided, fetching sample parcel...');
      const sample = await prisma.$queryRawUnsafe(`
        SELECT parcel_id, situs_address, acres_calc, market_value
        FROM parcel_features_travis
        WHERE geom_centroid IS NOT NULL
          AND market_value > 0
          AND acres_calc > 0
        ORDER BY RANDOM()
        LIMIT 1
      `);
      
      if (sample.length === 0) {
        console.error('[Test] No parcels found in database');
        return;
      }
      
      parcelId = sample[0].parcel_id;
      console.log(`[Test] Using sample parcel: ${parcelId} - ${sample[0].situs_address}`);
    }

    // Create a test session
    console.log('[Test] Creating test session...');
    const session = await createSession();
    const sessionId = session.sessionId;
    console.log(`[Test] Created session: ${sessionId}`);

    // Generate the artifact
    console.log('[Test] Creating artifact...');
    const artifact = await createArtifact({
      type: 'acquisition_report',
      parcelIds: [parcelId],
      sessionId: sessionId,
      queryInput: { test: true, parcel_id: parcelId },
      options: {}
    });

    console.log('\n[Test] ✅ SUCCESS!');
    console.log(`[Test] Artifact ID: ${artifact.artifact_id}`);
    console.log(`[Test] File Format: ${artifact.file_format}`);
    console.log(`[Test] File Size: ${artifact.file_size_bytes} bytes`);
    console.log(`[Test] Download URL: /api/artifacts/${artifact.artifact_id}/download`);
    console.log(`[Test] Metadata:`, JSON.stringify(artifact.metadata, null, 2));

  } catch (error) {
    console.error('\n[Test] ❌ ERROR:', error.message);
    console.error('[Test] Stack:', error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Get parcel ID from command line args
const parcelId = process.argv[2];
testAcquisitionReport(parcelId);
