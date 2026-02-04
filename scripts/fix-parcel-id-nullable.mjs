#!/usr/bin/env node
/**
 * Make parcel_id nullable to allow new inserts
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function fix() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('Making parcel_id nullable...\n');
    
    // Make parcel_id nullable
    await client.query(`
      ALTER TABLE deal_rooms 
      ALTER COLUMN parcel_id DROP NOT NULL;
    `);
    
    console.log('✓ parcel_id is now nullable\n');
    
    // Also make property_data nullable (it's also NOT NULL but not in Prisma schema)
    await client.query(`
      ALTER TABLE deal_rooms 
      ALTER COLUMN property_data DROP NOT NULL;
    `);
    
    console.log('✓ property_data is now nullable\n');
    
    await client.query('COMMIT');
    console.log('✅ Fix completed!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

fix().catch(console.error);
