#!/usr/bin/env node
/**
 * Check parcelId formats across all counties
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
dotenv.config({ path: join(rootDir, '.env') });

const prisma = new PrismaClient();

const COUNTIES = [
  { name: 'Travis', table: 'parcels_travis' },
  { name: 'Williamson', table: 'parcels_williamson' },
  { name: 'Bastrop', table: 'parcels_bastrop' },
  { name: 'Bell', table: 'parcels_bell' },
  { name: 'Hays', table: 'parcels_hays' },
  { name: 'Blanco', table: 'parcels_blanco' },
  { name: 'Comal', table: 'parcels_comal' },
  { name: 'Burnet', table: 'parcels_burnet' },
  { name: 'Caldwell', table: 'parcels_caldwell' },
  { name: 'Kendall', table: 'parcels_kendall' },
  { name: 'Lee', table: 'parcels_lee' },
  { name: 'Llano', table: 'parcels_llano' }
];

async function checkFormats() {
  console.log('\n📊 Checking parcelId formats across counties...\n');
  
  for (const county of COUNTIES) {
    try {
      const result = await prisma.$queryRawUnsafe(
        `SELECT parcel_id FROM ${county.table} ORDER BY RANDOM() LIMIT 3`
      );
      
      if (result && result.length > 0) {
        console.log(`${county.name}:`);
        result.forEach(row => {
          const parcelId = row.parcel_id;
          const format = /^\d+$/.test(parcelId) ? 'numeric' : 'alphanumeric';
          const length = parcelId ? parcelId.length : 0;
          console.log(`  - "${parcelId}" (${format}, ${length} chars)`);
        });
        console.log('');
      } else {
        console.log(`${county.name}: No parcels found\n`);
      }
    } catch (error) {
      console.log(`${county.name}: Error - ${error.message}\n`);
    }
  }
  
  await prisma.$disconnect();
}

checkFormats().catch(console.error);
