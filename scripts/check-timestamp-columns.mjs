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
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'deal_rooms' 
      AND (column_name LIKE '%at%' OR column_name LIKE '%At%')
    ORDER BY column_name;
  `);
  
  console.log('Timestamp columns in database:');
  result.rows.forEach(r => console.log(`  - ${r.column_name}`));
  
  await pool.end();
}

check().catch(console.error);
