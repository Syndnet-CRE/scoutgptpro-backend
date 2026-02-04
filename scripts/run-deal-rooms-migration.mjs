#!/usr/bin/env node
/**
 * Run deal_rooms migration to add missing columns
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
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

async function runMigration() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('Starting deal_rooms migration...\n');
    
    // Read migration SQL
    const migrationPath = join(__dirname, '..', 'prisma', 'migrations', '20260128_add_deal_rooms_prisma_schema', 'migration.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf8');
    
    // Split by semicolons and execute each statement
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    console.log(`Executing ${statements.length} SQL statements...\n`);
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.trim()) {
        try {
          console.log(`[${i + 1}/${statements.length}] Executing statement...`);
          await client.query(statement);
          console.log('  ✓ Success\n');
        } catch (error) {
          // Some statements might fail if columns already exist (IF NOT EXISTS should handle this)
          if (error.message.includes('already exists') || error.message.includes('duplicate')) {
            console.log(`  ⚠ Skipped (already exists): ${error.message}\n`);
          } else {
            throw error;
          }
        }
      }
    }
    
    await client.query('COMMIT');
    console.log('\n✅ Migration completed successfully!');
    
    // Verify migration
    console.log('\nVerifying migration...');
    const result = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'deal_rooms' 
        AND column_name IN ('ownerId', 'title', 'propertyIds', 'primaryPropertyId')
      ORDER BY column_name;
    `);
    
    console.log('\nAdded columns:');
    result.rows.forEach(row => {
      console.log(`  ✓ ${row.column_name}`);
    });
    
    if (result.rows.length >= 4) {
      console.log('\n✅ All required columns added successfully!');
    } else {
      console.log('\n⚠️  Some columns may be missing. Check the migration output above.');
    }
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch(console.error);
