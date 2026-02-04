#!/usr/bin/env node
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

async function check() {
  const result = await pool.query(`
    SELECT column_name, data_type, column_default
    FROM information_schema.columns 
    WHERE table_name = 'deal_rooms' 
      AND column_name = 'id';
  `);
  
  console.log('ID column info:');
  console.table(result.rows);
  
  // Check sample IDs
  const sampleResult = await pool.query('SELECT id FROM deal_rooms LIMIT 1');
  if (sampleResult.rows.length > 0) {
    console.log('\nSample ID:', sampleResult.rows[0].id);
    console.log('ID type:', typeof sampleResult.rows[0].id);
  }
  
  await pool.end();
}

check().catch(console.error);
