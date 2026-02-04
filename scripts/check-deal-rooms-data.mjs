#!/usr/bin/env node
/**
 * Check deal_rooms table data
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

async function checkData() {
  try {
    const countResult = await pool.query('SELECT COUNT(*) as count FROM deal_rooms');
    const count = parseInt(countResult.rows[0].count);
    
    console.log(`Total rows in deal_rooms: ${count}\n`);
    
    if (count > 0) {
      const sampleResult = await pool.query('SELECT * FROM deal_rooms LIMIT 3');
      console.log('Sample rows:');
      console.log(JSON.stringify(sampleResult.rows, null, 2));
    }
    
    await pool.end();
    return count;
  } catch (error) {
    console.error('Error:', error.message);
    await pool.end();
    throw error;
  }
}

checkData().catch(console.error);
