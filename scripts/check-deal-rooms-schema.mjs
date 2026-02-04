#!/usr/bin/env node
/**
 * Check deal_rooms table schema
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

async function checkSchema() {
  try {
    console.log('Querying deal_rooms table schema...\n');
    
    const result = await pool.query(`
      SELECT 
        column_name, 
        data_type, 
        is_nullable,
        column_default,
        character_maximum_length
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'deal_rooms'
      ORDER BY ordinal_position;
    `);
    
    console.log(`Found ${result.rows.length} columns:\n`);
    console.table(result.rows);
    
    // Check if ownerId exists
    const hasOwnerId = result.rows.some(r => r.column_name === 'ownerId' || r.column_name === 'owner_id');
    console.log(`\nHas ownerId column: ${hasOwnerId}`);
    
    if (!hasOwnerId) {
      console.log('\n⚠️  ownerId column is MISSING from database!');
      
      // Check for similar column names
      const ownerColumns = result.rows.filter(r => 
        r.column_name.toLowerCase().includes('owner')
      );
      if (ownerColumns.length > 0) {
        console.log('\nFound owner-related columns:');
        console.table(ownerColumns);
      }
    }
    
    await pool.end();
    return result.rows;
  } catch (error) {
    console.error('Error:', error.message);
    await pool.end();
    throw error;
  }
}

checkSchema().catch(console.error);
